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
      commissionsEnAttente,
      commissionsTotalesValidees,
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
      this.prisma.commission.aggregate({
        where: { statut: 'EN_ATTENTE' },
        _sum: { montant: true },
        _count: { id: true },
      }),
      this.prisma.commission.aggregate({
        where: { statut: { in: ['VALIDEE', 'PAYEE'] } },
        _sum: { montant: true },
      }),
    ]);

    return {
      totalMembres,
      membresActifs,
      membresEnAttente,
      commissionsGenerees: Number(portefeuilleAgg._sum.totalGagne ?? 0),
      totalCommissionsVerseesUSD: Number(portefeuilleAgg._sum.totalGagne ?? 0),
      soldeDisponibleTotalUSD: Number(portefeuilleAgg._sum.soldeDisponible ?? 0),
      promotionsMois: promotionsRecentes,
      promotionsDerniers30Jours: promotionsRecentes,
      commissionsEnAttente: {
        count: commissionsEnAttente._count.id,
        montant: Number(commissionsEnAttente._sum.montant ?? 0),
      },
      commissionsTotalesValidees: Number(commissionsTotalesValidees._sum.montant ?? 0),
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
      levelId: l.ordre,
      nom: l.nom,
      couleur: l.couleur,
      icone: l.icone,
      commissionParFilleul: Number(l.commissionParFilleul),
      commissionTotale: Number(l.commissionTotale),
      bonusDescription: l.bonusDescription,
      membresActifs: l._count.membres,
      count: l._count.membres,
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

    // Fetch level details for before/after
    const levelIds = [...new Set([
      ...promotions.map((p) => p.niveauAvantId),
      ...promotions.map((p) => p.niveauApresId),
    ])];
    const levels = await this.prisma.mlmLevel.findMany({
      where: { id: { in: levelIds } },
      select: { id: true, ordre: true, nom: true, couleur: true },
    });
    const levelsMap = new Map(levels.map((l) => [l.id, l]));

    return promotions.map((p) => ({
      id: p.id,
      membreId: p.membre.id,
      membre: {
        id: p.membre.id,
        matricule: p.membre.matricule,
        clientId: p.membre.clientId,
        client: p.membre.client,
        level: p.membre.level,
        niveauActuel: p.membre.level,
      },
      niveauAvant: levelsMap.get(p.niveauAvantId) ?? null,
      niveauApres: levelsMap.get(p.niveauApresId) ?? null,
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
        parrain: {
          include: {
            client: { select: { id: true, prenom: true, nom: true, telephone: true } },
            level: { select: { id: true, ordre: true, nom: true, couleur: true } },
          },
        },
        filleuls: {
          include: {
            client: { select: { id: true, prenom: true, nom: true } },
            level: { select: { id: true, ordre: true, nom: true, couleur: true } },
            matrices: {
              select: { mlmLevelId: true, filleulsValides: true, estComplete: true },
              orderBy: { level: { ordre: 'desc' } },
              take: 1,
            },
            _count: { select: { filleuls: true } },
          },
          orderBy: { dateActivation: 'desc' },
        },
        portefeuille: true,
        matrices: {
          include: { positions: { orderBy: { numeroPosition: 'asc' } }, level: true },
          orderBy: { level: { ordre: 'asc' } },
        },
        promotions: {
          orderBy: { datePromotion: 'desc' },
          take: 10,
        },
        bonusAttribues: {
          include: { level: { select: { id: true, ordre: true, nom: true } } },
          orderBy: { dateAttribution: 'desc' },
        },
        bonusRetraites: {
          include: {
            filleulCrown: {
              include: { client: { select: { id: true, prenom: true, nom: true } } },
            },
          },
        },
        commissionsRecues: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: {
            level: { select: { id: true, ordre: true, nom: true } },
            filleul: {
              include: { client: { select: { id: true, prenom: true, nom: true } } },
            },
          },
        },
        salairesVerses: { orderBy: { moisAnnee: 'desc' }, take: 6 },
      },
    });

    if (!membre) throw new NotFoundException(`Membre ${memberId} introuvable`);

    const nextLevel = await this.prisma.mlmLevel.findFirst({
      where: { ordre: { gt: membre.level.ordre }, isActive: true },
      orderBy: { ordre: 'asc' },
    });
    // A position can point to a historical filleul that is not part of the
    // member's currently loaded direct-filleuls collection (for example after
    // a promotion/reorganisation). Load every referenced member explicitly so
    // completed matrix positions always display the person's name.
    const positionFilleulIds = [...new Set(
      membre.matrices.flatMap((matrix) => matrix.positions.map((position) => position.filleulId).filter(Boolean) as string[]),
    )];
    const positionFilleuls = positionFilleulIds.length
      ? await this.prisma.membre.findMany({
          where: { id: { in: positionFilleulIds } },
          include: {
            client: { select: { id: true, prenom: true, nom: true } },
            level: { select: { id: true, ordre: true, nom: true, couleur: true } },
          },
        })
      : [];
    const filleulsMap = new Map([
      ...membre.filleuls.map((f) => [f.id, f] as const),
      ...positionFilleuls.map((f) => [f.id, f] as const),
    ]);


    const currentMatrix = membre.matrices.find((m) => m.mlmLevelId === membre.mlmLevelId);
    const filleulsValides = currentMatrix?.filleulsValides ?? 0;
    const filleulsRequis = membre.level.filleulsRequis ?? 4;

    // Commissions by statut
    const commissionsByStatut = membre.commissionsRecues.reduce(
      (acc, c) => {
        const key = c.statut as string;
        if (!acc[key]) acc[key] = { count: 0, montant: 0 };
        acc[key].count++;
        acc[key].montant += Number(c.montant);
        return acc;
      },
      {} as Record<string, { count: number; montant: number }>,
    );

    // Crown Ambassadeur global progression (level 8 = max)
    const progressionGlobale = Math.round((membre.level.ordre / 8) * 100);

    return {
      membre: {
        id: membre.id,
        matricule: membre.matricule,
        statut: membre.statut,
        dateActivation: membre.dateActivation,
        dateInscription: membre.dateInscription,
        client: membre.client,
        level: {
          ...membre.level,
          commissionParFilleul: Number(membre.level.commissionParFilleul),
          commissionTotale: Number(membre.level.commissionTotale),
          salaireMensuel: Number(membre.level.salaireMensuel),
        },
        parrain: membre.parrain
          ? {
              id: membre.parrain.id,
              matricule: membre.parrain.matricule,
              client: membre.parrain.client,
              level: membre.parrain.level,
            }
          : null,
      },
      progression: {
        filleulsValidesNiveauActuel: filleulsValides,
        filleulsRequis,
        filleulsRestants: Math.max(0, filleulsRequis - filleulsValides),
        prochainNiveau: nextLevel
          ? {
              ...nextLevel,
              commissionParFilleul: Number(nextLevel.commissionParFilleul),
              commissionTotale: Number(nextLevel.commissionTotale),
            }
          : null,
        pourcentage: Math.min(100, Math.round((filleulsValides / filleulsRequis) * 100)),
        progressionGlobaleCrownAmbassadeur: progressionGlobale,
        estCrownAmbassadeur: membre.level.ordre === 8,
      },
      portefeuille: membre.portefeuille
        ? {
            soldeDisponible: Number(membre.portefeuille.soldeDisponible),
            totalGagne: Number(membre.portefeuille.totalGagne),
          }
        : null,
      filleuls: membre.filleuls.map((f) => {
        const fm = f.matrices[0];
        return {
          id: f.id,
          matricule: f.matricule,
          statut: f.statut,
          dateActivation: f.dateActivation,
          dateInscription: f.dateInscription,
          client: f.client,
          level: f.level,
          nbFilleuls: f._count.filleuls,
          progression: fm
            ? {
                filleulsValides: fm.filleulsValides,
                filleulsRequis: 4,
                pourcentage: Math.min(100, Math.round((fm.filleulsValides / 4) * 100)),
                estComplete: fm.estComplete,
              }
            : null,
        };
      }),
      matrices: membre.matrices.map((m) => ({
        id: m.id,
        niveau: {
          ...m.level,
          commissionParFilleul: Number(m.level.commissionParFilleul),
          commissionTotale: Number(m.level.commissionTotale),
        },
        filleulsValides: m.filleulsValides,
        estComplete: m.estComplete,
        dateComplete: m.dateComplete,
        positions: m.positions.map((pos) => {
          const filleulData = pos.filleulId ? filleulsMap.get(pos.filleulId) : null;
          return {
            ...pos,
            filleul: filleulData
              ? {
                  id: filleulData.id,
                  matricule: filleulData.matricule,
                  statut: filleulData.statut,
                  client: filleulData.client,
                  level: filleulData.level,
                }
              : null,
          };
        }),
      })),
      commissions: membre.commissionsRecues.map((c) => ({
        ...c,
        montant: Number(c.montant),
      })),
      commissionsByStatut,
      bonusAttribues: membre.bonusAttribues,
      bonusRetraites: membre.bonusRetraites.map((b) => ({
        ...b,
        montant: Number(b.montant),
      })),
      salaires: membre.salairesVerses.map((s) => ({
        ...s,
        montant: Number(s.montant),
      })),
      historiquePromotions: membre.promotions.map((p) => ({
        ...p,
        commissionVersee: Number(p.commissionVersee),
      })),
    };
  }

  // ── Member filleuls ─────────────────────────────────────────────────────────

  async getMemberFilleuls(memberId: string) {
    const membre = await this.prisma.membre.findUnique({
      where: { id: memberId },
      include: { _count: { select: { filleuls: true } } }
    });

    if (!membre) throw new NotFoundException(`Membre ${memberId} introuvable`);

    let currentGenerationIds = [membre.id];
    let depth = 1;
    const maxDepth = 10;
    const allDescendants: any[] = [];

    while (currentGenerationIds.length > 0 && depth <= maxDepth) {
      const filleuls = await this.prisma.membre.findMany({
        where: { parrainId: { in: currentGenerationIds } },
        include: {
          client: { select: { id: true, prenom: true, nom: true, telephone: true } },
          level: { select: { id: true, ordre: true, nom: true, couleur: true } },
          matrices: {
            select: { mlmLevelId: true, filleulsValides: true, estComplete: true },
            orderBy: { level: { ordre: 'desc' } },
            take: 1,
          },
          _count: { select: { filleuls: true } },
        },
        orderBy: { dateActivation: 'desc' },
      });

      if (filleuls.length === 0) break;

      for (const f of filleuls) {
        allDescendants.push({ ...f, generation: depth });
      }

      currentGenerationIds = filleuls.map(f => f.id);
      depth++;
    }

    const filleulsActifs = allDescendants.filter((f) => f.statut === 'ACTIF').length;
    const filleulsEnAttente = allDescendants.filter((f) => f.statut === 'EN_ATTENTE').length;

    return {
      totalFilleuls: allDescendants.length,
      filleulsActifs,
      filleulsEnAttente,
      filleuls: allDescendants.map((f) => {
        const fm = f.matrices[0];
        return {
          id: f.id,
          matricule: f.matricule,
          statut: f.statut,
          dateActivation: f.dateActivation,
          dateInscription: f.dateInscription,
          client: f.client,
          level: f.level,
          nbFilleuls: f._count.filleuls,
          generation: f.generation,
          progression: fm
            ? {
                filleulsValides: fm.filleulsValides,
                filleulsRequis: 4,
                pourcentage: Math.min(100, Math.round((fm.filleulsValides / 4) * 100)),
                estComplete: fm.estComplete,
              }
            : null,
        };
      }),
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
    parrainId?: string;
    search?: string;
  }) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.MembreWhereInput = {};
    if (params.statut) where.statut = params.statut as any;
    if (params.levelId) where.mlmLevelId = params.levelId;
    if (params.parrainId) where.parrainId = params.parrainId;
    if (params.search) {
      where.OR = [
        { matricule: { contains: params.search, mode: 'insensitive' } },
        { client: { nom: { contains: params.search, mode: 'insensitive' } } },
        { client: { prenom: { contains: params.search, mode: 'insensitive' } } },
        { client: { telephone: { contains: params.search } } },
      ];
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
          parrain: {
            include: {
              client: { select: { id: true, prenom: true, nom: true } },
            },
          },
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
        parrain: m.parrain
          ? { id: m.parrain.id, matricule: m.parrain.matricule, client: m.parrain.client }
          : null,
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

    // Fetch level names
    const levelIds = [...new Set([
      ...promotions.map((p) => p.niveauAvantId),
      ...promotions.map((p) => p.niveauApresId),
    ])];
    const levels = await this.prisma.mlmLevel.findMany({
      where: { id: { in: levelIds } },
      select: { id: true, ordre: true, nom: true, couleur: true },
    });
    const levelsMap = new Map(levels.map((l) => [l.id, l]));

    return promotions.map((p) => ({
      ...p,
      commissionVersee: Number(p.commissionVersee),
      niveauAvant: levelsMap.get(p.niveauAvantId) ?? null,
      niveauApres: levelsMap.get(p.niveauApresId) ?? null,
    }));
  }
}
