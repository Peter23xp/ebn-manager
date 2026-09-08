-- ================================================================
-- Migration: update_mlm_levels_values
-- Met à jour les 8 niveaux MLM avec les nouveaux montants (+66.67%)
-- et le split système (60%) / retour auto-réinvestissement (40%)
-- ================================================================

UPDATE "mlm_levels" SET
  "commissionParFilleul" = 10.00,
  "commissionTotale"     = 40.00,
  "commissionSysteme"    = 6.00,
  "commissionRetour"     = 4.00
WHERE "ordre" = 1;

UPDATE "mlm_levels" SET
  "commissionParFilleul" = 20.83,
  "commissionTotale"     = 83.32,
  "commissionSysteme"    = 12.50,
  "commissionRetour"     = 8.33
WHERE "ordre" = 2;

UPDATE "mlm_levels" SET
  "commissionParFilleul" = 33.33,
  "commissionTotale"     = 133.32,
  "commissionSysteme"    = 20.00,
  "commissionRetour"     = 13.33
WHERE "ordre" = 3;

UPDATE "mlm_levels" SET
  "commissionParFilleul" = 83.33,
  "commissionTotale"     = 333.32,
  "commissionSysteme"    = 50.00,
  "commissionRetour"     = 33.33
WHERE "ordre" = 4;

UPDATE "mlm_levels" SET
  "commissionParFilleul" = 416.67,
  "commissionTotale"     = 1666.68,
  "commissionSysteme"    = 250.00,
  "commissionRetour"     = 166.67
WHERE "ordre" = 5;

UPDATE "mlm_levels" SET
  "commissionParFilleul" = 833.33,
  "commissionTotale"     = 3333.32,
  "commissionSysteme"    = 500.00,
  "commissionRetour"     = 333.33
WHERE "ordre" = 6;

UPDATE "mlm_levels" SET
  "commissionParFilleul" = 8333.33,
  "commissionTotale"     = 33333.32,
  "commissionSysteme"    = 5000.00,
  "commissionRetour"     = 3333.33
WHERE "ordre" = 7;

UPDATE "mlm_levels" SET
  "commissionParFilleul" = 20833.33,
  "commissionTotale"     = 83333.32,
  "commissionSysteme"    = 12500.00,
  "commissionRetour"     = 8333.33
WHERE "ordre" = 8;
