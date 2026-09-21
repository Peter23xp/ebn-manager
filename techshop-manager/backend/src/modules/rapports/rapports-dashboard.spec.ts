import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { RapportsService } from './rapports.service';
import { RapportsController } from './rapports.controller';

describe('Rapports opérationnels', () => {
  const actor = { id: 'manager', role: Role.GERANT, siteId: 'site-one' };
  const period = { dateDebut: '2026-09-01', dateFin: '2026-09-30' };
  let prisma: any;
  let service: RapportsService;

  beforeEach(() => {
    prisma = {
      site: { findMany: jest.fn<any>().mockResolvedValue([{ id: 'site-one', nom: 'Goma' }]) },
      vente: {
        findMany: jest.fn<any>().mockResolvedValue([]),
        groupBy: jest.fn<any>().mockResolvedValue([{ siteId: 'site-one', modePaiement: 'CASH', _count: { id: 2 }, _sum: { montantNet: new Prisma.Decimal('100.10'), remiseFidelite: new Prisma.Decimal('0.10'), remiseParrainage: null } }]),
        aggregate: jest.fn<any>().mockResolvedValue({ _count: { id: 1 }, _sum: { montantNet: new Prisma.Decimal('45.00') } }),
      },
      client: {
        count: jest.fn<any>().mockResolvedValue(2),
        groupBy: jest.fn<any>().mockImplementation(({ by }) => Promise.resolve(by[0] === 'statut'
          ? [{ statut: 'ACTIF', _count: { id: 8 } }, { statut: 'EN_COURS', _count: { id: 3 } }]
          : [{ siteInscriptionId: 'site-one', _count: { id: 3 } }])),
      },
      onboardingEtape: { groupBy: jest.fn<any>().mockResolvedValue([
        { etape: 'RECIT', _count: { id: 3 }, _sum: { montant: new Prisma.Decimal('15000') } },
        { etape: 'FICHE', _count: { id: 2 }, _sum: { montant: new Prisma.Decimal('10000') } },
        { etape: 'ACTIVATION', _count: { id: 2 }, _sum: { montant: new Prisma.Decimal('80') } },
      ]) },
      retour: { aggregate: jest.fn<any>().mockResolvedValue({ _count: { id: 1 }, _sum: { montantRembourse: new Prisma.Decimal('20.05') } }) },
      ligneVente: { groupBy: jest.fn<any>().mockResolvedValue([]) },
      produit: { findMany: jest.fn<any>().mockResolvedValue([]) },
      $queryRaw: jest.fn<any>().mockImplementation((query) => Promise.resolve(query.strings?.join('').includes('stock_sites')
        ? [{ siteId: 'site-one', references: 2, units: 12, alerts: 1, value: new Prisma.Decimal('50.25') }]
        : [{ bucket: new Date('2026-09-02T00:00:00Z'), siteId: 'site-one', amount: new Prisma.Decimal('100.10') }])),
    };
    service = new RapportsService(prisma);
  });

  const dashboard = (instance: RapportsService, query: object, user = actor) => (instance.getVentesDashboard as any)(query, user);

  it('sépare ventes réglées, remboursements, attente et devises sans doubler les activations', async () => {
    const result = await dashboard(service, period);
    expect(result.totalCA).toBe(100.1);
    expect(result.activity).toMatchObject({
      refunds: { count: 1, amount: 20.05 },
      pendingSales: { count: 1, amount: 45 },
      netAfterRefunds: 80.05,
      onboardingCDF: 25000,
      clients: { total: 11, activated: 2 },
      stock: { references: 2, units: 12, alerts: 1, value: 50.25 },
    });
    expect(result.activity.onboarding.find((step) => step.etape === 'ACTIVATION')).toMatchObject({ amount: 80, currency: 'USD', includedInSales: true });
    expect(prisma.vente.findMany).not.toHaveBeenCalled();
  });

  it('force le site du gérant et inclut toute la date de fin', async () => {
    await dashboard(service, { ...period, siteId: 'site-other' });
    expect(prisma.vente.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      siteId: actor.siteId,
      statut: { in: ['VALIDE', 'RETOURNEE_PARTIELLE', 'RETOURNEE'] },
      createdAt: { gte: new Date('2026-09-01T00:00:00Z'), lte: new Date('2026-09-30T23:59:59.999Z') },
    }) }));
    expect(prisma.onboardingEtape.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ siteId: actor.siteId, statut: 'COMPLETE', completeeAt: expect.any(Object) }) }));
    expect(prisma.retour.aggregate).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ statut: 'COMPLETE', vente: { siteId: actor.siteId } }) }));
  });

  it('construit une série complète même sans vente le premier jour', async () => {
    const result = await dashboard(service, { ...period, granularite: 'day' });
    expect(result.seriesCA).toHaveLength(30);
    expect(result.seriesCA[0].values).toEqual({ Goma: 0 });
    expect(result.seriesCA[1].values).toEqual({ Goma: 100.1 });
  });

  it('refuse un gérant sans site et les périodes invalides', async () => {
    await expect(dashboard(service, period, { ...actor, siteId: null })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(dashboard(service, { ...period, dateDebut: 'incorrect' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(dashboard(service, { ...period, dateDebut: '2026-10-01' })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.vente.groupBy).not.toHaveBeenCalled();
  });

  it('transmet l’acteur authentifié du contrôleur au service', () => {
    const getVentesDashboard = jest.fn();
    const controller = new RapportsController({ getVentesDashboard } as any);
    controller.getVentesDashboard({ user: actor }, undefined, period.dateDebut, period.dateFin, 'day');
    expect(getVentesDashboard).toHaveBeenCalledWith(expect.objectContaining(period), actor);
  });

  it('attribue les remboursements différés à leur date de règlement et les espèces à leur date de création', async () => {
    await dashboard(service, { dateDebut: '2026-09-21', dateFin: '2026-09-21' });
    const where = prisma.retour.aggregate.mock.calls[0][0].where;
    const dates = { gte: new Date('2026-09-21T00:00:00Z'), lte: new Date('2026-09-21T23:59:59.999Z') };
    expect(where).not.toHaveProperty('createdAt');
    expect(where.OR).toEqual([
      { kpayTransactions: { some: {
        operationType: 'SALE_REFUND', status: 'COMPLETED',
        OR: [{ completedAt: dates }, { completedAt: null, terminalEventProcessedAt: dates }],
      } } },
      { createdAt: dates, kpayTransactions: { none: { operationType: 'SALE_REFUND' } } },
    ]);
    expect(where.OR[0].kpayTransactions.some.OR[0].completedAt.gte.getTime()).toBeGreaterThan(new Date('2026-09-20T23:59:59.999Z').getTime());
  });
});
