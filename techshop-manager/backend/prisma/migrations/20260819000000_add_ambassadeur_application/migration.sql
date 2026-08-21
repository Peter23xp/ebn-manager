-- CreateEnum
CREATE TYPE "AmbassadeurStatut" AS ENUM ('NOUVELLE', 'CONTACTEE', 'CONVERTIE', 'ANNULEE');

-- CreateTable
CREATE TABLE "ambassadeur_applications" (
    "id" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "telephone" TEXT NOT NULL,
    "email" TEXT,
    "ville" TEXT NOT NULL,
    "siteNom" TEXT,
    "codeParrain" TEXT,
    "motivation" TEXT,
    "statut" "AmbassadeurStatut" NOT NULL DEFAULT 'NOUVELLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ambassadeur_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ambassadeur_applications_statut_idx" ON "ambassadeur_applications"("statut");