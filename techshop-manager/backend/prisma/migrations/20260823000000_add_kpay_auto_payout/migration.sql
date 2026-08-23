ALTER TYPE "KpayOperationType" ADD VALUE IF NOT EXISTS 'AUTO_PAYOUT';
ALTER TABLE "config_generale" ADD COLUMN IF NOT EXISTS "kpayAutoPayoutActif" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "config_generale" ADD COLUMN IF NOT EXISTS "kpayAutoPayoutProvider" TEXT;
ALTER TABLE "config_generale" ADD COLUMN IF NOT EXISTS "kpayAutoPayoutPhone" TEXT;
