import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { Client } from 'pg';
import * as postgres from 'pg';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as childProcess from 'child_process';
import { inspectTarget, purge } from '../../../scripts/maintenance';
import { runLegacyPurge } from '../../../prisma/purge';

const run = process.env.MAINTENANCE_TEST_PG_BIN ? describe : describe.skip;
const pgBin = process.env.MAINTENANCE_TEST_PG_BIN;
const backupRoot = path.join(os.tmpdir(), `ebn-maintenance-backups-${randomUUID()}`);
const sourceDatabases: string[] = [];
const restoreDatabases: string[] = [];
let credentials: { host: string; port: number; user: string; password: string; database: string };
let admin: Client;

async function fixture() {
  const database = `ebn_maintenance_test_${randomUUID().replace(/-/g, '')}`;
  await admin.query(`CREATE DATABASE "${database}"`);
  sourceDatabases.push(database);
  const sourceUrl = `postgresql://postgres@127.0.0.1:55432/${database}`;
  const writer = new Client({ connectionString: sourceUrl });
  await writer.connect();
  try {
    const migrations = path.resolve(__dirname, '../../../prisma/migrations');
    for (const migration of fs.readdirSync(migrations).sort().filter(name => !name.startsWith('20260917'))) {
      const sql = path.join(migrations, migration, 'migration.sql');
      if (fs.existsSync(sql)) await writer.query(fs.readFileSync(sql, 'utf8'));
    }
    await writer.query(`
      INSERT INTO sites (id, nom, ville, "updatedAt") VALUES ('site', 'Fixture', 'Local', now());
      INSERT INTO utilisateurs (id, nom, telephone, "passwordHash", role, "siteId", "updatedAt") VALUES
        ('first-admin', 'First', 'fixture-first', 'first-hash', 'SUPER_ADMIN', 'site', now()),
        ('second-admin', 'Second', 'fixture-second', 'second-hash', 'SUPER_ADMIN', 'site', now()),
        ('agent', 'Agent', 'fixture-agent', 'agent-hash', 'AGENT', 'site', now());
      INSERT INTO config_generale (id, "smsApiKey", "updatedAt") VALUES ('config', 'unchanged-fixture', now());
      INSERT INTO mlm_levels (ordre, nom, "commissionParFilleul", "commissionTotale", "bonusDescription", couleur, icone, "updatedAt")
        VALUES (1, 'Fixture', 10, 40, 'Fixture', '#000000', 'fixture', now());
      INSERT INTO clients (id, prenom, nom, telephone, "siteInscriptionId", "createdById", "updatedAt")
        VALUES ('client', 'Fixture', 'Local', 'fixture-client', 'site', 'agent', now());
      INSERT INTO membres (id, "clientId", matricule) VALUES ('member', 'client', 'fixture-member');
      CREATE TABLE public.unrelated_fixture (id bigserial PRIMARY KEY, amount numeric(30,12));
      INSERT INTO public.unrelated_fixture (amount) VALUES (123456789123456789.123456789123);
      CREATE TABLE public._prisma_migrations (id text PRIMARY KEY, migration_name text, finished_at timestamptz);
      INSERT INTO public._prisma_migrations VALUES ('fixture', '20260917000000', NULL);
    `);
  } finally { await writer.end(); }
  const fingerprint = (await inspectTarget(sourceUrl)).fingerprint;
  return { sourceUrl, fingerprint, preserveAdminIds: ['second-admin', 'first-admin'], workflow: 'transaction-fenced' as const,
    sourcePolicy: 'direct' as const, backupRoot, pgBin };
}

async function freshRestore() {
  const database = `ebn_restore_${randomUUID().replace(/-/g, '')}`;
  const bootstrap = new Client({ ...credentials, ssl: false });
  await bootstrap.connect();
  try {
    await bootstrap.query(`CREATE DATABASE "${database}"`);
    restoreDatabases.push(database);
    await bootstrap.query(`REVOKE CONNECT ON DATABASE "${database}" FROM PUBLIC`);
  } finally { await bootstrap.end(); }
  return `postgresql://${encodeURIComponent(credentials.user)}:${encodeURIComponent(credentials.password)}@127.0.0.1:55433/${database}?sslmode=disable`;
}

