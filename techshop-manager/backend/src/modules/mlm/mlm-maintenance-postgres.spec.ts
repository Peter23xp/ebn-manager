import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { Client } from 'pg';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { createBackup, inspectTarget, purge, verifyBackup } from '../../../scripts/maintenance';

const run = process.env.MAINTENANCE_TEST_PG_BIN ? describe : describe.skip;
const sourceDatabase = `ebn_maintenance_test_${randomUUID().replace(/-/g, '')}`;
const sourceUrl = `postgresql://postgres@127.0.0.1:55432/${sourceDatabase}`;
const pgBin = process.env.MAINTENANCE_TEST_PG_BIN;
const backupRoot = path.join(os.tmpdir(), `ebn-maintenance-backups-${randomUUID()}`);
const restoreDatabases: string[] = [];
const syntheticRestoreDatabases: string[] = [];
let restoreCredentials: { host: string; port: number; user: string; password: string; database: string };
let admin: Client;
let source: Client;
let fingerprint: string;
let bundle: string;

async function applyFixtureMigrations(client: Client) {
  const migrations = path.resolve(__dirname, '../../../prisma/migrations');
  for (const migration of fs.readdirSync(migrations).sort()) {
    const sql = path.join(migrations, migration, 'migration.sql');
    if (fs.existsSync(sql)) await client.query(fs.readFileSync(sql, 'utf8'));
  }
}

async function freshRestore() {
  const database = `ebn_restore_${randomUUID().replace(/-/g, '')}`;
  const bootstrap = new Client({ ...restoreCredentials, ssl: false });
  await bootstrap.connect();
  try {
    await bootstrap.query(`CREATE DATABASE "${database}"`);
    restoreDatabases.push(database);
    await bootstrap.query(`REVOKE CONNECT ON DATABASE "${database}" FROM PUBLIC`);
  } finally { await bootstrap.end(); }
  return `postgresql://${encodeURIComponent(restoreCredentials.user)}:${encodeURIComponent(restoreCredentials.password)}@127.0.0.1:55433/${database}?sslmode=disable`;
}

