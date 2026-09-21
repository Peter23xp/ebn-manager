import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { generationCapacity } from './mlm-generation';
import { CommissionBudget, money, progressiveAmounts, PROGRESSIVE_POLICY } from './mlm-progressive';

export interface ProgressiveEvent {
  id: string;
  actorId?: string;
  triggerId?: string;
  positionId?: string;
  origin: 'PROGRESSIVE' | 'CATCH_UP';
}

export class MlmProgressiveService {
  async preview(tx: Prisma.TransactionClient, matrixId: string) {
    return (await this.inspect(tx, matrixId)).preview;
  }

  private async inspect(tx: Prisma.TransactionClient, matrixId: string) {
    const matrix = await tx.matrix.findUniqueOrThrow({ where: { id: matrixId }, include: { level: true } });
    const capacity = generationCapacity(matrix.level.ordre);
    let accounted = matrix.commissionAccountedPositions;
    const initialized = matrix.commissionPolicyVersion !== null;
    if (initialized && matrix.commissionPolicyVersion !== PROGRESSIVE_POLICY) throw new ConflictException('Politique de commission inconnue');
    if (!Number.isSafeInteger(accounted) || accounted < 0 || accounted > capacity
      || !Number.isSafeInteger(matrix.filleulsValides) || matrix.filleulsValides < 0 || matrix.filleulsValides > capacity) {
      throw new ConflictException('Compteur financier de generation incoherent');
    }
    const budgetParts = [matrix.commissionBudgetTotal, matrix.commissionBudgetImmediate, matrix.commissionBudgetHeld];
    if ((initialized && budgetParts.some(part => part === null)) || (!initialized && (accounted !== 0 || budgetParts.some(part => part !== null)))) {
      throw new ConflictException('Initialisation financiere incomplete');
    }
    let budget: CommissionBudget = initialized
      ? { total: matrix.commissionBudgetTotal, immediate: matrix.commissionBudgetImmediate, held: matrix.commissionBudgetHeld }
      : { total: matrix.level.commissionTotale, immediate: matrix.level.commissionSysteme, held: matrix.level.commissionRetour };
    let rewardedAt = matrix.generationRewardedAt;
    const where = { membreId: matrix.membreId, mlmLevelId: matrix.mlmLevelId };
    const rows = await tx.commission.findMany({ where, orderBy: [{ progressTo: 'asc' }, { id: 'asc' }], take: 256 });
    let pageSize = rows.length;
    while (pageSize === 256) {
      const page = await tx.commission.findMany({ where, orderBy: [{ progressTo: 'asc' }, { id: 'asc' }], take: 256, cursor: { id: rows[rows.length - 1].id }, skip: 1 });
      rows.push(...page);
      pageSize = page.length;
    }
    const legacy = rows.filter(row => row.progressTo === null);
    if (legacy.length > 1 || legacy.some(row => row.referenceId !== `generation:${matrix.membreId}:${matrix.mlmLevelId}` || row.progressFrom !== null)) {
      throw new ConflictException('Historique des commissions ambigu : revue manuelle requise');
    }
    if (legacy.length) {
      const previous = legacy[0];
      if (rows.length !== 1 || (previous.matrixId && previous.matrixId !== matrix.id)) throw new ConflictException('Historique financier duplique');
      const previousBudget = { total: previous.montant, immediate: previous.montantSysteme, held: previous.montantRetour };
      progressiveAmounts(previousBudget, capacity, 0, capacity);
      if (initialized && (accounted !== capacity || !money(budget.total).eq(previous.montant)
        || !money(budget.immediate).eq(previous.montantSysteme) || !money(budget.held).eq(previous.montantRetour))) {
        throw new ConflictException('Historique et budget fige incoherents');
      }
      budget = previousBudget;
      accounted = capacity;
      rewardedAt = rewardedAt ?? previous.createdAt;
    }
    if (!initialized) {
      if (rows.some(row => row.progressTo !== null)) throw new ConflictException('Historique progressif sans budget fige');
      const promotions = await tx.promotion.findMany({ where: { membreId: matrix.membreId, niveauApresId: matrix.mlmLevelId }, take: 2 });
      const bonuses = await tx.bonusAttribue.findMany({ where: { membreId: matrix.membreId, mlmLevelId: matrix.mlmLevelId }, take: 2 });
      if (promotions.length > 1 || (legacy.length && promotions.length !== 1)
        || (!legacy.length && !rewardedAt && (promotions.length || bonuses.length))
        || bonuses.length > 1 || (legacy.length && matrix.level.bonusDescription && !bonuses.length)) {
        throw new ConflictException('Historique des promotions ambigu : revue manuelle requise');
      }
    }
    progressiveAmounts(budget, capacity, 0, 0);
    const validateRow = (row: typeof rows[number]) => {
      if (row.matrixId !== matrix.id || row.calculationVersion !== PROGRESSIVE_POLICY
        || !['PROGRESSIVE', 'CATCH_UP'].includes(row.origin) || !row.generationEventId
        || row.progressFrom === null || row.progressTo === null || row.progressFrom >= row.progressTo
        || row.progressTo > accounted || row.referenceId !== `generation-progress:${matrix.id}:${row.progressTo}:${PROGRESSIVE_POLICY}`) {
        throw new ConflictException('Historique des tranches incoherent');
      }
      const expected = progressiveAmounts(budget, capacity, row.progressFrom, row.progressTo);
      if (!expected.total.eq(row.montant) || !expected.immediate.eq(row.montantSysteme) || !expected.held.eq(row.montantRetour)) {
        throw new ConflictException('Montants historiques de tranche incoherents');
      }
    };
    if (!legacy.length) {
      let previousTo = 0;
      for (const row of rows) {
        validateRow(row);
        if (row.progressFrom < previousTo || !progressiveAmounts(budget, capacity, previousTo, row.progressFrom).total.isZero()) {
          throw new ConflictException('Historique des plages incomplet ou chevauchant');
        }
        previousTo = row.progressTo;
      }
      if (!progressiveAmounts(budget, capacity, previousTo, accounted).total.isZero()) throw new ConflictException('Progression comptabilisee sans commission');
    }
    const target = matrix.level.isActive ? Math.max(accounted, matrix.filleulsValides) : accounted;
    const proposed = progressiveAmounts(budget, capacity, accounted, target);
    const preview = {
      matrixId: matrix.id, memberId: matrix.membreId, levelId: matrix.mlmLevelId,
      generation: matrix.level.ordre, levelName: matrix.level.nom, capacity,
      currentValidPositions: matrix.filleulsValides, accountedPositions: accounted,
      from: accounted, to: target, initialized,
      budget: { total: money(budget.total).toFixed(2), immediate: money(budget.immediate).toFixed(2), held: money(budget.held).toFixed(2) },
      proposed: { total: proposed.total.toFixed(2), immediate: proposed.immediate.toFixed(2), held: proposed.held.toFixed(2) },
      rewardedAt: rewardedAt?.toISOString() ?? null,
      suspendedReason: matrix.level.isActive ? null : 'Niveau désactivé',
      historyFingerprint: createHash('sha256').update(JSON.stringify(rows)).digest('hex'),
    };
    return { matrix, preview };
  }

