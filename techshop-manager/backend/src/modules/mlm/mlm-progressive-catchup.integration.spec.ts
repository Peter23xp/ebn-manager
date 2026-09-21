import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Client, Pool } from 'pg';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { applyCatchupEntry, previewCatchupPage, runCatchup } from '../../../scripts/mlm-progressive-catchup';
import * as maintenance from '../../../scripts/maintenance';

jest.setTimeout(60000);

const url = 'postgresql://postgres@127.0.0.1:55432/mlm_integration';
const integration = process.env.CATCHUP_TEST_DATABASE_URL ? describe : describe.skip;
const prefix = `zzcatchup-${randomUUID()}`;

function nativeRestoreConfig(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error('DEDICATED_LOCAL_RESTORE_REQUIRED');
  const fields = value as Record<string, unknown>;
  const allowed = ['host', 'port', 'database', 'user', 'password'];
  if (Object.keys(fields).length !== allowed.length || Object.keys(fields).some(key => !allowed.includes(key))
    || fields.host !== '127.0.0.1' || fields.port !== 55433 || fields.database !== 'postgres'
    || fields.user !== 'ebn_restore_operator' || typeof fields.password !== 'string' || !fields.password.length
    || fields.password.includes('\0')) throw new Error('DEDICATED_LOCAL_RESTORE_REQUIRED');
  return Object.freeze({ host: '127.0.0.1', port: 55433, database: 'postgres', user: 'ebn_restore_operator',
    password: fields.password, ssl: false as const, options: '-c timezone=UTC -c datestyle=ISO,YMD',
    application_name: 'ebn-catchup-native-test', connectionTimeoutMillis: 10000 });
}

function nativeRestoreFixture(readCredentials: () => unknown) {
  let credentials: ReturnType<typeof nativeRestoreConfig>;
  const databases: string[] = [];
  return {
    initialize() {
      if (credentials) throw new Error('RESTORE_FIXTURE_ALREADY_INITIALIZED');
      credentials = nativeRestoreConfig(readCredentials());
    },
    async fresh() {
      const name = `ebn_restore_${randomUUID().replace(/-/g, '')}`;
      if (!credentials) throw new Error('DEDICATED_LOCAL_RESTORE_REQUIRED');
      const client = new Client(credentials);
      await client.connect();
      try {
        await client.query(`CREATE DATABASE "${name}"`);
        databases.push(name);
        await client.query(`REVOKE CONNECT ON DATABASE "${name}" FROM PUBLIC`);
      } finally { await client.end(); }
      return `postgresql://${encodeURIComponent(credentials.user)}:${encodeURIComponent(credentials.password)}@127.0.0.1:55433/${name}?sslmode=disable`;
    },
    async cleanup() {
      if (credentials && databases.length) {
        if (databases.some(name => !/^ebn_restore_[a-f0-9]+$/.test(name))) throw new Error('UNSAFE_TEST_CLEANUP');
        const cleanup = new Client(credentials);
        await cleanup.connect();
        try {
          while (databases.length) {
            const name = databases[databases.length - 1];
            await cleanup.query(`DROP DATABASE IF EXISTS "${name}"`);
            databases.pop();
          }
        } finally { await cleanup.end(); }
      }
    },
  };
}