async function rows(sourceUrl: string) {
  const client = new Client({ connectionString: sourceUrl });
  await client.connect();
  try {
    const tables = (await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
    const values: Record<string, unknown> = {};
    for (const table of tables) values[table.tablename] = (await client.query(`SELECT to_jsonb(record)::text AS value FROM public."${table.tablename}" record ORDER BY to_jsonb(record)::text COLLATE "C"`)).rows;
    return values;
  } finally { await client.end(); }
}

run('transaction-fenced legacy purge on native PostgreSQL', () => {
  beforeAll(async () => {
    if (!process.env.MAINTENANCE_TEST_RESTORE_CREDENTIALS) throw new Error('PRIVATE_RESTORE_CREDENTIALS_FILE_REQUIRED');
    credentials = JSON.parse(fs.readFileSync(process.env.MAINTENANCE_TEST_RESTORE_CREDENTIALS, 'utf8'));
    if (credentials.host !== '127.0.0.1' || credentials.port !== 55433 || credentials.user !== 'ebn_restore_operator'
      || credentials.database !== 'postgres' || !credentials.password) throw new Error('DEDICATED_LOCAL_RESTORE_FIXTURE_REQUIRED');
    admin = new Client({ connectionString: 'postgresql://postgres@127.0.0.1:55432/postgres' });
    await admin.connect();
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    if (admin) {
      for (const database of sourceDatabases) await admin.query(`DROP DATABASE "${database}"`);
      await admin.end();
    }
    if (credentials) {
      const cleanup = new Client({ ...credentials, ssl: false });
      await cleanup.connect();
      try { for (const database of restoreDatabases) await cleanup.query(`DROP DATABASE "${database}"`); }
      finally { await cleanup.end(); }
    }
  }, 120000);

  it('defaults to no writes, preserves sites in dry-run, and requires explicit two-admin execution inputs', async () => {
    const options = await fixture();
    const before = await rows(options.sourceUrl);
    const inspected = await runLegacyPurge([], { MAINTENANCE_DATABASE_URL: options.sourceUrl });
    if (!('counts' in inspected)) throw new Error('INSPECTION_RESULT_REQUIRED');
    expect(inspected.counts.utilisateurs).toBe('3');
    const dryRun = await purge(options);
    expect(dryRun.executed).toBe(false);
    expect(dryRun.deleteCounts.utilisateurs).toBe('1');
    expect(dryRun.deleteCounts.sites).toBeUndefined();
    expect(dryRun.preservedTables).toEqual(expect.arrayContaining(['sites', 'config_generale', 'mlm_levels', '_prisma_migrations', 'unrelated_fixture']));
    await expect(purge({ ...options, preserveAdminIds: undefined })).rejects.toThrow('EXPLICIT_TWO_ADMINS_REQUIRED');
    await expect(purge({ ...options, preserveAdminIds: ['first-admin'] })).rejects.toThrow('EXPLICIT_TWO_ADMINS_REQUIRED');
    await expect(purge({ ...options, execute: true })).rejects.toThrow('FRESH_BACKUP_AND_RESTORE_REQUIRED');
    expect(await rows(options.sourceUrl)).toEqual(before);
  }, 120000);

  it('holds one write fence through native backup, restore, deletes and commit while preserving the exact legacy records', async () => {
    const options = await fixture();
    const restoreUrl = await freshRestore();
    const before = await rows(options.sourceUrl);
    const observer = new Client({ connectionString: options.sourceUrl });
    await observer.connect();
    const probe = async () => (await observer.query(`SELECT activity.pid, activity.backend_xid::text AS transaction,
      count(*)::int AS locks FROM pg_locks locks JOIN pg_class ON relation=pg_class.oid JOIN pg_namespace ON relnamespace=pg_namespace.oid
      JOIN pg_stat_activity activity ON activity.pid=locks.pid WHERE nspname='public' AND relkind='r'
      AND locks.mode='ShareRowExclusiveLock' AND locks.granted AND activity.application_name='ebn-maintenance' AND activity.backend_xid IS NOT NULL
      GROUP BY activity.pid, activity.backend_xid`)).rows[0];
    const phases: Array<Promise<any>> = [];
    const realSpawn = childProcess.spawn;
    const spawnSpy = jest.spyOn(childProcess, 'spawn').mockImplementation(((filename: string, args: string[], config: any) => {
      if (path.basename(filename).startsWith('pg_dump') || (path.basename(filename).startsWith('pg_restore') && args.includes('--dbname'))) phases.push(probe());
      return realSpawn(filename, args, config);
    }) as any);
    const realQuery = Client.prototype.query;
    const querySpy = jest.spyOn(Client.prototype, 'query').mockImplementation((async function(this: Client, ...args: any[]) {
      if (args[0] === 'COMMIT' || (typeof args[0] === 'string' && args[0].startsWith('DELETE FROM public.'))) phases.push(Promise.resolve(await probe()));
      return realQuery.apply(this, args as any);
    }) as any);
    const operation = purge({ ...options, execute: true, restoreUrl });
    const settled = operation.then(value => ({ value }), error => ({ error }));
    try {
      let fence: any;
      for (let attempt = 0; attempt < 200 && !fence; attempt++) {
        fence = await probe();
        if (!fence) await new Promise(resolve => setTimeout(resolve, 50));
      }
      expect(fence?.locks).toBe(Object.keys(before).length);
      expect((await observer.query('SELECT count(*)::int AS count FROM public.utilisateurs')).rows[0].count).toBe(3);
      await observer.query("SET lock_timeout='200ms'");
      await expect(observer.query("UPDATE public.config_generale SET \"smsApiKey\"='concurrent-change'" )).rejects.toMatchObject({ code: '55P03' });
      const result = await operation;
      expect(result.executed).toBe(true);
      expect(result.deleteCounts.utilisateurs).toBe('1');
      const observed = await Promise.all(phases);
      expect(observed.length).toBeGreaterThan(3);
      expect(observed.every(state => state?.locks === Object.keys(before).length && state.pid === fence.pid && state.transaction === fence.transaction)).toBe(true);
      const after = await rows(options.sourceUrl);
      for (const table of ['sites', 'config_generale', 'mlm_levels', '_prisma_migrations', 'unrelated_fixture']) expect(after[table]).toEqual(before[table]);
      expect(after.utilisateurs).toEqual((before.utilisateurs as Array<{ value: string }>).filter(row => ['first-admin', 'second-admin'].includes(JSON.parse(row.value).id)));
      for (const table of Object.keys(after).filter(name => !['sites', 'config_generale', 'mlm_levels', '_prisma_migrations', 'unrelated_fixture', 'utilisateurs'].includes(name))) expect(after[table]).toEqual([]);
    } finally { await settled; spawnSpy.mockRestore(); querySpy.mockRestore(); await observer.end(); }
  }, 180000);

  it.each(['missing', 'tampered'])('rolls back without deletes when its newly created backup is %s', async failure => {
    const options = await fixture();
    const restoreUrl = await freshRestore();
    const before = await rows(options.sourceUrl);
    const write = fs.writeFileSync;
    const spy = jest.spyOn(fs, 'writeFileSync').mockImplementation(((filename: fs.PathOrFileDescriptor, ...args: any[]) => {
      (write as Function)(filename, ...args);
      if (typeof filename === 'string' && filename.endsWith('manifest.json') && filename.startsWith(backupRoot)) {
        const dump = path.join(path.dirname(filename), 'public.dump');
        if (failure === 'missing') fs.unlinkSync(dump);
        else fs.appendFileSync(dump, 'tampered-fixture');
      }
    }) as any);
    try { await expect(purge({ ...options, execute: true, restoreUrl })).rejects.toThrow(failure === 'tampered' ? 'BACKUP_HASH_MISMATCH' : /BACKUP_ACL_NOT_PRIVATE|ENOENT/); }
    finally { spy.mockRestore(); }
    expect(await rows(options.sourceUrl)).toEqual(before);
  }, 120000);

  it('rolls back when the real native restore fails', async () => {
    const options = await fixture();
    const restoreUrl = await freshRestore();
    const before = await rows(options.sourceUrl);
    const spawn = childProcess.spawn;
    const spy = jest.spyOn(childProcess, 'spawn').mockImplementation(((filename: string, args: string[], config: any) => {
      const actual = [...args];
      if (path.basename(filename).startsWith('pg_restore') && args.includes('--dbname')) actual[actual.indexOf('--use-list') + 1] = path.join(backupRoot, 'deliberately-missing.list');
      return spawn(filename, actual, config);
    }) as any);
    try { await expect(purge({ ...options, execute: true, restoreUrl })).rejects.toThrow('NATIVE_TOOL_FAILED'); }
    finally { spy.mockRestore(); }
    expect(await rows(options.sourceUrl)).toEqual(before);
  }, 120000);

  it.each(['sql', 'admin-site', 'connection'])('rolls back actual business deletes after injected %s failure', async failure => {
    const options = await fixture();
    const restoreUrl = await freshRestore();
    const before = await rows(options.sourceUrl);
    let removedBusiness = false;
    let injected = false;
    const query = Client.prototype.query;
    const spy = jest.spyOn(Client.prototype, 'query').mockImplementation((async function(this: Client, ...args: any[]) {
      if (typeof args[0] === 'string' && args[0].startsWith('DELETE FROM public.')) {
        if (removedBusiness && !injected) {
          injected = true;
          if (failure === 'sql') return query.call(this, 'SELECT 1/0');
          if (failure === 'admin-site') await query.call(this, 'UPDATE public.utilisateurs SET "siteId"=NULL WHERE id=\'first-admin\'');
          if (failure === 'connection') {
            const ownPid = (await query.call(this, 'SELECT pg_backend_pid() AS pid')).rows[0].pid;
            await admin.query('SELECT pg_terminate_backend($1)', [ownPid]);
          }
        }
        const result = await query.apply(this, args as any);
        if (args[0] === 'DELETE FROM public."clients"') { expect(result.rowCount).toBe(1); removedBusiness = true; }
        return result;
      }
      return query.apply(this, args as any);
    }) as any);
    try {
      const operation = purge({ ...options, execute: true, restoreUrl });
      if (failure === 'sql') await expect(operation).rejects.toMatchObject({ code: '22012' });
      else if (failure === 'admin-site') await expect(operation).rejects.toThrow('SUPER_ADMIN_CHANGED');
      else await expect(operation).rejects.toThrow();
    }
    finally { spy.mockRestore(); }
    expect(removedBusiness && injected).toBe(true);
    expect(await rows(options.sourceUrl)).toEqual(before);
  }, 120000);

  it('includes a writer committed while lock acquisition waits in the first post-lock native snapshot', async () => {
    const options = await fixture();
    const restoreUrl = await freshRestore();
    const writer = new Client({ connectionString: options.sourceUrl });
    await writer.connect();
    await writer.query('BEGIN');
    await writer.query(`INSERT INTO clients (id, prenom, nom, telephone, "siteInscriptionId", "createdById", "updatedAt")
      VALUES ('late-client', 'Late', 'Fixture', 'fixture-late', 'site', 'agent', now())`);
    let fenced = false;
    let inTransaction = false;
    const earlyReads: string[] = [];
    const query = Client.prototype.query;
    const spy = jest.spyOn(Client.prototype, 'query').mockImplementation((async function(this: Client, ...args: any[]) {
      const sql = args[0];
      if (typeof sql === 'string' && sql.startsWith('BEGIN ISOLATION LEVEL') && !sql.includes('READ ONLY')) inTransaction = true;
      if (inTransaction && !fenced && typeof sql === 'string' && sql.startsWith('SELECT') && this !== writer && this !== admin) earlyReads.push(sql);
      const result = await query.apply(this, args as any);
      if (typeof sql === 'string' && sql.startsWith('LOCK TABLE')) fenced = true;
      return result;
    }) as any);
    const operation = purge({ ...options, execute: true, restoreUrl });
    const settled = operation.then(value => ({ value }), error => ({ error }));
    try {
      let waiting = false;
      for (let attempt = 0; attempt < 100 && !waiting; attempt++) {
        waiting = (await admin.query(`SELECT count(*)::int AS count FROM pg_locks WHERE database=(SELECT oid FROM pg_database WHERE datname=$1)
          AND mode='ShareRowExclusiveLock' AND NOT granted`, [new URL(options.sourceUrl).pathname.slice(1)])).rows[0].count > 0;
        if (!waiting) await new Promise(resolve => setTimeout(resolve, 20));
      }
      expect(waiting).toBe(true);
      await writer.query('COMMIT');
      const result = await operation;
      expect(earlyReads).toEqual([]);
      expect(result.deleteCounts.clients).toBe('2');
      const restored = await rows(restoreUrl);
      expect((restored.clients as unknown[]).length).toBe(2);
    } finally { await writer.query('ROLLBACK'); await settled; spy.mockRestore(); await writer.end(); }
  }, 120000);

  it.each(['sequence', 'catalog'])('refuses observed %s drift before deleting business rows', async kind => {
    const options = await fixture();
    const restoreUrl = await freshRestore();
    const before = await rows(options.sourceUrl);
    const writer = new Client({ connectionString: options.sourceUrl });
    await writer.connect();
    const spawn = childProcess.spawn;
    let drift: Promise<any>;
    const spy = jest.spyOn(childProcess, 'spawn').mockImplementation(((filename: string, args: string[], config: any) => {
      if (path.basename(filename).startsWith('pg_dump')) drift = writer.query(kind === 'sequence'
        ? "SELECT nextval('public.unrelated_fixture_id_seq')" : 'CREATE TABLE public.unexpected_drift (id text)');
      return spawn(filename, args, config);
    }) as any);
    try {
      await expect(purge({ ...options, execute: true, restoreUrl })).rejects.toThrow(/CATALOG_CHANGED|SCHEMA_OR_SEQUENCE_CHANGED|BACKUP_CHANGED_DURING_EXPORT/);
      await drift;
      if (kind === 'catalog') await writer.query('DROP TABLE public.unexpected_drift');
      else expect((await writer.query('SELECT last_value::text AS value FROM public.unrelated_fixture_id_seq')).rows[0].value).toBe('2');
      expect(await rows(options.sourceUrl)).toEqual(before);
    } finally { spy.mockRestore(); await writer.end(); }
  }, 120000);

  it('bounds an incompatible queued DDL request that blocks the native dump reader and rolls back', async () => {
    const options = await fixture();
    const restoreUrl = await freshRestore();
    const before = await rows(options.sourceUrl);
    const writer = new Client({ connectionString: options.sourceUrl });
    await writer.connect();
    await writer.query('BEGIN');
    const writerPid = (await writer.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    let queued: Promise<any>;
    const query = Client.prototype.query;
    const spy = jest.spyOn(Client.prototype, 'query').mockImplementation((async function(this: Client, ...args: any[]) {
      const result = await query.apply(this, args as any);
      if (args[0] === 'SELECT pg_export_snapshot() AS snapshot') {
        queued = writer.query('ALTER TABLE public.config_generale ADD COLUMN contention_fixture text').then(value => value, error => error);
        let waiting = false;
        for (let attempt = 0; attempt < 100 && !waiting; attempt++) {
          waiting = (await admin.query("SELECT count(*)::int AS count FROM pg_locks WHERE pid=$1 AND mode='AccessExclusiveLock' AND NOT granted", [writerPid])).rows[0].count > 0;
          if (!waiting) await new Promise(resolve => setTimeout(resolve, 20));
        }
        expect(waiting).toBe(true);
      }
      return result;
    }) as any);
    try { await expect(purge({ ...options, execute: true, restoreUrl })).rejects.toThrow('NATIVE_TOOL_FAILED'); }
    finally { spy.mockRestore(); await queued; await writer.query('ROLLBACK'); await writer.end(); }
    expect(await rows(options.sourceUrl)).toEqual(before);
  }, 120000);

  it('retains a real unknown event trigger in inspection and refuses it in the default direct profile', async () => {
    const options = await fixture();
    const writer = new Client({ connectionString: options.sourceUrl });
    await writer.connect();
    try {
      await writer.query(`CREATE SCHEMA extensions;
        CREATE FUNCTION extensions.fixture_event() RETURNS event_trigger LANGUAGE plpgsql AS $$BEGIN NULL; END;$$;
        CREATE EVENT TRIGGER fixture_event ON ddl_command_end EXECUTE FUNCTION extensions.fixture_event()`);
    } finally { await writer.end(); }
    const before = await rows(options.sourceUrl);
    expect((await inspectTarget(options.sourceUrl)).dependenciesReviewRequired).toBe(1);
    await expect(purge(options)).rejects.toThrow('UNREVIEWED_DATABASE_OBJECT');
    expect(await rows(options.sourceUrl)).toEqual(before);
  }, 120000);

  it.each(['accepted', 'observer-drift'])('uses the managed session catalog through a loopback-only test transport: %s', async scenario => {
    const options = await fixture();
    const database = new URL(options.sourceUrl).pathname.slice(1);
    const restoreUrl = await freshRestore();
    const before = await rows(options.sourceUrl);
    const aliasHost = 'aws-0-eu-west-1.pooler.supabase.com';
    const aliasUrl = `postgresql://postgres.abcdefghijklmnopqrst:fixture@${aliasHost}:5432/${database}?sslmode=require`;
    const evidence = [
      ['issue_graphql_placeholder', 'sql_drop', ['DROP EXTENSION'], 'set_graphql_placeholder', 'b0cadab880dc68f569b3e01057dc6f5acee9d05e122de6f4256130ae330bbcec'],
      ['issue_pg_cron_access', 'ddl_command_end', ['CREATE EXTENSION'], 'grant_pg_cron_access', 'eb3fa2e82a0135bc04a6236f93331911861c91b45d72cba5d9c03c1be2c34b4c'],
      ['issue_pg_graphql_access', 'ddl_command_end', ['CREATE EXTENSION'], 'grant_pg_graphql_access', '9ec845adab4ba00bbf7740458b6c4461094697023f0f7adc693b373e2ea54f68'],
      ['issue_pg_net_access', 'ddl_command_end', ['CREATE EXTENSION'], 'grant_pg_net_access', 'e38c4060751c9695123350596f1cb0d0c943015f3267a2a455d8efe02c711184'],
      ['pgrst_ddl_watch', 'ddl_command_end', null, 'pgrst_ddl_watch', '2b4b5d702ddf70fbd1a05c9825f9f9016d5c0ef97dd3df5f5b012ea23d9b94b1'],
      ['pgrst_drop_watch', 'sql_drop', null, 'pgrst_drop_watch', '3a2696133853e17a0456cbfbb233a03815f50895492143e84df983b558d76593'],
    ].map(([name, event, tags, functionName, definitionHash]) => ({ name, event, tags, functionName, definitionHash,
      enabled: 'O', owner: 'supabase_admin', functionOwner: 'supabase_admin', functionSchema: 'extensions', identityArguments: '',
      securityDefiner: false, config: ['search_path=""'] }));
    const RealClient = Client;
    const sourceQueries: string[] = [];
    const clientSpy = jest.spyOn(postgres, 'Client').mockImplementation((function(config: any) {
      const host = config.host || new URL(config.connectionString).hostname;
      if (host === aliasHost && config.database === database) return new RealClient({ ...config, host: '127.0.0.1', port: 55432, user: 'postgres', password: () => '', ssl: false });
      if (host !== '127.0.0.1') throw new Error('TEST_TRANSPORT_MUST_STAY_LOOPBACK');
      return new RealClient(config);
    }) as any);
    const realQuery = RealClient.prototype.query;
    const querySpy = jest.spyOn(RealClient.prototype, 'query').mockImplementation((async function(this: Client, ...args: any[]) {
      const result = await realQuery.apply(this, args as any);
      if (this.database === database && typeof args[0] === 'string') {
        sourceQueries.push(args[0].trim());
        if (args[0].includes('FROM pg_event_trigger event_trigger')) return { ...result, rows: JSON.parse(JSON.stringify(evidence)), rowCount: evidence.length };
      }
      return result;
    }) as any);
    const realSpawn = childProcess.spawn;
    const spawnSpy = jest.spyOn(childProcess, 'spawn').mockImplementation(((filename: string, args: string[], config: any) => {
      const env = { ...config.env };
      if (env.PGHOST === aliasHost && env.PGDATABASE === database) Object.assign(env, { PGHOST: '127.0.0.1', PGPORT: '55432', PGUSER: 'postgres', PGPASSWORD: '', PGSSLMODE: 'disable' });
      if (env.PGHOST !== '127.0.0.1') throw new Error('TEST_TRANSPORT_MUST_STAY_LOOPBACK');
      if (scenario === 'observer-drift' && path.basename(filename).startsWith('pg_restore') && args.includes('--dbname')) evidence[0].functionOwner = 'unreviewed-owner';
      return realSpawn(filename, args, { ...config, env });
    }) as any);
    try {
      const fingerprint = (await inspectTarget(aliasUrl, 'supabase-session')).fingerprint;
      const operation = purge({ ...options, sourceUrl: aliasUrl, fingerprint, sourcePolicy: 'supabase-session', execute: true, restoreUrl });
      if (scenario === 'observer-drift') await expect(operation).rejects.toThrow('CATALOG_CHANGED');
      else {
        expect((await operation).executed).toBe(true);
        const after = await rows(options.sourceUrl);
        expect(after.sites).toEqual(before.sites);
        expect(after.config_generale).toEqual(before.config_generale);
        expect(after.utilisateurs).toEqual((before.utilisateurs as Array<{ value: string }>).filter(row => ['first-admin', 'second-admin'].includes(JSON.parse(row.value).id)));
      }
      expect(sourceQueries.length).toBeGreaterThan(20);
      expect(sourceQueries.every(sql => /^(SELECT|SET|BEGIN|LOCK|DECLARE|FETCH|CLOSE|DELETE|COMMIT|ROLLBACK)\b/.test(sql))).toBe(true);
      if (scenario === 'observer-drift') expect(sourceQueries.some(sql => sql.startsWith('DELETE'))).toBe(false);
    } finally { spawnSpy.mockRestore(); querySpy.mockRestore(); clientSpy.mockRestore(); }
    if (scenario === 'observer-drift') expect(await rows(options.sourceUrl)).toEqual(before);
  }, 120000);
});
