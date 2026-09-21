import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ExecutionContext, ForbiddenException, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { KpayOperationType, Role } from '@prisma/client';
import { VentesController } from './ventes.controller';
import { VentesService } from './ventes.service';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { StaffActor } from '../../common/access/staff-access';
import { StaffScopeService } from '../../common/access/staff-scope.service';
import * as mobileMoney from '../../common/payments/mobile-money.policy';

const request = require('supertest');

function saleListFixture() {
  function sale(id: string, siteId: string, clientSite: string | null, montantNet: number, day: number, modePaiement = 'MPESA') {
    return {
      id, siteId, numeroVente: `SALE-${id}`, montantNet, modePaiement,
      clientId: clientSite ? `client-${clientSite}` : null,
      client: clientSite ? { id: `client-${clientSite}`, prenom: 'Client', nom: clientSite, siteInscriptionId: clientSite } : null,
      createdAt: new Date(`2026-09-${day}T12:00:00.000Z`),
      statut: modePaiement === 'CASH' ? 'VALIDE' : 'EN_ATTENTE_PAIEMENT',
      agent: { id: 'seller', nom: 'Seller' }, site: { id: siteId, nom: siteId }, lignes: [],
      kpayTransactions: modePaiement === 'CASH' ? [] : [{ id: `tx-${id}`, venteId: id, status: 'PENDING', kpayPaymentId: `remote-${id}` }],
    };
  }
  const rows = [
    sale('own', 'site-a', 'site-a', 10, 19),
    sale('anonymous', 'site-a', null, 20, 18),
    sale('foreign-client', 'site-a', 'site-b', 1000, 17),
    sale('foreign-sale', 'site-b', 'site-a', 2000, 16),
    sale('cash', 'site-a', 'site-a', 30, 15, 'CASH'),
  ];

  function matches(row: typeof rows[number], where: any): boolean {
    if (where.siteId !== undefined && row.siteId !== where.siteId) return false;
    if (where.clientId === null && row.clientId !== null) return false;
    if (where.client && row.client?.siteInscriptionId !== where.client.siteInscriptionId) return false;
    if (where.OR && !where.OR.some((clause: any) => matches(row, clause))) return false;
    if (where.modePaiement && row.modePaiement !== where.modePaiement) return false;
    if (where.createdAt?.gte && row.createdAt < new Date(where.createdAt.gte)) return false;
    if (where.createdAt?.lte && row.createdAt > new Date(where.createdAt.lte)) return false;
    return true;
  }

  const prisma = {
    vente: {
      findMany: jest.fn<(query: any) => Promise<any>>(async ({ where, skip, take }) => rows.filter(row => matches(row, where)).slice(skip, skip + take).map(row => ({
        ...row, client: row.client ? { id: row.client.id, prenom: row.client.prenom, nom: row.client.nom } : null,
      }))),
      count: jest.fn<(query: any) => Promise<number>>(async ({ where }) => rows.filter(row => matches(row, where)).length),
      aggregate: jest.fn<(query: any) => Promise<any>>(async ({ where }) => {
        const matching = rows.filter(row => matches(row, where));
        return { _sum: { montantNet: matching.reduce((total, row) => total + row.montantNet, 0) }, _count: { id: matching.length } };
      }),
      updateMany: jest.fn<(query: any) => Promise<any>>().mockResolvedValue({ count: 1 }),
    },
    kpayTransaction: { update: jest.fn<(query: any) => Promise<any>>().mockResolvedValue({}) },
  };
  const kpay = {
    getDeposit: jest.fn<any>(async paymentId => ({ id: paymentId, status: 'FAILED', reference: `ref-${paymentId}`, failureReason: 'Declined', completedAt: null })),
  };
  const webhooks = { registerFinalizer: jest.fn<any>() };
  const service = new VentesService(prisma as never, kpay as never, webhooks as never);
  return { service, prisma, kpay };
}