describe('native catch-up fixture guards without database access', () => {
  const local = { host: '127.0.0.1', port: 55433, database: 'postgres', user: 'ebn_restore_operator', password: 'synthetic-only' };

  it.each([
    { connectionString: 'postgresql://synthetic:synthetic@production.example.invalid:5432/production' },
    { ssl: true }, { options: '-c search_path=untrusted' }, { stream: {} }, { application_name: 'untrusted' },
  ])('rejects unapproved connection options %j', override => {
    expect(() => nativeRestoreConfig({ ...local, ...override })).toThrow('DEDICATED_LOCAL_RESTORE_REQUIRED');
  });

  it.each([
    { host: 'production.example.invalid' }, { port: '55433' }, { database: 'production' },
    { user: 'postgres' }, { password: {} },
  ])('rejects invalid target or authentication fields %j', override => {
    expect(() => nativeRestoreConfig({ ...local, ...override })).toThrow('DEDICATED_LOCAL_RESTORE_REQUIRED');
  });

  it('preserves the literal-loopback effective pg target without extra options', () => {
    const config = nativeRestoreConfig(local);
    const ConnectionParameters = require('pg/lib/connection-parameters');
    const effective = new ConnectionParameters(config);
    expect({ host: effective.host, port: effective.port, database: effective.database, user: effective.user, ssl: effective.ssl })
      .toEqual({ host: '127.0.0.1', port: 55433, database: 'postgres', user: 'ebn_restore_operator', ssl: false });
    expect(config).not.toHaveProperty('connectionString');
  });

  it.each([
    { ...local, host: 'production.example.invalid', port: 5432, database: 'production' },
    { ...local, connectionString: 'postgresql://synthetic:synthetic@production.example.invalid:5432/production' },
  ])('does not connect during teardown after rejected setup %j', rejected => {
    const fixture = nativeRestoreFixture(() => rejected);
    const connect = jest.spyOn(Client.prototype, 'connect').mockImplementation(() => { throw new Error('UNEXPECTED_CONNECTION'); });
    return (async () => {
      try {
        expect(() => fixture.initialize()).toThrow('DEDICATED_LOCAL_RESTORE_REQUIRED');
        await fixture.cleanup();
        expect(connect).not.toHaveBeenCalled();
      } finally { connect.mockRestore(); }
    })();
  });

  it('does not connect during cleanup when valid setup allocated no databases', async () => {
    const fixture = nativeRestoreFixture(() => local);
    const connect = jest.spyOn(Client.prototype, 'connect').mockImplementation(() => { throw new Error('UNEXPECTED_CONNECTION'); });
    try {
      fixture.initialize();
      await fixture.cleanup();
      expect(connect).not.toHaveBeenCalled();
    } finally { connect.mockRestore(); }
  });

  it('does not retry a failed allocation connection during cleanup', async () => {
    const fixture = nativeRestoreFixture(() => local);
    const connect = jest.spyOn(Client.prototype, 'connect').mockImplementation(() => { throw new Error('SYNTHETIC_CONNECTION_FAILURE'); });
    try {
      fixture.initialize();
      await expect(fixture.fresh()).rejects.toThrow('SYNTHETIC_CONNECTION_FAILURE');
      await fixture.cleanup();
      expect(connect).toHaveBeenCalledTimes(1);
    } finally { connect.mockRestore(); }
  });
});

