import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);

  try {
    const requiredModels = [
      'MlmLevel', 'Membre', 'Matrix', 'Position', 'Portefeuille',
      'TransactionPortefeuille', 'Promotion', 'BonusAttribue',
      'SalaireVerse', 'BonusRetraite',
    ];

    const [sites, users] = await Promise.all([
      prisma.site.count(),
      prisma.utilisateur.count(),
    ]);

    for (const model of requiredModels) {
      if (!(model in prisma)) {
        throw new Error(`Model ${model} is missing from Prisma Client`);
      }
    }

    console.log('✅ Connected to Prisma Postgres');
    console.log(`   Sites    : ${sites}`);
    console.log(`   Utilisateurs : ${users}`);
  } catch (err) {
    console.error('❌ Connection failed:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main();
