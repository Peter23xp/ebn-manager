import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { BadRequestException, ExecutionContext, ForbiddenException, INestApplication, NotFoundException, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';
import { ClientParrainService } from './client-parrain.service';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { StaffActor } from '../../common/access/staff-access';
import { StaffScopeService } from '../../common/access/staff-scope.service';
import * as mobileMoney from '../../common/payments/mobile-money.policy';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { VentesController } from '../ventes/ventes.controller';
import { VentesService } from '../ventes/ventes.service';

const request = require('supertest');

describe('Financial HTTP role matrix with real JWT', () => {
  let app: INestApplication;
  let actor: StaffActor;
  const jwt = new JwtService({ secret: 'financial-access-test-only' });
  const payment = { provider: 'VODACOM_MPESA_COD', phoneNumber: '+243811111111' };
  const recit = { prenom: 'Client', nom: 'Test', telephone: '+243811111111', siteId: 'site-a', montantRecit: 10 };
  const sale = { clientId: 'client-a', siteId: 'site-a', modePaiement: 'CASH', lignes: [{ produitId: 'product', quantite: 1 }] };
  const retour = { modeRemboursement: 'CASH', motif: 'Retour', lignes: [{ produitId: 'product', quantite: 1 }] };
  const cashierPosts = [
    { path: '/clients/onboarding/recit', body: { ...recit, modePaiement: 'CASH' }, service: 'onboardingRecit' },
    { path: '/clients/client-a/onboarding/recit', body: { montantRecit: 10, modePaiement: 'CASH' }, service: 'resumeOnboardingRecit' },
    { path: '/clients/onboarding/recit/kpay/init', body: { ...recit, ...payment }, service: 'initKpayRecit' },
    { path: '/clients/client-a/onboarding/recit/kpay/init', body: { montantRecit: 10, ...payment }, service: 'resumeInitKpayRecit' },
    { path: '/clients/client-a/onboarding/fiche', body: { montantFiche: 10, modePaiement: 'CASH' }, service: 'onboardingFiche' },
    { path: '/clients/client-a/onboarding/fiche/kpay/init', body: { amount: 10, ...payment }, service: 'initKpayFiche' },
    { path: '/clients/client-a/onboarding/activate', body: { produitId: 'product', modePaiement: 'CASH' }, service: 'onboardingActivate' },
    { path: '/clients/client-a/onboarding/activate/kpay/init', body: { produitId: 'product', amount: 10, ...payment }, service: 'initKpayActivation' },
    { path: '/ventes', body: sale, service: 'createVente' },
    { path: '/ventes/kpay/init', body: { ...sale, ...payment }, service: 'initKpayVente' },
  ];
  const managerPosts = [
    { path: '/ventes/sale-a/retour', body: retour, service: 'createRetour' },
    { path: '/ventes/sale-a/retour/kpay-refund', body: retour, service: 'initKpayRefund' },
  ];
  const allPosts = [...cashierPosts, ...managerPosts];
  const business = Object.fromEntries(allPosts.map(operation => [operation.service,
    jest.fn<any>(async () => ({ result: operation.service })),
  ]));
  const prisma = {
    utilisateur: { findUnique: jest.fn<any>(async () => ({ ...actor, nom: 'Staff', actif: true })) },
    client: { findUnique: jest.fn<any>(async ({ where }) => {
      if (where.telephone === recit.telephone) return null;
      return { id: where.id ?? 'private-client', siteInscriptionId: where.id === 'client-a' ? 'site-a' : 'site-b' };
    }) },
    vente: { findUnique: jest.fn<any>(async () => ({ siteId: 'site-a', client: { siteInscriptionId: 'site-a' } })) },
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ClientsController, VentesController],
      providers: [JwtStrategy, RolesGuard, StaffScopeService,
        { provide: ConfigService, useValue: { get: () => 'financial-access-test-only' } },
        { provide: PrismaService, useValue: prisma },
        { provide: ClientsService, useValue: business },
        { provide: ClientParrainService, useValue: {} },
        { provide: VentesService, useValue: business },
      ],
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

  function post(operation: typeof allPosts[number], body: object = operation.body) {
    const token = jwt.sign({ sub: actor.id, role: Role.SUPER_ADMIN, siteId: 'site-b' });
    return request(app.getHttpServer()).post(operation.path).set('Authorization', `Bearer ${token}`).send(body);
  }

  function expectNoEffects() {
    for (const method of Object.values(business)) expect(method).not.toHaveBeenCalled();
  }

  describe.each([false, true])('mobile availability fixture enabled=%s', enabled => {
    let availability: ReturnType<typeof jest.replaceProperty>;
    beforeEach(() => {
      availability = jest.replaceProperty(mobileMoney as { MOBILE_MONEY_ENABLED: boolean }, 'MOBILE_MONEY_ENABLED', enabled);
    });
    afterEach(() => { availability.restore(); });

    it.each(cashierPosts)('denies an agent with a stale privileged JWT on $path', async operation => {
      actor.role = Role.AGENT;
      await post(operation).expect(403);
      expectNoEffects();
      expect(prisma.client.findUnique).not.toHaveBeenCalled();
      expect(prisma.vente.findUnique).not.toHaveBeenCalled();
    });

    it.each(cashierPosts)('does not accept browser authorization or finalization claims on $path', async operation => {
      actor.role = Role.AGENT;
      await post(operation, { ...operation.body, actorId: 'manager', agentId: 'manager', role: 'SUPER_ADMIN', trusted: true, finalize: true }).expect(403);
      expectNoEffects();
    });

    it.each(cashierPosts)('allows cashier processing only under the existing mobile policy on $path', async operation => {
      const blocked = !enabled && operation.path.includes('kpay');
      const response = await post(operation).expect(blocked ? 503 : 201);
      if (blocked) {
        expect(response.body.code).toBe('MOBILE_MONEY_UNAVAILABLE');
        expectNoEffects();
      } else {
        expect(response.body.result).toBe(operation.service);
        const args = business[operation.service].mock.calls[0];
        if (operation.service === 'onboardingRecit' || operation.service === 'resumeOnboardingRecit') {
          expect(args[args.length - 2]).toMatchObject({ agentId: 'cashier' });
          expect(args[args.length - 1]).toMatchObject({ id: 'cashier', role: Role.CAISSIER, siteId: 'site-a' });
        } else if (operation.service === 'onboardingActivate') {
          expect(args[2]).toBe('cashier');
          expect(args[3]).toMatchObject({ responseActor: { id: 'cashier', role: Role.CAISSIER, siteId: 'site-a' } });
        } else if (operation.service.includes('Recit')) {
          expect(args[args.length - 1]).toMatchObject({ agentId: 'cashier' });
        } else {
          expect(args[args.length - 1]).toBe('cashier');
        }
      }
    });

    it.each(cashierPosts)('denies a foreign cashier before effects on $path', async operation => {
      actor.siteId = 'site-b';
      const blocked = !enabled && operation.path.includes('kpay');
      await post(operation).expect(blocked ? 503 : 403);
      expectNoEffects();
    });

    it.each(cashierPosts)('denies an unassigned cashier before effects on $path', async operation => {
      actor.siteId = null;
      const blocked = !enabled && operation.path.includes('kpay');
      await post(operation).expect(blocked ? 503 : 403);
      expectNoEffects();
      expect(prisma.client.findUnique).not.toHaveBeenCalled();
    });

    describe.each([Role.AGENT, Role.CAISSIER])('%s refunds', role => {
      it.each(managerPosts)('denies $path even for an own-site sale', async operation => {
        actor.role = role;
        await post(operation).expect(403);
        expectNoEffects();
        expect(prisma.vente.findUnique).not.toHaveBeenCalled();
      });
    });

    describe.each([Role.GERANT, Role.DIRECTEUR_REGIONAL, Role.SUPER_ADMIN])('%s', role => {
      it.each(allPosts)('retains financial access subject to mobile policy on $path', async operation => {
        actor = { id: 'manager', role, siteId: 'site-b' };
        const blocked = !enabled && operation.path.includes('kpay');
        const response = await post(operation).expect(blocked ? 503 : 201);
        if (blocked) {
          expect(response.body.code).toBe('MOBILE_MONEY_UNAVAILABLE');
          expectNoEffects();
        } else {
          expect(response.body.result).toBe(operation.service);
          if (operation.path.includes('/retour')) expect(business[operation.service]).toHaveBeenCalledWith('sale-a', retour, 'manager');
        }
      });
    });

    it.each(cashierPosts.filter(operation => operation.path.startsWith('/clients/onboarding/recit')))(
      'blocks foreign-phone resumption on $path despite a valid requested site', async operation => {
        const blocked = !enabled && operation.path.includes('kpay');
        const response = await post(operation, { ...operation.body, telephone: '+243822222222' }).expect(blocked ? 503 : 409);
        expect(response.text).not.toMatch(/private-client|site-b/);
        expectNoEffects();
      },
    );

    it.each(cashierPosts.filter(operation => operation.path.startsWith('/ventes')))(
      'checks the linked client before $path', async operation => {
        const blocked = !enabled && operation.path.includes('kpay');
        await post(operation, { ...operation.body, clientId: 'client-b' }).expect(blocked ? 503 : 403);
        expectNoEffects();
      },
    );
  });

  it.each(allPosts)('requires an authentic JWT on $path', async operation => {
    await request(app.getHttpServer()).post(operation.path).send(operation.body).expect(401);
    await request(app.getHttpServer()).post(operation.path).set('Authorization', 'Bearer invalid').send(operation.body).expect(401);
    expectNoEffects();
  });
});

function clientDetailScopeFixture(needsHeal = false) {
  let healed = false;
  const sales = [
    { id: 'own-older', siteId: 'site-a', numeroVente: 'OWN-OLDER', montantNet: 10, pointsAttribues: 1, createdAt: new Date('2026-09-10T12:00:00.000Z') },
    { id: 'own-newer', siteId: 'site-a', numeroVente: 'OWN-NEWER', montantNet: 20, pointsAttribues: 2, createdAt: new Date('2026-09-11T12:00:00.000Z') },
    ...Array.from({ length: 22 }, (unused, index) => ({
      id: `foreign-${index}`, siteId: 'site-b', numeroVente: `PRIVATE-${index}`, montantNet: 1000, pointsAttribues: 100,
      createdAt: new Date(Date.UTC(2026, 8, 20, 12, 0, index)),
    })),
  ];
  const prisma = {
    client: {
      findUnique: jest.fn<(query: any) => Promise<any>>(async ({ where, select, include }) => {
        const siteInscriptionId = where.id === 'foreign-client' ? 'site-b' : 'site-a';
        if (where.siteInscriptionId && where.siteInscriptionId !== siteInscriptionId) return null;
        if (select) return { id: where.id, siteInscriptionId };
        const saleQuery = include.ventes;
        const ventes = sales.filter(sale => !saleQuery.where?.siteId || sale.siteId === saleQuery.where.siteId)
          .sort((first, second) => second.createdAt.getTime() - first.createdAt.getTime())
          .slice(0, saleQuery.take)
          .map(({ siteId, ...sale }) => sale);
        return {
          id: where.id, siteInscriptionId, statut: needsHeal ? 'ACTIF' : 'EN_COURS',
          createdAt: new Date('2026-09-01T12:00:00.000Z'), dateActivation: needsHeal ? new Date('2026-09-09T12:00:00.000Z') : null,
          siteInscription: { id: siteInscriptionId, nom: siteInscriptionId }, parrainClient: null, parrainClientId: null,
          filleulClaim: null, onboardingEtapes: [], ventes,
          membre: healed ? { matricule: 'MEMBER', dateInscription: new Date('2026-09-09T12:00:00.000Z'), parrain: null } : null,
        };
      }),
    },
  };
  const matrix = { onClientActivated: jest.fn(async () => { healed = true; }) };
  const service = new ClientsService(prisma as never, {} as never, {} as never, matrix as never, {} as never, {} as never, {} as never, {} as never);
  return { service, prisma, matrix, reset: () => { healed = false; } };
}

describe('Client detail nested sale scope', () => {
  describe.each([Role.AGENT, Role.CAISSIER])('%s', role => {
    const actor: StaffActor = { id: 'staff', role, siteId: 'site-a' };

    it.each([false, true])('filters nested sales before the latest-20 limit, including autoheal=%s', async needsHeal => {
      const { service, prisma, matrix } = clientDetailScopeFixture(needsHeal);
      const detail = await service.findOne('own-client', actor);
      expect(detail.ventes).toEqual([
        { id: 'own-newer', numeroVente: 'OWN-NEWER', montantNet: 20, pointsAttribues: 2, createdAt: new Date('2026-09-11T12:00:00.000Z') },
        { id: 'own-older', numeroVente: 'OWN-OLDER', montantNet: 10, pointsAttribues: 1, createdAt: new Date('2026-09-10T12:00:00.000Z') },
      ]);
      expect(detail.dateInscription).toEqual(new Date('2026-09-01T12:00:00.000Z'));
      expect(prisma.client.findUnique).toHaveBeenCalledTimes(needsHeal ? 2 : 1);
      for (const [query] of prisma.client.findUnique.mock.calls) {
        expect(query.where).toEqual({ id: 'own-client', siteInscriptionId: 'site-a' });
        expect(query.include.ventes).toMatchObject({ where: { siteId: 'site-a' }, orderBy: { createdAt: 'desc' }, take: 20 });
      }
      expect(matrix.onClientActivated).toHaveBeenCalledTimes(needsHeal ? 1 : 0);
      if (needsHeal) expect(detail.membre.matricule).toBe('MEMBER');
    });

    it('rejects an unassigned actor before reading or healing', async () => {
      const { service, prisma, matrix } = clientDetailScopeFixture(true);
      await expect(service.findOne('own-client', { ...actor, siteId: null })).rejects.toThrow(ForbiddenException);
      expect(prisma.client.findUnique).not.toHaveBeenCalled();
      expect(matrix.onClientActivated).not.toHaveBeenCalled();
    });

    it('does not heal a foreign client when the service receives a scoped actor', async () => {
      const { service, matrix } = clientDetailScopeFixture(true);
      await expect(service.findOne('foreign-client', actor)).rejects.toThrow(NotFoundException);
      expect(matrix.onClientActivated).not.toHaveBeenCalled();
    });
  });

  describe.each([Role.GERANT, Role.DIRECTEUR_REGIONAL, Role.SUPER_ADMIN, Role.FORMATEUR])('%s', role => {
    it.each([false, true])('preserves unrestricted nested sales and existing autoheal=%s', async needsHeal => {
      const { service, prisma, matrix } = clientDetailScopeFixture(needsHeal);
      const detail = await service.findOne('foreign-client', { id: 'staff', role, siteId: 'site-a' });
      expect(detail.ventes).toHaveLength(20);
      expect(detail.ventes[0]).toMatchObject({ id: 'foreign-21', numeroVente: 'PRIVATE-21', montantNet: 1000, pointsAttribues: 100 });
      for (const [query] of prisma.client.findUnique.mock.calls) {
        expect(query.where).toEqual({ id: 'foreign-client' });
        expect(query.include.ventes.where).toBeUndefined();
      }
      expect(matrix.onClientActivated).toHaveBeenCalledTimes(needsHeal ? 1 : 0);
    });
  });

  it.each([false, true])('preserves trusted internal no-actor calls, autoheal=%s', async needsHeal => {
    const { service } = clientDetailScopeFixture(needsHeal);
    const detail = await service.findOne('own-client');
    expect(detail.ventes).toHaveLength(20);
    expect(detail.ventes[0].id).toBe('foreign-21');
  });
});

function onboardingPaymentScopeFixture() {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const client = { id: 'client-a', prenom: 'Own', nom: 'Client', telephone: '+243811111111' };
  const foreignClient = { id: 'private-client-b', prenom: 'Private', nom: 'Foreign', telephone: '+243822222222' };
  const base = {
    siteId: 'site-a', clientSiteId: 'site-a', client, agentId: 'agent-a',
    etape: 'RECIT', statut: 'COMPLETE', completeeAt: today, modePaiement: 'CASH', referenceTransaction: 'RECEIPT',
  };
  const rows = [
    { ...base, id: 'own-recit', montant: 10 },
    { ...base, id: 'own-fiche', etape: 'FICHE', montant: 20 },
    { ...base, id: 'foreign-recit', clientSiteId: 'site-b', client: foreignClient, montant: 1000 },
    { ...base, id: 'foreign-fiche', clientSiteId: 'site-b', client: foreignClient, etape: 'FICHE', montant: 2000 },
    { ...base, id: 'foreign-site', siteId: 'site-b', montant: 4000 },
    { ...base, id: 'own-yesterday', completeeAt: yesterday, montant: 30 },
    { ...base, id: 'other-agent', agentId: 'agent-b', etape: 'FICHE', montant: 40 },
    { ...base, id: 'incomplete', statut: 'EN_COURS', montant: 8000 },
    { ...base, id: 'free', montant: null },
    { ...base, id: 'formation', etape: 'FORMATION', montant: 16000 },
  ];
  function matches(row: typeof rows[number], where: any): boolean {
    if (where.siteId && row.siteId !== where.siteId) return false;
    if (where.client && row.clientSiteId !== where.client.siteInscriptionId) return false;
    if (where.agentId && row.agentId !== where.agentId) return false;
    if (where.statut && row.statut !== where.statut) return false;
    if (where.montant?.not === null && row.montant === null) return false;
    if (typeof where.etape === 'string' && row.etape !== where.etape) return false;
    if (where.etape?.in && !where.etape.in.includes(row.etape)) return false;
    if (where.completeeAt?.gte && row.completeeAt < new Date(where.completeeAt.gte)) return false;
    if (where.completeeAt?.lte && row.completeeAt > new Date(where.completeeAt.lte)) return false;
    return true;
  }
  const prisma = {
    onboardingEtape: {
      findMany: jest.fn<(query: any) => Promise<any[]>>(async ({ where, skip, take }) => rows.filter(row => matches(row, where))
        .sort((first, second) => second.completeeAt.getTime() - first.completeeAt.getTime())
        .slice(skip, skip + take).map(({ clientSiteId, ...row }) => ({
          ...row, agent: { id: row.agentId, nom: row.agentId }, site: { id: row.siteId, nom: row.siteId },
        }))),
      count: jest.fn<(query: any) => Promise<number>>(async ({ where }) => rows.filter(row => matches(row, where)).length),
      aggregate: jest.fn<(query: any) => Promise<any>>(async ({ where }) => {
        const matching = rows.filter(row => matches(row, where));
        return { _sum: { montant: matching.reduce((total, row) => total + (row.montant ?? 0), 0) }, _count: { id: matching.length } };
      }),
    },
  };
  const service = new ClientsService(prisma as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
  return { service, prisma, today, yesterday };
}

describe('Onboarding payment linked-client scope', () => {
  describe.each([Role.AGENT, Role.CAISSIER])('%s', role => {
    const actor: StaffActor = { id: 'staff', role, siteId: 'site-a' };

    it.each([{}, { siteId: 'site-a' }])('filters private client rows and all KPIs with query %j', async query => {
      const { service, prisma } = onboardingPaymentScopeFixture();
      const result = await service.getPaiementsOnboarding(query, actor);
      expect(result.paiements.map(payment => payment.id)).toEqual(['own-recit', 'own-fiche', 'other-agent', 'own-yesterday']);
      expect(result.paiements.map(payment => payment.client.id)).toEqual(['client-a', 'client-a', 'client-a', 'client-a']);
      expect(JSON.stringify(result)).not.toMatch(/private-client-b|\+243822222222|foreign/);
      expect(result.meta).toEqual({ total: 4, page: 1, limit: 50, totalPages: 1 });
      expect(result.kpis).toEqual({ totalEncaisse: 100, totalEncaisseJour: 70, nbRecitJour: 1, nbFicheJour: 2, montantRecitJour: 10, montantFicheJour: 60 });
      const where = prisma.onboardingEtape.findMany.mock.calls[0][0].where;
      expect(where).toEqual({ etape: { in: ['RECIT', 'FICHE'] }, statut: 'COMPLETE', montant: { not: null }, siteId: 'site-a', client: { siteInscriptionId: 'site-a' } });
      expect(prisma.onboardingEtape.count.mock.calls[0][0].where).toBe(where);
      expect(prisma.onboardingEtape.aggregate).toHaveBeenCalledTimes(4);
      expect(prisma.onboardingEtape.aggregate.mock.calls[0][0].where).toBe(where);
      for (const [query] of prisma.onboardingEtape.aggregate.mock.calls) {
        expect(query.where.siteId).toBe('site-a');
        expect(query.where.client).toBe(where.client);
      }
    });

    it.each([null, undefined, ''])('rejects an unassigned actor (%s) before rows/counts/aggregates', async siteId => {
      const { service, prisma } = onboardingPaymentScopeFixture();
      await expect(service.getPaiementsOnboarding({ siteId: 'site-a' }, { ...actor, siteId })).rejects.toThrow(ForbiddenException);
      for (const method of Object.values(prisma.onboardingEtape)) expect(method).not.toHaveBeenCalled();
    });

    it('rejects a forged service site rather than deriving client scope from it', async () => {
      const { service, prisma } = onboardingPaymentScopeFixture();
      await expect(service.getPaiementsOnboarding({ siteId: 'site-b' }, actor)).rejects.toThrow(ForbiddenException);
      for (const method of Object.values(prisma.onboardingEtape)) expect(method).not.toHaveBeenCalled();
    });
  });

  it('retains agent/date/pagination filters and the existing daily-KPI time window', async () => {
    const { service, prisma, yesterday } = onboardingPaymentScopeFixture();
    const start = new Date(yesterday);
    start.setHours(0, 0, 0, 0);
    const end = new Date(yesterday);
    end.setHours(23, 59, 59, 999);
    const result = await service.getPaiementsOnboarding({
      agentId: 'agent-a', dateDebut: start.toISOString(), dateFin: end.toISOString(), page: 1, limit: 1,
    }, { id: 'staff', role: Role.CAISSIER, siteId: 'site-a' });
    expect(result.paiements.map(payment => payment.id)).toEqual(['own-yesterday']);
    expect(result.meta).toEqual({ total: 1, page: 1, limit: 1, totalPages: 1 });
    expect(result.kpis).toEqual({ totalEncaisse: 30, totalEncaisseJour: 30, nbRecitJour: 1, nbFicheJour: 1, montantRecitJour: 10, montantFicheJour: 20 });
    const where = prisma.onboardingEtape.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ siteId: 'site-a', client: { siteInscriptionId: 'site-a' }, agentId: 'agent-a', completeeAt: { gte: start, lte: end } });
    for (const [query] of prisma.onboardingEtape.aggregate.mock.calls) {
      expect(query.where.client).toEqual({ siteInscriptionId: 'site-a' });
      expect(query.where.agentId).toBe('agent-a');
    }
  });

  it.each([Role.GERANT, Role.DIRECTEUR_REGIONAL, Role.SUPER_ADMIN])('preserves %s unrestricted and selected-site client/payment visibility', async role => {
    const { service, prisma } = onboardingPaymentScopeFixture();
    const actor: StaffActor = { id: 'manager', role, siteId: 'site-a' };
    const all = await service.getPaiementsOnboarding({}, actor);
    expect(all.meta.total).toBe(7);
    expect(all.kpis).toEqual({ totalEncaisse: 7100, totalEncaisseJour: 7070, nbRecitJour: 3, nbFicheJour: 3, montantRecitJour: 5010, montantFicheJour: 2060 });
    const selected = await service.getPaiementsOnboarding({ siteId: 'site-a' }, actor);
    expect(selected.paiements.map(payment => payment.id)).toContain('foreign-recit');
    expect(selected.meta.total).toBe(6);
    expect(selected.kpis).toEqual({ totalEncaisse: 3100, totalEncaisseJour: 3070, nbRecitJour: 2, nbFicheJour: 3, montantRecitJour: 1010, montantFicheJour: 2060 });
    for (const [query] of prisma.onboardingEtape.aggregate.mock.calls) expect(query.where.client).toBeUndefined();
  });
});

