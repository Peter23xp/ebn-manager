import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { NotFoundException } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import { Client, Pool } from 'pg';
import { PrismaService } from '../../prisma/prisma.service';
import { MlmMatrixService } from '../mlm/mlm-matrix.service';
import { PortalService } from './portal.service';

const native = process.env.PORTAL_TREE_TEST_PG_BIN ? describe : describe.skip;

native('Portal network tree with isolated native PostgreSQL', () => {
  let directory: string;
  let started = false;
  let pool: Pool;
  let readerPool: Pool;
  let prisma: PrismaClient;
  let service: PortalService;
  let matrix: MlmMatrixService;
  const pgBin = process.env.PORTAL_TREE_TEST_PG_BIN;
  const members = [
    ['ancestor', null, null],
    ['own', 'ancestor', 'ancestor'],
    ['sibling', 'ancestor', 'ancestor'],
    ['unrelated', null, null],
    ['matrix-child', 'unrelated', 'own'],
    ['spillover', 'unrelated', 'matrix-child'],
    ['deep-child', 'unrelated', 'spillover'],
    ['personal', 'own', 'unrelated'],
    ['mixed-child', 'unrelated', 'personal'],
    ['mixed-referral', 'mixed-child', null],
    ['mixed-matrix', 'unrelated', 'mixed-referral'],
    ['cycle-a', 'cycle-b', null],
    ['cycle-b', 'cycle-a', 'cycle-a'],
    ['reachable-cycle-a', 'reachable-cycle-b', 'own'],
    ['reachable-cycle-b', 'reachable-cycle-a', null],
    ['moving', 'unrelated', 'own'],
    ['moving-child', 'unrelated', 'moving'],
  ];

  function postgres(command: string, args: string[]) {
    return execFileSync(path.join(pgBin, command), args, { windowsHide: true, stdio: command === 'pg_ctl' ? 'ignore' : 'pipe', timeout: 30000 });
  }

  beforeAll(async () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ebn-portal-tree-'));
    const listener = net.createServer();
    await new Promise<void>(resolve => listener.listen(0, '127.0.0.1', resolve));
    const port = (listener.address() as net.AddressInfo).port;
    await new Promise<void>((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
    postgres('initdb', ['-D', directory, '-U', 'postgres', '--auth=trust', '--encoding=UTF8', '--no-locale']);
    postgres('pg_ctl', ['-D', directory, '-l', path.join(directory, 'server.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', 'start']);
    started = true;
    const connectionString = `postgresql://postgres@127.0.0.1:${port}/postgres`;
    const fixture = new Client({ connectionString });
    await fixture.connect();
    try {
      const migrations = path.resolve(__dirname, '../../../prisma/migrations');
      for (const migration of fs.readdirSync(migrations).sort()) {
        const sql = path.join(migrations, migration, 'migration.sql');
        if (fs.existsSync(sql)) await fixture.query(fs.readFileSync(sql, 'utf8'));
      }
      await fixture.query(`
        INSERT INTO sites (id, nom, ville, "updatedAt") VALUES ('site', 'Fixture', 'Local', now());
        INSERT INTO utilisateurs (id, nom, telephone, "passwordHash", role, "updatedAt")
          VALUES ('admin', 'Fixture', 'local-admin', 'test-only', 'SUPER_ADMIN', now());
        INSERT INTO mlm_levels (ordre, nom, "commissionParFilleul", "commissionTotale", "bonusDescription", couleur, icone, "updatedAt")
          VALUES (1, 'Fixture', 10, 40, 'Fixture', '#000000', 'fixture', now());
      `);
      for (const [memberId] of [...members, ['no-member']]) {
        await fixture.query(`INSERT INTO clients (id, prenom, nom, telephone, statut, "siteInscriptionId", "createdById", "updatedAt")
          VALUES ($1, 'Test', $2, $1, 'ACTIF', 'site', 'admin', now())`, [`client-${memberId}`, memberId]);
      }
      for (const [memberId] of members) {
        await fixture.query('INSERT INTO membres (id, "clientId", matricule) VALUES ($1, $2, $1)', [memberId, `client-${memberId}`]);
        await fixture.query('INSERT INTO matrices (id, "membreId", "mlmLevelId") VALUES ($1, $2, 1)', [`matrix-${memberId}`, memberId]);
        for (const slot of [1, 2, 3, 4]) {
          await fixture.query('INSERT INTO positions (id, "matrixId", "numeroPosition") VALUES ($1, $2, $3)', [`slot-${memberId}-${slot}`, `matrix-${memberId}`, slot]);
        }
      }
      const nextSlots = new Map<string, number>();
      for (const [memberId, recruiterId, parentId] of members) {
        await fixture.query('UPDATE membres SET "parrainId" = $1 WHERE id = $2', [recruiterId, memberId]);
        if (parentId) {
          const slot = (nextSlots.get(parentId) ?? 0) + 1;
          nextSlots.set(parentId, slot);
          await fixture.query('UPDATE positions SET "filleulId" = $1 WHERE id = $2', [memberId, `slot-${parentId}-${slot}`]);
        }
      }
      await fixture.query(`CREATE ROLE portal_reader LOGIN;
        GRANT USAGE ON SCHEMA public TO portal_reader;
        GRANT SELECT ON ALL TABLES IN SCHEMA public TO portal_reader;
        ALTER ROLE portal_reader SET statement_timeout = '3s'`);
    } finally { await fixture.end(); }
    pool = new Pool({ connectionString });
    readerPool = new Pool({ connectionString: `postgresql://portal_reader@127.0.0.1:${port}/postgres` });
    prisma = new PrismaClient({ adapter: new PrismaPg(readerPool) });
    await prisma.$connect();
    matrix = new MlmMatrixService(prisma as PrismaService, {} as never);
    service = new PortalService(prisma as PrismaService, {} as never, matrix);
  }, 90000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await readerPool?.end();
    await pool?.end();
    if (started || (directory && fs.existsSync(path.join(directory, 'postmaster.pid')))) {
      postgres('pg_ctl', ['-D', directory, '-m', 'fast', '-w', 'stop']);
    }
    if (directory) {
      const resolved = fs.realpathSync(directory);
      if (path.dirname(resolved) !== fs.realpathSync(os.tmpdir()) || !/^ebn-portal-tree-/.test(path.basename(resolved))) {
        throw new Error('Unsafe portal test cleanup path');
      }
      fs.rmSync(resolved, { recursive: true });
    }
  }, 30000);

  async function read(memberId: string, depth?: number, clientId = 'client-own') {
    return service.getNetworkTree(clientId, memberId, depth);
  }

  it.each(['own', 'matrix-child', 'spillover', 'deep-child', 'personal', 'mixed-child', 'mixed-referral', 'mixed-matrix'])(
    'allows own or downstream member %s through union paths', async memberId => {
      const tree = await read(memberId);
      expect(tree.id).toBe(memberId);
      expect(tree.generation).toBe(0);
      expect(tree).toEqual(await matrix.getNetworkTree(memberId, 2));
    },
  );

  it.each(['unrelated', 'ancestor', 'sibling', 'missing', "own' OR true --"])(
    'denies %s without disclosing a tree', async memberId => {
      await expect(read(memberId)).rejects.toBeInstanceOf(NotFoundException);
    },
  );

  it('does not create a member or wallet for an active client without a member', async () => {
    await expect(read('own', 2, 'client-no-member')).rejects.toBeInstanceOf(NotFoundException);
    expect(await prisma.membre.findUnique({ where: { clientId: 'client-no-member' } })).toBeNull();
    expect(await prisma.portefeuille.count()).toBe(0);
  });

  it('binds the authenticated identity rather than interpolating it into SQL', async () => {
    await expect(read('unrelated', 2, "client-own' OR true --")).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each([0, 1, 2])('returns a bounded tree at depth %s', async depth => {
    const tree = await read('matrix-child', depth);
    expect(tree.id).toBe('matrix-child');
    if (depth === 0) {
      expect(tree.children).toEqual([]);
      expect(tree.hasMore).toBe(true);
    } else {
      expect(tree.children.map(child => child.id)).toEqual(['spillover']);
      expect(tree.children[0].children.map(child => child.id)).toEqual(depth === 1 ? [] : ['deep-child']);
      expect(tree.children[0].hasMore).toBe(depth === 1);
    }
  });

  it('terminates on an unrelated mixed recruiter/matrix cycle', async () => {
    await expect(read('cycle-b')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('allows a cycle with a valid upward path to the owner', async () => {
    expect((await read('reachable-cycle-b')).id).toBe('reachable-cycle-b');
  });

  it('keeps authorization and tree data on one RepeatableRead snapshot during a move', async () => {
    let isolation: string;
    const concurrentMatrix = {
      getNetworkTree: async (memberId: string, depth: number, transaction: Prisma.TransactionClient) => {
        expect(transaction).toBeDefined();
        const rows = await transaction.$queryRaw<Array<{ transaction_isolation: string }>>`SHOW transaction_isolation`;
        isolation = rows[0].transaction_isolation;
        await pool.query(`UPDATE positions SET "filleulId" = NULL WHERE "filleulId" IN ('moving', 'moving-child')`);
        await pool.query(`UPDATE positions SET "filleulId" = 'moving' WHERE id = 'slot-unrelated-2'`);
        await pool.query(`UPDATE positions SET "filleulId" = 'moving-child' WHERE id = 'slot-unrelated-3'`);
        return matrix.getNetworkTree(memberId, depth, transaction);
      },
    };
    const concurrentService = new PortalService(prisma as PrismaService, {} as never, concurrentMatrix as never);
    const tree = await concurrentService.getNetworkTree('client-own', 'moving', 1);
    expect(isolation).toBe('repeatable read');
    expect(tree.matrixParent.id).toBe('own');
    expect(tree.children.map(child => child.id)).toEqual(['moving-child']);
    await expect(read('moving', 1)).rejects.toBeInstanceOf(NotFoundException);
  });
});
