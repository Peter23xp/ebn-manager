import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Démarrage du seed...');

  // ============================================
  // 1. SITES
  // ============================================
  console.log('📍 Création des sites...');

  const siteGoma = await prisma.site.upsert({
    where: { id: 'site-goma-001' },
    update: {},
    create: {
      id: 'site-goma-001',
      nom: 'EBN Network Goma',
      ville: 'Goma',
      adresse: 'Avenue du Commerce, Goma, Nord-Kivu',
      actif: true,
    },
  });

  const siteBukavu = await prisma.site.upsert({
    where: { id: 'site-bukavu-001' },
    update: {},
    create: {
      id: 'site-bukavu-001',
      nom: 'EBN Network Bukavu',
      ville: 'Bukavu',
      adresse: 'Boulevard Patrice Lumumba, Bukavu, Sud-Kivu',
      actif: true,
    },
  });

  const siteKinshasa = await prisma.site.upsert({
    where: { id: 'site-kinshasa-001' },
    update: {},
    create: {
      id: 'site-kinshasa-001',
      nom: 'EBN Network Kinshasa',
      ville: 'Kinshasa',
      adresse: 'Avenue Kasa-Vubu, Gombe, Kinshasa',
      actif: true,
    },
  });

  console.log(`  ✓ Site: ${siteGoma.nom}`);
  console.log(`  ✓ Site: ${siteBukavu.nom}`);
  console.log(`  ✓ Site: ${siteKinshasa.nom}`);

  // ============================================
  // 2. SUPER ADMIN
  // ============================================
  console.log('👤 Création du Super Admin...');

  const passwordHash = await bcrypt.hash('Admin@2025', 10);

  const superAdmin = await prisma.utilisateur.upsert({
    where: { telephone: '+243902238740' },
    update: { passwordHash },
    create: {
      nom: 'Peter AKILIMALI',
      telephone: '+243902238740',
      passwordHash,
      role: Role.SUPER_ADMIN,
      actif: true,
      langue: 'fr',
    },
  });

  console.log(`  ✓ Super Admin: ${superAdmin.nom} (${superAdmin.telephone})`);

  // ============================================
  // 3. MLM LEVELS (8 niveaux)
  // ============================================
  console.log('⭐ Création des niveaux MLM...');

  const mlmLevels = [
    { ordre: 1, nom: 'Niveau 1', filleulsRequis: 4, commissionParFilleul: 10, commissionTotale: 40, bonusDescription: 'Accès au système', salaireMensuel: 0, salaireActif: false, couleur: '#cbd5e1', icone: 'star' },
    { ordre: 2, nom: 'Niveau 2', filleulsRequis: 4, commissionParFilleul: 15, commissionTotale: 60, bonusDescription: 'Bonus niveau 2', salaireMensuel: 0, salaireActif: false, couleur: '#94a3b8', icone: 'award' },
    { ordre: 3, nom: 'Niveau 3', filleulsRequis: 4, commissionParFilleul: 25, commissionTotale: 100, bonusDescription: 'Bonus niveau 3', salaireMensuel: 0, salaireActif: false, couleur: '#64748b', icone: 'shield' },
    { ordre: 4, nom: 'Niveau 4', filleulsRequis: 4, commissionParFilleul: 50, commissionTotale: 200, bonusDescription: 'Bonus niveau 4', salaireMensuel: 0, salaireActif: false, couleur: '#334155', icone: 'zap' },
    { ordre: 5, nom: 'Niveau 5', filleulsRequis: 4, commissionParFilleul: 100, commissionTotale: 400, bonusDescription: 'Bonus niveau 5', salaireMensuel: 100, salaireActif: true, couleur: '#f59e0b', icone: 'crown' },
    { ordre: 6, nom: 'Niveau 6', filleulsRequis: 4, commissionParFilleul: 250, commissionTotale: 1000, bonusDescription: 'Bonus niveau 6', salaireMensuel: 250, salaireActif: true, couleur: '#d97706', icone: 'gem' },
    { ordre: 7, nom: 'Niveau 7', filleulsRequis: 4, commissionParFilleul: 500, commissionTotale: 2000, bonusDescription: 'Bonus niveau 7', salaireMensuel: 500, salaireActif: true, couleur: '#b45309', icone: 'trending-up' },
    { ordre: 8, nom: 'Crown Ambassadeur', filleulsRequis: 4, commissionParFilleul: 1250, commissionTotale: 5000, bonusDescription: 'Bonus Retraite 50000$', salaireMensuel: 1000, salaireActif: true, couleur: '#78350f', icone: 'award' },
  ];

  for (const level of mlmLevels) {
    await prisma.mlmLevel.upsert({
      where: { ordre: level.ordre },
      update: level,
      create: level,
    });
  }
  console.log(`  ✓ ${mlmLevels.length} niveaux MLM créés ou mis à jour`);

  // ============================================
  // 4. CONFIG GENERALE
  // ============================================
  console.log('⚙️  Création de la config générale...');

  const existingConfigGenerale = await prisma.configGenerale.findFirst();

  if (!existingConfigGenerale) {
    const configGenerale = await prisma.configGenerale.create({
      data: {
        smsApiKey: null,
        smsUsername: null,
        smsSenderId: 'EBN Network',
        matriculeExterneActif: false,
        matriculeRegex: null,
        dureeSectionHeures: 8,
        delaiRetourJours: 7,
        fraisRetourPct: 0,
      },
    });
    console.log(`  ✓ Config générale créée (délai retour: ${configGenerale.delaiRetourJours} jours)`);
  } else {
    console.log('  ℹ Config générale déjà existante, ignorée');
  }

  // ============================================
  // RÉSUMÉ
  // ============================================
  console.log('\n✅ Seed terminé avec succès!');
  console.log('\n📊 Résumé:');
  console.log(`  - 3 sites créés: Goma, Bukavu, Kinshasa`);
  console.log(`  - 1 Super Admin: ${superAdmin.telephone}`);
  console.log(`  - 8 Niveaux MLM configurés`);
  console.log(`  - Config générale par défaut`);
}

main()
  .catch((e) => {
    console.error('❌ Erreur seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
