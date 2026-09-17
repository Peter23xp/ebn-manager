import { describe, expect, it, jest } from '@jest/globals';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { MlmController } from './mlm.controller';
import { MlmService } from './mlm.service';
import { MovePlacementDto, SwapPlacementDto } from './dto/matrix-placement.dto';

describe('MLM API contracts', () => {
  it('rejects a fifth matrix slot and a missing actor supplied by the client', async () => {
    const errors = await validate(plainToInstance(MovePlacementDto, { memberId: '', newPosition: 5, reason: '' }));
    expect(errors.map(error => error.property)).toEqual(expect.arrayContaining(['memberId', 'newPosition', 'reason', 'expectedPositionId']));
  });

  it('requires both expected placements for a swap', async () => {
    const errors = await validate(plainToInstance(SwapPlacementDto, { reason: 'Reequilibrage' }));
    expect(errors.map(error => error.property)).toContain('otherExpectedPositionId');
  });

  it('protects placement and release mutations with administrative roles', () => {
    for (const method of ['movePlacement', 'swapPlacement', 'releaseHeldLot']) {
      expect(Reflect.getMetadata('roles', MlmController.prototype[method])).toEqual(['SUPER_ADMIN', 'DIRECTEUR_REGIONAL']);
    }
  });

  it('recalculates configuration exclusively from the immediate amount', async () => {
    const prisma: any = { mlmLevel: {
      findUnique: jest.fn<any>().mockResolvedValue({ id: 1 }),
      update: jest.fn<any>(async ({ data }) => ({ id: 1, ordre: 1, salaireMensuel: 0, ...data })),
    } };
    const service = new MlmService(prisma, {} as never);
    await service.updateConfig({ levelId: 1, immediateAmount: '50' });
    const data = prisma.mlmLevel.update.mock.calls[0][0].data;
    expect(data.commissionTotale.toFixed(2)).toBe('83.33');
    expect(data.commissionRetour.toFixed(2)).toBe('33.33');
    expect(data.commissionSysteme.toFixed(2)).toBe('50.00');
    await expect(service.updateConfig({ levelId: 1, commissionParFilleul: 10 } as any)).rejects.toThrow();
  });
});
