import { builder, lot, member, progressData, summary } from './task6.fixtures';

export const progressiveBuilder = {
  matrixId: 'progressive-builder', generation: 1, levelName: 'Builder', capacity: 4,
  currentValidPositions: 1, accountedPositions: 2,
  budgetTotal: '40.00', budgetImmediate: '24.00', budgetHeld: '16.00',
  generatedTotal: '20.00', pendingTotal: '10.00', validatedTotal: '0.00', cancelledTotal: '10.00',
  immediateCredited: '0.00', heldAmount: '0.00', releasableAmount: '0.00', releasedAmount: '0.00',
  remainingTotal: '20.00', suspendedReason: null,
};

export const progressiveSapphire = {
  ...progressiveBuilder, matrixId: 'progressive-sapphire', generation: 2, levelName: 'Sapphire',
  capacity: 16, currentValidPositions: 1, accountedPositions: 1,
  budgetTotal: '83.33', budgetImmediate: '50.00', budgetHeld: '33.33',
  generatedTotal: '5.21', pendingTotal: '0.00', validatedTotal: '5.21', cancelledTotal: '0.00',
  immediateCredited: '3.13', heldAmount: '2.08', remainingTotal: '78.12',
};

export const progressiveRows = [progressiveBuilder, progressiveSapphire];
export const progressiveCommission = {
  id: 'progressive-commission', membre: member, level: builder, filleul: member,
  montant: '10.00', montantSysteme: '6.00', montantRetour: '4.00',
  statut: 'EN_ATTENTE', createdAt: '2026-09-21T08:00:00Z',
  progressFrom: 0, progressTo: 1, origin: 'PROGRESSIVE', calculationVersion: 'v1',
};
export const catchupCommission = {
  ...progressiveCommission, id: 'catchup-commission', filleul: null,
  progressFrom: 1, progressTo: 3, origin: 'CATCH_UP',
  montant: '20.00', montantSysteme: '12.00', montantRetour: '8.00',
};
export const legacyCommission = {
  id: 'legacy-commission', membre: member, level: builder, filleul: member,
  montant: '40.00', montantSysteme: '24.00', montantRetour: '16.00',
  statut: 'PAYEE', createdAt: '2026-09-17T08:00:00Z', reinvestLot: lot,
};
export const progressiveProgress = {
  ...progressData, progressiveCommissions: progressiveRows,
  commissions: [progressiveCommission, catchupCommission, legacyCommission],
};
export const progressiveWallet = {
  wallet: { soldeDisponible: 9, soldeDisponibleRetrait: 7, soldeReserve: 2, soldeReinvesti: 16, totalGagne: 40 },
  financialSummary: summary, reinvestLots: [lot], stats: { gainsTotaux: 40 },
  progressiveCommissions: progressiveRows,
};
