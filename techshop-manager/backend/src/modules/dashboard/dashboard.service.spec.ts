import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { DashboardService } from './dashboard.service';
import { Role } from '@prisma/client';

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

  it.each<Role>(['CAISSIER' as Role, 'AGENT', 'GERANT', 'FORMATEUR'])('scopes every stats query to the assigned site for %s', async (role) => {
    await service.getStats(undefined, 'today', { id: 'staff', role, siteId: 'my-site' });
    expect(prisma.client.count).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ siteInscriptionId: { in: ['my-site'] } }) }));
    expect(prisma.vente.aggregate).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ siteId: { in: ['my-site'] } }) }));
    expect(prisma.membre.count).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ client: { siteInscriptionId: { in: ['my-site'] } } }) }));
    expect(prisma.stockSite.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { siteId: { in: ['my-site'] } } }));
  });

  it.each<Role>(['CAISSIER' as Role, 'AGENT', 'GERANT', 'FORMATEUR'])('rejects %s without an assigned site before stats queries', async (role) => {
    await expect(service.getStats('other-site', 'today', { id: 'staff', role })).rejects.toMatchObject({ response: { code: 'ERR_SITE_REQUIRED' } });
    expect(prisma.client.count).not.toHaveBeenCalled();
    expect(prisma.vente.aggregate).not.toHaveBeenCalled();
    expect(prisma.membre.count).not.toHaveBeenCalled();
    expect(prisma.stockSite.findMany).not.toHaveBeenCalled();
  });

  it.each<Role>(['SUPER_ADMIN', 'DIRECTEUR_REGIONAL'])('preserves all-site stats and explicit filters for %s', async (role) => {
    await service.getStats(undefined, 'today', { id: 'manager', role });
    expect(prisma.stockSite.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: {} }));
    await service.getStats('selected-site', 'today', { id: 'manager', role });
    expect(prisma.stockSite.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { siteId: { in: ['selected-site'] } } }));
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
