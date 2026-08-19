import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const pfs = await prisma.portefeuille.count();
  const txs = await prisma.transactionPortefeuille.count();
  const comms = await prisma.commission.count();
  console.log('Portefeuilles:', pfs);
  console.log('Transactions:', txs);
  console.log('Commissions:', comms);

  if (pfs > 0) {
    const sample = await prisma.portefeuille.findMany({
      take: 3,
      include: { membre: { include: { client: true } } }
    });
    for (const pf of sample) {
      console.log(`- Portefeuille ${pf.id}: ${pf.membre.client.prenom} ${pf.membre.client.nom} | solde: ${pf.soldeDisponible}`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
