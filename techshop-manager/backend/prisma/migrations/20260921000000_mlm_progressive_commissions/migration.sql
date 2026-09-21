ALTER TABLE "matrices"
  ADD COLUMN "commissionAccountedPositions" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "commissionBudgetTotal" DECIMAL(12,2),
  ADD COLUMN "commissionBudgetImmediate" DECIMAL(12,2),
  ADD COLUMN "commissionBudgetHeld" DECIMAL(12,2),
  ADD COLUMN "commissionPolicyVersion" TEXT,
  ADD COLUMN "commissionAccountedAt" TIMESTAMP(3),
  ADD COLUMN "generationRewardedAt" TIMESTAMP(3),
  ADD CONSTRAINT "matrices_commission_progress_check" CHECK ("commissionAccountedPositions" BETWEEN 0 AND 65536),
  ADD CONSTRAINT "matrices_commission_budget_check" CHECK (
    ("commissionBudgetTotal" IS NULL AND "commissionBudgetImmediate" IS NULL AND "commissionBudgetHeld" IS NULL)
    OR ("commissionBudgetTotal" IS NOT NULL AND "commissionBudgetImmediate" IS NOT NULL AND "commissionBudgetHeld" IS NOT NULL
      AND "commissionBudgetImmediate" >= 0 AND "commissionBudgetHeld" >= 0
      AND "commissionBudgetTotal" = "commissionBudgetImmediate" + "commissionBudgetHeld")
  );

ALTER TABLE "commissions"
  ALTER COLUMN "filleulId" DROP NOT NULL,
  ADD COLUMN "progressFrom" INTEGER,
  ADD COLUMN "progressTo" INTEGER,
  ADD COLUMN "calculationVersion" TEXT,
  ADD COLUMN "generationEventId" TEXT,
  ADD COLUMN "generationActorId" TEXT,
  ADD COLUMN "origin" TEXT,
  ADD CONSTRAINT "commissions_progress_range_check" CHECK (
    ("progressFrom" IS NULL AND "progressTo" IS NULL)
    OR ("progressFrom" IS NOT NULL AND "progressTo" IS NOT NULL AND "matrixId" IS NOT NULL
      AND "progressFrom" >= 0 AND "progressTo" > "progressFrom" AND "progressTo" <= 65536)
  );

CREATE UNIQUE INDEX "commissions_matrixId_progressTo_key" ON "commissions"("matrixId", "progressTo");
CREATE INDEX "commissions_membreId_mlmLevelId_idx" ON "commissions"("membreId", "mlmLevelId");