  async account(tx: Prisma.TransactionClient, matrixId: string, event: ProgressiveEvent) {
    if (!event.id?.trim() || !['PROGRESSIVE', 'CATCH_UP'].includes(event.origin)) throw new BadRequestException('Evenement financier requis');
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(604008)`;
    const { matrix, preview } = await this.inspect(tx, matrixId);
    const initializeLegacy = !preview.initialized && preview.accountedPositions > 0;
    if (preview.to === preview.from && !initializeLegacy) return null;
    const amounts = progressiveAmounts(preview.budget, preview.capacity, preview.from, preview.to);
    const commission = amounts.total.gt(0) ? await tx.commission.create({ data: {
      membreId: matrix.membreId, mlmLevelId: matrix.mlmLevelId, matrixId,
      filleulId: event.triggerId ?? null, positionId: event.positionId,
      montant: amounts.total, montantSysteme: amounts.immediate, montantRetour: amounts.held,
      statut: 'EN_ATTENTE', progressFrom: preview.from, progressTo: preview.to,
      referenceId: `generation-progress:${matrixId}:${preview.to}:${PROGRESSIVE_POLICY}`,
      calculationVersion: PROGRESSIVE_POLICY, generationEventId: event.id, generationActorId: event.actorId,
      origin: event.origin,
      description: `${event.origin === 'CATCH_UP' ? 'Rattrapage de génération' : 'Progression de génération'} ${preview.generation} — ${preview.levelName} : ${preview.from + 1}–${preview.to}/${preview.capacity}`,
    } }) : null;
    await tx.matrix.update({ where: { id: matrixId }, data: {
      commissionAccountedPositions: preview.to,
      commissionBudgetTotal: new Prisma.Decimal(preview.budget.total),
      commissionBudgetImmediate: new Prisma.Decimal(preview.budget.immediate),
      commissionBudgetHeld: new Prisma.Decimal(preview.budget.held),
      commissionPolicyVersion: PROGRESSIVE_POLICY, commissionAccountedAt: new Date(),
      generationRewardedAt: preview.rewardedAt ? new Date(preview.rewardedAt) : matrix.generationRewardedAt,
    } });
    return commission;
  }
}