run('maintenance with native PostgreSQL backup and restore', () => {
  beforeAll(async () => {
    if (!process.env.MAINTENANCE_TEST_RESTORE_CREDENTIALS) throw new Error('PRIVATE_RESTORE_CREDENTIALS_FILE_REQUIRED');
    restoreCredentials = JSON.parse(fs.readFileSync(process.env.MAINTENANCE_TEST_RESTORE_CREDENTIALS, 'utf8'));
    if (restoreCredentials.host !== '127.0.0.1' || restoreCredentials.port !== 55433 || restoreCredentials.database !== 'postgres'
      || !restoreCredentials.password || restoreCredentials.user !== 'ebn_restore_operator') throw new Error('DEDICATED_LOCAL_RESTORE_FIXTURE_REQUIRED');
    admin = new Client({ connectionString: 'postgresql://postgres@127.0.0.1:55432/postgres' });
    await admin.connect();
    await admin.query(`CREATE DATABASE "${sourceDatabase}"`);
    await admin.query(`REVOKE CONNECT ON DATABASE "${sourceDatabase}" FROM PUBLIC`);
    source = new Client({ connectionString: sourceUrl });
    await source.connect();
    await applyFixtureMigrations(source);
    await source.query(`
      INSERT INTO sites (id, nom, ville, "updatedAt") VALUES ('site', 'Fixture', 'Local', now());
      INSERT INTO utilisateurs (id, nom, telephone, "passwordHash", role, "siteId", "updatedAt")
        VALUES ('admin', 'Fixture', 'local-admin', 'unchanged-admin-hash', 'SUPER_ADMIN', 'site', now()),
          ('agent', 'Fixture', 'local-agent', 'agent-hash', 'AGENT', 'site', now());
      INSERT INTO config_generale (id, "smsApiKey", "updatedAt") VALUES ('config', 'local-fixture-secret', now());
      INSERT INTO mlm_levels (ordre, nom, "commissionParFilleul", "commissionTotale", "bonusDescription", couleur, icone, "updatedAt")
        VALUES (1, 'Fixture', 10, 40, 'Fixture', '#000000', 'fixture', now());
      INSERT INTO clients (id, prenom, nom, telephone, "siteInscriptionId", "createdById", "updatedAt")
        VALUES ('client', 'Fixture', 'Local', 'local-client', 'site', 'agent', now());
      INSERT INTO membres (id, "clientId", matricule) VALUES ('member', 'client', 'local-member');
      INSERT INTO placement_history (id, "memberId", reason, "operationId", "operationType")
        VALUES ('history', 'member', 'Fixture', 'operation', 'PLACEMENT');
      INSERT INTO portefeuilles (id, "membreId", "soldeDisponible", "updatedAt") VALUES ('wallet', 'member', 123.45, now());
      INSERT INTO export_jobs (id, type, format, filtres, "updatedAt")
        VALUES ('export', 'fixture', 'json', '{"nested":{"decimal":"9999999999.99","date":"2026-09-17T12:00:00Z"}}', now());
      CREATE TABLE public.unrelated_fixture (id bigserial PRIMARY KEY, amount numeric(30,12), data jsonb, created timestamptz);
      INSERT INTO public.unrelated_fixture (amount, data, created)
        VALUES (123456789123456789.123456789123, '{"nested":[true,null,"fixture"]}', '2026-09-17T12:00:00.123456Z');
      SELECT nextval('public.unrelated_fixture_id_seq');
      CREATE TABLE public._prisma_migrations (id text PRIMARY KEY, checksum text NOT NULL, migration_name text NOT NULL);
      INSERT INTO public._prisma_migrations VALUES ('fixture-migration', 'fixture-checksum', 'all-seven-local-fixture');
    `);
    await source.end();
    const inspected = await inspectTarget(sourceUrl);
    fingerprint = inspected.fingerprint;
  }, 120000);

  afterAll(async () => {
    if (source) await source.end().catch(() => undefined);
    if (admin) {
      for (const database of [...syntheticRestoreDatabases, sourceDatabase]) {
        if (!/^ebn_(restore|maintenance_test)_[a-f0-9]+$/.test(database)) throw new Error('UNSAFE_TEST_CLEANUP');
        await admin.query(`DROP DATABASE IF EXISTS "${database}"`);
      }
      await admin.end();
    }
    if (restoreCredentials) {
      const cleanup = new Client({ ...restoreCredentials, ssl: false });
      await cleanup.connect();
      try {
        for (const database of restoreDatabases) {
          if (!/^ebn_restore_[a-f0-9]+$/.test(database)) throw new Error('UNSAFE_TEST_CLEANUP');
          await cleanup.query(`DROP DATABASE IF EXISTS "${database}"`);
        }
      } finally { await cleanup.end(); }
    }
  }, 120000);

  it('returns only counts and fingerprint; dry-run leaves the admin attached and all rows intact', async () => {
    const inspected = await inspectTarget(sourceUrl);
    expect(inspected.counts.utilisateurs).toBe('2');
    expect(JSON.stringify(inspected)).not.toContain('unchanged-admin-hash');
    expect(JSON.stringify(inspected)).not.toContain('local-fixture-secret');
    const dryRun = await purge({ sourceUrl, fingerprint });
    expect(dryRun.executed).toBe(false);
    expect(dryRun.deleteCounts.utilisateurs).toBe('1');
    expect((await inspectTarget(sourceUrl)).counts).toEqual(inspected.counts);
  });

  it('rejects a wrong fingerprint and an in-repository backup destination before creating files', async () => {
    await expect(createBackup({ sourceUrl, fingerprint: 'wrong', backupRoot, pgBin })).rejects.toThrow('TARGET_FINGERPRINT_MISMATCH');
    await expect(createBackup({ sourceUrl, fingerprint, backupRoot: path.resolve(__dirname, '../../../backups'), pgBin })).rejects.toThrow('BACKUP_INSIDE_REPOSITORY');
  });

  it('backs up natively and restores exact JSON, Decimal, timestamps, FKs, triggers and sequence state', async () => {
    const backup = await createBackup({ sourceUrl, fingerprint, backupRoot, pgBin });
    bundle = backup.bundle;
    const restoreUrl = await freshRestore();
    expect((await verifyBackup({ sourceUrl, fingerprint, bundle, restoreUrl, pgBin })).verified).toBe(true);
    const restored = new Client({ connectionString: restoreUrl });
    await restored.connect();
    try {
      expect((await restored.query('SELECT amount::text FROM unrelated_fixture')).rows[0].amount).toBe('123456789123456789.123456789123');
      expect((await restored.query("SELECT nextval('public.unrelated_fixture_id_seq')::text AS next")).rows[0].next).toBe('3');
      await expect(restored.query('DELETE FROM placement_history')).rejects.toThrow('append-only');
      expect((await restored.query('SELECT "passwordHash", "siteId" FROM utilisateurs WHERE id=\'admin\'')).rows[0]).toEqual({ passwordHash: 'unchanged-admin-hash', siteId: 'site' });
    } finally { await restored.end(); }
    await expect(verifyBackup({ sourceUrl, fingerprint, bundle, restoreUrl, pgBin })).rejects.toThrow('RESTORE_DATABASE_NOT_EMPTY');
  }, 120000);

  it('refuses live writers, pending provider payments, unknown dependencies and ambiguous admins', async () => {
    const writer = new Client({ connectionString: sourceUrl });
    await writer.connect();
    try {
      await expect(createBackup({ sourceUrl, fingerprint, backupRoot, pgBin })).rejects.toThrow('OTHER_DATABASE_SESSIONS');
      await writer.query(`INSERT INTO mlm_payouts (id, montant, provider, "phoneNumber", "membreId", "updatedAt") VALUES ('pending', 10, 'fixture', 'local', 'member', now())`);
      await expect(purge({ sourceUrl, fingerprint })).rejects.toThrow('PENDING_PROVIDER_PAYMENTS');
      await writer.query("DELETE FROM mlm_payouts WHERE id='pending'");
      await writer.query('CREATE TABLE public.unknown_child (id text REFERENCES public.sites(id))');
      await expect(purge({ sourceUrl, fingerprint })).rejects.toThrow('UNKNOWN_DEPENDENCY');
      await writer.query('DROP TABLE public.unknown_child');
      await writer.query('ALTER TABLE public.clients ADD CONSTRAINT unreviewed_fk FOREIGN KEY (notes) REFERENCES public.produits(id)');
      await expect(purge({ sourceUrl, fingerprint })).rejects.toThrow('UNKNOWN_FOREIGN_KEY');
      await writer.query('ALTER TABLE public.clients DROP CONSTRAINT unreviewed_fk');
      await writer.query("UPDATE utilisateurs SET role='SUPER_ADMIN' WHERE id='agent'");
      await expect(purge({ sourceUrl, fingerprint })).rejects.toThrow('AMBIGUOUS_SUPER_ADMIN');
      await writer.query("UPDATE utilisateurs SET role='AGENT' WHERE id='agent'");
    } finally { await writer.end(); }
  }, 120000);

  it('rejects a trust-authenticated restore before materializing any archived rows', async () => {
    const database = `ebn_restore_${randomUUID().replace(/-/g, '')}`;
    await admin.query(`CREATE DATABASE "${database}"`);
    syntheticRestoreDatabases.push(database);
    const restoreUrl = new URL(`postgresql://postgres:synthetic-not-an-authenticated-secret@127.0.0.1:55432/${database}`);
    await expect(verifyBackup({ sourceUrl, fingerprint, bundle, restoreUrl: restoreUrl.toString(), pgBin }))
      .rejects.toThrow('RESTORE_SCRAM_AUTH_REQUIRED');
    const check = new Client({ connectionString: restoreUrl.toString() });
    await check.connect();
    try { expect((await check.query("SELECT count(*)::int AS count FROM pg_tables WHERE schemaname='public'")).rows[0].count).toBe(0); }
    finally { await check.end(); }
  }, 120000);

  it('keeps control and native connections identical despite inherited PG routing, password and TLS settings', async () => {
    const restoreUrl = await freshRestore();
    const pollution = { PGHOST: '192.0.2.1', PGPORT: '1', PGUSER: 'wrong_fixture_role', PGDATABASE: 'wrong_fixture_database',
      PGPASSWORD: 'wrong_fixture_password', PGSSLMODE: 'require', PGOPTIONS: '-c default_transaction_read_only=on',
      PGREPLICATION: 'database', PGPASSFILE: 'Z:/not-a-password-file', PGCLIENTENCODING: 'LATIN1' };
    const previous = Object.fromEntries(Object.keys(pollution).map(key => [key, process.env[key]]));
    Object.assign(process.env, pollution);
    try {
      expect((await inspectTarget(sourceUrl)).fingerprint).toBe(fingerprint);
      expect((await verifyBackup({ sourceUrl, fingerprint, bundle, restoreUrl, pgBin })).verified).toBe(true);
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  }, 120000);

  it('requires an explicit restore password and rejects PUBLIC CONNECT before loading data', async () => {
    const restoreUrl = new URL(await freshRestore());
    const withoutPassword = new URL(restoreUrl);
    withoutPassword.password = '';
    await expect(verifyBackup({ sourceUrl, fingerprint, bundle, restoreUrl: withoutPassword.toString(), pgBin }))
      .rejects.toThrow('RESTORE_PASSWORD_REQUIRED');
    const bootstrap = new Client({ ...restoreCredentials, ssl: false });
    await bootstrap.connect();
    await bootstrap.query(`GRANT CONNECT ON DATABASE "${restoreUrl.pathname.slice(1)}" TO PUBLIC`);
    await bootstrap.end();
    await expect(verifyBackup({ sourceUrl, fingerprint, bundle, restoreUrl: restoreUrl.toString(), pgBin }))
      .rejects.toThrow('DATABASE_LOGIN_FENCE_REQUIRED');
    const check = new Client({ connectionString: restoreUrl.toString() });
    await check.connect();
    try { expect((await check.query("SELECT count(*)::int AS count FROM pg_tables WHERE schemaname='public'")).rows[0].count).toBe(0); }
    finally { await check.end(); }
  }, 120000);

  it('refuses another session anywhere on the restore cluster and an additional login role', async () => {
    const restoreUrl = await freshRestore();
    const observer = new Client({ ...restoreCredentials, ssl: false });
    await observer.connect();
    try {
      await expect(verifyBackup({ sourceUrl, fingerprint, bundle, restoreUrl, pgBin })).rejects.toThrow('RESTORE_CLUSTER_NOT_EXCLUSIVE');
      await observer.query('CREATE ROLE ebn_restore_other_fixture LOGIN');
    } finally { await observer.end(); }
    try {
      await expect(verifyBackup({ sourceUrl, fingerprint, bundle, restoreUrl, pgBin })).rejects.toThrow('RESTORE_DEDICATED_CLUSTER_REQUIRED');
    } finally {
      const reset = new Client({ ...restoreCredentials, ssl: false });
      await reset.connect();
      await reset.query('DROP ROLE ebn_restore_other_fixture');
      await reset.end();
    }
  }, 120000);

  it('rejects non-SCRAM HBA rules and non-private files in the restore data directory before loading data', async () => {
    const restoreUrl = await freshRestore();
    const probe = new Client({ ...restoreCredentials, ssl: false });
    await probe.connect();
    const locations = (await probe.query("SELECT current_setting('data_directory') AS directory, current_setting('hba_file') AS hba")).rows[0];
    await probe.end();
    const original = fs.readFileSync(locations.hba);
    fs.appendFileSync(locations.hba, '\nhost all all 192.0.2.1/32 trust\n');
    try { await expect(verifyBackup({ sourceUrl, fingerprint, bundle, restoreUrl, pgBin })).rejects.toThrow('RESTORE_SCRAM_HBA_REQUIRED'); }
    finally { fs.writeFileSync(locations.hba, original); }
    const insecureFile = path.join(locations.directory, 'synthetic-privacy-probe');
    fs.writeFileSync(insecureFile, 'synthetic', { mode: 0o600 });
    if (process.platform === 'win32') execFileSync('icacls.exe', [insecureFile, '/grant', '*S-1-1-0:R'], { windowsHide: true, stdio: 'pipe' });
    else fs.chmodSync(insecureFile, 0o644);
    try { await expect(verifyBackup({ sourceUrl, fingerprint, bundle, restoreUrl, pgBin })).rejects.toThrow('RESTORE_PRIVATE_STORAGE_REQUIRED'); }
    finally { fs.unlinkSync(insecureFile); }
    const check = new Client({ connectionString: restoreUrl });
    await check.connect();
    try { expect((await check.query("SELECT count(*)::int AS count FROM pg_tables WHERE schemaname='public'")).rows[0].count).toBe(0); }
    finally { await check.end(); }
  }, 120000);

  it('requires an observed database login fence rather than a maintenance flag', async () => {
    await admin.query(`GRANT CONNECT ON DATABASE "${sourceDatabase}" TO PUBLIC`);
    try {
      await expect(createBackup({ sourceUrl, fingerprint, backupRoot, pgBin })).rejects.toThrow('DATABASE_LOGIN_FENCE_REQUIRED');
    } finally { await admin.query(`REVOKE CONNECT ON DATABASE "${sourceDatabase}" FROM PUBLIC`); }
  }, 120000);

  it('binds an explicitly selected SUPER_ADMIN to the backup and restore and rejects other identities', async () => {
    const writer = new Client({ connectionString: sourceUrl });
    await writer.connect();
    await writer.query("UPDATE utilisateurs SET role='SUPER_ADMIN' WHERE id='agent'");
    await writer.end();
    try {
      await expect(purge({ sourceUrl, fingerprint })).rejects.toThrow('AMBIGUOUS_SUPER_ADMIN');
      await expect(purge({ sourceUrl, fingerprint, preserveAdminId: 'missing' })).rejects.toThrow('SELECTED_SUPER_ADMIN_NOT_FOUND');
      const selected = await createBackup({ sourceUrl, fingerprint, backupRoot, pgBin, preserveAdminId: 'admin' });
      const manifest = JSON.parse(fs.readFileSync(path.join(selected.bundle, 'manifest.json'), 'utf8'));
      expect(manifest.preservedAdminId).toBe('admin');
      const restoreUrl = await freshRestore();
      const options = { sourceUrl, fingerprint, bundle: selected.bundle, restoreUrl, pgBin };
      await expect(verifyBackup(options)).rejects.toThrow('PRESERVED_ADMIN_MISMATCH');
      await expect(verifyBackup({ ...options, preserveAdminId: 'agent' })).rejects.toThrow('PRESERVED_ADMIN_MISMATCH');
      await expect(purge({ ...options, execute: true, preserveAdminId: 'agent' })).rejects.toThrow('PRESERVED_ADMIN_MISMATCH');
      expect((await verifyBackup({ ...options, preserveAdminId: 'admin' })).verified).toBe(true);
    } finally {
      const reset = new Client({ connectionString: sourceUrl });
      await reset.connect();
      await reset.query("UPDATE utilisateurs SET role='AGENT' WHERE id='agent'");
      await reset.end();
    }
    await expect(purge({ sourceUrl, fingerprint, preserveAdminId: 'agent' })).rejects.toThrow('SELECTED_SUPER_ADMIN_NOT_FOUND');
  }, 120000);

  it('preserves exactly two explicitly selected admins and rejects subset, superset and omitted backup selections', async () => {
    const database = `ebn_maintenance_test_${randomUUID().replace(/-/g, '')}`;
    const twoAdminUrl = `postgresql://postgres@127.0.0.1:55432/${database}`;
    await admin.query(`CREATE DATABASE "${database}"`);
    try {
      await admin.query(`REVOKE CONNECT ON DATABASE "${database}" FROM PUBLIC`);
      const fixture = new Client({ connectionString: twoAdminUrl });
      await fixture.connect();
      let attributes: unknown[];
      try {
        await applyFixtureMigrations(fixture);
        await fixture.query(`
          INSERT INTO sites (id, nom, ville, "updatedAt") VALUES ('site', 'Fixture', 'Local', now());
          INSERT INTO utilisateurs (id, nom, telephone, "passwordHash", role, "siteId", "updatedAt") VALUES
            ('first-admin', 'First', 'fixture-first', 'first-unchanged-hash', 'SUPER_ADMIN', 'site', now()),
            ('second-admin', 'Second', 'fixture-second', 'second-unchanged-hash', 'SUPER_ADMIN', 'site', now()),
            ('future-admin', 'Unselected', 'fixture-future', 'unselected-hash', 'SUPER_ADMIN', 'site', now()),
            ('operator', 'Operator', 'fixture-operator', 'operator-hash', 'AGENT', 'site', now());
          INSERT INTO config_generale (id, "smsApiKey", "updatedAt") VALUES ('config', 'unchanged-technical-fixture', now());
        `);
        attributes = (await fixture.query("SELECT to_jsonb(account)-'siteId' AS attributes FROM utilisateurs account WHERE id IN ('first-admin','second-admin') ORDER BY id")).rows;
      } finally { await fixture.end(); }
      const target = (await inspectTarget(twoAdminUrl)).fingerprint;
      const select = (ids: string[] | undefined) => ({ sourceUrl: twoAdminUrl, fingerprint: target, preserveAdminIds: ids });
      const selected = select(['second-admin', 'first-admin']);
      expect((await purge(selected)).deleteCounts.utilisateurs).toBe('2');
      await expect(purge(select(undefined))).rejects.toThrow('AMBIGUOUS_SUPER_ADMIN');
      await expect(purge(select(['first-admin', 'operator']))).rejects.toThrow('SELECTED_SUPER_ADMIN_NOT_FOUND');
      await expect(purge(select(['first-admin', 'missing']))).rejects.toThrow('SELECTED_SUPER_ADMIN_NOT_FOUND');
      await expect(purge(select([]))).rejects.toThrow('INVALID_ADMIN_SELECTION');
      await expect(purge(select(['first-admin', 'first-admin']))).rejects.toThrow('DUPLICATE_ADMIN_SELECTION');
      const backup = await createBackup({ ...selected, backupRoot, pgBin });
      const manifest = JSON.parse(fs.readFileSync(path.join(backup.bundle, 'manifest.json'), 'utf8'));
      expect(manifest.preservedAdminIds).toEqual(['first-admin', 'second-admin']);
      const restoreUrl = await freshRestore();
      for (const ids of [undefined, ['first-admin'], ['first-admin', 'second-admin', 'future-admin']]) {
        const mismatched = { ...select(ids), bundle: backup.bundle, restoreUrl, pgBin };
        await expect(verifyBackup(mismatched)).rejects.toThrow('PRESERVED_ADMIN_MISMATCH');
        await expect(purge(mismatched)).rejects.toThrow('PRESERVED_ADMIN_MISMATCH');
        await expect(purge({ ...mismatched, execute: true })).rejects.toThrow('PRESERVED_ADMIN_MISMATCH');
      }
      const checked = { ...select(['first-admin', 'second-admin']), bundle: backup.bundle, restoreUrl, pgBin };
      expect((await verifyBackup(checked)).verified).toBe(true);
      const executed = await purge({ ...checked, restoreUrl: await freshRestore(), execute: true });
      expect(executed.executed).toBe(true);
      expect(executed.deleteCounts.utilisateurs).toBe('2');
      const check = new Client({ connectionString: twoAdminUrl });
      await check.connect();
      try {
        expect((await check.query('SELECT id, "passwordHash", "siteId" FROM utilisateurs ORDER BY id')).rows).toEqual([
          { id: 'first-admin', passwordHash: 'first-unchanged-hash', siteId: null },
          { id: 'second-admin', passwordHash: 'second-unchanged-hash', siteId: null },
        ]);
        expect((await check.query("SELECT to_jsonb(account)-'siteId' AS attributes FROM utilisateurs account ORDER BY id")).rows).toEqual(attributes);
        expect((await check.query('SELECT "smsApiKey" FROM config_generale')).rows[0].smsApiKey).toBe('unchanged-technical-fixture');
        expect((await check.query('SELECT count(*)::int AS count FROM sites')).rows[0].count).toBe(0);
      } finally { await check.end(); }
    } finally { await admin.query(`DROP DATABASE "${database}"`); }
  }, 180000);

  it('rejects backup files whose own ACL exposes data even under a private directory', async () => {
    const dump = path.join(bundle, 'public.dump');
    if (process.platform === 'win32') execFileSync('icacls.exe', [dump, '/grant', '*S-1-1-0:R'], { windowsHide: true, stdio: 'pipe' });
    else fs.chmodSync(dump, 0o644);
    try {
      await expect(verifyBackup({ sourceUrl, fingerprint, bundle, restoreUrl: await freshRestore(), pgBin })).rejects.toThrow('BACKUP_ACL_NOT_PRIVATE');
    } finally {
      if (process.platform === 'win32') execFileSync('icacls.exe', [dump, '/remove:g', '*S-1-1-0'], { windowsHide: true, stdio: 'pipe' });
      else fs.chmodSync(dump, 0o600);
    }
  }, 120000);

  it('refuses destructive execution without a restored backup, then rejects a tampered dump', async () => {
    await expect(purge({ sourceUrl, fingerprint, execute: true })).rejects.toThrow('VERIFIED_BACKUP_REQUIRED');
    const dump = path.join(bundle, 'public.dump');
    const original = fs.readFileSync(dump);
    fs.appendFileSync(dump, 'tampered');
    try {
      await expect(verifyBackup({ sourceUrl, fingerprint, bundle, restoreUrl: await freshRestore(), pgBin })).rejects.toThrow('BACKUP_HASH_MISMATCH');
    } finally { fs.writeFileSync(dump, original); }
  }, 120000);

  it('rejects stale backup data, then purges only allowlisted business rows and re-enables the named trigger', async () => {
    const writer = new Client({ connectionString: sourceUrl });
    await writer.connect();
    await writer.query("UPDATE config_generale SET \"smsApiKey\"='changed' WHERE id='config'");
    await writer.end();
    await expect(purge({ sourceUrl, fingerprint, execute: true, bundle, restoreUrl: await freshRestore(), pgBin })).rejects.toThrow('LIVE_BACKUP_MISMATCH');
    const promote = new Client({ connectionString: sourceUrl });
    await promote.connect();
    await promote.query("UPDATE utilisateurs SET role='SUPER_ADMIN' WHERE id='agent'");
    await promote.end();
    const fresh = await createBackup({ sourceUrl, fingerprint, backupRoot, pgBin, preserveAdminId: 'admin' });
    const purged = await purge({ sourceUrl, fingerprint, execute: true, bundle: fresh.bundle, restoreUrl: await freshRestore(), pgBin, preserveAdminId: 'admin' });
    expect(purged.executed).toBe(true);
    const check = new Client({ connectionString: sourceUrl });
    await check.connect();
    try {
      expect((await check.query('SELECT id, "passwordHash", "siteId" FROM utilisateurs')).rows).toEqual([{ id: 'admin', passwordHash: 'unchanged-admin-hash', siteId: null }]);
      expect((await check.query('SELECT "smsApiKey" FROM config_generale')).rows[0].smsApiKey).toBe('changed');
      expect((await check.query('SELECT count(*)::text AS count FROM unrelated_fixture')).rows[0].count).toBe('1');
      expect((await check.query("SELECT tgenabled FROM pg_trigger WHERE tgname='placement_history_immutable'")).rows[0].tgenabled).toBe('O');
      expect((await check.query('SELECT count(*)::text AS count FROM mlm_levels')).rows[0].count).toBe('1');
      expect((await check.query('SELECT migration_name FROM _prisma_migrations')).rows[0].migration_name).toBe('all-seven-local-fixture');
      expect((await check.query('SELECT count(*)::text AS count FROM sites')).rows[0].count).toBe('0');
    } finally { await check.end(); }
  }, 120000);
});
