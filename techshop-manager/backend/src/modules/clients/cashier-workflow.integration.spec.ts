import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { Client, Prisma, PrismaClient, Role, Utilisateur } from '@prisma/client';
import { randomInt, randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import { Pool } from 'pg';
import { initializeMlmLevels } from '../../../prisma/mlm-levels';
import { StaffScopeService } from '../../common/access/staff-scope.service';
import { HttpExceptionFilter } from '../../common/filters/http-exception.filter';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { MlmCalendarService } from '../mlm/mlm-calendar.service';
import { MlmClaimService } from '../mlm/mlm-claim.service';
import { MlmMatrixService } from '../mlm/mlm-matrix.service';
import { MlmPlacementService } from '../mlm/mlm-placement.service';
import { MlmWalletService } from '../mlm/mlm-wallet.service';
import { PortalAuthService } from '../portal/portal-auth.service';
import { PortalAuthController } from '../portal/portal-auth.controller';
import { DashboardController } from '../dashboard/dashboard.controller';
import { DashboardService } from '../dashboard/dashboard.service';
import { RapportsController } from '../rapports/rapports.controller';
import { RapportsService } from '../rapports/rapports.service';
import { VentesController } from '../ventes/ventes.controller';
import { VentesService } from '../ventes/ventes.service';
import { ClientParrainService } from './client-parrain.service';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';

const safeUrl = 'postgresql://postgres@127.0.0.1:55432/cashier_integration';
const configuredUrl = process.env.CASHIER_TEST_DATABASE_URL;
if (configuredUrl && new URL(configuredUrl).href !== safeUrl) {
  throw new Error('Cashier integration tests require the dedicated local database');
}
const integration = configuredUrl ? describe : describe.skip;
const request = require('supertest');

function withoutStartup<Service extends object>(service: Service): Service {
  return Object.fromEntries(
    Object.getOwnPropertyNames(Object.getPrototypeOf(service))
      .filter(name => name !== 'constructor' && name !== 'onModuleInit')
      .map(name => [name, service[name].bind(service)]),
  ) as Service;
}

integration('Cashier workflow on dedicated native PostgreSQL', () => {
  const runId = randomUUID();
  const jwt = new JwtService({ secret: `cashier-local-only-${runId}` });
  const config = new ConfigService({ JWT_SECRET: `cashier-local-only-${runId}` });
  const externalCalls: string[] = [];
  const blockedExternal = new Proxy({}, {
    get: (_target, method) => (..._arguments: unknown[]) => {
      externalCalls.push(String(method));
      throw new Error(`External operation forbidden in native fixture: ${String(method)}`);
    },
  });
  let app: INestApplication;
  let pool: Pool;
  let native: PrismaClient;
  let prisma: PrismaService;
  let clients: ClientsService;
  let matrix: MlmMatrixService;
  let siteId: string;
  let otherSiteId: string;
  let productId: string;
  let agent: Utilisateur;
  let cashier: Utilisateur;
  let manager: Utilisateur;
  let trainer: Utilisateur;
  let otherAgent: Utilisateur;
  let pendingRecruiter: Client;
  let activeRecruiter: Client;
  let waiting: Client;
  let foreign: Client;
  let rollbackPhone: string | undefined;
  let insertedBeforeFailure: string | undefined;
  let injectedFailureCode: string | undefined;
  let racingPhone: string | undefined;
  let raceArrivals = 0;
  let releaseRace: () => void;
  let raceGate: Promise<void>;

  async function phone() {
    for (;;) {
      const candidate = `+243${randomInt(100000000, 1000000000)}`;
      if (!await prisma.client.findUnique({ where: { telephone: candidate } })) return candidate;
    }
  }

  async function fixtureClient(name: string, active = false, recruiterId?: string) {
    const client = await prisma.client.create({ data: {
      id: randomUUID(), prenom: 'Synthetic', nom: `${name}-${runId}`, telephone: await phone(),
      siteInscriptionId: siteId, createdById: agent.id, statut: active ? 'ACTIF' : 'EN_COURS',
      parrainClientId: recruiterId,
    } });
    if (active) await matrix.onClientActivated(client.id, recruiterId);
    return client;
  }

  function token(actor: Utilisateur, claims: { role?: Role; siteId?: string } = {}) {
    return jwt.sign({ sub: actor.id, role: actor.role, siteId: actor.siteId, ...claims });
  }

  function post(path: string, body: object, actor = cashier, bearer = token(actor)) {
    return request(app.getHttpServer()).post(path).set('Authorization', `Bearer ${bearer}`).send(body);
  }

  function get(path: string, actor = cashier, bearer = token(actor)) {
    return request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${bearer}`);
  }

  async function snapshot() {
    const models = [
      'client', 'onboardingEtape', 'parrainClaim', 'vente', 'ligneVente', 'retour', 'ligneRetour',
      'mouvementStock', 'membre', 'matrix', 'position', 'placementHistory', 'commission',
      'portefeuille', 'transactionPortefeuille', 'promotion', 'bonusAttribue', 'kpayTransaction', 'mlmPayout',
    ] as const satisfies ReadonlyArray<keyof PrismaClient>;
    const counts = Object.fromEntries(await Promise.all(models.map(async model => [
      model, await (prisma[model] as { count(): Promise<number> }).count(),
    ])));
    const siteIds = [siteId, otherSiteId];
    return {
      counts,
      clients: await prisma.client.findMany({ where: { siteInscriptionId: { in: siteIds } }, orderBy: { id: 'asc' } }),
      steps: await prisma.onboardingEtape.findMany({ where: { siteId: { in: siteIds } }, orderBy: { id: 'asc' } }),
      stocks: await prisma.stockSite.findMany({ where: { siteId: { in: siteIds } }, orderBy: { id: 'asc' } }),
      sales: await prisma.vente.findMany({ where: { siteId: { in: siteIds } }, orderBy: { id: 'asc' } }),
      claims: await prisma.parrainClaim.findMany({ where: { filleul: { siteInscriptionId: { in: siteIds } } }, orderBy: { id: 'asc' } }),
      movements: await prisma.mouvementStock.findMany({ where: { siteId: { in: siteIds } }, orderBy: { id: 'asc' } }),
      returns: await prisma.retour.findMany({ where: { vente: { siteId: { in: siteIds } } }, orderBy: { id: 'asc' } }),
      members: await prisma.membre.findMany({ where: { client: { siteInscriptionId: { in: siteIds } } }, orderBy: { id: 'asc' } }),
      commissions: await prisma.commission.findMany({ where: { membre: { client: { siteInscriptionId: { in: siteIds } } } }, orderBy: { id: 'asc' } }),
      wallets: await prisma.portefeuille.findMany({ where: { membre: { client: { siteInscriptionId: { in: siteIds } } } }, orderBy: { id: 'asc' } }),
    };
  }

  async function unchanged(action: () => PromiseLike<unknown>) {
    const before = await snapshot();
    await action();
    expect(await snapshot()).toEqual(before);
  }

  function cashBody(kind: string, target = waiting): { path: string; body: Record<string, unknown> } {
    const base = `/clients/${target.id}/onboarding`;
    const recit = { montantRecit: 7, modePaiement: 'CASH' };
    const sale = { clientId: target.id, siteId: target.siteInscriptionId, modePaiement: 'CASH', lignes: [{ produitId: productId, quantite: 1 }] };
    const operations = {
      newRecit: { path: '/clients/onboarding/recit', body: { ...recit, prenom: 'Synthetic', nom: runId, telephone: target.telephone, siteId: target.siteInscriptionId } },
      recit: { path: `${base}/recit`, body: recit },
      fiche: { path: `${base}/fiche`, body: { montantFiche: 11, modePaiement: 'CASH' } },
      activation: { path: `${base}/activate`, body: { produitId: productId, modePaiement: 'CASH' } },
      sale: { path: '/ventes', body: sale },
    };
    return operations[kind];
  }

  function mobileBody(kind: string) {
    const operation = cashBody(kind);
    return {
      path: kind === 'sale' ? '/ventes/kpay/init' : `${operation.path}/kpay/init`,
      body: { ...operation.body, modePaiement: 'MPESA', amount: 30, provider: 'VODACOM_MPESA_COD', phoneNumber: waiting.telephone },
    };
  }

  beforeAll(async () => {
    pool = new Pool({ connectionString: safeUrl, max: 8 });
    const connection = await pool.query('SELECT current_database() AS database, inet_server_port() AS port, current_setting($1) AS version', ['server_version']);
    expect(connection.rows[0]).toMatchObject({ database: 'cashier_integration', port: 55432, version: expect.stringMatching(/^17\./) });
    native = new PrismaClient({ adapter: new PrismaPg(pool) });
    prisma = native.$extends({ query: {
      client: { async create({ args, query }) {
        if (args.data.telephone === racingPhone) {
          raceArrivals += 1;
          if (raceArrivals === 2) releaseRace();
          await raceGate;
        }
        const result = await query(args);
        if (args.data.telephone === rollbackPhone) insertedBeforeFailure = result.id;
        return result;
      } },
      onboardingEtape: { async create({ args, query }) {
        if (insertedBeforeFailure && args.data.clientId === insertedBeforeFailure) {
          try {
            const data = args.data as Prisma.OnboardingEtapeUncheckedCreateInput;
            return await query({ ...args, data: { ...data, agentId: randomUUID() } });
          } catch (error) {
            injectedFailureCode = error.code;
            throw error;
          }
        }
        return query(args);
      } },
    } }) as unknown as PrismaService;
    await prisma.$connect();
    if (await prisma.mlmLevel.count() === 0) await initializeMlmLevels(prisma);
    expect(await prisma.mlmLevel.count()).toBe(8);
    const calendar = new MlmCalendarService(prisma);
    const year = new Date().getUTCFullYear();
    for (const fixtureYear of [year, year + 1]) {
      if (!await prisma.mlmCalendarYear.findUnique({ where: { year: fixtureYear } })) {
        await calendar.saveYear(fixtureYear, { holidays: [], version: 'synthetic-cashier-native', source: 'Dedicated local cashier fixture; not a production calendar' });
      }
    }
    const wallet = new MlmWalletService(prisma, blockedExternal as never, blockedExternal as never, calendar);
    const placement = new MlmPlacementService(prisma);
    matrix = new MlmMatrixService(prisma, wallet, placement);
    const claims = new MlmClaimService(prisma, matrix);
    clients = new ClientsService(prisma, new PortalAuthService(prisma, jwt, config), blockedExternal as never,
      matrix, blockedExternal as never, blockedExternal as never, claims, placement);
    siteId = (await prisma.site.create({ data: { id: randomUUID(), nom: `A${runId} native`, ville: 'Synthetic' } })).id;
    otherSiteId = (await prisma.site.create({ data: { id: randomUUID(), nom: `B${runId} native`, ville: 'Synthetic' } })).id;
    async function staff(role: Role, assignedSite = siteId) {
      return prisma.utilisateur.create({ data: {
        id: randomUUID(), nom: `${role}-${runId}`, telephone: randomUUID(), passwordHash: 'synthetic-not-a-password', role, siteId: assignedSite,
      } });
    }
    agent = await staff('AGENT');
    cashier = await staff('CAISSIER');
    manager = await staff('GERANT');
    trainer = await staff('FORMATEUR');
    otherAgent = await staff('AGENT', otherSiteId);
    productId = (await prisma.produit.create({ data: {
      id: randomUUID(), sku: `cashier-${runId}`, nom: `Synthetic product ${runId}`, categorie: 'Native fixture', prixVente: 30, prixAchat: 12,
      stockSites: { create: [{ siteId, quantite: 20 }, { siteId: otherSiteId, quantite: 20 }] },
    } })).id;
    pendingRecruiter = await fixtureClient('Pending recruiter');
    activeRecruiter = await fixtureClient('Active recruiter', true);
    for (let index = 0; index < 3; index++) await fixtureClient(`Existing referral ${index}`, true, activeRecruiter.id);
    waiting = await fixtureClient('Waiting');
    foreign = await prisma.client.create({ data: {
      id: randomUUID(), prenom: 'Synthetic', nom: `Foreign-${runId}`, telephone: await phone(),
      createdById: otherAgent.id, siteInscriptionId: otherSiteId,
    } });
    const module = await Test.createTestingModule({
      controllers: [ClientsController, VentesController, DashboardController, RapportsController, PortalAuthController],
      providers: [JwtStrategy, RolesGuard, StaffScopeService,
        DashboardService, RapportsService,
        { provide: PortalAuthService, useValue: new PortalAuthService(prisma, jwt, config) },
        { provide: ConfigService, useValue: config },
        { provide: PrismaService, useValue: prisma },
        { provide: ClientsService, useValue: withoutStartup(clients) },
        { provide: ClientParrainService, useValue: new ClientParrainService(prisma, matrix, claims, placement) },
        { provide: VentesService, useValue: withoutStartup(new VentesService(prisma, blockedExternal as never, blockedExternal as never)) },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: true } }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  }, 60000);

  afterAll(async () => {
    try {
      await app?.close();
    } finally {
      await native?.$disconnect();
      await pool?.end();
    }
    expect(externalCalls).toEqual([]);
  });

  it('creates an unpaid RECIT/EN_ATTENTE identity and pending recruiter claim without financial or MLM writes', async () => {
    const before = await snapshot();
    const telephone = await phone();
    const response = await post('/clients/onboarding/draft', {
      prenom: 'Synthetic', nom: `Draft-${runId}`, telephone, siteId, codeParrain: pendingRecruiter.telephone,
    }, agent).expect(201);
    const client = await prisma.client.findUniqueOrThrow({ where: { telephone }, include: { onboardingEtapes: true, filleulClaim: true } });
    expect(response.body.client.id).toBe(client.id);
    expect(client).toMatchObject({ statut: 'EN_COURS', createdById: agent.id, parrainClientId: pendingRecruiter.id, codeParrain: null, dateActivation: null, pinHash: null });
    expect(client.onboardingEtapes).toHaveLength(1);
    expect(client.onboardingEtapes[0]).toMatchObject({ etape: 'RECIT', statut: 'EN_ATTENTE', montant: null, modePaiement: null, referenceTransaction: null, completeeAt: null, agentId: agent.id, siteId });
    expect(client.filleulClaim).toMatchObject({ statut: 'EN_ATTENTE', parrainClientId: pendingRecruiter.id, telephoneParrainSaisi: pendingRecruiter.telephone, confirmedAt: null, confirmedById: null });
    const after = await snapshot();
    expect(after.counts).toEqual({ ...before.counts, client: before.counts.client + 1, onboardingEtape: before.counts.onboardingEtape + 1, parrainClaim: before.counts.parrainClaim + 1 });
    expect(after.stocks).toEqual(before.stocks);
    const queue = await get('/clients/onboarding-queue').expect(200);
    expect(queue.body.queue).toEqual(expect.arrayContaining([expect.objectContaining({ id: client.id, etapeActuelle: 'RECIT', prochainRoute: `/clients/${client.id}/recit` })]));
  });

  it.each(['newRecit', 'recit', 'fiche', 'activation', 'sale'])('rejects every agent cash and mobile %s operation with native state unchanged', async kind => {
    for (const operation of [cashBody(kind), mobileBody(kind)]) {
      await unchanged(() => post(operation.path, { ...operation.body, actorId: manager.id, agentId: manager.id, role: 'SUPER_ADMIN', trusted: true, finalize: true }, agent).expect(403));
    }
  });

  it.each(['newRecit', 'recit', 'fiche', 'activation', 'sale'])('rejects a cashier targeting foreign-site %s without writes', async kind => {
    const operation = cashBody(kind, foreign);
    await unchanged(() => post(operation.path, operation.body).expect(403));
  });

  it('rejects forged site queries, foreign client linkage and foreign formation/detail access', async () => {
    for (const actor of [agent, cashier]) {
      for (const path of [`/clients/${foreign.id}`, `/clients?siteId=${otherSiteId}`, `/clients/onboarding-queue?siteId=${otherSiteId}`, `/ventes?siteId=${otherSiteId}`]) {
        await unchanged(() => get(path, actor).expect(403));
      }
    }
    await unchanged(() => post(`/clients/${foreign.id}/onboarding/formation`, { formateurId: trainer.id, dateFormation: new Date().toISOString() }).expect(403));
    const sale = cashBody('sale', foreign);
    await unchanged(() => post(sale.path, { ...sale.body, siteId }).expect(403));
    await unchanged(() => post('/clients/onboarding/draft', { prenom: 'Synthetic', nom: runId, telephone: foreign.telephone, siteId: otherSiteId }, agent).expect(403));
  });

  it.each(['newRecit', 'recit', 'fiche', 'activation', 'sale'])('keeps authorized cashier mobile %s disabled before payments or writes', async kind => {
    const operation = mobileBody(kind);
    await unchanged(async () => {
      const response = await post(operation.path, operation.body).expect(503);
      expect(response.body.code).toBe('MOBILE_MONEY_UNAVAILABLE');
    });
    const cash = cashBody(kind);
    await unchanged(() => post(cash.path, { ...cash.body, modePaiement: 'MPESA' }).expect(503));
  });

  it('rejects financial/actor trust fields on typed DTOs for an authorized cashier', async () => {
    const forged = { agentId: manager.id, actorId: manager.id, createdById: manager.id, role: 'SUPER_ADMIN', trusted: true, finalize: true, montantNet: 0.01, pointsAttribues: 9999 };
    for (const kind of ['fiche', 'activation', 'sale']) {
      const operation = cashBody(kind);
      await unchanged(() => post(operation.path, { ...operation.body, ...forged }).expect(400));
    }
    await unchanged(async () => post('/clients/onboarding/draft', {
      prenom: 'Synthetic', nom: runId, telephone: await phone(), siteId, ...forged,
    }, agent).expect(400));
  });

  it('overwrites forged actors and ignores trust fields on the untyped new-recit path', async () => {
    const telephone = await phone();
    const before = await snapshot();
    await post('/clients/onboarding/recit', {
      prenom: 'Synthetic', nom: `Forged-${runId}`, telephone, siteId, montantRecit: 7, modePaiement: 'CASH',
      agentId: manager.id, actorId: manager.id, createdById: manager.id, role: 'SUPER_ADMIN', trusted: true,
      finalize: true, statut: 'ACTIF', montant: 9999, montantNet: 0.01, pointsAttribues: 9999,
    }).expect(201);
    const client = await prisma.client.findUniqueOrThrow({ where: { telephone }, include: { onboardingEtapes: true } });
    expect(client).toMatchObject({ createdById: cashier.id, statut: 'EN_COURS', parrainClientId: null });
    expect(client.onboardingEtapes).toHaveLength(1);
    expect(client.onboardingEtapes[0]).toMatchObject({ agentId: cashier.id, etape: 'RECIT', statut: 'COMPLETE', modePaiement: 'CASH', siteId });
    expect(client.onboardingEtapes[0].montant.toFixed(2)).toBe('7.00');
    expect((await snapshot()).counts).toEqual({ ...before.counts, client: before.counts.client + 1, onboardingEtape: before.counts.onboardingEtape + 1 });
  });

  it('resumes the same draft through recital, formation, fiche and activation with server actors, invoice, stock and unchanged MLM rules', async () => {
    const levels = await prisma.mlmLevel.findMany({ orderBy: { ordre: 'asc' } });
    const recruiter = await prisma.membre.findUniqueOrThrow({ where: { clientId: activeRecruiter.id } });
    const telephone = await phone();
    const draft = await post('/clients/onboarding/draft', { prenom: 'Synthetic', nom: `Workflow-${runId}`, telephone, siteId, codeParrain: activeRecruiter.telephone }, agent).expect(201);
    const clientId = draft.body.client.id;
    const base = `/clients/${clientId}/onboarding`;
    const recitBody = {
      montantRecit: 7, modePaiement: 'CASH', numeroRecu: `recit-${runId}`, agentId: manager.id,
      actorId: manager.id, createdById: manager.id, parrainClientId: pendingRecruiter.id,
      trusted: true, finalize: true, statut: 'ACTIF', montant: 9999, pointsAttribues: 9999,
    };
    const beforeRecit = await snapshot();
    await post(`${base}/recit`, recitBody).expect(201);
    expect((await snapshot()).counts).toEqual(beforeRecit.counts);
    const recit = await prisma.onboardingEtape.findUniqueOrThrow({ where: { clientId_etape: { clientId, etape: 'RECIT' } } });
    expect(recit).toMatchObject({ id: draft.body.etapeId, statut: 'COMPLETE', agentId: cashier.id, siteId, referenceTransaction: `recit-${runId}` });
    expect(recit.montant.toFixed(2)).toBe('7.00');
    await unchanged(() => post(`${base}/recit`, recitBody).expect(409));
    await unchanged(() => post('/clients/onboarding/recit', { ...recitBody, prenom: 'Synthetic', nom: runId, telephone, siteId }).expect(409));
    const formationBody = { formateurId: trainer.id, dateFormation: '2026-09-20T09:00:00.000Z', dureeMinutes: 30 };
    await post(`${base}/formation`, formationBody).expect(201);
    await unchanged(() => post(`${base}/formation`, formationBody).expect(409));
    const ficheBody = { montantFiche: 11, modePaiement: 'CASH', numeroTransaction: `fiche-${runId}` };
    await post(`${base}/fiche`, ficheBody).expect(201);
    await unchanged(() => post(`${base}/fiche`, ficheBody).expect(409));
    const beforeActivation = await snapshot();
    const stockBefore = await prisma.stockSite.findUniqueOrThrow({ where: { produitId_siteId: { produitId: productId, siteId } } });
    const activationBody = { produitId: productId, modePaiement: 'CASH', referenceTransaction: `activation-${runId}` };
    await post(`${base}/activate`, activationBody).expect(201);
    const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId }, include: { onboardingEtapes: true, membre: { include: { portefeuille: true, matrixPosition: { include: { matrix: true } } } }, ventes: { include: { lignes: true } } } });
    expect(client).toMatchObject({ createdById: agent.id, parrainClientId: activeRecruiter.id, statut: 'ACTIF', pinHash: expect.any(String), dateActivation: expect.any(Date), codeParrain: expect.any(String) });
    expect(client.onboardingEtapes).toHaveLength(4);
    for (const etape of ['RECIT', 'FICHE', 'ACTIVATION']) {
      expect(client.onboardingEtapes.find(step => step.etape === etape)).toMatchObject({ agentId: cashier.id, statut: 'COMPLETE', modePaiement: 'CASH', siteId });
    }
    expect(client.onboardingEtapes.find(step => step.etape === 'FORMATION')).toMatchObject({ agentId: trainer.id, montant: null, modePaiement: null });
    expect(client.onboardingEtapes.find(step => step.etape === 'FICHE').montant.toFixed(2)).toBe('11.00');
    expect(client.onboardingEtapes.find(step => step.etape === 'ACTIVATION').montant.toFixed(2)).toBe('30.00');
    expect(client.ventes).toHaveLength(1);
    const invoice = client.ventes[0];
    expect(invoice).toMatchObject({ agentId: cashier.id, siteId, statut: 'VALIDE', pointsAttribues: 40, modePaiement: 'CASH', referenceTransaction: `activation-${runId}` });
    expect(invoice.numeroVente).toMatch(/^[A-Z0-9]{3}-\d{6}-\d{4,}$/);
    expect(invoice.montantNet.toFixed(2)).toBe('30.00');
    expect(invoice.lignes).toHaveLength(1);
    expect(invoice.lignes[0]).toMatchObject({ produitId: productId, quantite: 1 });
    const receipt = await get(`/ventes/${invoice.id}/receipt`).expect(200);
    expect(JSON.stringify(receipt.body)).toContain(invoice.numeroVente);
    expect((await prisma.stockSite.findUniqueOrThrow({ where: { id: stockBefore.id } })).quantite).toBe(stockBefore.quantite - 1);
    expect(await prisma.mouvementStock.findFirstOrThrow({ where: { reference: invoice.numeroVente } })).toMatchObject({ agentId: cashier.id, siteId, produitId: productId, type: 'SORTIE_VENTE', quantite: 1, quantiteAvant: stockBefore.quantite, quantiteApres: stockBefore.quantite - 1 });
    expect(client.membre).toMatchObject({ parrainId: recruiter.id, statut: 'ACTIF' });
    expect(client.membre.matrixPosition).toMatchObject({ estValide: true, numeroPosition: 4, matrix: { membreId: recruiter.id } });
    expect(client.membre.portefeuille.totalGagne.toFixed(2)).toBe('0.00');
    const commissions = await prisma.commission.findMany({ where: { membreId: recruiter.id } });
    expect(commissions).toHaveLength(1);
    expect(commissions[0]).toMatchObject({ filleulId: client.membre.id, statut: 'EN_ATTENTE' });
    expect(commissions[0].montant.toFixed(2)).toBe('40.00');
    expect(commissions[0].montantSysteme.toFixed(2)).toBe('24.00');
    expect(commissions[0].montantRetour.toFixed(2)).toBe('16.00');
    const afterActivation = await snapshot();
    expect(afterActivation.counts).toMatchObject({ client: beforeActivation.counts.client, membre: beforeActivation.counts.membre + 1, vente: beforeActivation.counts.vente + 1, commission: beforeActivation.counts.commission + 1, kpayTransaction: beforeActivation.counts.kpayTransaction, transactionPortefeuille: beforeActivation.counts.transactionPortefeuille });
    expect(await prisma.mlmLevel.findMany({ orderBy: { ordre: 'asc' } })).toEqual(levels);
    await unchanged(() => post(`${base}/activate`, activationBody).expect(409));
    expect(await prisma.client.count({ where: { telephone } })).toBe(1);
  }, 30000);

  it('preserves the FORMATEUR detail and formation exception without allowing financial operations', async () => {
    const client = await fixtureClient('Trainer exception');
    await post(`/clients/${client.id}/onboarding/recit`, { montantRecit: 7, modePaiement: 'CASH' }).expect(201);
    await get(`/clients/${client.id}`, trainer).expect(200);
    await post(`/clients/${client.id}/onboarding/formation`, { formateurId: trainer.id, dateFormation: '2026-09-20T10:00:00.000Z' }, trainer).expect(201);
    expect(await prisma.onboardingEtape.findUniqueOrThrow({ where: { clientId_etape: { clientId: client.id, etape: 'FORMATION' } } })).toMatchObject({ agentId: trainer.id, statut: 'COMPLETE', montant: null });
    await unchanged(() => post(`/clients/${client.id}/onboarding/fiche`, { montantFiche: 11, modePaiement: 'CASH' }, trainer).expect(403));
  });

  it('prices cashier sales on the server, restricts returns to managers, and records the manager stock/credit note', async () => {
    const before = await snapshot();
    const stock = await prisma.stockSite.findUniqueOrThrow({ where: { produitId_siteId: { produitId: productId, siteId } } });
    const sale = await post('/ventes', { siteId, clientId: waiting.id, modePaiement: 'CASH', montantRecu: 70, lignes: [{ produitId: productId, quantite: 2, prixUnitaire: 0.01 }] }).expect(201);
    const saleId = sale.body.vente.id;
    expect(sale.body.vente).toMatchObject({ montantBrut: 60, montantNet: 60, montantRecu: 70, monnaieRendue: 10, pointsAttribues: 0 });
    const persisted = await prisma.vente.findUniqueOrThrow({ where: { id: saleId }, include: { lignes: true } });
    expect(persisted).toMatchObject({ agentId: cashier.id, siteId, clientId: waiting.id, statut: 'VALIDE' });
    expect(persisted.lignes[0].prixUnitaire.toFixed(2)).toBe('30.00');
    for (const path of [`/ventes/${saleId}`, `/ventes/${saleId}/receipt`]) {
      await unchanged(() => get(path, otherAgent).expect(403));
    }
    expect((await prisma.stockSite.findUniqueOrThrow({ where: { id: stock.id } })).quantite).toBe(stock.quantite - 2);
    expect(await prisma.mouvementStock.findFirstOrThrow({ where: { reference: persisted.numeroVente } })).toMatchObject({ agentId: cashier.id, quantite: 2, quantiteAvant: stock.quantite, quantiteApres: stock.quantite - 2 });
    const returnBody = { lignes: [{ produitId: productId, quantite: 2 }], motif: 'Synthetic native return', modeRemboursement: 'CASH' };
    for (const actor of [agent, cashier]) {
      for (const suffix of ['retour', 'retour/kpay-refund']) {
        await unchanged(() => post(`/ventes/${saleId}/${suffix}`, returnBody, actor).expect(403));
      }
    }
    await unchanged(() => post(`/ventes/${saleId}/retour/kpay-refund`, returnBody, manager).expect(503));
    await unchanged(() => post(`/ventes/${saleId}/retour`, { ...returnBody, modeRemboursement: 'MPESA' }, manager).expect(503));
    const returned = await post(`/ventes/${saleId}/retour`, returnBody, manager).expect(201);
    expect(returned.body.retour).toMatchObject({ montantRembourse: 60, stockRemis: true, modeRemboursement: 'CASH' });
    expect(await prisma.retour.findUniqueOrThrow({ where: { id: returned.body.retour.id } })).toMatchObject({ agentId: manager.id, venteId: saleId, statut: 'COMPLETE' });
    expect((await prisma.vente.findUniqueOrThrow({ where: { id: saleId } })).statut).toBe('RETOURNEE');
    expect((await prisma.stockSite.findUniqueOrThrow({ where: { id: stock.id } })).quantite).toBe(stock.quantite);
    expect(await prisma.mouvementStock.findFirstOrThrow({ where: { reference: returned.body.retour.numeroAvoir } })).toMatchObject({ agentId: manager.id, type: 'AJUSTEMENT_INVENTAIRE', quantite: 2, quantiteAvant: stock.quantite - 2, quantiteApres: stock.quantite });
    const credit = await get(`/ventes/retours/${returned.body.retour.id}/avoir`, manager).expect(200);
    expect(JSON.stringify(credit.body)).toContain(returned.body.retour.numeroAvoir);
    await unchanged(() => post(`/ventes/${saleId}/retour`, returnBody, manager).expect(400));
    const after = await snapshot();
    expect(after.counts).toEqual({ ...before.counts, vente: before.counts.vente + 1, ligneVente: before.counts.ligneVente + 1, retour: before.counts.retour + 1, ligneRetour: before.counts.ligneRetour + 1, mouvementStock: before.counts.mouvementStock + 2 });
  });

  it('serializes competing draft inserts into one identity, RECIT step and pending claim', async () => {
    racingPhone = await phone();
    raceGate = new Promise(resolve => { releaseRace = resolve; });
    const before = await snapshot();
    const body = { prenom: 'Synthetic', nom: `Concurrent-${runId}`, telephone: racingPhone, siteId, codeParrain: pendingRecruiter.telephone };
    const timer = setTimeout(() => releaseRace(), 4000);
    try {
      const responses = await Promise.all([post('/clients/onboarding/draft', body, agent), post('/clients/onboarding/draft', body, agent)]);
      expect(raceArrivals).toBe(2);
      expect(responses.map(response => response.status).sort()).toEqual([201, 409]);
      const success = responses.find(response => response.status === 201);
      const conflict = responses.find(response => response.status === 409);
      expect(conflict.body).toMatchObject({ code: 'ERR_DUPLICATE_CLIENT', clientId: success.body.client.id });
      const client = await prisma.client.findUniqueOrThrow({ where: { telephone: racingPhone }, include: { onboardingEtapes: true, filleulClaim: true } });
      expect(client.onboardingEtapes).toHaveLength(1);
      expect(client.filleulClaim).toMatchObject({ parrainClientId: pendingRecruiter.id, statut: 'EN_ATTENTE' });
      expect(await prisma.client.count({ where: { telephone: racingPhone } })).toBe(1);
      const after = await snapshot();
      expect(after.counts).toEqual({ ...before.counts, client: before.counts.client + 1, onboardingEtape: before.counts.onboardingEtape + 1, parrainClaim: before.counts.parrainClaim + 1 });
      expect(after.stocks).toEqual(before.stocks);
    } finally {
      clearTimeout(timer);
      releaseRace();
      racingPhone = undefined;
    }
  }, 15000);

  it('rolls back the real inserted client when the native step write fails a foreign key', async () => {
    rollbackPhone = await phone();
    try {
      await unchanged(() => post('/clients/onboarding/draft', { prenom: 'Synthetic', nom: `Rollback-${runId}`, telephone: rollbackPhone, siteId, codeParrain: pendingRecruiter.telephone }, agent).expect(500));
      expect(insertedBeforeFailure).toEqual(expect.any(String));
      expect(injectedFailureCode).toBe('P2003');
      expect(await prisma.client.findUnique({ where: { id: insertedBeforeFailure } })).toBeNull();
      expect(await prisma.client.findUnique({ where: { telephone: rollbackPhone } })).toBeNull();
      expect(await prisma.onboardingEtape.count({ where: { clientId: insertedBeforeFailure } })).toBe(0);
      expect(await prisma.parrainClaim.count({ where: { filleulClientId: insertedBeforeFailure } })).toBe(0);
    } finally {
      rollbackPhone = undefined;
      insertedBeforeFailure = undefined;
    }
  });

  it('reloads stale JWT role, site and active status from native users on every request', async () => {
    const mutable = await prisma.utilisateur.create({ data: { id: randomUUID(), nom: `Stale-${runId}`, telephone: randomUUID(), passwordHash: 'synthetic-only', role: 'CAISSIER', siteId } });
    const bearer = token(mutable);
    const staleBody = cashBody('sale');
    await get(`/clients/${waiting.id}`, mutable, bearer).expect(200);
    await prisma.utilisateur.update({ where: { id: mutable.id }, data: { role: 'AGENT' } });
    await unchanged(() => post(staleBody.path, staleBody.body, mutable, bearer).expect(403));
    await prisma.utilisateur.update({ where: { id: mutable.id }, data: { role: 'CAISSIER', siteId: otherSiteId } });
    await unchanged(() => post(staleBody.path, staleBody.body, mutable, bearer).expect(403));
    await unchanged(() => get(`/clients/${waiting.id}`, mutable, bearer).expect(403));
    await get(`/clients/${foreign.id}`, mutable, bearer).expect(200);
    await prisma.utilisateur.update({ where: { id: mutable.id }, data: { siteId: null } });
    await unchanged(async () => {
      const response = await post(staleBody.path, staleBody.body, mutable, bearer).expect(403);
      expect(response.body.code).toBe('ERR_SITE_REQUIRED');
    });
    await prisma.utilisateur.update({ where: { id: mutable.id }, data: { siteId, actif: false } });
    await unchanged(() => post(staleBody.path, staleBody.body, mutable, bearer).expect(401));
    await unchanged(() => get(`/clients/${waiting.id}`, mutable, bearer).expect(401));
    expect((await prisma.utilisateur.findUniqueOrThrow({ where: { id: agent.id } })).role).toBe('AGENT');
  });

  describe('final authorization boundaries', () => {
    let readSite: string;
    let foreignReadSite: string;
    let readClient: Client;
    let readForeignClient: Client;
    let readAgent: Utilisateur;
    let readCashier: Utilisateur;
    let readManager: Utilisateur;
    let unassigned: Utilisateur;
    let ownSale: string;
    let anonymousSale: string;
    let inconsistentSale: string;

    async function historicalSale(saleSite: string, clientId: string | null, amount: number) {
      return prisma.vente.create({ data: {
        numeroVente: `synthetic-${randomUUID()}`, siteId: saleSite, clientId, agentId: cashier.id,
        montantBrut: amount, montantNet: amount, modePaiement: 'CASH',
      } });
    }

    beforeAll(async () => {
      readSite = (await prisma.site.create({ data: { nom: `Read A ${runId}`, ville: 'Synthetic' } })).id;
      foreignReadSite = (await prisma.site.create({ data: { nom: `Read B ${runId}`, ville: 'Synthetic' } })).id;
      async function readStaff(role: Role, assignedSite: string | null = readSite) {
        return prisma.utilisateur.create({ data: {
          nom: `Read ${role} ${runId}`, telephone: randomUUID(), passwordHash: 'synthetic-only', role, siteId: assignedSite,
        } });
      }
      readAgent = await readStaff('AGENT');
      readCashier = await readStaff('CAISSIER');
      readManager = await readStaff('GERANT');
      unassigned = await readStaff('CAISSIER', null);
      readClient = await prisma.client.create({ data: {
        prenom: 'Synthetic', nom: `Read A ${runId}`, telephone: await phone(), siteInscriptionId: readSite, createdById: readAgent.id,
      } });
      readForeignClient = await prisma.client.create({ data: {
        prenom: 'Synthetic', nom: `Read B ${runId}`, telephone: await phone(), siteInscriptionId: foreignReadSite, createdById: readAgent.id,
      } });
      ownSale = (await historicalSale(readSite, readClient.id, 11)).id;
      anonymousSale = (await historicalSale(readSite, null, 7)).id;
      inconsistentSale = (await historicalSale(readSite, readForeignClient.id, 1000)).id;
      await historicalSale(foreignReadSite, readForeignClient.id, 2000);
    });

    const routes = ['/dashboard/stats', '/dashboard/recent-transactions', '/dashboard/sales-chart', '/rapports/ventes'];

    it.each(routes)('rejects forged and missing actor sites on direct GET %s', async route => {
      for (const actor of [readAgent, readCashier]) {
        await get(`${route}?siteId=${foreignReadSite}`, actor).expect(403);
      }
      await get(route, unassigned).expect(403);
      await get(`${route}?siteId=${readSite}`, unassigned).expect(403);
    });

    it.each(['AGENT', 'CAISSIER'])('scopes omitted-site rows before limits and all aggregates for %s', async role => {
      const actor = role === 'AGENT' ? readAgent : readCashier;
      const recent = await get('/dashboard/recent-transactions?limit=2', actor).expect(200);
      expect(recent.body.transactions.map(transaction => transaction.id).sort()).toEqual([ownSale, anonymousSale].sort());
      const stats = await get('/dashboard/stats', actor).expect(200);
      expect(stats.body.ventesJour).toBe(18);
      const chart = await get('/dashboard/sales-chart', actor).expect(200);
      expect(chart.body.datasets).toHaveLength(1);
      expect(chart.body.datasets[0].siteId).toBe(readSite);
      expect(chart.body.datasets[0].data.reduce((sum, amount) => sum + amount, 0)).toBe(18);
      const report = await get('/rapports/ventes', actor).expect(200);
      expect(report.body.summary.totalVentes).toBe(2);
      expect(Number(report.body.summary.montantNet)).toBe(18);
      expect(JSON.stringify(report.body)).not.toContain('1000');
      expect(JSON.stringify(report.body)).not.toContain('2000');
    });

    it('preserves manager historical visibility and explicit cross-site report/chart/recent reads', async () => {
      expect((await get('/dashboard/stats', readManager).expect(200)).body.ventesJour).toBe(1018);
      const recent = await get(`/dashboard/recent-transactions?siteId=${readSite}`, readManager).expect(200);
      expect(recent.body.transactions.map(transaction => transaction.id)).toContain(inconsistentSale);
      const chart = await get(`/dashboard/sales-chart?siteId=${foreignReadSite}`, readManager).expect(200);
      expect(chart.body.datasets[0].data.reduce((sum, amount) => sum + amount, 0)).toBe(2000);
      const report = await get(`/rapports/ventes?siteId=${foreignReadSite}`, readManager).expect(200);
      expect(Number(report.body.summary.montantNet)).toBe(2000);
    });

    it.each(['AGENT', 'CAISSIER', 'missing site'])('leaves native PIN and lockout fields unchanged for forbidden %s support', async role => {
      const actor = role === 'AGENT' ? readAgent : role === 'CAISSIER' ? readCashier : unassigned;
      const target = role === 'missing site' ? readClient : readForeignClient;
      const pinHash = await bcrypt.hash('1234', 10);
      const before = await prisma.client.update({ where: { id: target.id }, data: {
        pinHash, tentativesPin: 4, bloqueJusquA: new Date(Date.now() + 900000),
      } });
      const response = await post(`/portal/auth/clients/${target.id}/set-pin`, { pin: '5678', confirmPin: '5678' }, actor);
      const after = await prisma.client.findUniqueOrThrow({ where: { id: target.id } });
      expect({ pinHash: after.pinHash, tentativesPin: after.tentativesPin, bloqueJusquA: after.bloqueJusquA })
        .toEqual({ pinHash: before.pinHash, tentativesPin: before.tentativesPin, bloqueJusquA: before.bloqueJusquA });
      expect(response.status).toBe(403);
      expect(await bcrypt.compare('1234', after.pinHash!)).toBe(true);
    });

    it.each(['AGENT', 'CAISSIER', 'GERANT'])('allows legitimate native PIN reset for %s', async role => {
      const actor = role === 'AGENT' ? readAgent : role === 'CAISSIER' ? readCashier : readManager;
      const target = role === 'GERANT' ? readForeignClient : readClient;
      await post(`/portal/auth/clients/${target.id}/set-pin`, { pin: '5678', confirmPin: '5678' }, actor).expect(201);
      const updated = await prisma.client.findUniqueOrThrow({ where: { id: target.id } });
      expect(await bcrypt.compare('5678', updated.pinHash!)).toBe(true);
      expect(updated.tentativesPin).toBe(0);
      expect(updated.bloqueJusquA).toBeNull();
    });

    it.each(['resume', 'phone resume', 'activation'])('scopes the real cashier %s response while preserving manager and trusted reads', async operation => {
      for (const actor of [cashier, manager]) {
        const client = await fixtureClient(`Post-write ${operation} ${actor.role}`);
        const historical = await historicalSale(otherSiteId, client.id, 999);
        const local = await historicalSale(siteId, client.id, 3);
        let response;
        if (operation === 'activation') {
          await prisma.onboardingEtape.create({ data: {
            clientId: client.id, siteId, agentId: cashier.id, etape: 'FICHE', statut: 'COMPLETE',
          } });
          response = await post(`/clients/${client.id}/onboarding/activate`, { produitId: productId, modePaiement: 'CASH' }, actor).expect(201);
        } else if (operation === 'phone resume') {
          response = await post('/clients/onboarding/recit', {
            prenom: client.prenom, nom: client.nom, telephone: client.telephone, siteId, montantRecit: 7, modePaiement: 'CASH',
          }, actor).expect(201);
        } else {
          response = await post(`/clients/${client.id}/onboarding/recit`, { montantRecit: 7, modePaiement: 'CASH' }, actor).expect(201);
        }
        const result = operation === 'activation' ? response.body : response.body.client;
        expect(result.ventes.map(sale => sale.id)).toContain(local.id);
        expect(result.ventes.some(sale => sale.id === historical.id)).toBe(actor.role === 'GERANT');
        expect((await clients.findOne(client.id)).ventes.map(sale => sale.id)).toContain(historical.id);
      }
    }, 30000);
  });
});