describe('Sale list service authorization before reconciliation', () => {
  describe.each([Role.AGENT, Role.CAISSIER])('%s', role => {
    const actor: StaffActor = { id: 'staff', role, siteId: 'site-a' };

    it.each([{}, { siteId: 'site-a' }])('excludes foreign-linked clients from rows, totals and reconciliation with query %j', async query => {
      const { service, prisma, kpay } = saleListFixture();
      const result = await service.findAll(query, actor);
      expect(result.ventes.map(row => row.id)).toEqual(['own', 'anonymous', 'cash']);
      expect(result.ventes.map(row => row.statut)).toEqual(['ANNULEE', 'ANNULEE', 'VALIDE']);
      expect(result.meta).toEqual({ total: 3, page: 1, limit: 50, totalPages: 1 });
      expect(result.kpis).toEqual({ totalCA: 60, nbVentes: 3, panierMoyen: 20 });
      expect(kpay.getDeposit.mock.calls).toEqual([['remote-own'], ['remote-anonymous']]);
      expect(prisma.kpayTransaction.update.mock.calls.map(([query]) => query.where.id)).toEqual(['tx-own', 'tx-anonymous']);
      expect(prisma.vente.updateMany.mock.calls.map(([query]) => query.where.id)).toEqual(['own', 'anonymous']);
    });

    it.each([null, undefined, ''])('rejects an unassigned actor (%s) before queries or payment polling', async siteId => {
      const { service, prisma, kpay } = saleListFixture();
      await expect(service.findAll({ siteId: 'site-a' }, { ...actor, siteId })).rejects.toThrow(ForbiddenException);
      expect(prisma.vente.findMany).not.toHaveBeenCalled();
      expect(prisma.vente.count).not.toHaveBeenCalled();
      expect(prisma.vente.aggregate).not.toHaveBeenCalled();
      expect(kpay.getDeposit).not.toHaveBeenCalled();
    });

    it('excludes a foreign-linked pending sale before contacting KPay or persisting its status', async () => {
      const { service, prisma, kpay } = saleListFixture();
      await service.findAll({ siteId: 'site-a' }, actor);
      expect(kpay.getDeposit).not.toHaveBeenCalledWith('remote-foreign-client');
      expect(prisma.kpayTransaction.update.mock.calls.map(([query]) => query.where.id)).not.toContain('tx-foreign-client');
      expect(prisma.vente.updateMany.mock.calls.map(([query]) => query.where.id)).not.toContain('foreign-client');
    });

    it('rejects a forged site at the service boundary', async () => {
      const { service, prisma, kpay } = saleListFixture();
      await expect(service.findAll({ siteId: 'site-b' }, actor)).rejects.toThrow(ForbiddenException);
      expect(prisma.vente.findMany).not.toHaveBeenCalled();
      expect(prisma.vente.count).not.toHaveBeenCalled();
      expect(prisma.vente.aggregate).not.toHaveBeenCalled();
      expect(kpay.getDeposit).not.toHaveBeenCalled();
    });
  });

  it('reuses one scoped predicate for paginated rows, count and KPIs while retaining other filters', async () => {
    const { service, prisma, kpay } = saleListFixture();
    const result = await service.findAll({
      siteId: 'site-a', modePaiement: 'MPESA', dateDebut: '2026-09-18', dateFin: '2026-09-20', page: 2, limit: 1,
    }, { id: 'staff', role: Role.CAISSIER, siteId: 'site-a' });
    const where = prisma.vente.findMany.mock.calls[0][0].where;
    expect(where).toEqual({
      siteId: 'site-a', OR: [{ clientId: null }, { client: { siteInscriptionId: 'site-a' } }],
      modePaiement: 'MPESA', createdAt: { gte: new Date('2026-09-18'), lte: new Date('2026-09-20') },
    });
    expect(prisma.vente.count.mock.calls[0][0].where).toBe(where);
    expect(prisma.vente.aggregate.mock.calls[0][0].where).toBe(where);
    expect(result.ventes.map(row => row.id)).toEqual(['anonymous']);
    expect(result.ventes[0].client).toBeNull();
    expect(result.meta).toEqual({ total: 2, page: 2, limit: 1, totalPages: 2 });
    expect(result.kpis).toEqual({ totalCA: 30, nbVentes: 2, panierMoyen: 15 });
    expect(kpay.getDeposit.mock.calls).toEqual([['remote-anonymous']]);
  });

  it.each([Role.GERANT, Role.DIRECTEUR_REGIONAL, Role.SUPER_ADMIN])('preserves %s unrestricted and selected-site queries', async role => {
    const { service, prisma, kpay } = saleListFixture();
    const actor: StaffActor = { id: 'manager', role, siteId: 'site-a' };
    const all = await service.findAll({}, actor);
    expect(all.ventes.map(row => row.id)).toEqual(['own', 'anonymous', 'foreign-client', 'foreign-sale', 'cash']);
    expect(all.kpis).toEqual({ totalCA: 3060, nbVentes: 5, panierMoyen: 612 });
    expect(prisma.vente.findMany.mock.calls[0][0].where).toEqual({});
    expect(kpay.getDeposit.mock.calls).toEqual([['remote-own'], ['remote-anonymous'], ['remote-foreign-client'], ['remote-foreign-sale']]);
    const selected = await service.findAll({ siteId: 'site-a' }, actor);
    expect(selected.ventes.map(row => row.id)).toEqual(['own', 'anonymous', 'foreign-client', 'cash']);
    expect(selected.meta.total).toBe(4);
    expect(selected.kpis).toEqual({ totalCA: 1060, nbVentes: 4, panierMoyen: 265 });
    expect(prisma.vente.findMany.mock.calls[1][0].where).toEqual({ siteId: 'site-a' });
  });
});

