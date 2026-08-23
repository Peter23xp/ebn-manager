import { PrismaClient } from '@prisma/client';
import { describe, expect, it } from '@jest/globals';

describe('KPay Prisma schema', () => {
  it('exposes durable transaction and payout delegates', () => {
    const prisma = new PrismaClient() as unknown as {
      kpayTransaction?: unknown;
      mlmPayout?: unknown;
    };

    expect(prisma.kpayTransaction).toBeDefined();
    expect(prisma.mlmPayout).toBeDefined();
  });
});
