import { describe, expect, it } from '@jest/globals';
import { Prisma } from '@prisma/client';
import { progressiveAmounts } from './mlm-progressive';

describe('progressive commission amounts', () => {
  it('earns a Builder quarter rather than waiting for four children', () => {
    const amounts = progressiveAmounts({ total: '40', immediate: '24', held: '16' }, 4, 0, 1);
    expect([amounts.total, amounts.immediate, amounts.held].map(amount => amount.toFixed(2))).toEqual(['10.00', '6.00', '4.00']);
  });

  it.each([
    [1, '40.00', '24.00', '16.00'], [2, '83.33', '50.00', '33.33'],
    [3, '133.33', '80.00', '53.33'], [4, '333.33', '200.00', '133.33'],
    [5, '1666.67', '1000.00', '666.67'], [6, '3333.33', '2000.00', '1333.33'],
    [7, '33333.33', '20000.00', '13333.33'], [8, '83333.33', '50000.00', '33333.33'],
  ])('preserves the exact generation %i budget across every tranche', (depth, total, immediate, held) => {
    const capacity = 4 ** Number(depth);
    const sums = { total: new Prisma.Decimal(0), immediate: new Prisma.Decimal(0), held: new Prisma.Decimal(0) };
    for (let position = 1; position <= capacity; position++) {
      const amounts = progressiveAmounts({ total, immediate, held }, capacity, position - 1, position);
      expect(amounts.held.gte(0) && amounts.immediate.gte(0)).toBe(true);
      for (const key of ['total', 'immediate', 'held'] as const) sums[key] = sums[key].plus(amounts[key]);
    }
    expect([sums.total, sums.immediate, sums.held].map(amount => amount.toFixed(2))).toEqual([total, immediate, held]);
  });

  it('computes grouped ranges as cumulative differences', () => {
    const budget = { total: '83.33', immediate: '50', held: '33.33' };
    const amounts = progressiveAmounts(budget, 16, 3, 12);
    expect([amounts.total, amounts.immediate, amounts.held].map(amount => amount.toFixed(2))).toEqual(['46.87', '28.12', '18.75']);
  });

  it('handles tiny and zero budgets without negative held amounts', () => {
    expect(progressiveAmounts({ total: '0.02', immediate: '0.01', held: '0.01' }, 4, 1, 2).total.toFixed(2)).toBe('0.02');
    expect(progressiveAmounts({ total: '0.02', immediate: '0.01', held: '0.01' }, 4, 2, 3).held.toFixed(2)).toBe('0.00');
    expect(progressiveAmounts({ total: '0', immediate: '0', held: '0' }, 4, 0, 4).total.toFixed(2)).toBe('0.00');
  });

  it.each(['NaN', 'Infinity', '-1', '0.001', '10000000000'])('rejects invalid money %s', invalid => {
    expect(() => progressiveAmounts({ total: invalid, immediate: invalid, held: '0' }, 4, 0, 1)).toThrow();
  });

  it.each([[0, 0, 0], [5, 0, 1], [4, -1, 1], [4, 1, 5], [4, 2, 1], [4, 0, 1.5]])('rejects invalid range %j', (capacity, from, to) => {
    expect(() => progressiveAmounts({ total: '40', immediate: '24', held: '16' }, capacity, from, to)).toThrow();
  });

  it('rejects incoherent budgets', () => {
    expect(() => progressiveAmounts({ total: '39', immediate: '24', held: '16' }, 4, 0, 1)).toThrow();
  });
});