describe('Sale list HTTP with real service', () => {
  let app: INestApplication;
  let actor: StaffActor;
  const { service, prisma, kpay } = saleListFixture();

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [VentesController],
      providers: [RolesGuard, StaffScopeService, { provide: VentesService, useValue: service }, { provide: PrismaService, useValue: prisma }],
    }).overrideGuard(JwtAuthGuard).useValue({
      canActivate(context: ExecutionContext) {
        context.switchToHttp().getRequest().user = actor;
        return true;
      },
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  beforeEach(() => {
    jest.clearAllMocks();
    actor = { id: 'staff', role: Role.CAISSIER, siteId: 'site-a' };
  });
  afterAll(async () => { await app?.close(); });

  it.each([Role.AGENT, Role.CAISSIER])('uses authenticated %s scope, ignoring caller policy and client-site claims', async role => {
    actor.role = role;
    const response = await request(app.getHttpServer()).get('/ventes?clientSiteId=site-b&role=SUPER_ADMIN&isSiteScoped=false').expect(200);
    expect(response.body.ventes.map(row => row.id)).toEqual(['own', 'anonymous', 'cash']);
    expect(response.body.ventes.map(row => row.statut)).toEqual(['ANNULEE', 'ANNULEE', 'VALIDE']);
    expect(response.body.meta.total).toBe(3);
    expect(response.body.kpis).toEqual({ totalCA: 60, nbVentes: 3, panierMoyen: 20 });
    expect(response.text).not.toContain('foreign');
    expect(kpay.getDeposit.mock.calls).toEqual([['remote-own'], ['remote-anonymous']]);
  });

  it('keeps manager rows, KPI totals and reconciliation unrestricted', async () => {
    actor.role = Role.GERANT;
    const response = await request(app.getHttpServer()).get('/ventes').expect(200);
    expect(response.body.ventes.map(row => row.id)).toEqual(['own', 'anonymous', 'foreign-client', 'foreign-sale', 'cash']);
    expect(response.body.meta.total).toBe(5);
    expect(response.body.kpis).toEqual({ totalCA: 3060, nbVentes: 5, panierMoyen: 612 });
    expect(kpay.getDeposit).toHaveBeenCalledWith('remote-foreign-client');
    expect(kpay.getDeposit).toHaveBeenCalledWith('remote-foreign-sale');
  });
});

