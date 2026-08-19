import { PrismaClient, CommissionStatut } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('Seeding MLM Commissions (Option B)...');

  const membres = await prisma.membre.findMany({
    include: { client: true, level: true, filleuls: { include: { client: true } } },
    orderBy: { mlmLevelId: 'desc' }
  });

  const levels = await prisma.mlmLevel.findMany({ orderBy: { ordre: 'asc' } });
  const levelMap = new Map(levels.map(l => [l.ordre, l]));

  // Clear existing commissions if any to avoid duplication
  await prisma.commission.deleteMany({});

  const commissionsData: any[] = [];

  // 1. Séraphin BAGALWA (Level 5 - Diamond)
  const seraphin = membres.find(m => m.matricule === '202608010001');
  const justin = membres.find(m => m.matricule === '202608010002');
  const aline = membres.find(m => m.matricule === '202608010003');
  const patrick = membres.find(m => m.matricule === '202608010004');
  const clarisse = membres.find(m => m.matricule === '202608010005');
  const gloire = membres.find(m => m.matricule === '202608010006');
  const espoir = membres.find(m => m.matricule === '202608010007');
  const merveille = membres.find(m => m.matricule === '202608010008');
  const samuel = membres.find(m => m.matricule === '202608010009');
  const bijoux = membres.find(m => m.matricule === '202608010010');
  const pacifique = membres.find(m => m.matricule === '202608010011');
  const dorcas = membres.find(m => m.matricule === '202608010012');

  if (seraphin && justin && aline && patrick && clarisse) {
    // Seraphin commissions
    commissionsData.push(
      {
        membreId: seraphin.id,
        filleulId: justin.id,
        mlmLevelId: levelMap.get(1)!.id,
        montant: 6.00,
        statut: CommissionStatut.PAYEE,
        referenceId: `COMM-SER-L1-01`,
        description: 'Commission parrainage Justin KASONGO (Niveau 1)',
        payeeAt: new Date(Date.now() - 25 * 86400000),
        valideeAt: new Date(Date.now() - 25 * 86400000),
        createdAt: new Date(Date.now() - 25 * 86400000),
      },
      {
        membreId: seraphin.id,
        filleulId: aline.id,
        mlmLevelId: levelMap.get(1)!.id,
        montant: 6.00,
        statut: CommissionStatut.PAYEE,
        referenceId: `COMM-SER-L1-02`,
        description: 'Commission parrainage Aline MUGISHO (Niveau 1)',
        payeeAt: new Date(Date.now() - 24 * 86400000),
        valideeAt: new Date(Date.now() - 24 * 86400000),
        createdAt: new Date(Date.now() - 24 * 86400000),
      },
      {
        membreId: seraphin.id,
        filleulId: patrick.id,
        mlmLevelId: levelMap.get(1)!.id,
        montant: 6.00,
        statut: CommissionStatut.PAYEE,
        referenceId: `COMM-SER-L1-03`,
        description: 'Commission parrainage Patrick ILUNGA (Niveau 1)',
        payeeAt: new Date(Date.now() - 23 * 86400000),
        valideeAt: new Date(Date.now() - 23 * 86400000),
        createdAt: new Date(Date.now() - 23 * 86400000),
      },
      {
        membreId: seraphin.id,
        filleulId: clarisse.id,
        mlmLevelId: levelMap.get(1)!.id,
        montant: 6.00,
        statut: CommissionStatut.PAYEE,
        referenceId: `COMM-SER-L1-04`,
        description: 'Commission parrainage Clarisse NEEMA (Niveau 1)',
        payeeAt: new Date(Date.now() - 22 * 86400000),
        valideeAt: new Date(Date.now() - 22 * 86400000),
        createdAt: new Date(Date.now() - 22 * 86400000),
      },
      // Seraphin Level 2 -> 3 promotions
      {
        membreId: seraphin.id,
        filleulId: justin.id,
        mlmLevelId: levelMap.get(2)!.id,
        montant: 12.50,
        statut: CommissionStatut.PAYEE,
        referenceId: `COMM-SER-L2-01`,
        description: 'Commission cycle Sapphire (Justin KASONGO)',
        payeeAt: new Date(Date.now() - 18 * 86400000),
        valideeAt: new Date(Date.now() - 18 * 86400000),
        createdAt: new Date(Date.now() - 18 * 86400000),
      },
      {
        membreId: seraphin.id,
        filleulId: aline.id,
        mlmLevelId: levelMap.get(2)!.id,
        montant: 12.50,
        statut: CommissionStatut.VALIDEE,
        referenceId: `COMM-SER-L2-02`,
        description: 'Commission cycle Sapphire (Aline MUGISHO)',
        valideeAt: new Date(Date.now() - 5 * 86400000),
        createdAt: new Date(Date.now() - 6 * 86400000),
      },
      {
        membreId: seraphin.id,
        filleulId: justin.id,
        mlmLevelId: levelMap.get(3)!.id,
        montant: 20.00,
        statut: CommissionStatut.VALIDEE,
        referenceId: `COMM-SER-L3-01`,
        description: 'Commission cycle Ruby (Justin KASONGO)',
        valideeAt: new Date(Date.now() - 3 * 86400000),
        createdAt: new Date(Date.now() - 4 * 86400000),
      },
      {
        membreId: seraphin.id,
        filleulId: justin.id,
        mlmLevelId: levelMap.get(4)!.id,
        montant: 50.00,
        statut: CommissionStatut.EN_ATTENTE,
        referenceId: `COMM-SER-L4-01`,
        description: 'Commission cycle Emerald (Justin KASONGO) — En attente validation admin',
        createdAt: new Date(Date.now() - 1 * 86400000),
      },
      {
        membreId: seraphin.id,
        filleulId: justin.id,
        mlmLevelId: levelMap.get(5)!.id,
        montant: 250.00,
        statut: CommissionStatut.EN_ATTENTE,
        referenceId: `COMM-SER-L5-01`,
        description: 'Commission cycle Diamond (Justin KASONGO) — En attente validation admin',
        createdAt: new Date(Date.now() - 12 * 3600000),
      }
    );
  }

  // 2. Justin KASONGO commissions (Level 4 - Emerald)
  if (justin && gloire && espoir && merveille && samuel) {
    commissionsData.push(
      {
        membreId: justin.id,
        filleulId: gloire.id,
        mlmLevelId: levelMap.get(1)!.id,
        montant: 6.00,
        statut: CommissionStatut.PAYEE,
        referenceId: `COMM-JUS-L1-01`,
        description: 'Commission parrainage Gloire MUSHAGALUSA (Niveau 1)',
        payeeAt: new Date(Date.now() - 15 * 86400000),
        valideeAt: new Date(Date.now() - 15 * 86400000),
        createdAt: new Date(Date.now() - 15 * 86400000),
      },
      {
        membreId: justin.id,
        filleulId: espoir.id,
        mlmLevelId: levelMap.get(1)!.id,
        montant: 6.00,
        statut: CommissionStatut.PAYEE,
        referenceId: `COMM-JUS-L1-02`,
        description: 'Commission parrainage Espoir BARAKA (Niveau 1)',
        payeeAt: new Date(Date.now() - 14 * 86400000),
        valideeAt: new Date(Date.now() - 14 * 86400000),
        createdAt: new Date(Date.now() - 14 * 86400000),
      },
      {
        membreId: justin.id,
        filleulId: merveille.id,
        mlmLevelId: levelMap.get(1)!.id,
        montant: 6.00,
        statut: CommissionStatut.VALIDEE,
        referenceId: `COMM-JUS-L1-03`,
        description: 'Commission parrainage Merveille KABUO (Niveau 1)',
        valideeAt: new Date(Date.now() - 4 * 86400000),
        createdAt: new Date(Date.now() - 5 * 86400000),
      },
      {
        membreId: justin.id,
        filleulId: samuel.id,
        mlmLevelId: levelMap.get(1)!.id,
        montant: 6.00,
        statut: CommissionStatut.EN_ATTENTE,
        referenceId: `COMM-JUS-L1-04`,
        description: 'Commission parrainage Samuel KASEREKA (Niveau 1)',
        createdAt: new Date(Date.now() - 2 * 86400000),
      },
      {
        membreId: justin.id,
        filleulId: gloire.id,
        mlmLevelId: levelMap.get(2)!.id,
        montant: 12.50,
        statut: CommissionStatut.EN_ATTENTE,
        referenceId: `COMM-JUS-L2-01`,
        description: 'Commission cycle Sapphire (Gloire MUSHAGALUSA)',
        createdAt: new Date(Date.now() - 1 * 86400000),
      }
    );
  }

  // 3. Aline MUGISHO commissions (Level 3 - Ruby)
  if (aline && bijoux && pacifique && dorcas) {
    commissionsData.push(
      {
        membreId: aline.id,
        filleulId: bijoux.id,
        mlmLevelId: levelMap.get(1)!.id,
        montant: 6.00,
        statut: CommissionStatut.PAYEE,
        referenceId: `COMM-ALI-L1-01`,
        description: 'Commission parrainage Bijoux CIBALONZA (Niveau 1)',
        payeeAt: new Date(Date.now() - 10 * 86400000),
        valideeAt: new Date(Date.now() - 10 * 86400000),
        createdAt: new Date(Date.now() - 10 * 86400000),
      },
      {
        membreId: aline.id,
        filleulId: pacifique.id,
        mlmLevelId: levelMap.get(1)!.id,
        montant: 6.00,
        statut: CommissionStatut.VALIDEE,
        referenceId: `COMM-ALI-L1-02`,
        description: 'Commission parrainage Pacifique MURHULA (Niveau 1)',
        valideeAt: new Date(Date.now() - 3 * 86400000),
        createdAt: new Date(Date.now() - 4 * 86400000),
      },
      {
        membreId: aline.id,
        filleulId: dorcas.id,
        mlmLevelId: levelMap.get(1)!.id,
        montant: 6.00,
        statut: CommissionStatut.EN_ATTENTE,
        referenceId: `COMM-ALI-L1-03`,
        description: 'Commission parrainage Dorcas ZAWADI (Niveau 1)',
        createdAt: new Date(Date.now() - 1 * 86400000),
      }
    );
  }

  // Insert all commissions
  for (const item of commissionsData) {
    await prisma.commission.create({ data: item });
  }

  console.log(`Successfully seeded ${commissionsData.length} commissions!`);
  const enAttente = commissionsData.filter(c => c.statut === CommissionStatut.EN_ATTENTE).length;
  const validee = commissionsData.filter(c => c.statut === CommissionStatut.VALIDEE).length;
  const payee = commissionsData.filter(c => c.statut === CommissionStatut.PAYEE).length;
  console.log(`- En attente : ${enAttente}`);
  console.log(`- Validées   : ${validee}`);
  console.log(`- Payées     : ${payee}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
