import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { paginate } from '../../common/dto/pagination.dto';

@Injectable()
export class PortalService {
  constructor(private prisma: PrismaService) {}

  // ── GET /portal/me ────────────────────────────────────────────────────────

  async getPortalData(clientId: string) {
    const [client, configFidelite, nbFilleulsActifs, nbFilleulsTotal, dernierVentes] =
      await Promise.all([
        this.prisma.client.findUnique({
          where: { id: clientId },
          select: {
            id: true, prenom: true, nom: true, telephone: true,
            statut: true, codeParrain: true,
          },
        }),
        Promise.resolve(null),
        Promise.resolve(0),
        Promise.resolve(0),
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
      nbFilleulsActifs,
      nbFilleulsTotal,
      dernierAchats,
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

  // ── GET /portal/points ────────────────────────────────────────────────────

  async getPoints(
    clientId: string,
    query: { page?: number; limit?: number; typeFilter?: string },
  ) {
    return {
      mouvements: [],
      meta: { total: 0, page: query.page ?? 1, limit: query.limit ?? 20, totalPages: 0 },
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

    return {
      codeParrain: client.codeParrain ?? '—',
      stats: {
        nbFilleulsActifs: 0,
        nbFilleulsTotal: 0,
        gainsTotaux: 0,
        typeRecompense: 'POINTS',
        recompenseValeur: 500,
      },
      filleuls: [],
      meta: { total: 0, page: query.page ?? 1, limit: query.limit ?? 20, totalPages: 0 },
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
