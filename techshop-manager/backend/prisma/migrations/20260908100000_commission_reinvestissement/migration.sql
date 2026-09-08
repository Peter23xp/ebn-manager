-- ================================================================
-- Migration: commission_reinvestissement
-- Ajoute le split système/retour aux commissions MLM
-- ================================================================

-- 1. Nouveau type de transaction REINVESTISSEMENT
ALTER TYPE "TransactionType" ADD VALUE 'REINVESTISSEMENT';

-- 2. Champs split sur mlm_levels
ALTER TABLE "mlm_levels"
  ADD COLUMN IF NOT EXISTS "commissionSysteme" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "commissionRetour"  DECIMAL(12, 2) NOT NULL DEFAULT 0;

-- Peupler depuis les valeurs actuelles (les anciens = système, retour = 0)
-- Sera mis à jour par le seed qui définit les vraies valeurs
UPDATE "mlm_levels" SET
  "commissionSysteme" = "commissionParFilleul",
  "commissionRetour"  = 0
WHERE "commissionSysteme" = 0;

-- 3. Champs split sur commissions
ALTER TABLE "commissions"
  ADD COLUMN IF NOT EXISTS "montantSysteme" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "montantRetour"  DECIMAL(12, 2) NOT NULL DEFAULT 0;

-- Rétrocompatibilité : anciens enregistrements — estimation 60/40
UPDATE "commissions" SET
  "montantSysteme" = ROUND("montant" * 0.6, 2),
  "montantRetour"  = ROUND("montant" * 0.4, 2)
WHERE "montantSysteme" = 0;
