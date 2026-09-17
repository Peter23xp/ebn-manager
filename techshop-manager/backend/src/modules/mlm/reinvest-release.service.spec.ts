import { describe, expect, it, jest } from '@jest/globals';
import { ReinvestReleaseService } from './reinvest-release.service';

describe('ReinvestReleaseService.releaseDueLots', () => {
  const now = new Date('2026-10-11T00:00:00Z');
  const setup = () => {
    const prisma = {
      reinvestLote: {
        findMany: jest.fn<any>().mockResolvedValue([]),
        updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
      },
      portefeuille: { update: jest.fn(), updateMany: jest.fn() },
      transactionPortefeuille: { create: jest.fn() },
      $transaction: jest.fn(),
    };
    return { prisma, service: new ReinvestReleaseService(prisma as never) };
  };

  it('marks due holds RELEASABLE without moving funds or recording a release', async () => {
    const { prisma, service } = setup();
    prisma.reinvestLote.findMany.mockResolvedValueOnce([{ id: 'lot-1' }]);

    expect(await service.releaseDueLots(now)).toBe(1);

    expect(prisma.reinvestLote.findMany).toHaveBeenCalledWith({
      where: { status: 'HOLD_PERIOD', releaseDate: { lte: now } },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: 200,
    });
    expect(prisma.reinvestLote.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['lot-1'] }, status: 'HOLD_PERIOD', releaseDate: { lte: now } },
      data: { status: 'RELEASABLE' },
    });
    expect(prisma.portefeuille.update).not.toHaveBeenCalled();
    expect(prisma.portefeuille.updateMany).not.toHaveBeenCalled();
    expect(prisma.transactionPortefeuille.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('pages at most 200 holds with a stable cursor even if another worker claims a page', async () => {
    const { prisma, service } = setup();
    prisma.reinvestLote.findMany
      .mockResolvedValueOnce(Array.from({ length: 200 }, (_, index) => ({ id: 'lot-' + String(index).padStart(3, '0') })))
      .mockResolvedValueOnce([{ id: 'lot-200' }]);
    prisma.reinvestLote.updateMany.mockResolvedValueOnce({ count: 0 });

    expect(await service.releaseDueLots(now)).toBe(1);

    expect(prisma.reinvestLote.findMany).toHaveBeenNthCalledWith(2, {
      where: { status: 'HOLD_PERIOD', releaseDate: { lte: now }, id: { gt: 'lot-199' } },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: 200,
    });
    expect(prisma.reinvestLote.updateMany).toHaveBeenCalledTimes(2);
    expect((prisma.reinvestLote.updateMany.mock.calls[0][0] as any).where.id.in).toHaveLength(200);
  });

  it('does not count lots cancelled or marked eligible by another worker', async () => {
    const { prisma, service } = setup();
    prisma.reinvestLote.findMany.mockResolvedValueOnce([{ id: 'lot-1' }]);
    prisma.reinvestLote.updateMany.mockResolvedValueOnce({ count: 0 });

    expect(await service.releaseDueLots(now)).toBe(0);
    expect(prisma.reinvestLote.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: 'HOLD_PERIOD' }),
    }));
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does nothing when no holds are due', async () => {
    const { prisma, service } = setup();
    expect(await service.releaseDueLots(now)).toBe(0);
    expect(prisma.reinvestLote.updateMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
