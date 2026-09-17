import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { randomUUID } from 'crypto';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Client, Pool } from 'pg';
import { PrismaService } from '../../prisma/prisma.service';
import { MlmMatrixService } from './mlm-matrix.service';
import { MlmPlacementService } from './mlm-placement.service';
import { MlmWalletService } from './mlm-wallet.service';
import { MlmCalendarService } from './mlm-calendar.service';
import { ReinvestReleaseService } from './reinvest-release.service';
import { MlmService } from './mlm.service';
import { MlmClaimService } from './mlm-claim.service';
import { MlmController } from './mlm.controller';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { initializeMlmLevels } from '../../../prisma/mlm-levels';
import { auditMlm } from '../../../scripts/mlm-audit';

const integration = process.env.MLM_TEST_DATABASE_URL ? describe : describe.skip;
const request = require('supertest');

integration('MLM PostgreSQL integration', () => {
  let prisma: PrismaService;
  let pool: Pool;
  let matrix: MlmMatrixService;
  let placement: MlmPlacementService;
  let wallet: MlmWalletService;
  let cron: ReinvestReleaseService;
  let app: any;
  let adminId: string;
  let siteId: string;
  const payment = { initiatePayout: jest.fn<any>(), createPayment: jest.fn<any>() };

  beforeAll(async () => {
    const url = new URL(process.env.MLM_TEST_DATABASE_URL);
    if (url.href !== 'postgresql://postgres@127.0.0.1:55432/mlm_integration') throw new Error('Integration tests require exactly postgresql://postgres@127.0.0.1:55432/mlm_integration');
    pool = new Pool({ connectionString: url.href });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) }) as PrismaService;
    await prisma.$connect();
    await initializeMlmLevels(prisma);
    const calendar = new MlmCalendarService(prisma);
    const currentYear = new Date().getUTCFullYear();
    for (const year of [currentYear, currentYear + 1]) await calendar.saveYear(year, { holidays: [], version: 'synthetic-test', source: 'Synthetic integration fixture, not a production calendar' });
    wallet = new MlmWalletService(prisma, payment as never, { registerFinalizer: jest.fn() } as never, calendar);
    placement = new MlmPlacementService(prisma);
    matrix = new MlmMatrixService(prisma, wallet, placement);
    cron = new ReinvestReleaseService(prisma);
    const user = await prisma.utilisateur.create({ data: { nom: 'MLM integration admin', telephone: randomUUID(), passwordHash: 'test-only', role: 'SUPER_ADMIN' } });
    adminId = user.id;
    siteId = (await prisma.site.create({ data: { nom: 'MLM test', ville: 'Test' } })).id;
    const module = await Test.createTestingModule({
      controllers: [MlmController],
      providers: [
        { provide: MlmService, useValue: new MlmService(prisma, wallet) },
        { provide: MlmMatrixService, useValue: matrix },
        { provide: MlmWalletService, useValue: wallet },
        { provide: MlmPlacementService, useValue: placement },
        { provide: MlmCalendarService, useValue: calendar },
        { provide: MlmClaimService, useValue: {} }, RolesGuard,
      ],
    }).overrideGuard(JwtAuthGuard).useValue({ canActivate(context: any) {
      const req = context.switchToHttp().getRequest();
      req.user = { id: adminId, role: req.headers['x-test-role'] ?? 'SUPER_ADMIN' };
      return true;
    } }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  }, 60000);

  afterAll(async () => {
    if (app) await app.close();
    if (prisma) await prisma.$disconnect();
    if (pool) await pool.end();
  });

  async function activate(name: string, recruiterId?: string) {
    const client = await prisma.client.create({ data: { nom: name, prenom: 'Test', telephone: randomUUID(), statut: 'ACTIF', siteInscriptionId: siteId, createdById: adminId } });
    await matrix.onClientActivated(client.id, recruiterId);
    return prisma.membre.findUniqueOrThrow({ where: { clientId: client.id } });
  }

  async function progress(memberId: string) {
    return new MlmService(prisma, wallet).getMemberProgress(memberId);
  }

  it('validates exact generations, not four recruitments per rank', async () => {
    const root = await activate('P0');
    const children = [];
    for (let index = 0; index < 4; index++) children.push(await activate(`P${index + 1}`, root.id));
    expect((await progress(root.id)).progression.currentLevel.ordre).toBe(1);
    expect(await prisma.commission.count({ where: { membreId: root.id, statut: 'EN_ATTENTE' } })).toBe(1);
    expect((await prisma.portefeuille.findUnique({ where: { membreId: root.id } })).totalGagne.toFixed(2)).toBe('0.00');
    for (let index = 0; index < 4; index++) await activate(`A${index}`, children[0].id);
    expect((await progress(root.id)).progression).toMatchObject({ currentGeneration: 2, completedPositions: 4, remainingPositions: 12 });
    for (const child of children.slice(1)) for (let index = 0; index < 4; index++) await activate(`B${index}`, child.id);
    const result = await progress(root.id);
    expect(result.progression.currentLevel.ordre).toBe(2);
    expect(result.totalDescendants).toBe(20);
    expect(await prisma.commission.count({ where: { membreId: root.id } })).toBe(2);
    const tree = await matrix.getNetworkTree(root.id, 2);
    expect(tree.children).toHaveLength(4);
    expect(tree.children.every(child => child.children.length === 4)).toBe(true);
  }, 60000);

  it('lets a descendant acquire Builder before its parent', async () => {
    const root = await activate('Slow');
    const child = await activate('Fast', root.id);
    for (let index = 0; index < 4; index++) await activate(`Fast${index}`, child.id);
    expect((await progress(root.id)).progression.currentLevel).toBeNull();
    expect((await progress(child.id)).progression.currentLevel.ordre).toBe(1);
  }, 30000);

  it('serializes concurrent spillover with separate recruiter and matrix parent', async () => {
    const root = await activate('Concurrent');
    const children = [];
    for (let index = 0; index < 4; index++) children.push(await activate(`Direct${index}`, root.id));
    const extra = await activate('Spillover', root.id);
    const incoming = await prisma.position.findUnique({ where: { filleulId: extra.id }, include: { matrix: true } });
    expect(extra.parrainId).toBe(root.id);
    expect(incoming.matrix.membreId).toBe(children[0].id);
    expect(incoming.numeroPosition).toBe(1);
    await Promise.all(Array.from({ length: 8 }, (_, index) => activate(`Concurrent${index}`, root.id)));
    const overloads = await prisma.$queryRaw<Array<{ count: number }>>`SELECT count(*) FROM positions WHERE "filleulId" IS NOT NULL GROUP BY "matrixId" HAVING count(*) > 4`;
    expect(overloads).toEqual([]);
    expect((await progress(root.id)).totalDescendants).toBe(13);
    const page = await matrix.getNetworkGeneration(root.id, 2, 1, 3);
    expect(page.items).toHaveLength(3);
    expect(page.meta.total).toBe(9);
  }, 60000);

  it('preserves subtrees/history, rejects cycles, and never repays a reacquired generation', async () => {
    const root = await activate('MoveRoot');
    const target = await activate('MoveTarget');
    const children = [];
    for (let index = 0; index < 4; index++) children.push(await activate(`Moved${index}`, root.id));
    const descendant = await activate('PreservedSubtree', children[0].id);
    const original = await prisma.position.findUnique({ where: { filleulId: children[0].id } });
    const input = { memberId: children[0].id, newParentId: target.id, newPosition: 1, expectedPositionId: original.id, operationId: randomUUID(), reason: 'Reequilibrage demande' };
    await placement.move(input, adminId);
    await placement.move(input, adminId);
    const moved = await prisma.position.findUnique({ where: { filleulId: children[0].id }, include: { matrix: true } });
    expect(moved.matrix.membreId).toBe(target.id);
    expect((await prisma.membre.findUnique({ where: { id: children[0].id } })).parrainId).toBe(root.id);
    expect((await prisma.position.findUnique({ where: { filleulId: descendant.id }, include: { matrix: true } })).matrix.membreId).toBe(children[0].id);
    expect(await prisma.placementHistory.count({ where: { operationId: input.operationId } })).toBe(1);
    expect((await progress(root.id)).progression.currentLevel).toBeNull();
    await expect(placement.move({ ...input, newParentId: descendant.id, expectedPositionId: moved.id, operationId: randomUUID() }, adminId)).rejects.toThrow();
    await placement.move({ ...input, newParentId: root.id, newPosition: original.numeroPosition, expectedPositionId: moved.id, operationId: randomUUID() }, adminId);
    expect((await progress(root.id)).progression.currentLevel.ordre).toBe(1);
    expect(await prisma.commission.count({ where: { membreId: root.id } })).toBe(1);
    const otherPosition = await prisma.position.findUnique({ where: { filleulId: children[1].id } });
    const swap = { memberId: children[0].id, otherMemberId: children[1].id, expectedPositionId: original.id, otherExpectedPositionId: otherPosition.id, operationId: randomUUID(), reason: 'Echange administratif' };
    await placement.swap(swap, adminId);
    await placement.swap(swap, adminId);
    expect(await prisma.placementHistory.count({ where: { operationId: swap.operationId } })).toBe(2);
    const history = await prisma.placementHistory.findFirst({ where: { operationId: swap.operationId } });
    await expect(prisma.placementHistory.update({ where: { id: history.id }, data: { reason: 'Tampered' } })).rejects.toThrow();
  }, 60000);

  it('validates once, marks eligibility only, then releases once without KPay', async () => {
    const root = await activate('Finance');
    for (let index = 0; index < 4; index++) await activate(`Finance${index}`, root.id);
    const commission = await prisma.commission.findFirst({ where: { membreId: root.id } });
    await Promise.all([matrix.validateCommission(commission.id, adminId), matrix.validateCommission(commission.id, adminId)]);
    let balance = await wallet.getWallet(root.id);
    expect(balance).toMatchObject({ soldeDisponible: 24, soldeReinvesti: 16, totalGagne: 40 });
    expect(await prisma.reinvestLote.count({ where: { commissionId: commission.id } })).toBe(1);
    const lot = await prisma.reinvestLote.findUnique({ where: { commissionId: commission.id } });
    expect(lot.releasedAt).toBeNull();
    expect(lot.calendarVersion).toContain('synthetic-test');
    await expect(wallet.releaseHeldLot(lot.id, adminId)).rejects.toThrow();
    await prisma.reinvestLote.update({ where: { id: lot.id }, data: { releaseDate: new Date(Date.now() - 1000) } });
    await cron.releaseDueLots();
    balance = await wallet.getWallet(root.id);
    expect(balance).toMatchObject({ soldeDisponible: 24, soldeReinvesti: 16, totalGagne: 40 });
    await Promise.all([wallet.releaseHeldLot(lot.id, adminId), wallet.releaseHeldLot(lot.id, adminId)]);
    expect(await wallet.getWallet(root.id)).toMatchObject({ soldeDisponible: 40, soldeReinvesti: 0, totalGagne: 40 });
    expect(await prisma.transactionPortefeuille.count({ where: { referenceId: `release:${lot.id}` } })).toBe(1);
    expect(payment.initiatePayout).not.toHaveBeenCalled();
    expect(payment.createPayment).not.toHaveBeenCalled();
  }, 60000);

  it('enforces route limits, actor provenance and authorization', async () => {
    const root = await activate('API');
    await request(app.getHttpServer()).get(`/mlm/matrix/${root.id}/tree?depth=8`).expect(400);
    await request(app.getHttpServer()).post('/mlm/matrix/move').set('x-test-role', 'AGENT').send({}).expect(403);
    await request(app.getHttpServer()).post('/mlm/matrix/move').send({ memberId: root.id, newParentId: root.id, newPosition: 5, expectedPositionId: null, operationId: randomUUID(), reason: 'Invalid test', actorId: 'forged' }).expect(400);
    const response = await request(app.getHttpServer()).get(`/mlm/members/${root.id}/progress`).expect(200);
    expect(response.body.progression).toMatchObject({ currentLevel: null, currentGeneration: 1, requiredPositions: 4 });
  }, 30000);

  it('detects aggregate drift without repairing or creating commissions', async () => {
    const root = await activate('Audit');
    const stored = await prisma.matrix.findFirst({ where: { membreId: root.id } });
    await prisma.matrix.update({ where: { id: stored.id }, data: { filleulsValides: 1 } });
    const client = new Client({ connectionString: process.env.MLM_TEST_DATABASE_URL });
    try {
      await client.connect();
      const result = await auditMlm(client);
      expect(result.aggregateDrift).toEqual(expect.arrayContaining([expect.objectContaining({ id: stored.id, stored: 1, actual: 0 })]));
      expect((await prisma.matrix.findUnique({ where: { id: stored.id } })).filleulsValides).toBe(1);
      expect(await prisma.commission.count({ where: { membreId: root.id } })).toBe(0);
    } finally {
      await client.end();
      await prisma.matrix.update({ where: { id: stored.id }, data: { filleulsValides: 0 } });
    }
  }, 30000);

  it('core round1 bounds activation aggregates to eight ancestors but updates all-depth totals', async () => {
    const chain = [await activate('BoundedRoot')];
    for (let depth = 1; depth < 13; depth++) chain.push(await activate(`Bounded${depth}`, chain[depth - 1].id));
    const leaf = await activate('BoundedLeaf');
    const writes: string[] = [];
    const updatedMembers: string[] = [];
    await prisma.$transaction(async transaction => {
      const instrumented = new Proxy(transaction, { get(target, key) {
        if (key === 'matrix') return new Proxy(target.matrix, { get(delegate, method) {
          if (method === 'upsert') return async args => { writes.push(args.where.membreId_mlmLevelId.membreId); return delegate.upsert(args); };
          return Reflect.get(delegate, method);
        } });
        if (key === 'membre') return new Proxy(target.membre, { get(delegate, method) {
          if (method === 'update') return async args => { updatedMembers.push(args.where.id); return delegate.update(args); };
          return Reflect.get(delegate, method);
        } });
        return Reflect.get(target, key);
      } });
      await placement.place(instrumented as any, leaf.id, chain[12].id);
    }, { timeout: 30000 });
    expect([...new Set(writes)].sort()).toEqual(chain.slice(5).map(member => member.id).sort());
    expect(writes).toHaveLength(64);
    expect(updatedMembers).toHaveLength(8);
    for (const [depth, ancestor] of chain.entries()) {
      expect((await prisma.membre.findUniqueOrThrow({ where: { id: ancestor.id } })).totalDescendants).toBe(13 - depth);
      const matrices = await prisma.matrix.findMany({ where: { membreId: ancestor.id }, include: { level: true } });
      expect(matrices.filter(row => row.level.ordre <= Math.min(8, 13 - depth)).every(row => row.occupiedPositions === 1 && row.filleulsValides === 1)).toBe(true);
    }
    const client = new Client({ connectionString: process.env.MLM_TEST_DATABASE_URL, options: '-c default_transaction_read_only=on' });
    try {
      await client.connect();
      await prisma.membre.update({ where: { id: chain[0].id }, data: { totalDescendants: 8 } });
      expect((await auditMlm(client)).totalDescendantsDrift).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: chain[0].id, stored: 8, actual: 13 }),
      ]));
    } finally {
      await client.end();
      await prisma.membre.update({ where: { id: chain[0].id }, data: { totalDescendants: 13 } });
    }
  }, 60000);

  it('core round1 keeps distinct totals for unequal subtree swaps and overlapping-path moves', async () => {
    const root = await activate('DeltaRoot');
    const left = await activate('DeltaLeft', root.id);
    const right = await activate('DeltaRight', root.id);
    const large = await activate('DeltaLarge', left.id);
    const middle = await activate('DeltaMiddle', large.id);
    await activate('DeltaLeaf', middle.id);
    const small = await activate('DeltaSmall', right.id);
    const first = await prisma.position.findUniqueOrThrow({ where: { filleulId: large.id } });
    const second = await prisma.position.findUniqueOrThrow({ where: { filleulId: small.id } });
    const swap = { memberId: large.id, otherMemberId: small.id, expectedPositionId: first.id, otherExpectedPositionId: second.id, operationId: randomUUID(), reason: 'Unequal subtree swap' };
    await placement.swap(swap, adminId);
    await placement.swap(swap, adminId);
    for (const [memberId, total] of [[root.id, 6], [left.id, 1], [right.id, 3], [large.id, 2]] as const) {
      expect((await prisma.membre.findUniqueOrThrow({ where: { id: memberId } })).totalDescendants).toBe(total);
    }
    const move = { memberId: large.id, newParentId: root.id, newPosition: 3, expectedPositionId: second.id, operationId: randomUUID(), reason: 'Overlapping ancestor paths' };
    await placement.move(move, adminId);
    await placement.move(move, adminId);
    for (const [memberId, total] of [[root.id, 6], [left.id, 1], [right.id, 0], [large.id, 2]] as const) {
      expect((await prisma.membre.findUniqueOrThrow({ where: { id: memberId } })).totalDescendants).toBe(total);
    }
    const rootCounts = await prisma.matrix.findMany({ where: { membreId: root.id }, include: { level: true }, orderBy: { level: { ordre: 'asc' } } });
    expect(rootCounts.slice(0, 4).map(row => [row.filleulsValides, row.occupiedPositions])).toEqual([[3, 3], [2, 2], [1, 1], [0, 0]]);
  }, 60000);

  it('core round1 audits occupied, completion, current rank, all-depth totals and missing aggregate rows read-only', async () => {
    const root = await activate('AllProjections');
    const child = await activate('AllProjectionsChild', root.id);
    await activate('AllProjectionsGrandchild', child.id);
    const direct = await prisma.matrix.findFirstOrThrow({ where: { membreId: root.id, level: { ordre: 1 } } });
    const second = await prisma.matrix.findFirstOrThrow({ where: { membreId: root.id, level: { ordre: 2 } } });
    const wrongLevel = await prisma.mlmLevel.findFirstOrThrow({ where: { ordre: 2 } });
    const client = new Client({ connectionString: process.env.MLM_TEST_DATABASE_URL, options: '-c default_transaction_read_only=on' });
    try {
      await client.connect();
      const clean = await auditMlm(client);
      expect(Object.values(clean).every(rows => Array.isArray(rows) && rows.length === 0)).toBe(true);
      await prisma.matrix.update({ where: { id: direct.id }, data: { occupiedPositions: 3 } });
      expect((await auditMlm(client)).aggregateDrift).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: direct.id, storedOccupied: 3, actualOccupied: 1 }),
      ]));
      await prisma.matrix.update({ where: { id: direct.id }, data: { occupiedPositions: 1, estComplete: true } });
      expect((await auditMlm(client)).aggregateDrift).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: direct.id, storedComplete: true, actualComplete: false }),
      ]));
      await prisma.matrix.update({ where: { id: direct.id }, data: { occupiedPositions: 3, estComplete: true } });
      await prisma.matrix.delete({ where: { id: second.id } });
      await prisma.membre.update({ where: { id: root.id }, data: { totalDescendants: 999, mlmLevelId: wrongLevel.id } });
      const report: any = await auditMlm(client);
      expect(report.aggregateDrift).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: direct.id, storedOccupied: 3, actualOccupied: 1, storedComplete: true, actualComplete: false }),
        expect.objectContaining({ membreId: root.id, mlmLevelId: second.mlmLevelId, missing: true, actual: 1, actualOccupied: 1 }),
      ]));
      expect(report.totalDescendantsDrift).toEqual(expect.arrayContaining([expect.objectContaining({ id: root.id, stored: 999, actual: 2 })]));
      expect(report.currentRankDrift).toEqual(expect.arrayContaining([expect.objectContaining({ id: root.id, stored: wrongLevel.id, actual: direct.mlmLevelId })]));
      expect((await prisma.matrix.findUniqueOrThrow({ where: { id: direct.id } })).occupiedPositions).toBe(3);
      expect((await prisma.membre.findUniqueOrThrow({ where: { id: root.id } })).totalDescendants).toBe(999);
      expect(await prisma.commission.count({ where: { membreId: root.id } })).toBe(0);
      expect((await client.query('SHOW default_transaction_read_only')).rows[0].default_transaction_read_only).toBe('on');
    } finally {
      await client.end();
      await prisma.matrix.update({ where: { id: direct.id }, data: { occupiedPositions: direct.occupiedPositions, estComplete: direct.estComplete } });
      await prisma.matrix.upsert({ where: { id: second.id }, update: {}, create: second });
      await prisma.membre.update({ where: { id: root.id }, data: { totalDescendants: 2, mlmLevelId: direct.mlmLevelId } });
    }
  }, 60000);

  it('core round2 orders overlapping capped paths child-before-parent after move and replay', async () => {
    const top = await activate('CapTop');
    const root = await activate('CapRoot', top.id);
    let longParent = root;
    const members = [top, root];
    for (let index = 1; index <= 6; index++) {
      longParent = await activate(`CapLong${index}`, longParent.id);
      members.push(longParent);
    }
    const oldParent = await activate('CapOld', longParent.id);
    const moved = await activate('CapMoved', oldParent.id);
    const shortFirst = await activate('CapShort1', root.id);
    const shortSecond = await activate('CapShort2', shortFirst.id);
    const target = await activate('CapTarget', shortSecond.id);
    members.push(oldParent, moved, shortFirst, shortSecond, target);
    const current = await prisma.position.findUniqueOrThrow({ where: { filleulId: moved.id } });
    const input = { memberId: moved.id, newParentId: target.id, newPosition: 1, expectedPositionId: current.id, operationId: randomUUID(), reason: 'Capped overlapping paths' };
    await placement.move(input, adminId);
    await placement.move(input, adminId);
    const topGeneration = await prisma.matrix.findFirstOrThrow({ where: { membreId: top.id, level: { ordre: 5 } } });
    expect([topGeneration.filleulsValides, topGeneration.occupiedPositions]).toEqual([2, 2]);
    const client = new Client({ connectionString: process.env.MLM_TEST_DATABASE_URL });
    try {
      await client.connect();
      const report: any = await auditMlm(client);
      const ids = new Set(members.map(member => member.id));
      expect(report.aggregateDrift.filter(row => ids.has(row.membreId))).toEqual([]);
      expect(report.totalDescendantsDrift.filter(row => ids.has(row.id))).toEqual([]);
      expect(report.currentRankDrift.filter(row => ids.has(row.id))).toEqual([]);
    } finally { await client.end(); }
    expect(await prisma.placementHistory.count({ where: { operationId: input.operationId } })).toBe(1);
    expect(await prisma.commission.count({ where: { membreId: { in: members.map(member => member.id) } } })).toBe(0);
  }, 60000);

  it('core round1 exposes safe profiles, acquired-rank filters and usable legacy placement APIs', async () => {
    const prefix = `CoreApi-${randomUUID()}`;
    const root = await activate(prefix);
    const builder = await prisma.mlmLevel.findFirstOrThrow({ where: { ordre: 1 } });
    const children = [];
    for (let index = 0; index < 4; index++) children.push(await activate(`${prefix}-${index}`, root.id));
    await prisma.client.update({ where: { id: children[0].clientId }, data: { pinHash: 'SYNTHETIC-CREDENTIAL-HASH' } });
    const response = await request(app.getHttpServer()).get(`/mlm/matrix/${root.id}/${builder.id}`).set('x-test-role', 'AGENT').expect(200);
    expect(response.body.positions[0].filleul.client).toEqual({ id: children[0].clientId, nom: `${prefix}-0`, prenom: 'Test', telephone: expect.any(String) });
    expect(JSON.stringify(response.body)).not.toContain('SYNTHETIC-CREDENTIAL-HASH');
    for (const generation of [0, -1, 9]) await request(app.getHttpServer()).get(`/mlm/matrix/${root.id}/generation/${generation}`).expect(400);
    await request(app.getHttpServer()).get(`/mlm/matrix/${root.id}/generation/8`).expect(200);
    const page = await new MlmService(prisma, wallet).listMembers({ levelId: builder.id, search: prefix, limit: 100 });
    expect(page.meta.total).toBe(1);
    expect(page.membres.map(member => member.id)).toEqual([root.id]);
    expect(page.membres[0].currentLevel.id).toBe(builder.id);

    const target = await activate('LegacyTarget');
    const client = await prisma.client.create({ data: { nom: 'Legacy', prenom: 'Test', telephone: randomUUID(), statut: 'ACTIF', siteInscriptionId: siteId, createdById: adminId } });
    const legacy = await prisma.membre.create({ data: {
      id: `mem-cli-${randomUUID()}`, clientId: client.id, matricule: `legacy-${randomUUID()}`, mlmLevelId: builder.id,
      portefeuille: { create: {} },
      matrices: { create: { mlmLevelId: builder.id, positions: { createMany: { data: [1, 2, 3, 4].map(numeroPosition => ({ numeroPosition })) } } } },
    } });
    const move = { memberId: ` ${legacy.id} `, newParentId: ` ${target.id} `, newPosition: 1, expectedPositionId: null, operationId: randomUUID(), reason: '  Legacy move request  ' };
    const moved = await request(app.getHttpServer()).post('/mlm/matrix/move').send(move).expect(201);
    expect(moved.body[0]).toMatchObject({ memberId: legacy.id, actorId: adminId, reason: 'Legacy move request' });
    await request(app.getHttpServer()).post('/mlm/matrix/move').send({ ...move, reason: move.reason.trim() }).expect(201);
    const legacyPosition = await prisma.position.findUniqueOrThrow({ where: { filleulId: legacy.id } });
    const otherPosition = await prisma.position.findUniqueOrThrow({ where: { filleulId: children[0].id } });
    const swap = { memberId: ` ${legacy.id} `, otherMemberId: ` ${children[0].id} `, expectedPositionId: legacyPosition.id, otherExpectedPositionId: otherPosition.id, operationId: randomUUID(), reason: '  Legacy swap request  ' };
    const swapped = await request(app.getHttpServer()).post('/mlm/matrix/swap').send(swap).expect(201);
    expect(swapped.body).toHaveLength(2);
    expect(swapped.body.every(row => row.reason === 'Legacy swap request' && row.actorId === adminId)).toBe(true);
    await request(app.getHttpServer()).post('/mlm/matrix/swap').send({ ...swap, reason: swap.reason.trim() }).expect(201);
    await request(app.getHttpServer()).post('/mlm/matrix/swap').send({ ...swap, operationId: randomUUID(), reason: '      ' }).expect(400);
    expect(await prisma.placementHistory.count({ where: { operationId: swap.operationId } })).toBe(2);
  }, 60000);
});
