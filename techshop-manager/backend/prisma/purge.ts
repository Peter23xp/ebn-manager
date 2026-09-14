/**
 * purge.ts — Script de purge sélective de la base EBN Network
 *
 * Supprime TOUTES les données sauf :
 *   ✅ Compte Super Admin (Peter AKILIMALI)
 *   ✅ Niveaux MLM (MlmLevel)
 *   ✅ Sites (Goma, Bukavu, Kinshasa)
 *
 * Exécution :
 *   npx ts-node prisma/purge.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function purge() {
  console.log('');
  console.log('🔥 ============================================');
  console.log('🔥  PURGE SÉLECTIVE — EBN Network DB');
  console.log('🔥 ============================================');
  console.log('');
  console.log('⚠️  Conservation : Super Admin + Niveaux MLM + Sites');
  console.log('🗑️  Suppression  : Tout le reste (clients, membres, ventes, stock, etc.)');
  console.log('');

  // ─── 1. Tables sans dépendances externes (feuilles) ───────────────────────

  console.log('🗑️  1. Suppressions des tables feuilles...');

  const kpayCount = await prisma.kpayTransaction.deleteMany({});
  console.log(`   ✓ KpayTransaction       : ${kpayCount.count} supprimés`);

  const resetCount = await prisma.passwordResetToken.deleteMany({});
  console.log(`   ✓ PasswordResetToken    : ${resetCount.count} supprimés`);

  const exportCount = await prisma.exportJob.deleteMany({});
  console.log(`   ✓ ExportJob             : ${exportCount.count} supprimés`);

  const ticketCount = await prisma.supportTicket.deleteMany({});
  console.log(`   ✓ SupportTicket         : ${ticketCount.count} supprimés`);

  const ambassadeurCount = await prisma.ambassadeurApplication.deleteMany({});
  console.log(`   ✓ AmbassadeurApp        : ${ambassadeurCount.count} supprimés`);

  const categorieCount = await prisma.categorie.deleteMany({});
  console.log(`   ✓ Categorie             : ${categorieCount.count} supprimés`);

  // ─── 2. Tables MLM (ordre : feuilles → racines) ───────────────────────────

  console.log('🗑️  2. Suppressions des données MLM...');

  const reinvestCount = await prisma.reinvestLote.deleteMany({});
  console.log(`   ✓ ReinvestLote          : ${reinvestCount.count} supprimés`);

  const withdrawalCount = await prisma.withdrawalRequest.deleteMany({});
  console.log(`   ✓ WithdrawalRequest     : ${withdrawalCount.count} supprimés`);

  const commissionCount = await prisma.commission.deleteMany({});
  console.log(`   ✓ Commission            : ${commissionCount.count} supprimés`);

  const mlmPayoutCount = await prisma.mlmPayout.deleteMany({});
  console.log(`   ✓ MlmPayout             : ${mlmPayoutCount.count} supprimés`);

  const txCount = await prisma.transactionPortefeuille.deleteMany({});
  console.log(`   ✓ TransactionPortef.    : ${txCount.count} supprimés`);

  const portefeuilleCount = await prisma.portefeuille.deleteMany({});
  console.log(`   ✓ Portefeuille          : ${portefeuilleCount.count} supprimés`);

  const bonusRetraiteCount = await prisma.bonusRetraite.deleteMany({});
  console.log(`   ✓ BonusRetraite         : ${bonusRetraiteCount.count} supprimés`);

  const bonusAttribueCount = await prisma.bonusAttribue.deleteMany({});
  console.log(`   ✓ BonusAttribue         : ${bonusAttribueCount.count} supprimés`);

  const salaireCount = await prisma.salaireVerse.deleteMany({});
  console.log(`   ✓ SalaireVerse          : ${salaireCount.count} supprimés`);

  const promotionCount = await prisma.promotion.deleteMany({});
  console.log(`   ✓ Promotion             : ${promotionCount.count} supprimés`);

  const positionCount = await prisma.position.deleteMany({});
  console.log(`   ✓ Position              : ${positionCount.count} supprimés`);

  const matrixCount = await prisma.matrix.deleteMany({});
  console.log(`   ✓ Matrix                : ${matrixCount.count} supprimés`);

  const membreCount = await prisma.membre.deleteMany({});
  console.log(`   ✓ Membre                : ${membreCount.count} supprimés`);

  // ─── 3. Ventes & retours ──────────────────────────────────────────────────

  console.log('🗑️  3. Suppressions des ventes et retours...');

  const ligneRetourCount = await prisma.ligneRetour.deleteMany({});
  console.log(`   ✓ LigneRetour           : ${ligneRetourCount.count} supprimés`);

  const retourCount = await prisma.retour.deleteMany({});
  console.log(`   ✓ Retour                : ${retourCount.count} supprimés`);

  const ligneVenteCount = await prisma.ligneVente.deleteMany({});
  console.log(`   ✓ LigneVente            : ${ligneVenteCount.count} supprimés`);

  const venteCount = await prisma.vente.deleteMany({});
  console.log(`   ✓ Vente                 : ${venteCount.count} supprimés`);

  // ─── 4. Onboarding & clients ──────────────────────────────────────────────

  console.log('🗑️  4. Suppressions des clients et onboarding...');

  const claimCount = await prisma.parrainClaim.deleteMany({});
  console.log(`   ✓ ParrainClaim          : ${claimCount.count} supprimés`);

  const etapeCount = await prisma.onboardingEtape.deleteMany({});
  console.log(`   ✓ OnboardingEtape       : ${etapeCount.count} supprimés`);

  const clientCount = await prisma.client.deleteMany({});
  console.log(`   ✓ Client                : ${clientCount.count} supprimés`);

  // ─── 5. Stock ─────────────────────────────────────────────────────────────

  console.log('🗑️  5. Suppressions du stock...');

  const mouvementCount = await prisma.mouvementStock.deleteMany({});
  console.log(`   ✓ MouvementStock        : ${mouvementCount.count} supprimés`);

  const transfertCount = await prisma.transfertStock.deleteMany({});
  console.log(`   ✓ TransfertStock        : ${transfertCount.count} supprimés`);

  const stockSiteCount = await prisma.stockSite.deleteMany({});
  console.log(`   ✓ StockSite             : ${stockSiteCount.count} supprimés`);

  const produitCount = await prisma.produit.deleteMany({});
  console.log(`   ✓ Produit               : ${produitCount.count} supprimés`);

  // ─── 6. Config (optionnel) ────────────────────────────────────────────────

  const configCount = await prisma.configGenerale.deleteMany({});
  console.log(`   ✓ ConfigGenerale        : ${configCount.count} supprimés`);

  // ─── Résumé ───────────────────────────────────────────────────────────────

  const adminRestant = await prisma.utilisateur.count();
  const mlmLevelsRestants = await prisma.mlmLevel.count();
  const sitesRestants = await prisma.site.count();

  console.log('');
  console.log('✅ ============================================');
  console.log('✅  PURGE TERMINÉE AVEC SUCCÈS');
  console.log('✅ ============================================');
  console.log('');
  console.log(`   👤 Utilisateurs conservés : ${adminRestant}`);
  console.log(`   ⭐ Niveaux MLM conservés  : ${mlmLevelsRestants}`);
  console.log(`   📍 Sites conservés        : ${sitesRestants}`);
  console.log('');
  console.log('   👉 Relancez `npx prisma db seed` (mode sécurisé par défaut : admin + niveaux + catégories).');
  console.log('');
}

purge()
  .catch((e) => {
    console.error('❌ Erreur lors de la purge :', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
