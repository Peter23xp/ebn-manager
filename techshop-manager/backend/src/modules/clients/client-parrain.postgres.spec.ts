import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma, PrismaClient, Role, StatutClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { execFileSync } from 'child_process';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import { Client, Pool } from 'pg';
import { PrismaService } from '../../prisma/prisma.service';
import { MlmClaimService } from '../mlm/mlm-claim.service';
import { MlmMatrixService } from '../mlm/mlm-matrix.service';
import { MlmPlacementService } from '../mlm/mlm-placement.service';
import { MlmWalletService } from '../mlm/mlm-wallet.service';
import { ClientParrainService } from './client-parrain.service';

jest.mock('@prisma/client/runtime/library.js', () => ({
  ...jest.requireActual<Record<string, unknown>>('@prisma/client/runtime/library.js'),
  warnEnvConflicts: () => undefined,
}));

const native = process.env.CLIENT_PARRAIN_TEST_PG_BIN ? describe : describe.skip;
type Actor = { id: string; role: Role; siteId?: string };

native('Client parrain attribution with isolated native PostgreSQL', () => {
  const pgBin = process.env.CLIENT_PARRAIN_TEST_PG_BIN;
  const tempPrefix = 'ebn-client-parrain-';
  const reason = 'Attribution initiale approuvee';
  const siteId = randomUUID();
  const otherSiteId = randomUUID();
  const admin: Actor = { id: randomUUID(), role: 'SUPER_ADMIN' };
  const otherAdmin: Actor = { id: randomUUID(), role: 'SUPER_ADMIN' };
  const manager: Actor = { id: randomUUID(), role: 'GERANT', siteId };
  const regional: Actor = { id: randomUUID(), role: 'DIRECTEUR_REGIONAL', siteId };
  let directory: string;
  let started = false;
  let pool: Pool;
  let prisma: PrismaClient;
  let placement: MlmPlacementService;
  let matrix: MlmMatrixService;
  let claims: MlmClaimService;
  let service: ClientParrainService;

  function postgres(command: string, args: string[]) {
    const env = Object.fromEntries(Object.entries(process.env)
      .filter(([key]) => !/^PG/i.test(key) && !/^(DATABASE_URL|DIRECT_URL)$/i.test(key)));
    try {
      return execFileSync(path.join(pgBin, command), args, {
        env, windowsHide: true, stdio: command === 'pg_ctl' ? 'ignore' : 'pipe',
        timeout: command === 'initdb' ? 90000 : 30000,
      });
    } catch (error) {
      const log = directory && path.join(directory, 'server.log');
      error.message += `\n${error.stdout?.toString() ?? ''}\n${error.stderr?.toString() ?? ''}`;
      if (log && fs.existsSync(log)) error.message += `\n${fs.readFileSync(log, 'utf8')}`;
      throw error;
    }
  }

  async function unusedPort() {
    const listener = net.createServer();
    await new Promise<void>((resolve, reject) => {
      listener.once('error', reject);
      listener.listen(0, '127.0.0.1', resolve);
    });
    const port = (listener.address() as net.AddressInfo).port;
    await new Promise<void>((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
    return port === 55432 ? unusedPort() : port;
  }

  function makeMatrix(placementService = placement) {
    const database = prisma as PrismaService;
    const wallet = new MlmWalletService(database, {} as never, {} as never, {} as never);
    return new MlmMatrixService(database, wallet, placementService);
  }

  beforeAll(async () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), tempPrefix));
    const port = await unusedPort();
    postgres('initdb', ['-D', directory, '-U', 'postgres', '--auth=trust', '--encoding=UTF8', '--no-locale']);
    postgres('pg_ctl', ['-D', directory, '-l', path.join(directory, 'server.log'),
      '-o', `-h 127.0.0.1 -p ${port}`, '-w', 'start']);
    started = true;
    const connection = {
      host: '127.0.0.1', port, user: 'postgres', password: 'local-fixture-only', database: 'postgres',
      ssl: false as const, connectionTimeoutMillis: 5000, statement_timeout: 15000,
      application_name: 'client-parrain-native-test',
    };
    const fixture = new Client(connection);
    await fixture.connect();
    try {
      const identity = await fixture.query('SELECT current_setting(\'data_directory\') AS directory');
      expect(fs.realpathSync(identity.rows[0].directory)).toBe(fs.realpathSync(directory));
      const migrations = path.resolve(__dirname, '../../../prisma/migrations');
      for (const migration of fs.readdirSync(migrations).sort()) {
        const sql = path.join(migrations, migration, 'migration.sql');
        if (fs.existsSync(sql)) await fixture.query(fs.readFileSync(sql, 'utf8'));
      }
    } finally { await fixture.end(); }
    pool = new Pool({ ...connection, max: 8 });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
    await prisma.$connect();
    await prisma.site.createMany({ data: [siteId, otherSiteId].map(id => ({ id, nom: `Fixture ${id}`, ville: 'Local' })) });
    await prisma.utilisateur.createMany({ data: [admin, otherAdmin, manager, regional].map(actor => ({
      ...actor, nom: `Fixture ${actor.role}`, telephone: `fixture-${actor.id}`, passwordHash: 'test-only-not-a-password',
    })) });
    await prisma.mlmLevel.createMany({ data: Array.from({ length: 8 }, (_, index) => ({
      id: index + 1, ordre: index + 1, nom: `Generation ${index + 1}`, filleulsRequis: 4 ** (index + 1),
      commissionParFilleul: 10, commissionTotale: 40, commissionSysteme: 24, commissionRetour: 16,
      bonusDescription: 'Fixture bonus', couleur: '#000000', icone: 'fixture',
    })) });
    placement = new MlmPlacementService(prisma as PrismaService);
    matrix = makeMatrix();
    claims = new MlmClaimService(prisma as PrismaService, matrix);
    service = new ClientParrainService(prisma as PrismaService, matrix, claims, placement);
  }, 180000);

  afterAll(async () => {
    try {
      await prisma?.$disconnect();
    } finally {
      try {
        await pool?.end();
      } finally {
        if (started || (directory && fs.existsSync(path.join(directory, 'postmaster.pid')))) {
          postgres('pg_ctl', ['-D', directory, '-m', 'fast', '-w', 'stop']);
        }
        if (directory && fs.existsSync(directory)) {
          const resolved = fs.realpathSync(directory);
          const tempRoot = fs.realpathSync(os.tmpdir());
          if (!path.isAbsolute(resolved) || path.dirname(resolved) !== tempRoot
            || !path.basename(resolved).startsWith(tempPrefix)
            || !resolved.startsWith(path.join(tempRoot, tempPrefix))) {
            throw new Error('Unsafe client parrain test cleanup path');
          }
          fs.rmSync(resolved, { recursive: true });
        }
      }
    }
  }, 45000);

  async function client(statut: StatutClient = 'ACTIF', inscriptionSiteId = siteId) {
    const id = randomUUID();
    return prisma.client.create({ data: {
      id, prenom: 'Fixture', nom: id, telephone: `fixture-${id}`, codeParrain: `CODE-${id}`,
      statut, siteInscriptionId: inscriptionSiteId, createdById: admin.id,
    } });
  }

  async function active(inscriptionSiteId = siteId) {
    const person = await client('ACTIF', inscriptionSiteId);
    await matrix.onClientActivated(person.id);
    const member = await prisma.membre.findUniqueOrThrow({ where: { clientId: person.id } });
    return { ...person, member };
  }

  async function position(memberId: string) {
    return prisma.position.findUnique({ where: { filleulId: memberId }, include: { matrix: true } });
  }

  async function memberFor(clientId: string) {
    return prisma.membre.findUniqueOrThrow({ where: { clientId } });
  }

  async function history(clientId: string) {
    return prisma.$queryRaw<Array<{ id: string; clientId: string; parrainClientId: string; actorId: string; reason: string; createdAt: Date }>>`
      SELECT * FROM client_parrain_attributions WHERE "clientId" = ${clientId}
    `;
  }

  async function snapshot() {
    const tables = ['clients', 'membres', 'matrices', 'positions', 'parrain_claims', 'client_parrain_attributions',
      'placement_history', 'portefeuilles', 'commissions', 'promotions', 'bonus_attribues', 'salaires_verses',
      'bonus_retraites', 'transactions_portefeuille', 'reinvest_lots'];
    return Promise.all(tables.map(async table => ({
      table,
      rows: await prisma.$queryRawUnsafe(`SELECT to_jsonb(record) AS row FROM "${table}" record ORDER BY id`),
    })));
  }

  async function assign(clientId: string, codeParrain: string, actor = admin, assignmentReason = reason) {
    return service.assign(clientId, { codeParrain, reason: assignmentReason }, actor);
  }

  async function recruit(recruiter: Awaited<ReturnType<typeof active>>) {
    const child = await client();
    await matrix.onClientActivated(child.id, recruiter.codeParrain);
    return { ...child, member: await memberFor(child.id) };
  }

  it('repairs an active recruiter missing MLM before its preactive child activates', async () => {
    const recruiter = await client('ACTIF');
    const source = await client('EN_COURS');
    await assign(source.id, recruiter.codeParrain);
    const recruiterMember = await memberFor(recruiter.id);
    expect(await prisma.membre.findUnique({ where: { clientId: source.id } })).toBeNull();
    await prisma.client.update({ where: { id: source.id }, data: { statut: 'ACTIF' } });
    await matrix.onClientActivated(source.id);
    const childMember = await memberFor(source.id);
    expect(childMember.parrainId).toBe(recruiterMember.id);
    expect((await position(childMember.id))?.matrix.membreId).toBe(recruiterMember.id);
  });

  it('records a preactive source without initializing MLM, then uses its recruiter on activation', async () => {
    const recruiter = await active();
    const source = await client('EN_COURS');
    const result = await assign(source.id, recruiter.codeParrain);
    expect(result).toMatchObject({
      id: expect.any(String), clientId: source.id, parrainClientId: recruiter.id, reason, createdAt: expect.any(Date),
      actor: { id: admin.id, nom: 'Fixture SUPER_ADMIN' },
      parrain: { id: recruiter.id, prenom: recruiter.prenom, nom: recruiter.nom, statut: 'ACTIF' },
    });
    expect(result.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(result).not.toHaveProperty('operationId');
    expect(await history(source.id)).toEqual([{ id: result.id, clientId: source.id, parrainClientId: recruiter.id,
      actorId: admin.id, reason, createdAt: result.createdAt }]);
    expect(await service.getAttribution(source.id, admin)).toEqual(result);
    expect(await prisma.client.findUnique({ where: { id: source.id } })).toMatchObject({ parrainClientId: recruiter.id, statut: 'EN_COURS' });
    expect(await prisma.membre.findUnique({ where: { clientId: source.id } })).toBeNull();
    expect(await prisma.parrainClaim.findUnique({ where: { filleulClientId: source.id } })).toBeNull();
    await prisma.client.update({ where: { id: source.id }, data: { statut: 'ACTIF' } });
    await matrix.onClientActivated(source.id);
    const member = await memberFor(source.id);
    expect(member.parrainId).toBe(recruiter.member.id);
    expect(await position(member.id)).toMatchObject({ numeroPosition: 1, estValide: true, matrix: { membreId: recruiter.member.id } });
  });

  it('initializes an active source and places it without crediting wallets or an incomplete generation', async () => {
    const recruiter = await active();
    const source = await client();
    const commissionsBefore = await prisma.commission.count();
    const journalBefore = await prisma.transactionPortefeuille.count();
    await assign(source.id, recruiter.codeParrain);
    const member = await memberFor(source.id);
    expect(member.parrainId).toBe(recruiter.member.id);
    expect(await position(member.id)).toMatchObject({ numeroPosition: 1, estValide: true, matrix: { membreId: recruiter.member.id } });
    expect(await prisma.matrix.count({ where: { membreId: member.id, mlmLevelId: 1 } })).toBe(1);
    expect(await prisma.position.count({ where: { matrix: { membreId: member.id, mlmLevelId: 1 } } })).toBe(4);
    const wallet = await prisma.portefeuille.findUniqueOrThrow({ where: { membreId: member.id } });
    expect(Number(wallet.soldeDisponible)).toBe(0);
    expect(Number(wallet.soldeReinvesti)).toBe(0);
    expect(Number(wallet.totalGagne)).toBe(0);
    expect(await prisma.commission.count()).toBe(commissionsBefore);
    expect(await prisma.transactionPortefeuille.count()).toBe(journalBefore);
  });

  it('initializes an active recruiter without a member through the existing activation flow', async () => {
    const recruiter = await client();
    const source = await client();
    await assign(source.id, recruiter.codeParrain);
    const recruiterMember = await memberFor(recruiter.id);
    const sourceMember = await memberFor(source.id);
    expect(sourceMember.parrainId).toBe(recruiterMember.id);
    expect(await position(sourceMember.id)).toMatchObject({ numeroPosition: 1, matrix: { membreId: recruiterMember.id } });
    expect(await prisma.portefeuille.count({ where: { membreId: { in: [sourceMember.id, recruiterMember.id] } } })).toBe(2);
  });

  it('returns no attribution without mutating an unattributed client', async () => {
    const source = await client('EN_COURS');
    const before = await snapshot();
    expect(await service.getAttribution(source.id, manager)).toBeNull();
    expect(await snapshot()).toEqual(before);
  });

  it('does not incidentally place an existing recruiter with an unpositioned recruitment link', async () => {
    const ancestor = await active();
    const recruiter = await active();
    await prisma.membre.update({ where: { id: recruiter.member.id }, data: { parrainId: ancestor.member.id } });
    await prisma.client.update({ where: { id: recruiter.id }, data: { parrainClientId: ancestor.id } });
    const source = await client();
    await assign(source.id, recruiter.codeParrain);
    expect(await position(recruiter.member.id)).toBeNull();
    expect(await position((await memberFor(source.id)).id)).toMatchObject({ matrix: { membreId: recruiter.member.id } });
    expect(await memberFor(ancestor.id)).toMatchObject({ totalDescendants: 0 });
  });

  it('spills over to the first child while retaining the original recruiter', async () => {
    const recruiter = await active();
    const children = [];
    for (let index = 0; index < 4; index++) children.push(await recruit(recruiter));
    const source = await client();
    await assign(source.id, recruiter.codeParrain);
    const member = await memberFor(source.id);
    expect(member.parrainId).toBe(recruiter.member.id);
    expect(await position(member.id)).toMatchObject({ numeroPosition: 1, matrix: { membreId: children[0].member.id } });
    expect(await prisma.client.findUnique({ where: { id: source.id } })).toMatchObject({ parrainClientId: recruiter.id });
  });

  it('attaches an existing root with its subtree without rebuilding descendants', async () => {
    const recruiter = await active();
    const source = await active();
    const child = await recruit(source);
    const grandchild = await recruit(child);
    const childBefore = await position(child.member.id);
    const grandchildBefore = await position(grandchild.member.id);
    await assign(source.id, recruiter.codeParrain);
    expect(await position(source.member.id)).toMatchObject({ matrix: { membreId: recruiter.member.id } });
    expect(await position(child.member.id)).toEqual(childBefore);
    expect(await position(grandchild.member.id)).toEqual(grandchildBefore);
    expect(await memberFor(source.id)).toMatchObject({ id: source.member.id, totalDescendants: 2, parrainId: recruiter.member.id });
    expect(await memberFor(recruiter.id)).toMatchObject({ totalDescendants: 3 });
  });

  it('keeps an already positioned member and descendants in their exact slots', async () => {
    const matrixParent = await active();
    const recruiter = await active();
    const source = await active();
    const child = await recruit(source);
    await prisma.$transaction(transaction => placement.place(transaction, source.member.id, matrixParent.member.id));
    const sourceBefore = await position(source.member.id);
    const childBefore = await position(child.member.id);
    const placementsBefore = await prisma.placementHistory.count();
    const commissionsBefore = await prisma.commission.count();
    await assign(source.id, recruiter.codeParrain);
    expect(await memberFor(source.id)).toMatchObject({ parrainId: recruiter.member.id });
    expect(await position(source.member.id)).toEqual(sourceBefore);
    expect(await position(child.member.id)).toEqual(childBefore);
    expect(await prisma.placementHistory.count()).toBe(placementsBefore);
    expect(await prisma.commission.count()).toBe(commissionsBefore);
    expect(await memberFor(matrixParent.id)).toMatchObject({ totalDescendants: 2 });
    expect(await memberFor(recruiter.id)).toMatchObject({ totalDescendants: 0 });
  });

  it.each<StatutClient>(['ACTIF', 'EN_COURS'])('waits for an EN_COURS recruiter when source is %s', async statut => {
    const recruiter = await client('EN_COURS');
    const source = await client(statut);
    const result = await assign(source.id, recruiter.telephone);
    expect(result.parrain.statut).toBe('EN_COURS');
    expect(await prisma.client.findUnique({ where: { id: source.id } })).toMatchObject({ parrainClientId: recruiter.id });
    expect(await prisma.membre.findUnique({ where: { clientId: recruiter.id } })).toBeNull();
    const sourceMember = await prisma.membre.findUnique({ where: { clientId: source.id } });
    if (statut === 'EN_COURS') expect(sourceMember).toBeNull();
    if (sourceMember) {
      expect(sourceMember.parrainId).toBeNull();
      expect(await position(sourceMember.id)).toBeNull();
    }
    expect(await prisma.parrainClaim.findUnique({ where: { filleulClientId: source.id } })).toMatchObject({
      parrainClientId: recruiter.id, statut: 'EN_ATTENTE', confirmedAt: null,
    });
    const beforeReplay = await snapshot();
    expect(await assign(source.id, recruiter.codeParrain)).toEqual(result);
    expect(await snapshot()).toEqual(beforeReplay);
    await prisma.client.update({ where: { id: recruiter.id }, data: { statut: 'ACTIF' } });
    await matrix.onClientActivated(recruiter.id);
    if (statut === 'EN_COURS') {
      await prisma.client.update({ where: { id: source.id }, data: { statut: 'ACTIF' } });
    }
    expect(await claims.attachConfirmedClaims(recruiter.id, 'FIXTURE-202609-0001', admin.id)).toEqual({ attachés: 1, conflits: 0 });
    const recruiterMember = await memberFor(recruiter.id);
    const attached = await memberFor(source.id);
    expect(attached.parrainId).toBe(recruiterMember.id);
    expect(await position(attached.id)).toMatchObject({ matrix: { membreId: recruiterMember.id } });
    expect(await prisma.parrainClaim.findUnique({ where: { filleulClientId: source.id } })).toMatchObject({
      statut: 'LIE', confirmedById: admin.id, factureReclamee: 'FIXTURE-202609-0001',
    });
    expect(await history(source.id)).toHaveLength(1);
  });

  it('permits GERANT on its source site even when the recruiter is in another site', async () => {
    const recruiter = await active(otherSiteId);
    const source = await client('EN_COURS');
    const result = await assign(source.id, recruiter.codeParrain, manager);
    expect(result.actor.id).toBe(manager.id);
    expect(await service.getAttribution(source.id, manager)).toEqual(result);
  });

  it('permits SUPER_ADMIN attribution and reading across sites', async () => {
    const recruiter = await active();
    const source = await client('EN_COURS', otherSiteId);
    const result = await assign(source.id, recruiter.codeParrain);
    expect(await service.getAttribution(source.id, admin)).toEqual(result);
  });

  it.each(['foreign site', 'missing site', 'DIRECTEUR_REGIONAL', 'AGENT', 'FORMATEUR', 'CLIENT'])(
    'denies writes, reads and exact replays for %s', async scenario => {
      const recruiter = await active();
      const source = await client('EN_COURS');
      const actor: Actor = scenario === 'foreign site' ? { ...manager, siteId: otherSiteId }
        : scenario === 'missing site' ? { id: manager.id, role: 'GERANT' }
          : { ...regional, role: scenario as Role };
      const before = await snapshot();
      await expect(assign(source.id, recruiter.codeParrain, actor)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.getAttribution(source.id, actor)).rejects.toBeInstanceOf(ForbiddenException);
      expect(await snapshot()).toEqual(before);
      await assign(source.id, recruiter.codeParrain, manager);
      await expect(assign(source.id, recruiter.codeParrain, actor)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.getAttribution(source.id, actor)).rejects.toBeInstanceOf(ForbiddenException);
    },
  );

  it.each<StatutClient>(['SUSPENDU', 'ARCHIVE'])('rejects a %s source or recruiter without changes', async statut => {
    const recruiter = await active();
    const source = await client(statut);
    const invalidRecruiter = await client(statut);
    const validSource = await client('EN_COURS');
    const before = await snapshot();
    await expect(assign(source.id, recruiter.codeParrain)).rejects.toBeInstanceOf(BadRequestException);
    await expect(assign(validSource.id, invalidRecruiter.codeParrain)).rejects.toBeInstanceOf(BadRequestException);
    expect(await snapshot()).toEqual(before);
  });

  it.each(['EN_ATTENTE', 'SUSPENDU', 'ARCHIVE'] as const)('rejects an ACTIF recruiter whose member is %s', async statut => {
    const recruiter = await active();
    const source = await client();
    await prisma.membre.update({ where: { id: recruiter.member.id }, data: { statut } });
    const before = await snapshot();
    await expect(assign(source.id, recruiter.codeParrain)).rejects.toBeInstanceOf(BadRequestException);
    expect(await snapshot()).toEqual(before);
  });

  it.each(['self', 'client recruitment', 'member recruitment', 'matrix parent', 'mixed union'])(
    'rejects a %s cycle without any writes', async kind => {
      const source = await active();
      const recruiter = kind === 'self' ? source : await active();
      if (kind === 'client recruitment') {
        await prisma.client.update({ where: { id: recruiter.id }, data: { parrainClientId: source.id } });
      } else if (kind === 'member recruitment') {
        await prisma.membre.update({ where: { id: recruiter.member.id }, data: { parrainId: source.member.id } });
      } else if (kind === 'matrix parent') {
        await prisma.$transaction(transaction => placement.place(transaction, recruiter.member.id, source.member.id));
      } else if (kind === 'mixed union') {
        const clientBridge = await active();
        const memberBridge = await active();
        await prisma.client.update({ where: { id: clientBridge.id }, data: { parrainClientId: source.id } });
        await prisma.membre.update({ where: { id: memberBridge.member.id }, data: { parrainId: clientBridge.member.id } });
        await prisma.$transaction(transaction => placement.place(transaction, recruiter.member.id, memberBridge.member.id));
      }
      const before = await snapshot();
      await expect(assign(source.id, recruiter.codeParrain)).rejects.toBeInstanceOf(BadRequestException);
      expect(await snapshot()).toEqual(before);
    },
  );

  it('rejects self recruitment and a client-only cycle before either client has a member', async () => {
    const source = await client('EN_COURS');
    const recruiter = await client('EN_COURS');
    await prisma.client.update({ where: { id: recruiter.id }, data: { parrainClientId: source.id } });
    const before = await snapshot();
    await expect(assign(source.id, source.codeParrain)).rejects.toBeInstanceOf(BadRequestException);
    await expect(assign(source.id, recruiter.codeParrain)).rejects.toBeInstanceOf(BadRequestException);
    expect(await snapshot()).toEqual(before);
  });

  it.each(['client same recruiter', 'client other recruiter', 'member same recruiter', 'member other recruiter', 'EN_ATTENTE', 'LIE'])(
    'rejects existing %s without an attribution history even when the requested parent matches', async existing => {
      const recruiter = await active();
      const originalRecruiter = existing.includes('other') ? await active() : recruiter;
      const source = await active();
      if (existing.startsWith('client')) {
        await prisma.client.update({ where: { id: source.id }, data: { parrainClientId: originalRecruiter.id } });
      } else if (existing.startsWith('member')) {
        await prisma.membre.update({ where: { id: source.member.id }, data: { parrainId: originalRecruiter.member.id } });
      } else {
        await prisma.parrainClaim.create({ data: {
          filleulClientId: source.id, parrainClientId: recruiter.id,
          telephoneParrainSaisi: recruiter.telephone, statut: existing as 'EN_ATTENTE' | 'LIE',
        } });
      }
      const before = await snapshot();
      await expect(assign(source.id, recruiter.codeParrain)).rejects.toBeInstanceOf(ConflictException);
      expect(await snapshot()).toEqual(before);
    },
  );

  it('replays by resolved recruiter, reason and actor with no duplicated writes', async () => {
    const recruiter = await active();
    const source = await client();
    const result = await assign(source.id, recruiter.codeParrain);
    const before = await snapshot();
    expect(await assign(source.id, recruiter.telephone)).toEqual(result);
    expect(await assign(source.id, recruiter.member.matricule)).toEqual(result);
    expect(await assign(source.id, recruiter.codeParrain)).toEqual(result);
    expect(await snapshot()).toEqual(before);
  });

  it.each(['recruiter', 'reason', 'actor'])('returns 409 for a changed %s on an attributed client', async changed => {
    const recruiter = await active();
    const alternative = await active();
    const source = await client('EN_COURS');
    await assign(source.id, recruiter.codeParrain);
    const before = await snapshot();
    await expect(assign(source.id, changed === 'recruiter' ? alternative.codeParrain : recruiter.codeParrain,
      changed === 'actor' ? otherAdmin : admin, changed === 'reason' ? 'Different approved reason' : reason))
      .rejects.toBeInstanceOf(ConflictException);
    expect(await snapshot()).toEqual(before);
  });

  it('concurrent identical assignments return one history and one member placement', async () => {
    const recruiter = await active();
    const source = await client();
    const results = await Promise.all(Array.from({ length: 3 }, () => assign(source.id, recruiter.codeParrain)));
    expect(results[1]).toEqual(results[0]);
    expect(results[2]).toEqual(results[0]);
    expect(await history(source.id)).toHaveLength(1);
    expect(await prisma.membre.count({ where: { clientId: source.id } })).toBe(1);
    const member = await memberFor(source.id);
    expect(await prisma.placementHistory.count({ where: { memberId: member.id } })).toBe(1);
    expect(await prisma.position.count({ where: { filleulId: member.id } })).toBe(1);
    expect(await memberFor(recruiter.id)).toMatchObject({ totalDescendants: 1 });
  }, 30000);

  it('concurrent competing recruiters produce one winner and a 409 with consistent attribution', async () => {
    const recruiters = [await active(), await active()];
    const source = await client();
    const outcomes = await Promise.allSettled(recruiters.map(recruiter => assign(source.id, recruiter.codeParrain)));
    expect(outcomes.filter(outcome => outcome.status === 'fulfilled')).toHaveLength(1);
    const rejected = outcomes.find(outcome => outcome.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(ConflictException);
    const saved = await history(source.id);
    expect(saved).toHaveLength(1);
    const winner = recruiters.find(recruiter => recruiter.id === saved[0].parrainClientId);
    expect(winner).toBeDefined();
    const loser = recruiters.find(recruiter => recruiter.id !== saved[0].parrainClientId);
    const member = await memberFor(source.id);
    expect(member.parrainId).toBe(winner.member.id);
    expect(await prisma.client.findUnique({ where: { id: source.id } })).toMatchObject({ parrainClientId: winner.id });
    expect(await position(member.id)).toMatchObject({ matrix: { membreId: winner.member.id } });
    expect(await prisma.placementHistory.count({ where: { memberId: member.id } })).toBe(1);
    expect(await memberFor(loser.id)).toMatchObject({ totalDescendants: 0 });
  }, 30000);

  it('serializes reciprocal assignments so concurrent requests cannot introduce a cycle', async () => {
    const first = await client('EN_COURS');
    const second = await client('EN_COURS');
    const outcomes = await Promise.allSettled([
      assign(first.id, second.codeParrain), assign(second.id, first.codeParrain),
    ]);
    expect(outcomes.filter(outcome => outcome.status === 'fulfilled')).toHaveLength(1);
    const rejected = outcomes.find(outcome => outcome.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(BadRequestException);
    expect([...(await history(first.id)), ...(await history(second.id))]).toHaveLength(1);
    const clients = await prisma.client.findMany({ where: { id: { in: [first.id, second.id] } } });
    expect(clients.filter(person => person.parrainClientId === null)).toHaveLength(1);
    expect(await prisma.parrainClaim.count({ where: { filleulClientId: { in: [first.id, second.id] } } })).toBe(1);
  }, 30000);

  it('rolls back attribution, activation, placement and finance when placement fails after writing', async () => {
    const recruiter = await active();
    for (let index = 0; index < 3; index++) await recruit(recruiter);
    const source = await client();
    class FailingPlacement extends MlmPlacementService {
      async place(transaction: Prisma.TransactionClient, memberId: string, recruiterId: string, actorId?: string): Promise<never> {
        await super.place(transaction, memberId, recruiterId, actorId);
        throw new Error('Injected failure after real placement');
      }
    }
    const failingPlacement = new FailingPlacement(prisma as PrismaService);
    const failingMatrix = makeMatrix(failingPlacement);
    const failingClaims = new MlmClaimService(prisma as PrismaService, failingMatrix);
    const failingService = new ClientParrainService(prisma as PrismaService, failingMatrix, failingClaims, failingPlacement);
    const before = await snapshot();
    await expect(failingService.assign(source.id, { codeParrain: recruiter.codeParrain, reason }, admin))
      .rejects.toThrow('Injected failure after real placement');
    expect(await snapshot()).toEqual(before);
    expect(await prisma.membre.findUnique({ where: { clientId: source.id } })).toBeNull();
    expect(await history(source.id)).toEqual([]);
    await assign(source.id, recruiter.codeParrain);
    expect(await history(source.id)).toHaveLength(1);
  });

  it('creates only one pending commission for a newly complete generation and no wallet credit on replay', async () => {
    const recruiter = await active();
    for (let index = 0; index < 3; index++) await recruit(recruiter);
    expect(await prisma.commission.count({ where: { membreId: recruiter.member.id } })).toBe(0);
    const source = await client();
    const journalBefore = await prisma.transactionPortefeuille.count();
    const walletBefore = await prisma.portefeuille.findUnique({ where: { membreId: recruiter.member.id } });
    const result = await assign(source.id, recruiter.codeParrain);
    const commissions = await prisma.commission.findMany({ where: { membreId: recruiter.member.id } });
    expect(commissions).toHaveLength(1);
    expect(commissions[0]).toMatchObject({ statut: 'EN_ATTENTE', mlmLevelId: 1, referenceId: `generation:${recruiter.member.id}:1` });
    expect(Number(commissions[0].montant)).toBe(40);
    expect(Number(commissions[0].montantSysteme)).toBe(24);
    expect(Number(commissions[0].montantRetour)).toBe(16);
    expect(await prisma.portefeuille.findUnique({ where: { membreId: recruiter.member.id } })).toEqual(walletBefore);
    expect(await prisma.transactionPortefeuille.count()).toBe(journalBefore);
    const beforeReplay = await snapshot();
    expect(await assign(source.id, recruiter.telephone)).toEqual(result);
    expect(await snapshot()).toEqual(beforeReplay);
  });
});
