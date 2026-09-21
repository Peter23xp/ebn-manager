ALTER TABLE "export_jobs"
  ADD COLUMN "ownerId" TEXT,
  ADD COLUMN "scopeRole" "Role",
  ADD COLUMN "scopeActorSiteId" TEXT,
  ADD COLUMN "scopeSiteId" TEXT,
  ADD COLUMN "fileBytes" BYTEA,
  ADD COLUMN "fileName" TEXT,
  ADD COLUMN "mimeType" TEXT,
  ADD COLUMN "fileSize" INTEGER,
  ADD COLUMN "rowCount" INTEGER,
  ADD COLUMN "expiresAt" TIMESTAMP(3);

CREATE INDEX "export_jobs_ownerId_statut_expiresAt_idx" ON "export_jobs"("ownerId", "statut", "expiresAt");
CREATE INDEX "export_jobs_expiresAt_idx" ON "export_jobs"("expiresAt");
