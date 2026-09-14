import { describe, expect, it, jest } from '@jest/globals';
import { ReinvestReleaseService } from './reinvest-release.service';

const resolved = (value: any) => {
  const mock = jest.fn();
  (mock as any).mockResolvedValue(value);
  return mock;
};

describe('ReinvestReleaseService.releaseDueLots', () => {
  it('transfère chaque lot échu de soldeReinvesti vers soldeDisponible', async () => {
    const tx = {
      portefeuille: { findUnique: resolved({ id: 'pf-1' }), update: jest.fn() },
      reinvestLote: { updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }) },
      $queryRaw: resolved([]),
    };
    const prisma = {
      reinvestLote: {
        findMany: resolved([{ id: 'l-1', membreId: 'm-1', amount: 40 }]),
      },
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    };
    const service = new ReinvestReleaseService(prisma as never);

    const count = await service.releaseDueLots(new Date('2026-10-11T00:00:00Z'));

    expect(count).toBe(1);
    expect(prisma.reinvestLote.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { released: false, releasedAt: { lte: new Date('2026-10-11T00:00:00Z') } },
      }),
    );
    // Verrou : le lot n'est marqué libéré que s'il est encore released:false
    expect(tx.reinvestLote.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'l-1', released: false }, data: { released: true } }),
    );
    expect(tx.portefeuille.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'pf-1' },
        data: { soldeDisponible: { increment: expect.anything() }, soldeReinvesti: { decrement: expect.anything() } },
      }),
    );
  });

  it('ne transfère PAS si un autre cron a déjà libéré le lot (anti double-paiement)', async () => {
    const tx = {
      portefeuille: { findUnique: resolved({ id: 'pf-1' }), update: jest.fn() },
      reinvestLote: { updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }) },
      $queryRaw: resolved([]),
    };
    const prisma = {
      reinvestLote: { findMany: resolved([{ id: 'l-1', membreId: 'm-1', amount: 40 }]) },
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    };
    const service = new ReinvestReleaseService(prisma as never);

    const count = await service.releaseDueLots();

    expect(count).toBe(0);
    expect(tx.portefeuille.update).not.toHaveBeenCalled();
  });

  it('ignore un lot sans portefeuille et ne casse pas les autres', async () => {
    const tx = {
      portefeuille: { findUnique: resolved(null), update: jest.fn() },
      reinvestLote: { updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }) },
      $queryRaw: resolved([]),
    };
    const prisma = {
      reinvestLote: { findMany: resolved([{ id: 'l-1', membreId: 'm-x', amount: 10 }]) },
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    };
    const service = new ReinvestReleaseService(prisma as never);

    const count = await service.releaseDueLots();

    expect(count).toBe(0);
    expect(tx.reinvestLote.updateMany).not.toHaveBeenCalled();
  });

  it("ne libère rien quand aucun lot n'est échu", async () => {
    const prisma = { reinvestLote: { findMany: resolved([]) }, $transaction: jest.fn() };
    const service = new ReinvestReleaseService(prisma as never);
    expect(await service.releaseDueLots()).toBe(0);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
