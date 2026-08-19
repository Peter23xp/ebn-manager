import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

// ── Constants ─────────────────────────────────────────────────────────────────

/** EBN career path — 8 levels, each requiring 4 qualified referrals */
export const MLM_LEVELS_COUNT = 8;

// ── DTOs ──────────────────────────────────────────────────────────────────────

export interface UpdateMlmConfigDto {
  levelId: number;
  commissionParFilleul?: number;
  commissionTotale?: number;
  bonusDescription?: string;
  salaireMensuel?: number;
  salaireActif?: boolean;
  isActive?: boolean;
}

@Injectable()
export class MlmService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Network stats ───────────────────────────────────────────────────────────

  async getNetworkStats() {
    const [
      totalMembres,
      membresActifs,
      membresEnAttente,
      portefeuilleAgg,
      promotionsRecentes,
    ] = await Promise.all([
      this.prisma.membre.count(),
      this.prisma.membre.count({ where: { statut: 'ACTIF' } }),
      this.prisma.membre.count({ where: { statut: 'EN_ATTENTE' } }),
      this.prisma.portefeuille.aggregate({
        _sum: { totalGagne: true, soldeDisponible: true },
      }),
      this.prisma.promotion.count({
        where: {
          datePromotion: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
      }),
    ]);

    return {
      totalMembres,
      membresActifs,
      membresEnAttente,
      totalCommissionsVerseesUSD: Number(portefeuilleAgg._sum.totalGagne ?? 0),
      soldeDisponibleTotalUSD: Number(portefeuilleAgg._sum.soldeDisponible ?? 0),
      promotionsDerniers30Jours: promotionsRecentes,
    };
  }

  // ── Members by level ────────────────────────────────────────────────────────

  async getMembersByLevel() {
    const levels = await this.prisma.mlmLevel.findMany({
      orderBy: { ordre: 'asc' },
      include: {
        _count: { select: { membres: { where: { statut: 'ACTIF' } } } },
      },
    });

    return levels.map((l) => ({
      id: l.id,
      ordre: l.ordre,
      nom: l.nom,
      couleur: l.couleur,
      icone: l.icone,
      membresActifs: l._count.membres,
    }));
  }

  // ── Recent promotions ───────────────────────────────────────────────────────

  async getRecentPromotions(limit = 10) {
    const promotions = await this.prisma.promotion.findMany({
      take: limit,
      orderBy: { datePromotion: 'desc' },
      include: {
        membre: {
          include: {
            client: { select: { id: true, prenom: true, nom: true } },
            level: { select: { id: true, ordre: true, nom: true, couleur: true, icone: true } },
          },
        },
      },
    });

    return promotions.map((p) => ({
      id: p.id,
      membre: {
        id: p.membre.id,
        prenom: p.membre.client.prenom,
        nom: p.membre.client.nom,
        clientId: p.membre.clientId,
        niveauActuel: p.membre.level,
      },
      niveauAvantId: p.niveauAvantId,
      niveauApresId: p.niveauApresId,
      commissionVersee: Number(p.commissionVersee),
      datePromotion: p.datePromotion,
    }));
  }

  // ── Member progress ─────────────────────────────────────────────────────────

  async getMemberProgress(memberId: string) {
    const membre = await this.prisma.membre.findUnique({
      where: { id: memberId },
      include: {
        client: { select: { id: true, prenom: true, nom: true, telephone: true, statut: true } },
        level: true,
        portefeuille: true,
        matrices: {
          include: { positions: true, level: true },
          orderBy: { level: { ordre: 'asc' } },
        },
        promotions: {
          orderBy: { datePromotion: 'desc' },
          take: 5,
        },
      },
    });

    if (!membre) throw new NotFoundException(`Membre ${memberId} introuvable`);

    const nextLevel = await this.prisma.mlmLevel.findFirst({
      where: { ordre: { gt: membre.level.ordre }, isActive: true },
      orderBy: { ordre: 'asc' },
    });

    // Progress in current level matrix
    const currentMatrix = membre.matrices.find((m) => m.mlmLevelId === membre.mlmLevelId);
    const filleulsValides = currentMatrix?.filleulsValides ?? 0;

    return {
      membre: {
        id: membre.id,
        matricule: membre.matricule,
        statut: membre.statut,
        dateActivation: membre.dateActivation,
        client: membre.client,
        level: membre.level,
      },
      progression: {
        filleulsValidesNiveauActuel: filleulsValides,
        filleulsRequisNiveauSuivant: nextLevel?.filleulsRequis ?? 4,
        prochainNiveau: nextLevel ?? null,
        pourcentage: nextLevel
          ? Math.min(100, Math.round((filleulsValides / (nextLevel.filleulsRequis ?? 4)) * 100))
          : 100,
      },
      portefeuille: membre.portefeuille
        ? {
            soldeDisponible: Number(membre.portefeuille.soldeDisponible),
            totalGagne: Number(membre.portefeuille.totalGagne),
          }
        : null,
      matrices: membre.matrices.map((m) => ({
        id: m.id,
        niveau: m.level,
        filleulsValides: m.filleulsValides,
        estComplete: m.estComplete,
        dateComplete: m.dateComplete,
        positions: m.positions,
      })),
      historiquePromotions: membre.promotions,
    };
  }

  // ── Member by clientId ──────────────────────────────────────────────────────

  async getMemberByClientId(clientId: string) {
    const membre = await this.prisma.membre.findUnique({
      where: { clientId },
      include: {
        client: { select: { id: true, prenom: true, nom: true, telephone: true } },
        level: true,
        portefeuille: true,
      },
    });
    return membre;
  }

  // ── All members (paginated) ─────────────────────────────────────────────────

  async listMembers(params: {
    page?: number;
    limit?: number;
    statut?: string;
    levelId?: number;
    search?: string;
  }) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.MembreWhereInput = {};
    if (params.statut) where.statut = params.statut as any;
    if (params.levelId) where.mlmLevelId = params.levelId;
    if (params.search) {
      where.client = {
        OR: [
          { nom: { contains: params.search, mode: 'insensitive' } },
          { prenom: { contains: params.search, mode: 'insensitive' } },
          { telephone: { contains: params.search } },
        ],
      };
    }

    const [membres, total] = await Promise.all([
      this.prisma.membre.findMany({
        where,
        skip,
        take: limit,
        orderBy: { dateActivation: 'desc' },
        include: {
          client: { select: { id: true, prenom: true, nom: true, telephone: true } },
          level: { select: { id: true, ordre: true, nom: true, couleur: true, icone: true } },
          portefeuille: { select: { soldeDisponible: true, totalGagne: true } },
          _count: { select: { filleuls: true } },
        },
      }),
      this.prisma.membre.count({ where }),
    ]);

    return {
      membres: membres.map((m) => ({
        id: m.id,
        matricule: m.matricule,
        statut: m.statut,
        dateActivation: m.dateActivation,
        client: m.client,
        level: m.level,
        portefeuille: m.portefeuille
          ? {
              soldeDisponible: Number(m.portefeuille.soldeDisponible),
              totalGagne: Number(m.portefeuille.totalGagne),
            }
          : null,
        nbFilleuls: m._count.filleuls,
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ── Config ──────────────────────────────────────────────────────────────────

  async getConfig() {
    const levels = await this.prisma.mlmLevel.findMany({
      orderBy: { ordre: 'asc' },
    });
    return levels.map((l) => ({
      ...l,
      commissionParFilleul: Number(l.commissionParFilleul),
      commissionTotale: Number(l.commissionTotale),
      salaireMensuel: Number(l.salaireMensuel),
    }));
  }

  async updateConfig(dto: UpdateMlmConfigDto) {
    const level = await this.prisma.mlmLevel.findUnique({ where: { id: dto.levelId } });
    if (!level) throw new NotFoundException(`MlmLevel ${dto.levelId} introuvable`);

    const data: Prisma.MlmLevelUpdateInput = {};
    if (dto.commissionParFilleul !== undefined)
      data.commissionParFilleul = new Prisma.Decimal(dto.commissionParFilleul);
    if (dto.commissionTotale !== undefined)
      data.commissionTotale = new Prisma.Decimal(dto.commissionTotale);
    if (dto.bonusDescription !== undefined) data.bonusDescription = dto.bonusDescription;
    if (dto.salaireMensuel !== undefined)
      data.salaireMensuel = new Prisma.Decimal(dto.salaireMensuel);
    if (dto.salaireActif !== undefined) data.salaireActif = dto.salaireActif;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;

    const updated = await this.prisma.mlmLevel.update({
      where: { id: dto.levelId },
      data,
    });

    return {
      ...updated,
      commissionParFilleul: Number(updated.commissionParFilleul),
      commissionTotale: Number(updated.commissionTotale),
      salaireMensuel: Number(updated.salaireMensuel),
    };
  }

  // ── Promotion history for a member ─────────────────────────────────────────

  async getPromotionHistory(memberId: string) {
    const promotions = await this.prisma.promotion.findMany({
      where: { membreId: memberId },
      orderBy: { datePromotion: 'desc' },
    });
    return promotions.map((p) => ({
      ...p,
      commissionVersee: Number(p.commissionVersee),
    }));
  }
}