describe('Client relational reads over HTTP with real service methods', () => {
  let app: INestApplication;
  let actor: StaffActor;
  const fixture = clientDetailScopeFixture(true);
  const payments = onboardingPaymentScopeFixture();

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ClientsController],
      providers: [RolesGuard, StaffScopeService,
        { provide: ClientsService, useValue: {
          findOne: fixture.service.findOne.bind(fixture.service),
          getPaiementsOnboarding: payments.service.getPaiementsOnboarding.bind(payments.service),
        } },
        { provide: ClientParrainService, useValue: {} },
        { provide: PrismaService, useValue: fixture.prisma },
      ],
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
    fixture.reset();
    actor = { id: 'staff', role: Role.CAISSIER, siteId: 'site-a' };
  });
  afterAll(async () => { await app?.close(); });

  it.each([Role.AGENT, Role.CAISSIER])('keeps %s nested sales scoped through autoheal despite query claims', async role => {
    actor.role = role;
    const response = await request(app.getHttpServer()).get('/clients/own-client?siteId=site-b&role=SUPER_ADMIN').expect(200);
    expect(response.body.ventes.map(sale => sale.id)).toEqual(['own-newer', 'own-older']);
    expect(response.text).not.toContain('PRIVATE');
    expect(response.body.membre.matricule).toBe('MEMBER');
    expect(fixture.matrix.onClientActivated).toHaveBeenCalledTimes(1);
    const detailQueries = fixture.prisma.client.findUnique.mock.calls.filter(([query]) => query.include);
    expect(detailQueries).toHaveLength(2);
    for (const [query] of detailQueries) expect(query.include.ventes.where).toEqual({ siteId: 'site-a' });
  });

  it('rejects a foreign client before any detail query or autoheal', async () => {
    await request(app.getHttpServer()).get('/clients/foreign-client').expect(403);
    expect(fixture.prisma.client.findUnique).toHaveBeenCalledTimes(1);
    expect(fixture.prisma.client.findUnique.mock.calls[0][0]).toEqual({ where: { id: 'foreign-client' }, select: { id: true, siteInscriptionId: true } });
    expect(fixture.matrix.onClientActivated).not.toHaveBeenCalled();
  });

  it.each([Role.GERANT, Role.FORMATEUR])('preserves %s detail visibility and autoheal', async role => {
    actor.role = role;
    const response = await request(app.getHttpServer()).get('/clients/foreign-client').expect(200);
    expect(response.body.ventes).toHaveLength(20);
    expect(response.body.ventes[0].numeroVente).toBe('PRIVATE-21');
    expect(fixture.matrix.onClientActivated).toHaveBeenCalledTimes(1);
  });

  it.each([Role.AGENT, Role.CAISSIER])('keeps %s payment rows and totals within authenticated client scope', async role => {
    actor.role = role;
    const response = await request(app.getHttpServer()).get('/clients/paiements-onboarding?clientSiteId=site-b&role=SUPER_ADMIN').expect(200);
    expect(response.body.paiements.map(payment => payment.id)).toEqual(['own-recit', 'own-fiche', 'other-agent', 'own-yesterday']);
    expect(response.body.meta.total).toBe(4);
    expect(response.body.kpis).toEqual({ totalEncaisse: 100, totalEncaisseJour: 70, nbRecitJour: 1, nbFicheJour: 2, montantRecitJour: 10, montantFicheJour: 60 });
    expect(response.text).not.toMatch(/private-client-b|\+243822222222|foreign/);
    for (const [query] of payments.prisma.onboardingEtape.aggregate.mock.calls) expect(query.where.client).toEqual({ siteInscriptionId: 'site-a' });
  });

  it('preserves manager payment visibility without opening the route to trainers', async () => {
    actor.role = Role.GERANT;
    const response = await request(app.getHttpServer()).get('/clients/paiements-onboarding').expect(200);
    expect(response.body.meta.total).toBe(7);
    expect(response.body.kpis.totalEncaisse).toBe(7100);
    const reads = payments.prisma.onboardingEtape.findMany.mock.calls.length;
    actor.role = Role.FORMATEUR;
    await request(app.getHttpServer()).get('/clients/paiements-onboarding').expect(403);
    expect(payments.prisma.onboardingEtape.findMany).toHaveBeenCalledTimes(reads);
  });
});

