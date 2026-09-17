import { describe, expect, it } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { commissionAmounts } from './mlm-finance';

describe('commissionAmounts', () => {
  it.each([
    ['24', '40.00', '16.00'],
    ['50', '83.33', '33.33'],
    ['80', '133.33', '53.33'],
    ['200', '333.33', '133.33'],
    ['1000', '1666.67', '666.67'],
    ['2000', '3333.33', '1333.33'],
    ['20000', '33333.33', '13333.33'],
    ['50000', '83333.33', '33333.33'],
  ])('splits immediate %s into total %s and held %s', (input, total, held) => {
    const amounts = commissionAmounts(input);

    expect(amounts.total).toBeInstanceOf(Prisma.Decimal);
    expect(amounts.immediate).toBeInstanceOf(Prisma.Decimal);
    expect(amounts.held).toBeInstanceOf(Prisma.Decimal);
    expect(amounts.total.toFixed(2)).toBe(total);
    expect(amounts.held.toFixed(2)).toBe(held);
    expect(amounts.immediate.equals(input)).toBe(true);
    expect(amounts.immediate.plus(amounts.held).equals(amounts.total)).toBe(
      true,
    );
  });

  it.each(['0.003', '0.001', '24.001', new Prisma.Decimal('50.005')])(
    'rejects sub-cent immediate amounts %s before database rounding can change the split',
    (input) => {
      expect(() => commissionAmounts(input)).toThrow(BadRequestException);
    },
  );

  it('allows insignificant trailing zeroes', () => {
    expect(commissionAmounts('24.0000').total.toFixed(2)).toBe('40.00');
  });

  it('accepts the largest cent-valued immediate whose total fits Decimal(12,2)', () => {
    const amounts = commissionAmounts('5999999999.99');

    expect(amounts.total.toFixed(2)).toBe('9999999999.98');
    expect(amounts.immediate.toFixed(2)).toBe('5999999999.99');
    expect(amounts.held.toFixed(2)).toBe('3999999999.99');
    expect(amounts.immediate.plus(amounts.held).equals(amounts.total)).toBe(
      true,
    );
  });

  it.each(['6000000000', '9999999999.99', '1e100'])(
    'rejects a total exceeding Decimal(12,2) for immediate %s',
    (input) => {
      expect(() => commissionAmounts(input)).toThrow(BadRequestException);
    },
  );

  it('accepts zero', () => {
    const amounts = commissionAmounts(0);

    expect(amounts.total.toFixed(2)).toBe('0.00');
    expect(amounts.immediate.toFixed(2)).toBe('0.00');
    expect(amounts.held.toFixed(2)).toBe('0.00');
  });

  it('accepts Decimal inputs without mutating them', () => {
    const input = new Prisma.Decimal('50');

    expect(commissionAmounts(input).held.toFixed(2)).toBe('33.33');
    expect(input.toString()).toBe('50');
  });

  it.each([
    '-0.01',
    '-24',
    'NaN',
    'Infinity',
    '-Infinity',
    NaN,
    Infinity,
    -Infinity,
  ])('rejects negative or non-finite input %s', (input) => {
    expect(() => commissionAmounts(input)).toThrow(BadRequestException);
  });

  it.each(['', 'not-money', null, undefined])(
    'rejects malformed input %s',
    (input) => {
      expect(() => commissionAmounts(input as never)).toThrow(
        BadRequestException,
      );
    },
  );
});
