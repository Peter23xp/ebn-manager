-- Preserve the sponsor selected during onboarding until client activation.
ALTER TABLE "clients" ADD COLUMN "parrainClientId" TEXT;

CREATE INDEX "clients_parrainClientId_idx" ON "clients"("parrainClientId");

ALTER TABLE "clients"
  ADD CONSTRAINT "clients_parrainClientId_fkey"
  FOREIGN KEY ("parrainClientId") REFERENCES "clients"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
