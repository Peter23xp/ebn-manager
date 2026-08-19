import { PrismaClient, Role, StatutClient, EtapeOnboarding, StatutEtape, ModePaiement, StatutVente, TypeMouvement, StatutTransfert, MembreStatut, TransactionType, BonusStatut, TicketType } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Démarrage du seed enrichi EBN Network (Format Matricule AAAAMJXXXX)...');

  // ============================================
  // 1. SITES (Goma, Bukavu, Kinshasa)
  // ============================================
  console.log('📍 1. Création des sites...');

  const siteGoma = await prisma.site.upsert({
    where: { id: 'site-goma-001' },
    update: { nom: 'EBN Network Goma', ville: 'Goma', adresse: 'Avenue du Commerce, Goma, Nord-Kivu', actif: true },
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
    update: { nom: 'EBN Network Bukavu', ville: 'Bukavu', adresse: 'Boulevard Patrice Lumumba, Bukavu, Sud-Kivu', actif: true },
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
    update: { nom: 'EBN Network Kinshasa', ville: 'Kinshasa', adresse: 'Avenue Kasa-Vubu, Gombe, Kinshasa', actif: true },
    create: {
      id: 'site-kinshasa-001',
      nom: 'EBN Network Kinshasa',
      ville: 'Kinshasa',
      adresse: 'Avenue Kasa-Vubu, Gombe, Kinshasa',
      actif: true,
    },
  });

  console.log(`  ✓ Sites: ${siteGoma.nom}, ${siteBukavu.nom}, ${siteKinshasa.nom}`);

  // ============================================
  // 2. UTILISATEURS / ÉQUIPE
  // ============================================
  console.log('👤 2. Création des utilisateurs et rôles...');

  const passwordHash = await bcrypt.hash('Admin@2025', 10);

  // Super Admin
  const superAdmin = await prisma.utilisateur.upsert({
    where: { telephone: '+243902238740' },
    update: { passwordHash, nom: 'Peter AKILIMALI', role: Role.SUPER_ADMIN, actif: true, langue: 'fr' },
    create: {
      id: 'user-admin-001',
      nom: 'Peter AKILIMALI',
      telephone: '+243902238740',
      email: 'admin@ebnnetwork.cd',
      passwordHash,
      role: Role.SUPER_ADMIN,
      actif: true,
      langue: 'fr',
    },
  });

  // Directeur Régional
  const dirRegional = await prisma.utilisateur.upsert({
    where: { telephone: '+243990000001' },
    update: { passwordHash, role: Role.DIRECTEUR_REGIONAL, siteId: siteGoma.id },
    create: {
      id: 'user-dir-001',
      nom: 'Séraphin BAGALWA',
      telephone: '+243990000001',
      email: 'seraphin.bagalwa@ebnnetwork.cd',
      passwordHash,
      role: Role.DIRECTEUR_REGIONAL,
      siteId: siteGoma.id,
      actif: true,
      langue: 'fr',
    },
  });

  // Gérants
  const gerantGoma = await prisma.utilisateur.upsert({
    where: { telephone: '+243990000002' },
    update: { passwordHash, role: Role.GERANT, siteId: siteGoma.id },
    create: {
      id: 'user-gerant-goma',
      nom: 'Justin KASONGO',
      telephone: '+243990000002',
      email: 'justin.kasongo@ebnnetwork.cd',
      passwordHash,
      role: Role.GERANT,
      siteId: siteGoma.id,
      actif: true,
      langue: 'fr',
    },
  });

  const gerantBukavu = await prisma.utilisateur.upsert({
    where: { telephone: '+243990000003' },
    update: { passwordHash, role: Role.GERANT, siteId: siteBukavu.id },
    create: {
      id: 'user-gerant-bukavu',
      nom: 'Aline MUGISHO',
      telephone: '+243990000003',
      email: 'aline.mugisho@ebnnetwork.cd',
      passwordHash,
      role: Role.GERANT,
      siteId: siteBukavu.id,
      actif: true,
      langue: 'fr',
    },
  });

  const gerantKinshasa = await prisma.utilisateur.upsert({
    where: { telephone: '+243990000004' },
    update: { passwordHash, role: Role.GERANT, siteId: siteKinshasa.id },
    create: {
      id: 'user-gerant-kin',
      nom: 'Patrick ILUNGA',
      telephone: '+243990000004',
      email: 'patrick.ilunga@ebnnetwork.cd',
      passwordHash,
      role: Role.GERANT,
      siteId: siteKinshasa.id,
      actif: true,
      langue: 'fr',
    },
  });

  // Agents commerciaux / Caissiers
  const agentGoma = await prisma.utilisateur.upsert({
    where: { telephone: '+243990000005' },
    update: { passwordHash, role: Role.AGENT, siteId: siteGoma.id },
    create: {
      id: 'user-agent-goma',
      nom: 'David CIRHUZA',
      telephone: '+243990000005',
      email: 'david.cirhuza@ebnnetwork.cd',
      passwordHash,
      role: Role.AGENT,
      siteId: siteGoma.id,
      actif: true,
      langue: 'fr',
    },
  });

  const agentBukavu = await prisma.utilisateur.upsert({
    where: { telephone: '+243990000006' },
    update: { passwordHash, role: Role.AGENT, siteId: siteBukavu.id },
    create: {
      id: 'user-agent-bukavu',
      nom: 'Sarah NABINTU',
      telephone: '+243990000006',
      email: 'sarah.nabintu@ebnnetwork.cd',
      passwordHash,
      role: Role.AGENT,
      siteId: siteBukavu.id,
      actif: true,
      langue: 'fr',
    },
  });

  // Formateur
  const formateur = await prisma.utilisateur.upsert({
    where: { telephone: '+243990000007' },
    update: { passwordHash, role: Role.FORMATEUR, siteId: siteGoma.id },
    create: {
      id: 'user-formateur-001',
      nom: 'Eric BAHATI',
      telephone: '+243990000007',
      email: 'eric.bahati@ebnnetwork.cd',
      passwordHash,
      role: Role.FORMATEUR,
      siteId: siteGoma.id,
      actif: true,
      langue: 'fr',
    },
  });

  console.log('  ✓ 8 Utilisateurs créés (Super Admin, Dir. Régional, Gérants, Agents, Formateur)');

  // ============================================
  // 3. MLM LEVELS (8 niveaux)
  // ============================================
  console.log('⭐ 3. Configuration des 8 niveaux MLM...');

  const mlmLevelsData = [
    { ordre: 1, nom: 'Builder', filleulsRequis: 4, commissionParFilleul: 6, commissionTotale: 24, bonusDescription: 'Deux pagnes en nature', salaireMensuel: 0, salaireActif: false, couleur: '#f59e0b', icone: 'hammer' },
    { ordre: 2, nom: 'Sapphire', filleulsRequis: 4, commissionParFilleul: 12.5, commissionTotale: 50, bonusDescription: 'Premier kit alimentaire', salaireMensuel: 0, salaireActif: false, couleur: '#3b82f6', icone: 'gem' },
    { ordre: 3, nom: 'Ruby', filleulsRequis: 4, commissionParFilleul: 20, commissionTotale: 80, bonusDescription: 'Deuxième kit alimentaire', salaireMensuel: 0, salaireActif: false, couleur: '#ef4444', icone: 'sparkles' },
    { ordre: 4, nom: 'Emerald', filleulsRequis: 4, commissionParFilleul: 50, commissionTotale: 200, bonusDescription: 'Écran plat de 5 pouces / équipement', salaireMensuel: 50, salaireActif: true, couleur: '#10b981', icone: 'tv' },
    { ordre: 5, nom: 'Diamond', filleulsRequis: 4, commissionParFilleul: 250, commissionTotale: 1000, bonusDescription: 'Moto de luxe + salaire', salaireMensuel: 200, salaireActif: true, couleur: '#06b6d4', icone: 'bike' },
    { ordre: 6, nom: 'Crown Diamond', filleulsRequis: 4, commissionParFilleul: 500, commissionTotale: 2000, bonusDescription: 'Voiture de luxe + salaire', salaireMensuel: 500, salaireActif: true, couleur: '#8b5cf6', icone: 'crown' },
    { ordre: 7, nom: 'Ambassadeur', filleulsRequis: 4, commissionParFilleul: 5000, commissionTotale: 20000, bonusDescription: 'Voiture de luxe + salaire + maison/tour', salaireMensuel: 1500, salaireActif: true, couleur: '#6366f1', icone: 'globe' },
    { ordre: 8, nom: 'Crown Ambassadeur', filleulsRequis: 4, commissionParFilleul: 12500, commissionTotale: 50000, bonusDescription: 'Voiture de luxe + maison de grande valeur + salaire', salaireMensuel: 3000, salaireActif: true, couleur: '#d97706', icone: 'award' },
  ];

  const dbLevels: Record<number, any> = {};
  for (const level of mlmLevelsData) {
    const saved = await prisma.mlmLevel.upsert({
      where: { ordre: level.ordre },
      update: level,
      create: level,
    });
    dbLevels[level.ordre] = saved;
  }
  console.log(`  ✓ ${mlmLevelsData.length} niveaux MLM validés`);

  // ============================================
  // 4. PRODUITS & CATALOGUE
  // ============================================
  console.log('📦 4. Création des produits et gestion des stocks...');

  const produitsData = [
    { sku: 'PROD-RECIT-01', nom: 'Récit d\'Adhésion EBN Network', categorie: 'Adhésion', description: 'Livret d\'adhésion officiel et carte membre EBN', prixAchat: 10000, prixVente: 25000 },
    { sku: 'PROD-PACK-01',  nom: 'Pack Starter Santé EBN', categorie: 'Packs', description: 'Pack de démarrage contenant 3 compléments bio', prixAchat: 45000, prixVente: 75000 },
    { sku: 'PROD-PACK-02',  nom: 'Pack Business EBN Premium', categorie: 'Packs', description: 'Pack complet avec échantillons, produits et supports', prixAchat: 120000, prixVente: 180000 },
    { sku: 'PROD-BIO-01',   nom: 'Spiruline Pure Bio 100g', categorie: 'Compléments', description: 'Super-aliment riche en protéines et fer', prixAchat: 15000, prixVente: 28000 },
    { sku: 'PROD-BIO-02',   nom: 'Thé Vert Détox & Minceur', categorie: 'Compléments', description: 'Infusion antioxydante aux herbes naturelles', prixAchat: 8000, prixVente: 16000 },
    { sku: 'PROD-BIO-03',   nom: 'Gélules Ginseng & Vitalité', categorie: 'Compléments', description: 'Renforce le tonus physique et mental', prixAchat: 22000, prixVente: 40000 },
    { sku: 'PROD-COS-01',   nom: 'Savon Noir Purifiant Bio', categorie: 'Cosmétiques', description: 'Soin dermatologique purifiant pour le visage et corps', prixAchat: 4000, prixVente: 8500 },
    { sku: 'PROD-COS-02',   nom: 'Crème Hydratante Karité & Aloé', categorie: 'Cosmétiques', description: 'Nourrit intensément et protège la peau', prixAchat: 14000, prixVente: 26000 },
    { sku: 'PROD-MED-01',   nom: 'Tensiomètre Électronique EBN', categorie: 'Équipements', description: 'Appareil médical de suivi de tension artérielle', prixAchat: 65000, prixVente: 110000 },
  ];

  const dbProduits: Record<string, any> = {};
  for (const p of produitsData) {
    const saved = await prisma.produit.upsert({
      where: { sku: p.sku },
      update: p,
      create: p,
    });
    dbProduits[p.sku] = saved;
  }

  // Stock par site
  const stockConfig = [
    // Goma
    { sku: 'PROD-RECIT-01', siteId: siteGoma.id, qte: 120, seuil: 15 },
    { sku: 'PROD-PACK-01',  siteId: siteGoma.id, qte: 45,  seuil: 10 },
    { sku: 'PROD-PACK-02',  siteId: siteGoma.id, qte: 25,  seuil: 5 },
    { sku: 'PROD-BIO-01',   siteId: siteGoma.id, qte: 80,  seuil: 12 },
    { sku: 'PROD-BIO-02',   siteId: siteGoma.id, qte: 60,  seuil: 10 },
    { sku: 'PROD-BIO-03',   siteId: siteGoma.id, qte: 35,  seuil: 8 },
    { sku: 'PROD-COS-01',   siteId: siteGoma.id, qte: 90,  seuil: 15 },
    { sku: 'PROD-COS-02',   siteId: siteGoma.id, qte: 40,  seuil: 10 },
    { sku: 'PROD-MED-01',   siteId: siteGoma.id, qte: 3,   seuil: 5 },

    // Bukavu
    { sku: 'PROD-RECIT-01', siteId: siteBukavu.id, qte: 85,  seuil: 15 },
    { sku: 'PROD-PACK-01',  siteId: siteBukavu.id, qte: 30,  seuil: 10 },
    { sku: 'PROD-PACK-02',  siteId: siteBukavu.id, qte: 15,  seuil: 5 },
    { sku: 'PROD-BIO-01',   siteId: siteBukavu.id, qte: 40,  seuil: 12 },
    { sku: 'PROD-BIO-02',   siteId: siteBukavu.id, qte: 2,   seuil: 10 },
    { sku: 'PROD-BIO-03',   siteId: siteBukavu.id, qte: 20,  seuil: 8 },
    { sku: 'PROD-COS-01',   siteId: siteBukavu.id, qte: 50,  seuil: 15 },
    { sku: 'PROD-COS-02',   siteId: siteBukavu.id, qte: 25,  seuil: 10 },
    { sku: 'PROD-MED-01',   siteId: siteBukavu.id, qte: 8,   seuil: 5 },

    // Kinshasa
    { sku: 'PROD-RECIT-01', siteId: siteKinshasa.id, qte: 200, seuil: 25 },
    { sku: 'PROD-PACK-01',  siteId: siteKinshasa.id, qte: 70,  seuil: 15 },
    { sku: 'PROD-PACK-02',  siteId: siteKinshasa.id, qte: 50,  seuil: 10 },
    { sku: 'PROD-BIO-01',   siteId: siteKinshasa.id, qte: 110, seuil: 20 },
    { sku: 'PROD-BIO-02',   siteId: siteKinshasa.id, qte: 95,  seuil: 15 },
    { sku: 'PROD-BIO-03',   siteId: siteKinshasa.id, qte: 60,  seuil: 12 },
    { sku: 'PROD-COS-01',   siteId: siteKinshasa.id, qte: 140, seuil: 20 },
    { sku: 'PROD-COS-02',   siteId: siteKinshasa.id, qte: 65,  seuil: 15 },
    { sku: 'PROD-MED-01',   siteId: siteKinshasa.id, qte: 18,  seuil: 8 },
  ];

  for (const sc of stockConfig) {
    const p = dbProduits[sc.sku];
    if (p) {
      await prisma.stockSite.upsert({
        where: { produitId_siteId: { produitId: p.id, siteId: sc.siteId } },
        update: { quantite: sc.qte, seuilAlerte: sc.seuil },
        create: { produitId: p.id, siteId: sc.siteId, quantite: sc.qte, seuilAlerte: sc.seuil },
      });
    }
  }

  // ============================================
  // 5. CLIENTS ET ARBRE MLM COMPLET (Format AAAAMJXXXX)
  // ============================================
  console.log('👥 5. Création des clients et du réseau MLM avec matricules AAAAMJXXXX...');

  // Définition des profils de clients
  // Format matricule: 202608010001, 202608010002, etc.
  const clientsDefinitions = [
    // --- NIVEAU 5 RACINE ---
    {
      id: 'cli-001',
      prenom: 'Séraphin',
      nom: 'BAGALWA',
      telephone: '+243991110001',
      email: 'seraphin.client@ebnnetwork.cd',
      matricule: '202608010001',
      statut: StatutClient.ACTIF,
      siteId: siteGoma.id,
      parrainMatricule: undefined,
      levelOrdre: 5,
      soldePortefeuille: 680.00,
      totalGagne: 1240.00,
      // Filleuls directs assignés dans ses 4 positions :
      filleulsIds: ['cli-002', 'cli-003', 'cli-004', 'cli-005'],
    },
    // --- NIVEAU 4 FILLEULS DE SERAPHIN ---
    {
      id: 'cli-002',
      prenom: 'Justin',
      nom: 'KASONGO',
      telephone: '+243991110002',
      email: 'justin.c@ebnnetwork.cd',
      matricule: '202608010002',
      statut: StatutClient.ACTIF,
      siteId: siteGoma.id,
      parrainMatricule: '202608010001',
      levelOrdre: 4,
      soldePortefeuille: 340.00,
      totalGagne: 400.00,
      filleulsIds: ['cli-006', 'cli-007', 'cli-008', 'cli-009'],
    },
    {
      id: 'cli-003',
      prenom: 'Aline',
      nom: 'MUGISHO',
      telephone: '+243991110003',
      email: 'aline.c@ebnnetwork.cd',
      matricule: '202608010003',
      statut: StatutClient.ACTIF,
      siteId: siteBukavu.id,
      parrainMatricule: '202608010001',
      levelOrdre: 3,
      soldePortefeuille: 160.00,
      totalGagne: 200.00,
      filleulsIds: ['cli-010', 'cli-011', 'cli-012'],
    },
    {
      id: 'cli-004',
      prenom: 'Patrick',
      nom: 'ILUNGA',
      telephone: '+243991110004',
      email: 'patrick.c@ebnnetwork.cd',
      matricule: '202608010004',
      statut: StatutClient.ACTIF,
      siteId: siteKinshasa.id,
      parrainMatricule: '202608010001',
      levelOrdre: 2,
      soldePortefeuille: 95.00,
      totalGagne: 100.00,
      filleulsIds: [],
    },
    {
      id: 'cli-005',
      prenom: 'Clarisse',
      nom: 'NEEMA',
      telephone: '+243991110005',
      email: 'clarisse.n@ebnnetwork.cd',
      matricule: '202608010005',
      statut: StatutClient.ACTIF,
      siteId: siteGoma.id,
      parrainMatricule: '202608010001',
      levelOrdre: 2,
      soldePortefeuille: 60.00,
      totalGagne: 60.00,
      filleulsIds: [],
    },
    // --- NIVEAU 2 & 1 FILLEULS DE JUSTIN (cli-002) ---
    {
      id: 'cli-006',
      prenom: 'Gloire',
      nom: 'MUSHAGALUSA',
      telephone: '+243991110006',
      email: 'gloire.m@ebnnetwork.cd',
      matricule: '202608010006',
      statut: StatutClient.ACTIF,
      siteId: siteGoma.id,
      parrainMatricule: '202608010002',
      levelOrdre: 2,
      soldePortefeuille: 45.00,
      totalGagne: 60.00,
      filleulsIds: [],
    },
    {
      id: 'cli-007',
      prenom: 'Espoir',
      nom: 'BARAKA',
      telephone: '+243991110007',
      email: 'espoir.b@ebnnetwork.cd',
      matricule: '202608010007',
      statut: StatutClient.ACTIF,
      siteId: siteGoma.id,
      parrainMatricule: '202608010002',
      levelOrdre: 1,
      soldePortefeuille: 20.00,
      totalGagne: 20.00,
      filleulsIds: [],
    },
    {
      id: 'cli-008',
      prenom: 'Merveille',
      nom: 'KABUO',
      telephone: '+243991110008',
      email: 'merveille.k@ebnnetwork.cd',
      matricule: '202608010008',
      statut: StatutClient.ACTIF,
      siteId: siteGoma.id,
      parrainMatricule: '202608010002',
      levelOrdre: 1,
      soldePortefeuille: 30.00,
      totalGagne: 30.00,
      filleulsIds: [],
    },
    {
      id: 'cli-009',
      prenom: 'Samuel',
      nom: 'KASEREKA',
      telephone: '+243991110009',
      email: 'samuel.k@ebnnetwork.cd',
      matricule: '202608010009',
      statut: StatutClient.ACTIF,
      siteId: siteGoma.id,
      parrainMatricule: '202608010002',
      levelOrdre: 1,
      soldePortefeuille: 10.00,
      totalGagne: 10.00,
      filleulsIds: [],
    },
    // --- FILLEULS DE ALINE (cli-003) ---
    {
      id: 'cli-010',
      prenom: 'Bijoux',
      nom: 'CIBALONZA',
      telephone: '+243991110010',
      email: 'bijoux.c@ebnnetwork.cd',
      matricule: '202608010010',
      statut: StatutClient.ACTIF,
      siteId: siteBukavu.id,
      parrainMatricule: '202608010003',
      levelOrdre: 1,
      soldePortefeuille: 20.00,
      totalGagne: 20.00,
      filleulsIds: [],
    },
    {
      id: 'cli-011',
      prenom: 'Pacifique',
      nom: 'MURHULA',
      telephone: '+243991110011',
      email: 'pacifique.m@ebnnetwork.cd',
      matricule: '202608010011',
      statut: StatutClient.ACTIF,
      siteId: siteBukavu.id,
      parrainMatricule: '202608010003',
      levelOrdre: 1,
      soldePortefeuille: 10.00,
      totalGagne: 10.00,
      filleulsIds: [],
    },
    {
      id: 'cli-012',
      prenom: 'Dorcas',
      nom: 'ZAWADI',
      telephone: '+243991110012',
      email: 'dorcas.z@ebnnetwork.cd',
      matricule: '202608010012',
      statut: StatutClient.ACTIF,
      siteId: siteBukavu.id,
      parrainMatricule: '202608010003',
      levelOrdre: 1,
      soldePortefeuille: 40.00,
      totalGagne: 40.00,
      filleulsIds: [],
    },
    // --- CLIENTS EN ONBOARDING EN COURS ---
    {
      id: 'cli-013',
      prenom: 'Moïse',
      nom: 'KATEMBO',
      telephone: '+243991110013',
      email: 'moise.k@ebnnetwork.cd',
      matricule: undefined,
      statut: StatutClient.EN_COURS,
      siteId: siteGoma.id,
      parrainMatricule: '202608010001',
      etapeActive: EtapeOnboarding.FORMATION,
    },
    {
      id: 'cli-014',
      prenom: 'Nathalie',
      nom: 'KAVIRA',
      telephone: '+243991110014',
      email: 'nathalie.k@ebnnetwork.cd',
      matricule: undefined,
      statut: StatutClient.EN_COURS,
      siteId: siteBukavu.id,
      parrainMatricule: '202608010003',
      etapeActive: EtapeOnboarding.FICHE,
    },
    {
      id: 'cli-015',
      prenom: 'Jonathan',
      nom: 'MUKENDI',
      telephone: '+243991110015',
      email: 'jonathan.m@ebnnetwork.cd',
      matricule: undefined,
      statut: StatutClient.EN_COURS,
      siteId: siteKinshasa.id,
      parrainMatricule: '202608010004',
      etapeActive: EtapeOnboarding.ACTIVATION,
    },
  ];

  const dbClients: Record<string, any> = {};
  const dbMembres: Record<string, any> = {};

  // 1. Création des enregistrements Client
  for (const c of clientsDefinitions) {
    const client = await prisma.client.upsert({
      where: { telephone: c.telephone },
      update: {
        prenom: c.prenom,
        nom: c.nom,
        email: c.email,
        codeParrain: c.matricule,
        statut: c.statut,
        siteInscriptionId: c.siteId,
        dateActivation: c.statut === StatutClient.ACTIF ? new Date(Date.now() - 30 * 24 * 3600 * 1000) : null,
      },
      create: {
        id: c.id,
        prenom: c.prenom,
        nom: c.nom,
        telephone: c.telephone,
        email: c.email,
        codeParrain: c.matricule,
        statut: c.statut,
        siteInscriptionId: c.siteId,
        createdById: agentGoma.id,
        dateActivation: c.statut === StatutClient.ACTIF ? new Date(Date.now() - 30 * 24 * 3600 * 1000) : null,
      },
    });
    dbClients[c.id] = client;

    // Étapes d'onboarding
    if (c.statut === StatutClient.ACTIF) {
      const etapes = [
        { etape: EtapeOnboarding.RECIT, montant: 25000, statut: StatutEtape.COMPLETE },
        { etape: EtapeOnboarding.FORMATION, montant: null, statut: StatutEtape.COMPLETE },
        { etape: EtapeOnboarding.FICHE, montant: null, statut: StatutEtape.COMPLETE },
        { etape: EtapeOnboarding.ACTIVATION, montant: 75000, statut: StatutEtape.COMPLETE },
      ];
      for (const e of etapes) {
        await prisma.onboardingEtape.upsert({
          where: { clientId_etape: { clientId: client.id, etape: e.etape } },
          update: { statut: e.statut, montant: e.montant },
          create: {
            clientId: client.id,
            etape: e.etape,
            statut: e.statut,
            montant: e.montant,
            modePaiement: e.montant ? ModePaiement.CASH : null,
            agentId: agentGoma.id,
            siteId: c.siteId,
            completeeAt: new Date(Date.now() - 30 * 24 * 3600 * 1000),
          },
        });
      }
    }
  }

  // 2. Création des enregistrements Membre (parrainage résolu)
  for (const c of clientsDefinitions) {
    if (c.statut !== StatutClient.ACTIF || !c.matricule || !c.levelOrdre) continue;

    const level = dbLevels[c.levelOrdre];
    const client = dbClients[c.id];

    // Résolution du parrain
    let parrainId: string | null = null;
    if (c.parrainMatricule) {
      const parrainDef = clientsDefinitions.find(x => x.matricule === c.parrainMatricule);
      if (parrainDef) {
        parrainId = `mem-${parrainDef.id}`;
      }
    }

    const membre = await prisma.membre.upsert({
      where: { clientId: client.id },
      update: {
        id: `mem-${c.id}`,
        matricule: c.matricule,
        mlmLevelId: level.id,
        parrainId,
        statut: MembreStatut.ACTIF,
      },
      create: {
        id: `mem-${c.id}`,
        clientId: client.id,
        matricule: c.matricule,
        mlmLevelId: level.id,
        parrainId,
        statut: MembreStatut.ACTIF,
        dateActivation: new Date(Date.now() - 25 * 24 * 3600 * 1000),
      },
    });
    dbMembres[c.id] = membre;

    // Portefeuille USD
    const portefeuille = await prisma.portefeuille.upsert({
      where: { membreId: membre.id },
      update: { soldeDisponible: c.soldePortefeuille ?? 0, totalGagne: c.totalGagne ?? 0 },
      create: {
        membreId: membre.id,
        soldeDisponible: c.soldePortefeuille ?? 0,
        totalGagne: c.totalGagne ?? 0,
      },
    });

    // Transactions de portefeuille
    await prisma.transactionPortefeuille.createMany({
      data: [
        {
          portefeuilleId: portefeuille.id,
          type: TransactionType.COMMISSION,
          montant: 40.00,
          description: 'Commissions 4 filleuls validés - Niveau 1',
          createdAt: new Date(Date.now() - 20 * 24 * 3600 * 1000),
        },
        {
          portefeuilleId: portefeuille.id,
          type: TransactionType.PROMOTION,
          montant: 60.00,
          description: 'Bonus promotion Niveau 2',
          createdAt: new Date(Date.now() - 15 * 24 * 3600 * 1000),
        },
        ...(c.levelOrdre >= 5 ? [
          {
            portefeuilleId: portefeuille.id,
            type: TransactionType.SALAIRE,
            montant: 100.00,
            description: 'Salaire mensuel Niveau 5 - Mois 07/2026',
            createdAt: new Date(Date.now() - 10 * 24 * 3600 * 1000),
          },
        ] : []),
      ],
      skipDuplicates: true,
    }).catch(() => {});
  }

  // 3. Création des Matrices et Assignation des Positions (Filleuls réels)
  for (const c of clientsDefinitions) {
    if (c.statut !== StatutClient.ACTIF || !c.levelOrdre) continue;
    const membre = dbMembres[c.id];
    if (!membre) continue;

    const filleulsList = (c as any).filleulsIds ?? [];

    for (let lvl = 1; lvl <= c.levelOrdre; lvl++) {
      const isCurrentLevel = (lvl === c.levelOrdre);
      const filleulsCount = isCurrentLevel ? filleulsList.length : 4;
      const isComplete = !isCurrentLevel || filleulsCount >= 4;

      const matrix = await prisma.matrix.upsert({
        where: { membreId_mlmLevelId: { membreId: membre.id, mlmLevelId: dbLevels[lvl].id } },
        update: { filleulsValides: filleulsCount, estComplete: isComplete },
        create: {
          membreId: membre.id,
          mlmLevelId: dbLevels[lvl].id,
          filleulsValides: filleulsCount,
          estComplete: isComplete,
          dateComplete: isComplete ? new Date(Date.now() - (c.levelOrdre - lvl) * 5 * 24 * 3600 * 1000) : null,
        },
      });

      // Remplissage des 4 positions avec les vrais filleuls
      for (let pos = 1; pos <= 4; pos++) {
        const filleulClientId = isCurrentLevel ? filleulsList[pos - 1] : undefined;
        const filleulMembre = filleulClientId ? dbMembres[filleulClientId] : undefined;
        const estValide = !isCurrentLevel || !!filleulMembre;

        await prisma.position.upsert({
          where: { matrixId_numeroPosition: { matrixId: matrix.id, numeroPosition: pos } },
          update: {
            filleulId: filleulMembre?.id ?? null,
            estValide,
            dateValidation: estValide ? new Date() : null,
          },
          create: {
            matrixId: matrix.id,
            numeroPosition: pos,
            filleulId: filleulMembre?.id ?? null,
            estValide,
            dateValidation: estValide ? new Date() : null,
          },
        });
      }
    }
  }

  // Historique des promotions & Bonus attribués pour Séraphin Bagalwa
  const membreSeraphin = dbMembres['cli-001'];
  if (membreSeraphin) {
    // Promotions
    await prisma.promotion.createMany({
      data: [
        { membreId: membreSeraphin.id, niveauAvantId: 1, niveauApresId: 2, commissionVersee: 60, declencheParId: 'auto' },
        { membreId: membreSeraphin.id, niveauAvantId: 2, niveauApresId: 3, commissionVersee: 100, declencheParId: 'auto' },
        { membreId: membreSeraphin.id, niveauAvantId: 3, niveauApresId: 4, commissionVersee: 200, declencheParId: 'auto' },
        { membreId: membreSeraphin.id, niveauAvantId: 4, niveauApresId: 5, commissionVersee: 400, declencheParId: 'auto' },
      ],
      skipDuplicates: true,
    }).catch(() => {});

    // Bonus physiques
    await prisma.bonusAttribue.createMany({
      data: [
        {
          membreId: membreSeraphin.id,
          mlmLevelId: dbLevels[2].id,
          description: 'Kit Santé EBN + Polo Officiel',
          statut: BonusStatut.LIVRE,
          dateAttribution: new Date(Date.now() - 20 * 24 * 3600 * 1000),
          dateLivraison: new Date(Date.now() - 18 * 24 * 3600 * 1000),
        },
        {
          membreId: membreSeraphin.id,
          mlmLevelId: dbLevels[3].id,
          description: 'Smartphone Android 4G EBN',
          statut: BonusStatut.LIVRE,
          dateAttribution: new Date(Date.now() - 15 * 24 * 3600 * 1000),
          dateLivraison: new Date(Date.now() - 12 * 24 * 3600 * 1000),
        },
        {
          membreId: membreSeraphin.id,
          mlmLevelId: dbLevels[4].id,
          description: 'Ordinateur Portable & Formation Pro',
          statut: BonusStatut.LIVRE,
          dateAttribution: new Date(Date.now() - 10 * 24 * 3600 * 1000),
          dateLivraison: new Date(Date.now() - 8 * 24 * 3600 * 1000),
        },
        {
          membreId: membreSeraphin.id,
          mlmLevelId: dbLevels[5].id,
          description: 'Voyage International de Découverte',
          statut: BonusStatut.EN_ATTENTE,
          dateAttribution: new Date(Date.now() - 3 * 24 * 3600 * 1000),
        },
      ],
      skipDuplicates: true,
    }).catch(() => {});

    // Salaires versés
    await prisma.salaireVerse.createMany({
      data: [
        { membreId: membreSeraphin.id, montant: 100.00, moisAnnee: '2026-07', statut: 'VERSE' },
        { membreId: membreSeraphin.id, montant: 100.00, moisAnnee: '2026-08', statut: 'VERSE' },
      ],
      skipDuplicates: true,
    }).catch(() => {});
  }

  console.log('  ✓ 15 Clients créés avec matricules AAAAMJXXXX, arbre MLM complet interconnecté et matrices 4 positions');

  // ============================================
  // 6. VENTES & HISTORIQUE COMMERCIAL
  // ============================================
  console.log('💰 6. Création des ventes et mouvements de caisse...');

  const ventesExemples = [
    {
      numeroVente: 'GOM-202608-0001',
      siteId: siteGoma.id,
      agentId: agentGoma.id,
      clientId: dbClients['cli-001'].id,
      modePaiement: ModePaiement.CASH,
      montantBrut: 75000,
      montantNet: 75000,
      montantRecu: 80000,
      monnaieRendue: 5000,
      articles: [{ produitId: dbProduits['PROD-PACK-01'].id, quantite: 1, prix: 75000 }],
      createdAt: new Date(Date.now() - 14 * 24 * 3600 * 1000),
    },
    {
      numeroVente: 'GOM-202608-0002',
      siteId: siteGoma.id,
      agentId: agentGoma.id,
      clientId: dbClients['cli-002'].id,
      modePaiement: ModePaiement.MPESA,
      referenceTransaction: 'MP-9382104',
      montantBrut: 56000,
      montantNet: 56000,
      articles: [{ produitId: dbProduits['PROD-BIO-01'].id, quantite: 2, prix: 28000 }],
      createdAt: new Date(Date.now() - 10 * 24 * 3600 * 1000),
    },
    {
      numeroVente: 'BUK-202608-0001',
      siteId: siteBukavu.id,
      agentId: agentBukavu.id,
      clientId: dbClients['cli-003'].id,
      modePaiement: ModePaiement.AIRTEL_MONEY,
      referenceTransaction: 'AM-4829103',
      montantBrut: 180000,
      montantNet: 180000,
      articles: [{ produitId: dbProduits['PROD-PACK-02'].id, quantite: 1, prix: 180000 }],
      createdAt: new Date(Date.now() - 7 * 24 * 3600 * 1000),
    },
    {
      numeroVente: 'GOM-202608-0003',
      siteId: siteGoma.id,
      agentId: agentGoma.id,
      clientId: dbClients['cli-006'].id,
      modePaiement: ModePaiement.CASH,
      montantBrut: 34500,
      montantNet: 34500,
      montantRecu: 35000,
      monnaieRendue: 500,
      articles: [
        { produitId: dbProduits['PROD-BIO-02'].id, quantite: 1, prix: 16000 },
        { produitId: dbProduits['PROD-COS-01'].id, quantite: 1, prix: 8500 },
        { produitId: dbProduits['PROD-COS-01'].id, quantite: 1, prix: 10000 },
      ],
      createdAt: new Date(Date.now() - 3 * 24 * 3600 * 1000),
    },
    {
      numeroVente: 'KIN-202608-0001',
      siteId: siteKinshasa.id,
      agentId: gerantKinshasa.id,
      clientId: dbClients['cli-004'].id,
      modePaiement: ModePaiement.VIREMENT,
      referenceTransaction: 'VIR-RAW-202608',
      montantBrut: 110000,
      montantNet: 110000,
      articles: [{ produitId: dbProduits['PROD-MED-01'].id, quantite: 1, prix: 110000 }],
      createdAt: new Date(Date.now() - 1 * 24 * 3600 * 1000),
    },
  ];

  for (const v of ventesExemples) {
    const existing = await prisma.vente.findUnique({ where: { numeroVente: v.numeroVente } });
    if (!existing) {
      await prisma.vente.create({
        data: {
          numeroVente: v.numeroVente,
          siteId: v.siteId,
          agentId: v.agentId,
          clientId: v.clientId,
          statut: StatutVente.VALIDE,
          montantBrut: v.montantBrut,
          montantNet: v.montantNet,
          modePaiement: v.modePaiement,
          referenceTransaction: v.referenceTransaction,
          montantRecu: v.montantRecu,
          monnaieRendue: v.monnaieRendue,
          createdAt: v.createdAt,
          lignes: {
            create: v.articles.map(a => ({
              produitId: a.produitId,
              quantite: a.quantite,
              prixUnitaire: a.prix,
              sousTotal: a.quantite * a.prix,
            })),
          },
        },
      });
    }
  }

  // Exemple de retour de marchandise avec avoir
  const firstVente = await prisma.vente.findFirst({ where: { numeroVente: 'GOM-202608-0002' } });
  if (firstVente) {
    await prisma.retour.create({
      data: {
        venteId: firstVente.id,
        numeroAvoir: 'AV-2026-0001',
        motif: 'PRODUIT_DEFECTUEUX',
        motifDescription: 'Flacon endommagé lors de la livraison',
        modeRemboursement: 'ESPECES',
        montantRembourse: 28000,
        stockRemis: false,
        agentId: agentGoma.id,
        lignes: {
          create: [{ produitId: dbProduits['PROD-BIO-01'].id, quantite: 1 }],
        },
      },
    }).catch(() => {});
  }

  console.log('  ✓ 5 Ventes multi-sites avec reçus et 1 retour avec document d\'avoir créés');

  // ============================================
  // 7. TICKETS DE SUPPORT
  // ============================================
  console.log('🎧 7. Création des tickets de support de démonstration...');

  const ticketsData = [
    {
      ticketRef: 'TCK-202608-001',
      nom: 'Justin KASONGO',
      email: 'justin.kasongo@ebnnetwork.cd',
      siteNom: 'EBN Network Goma',
      role: 'Gérant',
      type: TicketType.QUESTION,
      sujet: 'Question sur la synchronisation des stocks entre Goma et Bukavu',
      description: 'Bonjour, j\'ai expédié 20 flacons de Spiruline vers Bukavu hier. Pouvez-vous confirmer le statut de réception ?',
    },
    {
      ticketRef: 'TCK-202608-002',
      nom: 'Aline MUGISHO',
      email: 'aline.mugisho@ebnnetwork.cd',
      siteNom: 'EBN Network Bukavu',
      role: 'Gérant',
      type: TicketType.SUGGESTION,
      sujet: 'Ajout de moyens de paiement locaux supplémentaires',
      description: 'Serait-il possible d\'ajouter Orange Money dans les options de paiement des récits ? Beaucoup de nouveaux membres le demandent.',
    },
    {
      ticketRef: 'TCK-202608-003',
      nom: 'David CIRHUZA',
      email: 'david.cirhuza@ebnnetwork.cd',
      siteNom: 'EBN Network Goma',
      role: 'Agent Commercial',
      type: TicketType.CONFIG,
      sujet: 'Demande de configuration d\'une nouvelle imprimante de reçus thermique 80mm',
      description: 'Nous avons reçu une nouvelle imprimante Xprinter 80mm pour la caisse de Goma. Paramétrage format reçu validé.',
    },
  ];

  for (const t of ticketsData) {
    await prisma.supportTicket.upsert({
      where: { ticketRef: t.ticketRef },
      update: t,
      create: t,
    });
  }

  console.log('  ✓ 3 Tickets de support créés');

  // ============================================
  // 8. CONFIG GENERALE
  // ============================================
  console.log('⚙️  8. Vérification de la configuration générale...');

  const existingConfigGenerale = await prisma.configGenerale.findFirst();
  if (!existingConfigGenerale) {
    await prisma.configGenerale.create({
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
  }

  // ============================================
  // RÉSUMÉ FINAL
  // ============================================
  console.log('\n======================================================');
  console.log('🎉 SEED COMPLET EBN NETWORK TERMINÉ AVEC SUCCÈS !');
  console.log('======================================================');
  console.log('📊 Données prêtes pour tous les écrans :');
  console.log('  • Sites (3)         : Goma, Bukavu, Kinshasa');
  console.log('  • Utilisateurs (8)   : Super Admin (+243902238740), Dir. Régional, Gérants, Agents, Formateur');
  console.log('  • MLM Niveaux (8)   : Niveaux 1 à 7 + Crown Ambassadeur');
  console.log('  • Produits (9)      : Packs, Récits, Bio, Cosmétiques, Équipements (avec stocks & alertes)');
  console.log('  • Clients (15)      : Actifs + En attente (Matricules: 202608010001 à 202608010012)');
  console.log('  • Réseau MLM (12)   : Arbre complet de parrainage, Matrices 4 positions avec filleuls réels');
  console.log('  • Ventes & Caisses  : Multi-sites, multi-modes de paiement, Reçus, Avoirs OHADA');
  console.log('  • Support (3)       : Tickets avec statuts et types variés');
  console.log('======================================================\n');
}

main()
  .catch((e) => {
    console.error('❌ Erreur lors du seed enrichi:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
