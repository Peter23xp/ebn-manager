-- Fonctionnalités retirées à un utilisateur par le super admin
ALTER TABLE "utilisateurs" ADD COLUMN "fonctionnalitesRetirees" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
