import { describe, expect, it } from '@jest/globals';
import { Prisma } from '@prisma/client';
import { readProgressiveSummaries } from './mlm-progressive-summary';

function fixture() {
  const level = { id: 1, ordre: 1, nom: 'Builder', isActive: true, commissionTotale: new Prisma.Decimal(80), commissionSysteme: new Prisma.Decimal(48), commissionRetour: new Prisma.Decimal(32) };
  const matrix: any = { id: 'matrix', mlmLevelId: 1, filleulsValides: 2, commissionPolicyVersion: 'v1', commissionAccountedPositions: 3, commissionBudgetTotal: new Prisma.Decimal(40), commissionBudgetImmediate: new Prisma.Decimal(24), commissionBudgetHeld: new Prisma.Decimal(16) };
  const groups = [
    { mlmLevelId: 1, statut: 'EN_ATTENTE', _count: { id: 1 }, _sum: { montant: new Prisma.Decimal(10), montantSysteme: new Prisma.Decimal(6), montantRetour: new Prisma.Decimal(4) } },
    { mlmLevelId: 1, statut: 'VALIDEE', _count: { id: 1 }, _sum: { montant: new Prisma.Decimal(10), montantSysteme: new Prisma.Decimal(6), montantRetour: new Prisma.Decimal(4) } },
    { mlmLevelId: 1, statut: 'ANNULEE', _count: { id: 1 }, _sum: { montant: new Prisma.Decimal(10), montantSysteme: new Prisma.Decimal(6), montantRetour: new Prisma.Decimal(4) } },
  ];
  const tx: any = {
    matrix: { findMany: async () => [matrix] },
    mlmLevel: { findMany: async () => [level] },
    commission: { groupBy: async ({ where }) => where.progressTo === null ? [] : groups, findMany: async () => [] },
    promotion: { groupBy: async () => [] }, bonusAttribue: { groupBy: async () => [] },
    $queryRaw: async ([query]) => query.includes('SUM(lot.amount)') ? [{ mlmLevelId: 1, status: 'HOLD_PERIOD', amount: new Prisma.Decimal(4) }] : [],
  };
  return { tx, level, matrix, groups };
}

