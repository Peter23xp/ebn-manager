import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export function commissionAmounts(immediate: Prisma.Decimal.Value): {
  total: Prisma.Decimal;
  immediate: Prisma.Decimal;
  held: Prisma.Decimal;
} {
  let immediateAmount: Prisma.Decimal;
  try {
    immediateAmount = new Prisma.Decimal(immediate);
  } catch {
    throw new BadRequestException('Le montant immediat est invalide.');
  }
  if (!immediateAmount.isFinite() || immediateAmount.lessThan(0)) {
    throw new BadRequestException(
      'Le montant immediat doit etre fini et positif ou nul.',
    );
  }
  if (immediateAmount.decimalPlaces() > 2) {
    throw new BadRequestException(
      'Le montant immediat ne peut pas contenir de fractions de centime.',
    );
  }
  const total = immediateAmount
    .div('0.60')
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  if (total.greaterThan('9999999999.99')) {
    throw new BadRequestException(
      'Le total de commission depasse la capacite Decimal(12,2).',
    );
  }

  return {
    total,
    immediate: immediateAmount,
    held: total.minus(immediateAmount),
  };
}
