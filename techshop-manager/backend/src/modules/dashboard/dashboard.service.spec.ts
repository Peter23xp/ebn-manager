import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { DashboardService } from './dashboard.service';

describe('DashboardService - getStats nouveauxFilleuls', () => {
  let service: DashboardService;
  let prisma: any;

  function mockPrisma(overrides: Record<string, any> = {}) {
    return {
      client: {
        count: jest.fn<any>().mockResolvedValue(10),
      },
      vente: {
        aggregate: jest.fn<any>().mockResolvedValue({ _sum: { montantNet: 500 } }),
      },
      membre: {
        count: jest.fn<any>().mockResolvedValue(0),
      },
      stockSite: {
        findMany: jest.fn<any>().mockResolvedValue([]),
      },
      ...overrides,
    };
  }

  beforeEach(() => {
    prisma = mockPrisma();
    service = new DashboardService(prisma);
  });

  it('compte les nouveaux membres (filleuls) inscrits dans la période', async () => {
    prisma.membre.count
      .mockResolvedValueOnce(3) // période courante
      .mockResolvedValueOnce(1); // période précédente

    const result = await service.getStats(undefined, 'month', {
      id: 'u1',
      role: 'SUPER_ADMIN' as any,
    });

    expect(result.nouveauxFilleuls).toBe(3);
    expect(prisma.membre.count).toHaveBeenCalledTimes(2);

    const [currWhere, prevWhere] = prisma.membre.count.mock.calls.map(
      (c: any[]) => c[0].where,
    );
    // filtre dateInscription présent sur les deux appels
    expect(currWhere.dateInscription).toBeDefined();
    expect(prevWhere.dateInscription).toBeDefined();
    // la fenêtre précédente précède la fenêtre courante
    expect(new Date(prevWhere.dateInscription.lte).getTime()).toBeLessThanOrEqual(
      new Date(currWhere.dateInscription.gte).getTime(),
    );
  });

  it('filtre les filleuls par site via client.siteInscriptionId pour un GERANT', async () => {
    await service.getStats('other-site', 'month', {
      id: 'u2',
      role: 'GERANT' as any,
      siteId: 'my-site',
    });

    const where = prisma.membre.count.mock.calls[0][0].where;
    expect(where.client).toEqual({
      siteInscriptionId: { in: ['my-site'] },
    });
  });

  it('calcule la tendance vs période précédente', async () => {
    prisma.membre.count
      .mockResolvedValueOnce(3) // courante
      .mockResolvedValueOnce(1); // précédente

    const result = await service.getStats(undefined, 'month', {
      id: 'u1',
      role: 'SUPER_ADMIN' as any,
    });

    expect(result.trends.nouveauxFilleuls).toBe(200); // (3-1)/1 * 100
  });
});
