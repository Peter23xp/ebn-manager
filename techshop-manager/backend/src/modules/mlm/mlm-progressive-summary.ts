import { Prisma } from '@prisma/client';
import { generationCapacity } from './mlm-generation';
import { money, progressiveAmounts, PROGRESSIVE_POLICY } from './mlm-progressive';
import { readInvalidProgressiveRanges } from './mlm-progressive-integrity';

export async function readProgressiveSummaries(tx: Prisma.TransactionClient, memberId: string) {
  const levels = await tx.mlmLevel.findMany({ orderBy: { ordre: 'asc' } });
  const [matrices, groups, holds, legacyRows, legacyCounts, promotions, bonuses, invalidRanges] = await Promise.all([
    tx.matrix.findMany({ where: { membreId: memberId } }),
    tx.commission.groupBy({ by: ['mlmLevelId', 'statut'], where: { membreId: memberId }, _count: { id: true }, _sum: { montant: true, montantSysteme: true, montantRetour: true } }),
    tx.$queryRaw<Array<{ mlmLevelId: number; status: string; amount: Prisma.Decimal }>>`
      SELECT commission."mlmLevelId", lot.status::text, SUM(lot.amount) AS amount
      FROM reinvest_lots lot JOIN commissions commission ON commission.id = lot."commissionId"
      WHERE lot."membreId" = ${memberId} AND commission."membreId" = ${memberId}
        AND lot.status <> 'CANCELLED' AND commission.statut <> 'ANNULEE'
      GROUP BY commission."mlmLevelId", lot.status
    `,
    tx.commission.findMany({ where: { membreId: memberId, referenceId: { in: levels.map(level => `generation:${memberId}:${level.id}`) } },
      select: { mlmLevelId: true, matrixId: true, progressFrom: true, progressTo: true, referenceId: true, montant: true, montantSysteme: true, montantRetour: true } }),
    tx.commission.groupBy({ by: ['mlmLevelId'], where: { membreId: memberId, progressTo: null }, _count: { id: true } }),
    tx.promotion.groupBy({ by: ['niveauApresId'], where: { membreId: memberId }, _count: { id: true } }),
    tx.bonusAttribue.groupBy({ by: ['mlmLevelId'], where: { membreId: memberId }, _count: { id: true } }),
    readInvalidProgressiveRanges(tx, memberId),
  ]);
  return levels.map(level => {
    const matrix = matrices.find(row => row.mlmLevelId === level.id);
    const capacity = generationCapacity(level.ordre);
    const history = legacyRows.filter(row => row.mlmLevelId === level.id);
    const legacy = history.length === 1 && history[0].referenceId === `generation:${memberId}:${level.id}` ? history[0] : null;
    const initialized = Boolean(matrix?.commissionPolicyVersion);
    const accounted = initialized ? matrix.commissionAccountedPositions : legacy ? capacity : 0;
    const budget = initialized ? { total: matrix.commissionBudgetTotal, immediate: matrix.commissionBudgetImmediate, held: matrix.commissionBudgetHeld }
      : legacy ? { total: legacy.montant, immediate: legacy.montantSysteme, held: legacy.montantRetour }
        : { total: level.commissionTotale, immediate: level.commissionSysteme, held: level.commissionRetour };
    const financial = groups.filter(group => group.mlmLevelId === level.id);
    const count = financial.reduce((total, group) => total + group._count.id, 0);
    const sumAll = (key: 'montant' | 'montantSysteme' | 'montantRetour') => financial.reduce((total, group) => total.plus(group._sum[key] ?? 0), new Prisma.Decimal(0));
    const sum = (statuses: string[], key: 'montant' | 'montantSysteme' = 'montant') => financial.filter(group => statuses.includes(group.statut))
      .reduce((total, group) => total.plus(group._sum[key] ?? 0), new Prisma.Decimal(0)).toFixed(2);
    const hold = (status: string) => new Prisma.Decimal(holds.find(row => row.mlmLevelId === level.id && row.status === status)?.amount ?? 0).toFixed(2);
    let financialState: { accountedPositions: number | null; budgetTotal: string | null; budgetImmediate: string | null; budgetHeld: string | null; remainingTotal: string | null; suspendedReason: string | null };
    try {
      const legacyCount = legacyCounts.find(row => row.mlmLevelId === level.id)?._count.id ?? 0;
      const promotionCount = promotions.find(row => row.niveauApresId === level.id)?._count.id ?? 0;
      const bonusCount = bonuses.find(row => row.mlmLevelId === level.id)?._count.id ?? 0;
      const presentBudget = matrix && [matrix.commissionBudgetTotal, matrix.commissionBudgetImmediate, matrix.commissionBudgetHeld];
      if (matrix && (!Number.isSafeInteger(matrix.filleulsValides) || matrix.filleulsValides < 0 || matrix.filleulsValides > capacity)) throw new Error('INCONSISTENT_CURRENT_POSITIONS');
      if ((initialized && (matrix.commissionPolicyVersion !== PROGRESSIVE_POLICY || presentBudget.some(amount => amount === null)))
        || (!initialized && presentBudget && (presentBudget.some(amount => amount !== null) || matrix.commissionAccountedPositions !== 0))
        || (legacyCount > 0 && (!legacy || legacyCount !== 1 || count !== 1 || legacy.progressFrom !== null || legacy.progressTo !== null || (legacy.matrixId && legacy.matrixId !== matrix?.id)))
        || (!initialized && !legacy && count > 0)
        || (!initialized && ((legacy && promotionCount !== 1) || (!legacy && !matrix?.generationRewardedAt && (promotionCount || bonusCount)) || promotionCount > 1 || bonusCount > 1 || (legacy && level.bonusDescription && !bonusCount)))
        || invalidRanges.some(row => row.matrixId === matrix?.id)) throw new Error('INCONSISTENT_HISTORY');
      if (initialized && legacy && (accounted !== capacity || !money(budget.total).eq(legacy.montant)
        || !money(budget.immediate).eq(legacy.montantSysteme) || !money(budget.held).eq(legacy.montantRetour))) throw new Error('INCONSISTENT_LEGACY_BUDGET');
      const earned = progressiveAmounts(budget, capacity, 0, accounted);
      if (!earned.total.eq(sumAll('montant')) || !earned.immediate.eq(sumAll('montantSysteme')) || !earned.held.eq(sumAll('montantRetour'))) throw new Error('INCONSISTENT_ACCOUNTING');
      financialState = {
        accountedPositions: accounted,
        budgetTotal: money(budget.total).toFixed(2), budgetImmediate: money(budget.immediate).toFixed(2), budgetHeld: money(budget.held).toFixed(2),
        remainingTotal: progressiveAmounts(budget, capacity, accounted, capacity).total.toFixed(2),
        suspendedReason: level.isActive ? null : 'Niveau désactivé',
      };
    } catch {
      financialState = { accountedPositions: null, budgetTotal: null, budgetImmediate: null, budgetHeld: null, remainingTotal: null, suspendedReason: 'Vérification historique requise : droits de cette génération indisponibles. Le portefeuille reste consultable.' };
    }
    return {
      matrixId: matrix?.id ?? null, generation: level.ordre, levelName: level.nom, capacity,
      currentValidPositions: matrix?.filleulsValides ?? 0,
      generatedTotal: sum(['EN_ATTENTE', 'VALIDEE', 'PAYEE']), pendingTotal: sum(['EN_ATTENTE']), validatedTotal: sum(['VALIDEE', 'PAYEE']), cancelledTotal: sum(['ANNULEE']),
      immediateCredited: sum(['VALIDEE', 'PAYEE'], 'montantSysteme'),
      heldAmount: hold('HOLD_PERIOD'), releasableAmount: hold('RELEASABLE'), releasedAmount: hold('RELEASED'),
      ...financialState,
    };
  });
}