describe('Sale HTTP staff boundaries', () => {
  let app: INestApplication;
  let actor: StaffActor;
  const sales = Object.fromEntries([
    'findAll', 'findOne', 'getReceipt', 'sendSmsRecu', 'getAvoir', 'getKpayVenteStatus',
    'createVente', 'initKpayVente', 'createRetour', 'initKpayRefund', 'getJournalRetours', 'getEcrituresOhada',
  ].map(method => [method, jest.fn<any>().mockResolvedValue({ result: method, private: 'private-sale' })]));
  const prisma = {
    vente: { findUnique: jest.fn<any>(async ({ where }) => where.id === 'missing' ? null : {
      id: where.id, siteId: where.id === 'foreign' ? 'site-b' : 'site-a',
      client: where.id === 'anonymous' ? null : { siteInscriptionId: ['foreign', 'foreign-client'].includes(where.id) ? 'site-b' : 'site-a' },
    }) },
    client: { findUnique: jest.fn<any>(async ({ where }) => ({ id: where.id, siteInscriptionId: where.id === 'own-client' ? 'site-a' : 'site-b' })) },
    retour: { findUnique: jest.fn<any>(async ({ where }) => where.id === 'missing' ? null : { venteId: where.id }) },
    kpayTransaction: { findFirst: jest.fn<any>(async ({ where }) => where.id === 'missing' ? null : { venteId: where.id === 'unlinked' ? null : where.id }) },
  };
  const saleBody = { siteId: 'site-a', modePaiement: 'CASH', lignes: [{ produitId: 'product', quantite: 1 }] };
  const returnBody = { modeRemboursement: 'CASH', motif: 'Retour', lignes: [{ produitId: 'product', quantite: 1 }] };
  const operations = [
    { method: 'get', path: (id: string) => `/ventes/${id}`, body: {}, service: 'findOne' },
    { method: 'get', path: (id: string) => `/ventes/${id}/receipt`, body: {}, service: 'getReceipt' },
    { method: 'post', path: (id: string) => `/ventes/${id}/sms-recu`, body: { telephone: '+243811111111' }, service: 'sendSmsRecu' },
    { method: 'get', path: (id: string) => `/ventes/retours/${id}/avoir`, body: {}, service: 'getAvoir' },
    { method: 'get', path: (id: string) => `/ventes/kpay/${id}`, body: {}, service: 'getKpayVenteStatus' },
    { method: 'post', path: (id: string) => `/ventes/${id}/retour`, body: returnBody, service: 'createRetour' },
    { method: 'post', path: (id: string) => `/ventes/${id}/retour/kpay-refund`, body: returnBody, service: 'initKpayRefund' },
  ];

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [VentesController],
      providers: [RolesGuard, StaffScopeService, { provide: VentesService, useValue: sales }, { provide: PrismaService, useValue: prisma }],
    }).overrideGuard(JwtAuthGuard).useValue({
      canActivate(context: ExecutionContext) {
        context.switchToHttp().getRequest().user = actor;
        return true;
      },
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
  });
  beforeEach(() => {
    jest.clearAllMocks();
    actor = { id: 'cashier', role: Role.CAISSIER, siteId: 'site-a' };
  });
  afterAll(async () => { await app?.close(); });

  function expectNoBusinessCalls() {
    for (const method of Object.values(sales)) expect(method).not.toHaveBeenCalled();
  }

  describe.each([Role.AGENT, Role.CAISSIER])('%s', role => {
    beforeEach(() => { actor.role = role; });

    it('requires a site instead of interpreting absence as all sites', async () => {
      actor.siteId = null;
      const response = await request(app.getHttpServer()).get('/ventes').expect(403);
      expect(response.body.code).toBe('ERR_SITE_REQUIRED');
      expectNoBusinessCalls();
    });

    it('rejects a forged list site', async () => {
      await request(app.getHttpServer()).get('/ventes?siteId=site-b').expect(403);
      expectNoBusinessCalls();
    });

    it('passes the assigned site and other list filters when siteId is omitted', async () => {
      const response = await request(app.getHttpServer()).get('/ventes?dateDebut=2026-09-01&page=2&limit=5').expect(200);
      expect(response.body.result).toBe('findAll');
      expect(sales.findAll).toHaveBeenCalledWith({ siteId: 'site-a', dateDebut: '2026-09-01', dateFin: undefined, modePaiement: undefined, page: 2, limit: 5 }, actor);
    });

    it.each(operations)('blocks foreign sale $service before business effects', async operation => {
      const enabled = jest.replaceProperty(mobileMoney as { MOBILE_MONEY_ENABLED: boolean }, 'MOBILE_MONEY_ENABLED', true);
      try {
        for (const saleId of ['foreign', 'foreign-client']) {
          const response = await request(app.getHttpServer())[operation.method](operation.path(saleId)).send(operation.body).expect(403);
          if (['createRetour', 'initKpayRefund'].includes(operation.service)) {
            expect(prisma.vente.findUnique).not.toHaveBeenCalled();
          } else {
            expect(response.body.code).toBe('ERR_SITE_FORBIDDEN');
          }
          expect(response.text).not.toContain('private-sale');
          expectNoBusinessCalls();
        }
      } finally { enabled.restore(); }
    });

    it.each(operations)('requires an assigned site for direct $service', async operation => {
      actor.siteId = null;
      const enabled = jest.replaceProperty(mobileMoney as { MOBILE_MONEY_ENABLED: boolean }, 'MOBILE_MONEY_ENABLED', true);
      try {
        await request(app.getHttpServer())[operation.method](operation.path('own')).send(operation.body).expect(403);
        expectNoBusinessCalls();
      } finally { enabled.restore(); }
    });

    it.each([{ siteId: 'site-b' }, { clientId: 'foreign-client' }])('refuses sale creation escalation %j', async injection => {
      await request(app.getHttpServer()).post('/ventes').send({ ...saleBody, ...injection }).expect(403);
      expectNoBusinessCalls();
    });

    it('checks client and site on dormant mobile sale initiation', async () => {
      const enabled = jest.replaceProperty(mobileMoney as { MOBILE_MONEY_ENABLED: boolean }, 'MOBILE_MONEY_ENABLED', true);
      try {
        await request(app.getHttpServer()).post('/ventes/kpay/init')
          .send({ ...saleBody, clientId: 'foreign-client', provider: 'VODACOM_MPESA_COD', phoneNumber: '+243811111111' }).expect(403);
        expectNoBusinessCalls();
      } finally { enabled.restore(); }
    });
  });

  it.each(operations)('allows an own-site $service after persisted sale checks', async operation => {
    if (['createRetour', 'initKpayRefund'].includes(operation.service)) actor.role = Role.GERANT;
    const enabled = jest.replaceProperty(mobileMoney as { MOBILE_MONEY_ENABLED: boolean }, 'MOBILE_MONEY_ENABLED', true);
    try {
      const response = await request(app.getHttpServer())[operation.method](operation.path('own')).send(operation.body)
        .expect(operation.method === 'post' ? 201 : 200);
      expect(response.body.result).toBe(operation.service);
      expect(prisma.vente.findUnique).toHaveBeenCalledWith({ where: { id: 'own' }, select: { siteId: true, client: { select: { siteInscriptionId: true } } } });
      expect(prisma.vente.findUnique.mock.invocationCallOrder[0]).toBeLessThan(sales[operation.service].mock.invocationCallOrder[0]);
    } finally { enabled.restore(); }
  });

  it('allows anonymous sales from the assigned site', async () => {
    const response = await request(app.getHttpServer()).get('/ventes/anonymous/receipt').expect(200);
    expect(response.body.result).toBe('getReceipt');
  });

  it('resolves the credit note through its persisted originating sale', async () => {
    await request(app.getHttpServer()).get('/ventes/retours/own/avoir').query({ venteId: 'foreign' }).expect(200);
    expect(prisma.retour.findUnique).toHaveBeenCalledWith({ where: { id: 'own' }, select: { venteId: true } });
    expect(prisma.vente.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'own' } }));
  });

  it('ignores caller client and sale identifiers when checking a KPay transaction', async () => {
    await request(app.getHttpServer()).get('/ventes/kpay/foreign').query({ clientId: 'own-client', venteId: 'own' }).expect(403);
    expect(prisma.kpayTransaction.findFirst).toHaveBeenCalledWith({ where: { id: 'foreign', operationType: KpayOperationType.SALE_PAYMENT }, select: { venteId: true } });
    expectNoBusinessCalls();
  });

  it.each(['/ventes/missing', '/ventes/retours/missing/avoir', '/ventes/kpay/missing', '/ventes/kpay/unlinked'])('rejects missing or unlinked persisted object %s', async path => {
    await request(app.getHttpServer()).get(path).expect(404);
    expectNoBusinessCalls();
  });

  it('preserves authenticated attribution on authorized creation', async () => {
    const response = await request(app.getHttpServer()).post('/ventes').send({ ...saleBody, clientId: 'own-client' }).expect(201);
    expect(response.body.result).toBe('createVente');
    expect(sales.createVente).toHaveBeenCalledWith({ ...saleBody, clientId: 'own-client' }, 'cashier');
    expect(prisma.client.findUnique).toHaveBeenCalledWith({ where: { id: 'own-client' }, select: { id: true, siteInscriptionId: true } });
  });

  it.each([Role.GERANT, Role.DIRECTEUR_REGIONAL, Role.SUPER_ADMIN])('preserves %s list and foreign-sale access', async role => {
    actor.role = role;
    await request(app.getHttpServer()).get('/ventes').expect(200);
    expect(sales.findAll).toHaveBeenCalledWith(expect.objectContaining({ siteId: undefined }), actor);
    await request(app.getHttpServer()).get('/ventes?siteId=site-b').expect(200);
    expect(sales.findAll).toHaveBeenLastCalledWith(expect.objectContaining({ siteId: 'site-b' }), actor);
    await request(app.getHttpServer()).get('/ventes/foreign').expect(200);
    await request(app.getHttpServer()).get('/ventes/retours/foreign/avoir').expect(200);
    await request(app.getHttpServer()).get('/ventes/kpay/foreign').expect(200);
  });

  it.each([Role.FORMATEUR, Role.CLIENT])('denies %s ordinary sale access', async role => {
    actor.role = role;
    await request(app.getHttpServer()).get('/ventes/own').expect(403);
    await request(app.getHttpServer()).post('/ventes').send(saleBody).expect(403);
    expectNoBusinessCalls();
  });

  it('keeps the mobile guard disabled without contacting payment services', async () => {
    const response = await request(app.getHttpServer()).post('/ventes/kpay/init').send(saleBody).expect(503);
    expect(response.body.code).toBe('MOBILE_MONEY_UNAVAILABLE');
    expectNoBusinessCalls();
  });
});
