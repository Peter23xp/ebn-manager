-- The first MLM level was created with the legacy label "Pierre" in an older database.
-- Keep the canonical level name used by the current seed and UI.
UPDATE "mlm_levels"
SET "nom" = 'Builder', "updatedAt" = CURRENT_TIMESTAMP
WHERE "ordre" = 1;
