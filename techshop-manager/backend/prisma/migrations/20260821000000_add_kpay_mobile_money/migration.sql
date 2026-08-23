-- CreateEnum
CREATE TYPE "StatutRetour" AS ENUM ('EN_ATTENTE_REMBOURSEMENT', 'COMPLETE', 'ECHEC_REMBOURSEMENT');
CREATE TYPE "KpayOperationType" AS ENUM ('ONBOARDING_PAYMENT', 'SALE_PAYMENT', 'SALE_REFUND', 'MLM_PAYOUT');
CREATE TYPE "KpayTransactionStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED', 'REFUNDED');
CREATE TYPE "MlmPayoutStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "StatutVente" ADD VALUE IF NOT EXISTS 'EN_ATTENTE_PAIEMENT';

-- AlterTable
ALTER TABLE "portefeuilles" ADD COLUMN "soldeReserve" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "retours" ADD COLUMN "statut" "StatutRetour" NOT NULL DEFAULT 'COMPLETE';

-- CreateTable
CREATE TABLE "mlm_payouts" (
    "id" TEXT NOT NULL,
    "montant" DECIMAL(12,2) NOT NULL,
    "provider" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "statut" "MlmPayoutStatus" NOT NULL DEFAULT 'PENDING',
    "failureReason" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "membreId" TEXT NOT NULL,
    CONSTRAINT "mlm_payouts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "kpay_transactions" (
    "id" TEXT NOT NULL,
    "operationType" "KpayOperationType" NOT NULL,
    "status" "KpayTransactionStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "externalId" TEXT NOT NULL,
    "kpayPaymentId" TEXT,
    "kpayReference" TEXT,
    "provider" TEXT,
    "phoneNumber" TEXT,
    "failureReason" TEXT,
    "metadata" JSONB,
    "terminalEventProcessedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "venteId" TEXT,
    "onboardingEtapeId" TEXT,
    "retourId" TEXT,
    "payoutId" TEXT,
    CONSTRAINT "kpay_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "kpay_transactions_externalId_key" ON "kpay_transactions"("externalId");
CREATE UNIQUE INDEX "kpay_transactions_kpayPaymentId_key" ON "kpay_transactions"("kpayPaymentId");
CREATE UNIQUE INDEX "kpay_transactions_payoutId_key" ON "kpay_transactions"("payoutId");
CREATE INDEX "kpay_transactions_venteId_idx" ON "kpay_transactions"("venteId");
CREATE INDEX "kpay_transactions_onboardingEtapeId_idx" ON "kpay_transactions"("onboardingEtapeId");
CREATE INDEX "kpay_transactions_retourId_idx" ON "kpay_transactions"("retourId");
CREATE INDEX "mlm_payouts_membreId_statut_idx" ON "mlm_payouts"("membreId", "statut");

-- AddForeignKey
ALTER TABLE "mlm_payouts" ADD CONSTRAINT "mlm_payouts_membreId_fkey" FOREIGN KEY ("membreId") REFERENCES "membres"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "kpay_transactions" ADD CONSTRAINT "kpay_transactions_venteId_fkey" FOREIGN KEY ("venteId") REFERENCES "ventes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "kpay_transactions" ADD CONSTRAINT "kpay_transactions_onboardingEtapeId_fkey" FOREIGN KEY ("onboardingEtapeId") REFERENCES "onboarding_etapes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "kpay_transactions" ADD CONSTRAINT "kpay_transactions_retourId_fkey" FOREIGN KEY ("retourId") REFERENCES "retours"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "kpay_transactions" ADD CONSTRAINT "kpay_transactions_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "mlm_payouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

