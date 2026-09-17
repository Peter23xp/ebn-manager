CREATE TYPE "HoldStatus" AS ENUM ('HOLD_PERIOD', 'RELEASABLE', 'RELEASED', 'CANCELLED');
ALTER TABLE "membres" ADD COLUMN "highestLevelAchieved" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "totalDescendants" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "matrices" ADD COLUMN "occupiedPositions" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "positions_filleulId_key" ON "positions"("filleulId");
ALTER TABLE "positions" ADD CONSTRAINT "positions_filleulId_fkey" FOREIGN KEY ("filleulId") REFERENCES "membres"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "positions" ADD CONSTRAINT "positions_slot_check" CHECK ("numeroPosition" BETWEEN 1 AND 4);

CREATE TABLE "placement_history" (
  "id" TEXT NOT NULL PRIMARY KEY, "memberId" TEXT NOT NULL, "recruiterId" TEXT,
  "oldParentId" TEXT, "newParentId" TEXT, "oldPosition" INTEGER, "newPosition" INTEGER,
  "actorId" TEXT, "reason" TEXT NOT NULL, "operationId" TEXT NOT NULL,
  "operationType" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "placement_history_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "membres"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "placement_history_operationId_memberId_key" ON "placement_history"("operationId", "memberId");
CREATE INDEX "placement_history_memberId_createdAt_idx" ON "placement_history"("memberId", "createdAt");

ALTER TABLE "commissions" ADD COLUMN "matrixId" TEXT, ADD COLUMN "positionId" TEXT, ADD COLUMN "validatedById" TEXT;
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_matrixId_fkey" FOREIGN KEY ("matrixId") REFERENCES "matrices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "commissions" ADD CONSTRAINT "commission_generation_amounts_check" CHECK (
  "matrixId" IS NULL OR ("montant" = "montantSysteme" + "montantRetour" AND "montantSysteme" >= 0 AND "montantRetour" >= 0)
);

ALTER TABLE "reinvest_lots" RENAME COLUMN "releasedAt" TO "releaseDate";
ALTER TABLE "reinvest_lots" ADD COLUMN "releasedAt" TIMESTAMP(3),
  ADD COLUMN "status" "HoldStatus" NOT NULL DEFAULT 'HOLD_PERIOD',
  ADD COLUMN "calendarVersion" TEXT, ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'Africa/Lubumbashi',
  ADD COLUMN "releasedById" TEXT;
UPDATE "reinvest_lots" SET "status" = 'RELEASED' WHERE "released" = true;
DROP INDEX "reinvest_lots_released_releasedAt_idx";
CREATE INDEX "reinvest_lots_status_releaseDate_idx" ON "reinvest_lots"("status", "releaseDate");
CREATE UNIQUE INDEX "reinvest_lots_commissionId_key" ON "reinvest_lots"("commissionId");
ALTER TABLE "reinvest_lots" ADD CONSTRAINT "reinvest_lots_commissionId_fkey" FOREIGN KEY ("commissionId") REFERENCES "commissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "mlm_calendar_years" (
  "id" TEXT NOT NULL PRIMARY KEY, "year" INTEGER NOT NULL, "holidays" JSONB NOT NULL,
  "version" TEXT NOT NULL, "source" TEXT NOT NULL, "timezone" TEXT NOT NULL DEFAULT 'Africa/Lubumbashi',
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "mlm_calendar_years_year_key" ON "mlm_calendar_years"("year");

CREATE FUNCTION enforce_matrix_position() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_id TEXT; generation INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(604008);
  SELECT matrix."membreId", level.ordre INTO parent_id, generation
    FROM matrices matrix JOIN mlm_levels level ON level.id = matrix."mlmLevelId" WHERE matrix.id = NEW."matrixId";
  IF generation IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'Positions belong to generation one only'; END IF;
  IF NEW."filleulId" IS NOT NULL THEN
    IF NEW."filleulId" = parent_id OR EXISTS (
      WITH RECURSIVE ancestors(id) AS (
        SELECT parent_id UNION
        SELECT matrix."membreId" FROM ancestors ancestor
        JOIN positions position ON position."filleulId" = ancestor.id
        JOIN matrices matrix ON matrix.id = position."matrixId"
      ) SELECT 1 FROM ancestors WHERE id = NEW."filleulId"
    ) THEN RAISE EXCEPTION 'Matrix cycle rejected'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER positions_tree_check BEFORE INSERT OR UPDATE ON positions FOR EACH ROW EXECUTE FUNCTION enforce_matrix_position();

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM positions position JOIN matrices matrix ON matrix.id = position."matrixId"
    JOIN mlm_levels level ON level.id = matrix."mlmLevelId" WHERE level.ordre <> 1)
  THEN RAISE EXCEPTION 'Historical multi-level positions require an audited conversion or approved backed-up purge'; END IF;
  IF EXISTS (
    WITH RECURSIVE paths(origin, id, path, cycle) AS (
      SELECT "filleulId", matrix."membreId", ARRAY["filleulId"], false FROM positions position
        JOIN matrices matrix ON matrix.id = position."matrixId" WHERE "filleulId" IS NOT NULL
      UNION ALL
      SELECT paths.origin, matrix."membreId", paths.path || paths.id, paths.id = ANY(paths.path)
        FROM paths JOIN positions position ON position."filleulId" = paths.id
        JOIN matrices matrix ON matrix.id = position."matrixId" WHERE NOT paths.cycle
    ) SELECT 1 FROM paths WHERE cycle
  ) THEN RAISE EXCEPTION 'Historical matrix cycle requires audited correction'; END IF;
END $$;

CREATE FUNCTION reject_placement_history_changes() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Placement history is append-only'; END;
$$;
CREATE TRIGGER placement_history_immutable BEFORE UPDATE OR DELETE ON placement_history FOR EACH ROW EXECUTE FUNCTION reject_placement_history_changes();
