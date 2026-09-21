import { describe, expect, it } from '@jest/globals';
import { Prisma } from '@prisma/client';
import { MlmProgressiveService } from './mlm-progressive.service';

function fixture(count = 1) {
  const matrix: any = {
    id: 'matrix', membreId: 'parent', mlmLevelId: 1, filleulsValides: count,
    commissionAccountedPositions: 0, commissionBudgetTotal: null, commissionBudgetImmediate: null,
    commissionBudgetHeld: null, commissionPolicyVersion: null, commissionAccountedAt: null, generationRewardedAt: null,
    level: { id: 1, ordre: 1, nom: 'Builder', isActive: true, commissionTotale: new Prisma.Decimal(40), commissionSysteme: new Prisma.Decimal(24), commissionRetour: new Prisma.Decimal(16) },
  };
  const rows: any[] = [];
  const promotions: any[] = [];
  const bonuses: any[] = [];
  const tx: any = {
    $executeRaw: async () => 1,
    matrix: { findUniqueOrThrow: async () => matrix, update: async ({ data }) => Object.assign(matrix, data) },
    commission: {
      findMany: async () => [...rows].sort((first, second) => (first.progressTo ?? 0) - (second.progressTo ?? 0)),
      findFirst: async () => [...rows].sort((first, second) => (second.progressTo ?? 0) - (first.progressTo ?? 0))[0] ?? null,
      create: async ({ data }) => { const row = { id: `commission-${rows.length}`, createdAt: new Date(), ...data }; rows.push(row); return row; },
    },
    promotion: { findMany: async () => promotions },
    bonusAttribue: { findMany: async () => bonuses },
  };
  return { matrix, rows, promotions, bonuses, tx, service: new MlmProgressiveService() };
}

