import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { randomUUID } from 'crypto';
import { Membre, Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { initializeMlmLevels } from '../../../prisma/mlm-levels';
import { MlmMatrixService } from './mlm-matrix.service';
import { MlmPlacementService } from './mlm-placement.service';
import { MlmController } from './mlm.controller';
import { MlmService } from './mlm.service';
import { MlmWalletService } from './mlm-wallet.service';
import { MlmClaimService } from './mlm-claim.service';
import { MlmCalendarService } from './mlm-calendar.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

const integration = process.env.MLM_TEST_DATABASE_URL ? describe : describe.skip;
const request = require('supertest');

integration('automatic matrix branch ascent', () => {
  let prisma: PrismaService;
  let pool: Pool;
  let placement: MlmPlacementService;
  let matrix: MlmMatrixService;
  let adminId: string;
  let siteId: string;
  let levelId: number;
  let app: any;

  beforeAll(async () => {
    if (process.env.MLM_TEST_DATABASE_URL !== 'postgresql://postgres@127.0.0.1:55432/mlm_integration') {
      throw new Error('Ascent tests only use the explicit loopback synthetic MLM database');
    }
    pool = new Pool({ connectionString: process.env.MLM_TEST_DATABASE_URL });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) }) as PrismaService;
    await prisma.$connect();
    await initializeMlmLevels(prisma);
    levelId = (await prisma.mlmLevel.findFirstOrThrow({ where: { ordre: 1 } })).id;
    adminId = (await prisma.utilisateur.create({ data: { nom: 'Ascent test admin', telephone: randomUUID(), passwordHash: 'synthetic-only', role: 'SUPER_ADMIN' } })).id;
    siteId = (await prisma.site.create({ data: { nom: 'Ascent fixtures', ville: 'Test' } })).id;
    placement = new MlmPlacementService(prisma);
    matrix = new MlmMatrixService(prisma, {} as never, placement);
    const module = await Test.createTestingModule({
      controllers: [MlmController],
      providers: [
        { provide: MlmService, useValue: {} },
        { provide: MlmMatrixService, useValue: matrix },
        { provide: MlmPlacementService, useValue: placement },
        { provide: MlmWalletService, useValue: {} },
        { provide: MlmClaimService, useValue: {} },
        { provide: MlmCalendarService, useValue: {} }, RolesGuard,
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

  async function client(name: string, tx: Prisma.TransactionClient = prisma) {
    return tx.client.create({ data: { nom: name, prenom: 'Synthetic', telephone: randomUUID(), statut: 'ACTIF', siteInscriptionId: siteId, createdById: adminId } });
  }

  async function graph(edges: Array<[string, string?]>) {
    return prisma.$transaction(async tx => {
      await placement.lock(tx);
      const members: Record<string, Membre> = {};
      for (const [name, parent] of edges) {
        const owner = await client(name, tx);
        const member = await tx.membre.create({ data: { clientId: owner.id, matricule: randomUUID(), mlmLevelId: levelId, parrainId: parent ? members[parent].id : null } });
        members[name] = member;
        await tx.portefeuille.create({ data: { membreId: member.id } });
        await tx.matrix.create({ data: { membreId: member.id, mlmLevelId: levelId, positions: { create: [1, 2, 3, 4].map(numeroPosition => ({ numeroPosition })) } } });
        if (parent) {
          const slot = await tx.position.findFirstOrThrow({ where: { filleulId: null, matrix: { membreId: members[parent].id, mlmLevelId: levelId } }, orderBy: { numeroPosition: 'asc' } });
          await tx.position.update({ where: { id: slot.id }, data: { filleulId: member.id, estValide: true, dateValidation: new Date('2026-09-01T08:00:00Z') } });
        }
      }
      for (const member of Object.values(members)) {
        const totals = await tx.$queryRaw<Array<{ total: number }>>`
          WITH RECURSIVE descendants(id) AS (
            SELECT ${member.id}::text UNION ALL
            SELECT position."filleulId" FROM descendants
            JOIN matrices matrix ON matrix."membreId" = descendants.id AND matrix."mlmLevelId" = ${levelId}
            JOIN positions position ON position."matrixId" = matrix.id WHERE position."filleulId" IS NOT NULL
          ) SELECT (count(*) - 1)::integer AS total FROM descendants
        `;
        await tx.membre.update({ where: { id: member.id }, data: { totalDescendants: totals[0].total } });
      }
      await placement.recalculateAncestors(tx, Object.values(members).map(member => member.id), members[edges[0][0]].id);
      return members;
    }, { timeout: 30000 });
  }

  async function activateUnder(parent: Membre, name = 'Fourth') {
    const newcomer = await client(name);
    await prisma.$transaction(tx => matrix.onClientActivatedInTx(tx, newcomer.id, parent.id, adminId), { timeout: 30000 });
    return prisma.membre.findUniqueOrThrow({ where: { clientId: newcomer.id } });
  }

  async function incoming(member: Membre) {
    return prisma.position.findUnique({ where: { filleulId: member.id }, include: { matrix: true } });
  }

  async function expectConsistentGraph(members: Record<string, Membre>) {
    const ids = Object.values(members).map(member => member.id);
    const drift = await prisma.$queryRaw<Array<{ id: string }>>`
      WITH RECURSIVE network(ancestor, id, depth, path) AS (
        SELECT id, id, 0, ARRAY[id] FROM membres WHERE id IN (${Prisma.join(ids)})
        UNION ALL
        SELECT network.ancestor, position."filleulId", depth + 1, path || position."filleulId"
        FROM network JOIN matrices matrix ON matrix."membreId" = network.id AND matrix."mlmLevelId" = ${levelId}
        JOIN positions position ON position."matrixId" = matrix.id
        WHERE position."filleulId" IS NOT NULL AND NOT position."filleulId" = ANY(path)
      ), totals AS (
        SELECT ancestor, count(*) FILTER (WHERE depth > 0)::integer AS total FROM network GROUP BY ancestor
      ), generations AS (
        SELECT ancestor, depth, count(*)::integer AS total FROM network WHERE depth > 0 GROUP BY ancestor, depth
      ) SELECT member.id FROM membres member JOIN totals ON totals.ancestor = member.id
      WHERE member."totalDescendants" <> totals.total
      UNION ALL
      SELECT matrix.id FROM matrices matrix JOIN mlm_levels level ON level.id = matrix."mlmLevelId"
      LEFT JOIN generations ON generations.ancestor = matrix."membreId" AND generations.depth = level.ordre
      WHERE matrix."membreId" IN (${Prisma.join(ids)})
        AND (matrix."occupiedPositions" <> coalesce(generations.total, 0) OR matrix."filleulsValides" <> coalesce(generations.total, 0))
    `;
    expect(drift).toEqual([]);
    const overloads = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT matrix.id FROM matrices matrix JOIN positions position ON position."matrixId" = matrix.id
      WHERE matrix."membreId" IN (${Prisma.join(ids)}) AND position."filleulId" IS NOT NULL
      GROUP BY matrix.id HAVING count(*) > 4
    `;
    expect(overloads).toEqual([]);
  }

  const base: Array<[string, string?]> = [
    ['G'], ['P', 'G'], ['B', 'P'], ['S1', 'P'], ['S2', 'P'],
    ['C1', 'B'], ['C2', 'B'], ['C3', 'B'],
  ];

  it('lifts a 4/4 child past a 3/4 parent without taking either members children', async () => {
    const members = await graph(base);
    const before = await incoming(members.B);
    const siblingsBefore = await Promise.all([members.P, members.S1, members.S2, members.C1, members.C2, members.C3].map(incoming));
    const fourth = await activateUnder(members.B);
    const after = await incoming(members.B);
    expect(after.matrix.membreId).toBe(members.G.id);
    expect(after.numeroPosition).toBe(2);
    expect(after.dateValidation).toEqual(before.dateValidation);
    const siblingsAfter = await Promise.all([members.P, members.S1, members.S2, members.C1, members.C2, members.C3].map(incoming));
    expect(siblingsAfter.map(({ matrix: _matrix, ...slot }) => slot)).toEqual(siblingsBefore.map(({ matrix: _matrix, ...slot }) => slot));
    expect((await incoming(fourth)).matrix.membreId).toBe(members.B.id);
    expect((await prisma.membre.findUniqueOrThrow({ where: { id: members.B.id } })).parrainId).toBe(members.P.id);
    expect((await prisma.membre.findUniqueOrThrow({ where: { id: members.P.id } })).parrainId).toBe(members.G.id);
    const history = await prisma.placementHistory.findMany({ where: { memberId: members.B.id, operationType: 'AUTO_ASCEND' } });
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ recruiterId: members.P.id, oldParentId: members.P.id, newParentId: members.G.id, oldPosition: 1, newPosition: 2, actorId: adminId });
    const tree = await matrix.getNetworkTree(members.G.id, 2);
    expect(tree.children.map(child => child.id)).toEqual([members.P.id, members.B.id]);
    expect(tree.children[1].children).toHaveLength(4);
    expect(tree.totalDescendants).toBe(8);
    expect(tree.children[0].totalDescendants).toBe(2);
    expect(tree.children[1].totalDescendants).toBe(4);
    const generation = await matrix.getNetworkGeneration(members.G.id, 2);
    expect(generation.meta.total).toBe(6);
    expect(generation.items.map(member => member.id)).toEqual(expect.arrayContaining([members.C1.id, members.C2.id, members.C3.id, fourth.id]));
    expect(await prisma.commission.count({ where: { membreId: members.B.id } })).toBe(1);
    await expectConsistentGraph(members);
  }, 30000);

  it('ascends successively from generation five to generation one, stopping at the root', async () => {
    const members = await graph([['R'], ['A', 'R'], ['D2', 'A'], ['D3', 'D2'], ['D4', 'D3'], ['B', 'D4'], ['C1', 'B'], ['C2', 'B'], ['C3', 'B']]);
    await activateUnder(members.B);
    expect((await incoming(members.B)).matrix.membreId).toBe(members.R.id);
    const history = await prisma.placementHistory.findMany({ where: { memberId: members.B.id, operationType: 'AUTO_ASCEND' }, orderBy: { createdAt: 'asc' } });
    expect(history).toHaveLength(4);
    expect(history.map(row => row.oldParentId)).toEqual(expect.arrayContaining([members.D4.id, members.D3.id, members.D2.id, members.A.id]));
    expect((await incoming(members.D4)).matrix.membreId).toBe(members.D3.id);
    expect((await incoming(members.C1)).matrix.membreId).toBe(members.B.id);
    expect((await matrix.getNetworkTree(members.R.id, 2)).totalDescendants).toBe(9);
    await expectConsistentGraph(members);
  }, 30000);

  it.each(['parent-full', 'destination-full', 'root', 'inactive-parent', 'inactive-destination', 'unvalidated-child'])('stops safely for %s', async scenario => {
    const edges = [...base];
    if (scenario === 'parent-full') edges.push(['S3', 'P']);
    if (scenario === 'destination-full') {
      for (const name of ['G2', 'G3', 'G4']) edges.push([name, 'G'], ...[1, 2, 3, 4].map(index => [`${name}-${index}`, name] as [string, string]));
    }
    const members = await graph(scenario === 'root' ? base.filter(([name]) => name !== 'G').map(([name, parent]) => [name, parent === 'G' ? undefined : parent]) : edges);
    if (scenario === 'inactive-parent' || scenario === 'inactive-destination') {
      await prisma.membre.update({ where: { id: members[scenario === 'inactive-parent' ? 'P' : 'G'].id }, data: { statut: 'SUSPENDU' } });
    }
    if (scenario === 'unvalidated-child') await prisma.position.updateMany({ where: { filleulId: members.C1.id }, data: { estValide: false, dateValidation: null } });
    const before = await incoming(members.B);
    await activateUnder(members.B);
    expect((await incoming(members.B)).id).toBe(before.id);
    expect(await prisma.placementHistory.count({ where: { memberId: members.B.id, operationType: 'AUTO_ASCEND' } })).toBe(0);
  }, 30000);

  it('makes the upward move and fourth activation atomic when the history write fails', async () => {
    const members = await graph(base);
    const newcomer = await client('Rollback');
    const before = await incoming(members.B);
    await expect(prisma.$transaction(async tx => {
      const createHistory = tx.placementHistory.create.bind(tx.placementHistory);
      tx.placementHistory.create = jest.fn<any>(input => {
        if (input.data.operationType === 'AUTO_ASCEND') throw new Error('synthetic history failure');
        return createHistory(input);
      }) as typeof tx.placementHistory.create;
      await matrix.onClientActivatedInTx(tx, newcomer.id, members.B.id, adminId);
    }, { timeout: 30000 })).rejects.toThrow('synthetic history failure');
    expect((await incoming(members.B)).id).toBe(before.id);
    expect(await prisma.membre.findUnique({ where: { clientId: newcomer.id } })).toBeNull();
    expect(await prisma.commission.count({ where: { membreId: members.B.id } })).toBe(0);
    expect(await prisma.placementHistory.count({ where: { memberId: members.B.id, operationType: 'AUTO_ASCEND' } })).toBe(0);
  }, 30000);

  it('reconciles existing complete members through an authorized, replay-safe endpoint', async () => {
    const members = await graph([...base, ['C4', 'B']]);
    const input = { operationId: randomUUID(), reason: 'Reevaluation du membre existant' };
    const route = `/mlm/matrix/${members.B.id}/reconcile-ascents`;
    await request(app.getHttpServer()).post(route).set('x-test-role', 'AGENT').send(input).expect(403);
    await request(app.getHttpServer()).post(route).set('x-test-role', 'GERANT').send(input).expect(403);
    await request(app.getHttpServer()).post(route).send({ ...input, actorId: 'forged' }).expect(400);
    await request(app.getHttpServer()).post(route).send({ ...input, operationId: 'invalid' }).expect(400);
    const first = await request(app.getHttpServer()).post(route).send(input).expect(201);
    expect(first.body.filter(row => row.operationType === 'AUTO_ASCEND')).toHaveLength(1);
    expect(first.body.every(row => row.actorId === adminId)).toBe(true);
    expect((await incoming(members.B)).matrix.membreId).toBe(members.G.id);
    const replay = await request(app.getHttpServer()).post(route).send(input).expect(201);
    expect(replay.body).toEqual(first.body);
    const noOp = await request(app.getHttpServer()).post(route).send({ ...input, operationId: randomUUID() }).expect(201);
    expect(noOp.body.filter(row => row.operationType === 'AUTO_ASCEND')).toHaveLength(0);
    await request(app.getHttpServer()).post(route).send({ ...input, reason: 'Different reason' }).expect(409);
    await request(app.getHttpServer()).post(`/mlm/matrix/${members.P.id}/reconcile-ascents`).send(input).expect(409);
    const commission = await prisma.commission.findMany({ where: { membreId: members.B.id } });
    expect(commission).toHaveLength(1);
    expect(commission[0].montant.toFixed(2)).toBe('40.00');
    expect(commission[0].montantSysteme.toFixed(2)).toBe('24.00');
    expect(commission[0].montantRetour.toFixed(2)).toBe('16.00');
    expect(commission[0].statut).toBe('EN_ATTENTE');
    const balance = await prisma.portefeuille.findUniqueOrThrow({ where: { membreId: members.B.id } });
    expect(balance.totalGagne.toFixed(2)).toBe('0.00');
  }, 30000);

  it('serializes concurrent fourth and fifth recruitments without losing descendants or creating duplicate commissions', async () => {
    const members = await graph(base);
    const recruits = await Promise.all([activateUnder(members.B, 'Concurrent fourth'), activateUnder(members.B, 'Concurrent fifth')]);
    expect((await incoming(members.B)).matrix.membreId).toBe(members.G.id);
    expect(await prisma.placementHistory.count({ where: { memberId: members.B.id, operationType: 'AUTO_ASCEND' } })).toBe(1);
    expect(await prisma.commission.count({ where: { membreId: members.B.id } })).toBe(1);
    expect(recruits.every(member => member.parrainId === members.B.id)).toBe(true);
    const positions = await Promise.all(recruits.map(incoming));
    expect(positions.filter(position => position.matrix.membreId === members.B.id)).toHaveLength(1);
    expect(positions.filter(position => position.matrix.membreId === members.C1.id)).toHaveLength(1);
    await expectConsistentGraph(members);
  }, 30000);

  it('rechecks candidates blocked by a full destination when an administrative move frees a slot', async () => {
    const members = await graph([...base, ['C4', 'B'], ['G2', 'G'], ['G3', 'G'], ['G4', 'G'], ['OtherRoot']]);
    const original = await incoming(members.G4);
    const input = { memberId: members.G4.id, newParentId: members.OtherRoot.id, newPosition: 1, expectedPositionId: original.id, operationId: randomUUID(), reason: 'Liberer une position du grand-parent' };
    await placement.move(input, adminId);
    expect((await incoming(members.B)).matrix.membreId).toBe(members.G.id);
    expect((await incoming(members.B)).numeroPosition).toBe(4);
    expect((await incoming(members.P)).matrix.membreId).toBe(members.G.id);
    const historyBefore = await prisma.placementHistory.count({ where: { memberId: members.B.id } });
    await placement.move(input, adminId);
    expect(await prisma.placementHistory.count({ where: { memberId: members.B.id } })).toBe(historyBefore);
    await expectConsistentGraph(members);
  }, 30000);

  it('rejects administrative cycles even after a branch has ascended', async () => {
    const members = await graph(base);
    await activateUnder(members.B);
    const original = await incoming(members.B);
    await expect(placement.move({ memberId: members.B.id, newParentId: members.C1.id, newPosition: 1, expectedPositionId: original.id, operationId: randomUUID(), reason: 'Tentative de cycle refusee' }, adminId)).rejects.toThrow('cycle');
    expect((await incoming(members.B)).id).toBe(original.id);
    await expectConsistentGraph(members);
  }, 30000);

  it.each(['inactive-candidate', 'invalid-incoming', 'inactive-child', 'parent-full-with-invalid-child'])('does not lift an existing branch with %s', async scenario => {
    const members = await graph([...base, ['C4', 'B'], ...(scenario === 'parent-full-with-invalid-child' ? [['S3', 'P'] as [string, string]] : [])]);
    if (scenario === 'inactive-candidate' || scenario === 'inactive-child') {
      await prisma.membre.update({ where: { id: members[scenario === 'inactive-candidate' ? 'B' : 'C1'].id }, data: { statut: 'SUSPENDU' } });
    } else {
      await prisma.position.updateMany({ where: { filleulId: members[scenario === 'invalid-incoming' ? 'B' : 'S3'].id }, data: { estValide: false, dateValidation: null } });
    }
    await prisma.$transaction(tx => placement.recalculateAncestors(tx, Object.values(members).map(member => member.id), members.B.id), { timeout: 30000 });
    const original = await incoming(members.B);
    await placement.reconcileAscents(members.B.id, { operationId: randomUUID(), reason: 'Verifier les conditions de validation' }, adminId);
    expect((await incoming(members.B)).id).toBe(original.id);
    expect(await prisma.placementHistory.count({ where: { memberId: members.B.id, operationType: 'AUTO_ASCEND' } })).toBe(0);
  }, 30000);

  it('allows only one of two eligible branches to claim the last grandparent slot concurrently', async () => {
    const members = await graph([
      ['G'], ['P', 'G'], ['G2', 'G'], ['G3', 'G'], ['B', 'P'], ['D', 'P'], ['S', 'P'],
      ['B1', 'B'], ['B2', 'B'], ['B3', 'B'], ['B4', 'B'], ['D1', 'D'], ['D2', 'D'], ['D3', 'D'], ['D4', 'D'],
      ...['G2', 'G3'].flatMap(name => [1, 2, 3, 4].map(index => [`${name}-${index}`, name] as [string, string])),
    ]);
    await Promise.all([members.B, members.D].map(member => placement.reconcileAscents(member.id, { operationId: randomUUID(), reason: 'Concurrence sur la derniere place' }, adminId)));
    const positions = await Promise.all([members.B, members.D].map(incoming));
    expect(positions.map(position => position.matrix.membreId).sort()).toEqual([members.G.id, members.P.id].sort());
    expect(await prisma.placementHistory.count({ where: { memberId: { in: [members.B.id, members.D.id] }, operationType: 'AUTO_ASCEND' } })).toBe(1);
    await expectConsistentGraph(members);
  }, 30000);

  it.each([false, true])('preserves a validated commission, wallet and retained lot after ascent and replay (exchange: %s)', async exchange => {
    const members = await graph([...base, ['C4', 'B'], ...(exchange ? [['G2', 'G'], ['G3', 'G'], ['G4', 'G']] as Array<[string, string]> : [])]);
    const calendar = new MlmCalendarService(prisma);
    const year = new Date().getUTCFullYear();
    for (const value of [year, year + 1]) await calendar.saveYear(value, { holidays: [], version: 'ascent-fixture', source: 'Synthetic test only' });
    const wallet = new MlmWalletService(prisma, {} as never, { registerFinalizer: jest.fn() } as never, calendar);
    const commission = await prisma.commission.findFirstOrThrow({ where: { membreId: members.B.id } });
    await new MlmMatrixService(prisma, wallet, placement).validateCommission(commission.id, adminId);
    const before = {
      commission: await prisma.commission.findUnique({ where: { id: commission.id } }),
      wallet: await prisma.portefeuille.findUnique({ where: { membreId: members.B.id } }),
      lot: await prisma.reinvestLote.findUnique({ where: { commissionId: commission.id } }),
    };
    expect(before.wallet.soldeDisponible.toFixed(2)).toBe('24.00');
    expect(before.wallet.soldeReinvesti.toFixed(2)).toBe('16.00');
    const input = { operationId: randomUUID(), reason: 'Verifier la conservation des gains valides' };
    await placement.reconcileAscents(members.B.id, input, adminId);
    await placement.reconcileAscents(members.B.id, input, adminId);
    expect((await incoming(members.B)).matrix.membreId).toBe(members.G.id);
    if (exchange) expect((await incoming(members.G2)).matrix.membreId).toBe(members.P.id);
    expect({
      commission: await prisma.commission.findUnique({ where: { id: commission.id } }),
      wallet: await prisma.portefeuille.findUnique({ where: { membreId: members.B.id } }),
      lot: await prisma.reinvestLote.findUnique({ where: { commissionId: commission.id } }),
    }).toEqual(before);
    expect(await prisma.commission.count({ where: { membreId: members.B.id } })).toBe(1);
  }, 30000);

  it('exchanges with the least occupied other branch while preserving both subtrees and their recruiters', async () => {
    const members = await graph([
      ...base, ['G2', 'G'], ['G3', 'G'], ['G4', 'G'],
      ['G21', 'G2'], ['G22', 'G2'], ['G31', 'G3'], ['G311', 'G31'], ['G3111', 'G311'],
      ['G41', 'G4'], ['G42', 'G4'], ['G43', 'G4'],
    ]);
    await prisma.position.update({ where: { filleulId: members.G3.id }, data: { dateValidation: new Date('2026-08-15T07:30:00Z') } });
    const original = await incoming(members.B);
    const replaced = await incoming(members.G3);
    const unchangedMembers = Object.values(members).filter(member => ![members.G.id, members.B.id, members.G3.id].includes(member.id));
    const unchangedBefore = await Promise.all(unchangedMembers.map(incoming));
    const fourth = await activateUnder(members.B);
    expect(await incoming(members.B)).toMatchObject({ id: replaced.id, matrix: { membreId: members.G.id }, dateValidation: original.dateValidation });
    expect(await incoming(members.G3)).toMatchObject({ id: original.id, matrix: { membreId: members.P.id }, dateValidation: replaced.dateValidation });
    expect((await Promise.all(unchangedMembers.map(incoming))).map(({ matrix: _matrix, ...slot }) => slot))
      .toEqual(unchangedBefore.map(({ matrix: _matrix, ...slot }) => slot));
    expect((await incoming(fourth)).matrix.membreId).toBe(members.B.id);
    expect((await prisma.membre.findUniqueOrThrow({ where: { id: members.B.id } })).parrainId).toBe(members.P.id);
    expect((await prisma.membre.findUniqueOrThrow({ where: { id: members.G3.id } })).parrainId).toBe(members.G.id);
    const upward = await prisma.placementHistory.findFirstOrThrow({ where: { memberId: members.B.id, operationType: 'AUTO_ASCEND' } });
    const downward = await prisma.placementHistory.findFirstOrThrow({ where: { memberId: members.G3.id, operationType: 'AUTO_DESCEND' } });
    expect(downward).toMatchObject({ operationId: upward.operationId, recruiterId: members.G.id, oldParentId: members.G.id, newParentId: members.P.id, oldPosition: 3, newPosition: 1, actorId: adminId });
    expect(upward).toMatchObject({ recruiterId: members.P.id, oldParentId: members.P.id, newParentId: members.G.id, oldPosition: 1, newPosition: 3, actorId: adminId });
    const tree = await matrix.getNetworkTree(members.G.id, 3);
    expect(tree.children.map(child => child.id)).toEqual([members.P.id, members.G2.id, members.B.id, members.G4.id]);
    expect(tree.children[0].children[0].id).toBe(members.G3.id);
    expect(tree.children[2].children).toHaveLength(4);
    expect((await matrix.getNetworkGeneration(members.G.id, 1)).meta.total).toBe(4);
    await expectConsistentGraph({ ...members, fourth });
  }, 30000);

  it('excludes its own parent even when it has the fewest children and breaks ties by position', async () => {
    const members = await graph([
      ['G'], ['P', 'G'], ['G2', 'G'], ['G3', 'G'], ['G4', 'G'], ['B', 'P'],
      ['B1', 'B'], ['B2', 'B'], ['B3', 'B'], ['B4', 'B'],
      ...['G2', 'G3', 'G4'].flatMap(name => [1, 2].map(index => [`${name}-${index}`, name] as [string, string])),
    ]);
    const parentBefore = await incoming(members.P);
    const input = { operationId: randomUUID(), reason: 'Echanger avec la premiere branche eligible' };
    const result = await placement.reconcileAscents(members.B.id, input, adminId);
    expect((await incoming(members.B)).numeroPosition).toBe(2);
    expect((await incoming(members.B)).matrix.membreId).toBe(members.G.id);
    expect((await incoming(members.G2)).matrix.membreId).toBe(members.P.id);
    expect((await incoming(members.P)).id).toBe(parentBefore.id);
    expect(result.map(row => row.operationType).sort()).toEqual(['AUTO_ASCEND', 'AUTO_DESCEND', 'RECONCILE']);
    expect(await placement.reconcileAscents(members.B.id, input, adminId)).toEqual(result);
    const noOp = await placement.reconcileAscents(members.B.id, { ...input, operationId: randomUUID() }, adminId);
    expect(noOp).toHaveLength(1);
    await expectConsistentGraph(members);
  }, 30000);

  it('counts occupied positions rather than only validated children when selecting a branch to replace', async () => {
    const members = await graph([
      ...base, ['C4', 'B'], ['G2', 'G'], ['G3', 'G'], ['G4', 'G'],
      ...['G2', 'G3', 'G4'].flatMap(name => [1, 2, 3, 4].map(index => [`${name}-${index}`, name] as [string, string])),
    ]);
    await prisma.position.updateMany({ where: { filleulId: members['G2-1'].id }, data: { estValide: false, dateValidation: null } });
    await prisma.$transaction(tx => placement.recalculateAncestors(tx, Object.values(members).map(member => member.id), members.B.id), { timeout: 30000 });
    const before = await incoming(members.B);
    const result = await placement.reconcileAscents(members.B.id, { operationId: randomUUID(), reason: 'Respecter les quatre places occupees' }, adminId);
    expect((await incoming(members.B)).id).toBe(before.id);
    expect(result.map(row => row.operationType)).toEqual(['RECONCILE']);
  }, 30000);

  it('serializes two complete branches competing for the only replaceable grandparent child', async () => {
    const members = await graph([
      ['G'], ['P', 'G'], ['G2', 'G'], ['G3', 'G'], ['G4', 'G'], ['B', 'P'], ['D', 'P'], ['S', 'P'],
      ...['B', 'D', 'G3', 'G4'].flatMap(name => [1, 2, 3, 4].map(index => [`${name}-${index}`, name] as [string, string])),
    ]);
    await Promise.all([members.B, members.D].map(member => placement.reconcileAscents(member.id, { operationId: randomUUID(), reason: 'Concurrence sur une branche remplacable' }, adminId)));
    const positions = await Promise.all([members.B, members.D].map(incoming));
    expect(positions.map(position => position.matrix.membreId).sort()).toEqual([members.G.id, members.P.id].sort());
    expect(await prisma.placementHistory.count({ where: { memberId: members.G2.id, operationType: 'AUTO_DESCEND' } })).toBe(1);
    await expectConsistentGraph(members);
  }, 30000);

  it.each(['unvalidated', 'inactive'])('preserves the replaced branch status and validation (%s)', async state => {
    const members = await graph([...base, ['C4', 'B'], ['G2', 'G'], ['G3', 'G'], ['G4', 'G']]);
    if (state === 'unvalidated') await prisma.position.update({ where: { filleulId: members.G2.id }, data: { estValide: false, dateValidation: null } });
    else await prisma.membre.update({ where: { id: members.G2.id }, data: { statut: 'SUSPENDU' } });
    await prisma.$transaction(tx => placement.recalculateAncestors(tx, Object.values(members).map(member => member.id), members.B.id), { timeout: 30000 });
    const before = await incoming(members.G2);
    await placement.reconcileAscents(members.B.id, { operationId: randomUUID(), reason: 'Conserver la validation pendant l echange' }, adminId);
    const after = await incoming(members.G2);
    expect(after.matrix.membreId).toBe(members.P.id);
    expect(after.estValide).toBe(before.estValide);
    expect(after.dateValidation).toEqual(before.dateValidation);
    expect((await prisma.membre.findUniqueOrThrow({ where: { id: members.G2.id } })).statut).toBe(state === 'inactive' ? 'SUSPENDU' : 'ACTIF');
  }, 30000);

  it('rolls back both exchanged branches and activation if the downward history cannot be recorded', async () => {
    const members = await graph([...base, ['G2', 'G'], ['G3', 'G'], ['G4', 'G']]);
    const newcomer = await client('Exchange rollback');
    const before = await Promise.all([members.B, members.G2].map(incoming));
    await expect(prisma.$transaction(async tx => {
      const createHistory = tx.placementHistory.create.bind(tx.placementHistory);
      tx.placementHistory.create = jest.fn<any>(input => {
        if (input.data.operationType === 'AUTO_DESCEND') throw new Error('synthetic downward history failure');
        return createHistory(input);
      }) as typeof tx.placementHistory.create;
      await matrix.onClientActivatedInTx(tx, newcomer.id, members.B.id, adminId);
    }, { timeout: 30000 })).rejects.toThrow('synthetic downward history failure');
    expect((await Promise.all([members.B, members.G2].map(incoming))).map(slot => slot.id)).toEqual(before.map(slot => slot.id));
    expect(await prisma.membre.findUnique({ where: { clientId: newcomer.id } })).toBeNull();
    expect(await prisma.commission.count({ where: { membreId: members.B.id } })).toBe(0);
    expect(await prisma.placementHistory.count({ where: { memberId: { in: [members.B.id, members.G2.id] } } })).toBe(0);
    await expectConsistentGraph(members);
  }, 30000);

  it('settles a complete descendant of the displaced branch without replaying commissions or losing aggregates', async () => {
    const members = await graph([
      ...base, ['C4', 'B'], ['G2', 'G'], ['G3', 'G'], ['G4', 'G'], ['D', 'G2'],
      ['D1', 'D'], ['D2', 'D'], ['D3', 'D'], ['D4', 'D'],
      ['G31', 'G3'], ['G32', 'G3'], ['G41', 'G4'], ['G42', 'G4'], ['G43', 'G4'],
    ]);
    const input = { operationId: randomUUID(), reason: 'Verifier une cascade apres echange' };
    const result = await placement.reconcileAscents(members.B.id, input, adminId);
    expect((await incoming(members.B)).matrix.membreId).toBe(members.G.id);
    expect((await incoming(members.G2)).matrix.membreId).toBe(members.P.id);
    expect(await incoming(members.D)).toMatchObject({ numeroPosition: 4, matrix: { membreId: members.P.id } });
    expect((await incoming(members.D1)).matrix.membreId).toBe(members.D.id);
    expect((await prisma.membre.findUniqueOrThrow({ where: { id: members.D.id } })).parrainId).toBe(members.G2.id);
    expect(result.filter(row => row.operationType === 'AUTO_ASCEND')).toHaveLength(2);
    expect(result.filter(row => row.operationType === 'AUTO_DESCEND')).toHaveLength(1);
    const commissions = await prisma.commission.findMany({ where: { membreId: { in: [members.B.id, members.D.id, members.P.id] } }, orderBy: { id: 'asc' } });
    expect(commissions).toHaveLength(3);
    expect(await placement.reconcileAscents(members.B.id, input, adminId)).toEqual(result);
    expect(await prisma.commission.findMany({ where: { membreId: { in: [members.B.id, members.D.id, members.P.id] } }, orderBy: { id: 'asc' } })).toEqual(commissions);
    expect(await placement.reconcileAscents(members.B.id, { ...input, operationId: randomUUID() }, adminId)).toHaveLength(1);
    await expectConsistentGraph(members);
  }, 30000);

  it.each([
    ['automatic', 'partial-release'], ['automatic', 'second-claim'],
    ['manual', 'partial-release'], ['manual', 'second-claim'],
  ])('rolls back a %s exchange after a %s conflict', async (mode, failure) => {
    const members = await graph([...base, ['C4', 'B'], ['G2', 'G'], ['G3', 'G'], ['G4', 'G']]);
    const before = await Promise.all([members.B, members.G2].map(incoming));
    const operationId = randomUUID();
    const transaction = prisma.$transaction.bind(prisma);
    const interceptor = jest.spyOn(prisma, '$transaction').mockImplementation(((callback, options) => transaction(async tx => {
      const updateMany = tx.position.updateMany.bind(tx.position);
      let updates = 0;
      tx.position.updateMany = jest.fn<any>(async input => {
        updates++;
        if (failure === 'second-claim' && updates === 3) return { count: 0 };
        const result = await updateMany(input);
        return failure === 'partial-release' && updates === 1 ? { count: 1 } : result;
      }) as typeof tx.position.updateMany;
      return callback(tx);
    }, options)) as typeof prisma.$transaction);
    try {
      const operation = mode === 'automatic'
        ? placement.reconcileAscents(members.B.id, { operationId, reason: 'Echange automatique avec conflit simule' }, adminId)
        : placement.swap({ memberId: members.B.id, otherMemberId: members.G2.id, expectedPositionId: before[0].id, otherExpectedPositionId: before[1].id, operationId, reason: 'Echange manuel avec conflit simule' }, adminId);
      await expect(operation).rejects.toThrow(failure === 'partial-release' ? 'placements ont change' : 'Position occupee');
    } finally {
      interceptor.mockRestore();
    }
    expect((await Promise.all([members.B, members.G2].map(incoming))).map(({ matrix: _matrix, ...slot }) => slot))
      .toEqual(before.map(({ matrix: _matrix, ...slot }) => slot));
    expect(await prisma.placementHistory.count({ where: { operationId: { startsWith: operationId } } })).toBe(0);
    await expectConsistentGraph(members);
  }, 30000);

  it.each([false, true])('settles SWAP-triggered ascents with replay and atomic rollback (failure: %s)', async failHistory => {
    const members = await graph([
      ['G'], ['P', 'G'], ['S1', 'P'], ['S2', 'P'], ['O'], ['B', 'O'],
      ['C1', 'B'], ['C2', 'B'], ['C3', 'B'], ['C4', 'B'],
    ]);
    const original = await incoming(members.B);
    const other = await incoming(members.S1);
    const input = { memberId: members.B.id, otherMemberId: members.S1.id, expectedPositionId: original.id, otherExpectedPositionId: other.id, operationId: randomUUID(), reason: 'Echange suivi de remontee automatique' };
    if (failHistory) {
      const transaction = prisma.$transaction.bind(prisma);
      const interceptor = jest.spyOn(prisma, '$transaction').mockImplementation(((callback, options) => transaction(async tx => {
        const createHistory = tx.placementHistory.create.bind(tx.placementHistory);
        tx.placementHistory.create = jest.fn<any>(data => {
          if (data.data.operationType === 'AUTO_ASCEND') throw new Error('synthetic swap history failure');
          return createHistory(data);
        }) as typeof tx.placementHistory.create;
        return callback(tx);
      }, options)) as typeof prisma.$transaction);
      try {
        await expect(placement.swap(input, adminId)).rejects.toThrow('synthetic swap history failure');
      } finally {
        interceptor.mockRestore();
      }
      expect((await incoming(members.B)).id).toBe(original.id);
      expect((await incoming(members.S1)).id).toBe(other.id);
      expect(await prisma.placementHistory.count({ where: { operationId: { startsWith: input.operationId } } })).toBe(0);
    } else {
      const result = await placement.swap(input, adminId);
      expect(result).toHaveLength(2);
      expect(await placement.swap(input, adminId)).toEqual(expect.arrayContaining(result));
      expect((await incoming(members.B)).matrix.membreId).toBe(members.G.id);
      expect((await incoming(members.S1)).matrix.membreId).toBe(members.O.id);
      expect((await incoming(members.C1)).matrix.membreId).toBe(members.B.id);
      expect(await prisma.placementHistory.count({ where: { memberId: members.B.id, operationType: 'AUTO_ASCEND' } })).toBe(1);
      expect((await prisma.membre.findUniqueOrThrow({ where: { id: members.B.id } })).parrainId).toBe(members.O.id);
    }
    await expectConsistentGraph(members);
  }, 30000);
});
