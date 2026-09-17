import { Prisma, TransactionType } from '@prisma/client';

const RELEASE_REFERENCE_PREFIX = 'release:';

export const excludeHeldReleaseTransfers: Prisma.TransactionPortefeuilleWhereInput = {
  OR: [
    { type: { not: TransactionType.REINVESTISSEMENT } },
    { referenceId: null },
    { referenceId: { not: { startsWith: RELEASE_REFERENCE_PREFIX } } },
  ],
};

export function walletJournalKind(entry: { type: TransactionType; referenceId: string | null }) {
  if (entry.type !== TransactionType.REINVESTISSEMENT) return entry.type;
  return entry.referenceId?.startsWith(RELEASE_REFERENCE_PREFIX) ? 'HELD_RELEASE_TRANSFER' : 'HELD_CREDIT';
}
