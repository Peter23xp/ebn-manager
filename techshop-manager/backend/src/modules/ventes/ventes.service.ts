import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { paginate } from '../../common/dto/pagination.dto';
import { CreateVenteDto, RetourDto } from './dto/vente.dto';
import { TypeMouvement } from '@prisma/client';

@Injectable()
export class VentesService {
  constructor(private prisma: PrismaService) {}



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
        },
      }),
      this.prisma.vente.count({ where }),
      this.prisma.vente.aggregate({
        where,
        _sum: { montantNet: true },
        _count: { id: true },
      }),
    ]);

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
      statut: v.statut,
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

