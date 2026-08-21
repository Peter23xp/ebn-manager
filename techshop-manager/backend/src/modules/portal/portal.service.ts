import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { paginate } from '../../common/dto/pagination.dto';

@Injectable()
export class PortalService {
  constructor(private prisma: PrismaService) {}

  // ── GET /portal/me ────────────────────────────────────────────────────────

  async getPortalData(clientId: string) {
    const [client, membre, dernierVentes] =
      await Promise.all([
        this.prisma.client.findUnique({
          where: { id: clientId },
          select: {
            id: true, prenom: true, nom: true, telephone: true,
            statut: true, codeParrain: true,
          },
        }),
        this.prisma.membre.findUnique({
          where: { clientId },
          include: {
            filleuls: { select: { statut: true } },
            portefeuille: true,
          }
        }),
        this.prisma.vente.findMany({
          where: { clientId },
          orderBy: { createdAt: 'desc' },
          take: 3,
          include: {
            lignes: {
              take: 1,
              include: { produit: { select: { nom: true } } },
            },
          },
        }),
      ]);

    if (!client) throw new NotFoundException({ code: 'ERR_NOT_FOUND' });

    // Prochain niveau
    let prochainNiveau = null;
    const niveauxConfig: any[] = [];
    const remisePct = 0;

    const dernierAchats = dernierVentes.map((v) => ({
      id: v.id,
      date: v.createdAt.toISOString(),
      produitPrincipal: v.lignes[0]?.produit?.nom ?? '—',
      montantTotal: Number(v.montantNet),
      nbArticles: v.lignes.length,
    }));

    return {
      client: { ...client, remisePct },
      prochainNiveau,
      niveauxConfig: niveauxConfig.map((n) => ({
        id: n.id,
        nom: n.nom,
        seuilPts: n.seuilPts,
        remisePct: Number(n.remisePct),
        couleur: n.couleur,
      })),
      nbFilleulsActifs: membre?.filleuls.filter(f => f.statut === 'ACTIF').length ?? 0,
      nbFilleulsTotal: membre?.filleuls.length ?? 0,
      dernierAchats,
    };
  }

  // ── GET /portal/wallet ────────────────────────────────────────────────────

  async getWallet(clientId: string) {
    const membre = await this.prisma.membre.findUnique({
      where: { clientId },
      include: { portefeuille: true }
    });
    
    if (!membre || !membre.portefeuille) {
      return { wallet: null, stats: null };
    }

    return {
      wallet: {
        soldeDisponible: Number(membre.portefeuille.soldeDisponible),
        totalGagne: Number(membre.portefeuille.totalGagne),
      },
      stats: {
        gainsTotaux: Number(membre.portefeuille.totalGagne),
      }
    };
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
            take: 1,
            include: { produit: { select: { nom: true } } },
          },
        },
      }),
      this.prisma.vente.aggregate({
        where,
        _sum: { montantNet: true },
        _count: { id: true },
      }),
    ]);

    const totalCount = totaux._count.id;

    const achats = ventes.map((v) => ({
      id: v.id,
      date: v.createdAt.toISOString(),
      siteNom: v.site?.nom ?? '—',
      produitPrincipal: v.lignes[0]?.produit?.nom ?? '—',
      nbArticles: v.lignes.length,
      montantTotal: Number(v.montantNet),

      modePaiement: v.modePaiement,
    }));

    return {
      achats,
      stats: {
        totalDepense: Number(totaux._sum.montantNet ?? 0),
        nbAchats: totalCount,

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

    if (!vente) throw new NotFoundException({ code: 'ERR_NOT_FOUND' });
    if (vente.clientId !== clientId) throw new ForbiddenException({ code: 'ACCESS_DENIED' });



    return {
      vente: {
        id: vente.id,
        numeroVente: (vente as any).numeroVente ?? undefined,
        date: vente.createdAt.toISOString(),
        siteNom: vente.site?.nom ?? '—',
        modePaiement: vente.modePaiement,
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
    const membre = await this.prisma.membre.findUnique({
      where: { clientId },
      select: { portefeuille: { select: { id: true } } },
    });

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
      where.type = query.typeFilter === 'gains' ? { in: ['COMMISSION', 'BONUS'] } : 'RETRAIT';
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

    const membre = await this.prisma.membre.findUnique({
      where: { clientId },
      include: { portefeuille: true }
    });

    if (!membre) throw new NotFoundException({ code: 'ERR_NOT_FOUND' });

    // Fetch up to 10 generations using breadth-first search
    let currentGenerationIds = [membre.id];
    let depth = 1;
    const maxDepth = 10;
    const allDescendants: any[] = [];

    while (currentGenerationIds.length > 0 && depth <= maxDepth) {
      const filleuls = await this.prisma.membre.findMany({
        where: { parrainId: { in: currentGenerationIds } },
        include: { client: true }
      });

      if (filleuls.length === 0) break;

      for (const f of filleuls) {
        allDescendants.push({ ...f, generation: depth });
      }

      currentGenerationIds = filleuls.map(f => f.id);
      depth++;
    }

    // Apply optional filter: 'actifs', 'en_attente', 'tous'
    let filteredFilleuls = allDescendants;
    if (query.filter === 'actifs') {
      filteredFilleuls = filteredFilleuls.filter(f => f.statut === 'ACTIF');
    } else if (query.filter === 'en_attente') {
      filteredFilleuls = filteredFilleuls.filter(f => f.statut !== 'ACTIF');
    }

    const mappedFilleuls = filteredFilleuls.map(f => ({
      id: f.id,
      prenom: f.client?.prenom ?? '',
      nom: f.client?.nom ?? '',
      statut: f.statut,
      dateInscription: f.dateInscription.toISOString(),
      etapeEnCours: f.statut === 'ACTIF' ? undefined : 'En cours',
      generation: f.generation,
    }));

    // Pagination
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const startIndex = (page - 1) * limit;
    const paginatedFilleuls = mappedFilleuls.slice(startIndex, startIndex + limit);

    return {
      codeParrain: client.codeParrain ?? '—',
      stats: {
        nbFilleulsActifs: allDescendants.filter(f => f.statut === 'ACTIF').length,
        nbFilleulsTotal: allDescendants.length,
        gainsTotaux: membre?.portefeuille ? Number(membre.portefeuille.totalGagne) : 0,
      },
      filleuls: paginatedFilleuls,
      meta: { 
        total: mappedFilleuls.length, 
        page, 
        limit, 
        totalPages: Math.ceil(mappedFilleuls.length / limit) 
      },
    };
  }

  // ── GET /portal/filleuls (legacy) ─────────────────────────────────────────

  async getFilleuls(clientId: string) {
    return this.getReferrals(clientId, {});
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private getPeriodStart(period?: string): Date | null {
    if (!period || period === 'all') return null;
    const now = new Date();
    if (period === 'month')   return new Date(now.getFullYear(), now.getMonth(), 1);
    if (period === '3months') return new Date(now.getFullYear(), now.getMonth() - 3, 1);
    if (period === 'quarter') {
      const q = Math.floor(now.getMonth() / 3);
      return new Date(now.getFullYear(), q * 3, 1);
    }
    if (period === 'year')    return new Date(now.getFullYear(), 0, 1);
    return null;
  }

  private getEtapeMessage(etape: string): string {
    const map: Record<string, string> = {
      RECIT:      'Formation à suivre…',
      FORMATION:  'Achat de la fiche en cours…',
      FICHE:      'Activation en attente…',
    };
    return map[etape] ?? 'Inscription en cours…';
  }
}
