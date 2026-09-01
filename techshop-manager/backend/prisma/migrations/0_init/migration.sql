-- CreateEnum
CREATE TYPE "AmbassadeurStatut" AS ENUM ('NOUVELLE', 'CONTACTEE', 'CONVERTIE', 'ANNULEE');

-- CreateEnum
CREATE TYPE "BonusStatut" AS ENUM ('EN_ATTENTE', 'EN_COURS', 'LIVRE', 'ANNULE');

-- CreateEnum
CREATE TYPE "CommissionStatut" AS ENUM ('EN_ATTENTE', 'VALIDEE', 'PAYEE', 'ANNULEE');

-- CreateEnum
CREATE TYPE "EtapeOnboarding" AS ENUM ('RECIT', 'FORMATION', 'FICHE', 'ACTIVATION');

-- CreateEnum
CREATE TYPE "KpayOperationType" AS ENUM ('ONBOARDING_PAYMENT', 'SALE_PAYMENT', 'SALE_REFUND', 'MLM_PAYOUT', 'AUTO_PAYOUT');

-- CreateEnum
CREATE TYPE "KpayTransactionStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "MembreStatut" AS ENUM ('EN_ATTENTE', 'ACTIF', 'SUSPENDU', 'ARCHIVE');

-- CreateEnum
CREATE TYPE "MlmPayoutStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ModePaiement" AS ENUM ('CASH', 'MPESA', 'AIRTEL_MONEY', 'VIREMENT');

-- CreateEnum
CREATE TYPE "RetirementBonusStatut" AS ENUM ('EN_ATTENTE', 'PAYE');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'DIRECTEUR_REGIONAL', 'GERANT', 'AGENT', 'FORMATEUR', 'CLIENT');

-- CreateEnum
CREATE TYPE "StatutAlerte" AS ENUM ('ALERTE', 'RUPTURE');

-- CreateEnum
CREATE TYPE "StatutClient" AS ENUM ('EN_COURS', 'ACTIF', 'SUSPENDU', 'ARCHIVE');

-- CreateEnum
CREATE TYPE "StatutEtape" AS ENUM ('EN_ATTENTE', 'EN_COURS', 'COMPLETE');

-- CreateEnum
CREATE TYPE "StatutExport" AS ENUM ('PENDING', 'READY', 'ERROR');

-- CreateEnum
CREATE TYPE "StatutRetour" AS ENUM ('EN_ATTENTE_REMBOURSEMENT', 'COMPLETE', 'ECHEC_REMBOURSEMENT');

-- CreateEnum
CREATE TYPE "StatutTransfert" AS ENUM ('EN_TRANSIT', 'RECU', 'ANNULE');

-- CreateEnum
CREATE TYPE "StatutVente" AS ENUM ('EN_ATTENTE_PAIEMENT', 'VALIDE', 'RETOURNEE_PARTIELLE', 'RETOURNEE', 'ANNULEE');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('SYNCED', 'PENDING', 'CONFLICT');

-- CreateEnum
CREATE TYPE "TicketType" AS ENUM ('BUG', 'SUGGESTION', 'QUESTION', 'CONFIG', 'URGENCE');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('COMMISSION', 'PROMOTION', 'SALAIRE', 'BONUS_RETRAITE', 'DEBIT');

-- CreateEnum
CREATE TYPE "TypeMouvement" AS ENUM ('ENTREE', 'SORTIE_VENTE', 'TRANSFERT_DEPART', 'TRANSFERT_ARRIVEE', 'AJUSTEMENT_INVENTAIRE');

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

