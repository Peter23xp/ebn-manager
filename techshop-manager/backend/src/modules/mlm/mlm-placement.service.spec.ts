import { describe, expect, it, jest } from '@jest/globals';
import { MlmPlacementService } from './mlm-placement.service';
import { Prisma } from '@prisma/client';

function fixture() {
  const transaction: any = {
    $executeRaw: jest.fn<any>().mockResolvedValue(1),
    $queryRaw: jest.fn<any>().mockResolvedValue([]),
    membre: { findUnique: jest.fn<any>().mockResolvedValue({ id: 'X', parrainId: 'P0', statut: 'ACTIF', matrixPosition: null, matrices: [] }) },
    position: {
      findUnique: jest.fn<any>().mockResolvedValue(null),
      findUniqueOrThrow: jest.fn<any>().mockResolvedValue({ id: 'slot', filleulId: 'X', matrix: { membreId: 'P1' } }),
      findMany: jest.fn<any>().mockResolvedValue([]),
      findFirst: jest.fn<any>().mockResolvedValue({ id: 'slot', numeroPosition: 4, matrix: { membreId: 'P1' } }),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
    },
    placementHistory: {
      create: jest.fn<any>().mockResolvedValue({ id: 'history' }),
      findMany: jest.fn<any>().mockResolvedValue([]),
    },
  };
  const prisma: any = { $transaction: jest.fn<any>(async callback => callback(transaction)) };
  const service = new MlmPlacementService(prisma);
  jest.spyOn(service, 'recalculateAncestors').mockResolvedValue(undefined);
  return { transaction, service };
}

describe('matrix placement', () => {
  it('places a recruit under another parent while keeping the original recruiter', async () => {
    const { service, transaction } = fixture();
    await service.place(transaction, 'X', 'P0');
    expect(transaction.position.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'slot', filleulId: null }, data: expect.objectContaining({ filleulId: 'X' }),
    }));
    expect(transaction.placementHistory.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      memberId: 'X', recruiterId: 'P0', newParentId: 'P1', newPosition: 4,
    }) }));
  });

  it('is idempotent when the member already has a position', async () => {
    const { service, transaction } = fixture();
    transaction.position.findUnique.mockResolvedValue({ id: 'existing' });
    await service.place(transaction, 'X', 'P0');
    expect(transaction.position.updateMany).not.toHaveBeenCalled();
  });

  it('rejects self placement without modifying the tree', async () => {
    const { service, transaction } = fixture();
    await expect(service.place(transaction, 'X', 'X')).rejects.toThrow();
    expect(transaction.position.updateMany).not.toHaveBeenCalled();
  });

  it('does not overwrite a slot if its conditional claim fails', async () => {
    const { service, transaction } = fixture();
    transaction.position.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.place(transaction, 'X', 'P0')).rejects.toThrow();
    expect(transaction.placementHistory.create).not.toHaveBeenCalled();
  });

  it('rejects a movement producing a cycle before writes', async () => {
    const { service, transaction } = fixture();
    transaction.position.findUnique.mockResolvedValue({ id: 'old', numeroPosition: 1, matrix: { membreId: 'A' } });
    transaction.$queryRaw.mockResolvedValue([{ id: 'X' }]);
    await expect(service.move({ memberId: 'X', newParentId: 'child', newPosition: 2, expectedPositionId: 'old', operationId: 'op', reason: 'Reequilibrage' }, 'admin')).rejects.toThrow();
    expect(transaction.position.updateMany).not.toHaveBeenCalled();
  });
});

describe('core round1 promotion history', () => {
  it.each([0, 1])('stores real previous level IDs with historical generation %i', async highestLevelAchieved => {
    const levels = Array.from({ length: 8 }, (_, index) => ({
      id: 101 + index, ordre: index + 1, nom: `Level ${index + 1}`, isActive: true,
      commissionTotale: new Prisma.Decimal(40), commissionSysteme: new Prisma.Decimal(24), commissionRetour: new Prisma.Decimal(16),
      salaireActif: false, bonusDescription: null,
    }));
    const transaction: any = {
      $queryRaw: jest.fn<any>().mockResolvedValue([{ id: 'root', depth: 0 }]),
      mlmLevel: { findMany: jest.fn<any>().mockResolvedValue(levels) },
      membre: {
        findUnique: jest.fn<any>().mockResolvedValue({ id: 'root', statut: 'ACTIF', parrainId: null, highestLevelAchieved }),
        update: jest.fn<any>(),
      },
      position: { findMany: jest.fn<any>().mockResolvedValue(Array.from({ length: 4 }, () => ({
        estValide: true, filleul: { statut: 'ACTIF', totalDescendants: 4, matrices: [{ level: { ordre: 1 }, filleulsValides: 4, occupiedPositions: 4 }] },
      }))) },
      matrix: { upsert: jest.fn<any>(async ({ create }) => ({ id: `matrix-${create.mlmLevelId}`, ...create })) },
      commission: {
        findUnique: jest.fn<any>(async ({ where }) => highestLevelAchieved === 1 && where.referenceId === 'generation:root:101' ? { id: 'existing' } : null),
        create: jest.fn<any>(),
      },
      promotion: { create: jest.fn<any>() },
    };
    await new MlmPlacementService({} as never).recalculateAncestors(transaction, ['root'], 'trigger');
    const history = transaction.promotion.create.mock.calls.map(([input]) => input.data);
    expect(history).toEqual(highestLevelAchieved === 0 ? [
      expect.objectContaining({ niveauAvantId: 0, niveauApresId: 101 }),
      expect.objectContaining({ niveauAvantId: 101, niveauApresId: 102 }),
    ] : [expect.objectContaining({ niveauAvantId: 101, niveauApresId: 102 })]);
    expect(transaction.membre.update).toHaveBeenCalledWith({ where: { id: 'root' }, data: { mlmLevelId: 102, highestLevelAchieved: 2 } });
  });
});
