import { describe, expect, it, jest } from '@jest/globals';
import { initializeMlmLevels } from '../../../prisma/mlm-levels';

describe('MLM level bootstrap', () => {
  it('initializes eight generation commissions without modifying users or existing bonuses', async () => {
    const prisma: any = { mlmLevel: { upsert: jest.fn<any>(async input => input.create) } };
    const levels = await initializeMlmLevels(prisma);
    expect(levels).toHaveLength(8);
    expect(levels[0].commissionSysteme.toFixed(2)).toBe('24.00');
    expect(levels[1].commissionTotale.toFixed(2)).toBe('83.33');
    expect(levels[7].commissionRetour.toFixed(2)).toBe('33333.33');
    expect(prisma.mlmLevel.upsert.mock.calls[0][0].update).not.toHaveProperty('bonusDescription');
    expect(prisma.mlmLevel.upsert.mock.calls[0][0].update).not.toHaveProperty('salaireMensuel');
  });
});