describe('Client service list and import boundaries', () => {
  let service: ClientsService;
  let actor: StaffActor;
  const prisma = {
    client: { findMany: jest.fn<any>(), count: jest.fn<any>(), findUnique: jest.fn<any>(), create: jest.fn<any>() },
    site: { findUnique: jest.fn<any>() },
    utilisateur: { findFirst: jest.fn<any>() },
  };

  beforeEach(() => {
    for (const model of Object.values(prisma)) {
      for (const method of Object.values(model)) method.mockReset();
    }
    actor = { id: 'cashier', role: Role.CAISSIER, siteId: 'site-a' };
    prisma.client.findMany.mockResolvedValue([]);
    prisma.client.count.mockResolvedValue(0);
    prisma.client.findUnique.mockResolvedValue(null);
    prisma.client.create.mockImplementation(async ({ data }) => ({ id: 'imported', ...data }));
    prisma.site.findUnique.mockImplementation(async ({ where }) => ({ id: where.id }));
    prisma.utilisateur.findFirst.mockResolvedValue({ id: 'arbitrary-agent' });
    service = new ClientsService(prisma as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
  });

  function csv(header: string, rows: string): Express.Multer.File {
    return { buffer: Buffer.from(`${header}\n${rows}`), originalname: 'clients.csv' } as Express.Multer.File;
  }

  describe.each([Role.AGENT, Role.CAISSIER])('%s', role => {
    beforeEach(() => { actor.role = role; });

    it('scopes the real client list query and count', async () => {
      const result = await service.findAll({}, actor);
      expect(result).toMatchObject({ data: [], meta: { total: 0 } });
      expect(prisma.client.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { siteInscriptionId: 'site-a' } }));
      expect(prisma.client.count).toHaveBeenCalledWith({ where: { siteInscriptionId: 'site-a' } });
    });

    it('rejects a missing or forged site before any list database query', async () => {
      await expect(service.findAll({ siteId: 'site-b' }, actor)).rejects.toThrow(ForbiddenException);
      await expect(service.findAll({}, { ...actor, siteId: null })).rejects.toThrow(ForbiddenException);
      expect(prisma.client.findMany).not.toHaveBeenCalled();
      expect(prisma.client.count).not.toHaveBeenCalled();
    });

    it('imports unpaid EN_COURS records with the authenticated site and creator', async () => {
      const file = csv('prenom,nom,telephone,createdById,agentId', 'Anna,Test,+243811111111,forged,forged');
      const result = await service.importExecute(file, actor);
      expect(result).toEqual({ success: 1, doublons: 0, errors: 0, details: [] });
      expect(prisma.client.create).toHaveBeenCalledWith({ data: {
        prenom: 'Anna', nom: 'Test', telephone: '+243811111111', email: undefined,
        matriculeExterne: undefined, siteInscriptionId: 'site-a', createdById: 'cashier', statut: 'EN_COURS',
      } });
      expect(prisma.utilisateur.findFirst).not.toHaveBeenCalled();
    });

    it('rejects any foreign import row before even an earlier valid row is created', async () => {
      const file = csv('prenom,nom,telephone,siteId', 'Anna,Test,+243811111111,site-a\nBob,Test,+243822222222,site-b');
      await expect(service.importExecute(file, actor)).rejects.toThrow(ForbiddenException);
      expect(prisma.client.create).not.toHaveBeenCalled();
    });

    it.each([
      ['statut', 'ACTIF'], ['onboardingEtapes', 'COMPLETE'], ['montantRecit', '25'], ['modePaiement', 'CASH'],
    ])('rejects imported state or payment injection %s', async (column, value) => {
      const file = csv(`prenom,nom,telephone,siteId,${column}`, `Anna,Test,+243811111111,site-a,${value}`);
      await expect(service.importExecute(file, actor)).rejects.toThrow(BadRequestException);
      expect(prisma.client.create).not.toHaveBeenCalled();
    });

    it('rejects unassigned import execution even with a supplied row site', async () => {
      const file = csv('prenom,nom,telephone,siteId', 'Anna,Test,+243811111111,site-a');
      await expect(service.importExecute(file, { ...actor, siteId: null })).rejects.toThrow(ForbiddenException);
      expect(prisma.client.create).not.toHaveBeenCalled();
    });
  });

  it('passes the validated site to the actual search query', async () => {
    await service.search('Anna', 'EN_COURS', 'site-a');
    expect(prisma.client.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ siteInscriptionId: 'site-a', statut: 'EN_COURS' }) }));
  });

  it('retains manager import site and creator selection without adding payment fields', async () => {
    actor.role = Role.GERANT;
    const result = await service.importExecute(csv('prenom,nom,telephone,siteId', 'Anna,Test,+243811111111,site-b'), actor);
    expect(result.success).toBe(1);
    expect(prisma.client.create).toHaveBeenCalledWith({ data: {
      prenom: 'Anna', nom: 'Test', telephone: '+243811111111', email: undefined,
      matriculeExterne: undefined, siteInscriptionId: 'site-b', createdById: 'arbitrary-agent', statut: 'EN_COURS',
    } });
  });
});