describe('progressive financial read model', () => {
  it('reports frozen budgets and accounted rights separately from current positions and credits', async () => {
    const { tx } = fixture();
    expect(await readProgressiveSummaries(tx, 'member')).toEqual([{
      matrixId: 'matrix', generation: 1, levelName: 'Builder', capacity: 4, currentValidPositions: 2,
      accountedPositions: 3, budgetTotal: '40.00', budgetImmediate: '24.00', budgetHeld: '16.00',
      generatedTotal: '20.00', pendingTotal: '10.00', validatedTotal: '10.00', cancelledTotal: '10.00',
      immediateCredited: '6.00', heldAmount: '4.00', releasableAmount: '0.00', releasedAmount: '0.00',
      remainingTotal: '10.00', suspendedReason: null,
    }]);
  });

  it('shows unstarted generations without creating matrices', async () => {
    const { tx } = fixture();
    tx.matrix.findMany = async () => [];
    tx.commission.groupBy = async () => [];
    tx.$queryRaw = async () => [];
    expect((await readProgressiveSummaries(tx, 'member'))[0]).toMatchObject({ matrixId: null, accountedPositions: 0, budgetTotal: '80.00', remainingTotal: '80.00' });
  });

  it('uses a known historical full commission budget rather than newer settings', async () => {
    const { tx, matrix } = fixture();
    matrix.commissionPolicyVersion = null;
    matrix.commissionAccountedPositions = 0;
    matrix.commissionBudgetTotal = matrix.commissionBudgetImmediate = matrix.commissionBudgetHeld = null;
    tx.commission.findMany = async () => [{ mlmLevelId: 1, progressTo: null, progressFrom: null, matrixId: 'matrix', referenceId: 'generation:member:1', montant: new Prisma.Decimal(40), montantSysteme: new Prisma.Decimal(24), montantRetour: new Prisma.Decimal(16) }];
    tx.commission.groupBy = async ({ where }) => where.progressTo === null ? [{ mlmLevelId: 1, _count: { id: 1 } }] : [{ mlmLevelId: 1, statut: 'PAYEE', _count: { id: 1 }, _sum: { montant: new Prisma.Decimal(40), montantSysteme: new Prisma.Decimal(24), montantRetour: new Prisma.Decimal(16) } }];
    tx.promotion.groupBy = async () => [{ niveauApresId: 1, _count: { id: 1 } }];
    expect((await readProgressiveSummaries(tx, 'member'))[0]).toMatchObject({ budgetTotal: '40.00', accountedPositions: 4, remainingTotal: '0.00' });
  });

  it('marks inactive generation earnings as suspended', async () => {
    const { tx, level } = fixture();
    level.isActive = false;
    expect((await readProgressiveSummaries(tx, 'member'))[0].suspendedReason).toMatch(/désactivé/i);
  });

  it('suspends an unknown policy instead of inventing financial rights', async () => {
    const { tx, matrix } = fixture();
    matrix.commissionPolicyVersion = 'unknown';
    expect((await readProgressiveSummaries(tx, 'member'))[0]).toMatchObject({ budgetTotal: null, remainingTotal: null, accountedPositions: null, suspendedReason: expect.any(String), generatedTotal: '20.00' });
  });

  it('suspends missing financial history without making the wallet unavailable', async () => {
    const { tx, groups } = fixture();
    groups.length = 0;
    expect((await readProgressiveSummaries(tx, 'member'))[0]).toMatchObject({ remainingTotal: null, suspendedReason: expect.any(String), heldAmount: '4.00' });
  });

  it('isolates an incoherent budget to its generation', async () => {
    const { tx, matrix } = fixture();
    matrix.commissionBudgetHeld = new Prisma.Decimal(15);
    expect((await readProgressiveSummaries(tx, 'member'))[0]).toMatchObject({ budgetTotal: null, suspendedReason: expect.any(String), generatedTotal: '20.00' });
  });

  it('suspends ranges flagged by the database without hiding valid totals', async () => {
    const { tx } = fixture();
    tx.$queryRaw = async ([query]) => query.includes('SUM(lot.amount)') ? [] : [{ matrixId: 'matrix' }];
    expect((await readProgressiveSummaries(tx, 'member'))[0]).toMatchObject({ remainingTotal: null, suspendedReason: expect.any(String), generatedTotal: '20.00' });
  });

  it.each([-1, 5, 1.5])('suspends an invalid current generation counter %s', async current => {
    const { tx, matrix } = fixture();
    matrix.filleulsValides = current;
    expect((await readProgressiveSummaries(tx, 'member'))[0]).toMatchObject({ remainingTotal: null, accountedPositions: null, suspendedReason: expect.any(String), generatedTotal: '20.00' });
  });

  it('rejects an initialized legacy completion disguised as a partial larger budget', async () => {
    const { tx, matrix } = fixture();
    matrix.commissionAccountedPositions = 2;
    matrix.commissionBudgetTotal = new Prisma.Decimal(80);
    matrix.commissionBudgetImmediate = new Prisma.Decimal(48);
    matrix.commissionBudgetHeld = new Prisma.Decimal(32);
    tx.commission.findMany = async () => [{ mlmLevelId: 1, progressTo: null, progressFrom: null, matrixId: 'matrix', referenceId: 'generation:member:1', montant: new Prisma.Decimal(40), montantSysteme: new Prisma.Decimal(24), montantRetour: new Prisma.Decimal(16) }];
    tx.commission.groupBy = async ({ where }) => where.progressTo === null ? [{ mlmLevelId: 1, _count: { id: 1 } }] : [{ mlmLevelId: 1, statut: 'PAYEE', _count: { id: 1 }, _sum: { montant: new Prisma.Decimal(40), montantSysteme: new Prisma.Decimal(24), montantRetour: new Prisma.Decimal(16) } }];
    expect((await readProgressiveSummaries(tx, 'member'))[0]).toMatchObject({ budgetTotal: null, remainingTotal: null, accountedPositions: null, suspendedReason: expect.any(String), generatedTotal: '40.00' });
  });
});