-- CreateTable
CREATE TABLE "bonus_attribues" (
    "id" TEXT NOT NULL,
    "membreId" TEXT NOT NULL,
    "mlmLevelId" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "statut" "BonusStatut" NOT NULL DEFAULT 'EN_ATTENTE',
    "dateAttribution" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateLivraison" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "bonus_attribues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bonus_retraites" (
    "id" TEXT NOT NULL,
    "membreId" TEXT NOT NULL,
    "filleulCrownId" TEXT NOT NULL,
    "montant" DECIMAL(12,2) NOT NULL DEFAULT 50000,
    "statut" "RetirementBonusStatut" NOT NULL DEFAULT 'EN_ATTENTE',
    "dateVersement" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bonus_retraites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "telephone" TEXT NOT NULL,
    "email" TEXT,
    "matriculeExterne" TEXT,
    "codeParrain" TEXT,
    "parrainClientId" TEXT,
    "statut" "StatutClient" NOT NULL DEFAULT 'EN_COURS',
    "notes" TEXT,
    "dateActivation" TIMESTAMP(3),
    "pinHash" TEXT,
    "tentativesPin" INTEGER NOT NULL DEFAULT 0,
    "bloqueJusquA" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "siteInscriptionId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commissions" (
    "id" TEXT NOT NULL,
    "membreId" TEXT NOT NULL,
    "filleulId" TEXT NOT NULL,
    "mlmLevelId" INTEGER NOT NULL,
    "montant" DECIMAL(12,2) NOT NULL,
    "statut" "CommissionStatut" NOT NULL DEFAULT 'EN_ATTENTE',
    "referenceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "notes" TEXT,
    "valideeAt" TIMESTAMP(3),
    "payeeAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "config_generale" (
    "id" TEXT NOT NULL,
    "smsApiKey" TEXT,
    "smsUsername" TEXT,
    "smsSenderId" TEXT,
    "matriculeExterneActif" BOOLEAN NOT NULL DEFAULT false,
    "matriculeRegex" TEXT,
    "dureeSectionHeures" INTEGER NOT NULL DEFAULT 8,
    "delaiRetourJours" INTEGER NOT NULL DEFAULT 7,
    "fraisRetourPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "kpayAutoPayoutActif" BOOLEAN NOT NULL DEFAULT false,
    "kpayAutoPayoutProvider" TEXT,
    "kpayAutoPayoutPhone" TEXT,
    "kpayAdminMpesaPhone" TEXT,
    "kpayAdminAirtelPhone" TEXT,
    "kpayAdminOrangePhone" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "config_generale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "export_jobs" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "filtres" JSONB,
    "statut" "StatutExport" NOT NULL DEFAULT 'PENDING',
    "downloadUrl" TEXT,
    "errorMsg" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "export_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
CREATE TABLE "lignes_retour" (
    "id" TEXT NOT NULL,
    "quantite" INTEGER NOT NULL,
    "retourId" TEXT NOT NULL,
    "produitId" TEXT NOT NULL,

    CONSTRAINT "lignes_retour_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lignes_vente" (
    "id" TEXT NOT NULL,
    "quantite" INTEGER NOT NULL,
    "prixUnitaire" DECIMAL(12,2) NOT NULL,
    "sousTotal" DECIMAL(12,2) NOT NULL,
    "venteId" TEXT NOT NULL,
    "produitId" TEXT NOT NULL,

    CONSTRAINT "lignes_vente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matrices" (
    "id" TEXT NOT NULL,
    "membreId" TEXT NOT NULL,
    "mlmLevelId" INTEGER NOT NULL,
    "filleulsValides" INTEGER NOT NULL DEFAULT 0,
    "estComplete" BOOLEAN NOT NULL DEFAULT false,
    "dateComplete" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "matrices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membres" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "matricule" TEXT NOT NULL,
    "parrainId" TEXT,
    "mlmLevelId" INTEGER NOT NULL DEFAULT 1,
    "statut" "MembreStatut" NOT NULL DEFAULT 'ACTIF',
    "dateActivation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateInscription" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membres_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mlm_levels" (
    "id" SERIAL NOT NULL,
    "ordre" INTEGER NOT NULL,
    "nom" TEXT NOT NULL,
    "filleulsRequis" INTEGER NOT NULL DEFAULT 4,
    "commissionParFilleul" DECIMAL(12,2) NOT NULL,
    "commissionTotale" DECIMAL(12,2) NOT NULL,
    "bonusDescription" TEXT NOT NULL,
    "salaireMensuel" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "salaireActif" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "couleur" TEXT NOT NULL,
    "icone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mlm_levels_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "mouvements_stock" (
    "id" TEXT NOT NULL,
    "type" "TypeMouvement" NOT NULL,
    "quantite" INTEGER NOT NULL,
    "quantiteAvant" INTEGER NOT NULL,
    "quantiteApres" INTEGER NOT NULL,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "produitId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,

    CONSTRAINT "mouvements_stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_etapes" (
    "id" TEXT NOT NULL,
    "etape" "EtapeOnboarding" NOT NULL,
    "statut" "StatutEtape" NOT NULL DEFAULT 'EN_ATTENTE',
    "completeeAt" TIMESTAMP(3),
    "montant" DECIMAL(12,2),
    "modePaiement" "ModePaiement",
    "referenceTransaction" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,

    CONSTRAINT "onboarding_etapes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portail_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientId" TEXT NOT NULL,

    CONSTRAINT "portail_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portefeuilles" (
    "id" TEXT NOT NULL,
    "membreId" TEXT NOT NULL,
    "soldeDisponible" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "soldeReserve" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalGagne" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portefeuilles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "positions" (
    "id" TEXT NOT NULL,
    "matrixId" TEXT NOT NULL,
    "numeroPosition" INTEGER NOT NULL,
    "filleulId" TEXT,
    "estValide" BOOLEAN NOT NULL DEFAULT false,
    "dateValidation" TIMESTAMP(3),

    CONSTRAINT "positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "produits" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "description" TEXT,
    "categorie" TEXT NOT NULL,
    "prixVente" DECIMAL(12,2) NOT NULL,
    "prixAchat" DECIMAL(12,2) NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "produits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotions" (
    "id" TEXT NOT NULL,
    "membreId" TEXT NOT NULL,
    "niveauAvantId" INTEGER NOT NULL,
    "niveauApresId" INTEGER NOT NULL,
    "commissionVersee" DECIMAL(12,2) NOT NULL,
    "datePromotion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "declencheParId" TEXT NOT NULL,

    CONSTRAINT "promotions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retours" (
    "id" TEXT NOT NULL,
    "statut" "StatutRetour" NOT NULL DEFAULT 'COMPLETE',
    "numeroAvoir" TEXT,
    "motif" TEXT NOT NULL,
    "motifDescription" TEXT,
    "modeRemboursement" TEXT NOT NULL,
    "referenceTransaction" TEXT,
    "montantRembourse" DECIMAL(12,2) NOT NULL,
    "stockRemis" BOOLEAN NOT NULL DEFAULT false,
    "agentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "venteId" TEXT NOT NULL,

    CONSTRAINT "retours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salaires_verses" (
    "id" TEXT NOT NULL,
    "membreId" TEXT NOT NULL,
    "montant" DECIMAL(12,2) NOT NULL,
    "moisAnnee" TEXT NOT NULL,
    "dateVersement" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "statut" TEXT NOT NULL DEFAULT 'VERSE',

    CONSTRAINT "salaires_verses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sites" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "ville" TEXT NOT NULL,
    "adresse" TEXT,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "gerantId" TEXT,

    CONSTRAINT "sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_sites" (
    "id" TEXT NOT NULL,
    "quantite" INTEGER NOT NULL DEFAULT 0,
    "seuilAlerte" INTEGER NOT NULL DEFAULT 5,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "produitId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,

    CONSTRAINT "stock_sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" TEXT NOT NULL,
    "ticketRef" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "siteNom" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "type" "TicketType" NOT NULL,
    "sujet" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "systemInfo" TEXT,
    "hasScreenshot" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions_portefeuille" (
    "id" TEXT NOT NULL,
    "portefeuilleId" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "montant" DECIMAL(12,2) NOT NULL,
    "description" TEXT NOT NULL,
    "referenceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactions_portefeuille_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transferts_stock" (
    "id" TEXT NOT NULL,
    "quantiteEnvoyee" INTEGER NOT NULL,
    "quantiteRecue" INTEGER,
    "motif" TEXT,
    "observations" TEXT,
    "statut" "StatutTransfert" NOT NULL DEFAULT 'EN_TRANSIT',
    "dateExpedition" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateReception" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "produitId" TEXT NOT NULL,
    "siteSourceId" TEXT NOT NULL,
    "siteDestinationId" TEXT NOT NULL,
    "initiateurId" TEXT NOT NULL,

    CONSTRAINT "transferts_stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "utilisateurs" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "telephone" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "langue" TEXT NOT NULL DEFAULT 'fr',
    "derniereConnexion" TIMESTAMP(3),
    "tentativesConnexion" INTEGER NOT NULL DEFAULT 0,
    "bloqueJusquA" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "siteId" TEXT,

    CONSTRAINT "utilisateurs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ventes" (
    "id" TEXT NOT NULL,
    "numeroVente" TEXT NOT NULL,
    "statut" "StatutVente" NOT NULL DEFAULT 'VALIDE',
    "montantBrut" DECIMAL(12,2) NOT NULL,
    "remiseFidelite" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "remiseParrainage" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "montantNet" DECIMAL(12,2) NOT NULL,
    "modePaiement" "ModePaiement" NOT NULL,
    "referenceTransaction" TEXT,
    "montantRecu" DECIMAL(12,2),
    "monnaieRendue" DECIMAL(12,2),
    "pointsAttribues" INTEGER NOT NULL DEFAULT 0,
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'SYNCED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clientId" TEXT,
    "siteId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,

    CONSTRAINT "ventes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ambassadeur_applications_statut_idx" ON "ambassadeur_applications"("statut" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "bonus_retraites_membreId_filleulCrownId_key" ON "bonus_retraites"("membreId" ASC, "filleulCrownId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "clients_codeParrain_key" ON "clients"("codeParrain" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "clients_email_key" ON "clients"("email" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "clients_matriculeExterne_key" ON "clients"("matriculeExterne" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "clients_telephone_key" ON "clients"("telephone" ASC);

-- CreateIndex
CREATE INDEX "commissions_membreId_idx" ON "commissions"("membreId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "commissions_referenceId_key" ON "commissions"("referenceId" ASC);

-- CreateIndex
CREATE INDEX "commissions_statut_idx" ON "commissions"("statut" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "kpay_transactions_externalId_key" ON "kpay_transactions"("externalId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "kpay_transactions_kpayPaymentId_key" ON "kpay_transactions"("kpayPaymentId" ASC);

-- CreateIndex
CREATE INDEX "kpay_transactions_onboardingEtapeId_idx" ON "kpay_transactions"("onboardingEtapeId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "kpay_transactions_payoutId_key" ON "kpay_transactions"("payoutId" ASC);

-- CreateIndex
CREATE INDEX "kpay_transactions_retourId_idx" ON "kpay_transactions"("retourId" ASC);

-- CreateIndex
CREATE INDEX "kpay_transactions_venteId_idx" ON "kpay_transactions"("venteId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "matrices_membreId_mlmLevelId_key" ON "matrices"("membreId" ASC, "mlmLevelId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "membres_clientId_key" ON "membres"("clientId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "membres_matricule_key" ON "membres"("matricule" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "mlm_levels_ordre_key" ON "mlm_levels"("ordre" ASC);

-- CreateIndex
CREATE INDEX "mlm_payouts_membreId_statut_idx" ON "mlm_payouts"("membreId" ASC, "statut" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_etapes_clientId_etape_key" ON "onboarding_etapes"("clientId" ASC, "etape" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "portail_tokens_clientId_key" ON "portail_tokens"("clientId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "portail_tokens_token_key" ON "portail_tokens"("token" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "portefeuilles_membreId_key" ON "portefeuilles"("membreId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "positions_matrixId_numeroPosition_key" ON "positions"("matrixId" ASC, "numeroPosition" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "produits_sku_key" ON "produits"("sku" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "retours_numeroAvoir_key" ON "retours"("numeroAvoir" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "salaires_verses_membreId_moisAnnee_key" ON "salaires_verses"("membreId" ASC, "moisAnnee" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "stock_sites_produitId_siteId_key" ON "stock_sites"("produitId" ASC, "siteId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "support_tickets_ticketRef_key" ON "support_tickets"("ticketRef" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "utilisateurs_email_key" ON "utilisateurs"("email" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "utilisateurs_telephone_key" ON "utilisateurs"("telephone" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ventes_numeroVente_key" ON "ventes"("numeroVente" ASC);

-- AddForeignKey
ALTER TABLE "bonus_attribues" ADD CONSTRAINT "bonus_attribues_membreId_fkey" FOREIGN KEY ("membreId") REFERENCES "membres"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bonus_attribues" ADD CONSTRAINT "bonus_attribues_mlmLevelId_fkey" FOREIGN KEY ("mlmLevelId") REFERENCES "mlm_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bonus_retraites" ADD CONSTRAINT "bonus_retraites_filleulCrownId_fkey" FOREIGN KEY ("filleulCrownId") REFERENCES "membres"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bonus_retraites" ADD CONSTRAINT "bonus_retraites_membreId_fkey" FOREIGN KEY ("membreId") REFERENCES "membres"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "utilisateurs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_parrainClientId_fkey" FOREIGN KEY ("parrainClientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_siteInscriptionId_fkey" FOREIGN KEY ("siteInscriptionId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_filleulId_fkey" FOREIGN KEY ("filleulId") REFERENCES "membres"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_membreId_fkey" FOREIGN KEY ("membreId") REFERENCES "membres"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_mlmLevelId_fkey" FOREIGN KEY ("mlmLevelId") REFERENCES "mlm_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpay_transactions" ADD CONSTRAINT "kpay_transactions_onboardingEtapeId_fkey" FOREIGN KEY ("onboardingEtapeId") REFERENCES "onboarding_etapes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpay_transactions" ADD CONSTRAINT "kpay_transactions_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "mlm_payouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpay_transactions" ADD CONSTRAINT "kpay_transactions_retourId_fkey" FOREIGN KEY ("retourId") REFERENCES "retours"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpay_transactions" ADD CONSTRAINT "kpay_transactions_venteId_fkey" FOREIGN KEY ("venteId") REFERENCES "ventes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lignes_retour" ADD CONSTRAINT "lignes_retour_produitId_fkey" FOREIGN KEY ("produitId") REFERENCES "produits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lignes_retour" ADD CONSTRAINT "lignes_retour_retourId_fkey" FOREIGN KEY ("retourId") REFERENCES "retours"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lignes_vente" ADD CONSTRAINT "lignes_vente_produitId_fkey" FOREIGN KEY ("produitId") REFERENCES "produits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lignes_vente" ADD CONSTRAINT "lignes_vente_venteId_fkey" FOREIGN KEY ("venteId") REFERENCES "ventes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matrices" ADD CONSTRAINT "matrices_membreId_fkey" FOREIGN KEY ("membreId") REFERENCES "membres"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matrices" ADD CONSTRAINT "matrices_mlmLevelId_fkey" FOREIGN KEY ("mlmLevelId") REFERENCES "mlm_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membres" ADD CONSTRAINT "membres_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membres" ADD CONSTRAINT "membres_mlmLevelId_fkey" FOREIGN KEY ("mlmLevelId") REFERENCES "mlm_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membres" ADD CONSTRAINT "membres_parrainId_fkey" FOREIGN KEY ("parrainId") REFERENCES "membres"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mlm_payouts" ADD CONSTRAINT "mlm_payouts_membreId_fkey" FOREIGN KEY ("membreId") REFERENCES "membres"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mouvements_stock" ADD CONSTRAINT "mouvements_stock_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "utilisateurs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mouvements_stock" ADD CONSTRAINT "mouvements_stock_produitId_fkey" FOREIGN KEY ("produitId") REFERENCES "produits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mouvements_stock" ADD CONSTRAINT "mouvements_stock_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_etapes" ADD CONSTRAINT "onboarding_etapes_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "utilisateurs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_etapes" ADD CONSTRAINT "onboarding_etapes_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_etapes" ADD CONSTRAINT "onboarding_etapes_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portail_tokens" ADD CONSTRAINT "portail_tokens_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portefeuilles" ADD CONSTRAINT "portefeuilles_membreId_fkey" FOREIGN KEY ("membreId") REFERENCES "membres"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_matrixId_fkey" FOREIGN KEY ("matrixId") REFERENCES "matrices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_membreId_fkey" FOREIGN KEY ("membreId") REFERENCES "membres"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retours" ADD CONSTRAINT "retours_venteId_fkey" FOREIGN KEY ("venteId") REFERENCES "ventes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salaires_verses" ADD CONSTRAINT "salaires_verses_membreId_fkey" FOREIGN KEY ("membreId") REFERENCES "membres"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_sites" ADD CONSTRAINT "stock_sites_produitId_fkey" FOREIGN KEY ("produitId") REFERENCES "produits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_sites" ADD CONSTRAINT "stock_sites_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions_portefeuille" ADD CONSTRAINT "transactions_portefeuille_portefeuilleId_fkey" FOREIGN KEY ("portefeuilleId") REFERENCES "portefeuilles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transferts_stock" ADD CONSTRAINT "transferts_stock_initiateurId_fkey" FOREIGN KEY ("initiateurId") REFERENCES "utilisateurs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transferts_stock" ADD CONSTRAINT "transferts_stock_produitId_fkey" FOREIGN KEY ("produitId") REFERENCES "produits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transferts_stock" ADD CONSTRAINT "transferts_stock_siteDestinationId_fkey" FOREIGN KEY ("siteDestinationId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transferts_stock" ADD CONSTRAINT "transferts_stock_siteSourceId_fkey" FOREIGN KEY ("siteSourceId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "utilisateurs" ADD CONSTRAINT "utilisateurs_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventes" ADD CONSTRAINT "ventes_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "utilisateurs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventes" ADD CONSTRAINT "ventes_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventes" ADD CONSTRAINT "ventes_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