describe('Client HTTP staff boundaries', () => {
  let app: INestApplication;
  let actor: StaffActor;
  const privateClient = { id: 'foreign-client', nom: 'Private name', telephone: '+243822222222' };
  const clients = {
    findAll: jest.fn<any>().mockResolvedValue({ data: [privateClient] }),
    search: jest.fn<any>().mockResolvedValue({ clients: [privateClient] }),
    searchParrain: jest.fn<any>().mockResolvedValue({ results: [{ id: 'foreign-parent', nom: 'Recruiter', codeParrain: 'PARENT' }] }),
    getNextCode: jest.fn<any>().mockResolvedValue({ nextCode: 'NEXT' }),
    getOnboardingQueue: jest.fn<any>().mockResolvedValue({ clients: [privateClient] }),
    getPaiementsOnboarding: jest.fn<any>().mockResolvedValue({ data: [privateClient] }),
    checkPhone: jest.fn<any>().mockResolvedValue({ exists: true, clientId: privateClient.id, client: privateClient }),
    findOne: jest.fn<any>(async id => ({ ...privateClient, id })),
    update: jest.fn<any>().mockResolvedValue({ id: 'own-client', nom: 'Updated' }),
    onboardingFormation: jest.fn<any>().mockResolvedValue({ etape: 'FORMATION', statut: 'COMPLETE' }),
    onboardingRecit: jest.fn<any>().mockResolvedValue({ id: 'new-client' }),
    createDraft: jest.fn<any>().mockResolvedValue({
      client: { id: 'draft-client', prenom: 'Client', nom: 'Test', telephone: '+243999000101', statut: 'EN_COURS', createdById: 'cashier' },
      etapeId: 'draft-step',
    }),
    resumeOnboardingRecit: jest.fn<any>().mockResolvedValue({ etape: 'RECIT' }),
    resumeInitKpayRecit: jest.fn<any>().mockResolvedValue({ transactionId: 'recit' }),
    onboardingFiche: jest.fn<any>().mockResolvedValue({ etape: 'FICHE' }),
    onboardingActivate: jest.fn<any>().mockResolvedValue({ etape: 'ACTIVATION' }),
    initKpayRecit: jest.fn<any>().mockResolvedValue({ transactionId: 'new-recit' }),
    initKpayFiche: jest.fn<any>().mockResolvedValue({ transactionId: 'fiche' }),
    initKpayActivation: jest.fn<any>().mockResolvedValue({ transactionId: 'activation' }),
    importPreview: jest.fn<any>().mockResolvedValue({ total: 1 }),
    importExecute: jest.fn<any>().mockResolvedValue({ success: 1 }),
  };
  const prisma = {
    client: {
      findUnique: jest.fn<any>(async ({ where }) => {
        if (where.id === 'missing') return null;
        return { id: where.id ?? 'phone-client', siteInscriptionId: where.id === 'own-client' || where.telephone === '+243811111111' ? 'site-a' : 'site-b' };
      }),
    },
  };
  const formation = { formateurId: 'trainer', dateFormation: '2026-09-19T12:00:00.000Z' };
  const existingOperations = [
    { method: 'get', suffix: '', body: {}, service: 'findOne' },
    { method: 'patch', suffix: '', body: { nom: 'Updated' }, service: 'update' },
    { method: 'post', suffix: '/onboarding/formation', body: formation, service: 'onboardingFormation' },
    { method: 'post', suffix: '/onboarding/recit', body: { modePaiement: 'CASH' }, service: 'resumeOnboardingRecit' },
    { method: 'post', suffix: '/onboarding/fiche', body: { modePaiement: 'CASH', montantFiche: 10 }, service: 'onboardingFiche' },
    { method: 'post', suffix: '/onboarding/activate', body: { modePaiement: 'CASH', produitId: 'product' }, service: 'onboardingActivate' },
    { method: 'post', suffix: '/onboarding/recit/kpay/init', body: {}, service: 'resumeInitKpayRecit' },
    { method: 'post', suffix: '/onboarding/fiche/kpay/init', body: { amount: 10, provider: 'VODACOM_MPESA_COD', phoneNumber: '+243811111111' }, service: 'initKpayFiche' },
    { method: 'post', suffix: '/onboarding/activate/kpay/init', body: { amount: 10, provider: 'VODACOM_MPESA_COD', phoneNumber: '+243811111111', produitId: 'product' }, service: 'initKpayActivation' },
  ];

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ClientsController],
      providers: [RolesGuard, StaffScopeService,
        { provide: ClientsService, useValue: clients },
        { provide: ClientParrainService, useValue: {} },
        { provide: PrismaService, useValue: prisma },
      ],
    }).overrideGuard(JwtAuthGuard).useValue({
      canActivate(context: ExecutionContext) {
        if (!actor) throw new UnauthorizedException();
        context.switchToHttp().getRequest().user = actor;
        return true;
      },
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
    }));
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    actor = { id: 'cashier', role: Role.CAISSIER, siteId: 'site-a' };
  });
  afterAll(async () => { await app?.close(); });

  function expectNoBusinessCalls() {
    for (const method of Object.values(clients)) expect(method).not.toHaveBeenCalled();
  }

  describe('unpaid draft contract', () => {
    const draft = { prenom: 'Client', nom: 'Test', telephone: '+243999000101', siteId: 'site-a' };

    it.each([Role.AGENT, Role.CAISSIER, Role.GERANT, Role.DIRECTEUR_REGIONAL, Role.SUPER_ADMIN])('allows %s preparation with the real actor', async role => {
      actor.role = role;
      const response = await request(app.getHttpServer()).post('/clients/onboarding/draft').send(draft).expect(201);
      expect(response.body).toEqual({
        client: { id: 'draft-client', prenom: 'Client', nom: 'Test', telephone: '+243999000101', statut: 'EN_COURS', createdById: 'cashier' },
        etapeId: 'draft-step',
      });
      expect(clients.createDraft).toHaveBeenCalledWith(draft, actor);
      expect(clients.onboardingRecit).not.toHaveBeenCalled();
    });

    it('accepts optional identity and recruiter fields without payment', async () => {
      const body = { ...draft, email: 'client@example.com', codeParrain: 'PARENT', matriculeExterne: 'EXT-1' };
      await request(app.getHttpServer()).post('/clients/onboarding/draft').send(body).expect(201);
      expect(clients.createDraft).toHaveBeenCalledWith(body, actor);
    });

    it.each([
      { montantRecit: 10 }, { modePaiement: 'CASH' }, { statut: 'ACTIF' },
      { completeeAt: '2026-09-20T10:00:00.000Z' }, { montant: 10 }, { referenceTransaction: 'paid' },
      { onboardingEtapes: [{ etape: 'RECIT', statut: 'COMPLETE' }] },
      { createdById: 'forged' }, { agentId: 'forged' }, { parrainClientId: 'forged' },
    ])('rejects injected fields %j before business access', async injection => {
      await request(app.getHttpServer()).post('/clients/onboarding/draft').send({ ...draft, ...injection }).expect(400);
      expectNoBusinessCalls();
    });

    it.each([
      { prenom: '' }, { nom: '' }, { telephone: '0999000101' }, { siteId: '' },
      { email: 'invalid' }, { email: 123 }, { telephone: 243999000101 },
    ])('validates identity %j before business access', async invalid => {
      await request(app.getHttpServer()).post('/clients/onboarding/draft').send({ ...draft, ...invalid }).expect(400);
      expectNoBusinessCalls();
    });

    it.each(['prenom', 'nom', 'codeParrain', 'matriculeExterne'])('preserves production string coercion for numeric %s', async field => {
      await request(app.getHttpServer()).post('/clients/onboarding/draft').send({ ...draft, [field]: 123 }).expect(201);
      expect(clients.createDraft).toHaveBeenCalledWith({ ...draft, [field]: '123' }, actor);
    });

    it.each([Role.FORMATEUR, Role.CLIENT])('denies %s preparation', async role => {
      actor.role = role;
      await request(app.getHttpServer()).post('/clients/onboarding/draft').send(draft).expect(403);
      expectNoBusinessCalls();
    });

    it('requires authentication', async () => {
      actor = undefined;
      await request(app.getHttpServer()).post('/clients/onboarding/draft').send(draft).expect(401);
      expectNoBusinessCalls();
    });
  });

  describe.each([Role.AGENT, Role.CAISSIER])('%s', role => {
    beforeEach(() => { actor.role = role; });

    it.each(['', '/search?q=Private', '/onboarding-queue', '/paiements-onboarding'])('rejects a forged list site on %s', async path => {
      const response = await request(app.getHttpServer()).get(`/clients${path}`).query({ siteId: 'site-b' }).expect(403);
      expect(response.body.code).toBe('ERR_SITE_FORBIDDEN');
      expect(response.text).not.toContain('Private name');
      expectNoBusinessCalls();
    });

    it.each(['', '/search?q=Private', '/onboarding-queue', '/paiements-onboarding', '/own-client', '/check-phone/+243811111111'])('rejects a missing assigned site on %s', async path => {
      actor.siteId = null;
      const response = await request(app.getHttpServer()).get(`/clients${path}`).expect(403);
      expect(response.body.code).toBe('ERR_SITE_REQUIRED');
      expectNoBusinessCalls();
      expect(prisma.client.findUnique).not.toHaveBeenCalled();
    });

    it('defaults omitted filters to the authenticated site', async () => {
      await request(app.getHttpServer()).get('/clients').expect(200);
      expect(clients.findAll).toHaveBeenCalledWith(expect.objectContaining({ siteId: 'site-a' }), actor);
      await request(app.getHttpServer()).get('/clients/onboarding-queue').expect(200);
      expect(clients.getOnboardingQueue).toHaveBeenCalledWith('site-a');
      await request(app.getHttpServer()).get('/clients/paiements-onboarding').expect(200);
      expect(clients.getPaiementsOnboarding).toHaveBeenCalledWith(expect.objectContaining({ siteId: 'site-a' }), actor);
      await request(app.getHttpServer()).get('/clients/search?q=Anna&statut=EN_COURS').expect(200);
      expect(clients.search).toHaveBeenCalledWith('Anna', 'EN_COURS', 'site-a');
    });

    it.each(existingOperations)('rejects direct $method $suffix before $service', async operation => {
      const enabled = jest.replaceProperty(mobileMoney as { MOBILE_MONEY_ENABLED: boolean }, 'MOBILE_MONEY_ENABLED', true);
      try {
        const response = await request(app.getHttpServer())[operation.method](`/clients/foreign-client${operation.suffix}`).send(operation.body).expect(403);
        if (role === Role.AGENT && !['findOne', 'update', 'onboardingFormation'].includes(operation.service)) {
          expect(prisma.client.findUnique).not.toHaveBeenCalled();
        } else {
          expect(response.body.code).toBe('ERR_SITE_FORBIDDEN');
        }
        expect(response.text).not.toContain('Private name');
        expectNoBusinessCalls();
      } finally { enabled.restore(); }
    });

    it('returns a generic conflict for a foreign phone without a client identifier', async () => {
      const response = await request(app.getHttpServer()).get('/clients/check-phone/+243822222222').expect(409);
      expect(response.body.code).toBe('ERR_CONFLICT');
      expect(response.body).not.toHaveProperty('client');
      expect(response.body).not.toHaveProperty('clientId');
      expect(response.text).not.toContain('phone-client');
      expectNoBusinessCalls();
    });

    it.each(['onboarding/recit', 'onboarding/recit/kpay/init'])('blocks a foreign existing phone before %s can resume it', async path => {
      const enabled = jest.replaceProperty(mobileMoney as { MOBILE_MONEY_ENABLED: boolean }, 'MOBILE_MONEY_ENABLED', true);
      try {
        await request(app.getHttpServer()).post(`/clients/${path}`)
          .send({ telephone: '+243822222222', siteId: 'site-a', modePaiement: 'CASH' }).expect(role === Role.AGENT ? 403 : 409);
        expectNoBusinessCalls();
      } finally { enabled.restore(); }
    });

    it('rejects a forged creation site before looking up the phone', async () => {
      await request(app.getHttpServer()).post('/clients/onboarding/recit')
        .send({ telephone: '+243811111111', siteId: 'site-b', modePaiement: 'CASH' }).expect(403);
      expectNoBusinessCalls();
      expect(prisma.client.findUnique).not.toHaveBeenCalled();
    });

    it('preserves minimal global recruiter search without private detail access', async () => {
      const response = await request(app.getHttpServer()).get('/clients/search-parrain?q=Recruiter').expect(200);
      expect(response.body).toEqual({ results: [{ id: 'foreign-parent', nom: 'Recruiter', codeParrain: 'PARENT' }] });
      expect(clients.searchParrain).toHaveBeenCalledWith('Recruiter');
      expect(prisma.client.findUnique).not.toHaveBeenCalled();
      expect(clients.findOne).not.toHaveBeenCalled();
    });
  });

  it.each(existingOperations)('allows own-site $method $suffix after scope lookup', async operation => {
    const enabled = jest.replaceProperty(mobileMoney as { MOBILE_MONEY_ENABLED: boolean }, 'MOBILE_MONEY_ENABLED', true);
    try {
      const response = await request(app.getHttpServer())[operation.method](`/clients/own-client${operation.suffix}`).send(operation.body)
        .expect(operation.method === 'post' ? 201 : 200);
      expect(response.body).toEqual({
        findOne: { id: 'own-client', nom: 'Private name', telephone: '+243822222222' },
        update: { id: 'own-client', nom: 'Updated' },
        onboardingFormation: { etape: 'FORMATION', statut: 'COMPLETE' },
        resumeOnboardingRecit: { etape: 'RECIT' },
        onboardingFiche: { etape: 'FICHE' },
        onboardingActivate: { etape: 'ACTIVATION' },
        resumeInitKpayRecit: { transactionId: 'recit' },
        initKpayFiche: { transactionId: 'fiche' },
        initKpayActivation: { transactionId: 'activation' },
      }[operation.service]);
      expect(prisma.client.findUnique).toHaveBeenCalledWith({ where: { id: 'own-client' }, select: { id: true, siteInscriptionId: true } });
      expect(prisma.client.findUnique.mock.invocationCallOrder[0]).toBeLessThan(clients[operation.service].mock.invocationCallOrder[0]);
    } finally { enabled.restore(); }
  });

  it('returns 404 before invoking detail business logic for a missing client', async () => {
    await request(app.getHttpServer()).get('/clients/missing').expect(404);
    expectNoBusinessCalls();
  });

  it('always passes the authenticated actor to the detail service', async () => {
    await request(app.getHttpServer()).get('/clients/own-client').expect(200);
    expect(clients.findOne).toHaveBeenCalledWith('own-client', actor);
  });

  it('allows an accessible phone and binds new receipt site and actor', async () => {
    await request(app.getHttpServer()).get('/clients/check-phone/+243811111111').expect(200);
    expect(clients.checkPhone).toHaveBeenCalledWith('+243811111111');
    await request(app.getHttpServer()).post('/clients/onboarding/recit')
      .send({ telephone: '+243811111111', modePaiement: 'CASH', agentId: 'forged' }).expect(201);
    expect(clients.onboardingRecit).toHaveBeenCalledWith({ telephone: '+243811111111', modePaiement: 'CASH', siteId: 'site-a', agentId: 'cashier' }, actor);
  });

  it.each(['preview', 'execute'])('passes the authenticated importer to %s', async path => {
    await request(app.getHttpServer()).post(`/clients/import/${path}`)
      .attach('file', Buffer.from('prenom,nom,telephone\nAnna,Test,+243811111111'), 'clients.csv').expect(201);
    expect(clients[path === 'preview' ? 'importPreview' : 'importExecute']).toHaveBeenCalledWith(expect.objectContaining({ originalname: 'clients.csv' }), actor);
  });

  it.each(['preview', 'execute'])('refuses an unassigned importer before %s', async path => {
    actor.siteId = null;
    await request(app.getHttpServer()).post(`/clients/import/${path}`)
      .attach('file', Buffer.from('prenom,nom,telephone\nAnna,Test,+243811111111'), 'clients.csv').expect(403);
    expectNoBusinessCalls();
  });

  it.each([{ siteId: 'site-b' }, { statut: 'ACTIF' }, { onboardingEtapes: [{ statut: 'COMPLETE' }] }])('rejects generic update escalation %j', async injection => {
    await request(app.getHttpServer()).patch('/clients/own-client').send({ nom: 'Updated', ...injection }).expect(400);
    expectNoBusinessCalls();
  });

  it('preserves trainer detail and formation without imposing new trainer site restrictions', async () => {
    actor = { id: 'trainer', role: Role.FORMATEUR, siteId: 'site-a' };
    const detail = await request(app.getHttpServer()).get('/clients/foreign-client').expect(200);
    expect(detail.body).toEqual(privateClient);
    const response = await request(app.getHttpServer()).post('/clients/foreign-client/onboarding/formation').send(formation).expect(201);
    expect(response.body).toEqual({ etape: 'FORMATION', statut: 'COMPLETE' });
    expect(clients.onboardingFormation).toHaveBeenCalledWith('foreign-client', formation, 'trainer');
  });

  it.each(existingOperations.filter(operation => !['findOne', 'onboardingFormation'].includes(operation.service)))('denies trainer $service', async operation => {
    actor.role = Role.FORMATEUR;
    await request(app.getHttpServer())[operation.method](`/clients/own-client${operation.suffix}`).send(operation.body).expect(403);
    expectNoBusinessCalls();
    expect(prisma.client.findUnique).not.toHaveBeenCalled();
  });

  it.each(['/clients', '/clients/search?q=Anna', '/clients/check-phone/+243811111111', '/clients/onboarding-queue', '/clients/paiements-onboarding'])('denies ordinary trainer read %s', async path => {
    actor.role = Role.FORMATEUR;
    await request(app.getHttpServer()).get(path).expect(403);
    expectNoBusinessCalls();
  });

  it.each(['onboarding/recit', 'onboarding/recit/kpay/init', 'import/preview', 'import/execute'])('denies trainer creation %s', async path => {
    actor.role = Role.FORMATEUR;
    await request(app.getHttpServer()).post(`/clients/${path}`).send({ modePaiement: 'CASH' }).expect(403);
    expectNoBusinessCalls();
  });

  it.each([Role.GERANT, Role.DIRECTEUR_REGIONAL, Role.SUPER_ADMIN])('preserves %s cross-site reads', async role => {
    actor.role = role;
    await request(app.getHttpServer()).get('/clients').expect(200);
    expect(clients.findAll).toHaveBeenCalledWith(expect.objectContaining({ siteId: undefined }), actor);
    await request(app.getHttpServer()).get('/clients?siteId=site-b').expect(200);
    expect(clients.findAll).toHaveBeenLastCalledWith(expect.objectContaining({ siteId: 'site-b' }), actor);
    await request(app.getHttpServer()).get('/clients/foreign-client').expect(200);
    await request(app.getHttpServer()).get('/clients/check-phone/+243822222222').expect(200);
  });

  it('keeps mobile money disabled at the real HTTP guard', async () => {
    const response = await request(app.getHttpServer()).post('/clients/own-client/onboarding/recit/kpay/init').send({}).expect(503);
    expect(response.body.code).toBe('MOBILE_MONEY_UNAVAILABLE');
    expectNoBusinessCalls();
  });

  it('denies unauthenticated and client identities before business access', async () => {
    actor = undefined;
    await request(app.getHttpServer()).get('/clients/own-client').expect(401);
    actor = { id: 'portal', role: Role.CLIENT };
    await request(app.getHttpServer()).get('/clients/own-client').expect(403);
    await request(app.getHttpServer()).post('/clients/own-client/onboarding/formation').send(formation).expect(403);
    expectNoBusinessCalls();
  });
});
