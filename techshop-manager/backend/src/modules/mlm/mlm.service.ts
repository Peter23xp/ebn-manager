import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { IsBoolean, IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';
import { generationCapacity, generationProgress } from './mlm-generation';
import { commissionAmounts } from './mlm-finance';
import { MlmWalletService } from './mlm-wallet.service';
import { StaffActor } from '../../common/access/staff-access';
import { requireFinancialMemberAccess } from './mlm-financial-access';

// ── Constants ─────────────────────────────────────────────────────────────────

export const MLM_LEVELS_COUNT = 8;

// ── DTOs ──────────────────────────────────────────────────────────────────────

export class UpdateMlmConfigDto {
  @IsInt() @Min(1) levelId: number;
  @IsOptional() @IsString() @Matches(/^\d+(\.\d{1,2})?$/) immediateAmount?: string;
  @IsOptional() @IsString() bonusDescription?: string;
  @IsOptional() @IsString() @Matches(/^\d+(\.\d{1,2})?$/) salaireMensuel?: string;
  @IsOptional() @IsBoolean() salaireActif?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

@Injectable()
export class MlmService {
  constructor(private readonly prisma: PrismaService, private readonly walletService: MlmWalletService) {}

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
      commissionsGenerated,
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
        _sum: { montant: true, montantSysteme: true },
      }),
      this.prisma.commission.aggregate({
        where: { statut: { not: 'ANNULEE' } },
        _sum: { montant: true },
      }),
    ]);

    return {
      totalMembres,
      membresActifs,
      membresEnAttente,
      commissionsGenerees: Number(commissionsGenerated._sum.montant ?? 0),
      totalCommissionsVerseesUSD: Number(commissionsTotalesValidees._sum.montantSysteme ?? 0),
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

  // ── Comptes de notification (cloche header) ─────────────────────────────────

  /**
   * Éléments concrets sur lesquels un gérant+ a une action à faire :
   * demandes de retrait en attente, bonus physiques à livrer,
   * réclamations de filleuls en attente de rattachement.
   */
  async getNotificationCounts() {
    const [retraits, bonus, reclamations] = await Promise.all([
      this.prisma.withdrawalRequest.count({ where: { statut: 'EN_ATTENTE' } }),
      this.prisma.bonusAttribue.count({ where: { statut: 'EN_ATTENTE' } }),
      this.prisma.parrainClaim.count({ where: { statut: 'EN_ATTENTE' } }),
    ]);

    return {
      retraitsEnAttente: retraits,
      bonusALivrer: bonus,
      reclamationsEnAttente: reclamations,
      total: retraits + bonus + reclamations,
    };
  }

  // ── Members by level ────────────────────────────────────────────────────────

  async getMembersByLevel() {
    const levels = await this.prisma.mlmLevel.findMany({
      orderBy: { ordre: 'asc' },
      include: {
        _count: { select: { membres: { where: { statut: 'ACTIF', matrices: { some: { level: { ordre: 1 }, estComplete: true } } } } } },
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
      immediateAmount: l.commissionSysteme.toFixed(2),
      heldAmount: l.commissionRetour.toFixed(2),
      totalAmount: l.commissionTotale.toFixed(2),
      requiredPositions: generationCapacity(l.ordre),
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

  async getMemberProgress(memberId: string, actor?: StaffActor) {
    if (actor) await requireFinancialMemberAccess(this.prisma, memberId, actor);
    const membre = await this.prisma.membre.findUnique({
      where: { id: memberId },
      include: {
        client: { select: { id: true, prenom: true, nom: true, telephone: true, statut: true } },
        level: true,
        _count: { select: { filleuls: true } },
        matrixPosition: { include: { matrix: { include: { membre: { include: { client: { select: { nom: true, prenom: true } } } } } } } },
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
              include: { level: true },
              orderBy: { level: { ordre: 'asc' } },
            },
            _count: { select: { filleuls: true } },
          },
          orderBy: { dateActivation: 'desc' },
          take: 100,
        },
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
            reinvestLot: true,
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

    const levels = await this.prisma.mlmLevel.findMany({ orderBy: { ordre: 'asc' } });
    const progress = generationProgress(levels, membre.matrices.map(matrix => ({ ordre: matrix.level.ordre, count: matrix.filleulsValides })), membre.highestLevelAchieved);
    const nextLevel = progress.nextLevel;
    const wallet = await this.walletService.getWallet(memberId).catch(error => {
      if (error instanceof NotFoundException) return null;
      throw error;
    });
    const financialSummary = wallet?.financialSummary;
    const reinvestLots = wallet?.reinvestLots ?? [];
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


    const directMatrix = membre.matrices.find(matrix => matrix.level.ordre === 1);
    const filleulsValides = progress.completedPositions;
    const filleulsRequis = progress.requiredPositions;

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
    const progressionGlobale = Math.round(((progress.currentLevel?.ordre ?? 0) / 8) * 100);

    return {
      membre: {
        id: membre.id,
        matricule: membre.matricule,
        statut: membre.statut,
        dateActivation: membre.dateActivation,
        dateInscription: membre.dateInscription,
        client: membre.client,
        currentLevel: progress.currentLevel,
        recruiter: membre.parrain,
        matrixParent: membre.matrixPosition?.matrix.membre ?? null,
        position: membre.matrixPosition?.numeroPosition ?? null,
        positionId: membre.matrixPosition?.id ?? null,
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
        ...progress,
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
        estCrownAmbassadeur: progress.currentLevel?.ordre === 8,
      },
      portefeuille: wallet
        ? {
            soldeDisponible: wallet.soldeDisponible,
            totalGagne: wallet.totalGagne,
          }
        : null,
      filleuls: membre.filleuls.map((f) => {
        const childProgress = generationProgress(levels, f.matrices.map(matrix => ({ ordre: matrix.level.ordre, count: matrix.filleulsValides })), f.highestLevelAchieved);
        return {
          id: f.id,
          matricule: f.matricule,
          statut: f.statut,
          dateActivation: f.dateActivation,
          dateInscription: f.dateInscription,
          client: f.client,
          level: f.level,
          currentLevel: childProgress.currentLevel,
          nbFilleuls: f._count.filleuls,
          progression: {
            ...childProgress, filleulsValides: childProgress.completedPositions,
            filleulsRequis: childProgress.requiredPositions, pourcentage: childProgress.progressPercentage,
          },
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
        requiredPositions: generationCapacity(m.level.ordre),
        occupiedPositions: m.occupiedPositions,
        remainingPositions: generationCapacity(m.level.ordre) - m.filleulsValides,
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
        montant: new Prisma.Decimal(c.montant).toFixed(2),
        montantSysteme: new Prisma.Decimal(c.montantSysteme ?? 0).toFixed(2),
        montantRetour: new Prisma.Decimal(c.montantRetour ?? 0).toFixed(2),
        reinvestLot: c.reinvestLot ? {
          ...c.reinvestLot,
          amount: c.reinvestLot.amount.toFixed(2),
          releaseDate: c.reinvestLot.releaseDate.toISOString(),
          releasedAt: c.reinvestLot.releasedAt?.toISOString() ?? null,
        } : null,
      })),
      commissionsByStatut,
      financialSummary,
      progressiveCommissions: wallet?.progressiveCommissions ?? [],
      reinvestLots,
      directMatrixChildrenCount: directMatrix?.occupiedPositions ?? 0,
      personalRecruitCount: membre._count.filleuls,
      totalDescendants: membre.totalDescendants,
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

  async getMemberFilleuls(memberId: string, page = 1, limit = 20) {
    const member = await this.prisma.membre.findUnique({ where: { id: memberId }, select: { id: true } });
    if (!member) throw new NotFoundException('Membre introuvable');
    page = Math.max(1, page); limit = Math.min(100, Math.max(1, limit));
    const where = { parrainId: memberId };
    const [members, total, active, pending, levels] = await Promise.all([
      this.prisma.membre.findMany({
        where, take: limit, skip: (page - 1) * limit, orderBy: [{ dateActivation: 'desc' }, { id: 'asc' }],
        include: {
          client: { select: { id: true, prenom: true, nom: true, telephone: true } }, level: true,
          matrices: { include: { level: true } }, _count: { select: { filleuls: true } },
          matrixPosition: { include: { matrix: { select: { membreId: true } } } },
        },
      }),
      this.prisma.membre.count({ where }),
      this.prisma.membre.count({ where: { ...where, statut: 'ACTIF' } }),
      this.prisma.membre.count({ where: { ...where, statut: 'EN_ATTENTE' } }),
      this.prisma.mlmLevel.findMany({ orderBy: { ordre: 'asc' } }),
    ]);
    return {
      totalFilleuls: total, filleulsActifs: active, filleulsEnAttente: pending,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      filleuls: members.map(member => {
        const progress = generationProgress(levels, member.matrices.map(matrix => ({ ordre: matrix.level.ordre, count: matrix.filleulsValides })), member.highestLevelAchieved);
        return {
          id: member.id, matricule: member.matricule, statut: member.statut, client: member.client,
          dateActivation: member.dateActivation, dateInscription: member.dateInscription,
          level: member.level, currentLevel: progress.currentLevel, nbFilleuls: member._count.filleuls,
          recruiterId: member.parrainId, matrixParentId: member.matrixPosition?.matrix.membreId ?? null,
          position: member.matrixPosition?.numeroPosition ?? null,
          progression: { ...progress, filleulsValides: progress.completedPositions, filleulsRequis: progress.requiredPositions, pourcentage: progress.progressPercentage },
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
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 20));

    const where: Prisma.MembreWhereInput = {};
    if (params.statut) where.statut = params.statut as any;
    if (params.levelId) {
      where.mlmLevelId = params.levelId;
      where.matrices = { some: { mlmLevelId: params.levelId, estComplete: true } };
    }
    if (params.parrainId) where.parrainId = params.parrainId;
    if (params.search) {
      where.OR = [
        { matricule: { contains: params.search, mode: 'insensitive' } },
        { client: { nom: { contains: params.search, mode: 'insensitive' } } },
        { client: { prenom: { contains: params.search, mode: 'insensitive' } } },
        { client: { telephone: { contains: params.search } } },
      ];
    }

    return this.prisma.$transaction(
      tx => this.readMembersList(where, page, limit, tx),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  private async readMembersList(where: Prisma.MembreWhereInput, page: number, limit: number, tx: Prisma.TransactionClient) {
    const skip = (page - 1) * limit;
    const [membres, total] = await Promise.all([
      tx.membre.findMany({
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
          portefeuille: { select: { soldeDisponible: true, soldeReserve: true, totalGagne: true } },
          _count: { select: { filleuls: true } },
          matrices: { include: { level: true } },
          matrixPosition: { include: { matrix: { select: {
            membreId: true,
            membre: { select: { id: true, matricule: true, client: { select: { id: true, prenom: true, nom: true } } } },
          } } } },
        },
      }),
      tx.membre.count({ where }),
    ]);

    const commissionGroups = membres.length ? await tx.commission.groupBy({
      by: ['membreId', 'statut'],
      where: { membreId: { in: membres.map(member => member.id) }, statut: { not: 'ANNULEE' } },
      _sum: { montant: true },
    }) : [];
    const commissionSummaries = new Map<string, { generatedTotal: Prisma.Decimal; pendingTotal: Prisma.Decimal; validatedTotal: Prisma.Decimal }>();
    for (const group of commissionGroups) {
      const summary = commissionSummaries.get(group.membreId) ?? {
        generatedTotal: new Prisma.Decimal(0), pendingTotal: new Prisma.Decimal(0), validatedTotal: new Prisma.Decimal(0),
      };
      const amount = group._sum.montant ?? new Prisma.Decimal(0);
      summary.generatedTotal = summary.generatedTotal.plus(amount);
      if (group.statut === 'EN_ATTENTE') summary.pendingTotal = summary.pendingTotal.plus(amount);
      if (group.statut === 'VALIDEE' || group.statut === 'PAYEE') summary.validatedTotal = summary.validatedTotal.plus(amount);
      commissionSummaries.set(group.membreId, summary);
    }

    const levels = await tx.mlmLevel.findMany({ orderBy: { ordre: 'asc' } });
    return {
      membres: membres.map((m) => ({
        id: m.id,
        matricule: m.matricule,
        statut: m.statut,
        dateActivation: m.dateActivation,
        client: m.client,
        level: m.level,
        currentLevel: generationProgress(levels, m.matrices.map(matrix => ({ ordre: matrix.level.ordre, count: matrix.filleulsValides })), m.highestLevelAchieved).currentLevel,
        progression: generationProgress(levels, m.matrices.map(matrix => ({ ordre: matrix.level.ordre, count: matrix.filleulsValides })), m.highestLevelAchieved),
        matrixParentId: m.matrixPosition?.matrix.membreId ?? null,
        matrixParent: m.matrixPosition?.matrix.membre ?? null,
        position: m.matrixPosition?.numeroPosition ?? null,
        positionId: m.matrixPosition?.id ?? null,
        directMatrixChildrenCount: m.matrices.find(matrix => matrix.level.ordre === 1)?.occupiedPositions ?? 0,
        personalRecruitCount: m._count.filleuls,
        totalDescendants: m.totalDescendants,
        parrain: m.parrain
          ? { id: m.parrain.id, matricule: m.parrain.matricule, client: m.parrain.client }
          : null,
        portefeuille: m.portefeuille
          ? {
              soldeDisponible: Number(m.portefeuille.soldeDisponible),
              soldeDisponibleRetrait: new Prisma.Decimal(m.portefeuille.soldeDisponible).minus(m.portefeuille.soldeReserve).toNumber(),
              totalGagne: Number(m.portefeuille.totalGagne),
            }
          : null,
        nbFilleuls: m._count.filleuls,
        commissionSummary: {
          generatedTotal: commissionSummaries.get(m.id)?.generatedTotal.toFixed(2) ?? '0.00',
          pendingTotal: commissionSummaries.get(m.id)?.pendingTotal.toFixed(2) ?? '0.00',
          validatedTotal: commissionSummaries.get(m.id)?.validatedTotal.toFixed(2) ?? '0.00',
        },
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
    const levels = await this.prisma.mlmLevel.findMany({ orderBy: { ordre: 'asc' } });
    return levels.map(level => this.levelConfiguration(level));
  }

  private levelConfiguration(level: any) {
    return {
      ...level, requiredPositions: generationCapacity(level.ordre),
      immediateAmount: new Prisma.Decimal(level.commissionSysteme).toFixed(2),
      heldAmount: new Prisma.Decimal(level.commissionRetour).toFixed(2),
      totalAmount: new Prisma.Decimal(level.commissionTotale).toFixed(2),
      commissionSysteme: Number(level.commissionSysteme), commissionRetour: Number(level.commissionRetour),
      commissionTotale: Number(level.commissionTotale), salaireMensuel: Number(level.salaireMensuel),
    };
  }

  async updateConfig(dto: UpdateMlmConfigDto) {
    if ('commissionParFilleul' in dto || 'commissionTotale' in dto) throw new BadRequestException('Configurer le montant immediat du niveau, pas une commission par filleul');
    const level = await this.prisma.mlmLevel.findUnique({ where: { id: dto.levelId } });
    if (!level) throw new NotFoundException('Niveau introuvable');
    const data: Prisma.MlmLevelUpdateInput = {};
    if (dto.immediateAmount !== undefined) {
      const amounts = commissionAmounts(dto.immediateAmount);
      data.commissionSysteme = amounts.immediate;
      data.commissionRetour = amounts.held;
      data.commissionTotale = amounts.total;
    }
    if (dto.bonusDescription !== undefined) data.bonusDescription = dto.bonusDescription;
    if (dto.salaireMensuel !== undefined) data.salaireMensuel = new Prisma.Decimal(dto.salaireMensuel);
    if (dto.salaireActif !== undefined) data.salaireActif = dto.salaireActif;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    const updated = await this.prisma.mlmLevel.update({ where: { id: dto.levelId }, data });
    return this.levelConfiguration(updated);
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
