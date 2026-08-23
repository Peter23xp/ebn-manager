import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { paginate } from '../../common/dto/pagination.dto';
import { CreateVenteDto, InitKpayVenteDto, RetourDto } from './dto/vente.dto';
import { KpayOperationType, KpayTransactionStatus, TypeMouvement } from '@prisma/client';
import { randomUUID } from 'crypto';
import { KpayService } from '../kpay/kpay.service';
import { KpayWebhookService } from '../kpay/kpay-webhook.service';
import { KpayProvider } from '../kpay/kpay.types';

@Injectable()
export class VentesService implements OnModuleInit {
  constructor(
    private prisma: PrismaService,
    private readonly kpay: KpayService,
    private readonly kpayWebhooks: KpayWebhookService,
  ) {}

  onModuleInit() {
    this.kpayWebhooks.registerFinalizer(KpayOperationType.SALE_PAYMENT, async (transactionId, event) => {
      if (event.status !== 'COMPLETED') return;
      await this.finalizeKpayVente(transactionId);
    });
    this.kpayWebhooks.registerFinalizer(KpayOperationType.SALE_REFUND, async (transactionId, event) => {
      await this.finalizeKpayRefund(transactionId, event.status);
    });
  }

  private async finalizeKpayRefund(transactionId: string, status: KpayTransactionStatus) {
    const transaction = await this.prisma.kpayTransaction.findUnique({
      where: { id: transactionId },
      include: { retour: { include: { vente: { include: { lignes: true } } } } },
    });
    if (!transaction?.retour || transaction.retour.statut !== 'EN_ATTENTE_REMBOURSEMENT') return;
    await this.prisma.$transaction(async (tx) => {
      const retour = await tx.retour.findUnique({ where: { id: transaction.retour!.id }, include: { vente: true, lignes: true } });
      if (!retour || retour.statut !== 'EN_ATTENTE_REMBOURSEMENT') return;
      if (status === 'COMPLETED') {
        for (const ligne of retour.lignes) {
          const stock = await tx.stockSite.findUnique({ where: { produitId_siteId: { produitId: ligne.produitId, siteId: retour.vente.siteId } } });
          if (stock) {
            await tx.stockSite.update({ where: { produitId_siteId: { produitId: ligne.produitId, siteId: retour.vente.siteId } }, data: { quantite: { increment: ligne.quantite } } });
            await tx.mouvementStock.create({ data: { type: TypeMouvement.AJUSTEMENT_INVENTAIRE, quantite: ligne.quantite, quantiteAvant: stock.quantite, quantiteApres: stock.quantite + ligne.quantite, reference: retour.numeroAvoir, produitId: ligne.produitId, siteId: retour.vente.siteId, agentId: retour.agentId } });
          }
        }
        await tx.retour.update({ where: { id: retour.id }, data: { statut: 'COMPLETE', stockRemis: true } });
        await tx.vente.update({ where: { id: retour.venteId }, data: { statut: 'RETOURNEE' } });
      } else {
        await tx.retour.update({ where: { id: retour.id }, data: { statut: 'ECHEC_REMBOURSEMENT' } });
      }
    });
  }

  private async finalizeKpayVente(transactionId: string) {
    const transaction = await this.prisma.kpayTransaction.findUnique({
      where: { id: transactionId },
      include: { vente: { include: { lignes: true } } },
    });
    if (!transaction?.vente || transaction.vente.statut !== 'EN_ATTENTE_PAIEMENT') return;

    await this.prisma.$transaction(async (tx) => {
      const vente = await tx.vente.findUnique({
        where: { id: transaction.venteId! },
        include: { lignes: true },
      });
      if (!vente || vente.statut !== 'EN_ATTENTE_PAIEMENT') return;
      for (const ligne of vente.lignes) {
        const stock = await tx.stockSite.findUnique({
          where: { produitId_siteId: { produitId: ligne.produitId, siteId: vente.siteId } },
        });
        if (!stock || stock.quantite < ligne.quantite) {
          throw new ConflictException({ code: 'ERR_STOCK_INSUFFISANT', message: 'Stock insuffisant à la confirmation KPay' });
        }
        await tx.stockSite.update({
          where: { produitId_siteId: { produitId: ligne.produitId, siteId: vente.siteId } },
          data: { quantite: { decrement: ligne.quantite } },
        });
        await tx.mouvementStock.create({
          data: {
            type: TypeMouvement.SORTIE_VENTE,
            quantite: ligne.quantite,
            quantiteAvant: stock.quantite,
            quantiteApres: stock.quantite - ligne.quantite,
            reference: vente.numeroVente,
            produitId: ligne.produitId,
            siteId: vente.siteId,
            agentId: vente.agentId,
          },
        });
      }
      await tx.vente.update({ where: { id: vente.id }, data: { statut: 'VALIDE' } });
    });
    await this.initiateConfiguredAutoPayout(transactionId);
  }

