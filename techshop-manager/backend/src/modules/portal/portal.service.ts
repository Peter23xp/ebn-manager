import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { paginate } from '../../common/dto/pagination.dto';
import { MlmWalletService } from '../mlm/mlm-wallet.service';
import { MlmMatrixService } from '../mlm/mlm-matrix.service';
import { KpayProvider } from '../kpay/kpay.types';
import { CreateWithdrawalRequestDto } from './dto/withdrawal.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class PortalService {
  constructor(
    private prisma: PrismaService,
    private readonly mlmWallet: MlmWalletService,
    private readonly mlmMatrix: MlmMatrixService,
  ) {}

  /**
   * Assure que le membre MLM et son portefeuille existent pour ce client.
   * Auto-rattrape si nécessaire.
   */
  private async ensureMember(clientId: string) {
    let membre = await this.prisma.membre.findUnique({
      where: { clientId },
      include: {
        filleuls: { select: { statut: true } },
        portefeuille: true,
      },
    });

    if (!membre || !membre.portefeuille) {
      const client = await this.prisma.client.findUnique({
        where: { id: clientId },
        select: { id: true, statut: true, parrainClientId: true },
      });
      if (client?.statut === 'ACTIF') {
        try {
          await this.mlmMatrix.onClientActivated(clientId, client.parrainClientId ?? undefined);
          membre = await this.prisma.membre.findUnique({
            where: { clientId },
            include: {
              filleuls: { select: { statut: true } },
              portefeuille: true,
            },
          });
        } catch (err) {
          console.error(`[PORTAL AUTO-HEAL ERROR] Client ${clientId}:`, err);
        }
      }
    }
    return membre;
  }

  // ── GET /portal/me ────────────────────────────────────────────────────────

  async getPortalData(clientId: string) {
    const membre = await this.ensureMember(clientId);

    const [client, dernierVentes] = await Promise.all([
      this.prisma.client.findUnique({
        where: { id: clientId },
        select: {
          id: true,
          prenom: true,
          nom: true,
          telephone: true,
          statut: true,
          codeParrain: true,
        },
      }),
      this.prisma.vente.findMany({
        where: { clientId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          lignes: {
            include: { produit: { select: { nom: true } } },
          },
        },
      }),
    ]);

    if (!client) throw new NotFoundException({ code: 'ERR_NOT_FOUND' });

    const dernierAchats = dernierVentes.map((v) => ({
      id: v.id,
      date: v.createdAt.toISOString(),
      produitPrincipal: v.lignes[0]?.produit?.nom ?? '—',
      montantTotal: Number(v.montantNet),
      nbArticles: v.lignes.reduce((sum, l) => sum + l.quantite, 0) || 1,
    }));

    return {
      client: { ...client, remisePct: 0 },
      prochainNiveau: null,
      niveauxConfig: [],
      nbFilleulsActifs: membre?.filleuls.filter((f) => f.statut === 'ACTIF').length ?? 0,
      nbFilleulsTotal: membre?.filleuls.length ?? 0,
      dernierAchats,
    };
  }

  // ── GET /portal/wallet ────────────────────────────────────────────────────

  async getWallet(clientId: string) {
    const membre = await this.ensureMember(clientId);

    if (!membre || !membre.portefeuille) {
      return {
        wallet: {
          soldeDisponible: 0,
          soldeReserve: 0,
          soldeDisponibleRetrait: 0,
          totalGagne: 0,
        },
        stats: {
          gainsTotaux: 0,
        },
      };
    }

    return {
      wallet: {
        soldeDisponible: Number(membre.portefeuille.soldeDisponible),
        soldeReserve: Number(membre.portefeuille.soldeReserve),
        soldeDisponibleRetrait: Number(membre.portefeuille.soldeDisponible) - Number(membre.portefeuille.soldeReserve),
        totalGagne: Number(membre.portefeuille.totalGagne),
      },
      stats: {
        gainsTotaux: Number(membre.portefeuille.totalGagne),
      },
    };
  }

  async initPayout(clientId: string, input: { amount: number; provider: KpayProvider; phoneNumber: string }) {
    const membre = await this.ensureMember(clientId);
    if (!membre) throw new NotFoundException({ code: 'ERR_NOT_FOUND', message: 'Compte MLM introuvable' });
    return this.mlmWallet.initPayout(membre.id, input);
  }

  // ── GET /portal/purchases ─────────────────────────────────────────────────

  async getPurchases(
    clientId: string,
    query: { period?: string; page?: number; limit?: number },
  ) {
    const { period, page = 1, limit = 20 } = query;
    const dateDebut = this.getPeriodStart(period);
    const where: any = { clientId };
    if (dateDebut) where.createdAt = { gte: dateDebut };

    const [ventes, totaux] = await Promise.all([
      this.prisma.vente.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...paginate(page, limit),
        include: {
          site: { select: { nom: true } },
          lignes: {
            include: { produit: { select: { nom: true } } },
          },
        },
      }),
      this.prisma.vente.aggregate({
        where,
        _sum: { montantNet: true, pointsAttribues: true },
        _count: { id: true },
      }),
    ]);

    const totalCount = totaux._count.id;

    const achats = ventes.map((v) => ({
      id: v.id,
      date: v.createdAt.toISOString(),
      siteNom: v.site?.nom ?? '—',
      produitPrincipal: v.lignes[0]?.produit?.nom ?? '—',
      nbArticles: v.lignes.reduce((sum, l) => sum + l.quantite, 0) || 1,
      montantTotal: Number(v.montantNet),
      pointsAttribues: v.pointsAttribues ?? 0,
      remiseAppliquee: Number(v.remiseFidelite ?? 0),
      modePaiement: v.modePaiement,
    }));

    return {
      achats,
      stats: {
        totalDepense: Number(totaux._sum.montantNet ?? 0),
        nbAchats: totalCount,
        totalPointsGagnes: Number(totaux._sum.pointsAttribues ?? 0),
      },
      meta: {
        total: totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
      },
    };
  }

  // ── GET /portal/purchases/:id ─────────────────────────────────────────────

  async getPurchaseDetail(clientId: string, venteId: string) {
    const vente = await this.prisma.vente.findUnique({
      where: { id: venteId },
      include: {
        site: { select: { nom: true } },
        lignes: {
          include: { produit: { select: { nom: true } } },
        },
      },
    });

    if (!vente || vente.clientId !== clientId) {
      throw new NotFoundException({ code: 'ERR_NOT_FOUND' });
    }

    return {
      vente: {
        id: vente.id,
        numeroVente: vente.numeroVente,
        date: vente.createdAt.toISOString(),
        siteNom: vente.site?.nom ?? '—',
        modePaiement: vente.modePaiement,
        pointsAttribues: vente.pointsAttribues ?? 0,
        remiseFidelite: Number(vente.remiseFidelite ?? 0),
        montantNet: Number(vente.montantNet),
        lignes: vente.lignes.map((l) => ({
          nom: l.produit?.nom ?? '—',
          quantite: l.quantite,
          prixUnitaire: Number(l.prixUnitaire),
          sousTotal: Number(l.quantite) * Number(l.prixUnitaire),
        })),
        montantBrut: Number(vente.montantBrut ?? vente.montantNet),
      },
    };
  }

  // ── GET /portal/wallet/transactions ───────────────────────────────────────

  async getWalletTransactions(
    clientId: string,
    query: { page?: number; limit?: number; typeFilter?: string },
  ) {
    const membre = await this.ensureMember(clientId);

    if (!membre?.portefeuille) {
      return {
        transactions: [],
        meta: { total: 0, page: query.page ?? 1, limit: query.limit ?? 20, totalPages: 0 },
      };
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = { portefeuilleId: membre.portefeuille.id };
    if (query.typeFilter && query.typeFilter !== 'all') {
      if (query.typeFilter === 'gains') {
        where.type = { in: ['COMMISSION', 'PROMOTION', 'SALAIRE', 'BONUS_RETRAITE'] };
      } else if (query.typeFilter === 'retraits') {
        where.type = 'DEBIT';
      }
    }

    const [transactions, total] = await Promise.all([
      this.prisma.transactionPortefeuille.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.transactionPortefeuille.count({ where }),
    ]);

    return {
      transactions: transactions.map((t) => ({
        id: t.id,
        type: t.type,
        montant: Number(t.montant),
        description: t.description,
        createdAt: t.createdAt.toISOString(),
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ── GET /portal/referrals ─────────────────────────────────────────────────

  async getReferrals(
    clientId: string,
    query: { filter?: string; page?: number; limit?: number },
  ) {
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      select: { codeParrain: true },
    });
    if (!client) throw new NotFoundException({ code: 'ERR_NOT_FOUND' });

    const membre = await this.ensureMember(clientId);
    if (!membre) throw new NotFoundException({ code: 'ERR_NOT_FOUND' });

    // Fetch up to 10 generations using breadth-first search
    let currentGenerationIds = [membre.id];
    let depth = 1;
    const maxDepth = 10;
    const allDescendants: any[] = [];

    while (currentGenerationIds.length > 0 && depth <= maxDepth) {
      const filleuls = await this.prisma.membre.findMany({
        where: { parrainId: { in: currentGenerationIds } },
        include: { client: true },
      });

      if (filleuls.length === 0) break;

      for (const f of filleuls) {
        allDescendants.push({ ...f, generation: depth });
      }

      currentGenerationIds = filleuls.map((f) => f.id);
      depth++;
    }

    // Apply optional filter: 'actifs', 'en_attente', 'tous'
    let filteredFilleuls = allDescendants;
    if (query.filter === 'actifs') {
      filteredFilleuls = filteredFilleuls.filter((f) => f.statut === 'ACTIF');
    } else if (query.filter === 'en_attente') {
      filteredFilleuls = filteredFilleuls.filter((f) => f.statut !== 'ACTIF');
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const mappedFilleuls = filteredFilleuls.map((f) => ({
      id: f.id,
      prenom: f.client.prenom,
      nom: f.client.nom,
      statut: f.statut,
      generation: f.generation,
      dateInscription: f.dateActivation ? f.dateActivation.toISOString() : f.createdAt.toISOString(),
      etapeOnboarding: f.statut !== 'ACTIF' ? 'ACTIVATION' : undefined,
      etapeMessage: f.statut !== 'ACTIF' ? 'Activation en attente…' : undefined,
    }));

    const paginatedFilleuls = mappedFilleuls.slice(skip, skip + limit);

    return {
      codeParrain: client.codeParrain ?? '—',
      stats: {
        nbFilleulsActifs: allDescendants.filter((f) => f.statut === 'ACTIF').length,
        nbFilleulsTotal: allDescendants.length,
        gainsTotaux: membre?.portefeuille ? Number(membre.portefeuille.totalGagne) : 0,
      },
      filleuls: paginatedFilleuls,
      meta: {
        total: mappedFilleuls.length,
        page,
        limit,
        totalPages: Math.ceil(mappedFilleuls.length / limit),
      },
    };
  }

  // ── GET /portal/filleuls (legacy) ─────────────────────────────────────────

  async getFilleuls(clientId: string) {
    return this.getReferrals(clientId, {});
  }

  // ── Withdrawal Requests ───────────────────────────────────────────────────

  async createWithdrawalRequest(clientId: string, dto: CreateWithdrawalRequestDto) {
    const membre = await this.ensureMember(clientId);
    if (!membre) {
      throw new NotFoundException({ code: 'ERR_NOT_FOUND', message: 'Compte MLM introuvable' });
    }

    // Vérifier que les commissions existent et sont validées
    const commissions = await this.prisma.commission.findMany({
      where: {
        id: { in: dto.commissionIds },
        membreId: membre.id,
        statut: 'VALIDEE',
      },
    });

    if (commissions.length !== dto.commissionIds.length) {
      throw new BadRequestException({
        code: 'ERR_INVALID_COMMISSIONS',
        message: 'Certaines commissions sont invalides ou déjà utilisées',
      });
    }

    // Calculer le montant total des commissions
    const montantTotal = commissions.reduce((sum, c) => sum + Number(c.montant), 0);

    if (dto.montant > montantTotal) {
      throw new BadRequestException({
        code: 'ERR_AMOUNT_EXCEEDS',
        message: 'Le montant demandé dépasse le total des commissions sélectionnées',
      });
    }

    // Vérifier les champs requis selon le type et normaliser le téléphone
    let phoneNumber: string | undefined;
    if (dto.type === 'MOBILE_MONEY') {
      if (!dto.provider || !dto.phoneNumber) {
        throw new BadRequestException({
          code: 'ERR_MISSING_PAYMENT_INFO',
          message: 'Le provider et le numéro de téléphone sont requis pour Mobile Money',
        });
      }
      phoneNumber = this.normalizeDrcPhone(dto.phoneNumber);
    }

    // Créer la demande de retrait
    const request = await this.prisma.withdrawalRequest.create({
      data: {
        membreId: membre.id,
        montant: new Prisma.Decimal(dto.montant),
        type: dto.type,
        provider: dto.provider,
        phoneNumber,
        commissionIds: dto.commissionIds,
        notes: dto.notes,
        statut: 'EN_ATTENTE',
      },
      include: {
        membre: {
          include: {
            client: { select: { id: true, prenom: true, nom: true, telephone: true } },
          },
        },
      },
    });

    return {
      id: request.id,
      montant: Number(request.montant),
      type: request.type,
      provider: request.provider,
      phoneNumber: request.phoneNumber,
      statut: request.statut,
      commissionIds: request.commissionIds,
      notes: request.notes,
      createdAt: request.createdAt,
    };
  }

  async getWithdrawalRequests(
    clientId: string,
    query: { page?: number; limit?: number; statut?: string },
  ) {
    const membre = await this.ensureMember(clientId);
    if (!membre) {
      return {
        requests: [],
        meta: { total: 0, page: query.page ?? 1, limit: query.limit ?? 20, totalPages: 0 },
      };
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = { membreId: membre.id };
    if (query.statut && query.statut !== 'all') {
      where.statut = query.statut;
    }

    const [requests, total] = await Promise.all([
      this.prisma.withdrawalRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.withdrawalRequest.count({ where }),
    ]);

    return {
      requests: requests.map((r) => ({
        id: r.id,
        montant: Number(r.montant),
        type: r.type,
        provider: r.provider,
        phoneNumber: r.phoneNumber,
        statut: r.statut,
        commissionIds: r.commissionIds,
        notes: r.notes,
        rejectReason: r.rejectReason,
        createdAt: r.createdAt,
        approvedAt: r.approvedAt,
        paidAt: r.paidAt,
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async cancelWithdrawalRequest(clientId: string, requestId: string) {
    const membre = await this.ensureMember(clientId);
    if (!membre) {
      throw new NotFoundException({ code: 'ERR_NOT_FOUND', message: 'Compte MLM introuvable' });
    }

    const request = await this.prisma.withdrawalRequest.findUnique({
      where: { id: requestId },
    });

    if (!request || request.membreId !== membre.id) {
      throw new NotFoundException({ code: 'ERR_NOT_FOUND', message: 'Demande de retrait introuvable' });
    }

    if (request.statut !== 'EN_ATTENTE') {
      throw new BadRequestException({
        code: 'ERR_NOT_CANCELLABLE',
        message: 'Seules les demandes en attente peuvent être annulées',
      });
    }

    return this.prisma.withdrawalRequest.update({
      where: { id: requestId },
      data: { statut: 'ANNULE' },
      select: { id: true, statut: true },
    });
  }

  async getValidatedCommissions(clientId: string) {
    const membre = await this.ensureMember(clientId);
    if (!membre) {
      return { commissions: [], totalDisponible: 0 };
    }

    // Récupérer les commissions validées et non encore utilisées dans une demande de retrait
    const usedCommissionIds = await this.prisma.withdrawalRequest.findMany({
      where: {
        membreId: membre.id,
        statut: { in: ['EN_ATTENTE', 'APPROUVE', 'PAYE'] },
      },
      select: { commissionIds: true },
    });

    const usedIds = new Set(
      usedCommissionIds.flatMap((r) => (r.commissionIds as string[]) || []),
    );

    const commissions = await this.prisma.commission.findMany({
      where: {
        membreId: membre.id,
        statut: 'VALIDEE',
      },
      include: {
        level: { select: { id: true, ordre: true, nom: true } },
        filleul: {
          include: { client: { select: { id: true, prenom: true, nom: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const availableCommissions = commissions.filter((c) => !usedIds.has(c.id));

    const totalDisponible = availableCommissions.reduce(
      (sum, c) => sum + Number(c.montant),
      0,
    );

    return {
      commissions: availableCommissions.map((c) => ({
        id: c.id,
        montant: Number(c.montant),
        description: c.description,
        createdAt: c.createdAt,
        valideeAt: c.valideeAt,
        level: c.level,
        filleul: c.filleul
          ? {
              id: c.filleul.id,
              matricule: c.filleul.matricule,
              client: c.filleul.client,
            }
          : null,
      })),
      totalDisponible,
    };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private getPeriodStart(period?: string): Date | null {
    if (!period || period === 'all') return null;
    const now = new Date();
    if (period === 'month') return new Date(now.getFullYear(), now.getMonth(), 1);
    if (period === '3months') return new Date(now.getFullYear(), now.getMonth() - 3, 1);
    if (period === 'quarter') {
      const q = Math.floor(now.getMonth() / 3);
      return new Date(now.getFullYear(), q * 3, 1);
    }
    if (period === 'year') return new Date(now.getFullYear(), 0, 1);
    return null;
  }

  /**
   * Normalise un numéro RDC vers +243XXXXXXXXX (accepte 243…, +243…, 0…).
   * Même logique que KpayService.normalizeDrcPhone mais avec préfixe +.
   */
  private normalizeDrcPhone(raw: string): string {
    const digits = raw.replace(/[^\d]/g, '').replace(/^00/, '');
    let normalized: string;
    if (digits.startsWith('0')) normalized = `243${digits.slice(1)}`;
    else if (digits.length === 9) normalized = `243${digits}`;
    else normalized = digits;
    if (!/^243\d{9}$/.test(normalized)) {
      throw new BadRequestException({
        code: 'ERR_INVALID_PHONE',
        message: 'Le numéro doit être un numéro RDC valide (+243XXXXXXXXX)',
      });
    }
    return `+${normalized}`;
  }
}
