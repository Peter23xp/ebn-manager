import { Prisma, PrismaClient } from '@prisma/client';
import { commissionAmounts } from '../src/modules/mlm/mlm-finance';

const definitions = [
  ['Builder', '24', '#f59e0b', 'hammer', '2 pagnes'],
  ['Sapphire', '50', '#3b82f6', 'gem', '1er kit alimentaire'],
  ['Ruby', '80', '#ef4444', 'sparkles', '2e kit alimentaire'],
  ['Emerald', '200', '#10b981', 'tv', 'Ecran plat 52 pouces'],
  ['Diamond', '1000', '#06b6d4', 'bike', 'Moto de luxe de 2 000 USD'],
  ['Crown Diamond', '2000', '#8b5cf6', 'crown', '1re voiture de 6 000 USD'],
  ['Ambassadeur', '20000', '#6366f1', 'globe', '1re maison de 30 000 USD + 2e voiture de 15 000 USD'],
  ['Crown Ambassadeur', '50000', '#d97706', 'award', '2e maison + 3e voiture'],
] as const;

export async function initializeMlmLevels(prisma: Pick<PrismaClient | Prisma.TransactionClient, 'mlmLevel'>) {
  const levels = [];
  for (const [index, [nom, immediate, couleur, icone, bonusDescription]] of definitions.entries()) {
    const amounts = commissionAmounts(immediate);
    const configuration = {
      nom, filleulsRequis: 4, commissionParFilleul: new Prisma.Decimal(0),
      commissionSysteme: amounts.immediate, commissionRetour: amounts.held, commissionTotale: amounts.total,
    };
    levels.push(await prisma.mlmLevel.upsert({
      where: { ordre: index + 1 }, update: configuration,
      create: { ...configuration, ordre: index + 1, couleur, icone, bonusDescription, isActive: true },
    }));
  }
  return levels;
}