  private async initiateConfiguredAutoPayout(sourceTransactionId: string) {
    const config = await this.prisma.configGenerale.findFirst();
    if (!config) return;
    const source = await this.prisma.kpayTransaction.findUnique({ where: { id: sourceTransactionId } });
    if (!source || source.status !== KpayTransactionStatus.COMPLETED) return;
    const provider = (source.provider ?? config.kpayAutoPayoutProvider) as KpayProvider | null;
    const phoneByProvider: Record<string, string | null | undefined> = {
      VODACOM_MPESA_COD: config.kpayAdminMpesaPhone,
      AIRTEL_COD: config.kpayAdminAirtelPhone,
      ORANGE_COD: config.kpayAdminOrangePhone,
    };
    const phoneNumber = (provider && phoneByProvider[provider]) || (provider === config.kpayAutoPayoutProvider ? config.kpayAutoPayoutPhone : null);
    if (!provider || !phoneNumber) return;
    const externalId = `AUTO-PAYOUT-${source.externalId}`;
    const existing = await this.prisma.kpayTransaction.findUnique({ where: { externalId }, select: { id: true } });
    if (existing) return;
    const payout = await this.prisma.kpayTransaction.create({ data: { operationType: KpayOperationType.AUTO_PAYOUT, status: KpayTransactionStatus.PENDING, amount: source.amount, currency: source.currency, externalId, provider, phoneNumber, metadata: { sourceTransactionId, venteId: source.venteId, purpose: 'ADMIN_AUTO_PAYOUT' } } });
    try {
      const remote = await this.kpay.initPayout({ amount: Number(source.amount), provider, phoneNumber, externalId, description: `Transfert automatique vente ${source.externalId}` });
      await this.prisma.kpayTransaction.update({ where: { id: payout.id }, data: { kpayPaymentId: remote.id, kpayReference: remote.reference, status: remote.status as KpayTransactionStatus } });
    } catch (error) {
      await this.prisma.kpayTransaction.update({ where: { id: payout.id }, data: { status: KpayTransactionStatus.FAILED, failureReason: error instanceof Error ? error.message : 'Payout automatique échoué' } });
    }
  }

  async initKpayVente(dto: InitKpayVenteDto, agentId: string) {
    await this.requireConfiguredAdminPhone(dto.provider);
    const site = await this.prisma.site.findUnique({ where: { id: dto.siteId }, select: { id: true } });
    if (!site) throw new NotFoundException({ code: 'ERR_NOT_FOUND', message: 'Site introuvable' });

    const produits = await this.prisma.produit.findMany({
      where: { id: { in: dto.lignes.map((ligne) => ligne.produitId) }, actif: true },
      select: { id: true, prixVente: true },
    });
    if (produits.length !== dto.lignes.length) {
      throw new NotFoundException({ code: 'ERR_NOT_FOUND', message: 'Produit introuvable ou inactif' });
    }
    const montantNet = dto.lignes.reduce((total, ligne) => {
      const produit = produits.find((item) => item.id === ligne.produitId)!;
      return total + Number(produit.prixVente) * ligne.quantite;
    }, 0);
    const externalId = `SALE-${randomUUID()}`;
    const numeroVente = await this.generateNumeroVente(dto.siteId);
    const pending = await this.prisma.$transaction(async (tx) => {
      const vente = await tx.vente.create({
        data: {
          numeroVente,
          statut: 'EN_ATTENTE_PAIEMENT',
          siteId: dto.siteId,
          agentId,
          clientId: dto.clientId,
          modePaiement: dto.modePaiement,
          montantBrut: montantNet,
          remiseFidelite: 0,
          montantNet,
          pointsAttribues: 0,
          lignes: { create: dto.lignes.map((ligne) => {
            const produit = produits.find((item) => item.id === ligne.produitId)!;
            return { produitId: ligne.produitId, quantite: ligne.quantite, prixUnitaire: Number(produit.prixVente), sousTotal: Number(produit.prixVente) * ligne.quantite };
          }) },
        },
      });
      return tx.kpayTransaction.create({
        data: {
          operationType: KpayOperationType.SALE_PAYMENT,
          status: KpayTransactionStatus.PENDING,
          amount: montantNet,
          currency: 'USD',
          externalId,
          provider: dto.provider,
          phoneNumber: dto.phoneNumber,
          venteId: vente.id,
          metadata: { numeroVente },
        },
      });
    });

    let payment;
    try {
      payment = await this.kpay.initDeposit({
        amount: montantNet,
        currency: 'USD',
        provider: dto.provider,
        phoneNumber: dto.phoneNumber,
        externalId,
        description: `Vente ${numeroVente}`,
        metadata: { venteId: pending.venteId, numeroVente },
      });
    } catch (error) {
      await this.prisma.$transaction([
        this.prisma.kpayTransaction.update({ where: { id: pending.id }, data: { status: KpayTransactionStatus.FAILED, failureReason: error instanceof Error ? error.message : 'KPay a refusé la requête' } }),
        this.prisma.vente.update({ where: { id: pending.venteId! }, data: { statut: 'ANNULEE' } }),
      ]);
      throw error;
    }
    await this.prisma.kpayTransaction.update({
      where: { id: pending.id },
      data: { kpayPaymentId: payment.id, kpayReference: payment.reference, status: payment.status as KpayTransactionStatus },
    });
    return { transactionId: pending.id, status: payment.status, reference: payment.reference };
  }

