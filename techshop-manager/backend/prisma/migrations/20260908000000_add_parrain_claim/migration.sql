-- CreateEnum
CREATE TYPE "ClaimStatut" AS ENUM ('EN_ATTENTE', 'LIE');

-- CreateTable
CREATE TABLE "parrain_claims" (
    "id" TEXT NOT NULL,
    "filleulClientId" TEXT NOT NULL,
    "parrainClientId" TEXT NOT NULL,
    "statut" "ClaimStatut" NOT NULL DEFAULT 'EN_ATTENTE',
    "telephoneParrainSaisi" TEXT NOT NULL,
    "factureReclamee" TEXT,
    "confirmedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "parrain_claims_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "parrain_claims_filleulClientId_key" ON "parrain_claims"("filleulClientId");

-- CreateIndex
CREATE INDEX "parrain_claims_parrainClientId_statut_idx" ON "parrain_claims"("parrainClientId", "statut");

-- AddForeignKey
ALTER TABLE "parrain_claims" ADD CONSTRAINT "parrain_claims_filleulClientId_fkey" FOREIGN KEY ("filleulClientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parrain_claims" ADD CONSTRAINT "parrain_claims_parrainClientId_fkey" FOREIGN KEY ("parrainClientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