describe('progressive financial accounting', () => {
  it('previews without writes then creates a pending tranche with event provenance', async () => {
    const { service, tx, matrix, rows } = fixture();
    const preview = await service.preview(tx, matrix.id);
    expect(preview.proposed).toEqual({ total: '10.00', immediate: '6.00', held: '4.00' });
    expect(matrix.commissionPolicyVersion).toBeNull();
    expect(rows).toHaveLength(0);
    await service.account(tx, matrix.id, { id: 'placement:child', triggerId: 'child', actorId: 'admin', origin: 'PROGRESSIVE' });
    expect(matrix.commissionAccountedPositions).toBe(1);
    expect(rows[0]).toMatchObject({ statut: 'EN_ATTENTE', membreId: 'parent', filleulId: 'child', generationEventId: 'placement:child', generationActorId: 'admin', progressFrom: 0, progressTo: 1 });
    expect(rows[0].montant.toFixed(2)).toBe('10.00');
  });

  it('never re-earns a removed or cancelled position', async () => {
    const { service, tx, matrix, rows } = fixture(3);
    await service.account(tx, matrix.id, { id: 'initial', origin: 'PROGRESSIVE' });
    rows[0].statut = 'ANNULEE';
    for (const count of [2, 3, 3, 4, 4]) {
      matrix.filleulsValides = count;
      await service.account(tx, matrix.id, { id: `event:${count}`, origin: 'PROGRESSIVE' });
    }
    expect(rows.map(row => row.montant.toFixed(2))).toEqual(['30.00', '10.00']);
    expect(matrix.commissionAccountedPositions).toBe(4);
  });

  it.each(['EN_ATTENTE', 'VALIDEE', 'PAYEE', 'ANNULEE'])('consumes an entire historical budget in status %s', async statut => {
    const { service, tx, matrix, rows, promotions } = fixture(2);
    promotions.push({ id: 'promotion', datePromotion: new Date() });
    rows.push({ id: 'old', referenceId: 'generation:parent:1', progressFrom: null, progressTo: null, matrixId: 'matrix', montant: new Prisma.Decimal(40), montantSysteme: new Prisma.Decimal(24), montantRetour: new Prisma.Decimal(16), createdAt: new Date(), statut });
    await service.account(tx, matrix.id, { id: 'catchup', origin: 'CATCH_UP' });
    expect(rows).toHaveLength(1);
    expect(matrix.commissionAccountedPositions).toBe(4);
    expect(matrix.generationRewardedAt).toBeInstanceOf(Date);
  });

  it('freezes a started budget across a configuration edit', async () => {
    const { service, tx, matrix, rows } = fixture();
    await service.account(tx, matrix.id, { id: 'first', origin: 'PROGRESSIVE' });
    matrix.level.commissionTotale = new Prisma.Decimal(80);
    matrix.level.commissionSysteme = new Prisma.Decimal(48);
    matrix.level.commissionRetour = new Prisma.Decimal(32);
    matrix.filleulsValides = 2;
    await service.account(tx, matrix.id, { id: 'second', origin: 'PROGRESSIVE' });
    expect(rows.map(row => row.montant.toFixed(2))).toEqual(['10.00', '10.00']);
  });

  it('does not freeze an unused or disabled budget', async () => {
    const { service, tx, matrix, rows } = fixture(0);
    await service.account(tx, matrix.id, { id: 'zero', origin: 'PROGRESSIVE' });
    matrix.filleulsValides = 1;
    matrix.level.isActive = false;
    await service.account(tx, matrix.id, { id: 'disabled', origin: 'PROGRESSIVE' });
    expect(rows).toHaveLength(0);
    expect(matrix.commissionBudgetTotal).toBeNull();
    matrix.level.isActive = true;
    await service.account(tx, matrix.id, { id: 'enabled', origin: 'PROGRESSIVE' });
    expect(rows).toHaveLength(1);
  });

  it('accounts a zero tranche without generating a zero commission', async () => {
    const { service, tx, matrix, rows } = fixture();
    matrix.level.commissionTotale = new Prisma.Decimal(0);
    matrix.level.commissionSysteme = new Prisma.Decimal(0);
    matrix.level.commissionRetour = new Prisma.Decimal(0);
    await service.account(tx, matrix.id, { id: 'free', origin: 'PROGRESSIVE' });
    expect(matrix.commissionAccountedPositions).toBe(1);
    expect(rows).toHaveLength(0);
  });

  it('rejects unknown historical references without changing their amounts', async () => {
    const { service, tx, matrix, rows } = fixture();
    rows.push({ id: 'unknown', referenceId: 'old-unknown', progressTo: null, progressFrom: null });
    await expect(service.account(tx, matrix.id, { id: 'event', origin: 'PROGRESSIVE' })).rejects.toThrow(/historique/i);
    expect(matrix.commissionPolicyVersion).toBeNull();
  });

  it('rejects ambiguous promotions with no corresponding complete commission', async () => {
    const { service, tx, matrix, promotions } = fixture();
    promotions.push({ id: 'promotion', datePromotion: new Date() });
    await expect(service.preview(tx, matrix.id)).rejects.toThrow(/historique/i);
  });

  it('rejects a forged or overlapping progressive range during reconciliation', async () => {
    const { service, tx, matrix, rows } = fixture(3);
    await service.account(tx, matrix.id, { id: 'event', origin: 'PROGRESSIVE' });
    rows[0].montantSysteme = new Prisma.Decimal(17);
    await expect(service.preview(tx, matrix.id)).rejects.toThrow();
  });

  it.each(['missing', 'modified', 'overlap', 'unknown'])('blocks further writes when earlier history is %s', async corruption => {
    const { service, tx, matrix, rows } = fixture();
    await service.account(tx, matrix.id, { id: 'one', origin: 'PROGRESSIVE' });
    matrix.filleulsValides = 2;
    await service.account(tx, matrix.id, { id: 'two', origin: 'PROGRESSIVE' });
    if (corruption === 'missing') rows.shift();
    if (corruption === 'modified') { rows[0].montant = new Prisma.Decimal(30); rows[0].montantSysteme = new Prisma.Decimal(18); rows[0].montantRetour = new Prisma.Decimal(12); }
    if (corruption === 'overlap') rows[1].progressFrom = 0;
    if (corruption === 'unknown') rows.push({ referenceId: 'unknown', progressTo: null });
    matrix.filleulsValides = 3;
    const originalCount = rows.length;
    await expect(service.account(tx, matrix.id, { id: 'three', origin: 'PROGRESSIVE' })).rejects.toThrow();
    expect(rows).toHaveLength(originalCount);
    expect(matrix.commissionAccountedPositions).toBe(2);
  });

  it('blocks missing history even at full capacity', async () => {
    const { service, tx, matrix, rows } = fixture(4);
    await service.account(tx, matrix.id, { id: 'all', origin: 'PROGRESSIVE' });
    rows.length = 0;
    await expect(service.account(tx, matrix.id, { id: 'replay', origin: 'PROGRESSIVE' })).rejects.toThrow();
  });

  it('blocks an orphan bonus instead of duplicating it at completion', async () => {
    const { service, tx, matrix, bonuses } = fixture(4);
    bonuses.push({ id: 'existing' });
    await expect(service.account(tx, matrix.id, { id: 'new', origin: 'PROGRESSIVE' })).rejects.toThrow(/historique/i);
    expect(matrix.generationRewardedAt).toBeNull();
  });

  it('does not silently seal a legacy completion missing its promotion', async () => {
    const { service, tx, matrix, rows } = fixture(4);
    rows.push({ id: 'old', referenceId: 'generation:parent:1', progressFrom: null, progressTo: null, matrixId: 'matrix', montant: new Prisma.Decimal(40), montantSysteme: new Prisma.Decimal(24), montantRetour: new Prisma.Decimal(16), createdAt: new Date(), statut: 'PAYEE' });
    await expect(service.account(tx, matrix.id, { id: 'old', origin: 'CATCH_UP' })).rejects.toThrow(/historique/i);
    expect(matrix.generationRewardedAt).toBeNull();
  });

  it('keeps an aggregated catch-up trigger explicitly absent', async () => {
    const { service, tx, matrix, rows } = fixture(3);
    await service.account(tx, matrix.id, { id: 'catchup', origin: 'CATCH_UP' });
    expect(rows[0]).toMatchObject({ filleulId: null, origin: 'CATCH_UP', progressFrom: 0, progressTo: 3 });
  });

  it('bounds each history read and reconciles corrupt rows beyond the first page', async () => {
    const { service, tx, matrix } = fixture(300);
    matrix.level.ordre = 5;
    Object.assign(matrix, { commissionPolicyVersion: 'v1', commissionAccountedPositions: 300,
      commissionBudgetTotal: new Prisma.Decimal(1024), commissionBudgetImmediate: new Prisma.Decimal(0), commissionBudgetHeld: new Prisma.Decimal(1024) });
    const rows = Array.from({ length: 300 }, (_, index) => ({
      id: String(index + 1), matrixId: 'matrix', progressFrom: index, progressTo: index + 1,
      referenceId: `generation-progress:matrix:${index + 1}:v1`, origin: 'PROGRESSIVE', calculationVersion: 'v1', generationEventId: `event:${index}`,
      montant: new Prisma.Decimal(1), montantSysteme: new Prisma.Decimal(0), montantRetour: new Prisma.Decimal(1),
    }));
    const reads: number[] = [];
    tx.commission.findMany = async ({ take, cursor }) => {
      reads.push(take ?? rows.length);
      const offset = cursor ? Number(cursor.id) : 0;
      return rows.slice(offset, offset + (take ?? rows.length));
    };
    const preview = await service.preview(tx, matrix.id);
    expect(preview.accountedPositions).toBe(300);
    expect(Math.max(...reads)).toBeLessThanOrEqual(256);
    rows[280].montantRetour = new Prisma.Decimal(2);
    await expect(service.preview(tx, matrix.id)).rejects.toThrow();
  });
});