  private async requireConfiguredAdminPhone(provider: string): Promise<string> {
    const config = await this.prisma.configGenerale.findFirst();
    if (!config) throw new BadRequestException('Configurez les numéros administrateur KPay dans Paramètres > Opérations avant un paiement Mobile Money.');
    const destinations: Record<string, { label: string; phone?: string | null }> = {
      VODACOM_MPESA_COD: { label: 'M-Pesa', phone: config.kpayAdminMpesaPhone },
      AIRTEL_COD: { label: 'Airtel Money', phone: config.kpayAdminAirtelPhone },
      ORANGE_COD: { label: 'Orange Money', phone: config.kpayAdminOrangePhone },
    };
    const destination = destinations[provider];
    if (!destination?.phone) {
      throw new BadRequestException(`Le numéro administrateur ${destination?.label ?? provider} n'est pas configuré dans Paramètres > Opérations.`);
    }
    return destination.phone;
  }

  async getKpayVenteStatus(transactionId: string) {
    const transaction = await this.prisma.kpayTransaction.findFirst({
      where: { id: transactionId, operationType: KpayOperationType.SALE_PAYMENT },
      select: {
        id: true,
        status: true,
        kpayReference: true,
        failureReason: true,
        completedAt: true,
        kpayPaymentId: true,
        amount: true,
        vente: { select: { id: true, numeroVente: true, statut: true } },
      },
    });
    if (!transaction) throw new NotFoundException({ code: 'ERR_NOT_FOUND', message: 'Transaction KPay introuvable' });
    if (transaction.kpayPaymentId && ['PENDING', 'PROCESSING'].includes(transaction.status)) {
      const remote = await this.kpay.getDeposit(transaction.kpayPaymentId);
      const status = remote.status as KpayTransactionStatus;
      await this.prisma.kpayTransaction.update({ where: { id: transaction.id }, data: { status, kpayReference: remote.reference, failureReason: remote.failureReason ?? null, completedAt: status === KpayTransactionStatus.COMPLETED ? new Date() : null } });
      if (status === KpayTransactionStatus.COMPLETED) await this.finalizeKpayVente(transaction.id);
      if (status === KpayTransactionStatus.FAILED || status === KpayTransactionStatus.CANCELLED) {
        await this.prisma.vente.updateMany({ where: { id: transaction.vente?.id, statut: 'EN_ATTENTE_PAIEMENT' }, data: { statut: 'ANNULEE' } });
      }
      return { ...transaction, status, kpayReference: remote.reference, failureReason: remote.failureReason ?? null, completedAt: status === KpayTransactionStatus.COMPLETED ? new Date() : null, vente: transaction.vente ? { ...transaction.vente, statut: status === KpayTransactionStatus.COMPLETED ? 'VALIDE' : transaction.vente.statut } : transaction.vente };
    }
    return transaction;
  }



