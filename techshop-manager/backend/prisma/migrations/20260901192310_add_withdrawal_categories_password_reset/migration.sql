-- CreateEnum
CREATE TYPE "WithdrawalRequestStatut" AS ENUM ('EN_ATTENTE', 'APPROUVE', 'REJETE', 'PAYE', 'ANNULE');

-- CreateEnum
CREATE TYPE "WithdrawalRequestType" AS ENUM ('MOBILE_MONEY', 'CASH');

-- DropForeignKey
ALTER TABLE "portail_tokens" DROP CONSTRAINT "portail_tokens_clientId_fkey";

-- DropTable
DROP TABLE "portail_tokens";

-- CreateTable
CREATE TABLE "withdrawal_requests" (
    "id" TEXT NOT NULL,
    "membreId" TEXT NOT NULL,
    "montant" DECIMAL(12,2) NOT NULL,
    "type" "WithdrawalRequestType" NOT NULL,
    "provider" TEXT,
    "phoneNumber" TEXT,
    "statut" "WithdrawalRequestStatut" NOT NULL DEFAULT 'EN_ATTENTE',
    "commissionIds" JSONB NOT NULL,
    "notes" TEXT,
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "withdrawal_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "otpHash" TEXT NOT NULL,
    "resetToken" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "withdrawal_requests_membreId_idx" ON "withdrawal_requests"("membreId");

-- CreateIndex
CREATE INDEX "withdrawal_requests_statut_idx" ON "withdrawal_requests"("statut");

-- CreateIndex
CREATE UNIQUE INDEX "categories_nom_key" ON "categories"("nom");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_resetToken_key" ON "password_reset_tokens"("resetToken");

-- CreateIndex
CREATE INDEX "password_reset_tokens_identifier_idx" ON "password_reset_tokens"("identifier");

-- AddForeignKey
ALTER TABLE "withdrawal_requests" ADD CONSTRAINT "withdrawal_requests_membreId_fkey" FOREIGN KEY ("membreId") REFERENCES "membres"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

