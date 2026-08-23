ALTER TABLE "config_generale" ADD COLUMN IF NOT EXISTS "kpayAdminMpesaPhone" TEXT;
ALTER TABLE "config_generale" ADD COLUMN IF NOT EXISTS "kpayAdminAirtelPhone" TEXT;
ALTER TABLE "config_generale" ADD COLUMN IF NOT EXISTS "kpayAdminOrangePhone" TEXT;

UPDATE "config_generale"
SET "kpayAdminMpesaPhone" = "kpayAutoPayoutPhone"
WHERE "kpayAdminMpesaPhone" IS NULL
  AND "kpayAutoPayoutProvider" = 'VODACOM_MPESA_COD'
  AND "kpayAutoPayoutPhone" IS NOT NULL;

UPDATE "config_generale"
SET "kpayAdminAirtelPhone" = "kpayAutoPayoutPhone"
WHERE "kpayAdminAirtelPhone" IS NULL
  AND "kpayAutoPayoutProvider" = 'AIRTEL_COD'
  AND "kpayAutoPayoutPhone" IS NOT NULL;

UPDATE "config_generale"
SET "kpayAdminOrangePhone" = "kpayAutoPayoutPhone"
WHERE "kpayAdminOrangePhone" IS NULL
  AND "kpayAutoPayoutProvider" = 'ORANGE_COD'
  AND "kpayAutoPayoutPhone" IS NOT NULL;
