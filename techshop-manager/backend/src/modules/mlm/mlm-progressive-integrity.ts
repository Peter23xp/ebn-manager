import { Prisma } from '@prisma/client';
import { PROGRESSIVE_POLICY } from './mlm-progressive';

export function readInvalidProgressiveRanges(tx: Prisma.TransactionClient, memberId: string) {
  return tx.$queryRaw<Array<{ matrixId: string }>>`
    WITH ranges AS (
      SELECT commission.*, matrix.id AS expected_matrix,
        matrix."commissionAccountedPositions" AS accounted,
        matrix."commissionBudgetImmediate" AS immediate_budget,
        matrix."commissionBudgetHeld" AS held_budget,
        power(4::numeric, level.ordre) AS capacity,
        lag(commission."progressTo", 1, 0) OVER (PARTITION BY commission."mlmLevelId" ORDER BY commission."progressTo", commission.id) AS previous_to
      FROM commissions commission
      JOIN matrices matrix ON matrix."membreId" = commission."membreId" AND matrix."mlmLevelId" = commission."mlmLevelId"
      JOIN mlm_levels level ON level.id = matrix."mlmLevelId"
      WHERE commission."membreId" = ${memberId} AND (commission."progressTo" IS NOT NULL OR commission."progressFrom" IS NOT NULL)
    )
    SELECT DISTINCT expected_matrix AS "matrixId" FROM ranges
    WHERE "matrixId" IS DISTINCT FROM expected_matrix
      OR "progressFrom" IS NULL OR "progressTo" IS NULL
      OR "progressFrom" < 0 OR "progressTo" <= "progressFrom" OR "progressTo" > capacity OR "progressTo" > accounted
      OR "progressFrom" < previous_to
      OR "calculationVersion" IS DISTINCT FROM ${PROGRESSIVE_POLICY}
      OR origin IS NULL OR origin NOT IN ('PROGRESSIVE', 'CATCH_UP') OR "generationEventId" IS NULL OR btrim("generationEventId") = ''
      OR "referenceId" <> 'generation-progress:' || expected_matrix || ':' || "progressTo" || ':' || ${PROGRESSIVE_POLICY}
      OR round(immediate_budget * "progressFrom" / capacity, 2) IS DISTINCT FROM round(immediate_budget * previous_to / capacity, 2)
      OR round(held_budget * "progressFrom" / capacity, 2) IS DISTINCT FROM round(held_budget * previous_to / capacity, 2)
      OR "montantSysteme" IS DISTINCT FROM round(immediate_budget * "progressTo" / capacity, 2) - round(immediate_budget * "progressFrom" / capacity, 2)
      OR "montantRetour" IS DISTINCT FROM round(held_budget * "progressTo" / capacity, 2) - round(held_budget * "progressFrom" / capacity, 2)
      OR montant IS DISTINCT FROM "montantSysteme" + "montantRetour"
  `;
}
