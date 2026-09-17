CREATE TABLE "client_parrain_attributions" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "parrainClientId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "client_parrain_attributions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "client_parrain_attributions_clientId_key" ON "client_parrain_attributions"("clientId");
CREATE INDEX "client_parrain_attributions_parrainClientId_idx" ON "client_parrain_attributions"("parrainClientId");

ALTER TABLE "client_parrain_attributions" ADD CONSTRAINT "client_parrain_attributions_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "client_parrain_attributions" ADD CONSTRAINT "client_parrain_attributions_parrainClientId_fkey"
  FOREIGN KEY ("parrainClientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "client_parrain_attributions" ADD CONSTRAINT "client_parrain_attributions_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "utilisateurs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