  async createVente(dto: CreateVenteDto, agentId: string) {
    // Vérifier que le site existe
    const site = await this.prisma.site.findUnique({
      where: { id: dto.siteId },
      select: { id: true, nom: true },
    });
    if (!site) {
      throw new NotFoundException({ code: 'ERR_NOT_FOUND', message: 'Site introuvable' });
    }

    // Récupérer le client si fourni
    let client: any = null;
    if (dto.clientId) {
      client = await this.prisma.client.findUnique({
        where: { id: dto.clientId },
        select: { id: true, statut: true },
      });
      if (!client) {
        throw new NotFoundException({ code: 'ERR_NOT_FOUND', message: 'Client introuvable' });
      }
    }

    // Récupérer les produits et vérifier le stock
    const produitIds = dto.lignes.map((l) => l.produitId);
    const produits = await this.prisma.produit.findMany({
      where: { id: { in: produitIds }, actif: true },
    });

    if (produits.length !== produitIds.length) {
      throw new NotFoundException({
        code: 'ERR_NOT_FOUND',
        message: 'Un ou plusieurs produits introuvables ou inactifs',
      });
    }

    // Vérifier les stocks disponibles
    const stockSites = await this.prisma.stockSite.findMany({
      where: {
        siteId: dto.siteId,
        produitId: { in: produitIds },
      },
    });

    const stockMap = new Map(stockSites.map((s) => [s.produitId, s]));

    for (const ligne of dto.lignes) {
      const stock = stockMap.get(ligne.produitId);
      if (!stock || stock.quantite < ligne.quantite) {
        const produit = produits.find((p) => p.id === ligne.produitId);
        throw new ConflictException({
          code: 'ERR_STOCK_INSUFFISANT',
          message: `Stock insuffisant pour ${produit?.nom ?? ligne.produitId}. Disponible: ${stock?.quantite ?? 0}`,
        });
      }
    }

    // Calculer les montants
    const produitMap = new Map(produits.map((p) => [p.id, p]));
    let montantBrut = 0;

    const lignesData = dto.lignes.map((ligne) => {
      const produit = produitMap.get(ligne.produitId)!;
      const prixUnitaire = Number(produit.prixVente);
      const sousTotal = prixUnitaire * ligne.quantite;
      montantBrut += sousTotal;
      return {
        produitId: ligne.produitId,
        quantite: ligne.quantite,
        prixUnitaire,
        sousTotal,
      };
    });

    // Calculer la remise fidélité
    let remiseFidelite = 0;
    const montantNet = montantBrut - remiseFidelite;

    // Calculer monnaie rendue
    let monnaieRendue: number | null = null;
    if (dto.montantRecu !== undefined && dto.montantRecu !== null) {
      monnaieRendue = dto.montantRecu - montantNet;
      if (monnaieRendue < 0) {
        throw new BadRequestException({
          code: 'ERR_BAD_REQUEST',
          message: 'Montant reçu insuffisant',
        });
      }
    }

    // 1 point par ratioPts $ dépensé (ex: $10 = 1 pt)
    const pointsAttribues = 0;

    // Générer le numéro de vente
    const numeroVente = await this.generateNumeroVente(dto.siteId);

    const vente = await this.prisma.$transaction(async (tx) => {
      // Créer la vente
      const newVente = await tx.vente.create({
        data: {
          numeroVente,
          siteId: dto.siteId,
          agentId,
          clientId: dto.clientId,
          modePaiement: dto.modePaiement,
          montantBrut,
          remiseFidelite,
          montantNet,
          montantRecu: dto.montantRecu,
          monnaieRendue,
          pointsAttribues,
          lignes: {
            create: lignesData,
          },
        },
        include: {
          lignes: { include: { produit: true } },
          client: { select: { id: true, prenom: true, nom: true } },
          site: { select: { id: true, nom: true } },
        },
      });

      // Décrémenter le stock et créer les mouvements
      for (const ligne of lignesData) {
        const stock = stockMap.get(ligne.produitId)!;
        const quantiteAvant = stock.quantite;
        const quantiteApres = quantiteAvant - ligne.quantite;

        await tx.stockSite.update({
          where: { produitId_siteId: { produitId: ligne.produitId, siteId: dto.siteId } },
          data: { quantite: quantiteApres },
        });

        await tx.mouvementStock.create({
          data: {
            type: TypeMouvement.SORTIE_VENTE,
            quantite: ligne.quantite,
            quantiteAvant,
            quantiteApres,
            reference: numeroVente,
            produitId: ligne.produitId,
            siteId: dto.siteId,
            agentId,
          },
        });
      }



      return newVente;
    });

    return {
      vente: {
        id: vente.id,
        numeroVente: vente.numeroVente,
        montantBrut: Number(vente.montantBrut),
        remiseFidelite: Number(vente.remiseFidelite),
        montantNet: Number(vente.montantNet),
        montantRecu: vente.montantRecu ? Number(vente.montantRecu) : null,
        monnaieRendue: vente.monnaieRendue ? Number(vente.monnaieRendue) : null,
        pointsAttribues: vente.pointsAttribues,
        createdAt: vente.createdAt,
      },
    };
  }

