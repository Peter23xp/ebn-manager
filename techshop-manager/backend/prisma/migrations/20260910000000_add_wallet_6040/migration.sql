-- AlterTable
ALTER TABLE "portefeuilles" ADD COLUMN     "soldeReinvesti" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "withdrawal_requests" ALTER COLUMN "commissionIds" DROP NOT NULL;

-- CreateTable
CREATE TABLE "reinvest_lots" (
    "id" TEXT NOT NULL,
    "membreId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "releasedAt" TIMESTAMP(3) NOT NULL,
    "released" BOOLEAN NOT NULL DEFAULT false,
    "commissionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reinvest_lots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reinvest_lots_released_releasedAt_idx" ON "reinvest_lots"("released", "releasedAt");

-- CreateIndex
CREATE INDEX "reinvest_lots_membreId_idx" ON "reinvest_lots"("membreId");

-- AddForeignKey
ALTER TABLE "reinvest_lots" ADD CONSTRAINT "reinvest_lots_membreId_fkey" FOREIGN KEY ("membreId") REFERENCES "membres"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
