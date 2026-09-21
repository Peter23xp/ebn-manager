import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { generationCapacity, MATRIX_GENERATIONS } from './mlm-generation';

export const PROGRESSIVE_POLICY = 'v1';

export interface CommissionBudget {
  total: Prisma.Decimal.Value;
  immediate: Prisma.Decimal.Value;
  held: Prisma.Decimal.Value;
}

export function money(value: Prisma.Decimal.Value): Prisma.Decimal {
  let amount: Prisma.Decimal;
  try { amount = new Prisma.Decimal(value); } catch { throw new BadRequestException('Montant de commission invalide'); }
  if (!amount.isFinite() || amount.lt(0) || amount.decimalPlaces() > 2 || amount.gt('9999999999.99')) {
    throw new BadRequestException('Montant de commission invalide');
  }
  return amount;
}

export function progressiveAmounts(budget: CommissionBudget, capacity: number, from: number, to: number) {
  if (!Array.from({ length: MATRIX_GENERATIONS }, (_, index) => generationCapacity(index + 1)).includes(capacity)
    || !Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 0 || to < from || to > capacity) {
    throw new BadRequestException('Plage de progression invalide');
  }
  const total = money(budget.total);
  const immediateBudget = money(budget.immediate);
  const heldBudget = money(budget.held);
  if (!total.equals(immediateBudget.plus(heldBudget))) throw new BadRequestException('Budget de commission incoherent');
  const cumulative = (amount: Prisma.Decimal, position: number) => amount.mul(position).div(capacity).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  const immediate = cumulative(immediateBudget, to).minus(cumulative(immediateBudget, from));
  const held = cumulative(heldBudget, to).minus(cumulative(heldBudget, from));
  return { total: immediate.plus(held), immediate, held };
}