integration('catch-up transactions on prefixed synthetic PostgreSQL rows', () => {
  let prisma: PrismaClient;
  let pool: Pool;
  let levelId: number;
  let sequence = 0;
  const adminId = `${prefix}-admin`;
  const siteId = `${prefix}-site`;
  const event = { id: randomUUID(), actorId: adminId, origin: 'CATCH_UP' as const };

  beforeAll(async () => {
    if (process.env.CATCHUP_TEST_DATABASE_URL !== url) throw new Error('EXACT_SYNTHETIC_DATABASE_REQUIRED');
    pool = new Pool({ connectionString: url, application_name: prefix });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
    levelId = (await prisma.mlmLevel.findUniqueOrThrow({ where: { ordre: 1 } })).id;
    await prisma.utilisateur.create({ data: { id: adminId, nom: 'Catchup synthetic', telephone: adminId,
      passwordHash: 'synthetic', role: 'SUPER_ADMIN' } });
    await prisma.site.create({ data: { id: siteId, nom: 'Catchup synthetic', ville: 'Test' } });
  });

  afterAll(async () => {
    if (prisma) {
      const members = { membreId: { startsWith: prefix } };
      await prisma.$transaction(async tx => {
        await tx.commission.deleteMany({ where: members });
        await tx.promotion.deleteMany({ where: members });
        await tx.bonusAttribue.deleteMany({ where: members });
        await tx.position.deleteMany({ where: { matrixId: { startsWith: prefix } } });
        await tx.matrix.deleteMany({ where: { id: { startsWith: prefix } } });
        await tx.portefeuille.deleteMany({ where: members });
        await tx.membre.deleteMany({ where: { id: { startsWith: prefix } } });
        await tx.client.deleteMany({ where: { id: { startsWith: prefix } } });
        await tx.site.deleteMany({ where: { id: siteId } });
        await tx.utilisateur.deleteMany({ where: { id: adminId } });
      }, { maxWait: 5000, timeout: 30000 });
    }
    await prisma?.$disconnect();
    await pool?.end();
  });

  async function fixture(valid = 1, zero = false) {
    const id = `${prefix}-${String(++sequence).padStart(3, '0')}`;
    await prisma.client.create({ data: { id, nom: 'Catchup', prenom: 'Synthetic', telephone: id,
      siteInscriptionId: siteId, createdById: adminId } });
    await prisma.membre.create({ data: { id, clientId: id, matricule: id, mlmLevelId: levelId } });
    await prisma.portefeuille.create({ data: { membreId: id, soldeDisponible: '123.45' } });
    await prisma.matrix.create({ data: { id, membreId: id, mlmLevelId: levelId, filleulsValides: valid,
      ...(zero ? { commissionPolicyVersion: 'v1', commissionBudgetTotal: 0, commissionBudgetImmediate: 0, commissionBudgetHeld: 0 } : {}) } });
    return id;
  }

  async function approved(id: string) {
    const page = await previewCatchupPage(prisma, { after: id.slice(0, -3) + String(Number(id.slice(-3)) - 1).padStart(3, '0'), limit: 1 });
    expect(page.entries[0].matrixId).toBe(id);
    return page.entries[0];
  }

  it('paginates read-only previews without initializing matrices or changing wallets', async () => {
    const first = await fixture();
    const second = await fixture(2);
    const before = await prisma.matrix.findUniqueOrThrow({ where: { id: first } });
    const page = await previewCatchupPage(prisma, { after: `${prefix}-000`, limit: 1 });
    expect(page.entries).toHaveLength(1);
    expect(page.entries[0].preview.proposed).toEqual({ total: '10.00', immediate: '6.00', held: '4.00' });
    expect(page.nextAfter).toBe(first);
    expect((await previewCatchupPage(prisma, { after: page.nextAfter, limit: 1 })).entries[0].matrixId).toBe(second);
    expect(await prisma.matrix.findUniqueOrThrow({ where: { id: first } })).toEqual(before);
    expect(await prisma.commission.count({ where: { matrixId: first } })).toBe(0);
    expect((await prisma.portefeuille.findUniqueOrThrow({ where: { membreId: first } })).soldeDisponible.toFixed(2)).toBe('123.45');
    await expect(previewCatchupPage(prisma, { limit: 201 })).rejects.toThrow();
  });

  it('reports unknown historical references and refuses to apply them', async () => {
    const id = await fixture();
    await prisma.commission.create({ data: { membreId: id, mlmLevelId: levelId, matrixId: id, referenceId: `${id}-unknown`,
      montant: 10, montantSysteme: 6, montantRetour: 4, description: 'Unknown synthetic history' } });
    const entry = await approved(id);
    expect(entry.preview).toBeNull();
    expect(entry.error).toBeTruthy();
    await expect(applyCatchupEntry(prisma, entry, event)).rejects.toThrow();
    expect(await prisma.commission.count({ where: { matrixId: id } })).toBe(1);
  });

  it('creates pending money only and recovers after commit without an output receipt', async () => {
    const id = await fixture();
    const entry = await approved(id);
    expect((await applyCatchupEntry(prisma, entry, event)).status).toBe('created');
    expect((await applyCatchupEntry(prisma, entry, event)).status).toBe('already-applied');
    const rows = await prisma.commission.findMany({ where: { matrixId: id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ statut: 'EN_ATTENTE', filleulId: null, positionId: null,
      generationEventId: event.id, generationActorId: adminId, progressFrom: 0, progressTo: 1 });
    expect(rows[0].montant.toFixed(2)).toBe('10.00');
    expect((await prisma.portefeuille.findUniqueOrThrow({ where: { membreId: id } })).soldeDisponible.toFixed(2)).toBe('123.45');
    expect(await prisma.reinvestLote.count({ where: { membreId: id } })).toBe(0);
  });

  it('rejects stale counters and unauthorized actors before accounting', async () => {
    const id = await fixture();
    const entry = await approved(id);
    await prisma.matrix.update({ where: { id }, data: { filleulsValides: 2 } });
    await expect(applyCatchupEntry(prisma, entry, event)).rejects.toThrow(/perime/);
    await expect(applyCatchupEntry(prisma, entry, { ...event, actorId: 'missing' })).rejects.toThrow('SUPER_ADMIN_REQUIRED');
    expect(await prisma.commission.count({ where: { matrixId: id } })).toBe(0);
  });

  it('does not blindly skip a changed previously-created row', async () => {
    const id = await fixture();
    const entry = await approved(id);
    await applyCatchupEntry(prisma, entry, event);
    await prisma.commission.updateMany({ where: { matrixId: id }, data: { statut: 'ANNULEE' } });
    await expect(applyCatchupEntry(prisma, entry, event)).rejects.toThrow();
  });

  it('rechecks after waiting for the same matrix advisory lock', async () => {
    const id = await fixture();
    const entry = await approved(id);
    let release: () => void;
    let locked: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const acquired = new Promise<void>(resolve => { locked = resolve; });
    const writer = prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(604008)`;
      locked();
      await gate;
      await tx.matrix.update({ where: { id }, data: { filleulsValides: 2 } });
    });
    await acquired;
    const catchup = applyCatchupEntry(prisma, entry, event);
    const rejected = expect(catchup).rejects.toThrow(/perime/);
    try {
      let waiting = false;
      for (let attempt = 0; attempt < 30 && !waiting; attempt++) {
        waiting = (await pool.query(`SELECT EXISTS (SELECT 1 FROM pg_stat_activity
          WHERE application_name = $1 AND wait_event_type = 'Lock' AND wait_event = 'advisory') AS waiting`, [prefix])).rows[0].waiting;
        if (!waiting) await new Promise(resolve => setTimeout(resolve, 50));
      }
      expect(waiting).toBe(true);
    } finally { release(); }
    await writer;
    await rejected;
    expect(await prisma.commission.count({ where: { matrixId: id } })).toBe(0);
  });

  it('normalizes zero-money progress but still detects changed promotion history', async () => {
    const id = await fixture(1, true);
    const entry = await approved(id);
    expect((await applyCatchupEntry(prisma, entry, event)).status).toBe('accounted');
    expect((await applyCatchupEntry(prisma, entry, event)).status).toBe('already-applied');
    expect(await prisma.commission.count({ where: { matrixId: id } })).toBe(0);
    await prisma.promotion.create({ data: { membreId: id, niveauAvantId: levelId, niveauApresId: levelId,
      commissionVersee: 0, declencheParId: adminId } });
    await expect(applyCatchupEntry(prisma, entry, event)).rejects.toThrow();
  });

  it('initializes legitimate legacy history once without a new commission', async () => {
    const id = await fixture();
    await prisma.commission.create({ data: { membreId: id, mlmLevelId: levelId, matrixId: id,
      referenceId: `generation:${id}:${levelId}`, montant: 40, montantSysteme: 24, montantRetour: 16,
      statut: 'ANNULEE', description: 'Legacy synthetic' } });
    await prisma.promotion.create({ data: { membreId: id, niveauAvantId: levelId, niveauApresId: levelId,
      commissionVersee: 40, declencheParId: adminId } });
    const level = await prisma.mlmLevel.findUniqueOrThrow({ where: { id: levelId } });
    if (level.bonusDescription) await prisma.bonusAttribue.create({ data: { membreId: id, mlmLevelId: levelId, description: level.bonusDescription } });
    const entry = await approved(id);
    expect(entry.preview.accountedPositions).toBe(4);
    expect((await applyCatchupEntry(prisma, entry, event)).status).toBe('accounted');
    expect((await applyCatchupEntry(prisma, entry, event)).status).toBe('already-applied');
    expect(await prisma.commission.count({ where: { matrixId: id } })).toBe(1);
    await prisma.commission.updateMany({ where: { matrixId: id }, data: { notes: 'Changed legacy history' } });
    await expect(applyCatchupEntry(prisma, entry, event)).rejects.toThrow();
  });
});

const nativeIntegration = process.env.CATCHUP_TEST_PG_BIN ? describe : describe.skip;

nativeIntegration('complete catch-up workflow with a genuine private native restore', () => {
  const database = `ebn_catchup_test_${randomUUID().replace(/-/g, '')}`;
  const sourceUrl = `postgresql://postgres@127.0.0.1:55432/${database}`;
  const privateRoot = path.join(os.tmpdir(), `ebn-catchup-${randomUUID()}`);
  const pgBin = process.env.CATCHUP_TEST_PG_BIN;
  const restore = nativeRestoreFixture(() => {
    if (!process.env.CATCHUP_TEST_RESTORE_CREDENTIALS) throw new Error('PRIVATE_RESTORE_CREDENTIALS_REQUIRED');
    return JSON.parse(fs.readFileSync(process.env.CATCHUP_TEST_RESTORE_CREDENTIALS, 'utf8'));
  });
  let bootstrap: Client;
  let sourceAllocated = false;

  async function sourceQuery(sql: string) {
    const client = new Client({ connectionString: sourceUrl });
    await client.connect();
    try { return await client.query(sql); } finally { await client.end(); }
  }

  async function freshRestore() {
    return restore.fresh();
  }

  beforeAll(async () => {
    restore.initialize();
    bootstrap = new Client({ connectionString: 'postgresql://postgres@127.0.0.1:55432/postgres' });
    await bootstrap.connect();
    await bootstrap.query(`CREATE DATABASE "${database}"`);
    sourceAllocated = true;
    await bootstrap.query(`REVOKE CONNECT ON DATABASE "${database}" FROM PUBLIC`);
    const migrations = path.resolve(__dirname, '../../../prisma/migrations');
    for (const migration of fs.readdirSync(migrations).sort()) {
      const filename = path.join(migrations, migration, 'migration.sql');
      if (fs.existsSync(filename)) await sourceQuery(fs.readFileSync(filename, 'utf8'));
    }
    await sourceQuery(`
      INSERT INTO sites (id, nom, ville, "updatedAt") VALUES ('catchup-site', 'Synthetic', 'Local', now());
      INSERT INTO utilisateurs (id, nom, telephone, "passwordHash", role, "updatedAt")
        VALUES ('catchup-admin', 'Synthetic', 'catchup-admin', 'synthetic-password-hash', 'SUPER_ADMIN', now());
      INSERT INTO config_generale (id, "updatedAt") VALUES ('catchup-config', now());
      INSERT INTO mlm_levels (ordre, nom, "commissionParFilleul", "commissionTotale", "commissionSysteme", "commissionRetour", "bonusDescription", couleur, icone, "updatedAt")
        VALUES (1, 'Builder', 10, 40, 24, 16, '', '#000000', 'fixture', now());
      INSERT INTO clients (id, prenom, nom, telephone, "siteInscriptionId", "createdById", "updatedAt") VALUES
        ('catchup-owner', 'Synthetic', 'Owner', 'catchup-owner', 'catchup-site', 'catchup-admin', now()),
        ('catchup-child', 'Synthetic', 'Child', 'catchup-child', 'catchup-site', 'catchup-admin', now());
      INSERT INTO membres (id, "clientId", matricule, "mlmLevelId", "totalDescendants") VALUES
        ('catchup-owner', 'catchup-owner', 'catchup-owner', 1, 1), ('catchup-child', 'catchup-child', 'catchup-child', 1, 0);
      INSERT INTO matrices (id, "membreId", "mlmLevelId", "filleulsValides", "occupiedPositions") VALUES
        ('catchup-owner-matrix', 'catchup-owner', 1, 1, 1), ('catchup-child-matrix', 'catchup-child', 1, 0, 0);
      INSERT INTO positions (id, "matrixId", "numeroPosition", "filleulId", "estValide")
        VALUES ('catchup-position', 'catchup-owner-matrix', 1, 'catchup-child', true);
      INSERT INTO portefeuilles (id, "membreId", "soldeDisponible", "updatedAt")
        VALUES ('catchup-wallet', 'catchup-owner', 123.45, now());
    `);
  }, 120000);

  afterAll(async () => {
    if (bootstrap) {
      try {
        if (sourceAllocated) {
          if (!/^ebn_catchup_test_[a-f0-9]+$/.test(database)) throw new Error('UNSAFE_TEST_CLEANUP');
          await bootstrap.query(`DROP DATABASE IF EXISTS "${database}"`);
        }
      } finally { await bootstrap.end(); }
    }
    await restore.cleanup();
  }, 30000);

  it('rejects unsafe live catalog/schema before apply and resume, then completes the genuine backup workflow without wallet writes', async () => {
    const environment = { CATCHUP_SOURCE_URL: sourceUrl, CATCHUP_RESTORE_URL: await freshRestore() };
    const previewFile = path.join(privateRoot, 'preview.json');
    const before = (await sourceQuery('SELECT to_jsonb(matrix) AS value FROM matrices matrix ORDER BY id')).rows;
    const originalRead = fs.readFileSync;
    const read = jest.spyOn(fs, 'readFileSync').mockImplementation(((filename, ...args) => {
      if (typeof filename === 'string' && path.basename(filename) === '.env') throw new Error('DOTENV_MUST_NOT_BE_READ');
      return originalRead(filename, ...args);
    }) as typeof fs.readFileSync);
    try { await runCatchup(['--output', previewFile], environment); }
    finally { read.mockRestore(); }
    const preview = JSON.parse(fs.readFileSync(previewFile, 'utf8'));
    expect(preview.entries.find(entry => entry.matrixId === 'catchup-owner-matrix').preview.proposed.total).toBe('10.00');
    expect((await sourceQuery('SELECT to_jsonb(matrix) AS value FROM matrices matrix ORDER BY id')).rows).toEqual(before);
    expect(JSON.stringify(preview)).not.toContain('synthetic-password-hash');
    expect(JSON.stringify(preview)).not.toContain('postgresql://');

    const argumentsFor = (bundle: string, output: string) => ['--mode', 'apply', '--execute', '--preview', previewFile,
      '--fingerprint', preview.targetFingerprint, '--bundle', bundle, '--pg-bin', pgBin, '--actor-id', 'catchup-admin', '--output', path.join(privateRoot, output)];
    await expect(runCatchup(argumentsFor(path.join(privateRoot, 'missing'), 'missing-result.json'), environment)).rejects.toThrow();
    await expect(runCatchup(['--output', path.join(privateRoot, 'wrong-target.json'), '--fingerprint', 'wrong'], environment))
      .rejects.toThrow('TARGET_FINGERPRINT_MISMATCH');
    const backupFile = path.join(privateRoot, 'backup.json');
    await runCatchup(['--mode', 'backup', '--fingerprint', preview.targetFingerprint, '--pg-bin', pgBin,
      '--actor-id', 'catchup-admin', '--backup-root', path.join(privateRoot, 'bundles'), '--output', backupFile], environment);
    const bundle = JSON.parse(fs.readFileSync(backupFile, 'utf8')).bundle;
    const dump = path.join(bundle, 'public.dump');
    const original = fs.readFileSync(dump);
    try {
      fs.appendFileSync(dump, 'tampered');
      await expect(runCatchup(argumentsFor(bundle, 'tampered-result.json'), environment)).rejects.toThrow('BACKUP_HASH_MISMATCH');
    } finally { fs.writeFileSync(dump, original); }
    expect((await sourceQuery('SELECT count(*)::int AS count FROM commissions')).rows[0].count).toBe(0);

    const observer = new Client({ connectionString: sourceUrl });
    await observer.connect();
    try {
      await expect(runCatchup(argumentsFor(bundle, 'not-offline.json'), environment)).rejects.toThrow('SOURCE_NOT_OFFLINE');
    } finally { await observer.end(); }

    const installTrigger = () => sourceQuery(`
      CREATE SCHEMA catchup_probe;
      CREATE FUNCTION catchup_probe.credit_wallet() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        UPDATE public.portefeuilles SET "soldeDisponible" = "soldeDisponible" + NEW."montantSysteme"
        WHERE "membreId" = NEW."membreId";
        RETURN NEW;
      END;
      $$;
      CREATE TRIGGER catchup_probe_auto_credit AFTER INSERT ON public.commissions
      FOR EACH ROW EXECUTE FUNCTION catchup_probe.credit_wallet();
    `);
    const removeTrigger = () => sourceQuery(`
      DROP TRIGGER IF EXISTS catchup_probe_auto_credit ON public.commissions;
      DROP FUNCTION IF EXISTS catchup_probe.credit_wallet();
      DROP SCHEMA IF EXISTS catchup_probe;
    `);
    const assertNoMoneyWritten = async () => {
      expect((await sourceQuery('SELECT "soldeDisponible"::text FROM portefeuilles')).rows[0].soldeDisponible).toBe('123.45');
      expect((await sourceQuery('SELECT count(*)::int AS count FROM commissions')).rows[0].count).toBe(0);
      expect((await sourceQuery('SELECT to_jsonb(matrix) AS value FROM matrices matrix ORDER BY id')).rows).toEqual(before);
    };
    await installTrigger();
    try {
      expect((await maintenance.inspectTarget(sourceUrl)).dependenciesReviewRequired).toBe(0);
      const error = await runCatchup(argumentsFor(bundle, 'unsafe-trigger.json'), environment).then(() => null, failure => failure);
      await assertNoMoneyWritten();
      expect(error?.message).toBe('UNKNOWN_TRIGGER');
    } finally { await removeTrigger(); }

    const verifyBackup = maintenance.verifyBackup;
    const verification = jest.spyOn(maintenance, 'verifyBackup').mockImplementation(async options => {
      const verified = await verifyBackup(options);
      await installTrigger();
      return verified;
    });
    try {
      await expect(runCatchup(argumentsFor(bundle, 'trigger-after-verification.json'),
        { ...environment, CATCHUP_RESTORE_URL: await freshRestore() })).rejects.toThrow('UNKNOWN_TRIGGER');
      await assertNoMoneyWritten();
    } finally {
      verification.mockRestore();
      await removeTrigger();
    }

    await runCatchup(argumentsFor(bundle, 'result.json'), environment);
    const result = JSON.parse(fs.readFileSync(path.join(privateRoot, 'result.json'), 'utf8'));
    expect(result.status).toBe('complete');
    expect(result.entries.find(entry => entry.matrixId === 'catchup-owner-matrix').status).toBe('created');
    const commissions = (await sourceQuery('SELECT statut, montant::text, "filleulId", "generationEventId" FROM commissions')).rows;
    expect(commissions).toEqual([{ statut: 'EN_ATTENTE', montant: '10.00', filleulId: null, generationEventId: preview.operationId }]);
    expect((await sourceQuery('SELECT "soldeDisponible"::text FROM portefeuilles')).rows[0].soldeDisponible).toBe('123.45');
    expect((await sourceQuery('SELECT count(*)::int AS count FROM reinvest_lots')).rows[0].count).toBe(0);
    await sourceQuery('ALTER TABLE public.portefeuilles ADD COLUMN catchup_schema_probe text');
    try {
      await expect(runCatchup(argumentsFor(bundle, 'schema-resume.json'),
        { ...environment, CATCHUP_RESTORE_URL: await freshRestore() })).rejects.toThrow('SOURCE_SCHEMA_MISMATCH');
      expect((await sourceQuery('SELECT statut, montant::text, "filleulId", "generationEventId" FROM commissions')).rows).toEqual(commissions);
      expect((await sourceQuery('SELECT "soldeDisponible"::text FROM portefeuilles')).rows[0].soldeDisponible).toBe('123.45');
    } finally { await sourceQuery('ALTER TABLE public.portefeuilles DROP COLUMN catchup_schema_probe'); }
    await sourceQuery("SELECT nextval('public.mlm_levels_id_seq')");
    await runCatchup(argumentsFor(bundle, 'resume.json'), { ...environment, CATCHUP_RESTORE_URL: await freshRestore() });
    const resumed = JSON.parse(fs.readFileSync(path.join(privateRoot, 'resume.json'), 'utf8'));
    expect(resumed.entries.find(entry => entry.matrixId === 'catchup-owner-matrix').status).toBe('already-applied');
    expect((await sourceQuery('SELECT count(*)::int AS count FROM commissions')).rows[0].count).toBe(1);
  }, 420000);
});