  private async generateNumeroVente(siteId: string): Promise<string> {
    const site = await this.prisma.site.findUnique({
      where: { id: siteId },
      select: { nom: true },
    });

    const siteCode = (site?.nom ?? 'SITE').substring(0, 3).toUpperCase();
    const now = new Date();
    const annee = now.getFullYear().toString();
    const mois = String(now.getMonth() + 1).padStart(2, '0');
    const prefix = `${siteCode}-${annee}${mois}-`;

    const lastVente = await this.prisma.vente.findFirst({
      where: { numeroVente: { startsWith: prefix } },
      orderBy: { createdAt: 'desc' },
      select: { numeroVente: true },
    });

    let seq = 1;
    if (lastVente?.numeroVente) {
      const parts = lastVente.numeroVente.split('-');
      const lastSeq = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastSeq)) seq = lastSeq + 1;
    }

    return `${prefix}${String(seq).padStart(4, '0')}`;
  }



  async findAll(query: {
    siteId?: string;
    dateDebut?: string;
    dateFin?: string;
    modePaiement?: string;
    page?: number;
    limit?: number;
  }) {
    const { siteId, dateDebut, dateFin, modePaiement, page = 1, limit = 50 } = query;

    const where: any = {};
    if (siteId) where.siteId = siteId;
    if (modePaiement) where.modePaiement = modePaiement;
    if (dateDebut || dateFin) {
      where.createdAt = {};
      if (dateDebut) where.createdAt.gte = new Date(dateDebut);
      if (dateFin) where.createdAt.lte = new Date(dateFin);
    }

    const [data, total, kpisAgg] = await Promise.all([
      this.prisma.vente.findMany({
        where,
        ...paginate(page, limit),
        orderBy: { createdAt: 'desc' },
        include: {
          client: { select: { id: true, prenom: true, nom: true } },
          agent: { select: { id: true, nom: true } },
          site: { select: { id: true, nom: true } },
          lignes: {
            include: {
              produit: { select: { id: true, nom: true, sku: true } },
            },
          },
          kpayTransactions: { where: { operationType: KpayOperationType.SALE_PAYMENT }, select: { id: true, venteId: true, status: true, kpayPaymentId: true } },
        },
      }),
      this.prisma.vente.count({ where }),
      this.prisma.vente.aggregate({
        where,
        _sum: { montantNet: true },
        _count: { id: true },
      }),
    ]);

    const pendingPayments = data.flatMap((vente) => vente.kpayTransactions.filter((transaction) => transaction.kpayPaymentId && ['PENDING', 'PROCESSING'].includes(transaction.status)));
    const reconciledStatuses = new Map<string, string>();
    if (pendingPayments.length > 0) {
      const results = await Promise.all(pendingPayments.map((transaction) => this.syncPendingSalePayment(transaction)));
      for (const result of results) if (result) reconciledStatuses.set(result.venteId, result.saleStatus);
    }

    const totalCA = Number(kpisAgg._sum.montantNet ?? 0);
    const nbVentes = kpisAgg._count.id;
    const panierMoyen = nbVentes > 0 ? totalCA / nbVentes : 0;

    const ventes = data.map((v) => ({
      id: v.id,
      numeroVente: v.numeroVente,
      createdAt: v.createdAt,
      agent: v.agent,
      client: v.client,
      montantNet: Number(v.montantNet),
      modePaiement: v.modePaiement,
      statut: (reconciledStatuses.get(v.id) ?? v.statut) as typeof v.statut,
    }));

    return {
      ventes,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      kpis: { totalCA, nbVentes, panierMoyen },
    };
  }

  async findOne(id: string) {
    const vente = await this.prisma.vente.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, prenom: true, nom: true, telephone: true } },
        agent: { select: { id: true, nom: true } },
        site: { select: { id: true, nom: true, adresse: true } },
        lignes: {
          include: {
            produit: { select: { id: true, nom: true, sku: true, categorie: true } },
          },
        },
        retours: {
          include: { lignes: { include: { produit: true } } },
        },
      },
    });

    if (!vente) {
      throw new NotFoundException({ code: 'ERR_NOT_FOUND', message: 'Vente introuvable' });
    }

    // Compute quantiteRetournee per ligne from all retours
    const dejaRetournees = new Map<string, number>();
    for (const retour of vente.retours) {
      for (const lr of retour.lignes) {
        dejaRetournees.set(lr.produitId, (dejaRetournees.get(lr.produitId) ?? 0) + lr.quantite);
      }
    }

    return {
      ...vente,
      lignes: (vente.lignes as any[]).map((l) => {
        const quantiteRetournee = dejaRetournees.get(l.produitId) ?? 0;
        return {
          ...l,
          quantiteRetournee,
          retournee: quantiteRetournee >= l.quantite,
        };
      }),
    };
  }

  async getReceipt(id: string) {
    const vente = await this.findOne(id);

    return {
      receipt: {
        numeroVente: vente.numeroVente,
        date: vente.createdAt,
        site: vente.site,
        agent: vente.agent,
        client: vente.client,
        lignes: (vente as any).lignes.map((l: any) => ({
          produit: l.produit.nom,
          sku: l.produit.sku,
          quantite: l.quantite,
          prixUnitaire: l.prixUnitaire,
          sousTotal: l.sousTotal,
        })),
        montantBrut: vente.montantBrut,
        remiseFidelite: vente.remiseFidelite,
        remiseParrainage: vente.remiseParrainage,
        montantNet: vente.montantNet,
        modePaiement: vente.modePaiement,
        montantRecu: vente.montantRecu,
        monnaieRendue: vente.monnaieRendue,
        pointsAttribues: vente.pointsAttribues,
        statut: vente.statut,
      },
    };
  }

  async sendSmsRecu(id: string, telephone: string) {
    const vente = await this.findOne(id);

    // Récupérer la config SMS
    const config = await this.prisma.configGenerale.findFirst();

    if (!config?.smsApiKey) {
      return {
        success: false,
        message: 'Service SMS non configuré',
      };
    }

    // Simulation d'envoi SMS (intégration réelle selon provider)
    const message =
      `EBN Network: Reçu vente ${vente.numeroVente}. ` +
      `Montant: ${Number(vente.montantNet).toLocaleString('fr-FR')} CDF. Merci!`;

    // TODO: Implémenter l'appel API SMS réel selon smsApiKey/smsUsername
    console.log(`[SMS] To: ${telephone} | ${message}`);

    return {
      success: true,
      message: 'SMS envoyé avec succès',
      telephone,
      preview: message,
    };
  }

  private async generateNumeroAvoir(siteId: string): Promise<string> {
    const site = await this.prisma.site.findUnique({
      where: { id: siteId },
      select: { nom: true },
    });
    const siteCode = (site?.nom ?? 'SITE').substring(0, 3).toUpperCase();
    const now = new Date();
    const annee = now.getFullYear().toString();
    const mois = String(now.getMonth() + 1).padStart(2, '0');
    const prefix = `AV-${siteCode}-${annee}${mois}-`;

    const lastAvoir = await this.prisma.retour.findFirst({
      where: { numeroAvoir: { startsWith: prefix } },
      orderBy: { createdAt: 'desc' },
      select: { numeroAvoir: true },
    });

    let seq = 1;
    if (lastAvoir?.numeroAvoir) {
      const parts = lastAvoir.numeroAvoir.split('-');
      const lastSeq = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastSeq)) seq = lastSeq + 1;
    }
    return `${prefix}${String(seq).padStart(4, '0')}`;
  }

  async createRetour(venteId: string, dto: RetourDto, agentId: string) {
    const vente = await this.prisma.vente.findUnique({
      where: { id: venteId },
      include: {
        lignes: { include: { produit: { select: { id: true, nom: true, sku: true } } } },
        retours: { include: { lignes: true } },
        client: { select: { id: true, prenom: true, nom: true, telephone: true } },
        site: { select: { id: true, nom: true } },
        agent: { select: { id: true, nom: true } },
      },
    });

    if (!vente) {
      throw new NotFoundException({ code: 'ERR_NOT_FOUND', message: 'Vente introuvable' });
    }

    if (vente.statut === 'ANNULEE') {
      throw new ConflictException({
        code: 'ERR_CONFLICT',
        message: 'Impossible de retourner une vente annulée',
      });
    }

    const config = await this.prisma.configGenerale.findFirst();
    const delaiRetourJours = config?.delaiRetourJours ?? 7;
    const joursDepuisVente = Math.floor(
      (Date.now() - vente.createdAt.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (joursDepuisVente > delaiRetourJours) {
      throw new BadRequestException({
        code: 'ERR_BAD_REQUEST',
        message: `Le délai de retour de ${delaiRetourJours} jours est dépassé`,
      });
    }

    const quantitesVendues = new Map(vente.lignes.map((l) => [l.produitId, l.quantite]));
    const quantitesDejaRetournees = new Map<string, number>();
    for (const retour of vente.retours) {
      for (const ligne of retour.lignes) {
        const current = quantitesDejaRetournees.get(ligne.produitId) ?? 0;
        quantitesDejaRetournees.set(ligne.produitId, current + ligne.quantite);
      }
    }

    for (const ligne of dto.lignes) {
      const vendu = quantitesVendues.get(ligne.produitId) ?? 0;
      const dejaRetourne = quantitesDejaRetournees.get(ligne.produitId) ?? 0;
      const retournable = vendu - dejaRetourne;
      if (ligne.quantite > retournable) {
        throw new BadRequestException({
          code: 'ERR_BAD_REQUEST',
          message: `Quantité retournable insuffisante. Max: ${retournable}`,
        });
      }
    }

    const lignesVenteMap = new Map(vente.lignes.map((l) => [l.produitId, l]));
    let montantBrutRetour = 0;
    for (const ligne of dto.lignes) {
      const ligneVente = lignesVenteMap.get(ligne.produitId);
      if (ligneVente) montantBrutRetour += Number(ligneVente.prixUnitaire) * ligne.quantite;
    }

    const fraisRetourPct = Number(config?.fraisRetourPct ?? 0);
    const montantRembourse = montantBrutRetour * (1 - fraisRetourPct / 100);

    const numeroAvoir = await this.generateNumeroAvoir(vente.siteId);

    const retour = await this.prisma.$transaction(async (tx) => {
      const newRetour = await tx.retour.create({
        data: {
          venteId,
          numeroAvoir,
          motif: dto.motif,
          motifDescription: dto.motifDescription,
          modeRemboursement: dto.modeRemboursement,
          referenceTransaction: dto.referenceTransaction,
          montantRembourse,
          stockRemis: true,
          agentId,
          lignes: {
            create: dto.lignes.map((l) => ({ produitId: l.produitId, quantite: l.quantite })),
          },
        },
        include: {
          lignes: { include: { produit: { select: { id: true, nom: true, sku: true } } } },
        },
      });

      for (const ligne of dto.lignes) {
        const stock = await tx.stockSite.findUnique({
          where: { produitId_siteId: { produitId: ligne.produitId, siteId: vente.siteId } },
        });
        if (stock) {
          await tx.stockSite.update({
            where: { produitId_siteId: { produitId: ligne.produitId, siteId: vente.siteId } },
            data: { quantite: { increment: ligne.quantite } },
          });
          await tx.mouvementStock.create({
            data: {
              type: TypeMouvement.AJUSTEMENT_INVENTAIRE,
              quantite: ligne.quantite,
              quantiteAvant: stock.quantite,
              quantiteApres: stock.quantite + ligne.quantite,
              reference: numeroAvoir,
              produitId: ligne.produitId,
              siteId: vente.siteId,
              agentId,
            },
          });
        }
      }

      const totalRetourne = dto.lignes.reduce((a, l) => a + l.quantite, 0);
      const totalVendu = vente.lignes.reduce((a, l) => a + l.quantite, 0);
      const totalDejaRetourne = Array.from(quantitesDejaRetournees.values()).reduce((a, v) => a + v, 0);
      const statut = totalDejaRetourne + totalRetourne >= totalVendu ? 'RETOURNEE' : 'RETOURNEE_PARTIELLE';
      await tx.vente.update({ where: { id: venteId }, data: { statut } });

      return newRetour;
    });

    return {
      retour: {
        id: retour.id,
        numeroAvoir: retour.numeroAvoir,
        motif: retour.motif,
        modeRemboursement: retour.modeRemboursement,
        montantRembourse: Number(retour.montantRembourse),
        stockRemis: retour.stockRemis,
        createdAt: retour.createdAt,
        lignes: retour.lignes.map((l) => ({
          produit: l.produit,
          quantite: l.quantite,
        })),
      },
      vente: {
        id: vente.id,
        numeroVente: vente.numeroVente,
        montantNet: Number(vente.montantNet),
        client: vente.client,
        site: vente.site,
        agent: vente.agent,
        createdAt: vente.createdAt,
      },
    };
  }

  private async syncPendingSalePayment(transaction: { id: string; venteId: string | null; status: KpayTransactionStatus; kpayPaymentId: string | null }) {
    if (!transaction.kpayPaymentId || !transaction.venteId || !['PENDING', 'PROCESSING'].includes(transaction.status)) return null;
    try {
      const remote = await this.kpay.getDeposit(transaction.kpayPaymentId);
      const status = remote.status as KpayTransactionStatus;
      await this.prisma.kpayTransaction.update({
        where: { id: transaction.id },
        data: { status, kpayReference: remote.reference, failureReason: remote.failureReason ?? null, completedAt: remote.completedAt ? new Date(remote.completedAt) : null },
      });
      if (status === KpayTransactionStatus.COMPLETED) {
        await this.finalizeKpayVente(transaction.id);
        return { venteId: transaction.venteId, saleStatus: 'VALIDE' as const };
      }
      if (status === KpayTransactionStatus.FAILED || status === KpayTransactionStatus.CANCELLED) {
        await this.prisma.vente.updateMany({ where: { id: transaction.venteId, statut: 'EN_ATTENTE_PAIEMENT' }, data: { statut: 'ANNULEE' } });
        return { venteId: transaction.venteId, saleStatus: 'ANNULEE' as const };
      }
    } catch {
      // KPay peut être temporairement indisponible; la vente reste en attente.
    }
    return null;
  }

  async initKpayRefund(venteId: string, dto: RetourDto, agentId: string) {
    const vente = await this.prisma.vente.findUnique({
      where: { id: venteId },
      include: { lignes: true, retours: { include: { lignes: true } }, kpayTransactions: true },
    });
    if (!vente) throw new NotFoundException({ code: 'ERR_NOT_FOUND', message: 'Vente introuvable' });
    const payment = vente.kpayTransactions.find((t) => t.operationType === KpayOperationType.SALE_PAYMENT && t.status === KpayTransactionStatus.COMPLETED && t.kpayPaymentId);
    if (!payment?.kpayPaymentId) throw new BadRequestException('Cette vente ne possède pas de paiement KPay complété');
    if (vente.kpayTransactions.some((t) => t.operationType === KpayOperationType.SALE_REFUND && ['PENDING', 'PROCESSING', 'COMPLETED'].includes(t.status))) {
      throw new ConflictException('Un remboursement KPay existe déjà pour cette vente');
    }
    const expected = new Map(vente.lignes.map((l) => [l.produitId, l.quantite]));
    const requested = new Map(dto.lignes.map((l) => [l.produitId, l.quantite]));
    if (expected.size !== requested.size || [...expected].some(([id, qty]) => requested.get(id) !== qty)) {
      throw new BadRequestException('KPay ne supporte que le remboursement intégral de la vente');
    }
    const numeroAvoir = await this.generateNumeroAvoir(vente.siteId);
    const externalId = `REFUND-${randomUUID()}`;
    const pending = await this.prisma.$transaction(async (tx) => {
      const retour = await tx.retour.create({ data: { venteId, numeroAvoir, motif: dto.motif, motifDescription: dto.motifDescription, modeRemboursement: 'KPAY', montantRembourse: vente.montantNet, stockRemis: false, statut: 'EN_ATTENTE_REMBOURSEMENT', agentId, lignes: { create: dto.lignes } } });
      await tx.kpayTransaction.create({ data: { operationType: KpayOperationType.SALE_REFUND, status: KpayTransactionStatus.PENDING, amount: vente.montantNet, currency: 'USD', externalId, retourId: retour.id, metadata: { venteId, retourId: retour.id, originalPaymentId: payment.kpayPaymentId } } });
      return { retour, externalId };
    });
    const refund = await this.kpay.refundDeposit(payment.kpayPaymentId, { reason: dto.motif, externalId });
    await this.prisma.kpayTransaction.update({ where: { externalId }, data: { status: (refund.status ?? 'PENDING') as KpayTransactionStatus, kpayReference: refund.id ?? undefined } });
    return { retourId: pending.retour.id, transactionId: (await this.prisma.kpayTransaction.findUnique({ where: { externalId }, select: { id: true } }))?.id, status: refund.status };
  }

  async getAvoir(retourId: string) {
    const retour = await this.prisma.retour.findUnique({
      where: { id: retourId },
      include: {
        lignes: { include: { produit: { select: { id: true, nom: true, sku: true, categorie: true } } } },
        vente: {
          include: {
            lignes: { select: { produitId: true, prixUnitaire: true } },
            client: { select: { id: true, prenom: true, nom: true, telephone: true } },
            site: { select: { id: true, nom: true, adresse: true, ville: true } },
            agent: { select: { id: true, nom: true } },
          },
        },
      },
    });
    if (!retour) throw new NotFoundException({ code: 'ERR_NOT_FOUND', message: 'Avoir introuvable' });

    const lignesAvoir = retour.lignes.map((l) => {
      const ligneVente = retour.vente.lignes.find((lv) => lv.produitId === l.produitId);
      const prixUnitaire = ligneVente ? Number(ligneVente.prixUnitaire) : 0;
      return {
        produit: l.produit,
        quantite: l.quantite,
        prixUnitaire,
        sousTotal: prixUnitaire * l.quantite,
      };
    });

    const tauxTVA = 0.16;
    const montantHT = Number(retour.montantRembourse) / (1 + tauxTVA);
    const montantTVA = Number(retour.montantRembourse) - montantHT;

    return {
      avoir: {
        id: retour.id,
        numeroAvoir: retour.numeroAvoir,
        dateEmission: retour.createdAt,
        motif: retour.motif,
        motifDescription: retour.motifDescription,
        modeRemboursement: retour.modeRemboursement,
        referenceTransaction: retour.referenceTransaction,
        montantRembourse: Number(retour.montantRembourse),
        montantHT: Math.round(montantHT),
        montantTVA: Math.round(montantTVA),
        tauxTVA: 16,
        lignes: lignesAvoir,
        vente: {
          numeroVente: retour.vente.numeroVente,
          dateVente: retour.vente.createdAt,
          client: retour.vente.client,
          site: retour.vente.site,
          agent: retour.vente.agent,
        },
      },
    };
  }

  async getJournalRetours(query: {
    siteId?: string;
    dateDebut?: string;
    dateFin?: string;
    page?: number;
    limit?: number;
  }) {
    const { siteId, dateDebut, dateFin, page = 1, limit = 50 } = query;

    const where: any = {};
    if (siteId) where.vente = { siteId };
    if (dateDebut || dateFin) {
      where.createdAt = {};
      if (dateDebut) where.createdAt.gte = new Date(dateDebut);
      if (dateFin) {
        const end = new Date(dateFin);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    const [retours, total, agg] = await Promise.all([
      this.prisma.retour.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          lignes: { include: { produit: { select: { id: true, nom: true, sku: true } } } },
          vente: {
            select: {
              id: true,
              numeroVente: true,
              siteId: true,
              site: { select: { id: true, nom: true } },
              client: { select: { id: true, prenom: true, nom: true, telephone: true } },
              agent: { select: { id: true, nom: true } },
            },
          },
        },
      }),
      this.prisma.retour.count({ where }),
      this.prisma.retour.aggregate({ where, _sum: { montantRembourse: true }, _count: { id: true } }),
    ]);

    const kpis = {
      totalRembourse: Number(agg._sum.montantRembourse ?? 0),
      nbRetours: agg._count.id,
    };

    return {
      retours: retours.map((r) => ({
        id: r.id,
        numeroAvoir: r.numeroAvoir,
        motif: r.motif,
        modeRemboursement: r.modeRemboursement,
        montantRembourse: Number(r.montantRembourse),
        createdAt: r.createdAt,
        vente: r.vente,
        lignes: r.lignes.map((l) => ({ produit: l.produit, quantite: l.quantite })),
      })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      kpis,
    };
  }

  async getEcrituresOhada(retourId: string) {
    const retour = await this.prisma.retour.findUnique({
      where: { id: retourId },
      include: {
        lignes: { include: { produit: { select: { id: true, nom: true } } } },
        vente: {
          include: {
            client: { select: { id: true, prenom: true, nom: true } },
            site: { select: { id: true, nom: true } },
          },
        },
      },
    });
    if (!retour) throw new NotFoundException({ code: 'ERR_NOT_FOUND', message: 'Avoir introuvable' });

    const montant = Number(retour.montantRembourse);
    const tauxTVA = 0.16;
    const montantHT = montant / (1 + tauxTVA);
    const montantTVA = montant - montantHT;
    const client = retour.vente.client;
    const clientLabel = client ? `${client.prenom} ${client.nom}` : 'Client anonyme';

    const ecritures = [
      {
        compte: '701',
        libelle: 'Ventes de marchandises',
        intitule: `Avoir commercial ${retour.numeroAvoir} — ${retour.motif}`,
        debit: Math.round(montantHT),
        credit: 0,
      },
      {
        compte: '4431',
        libelle: 'TVA collectée',
        intitule: `TVA sur avoir ${retour.numeroAvoir}`,
        debit: Math.round(montantTVA),
        credit: 0,
      },
      {
        compte: '411',
        libelle: `Clients — ${clientLabel}`,
        intitule: `Remboursement avoir ${retour.numeroAvoir} — ${retour.modeRemboursement}`,
        debit: 0,
        credit: montant,
      },
    ];

    return {
      numeroAvoir: retour.numeroAvoir,
      dateEcriture: retour.createdAt,
      journalCode: 'RET',
      journalLabel: 'Journal des Retours',
      vente: { numeroVente: retour.vente.numeroVente },
      site: retour.vente.site,
      ecritures,
      totaux: {
        totalDebit: Math.round(montantHT + montantTVA),
        totalCredit: montant,
        montantHT: Math.round(montantHT),
        montantTVA: Math.round(montantTVA),
        montantTTC: montant,
      },
    };
  }
}

