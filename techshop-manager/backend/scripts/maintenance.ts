import { Client } from 'pg';
import { createHash, randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync, spawn } from 'child_process';

export const DELETE_TABLES = [
  'sites', 'utilisateurs', 'clients', 'onboarding_etapes', 'produits', 'stock_sites',
  'mouvements_stock', 'transferts_stock', 'ventes', 'lignes_vente', 'retours',
  'lignes_retour', 'export_jobs', 'support_tickets', 'ambassadeur_applications',
  'membres', 'matrices', 'positions', 'placement_history', 'portefeuilles',
  'transactions_portefeuille', 'mlm_payouts', 'kpay_transactions', 'promotions',
  'bonus_attribues', 'salaires_verses', 'bonus_retraites', 'commissions',
  'parrain_claims', 'withdrawal_requests', 'reinvest_lots', 'categories', 'password_reset_tokens',
];
export const PRESERVE_TABLES = ['config_generale', 'mlm_levels', 'mlm_calendar_years', '_prisma_migrations'];
const requiredTables = ['utilisateurs', 'sites', 'config_generale', 'kpay_transactions', 'mlm_payouts', 'withdrawal_requests'];
const applicationTables = [...DELETE_TABLES, ...PRESERVE_TABLES];
const repositoryRoot = path.resolve(__dirname, '../..');
const reviewedForeignKeys: Record<string, string[]> = {
  bonus_attribues: ['membreId:membres:r', 'mlmLevelId:mlm_levels:r'],
  bonus_retraites: ['filleulCrownId:membres:r', 'membreId:membres:r'],
  clients: ['createdById:utilisateurs:r', 'parrainClientId:clients:n', 'siteInscriptionId:sites:r'],
  commissions: ['filleulId:membres:r', 'membreId:membres:r', 'mlmLevelId:mlm_levels:r', 'matrixId:matrices:n', 'positionId:positions:n'],
  kpay_transactions: ['onboardingEtapeId:onboarding_etapes:n', 'payoutId:mlm_payouts:n', 'retourId:retours:n', 'venteId:ventes:n'],
  lignes_retour: ['produitId:produits:r', 'retourId:retours:r'],
  lignes_vente: ['produitId:produits:r', 'venteId:ventes:r'],
  matrices: ['membreId:membres:r', 'mlmLevelId:mlm_levels:r'],
  membres: ['clientId:clients:r', 'mlmLevelId:mlm_levels:r', 'parrainId:membres:n'],
  mlm_payouts: ['membreId:membres:r'],
  mouvements_stock: ['agentId:utilisateurs:r', 'produitId:produits:r', 'siteId:sites:r'],
  onboarding_etapes: ['agentId:utilisateurs:r', 'clientId:clients:r', 'siteId:sites:r'],
  parrain_claims: ['filleulClientId:clients:r', 'parrainClientId:clients:r'],
  placement_history: ['memberId:membres:r'],
  portefeuilles: ['membreId:membres:r'],
  positions: ['matrixId:matrices:r', 'filleulId:membres:n'],
  promotions: ['membreId:membres:r'],
  reinvest_lots: ['membreId:membres:r', 'commissionId:commissions:n'],
  retours: ['venteId:ventes:r'],
  salaires_verses: ['membreId:membres:r'],
  stock_sites: ['produitId:produits:r', 'siteId:sites:r'],
  transactions_portefeuille: ['portefeuilleId:portefeuilles:r'],
  transferts_stock: ['initiateurId:utilisateurs:r', 'produitId:produits:r', 'siteDestinationId:sites:r', 'siteSourceId:sites:r'],
  utilisateurs: ['siteId:sites:n'],
  ventes: ['agentId:utilisateurs:r', 'clientId:clients:n', 'siteId:sites:r'],
  withdrawal_requests: ['membreId:membres:r'],
};

export class SafetyError extends Error {}
function requireSafe(condition: unknown, code: string): asserts condition {
  if (!condition) throw new SafetyError(code);
}
function hash(value: string | Buffer) { return createHash('sha256').update(value).digest('hex'); }
function identifier(value: string) { return `"${value.replace(/"/g, '""')}"`; }
function tableName(value: string) { return `public.${identifier(value)}`; }

type AdminSelection = { preserveAdminId?: string; preserveAdminIds?: string[] };

function normalizedAdminIds(options: AdminSelection) {
  requireSafe(options.preserveAdminId === undefined || options.preserveAdminIds === undefined, 'MIXED_ADMIN_SELECTION');
  if (options.preserveAdminId === undefined && options.preserveAdminIds === undefined) return undefined;
  const values = options.preserveAdminIds === undefined ? [options.preserveAdminId] : options.preserveAdminIds;
  requireSafe(Array.isArray(values) && values.length > 0 && values.every(value => typeof value === 'string'), 'INVALID_ADMIN_SELECTION');
  const ids = values.map(value => value.trim());
  requireSafe(ids.every(value => /^[^\s,\u0000-\u001f\u007f]+$/u.test(value)), 'INVALID_ADMIN_SELECTION');
  requireSafe(new Set(ids).size === ids.length, 'DUPLICATE_ADMIN_SELECTION');
  return ids.sort();
}

export function parseOptions(args: string[]) {
  const result: Record<string, any> = { mode: 'inspect', execute: false };
  const seen = new Set<string>();
  for (let index = 0; index < args.length; index++) {
    const key = args[index];
    requireSafe(['--mode', '--fingerprint', '--bundle', '--backup-root', '--pg-bin', '--execute', '--preserve-admin-id', '--preserve-admin-ids'].includes(key), 'UNKNOWN_ARGUMENT');
    requireSafe(!seen.has(key), 'DUPLICATE_ARGUMENT');
    seen.add(key);
    if (key === '--execute') result.execute = true;
    else {
      const value = args[++index];
      requireSafe(value && !value.startsWith('--'), 'MISSING_ARGUMENT');
      result[key.slice(2)] = value;
    }
  }
  requireSafe(['inspect', 'backup', 'verify', 'purge'].includes(result.mode), 'UNKNOWN_MODE');
  requireSafe(!result.execute || result.mode === 'purge', 'EXECUTE_REQUIRES_PURGE');
  const selected = normalizedAdminIds({ preserveAdminId: result['preserve-admin-id'],
    preserveAdminIds: result['preserve-admin-ids']?.split(',') });
  if (result['preserve-admin-ids'] !== undefined) result['preserve-admin-ids'] = selected;
  else if (result['preserve-admin-id'] !== undefined) result['preserve-admin-id'] = selected[0];
  return result;
}

function connectionUrl(value: string) {
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new SafetyError('INVALID_DATABASE_URL'); }
  requireSafe(['postgres:', 'postgresql:'].includes(parsed.protocol), 'INVALID_DATABASE_URL');
  requireSafe(parsed.hostname && parsed.username && parsed.pathname.length > 1 && !parsed.hash, 'INVALID_DATABASE_URL');
  requireSafe(parsed.port && Number(parsed.port) > 0, 'EXPLICIT_DATABASE_PORT_REQUIRED');
  requireSafe([...parsed.searchParams.keys()].every(key => key === 'sslmode'), 'UNSAFE_CONNECTION_OPTION');
  requireSafe(parsed.searchParams.getAll('sslmode').length <= 1, 'UNSAFE_CONNECTION_OPTION');
  const local = ['127.0.0.1', '[::1]', 'localhost'].includes(parsed.hostname);
  requireSafe(['disable', 'require', 'verify-full'].includes(parsed.searchParams.get('sslmode') || 'disable'), 'UNSUPPORTED_SSL_MODE');
  requireSafe(local || ['require', 'verify-full'].includes(parsed.searchParams.get('sslmode')), 'REMOTE_TLS_REQUIRED');
  requireSafe(!parsed.hostname.includes('pooler'), 'DIRECT_CONNECTION_REQUIRED');
  return parsed;
}

function resolvedConnection(value: string) {
  const target = connectionUrl(value);
  return { host: target.hostname.replace(/^\[|\]$/g, ''), port: Number(target.port),
    user: decodeURIComponent(target.username), password: decodeURIComponent(target.password),
    database: decodeURIComponent(target.pathname.slice(1)), sslMode: target.searchParams.get('sslmode') || 'disable' };
}

export function assertRestoreTarget(restoreUrl: string, sourceUrl: string) {
  const restore = connectionUrl(restoreUrl);
  const source = connectionUrl(sourceUrl);
  requireSafe(['127.0.0.1', '[::1]'].includes(restore.hostname), 'RESTORE_REQUIRES_LITERAL_LOOPBACK');
  requireSafe(/^\/ebn_restore_[a-z0-9_]+$/.test(restore.pathname), 'RESTORE_REQUIRES_DEDICATED_DATABASE');
  requireSafe(restore.pathname !== source.pathname, 'RESTORE_MUST_DIFFER_FROM_SOURCE');
}

type ForeignKey = { sourceSchema: string; source: string; targetSchema: string; target: string;
  name?: string; sourceColumns?: string[]; targetColumns?: string[]; onDelete?: string; onUpdate?: string };
type Trigger = { table: string; name: string; enabled: string; functionName: string; functionSchema: string; type: number };
type Catalog = { tables: string[]; foreignKeys: ForeignKey[]; triggers: Trigger[]; unsafeObjects: unknown[] };

export function orderDeletes(tables: string[], foreignKeys: ForeignKey[]) {
  const pending = new Set(tables);
  const result: string[] = [];
  while (pending.size) {
    const next = [...pending].find(table => !foreignKeys.some(key =>
      key.target === table && key.source !== table && pending.has(key.source)));
    requireSafe(next, 'DEPENDENCY_CYCLE');
    result.push(next);
    pending.delete(next);
  }
  return result;
}

export function assertCatalogSafe(catalog: Catalog) {
  requireSafe(requiredTables.every(table => catalog.tables.includes(table)), 'MISSING_REQUIRED_TABLE');
  for (const key of catalog.foreignKeys) {
    const sourceKnown = key.sourceSchema === 'public' && applicationTables.includes(key.source);
    const targetKnown = key.targetSchema === 'public' && applicationTables.includes(key.target);
    requireSafe(sourceKnown === targetKnown, 'UNKNOWN_DEPENDENCY');
    requireSafe(!(PRESERVE_TABLES.includes(key.source) && DELETE_TABLES.includes(key.target)), 'PRESERVED_TABLE_DEPENDENCY');
    if (sourceKnown) {
      const column = key.sourceColumns?.[0];
      requireSafe(key.sourceColumns?.length === 1 && key.targetColumns?.length === 1 && key.targetColumns[0] === 'id'
        && key.name === `${key.source}_${column}_fkey` && key.onUpdate === 'c'
        && reviewedForeignKeys[key.source]?.includes(`${column}:${key.target}:${key.onDelete}`), 'UNKNOWN_FOREIGN_KEY');
    }
  }
  requireSafe(catalog.unsafeObjects.length === 0, 'UNREVIEWED_DATABASE_OBJECT');
  for (const trigger of catalog.triggers) {
    requireSafe(trigger.enabled === 'O', 'DISABLED_TRIGGER');
    const immutable = trigger.table === 'placement_history' && trigger.name === 'placement_history_immutable'
      && trigger.functionName === 'reject_placement_history_changes' && trigger.type === 27;
    const positions = trigger.table === 'positions' && trigger.name === 'positions_tree_check'
      && trigger.functionName === 'enforce_matrix_position' && trigger.type === 23;
    requireSafe(trigger.functionSchema === 'public' && (immutable || positions), 'UNKNOWN_TRIGGER');
  }
  orderDeletes(catalog.tables.filter(table => DELETE_TABLES.includes(table)), catalog.foreignKeys);
}

async function connect(sourceUrl: string) {
  const target = resolvedConnection(sourceUrl);
  const config = { host: target.host, port: target.port, user: target.user, database: target.database,
    password: () => target.password, ssl: target.sslMode === 'disable' ? false : { rejectUnauthorized: target.sslMode === 'verify-full' },
    options: '-c timezone=UTC -c datestyle=ISO,YMD', replication: 'false', client_encoding: 'UTF8',
    application_name: 'ebn-maintenance', connectionTimeoutMillis: 10000 };
  const client = new Client(config);
  await client.connect();
  await client.query("SET search_path = pg_catalog; SET timezone = 'UTC'; SET datestyle = 'ISO, YMD'; SET statement_timeout = '60s'; SET lock_timeout = '5s'");
  return client;
}

async function targetFingerprint(client: Client, sourceUrl: string) {
  const target = connectionUrl(sourceUrl);
  const identity = (await client.query(`SELECT current_database() AS database, current_user AS role,
    oid::text AS database_oid, inet_server_addr()::text AS address, inet_server_port() AS port,
    current_setting('server_version_num') AS version FROM pg_database WHERE datname=current_database()`)).rows[0];
  return hash(JSON.stringify({ host: target.hostname, port: target.port, ...identity, schema: 'public' }));
}

async function assertFingerprint(client: Client, sourceUrl: string, fingerprint: string) {
  requireSafe(fingerprint && fingerprint === await targetFingerprint(client, sourceUrl), 'TARGET_FINGERPRINT_MISMATCH');
}

async function readCatalog(client: Client): Promise<Catalog> {
  const tables = (await client.query(`SELECT relname AS name FROM pg_class JOIN pg_namespace ON relnamespace=pg_namespace.oid
    WHERE nspname='public' AND relkind='r' ORDER BY relname COLLATE "C"`)).rows.map(row => row.name);
  const foreignKeys = (await client.query(`SELECT source_ns.nspname AS "sourceSchema", source.relname AS source,
    target_ns.nspname AS "targetSchema", target.relname AS target, conname AS name,
    confdeltype AS "onDelete", confupdtype AS "onUpdate",
    ARRAY(SELECT attname::text FROM unnest(conkey) WITH ORDINALITY columns(number,position)
      JOIN pg_attribute ON attrelid=conrelid AND attnum=number ORDER BY position) AS "sourceColumns",
    ARRAY(SELECT attname::text FROM unnest(confkey) WITH ORDINALITY columns(number,position)
      JOIN pg_attribute ON attrelid=confrelid AND attnum=number ORDER BY position) AS "targetColumns"
    FROM pg_constraint constraint_row JOIN pg_class source ON source.oid=conrelid
    JOIN pg_namespace source_ns ON source_ns.oid=source.relnamespace
    JOIN pg_class target ON target.oid=confrelid JOIN pg_namespace target_ns ON target_ns.oid=target.relnamespace
    WHERE contype='f' ORDER BY source_ns.nspname, source.relname, conname`)).rows;
  const triggers = (await client.query(`SELECT relname AS table, tgname AS name, tgenabled AS enabled,
    proname AS "functionName", function_ns.nspname AS "functionSchema", tgtype::int AS type
    FROM pg_trigger JOIN pg_class ON tgrelid=pg_class.oid JOIN pg_namespace ON relnamespace=pg_namespace.oid
    JOIN pg_proc ON tgfoid=pg_proc.oid JOIN pg_namespace function_ns ON function_ns.oid=pronamespace
    WHERE pg_namespace.nspname='public' AND NOT tgisinternal ORDER BY relname, tgname`)).rows;
  const unsafeObjects = (await client.query(`
    SELECT 'relation' AS kind FROM pg_class JOIN pg_namespace ON relnamespace=pg_namespace.oid
      WHERE nspname='public' AND (relkind IN ('p','f','v','m') OR relrowsecurity OR relforcerowsecurity)
    UNION ALL SELECT 'rule' FROM pg_rewrite JOIN pg_class ON ev_class=pg_class.oid
      JOIN pg_namespace ON relnamespace=pg_namespace.oid WHERE nspname='public'
    UNION ALL SELECT 'inheritance' FROM pg_inherits JOIN pg_class ON pg_class.oid IN (inhrelid, inhparent)
      JOIN pg_namespace ON relnamespace=pg_namespace.oid WHERE nspname='public'
    UNION ALL SELECT 'external_view' FROM pg_depend JOIN pg_rewrite ON objid=pg_rewrite.oid AND classid='pg_rewrite'::regclass
      JOIN pg_class ON refobjid=pg_class.oid AND refclassid='pg_class'::regclass
      JOIN pg_namespace ON relnamespace=pg_namespace.oid WHERE nspname='public'
    UNION ALL SELECT 'event_trigger' FROM pg_event_trigger WHERE evtenabled <> 'D'
    UNION ALL SELECT 'publication' FROM pg_publication_tables WHERE schemaname='public'
    UNION ALL SELECT 'disabled_internal_trigger' FROM pg_trigger JOIN pg_class ON tgrelid=pg_class.oid
      JOIN pg_namespace ON relnamespace=pg_namespace.oid WHERE nspname='public' AND tgisinternal AND tgenabled <> 'O'
    UNION ALL SELECT 'function' FROM pg_proc JOIN pg_namespace ON pronamespace=pg_namespace.oid
      WHERE nspname='public' AND proname NOT IN ('enforce_matrix_position','reject_placement_history_changes')
      AND NOT EXISTS (SELECT 1 FROM pg_depend WHERE classid='pg_proc'::regclass AND objid=pg_proc.oid AND deptype='e')
    UNION ALL SELECT 'unvalidated_constraint' FROM pg_constraint JOIN pg_class ON conrelid=pg_class.oid
      JOIN pg_namespace ON relnamespace=pg_namespace.oid WHERE nspname='public' AND NOT convalidated
  `)).rows;
  return { tables, foreignKeys, triggers, unsafeObjects };
}

async function counts(client: Client, tables: string[]) {
  const result: Record<string, string> = {};
  for (const table of tables) result[table] = (await client.query(`SELECT count(*)::text AS count FROM ${tableName(table)}`)).rows[0].count;
  return result;
}

async function selectedAdmins(client: Client, preserveAdminIds?: string[]) {
  const result = await client.query(`SELECT id, "passwordHash", md5((to_jsonb(admin) - 'siteId')::text) AS digest
    FROM public.utilisateurs admin WHERE role::text='SUPER_ADMIN'`);
  if (preserveAdminIds !== undefined) {
    return preserveAdminIds.map(id => {
      const selected = result.rows.find(row => row.id === id);
      requireSafe(selected?.passwordHash, 'SELECTED_SUPER_ADMIN_NOT_FOUND');
      return selected;
    });
  }
  requireSafe(result.rows.length === 1 && result.rows[0].passwordHash, 'AMBIGUOUS_SUPER_ADMIN');
  return result.rows;
}

async function assertNoPayments(client: Client) {
  const pending = (await client.query(`SELECT
    (SELECT count(*) FROM public.kpay_transactions WHERE status::text IN ('PENDING','PROCESSING')
      OR (status::text IN ('COMPLETED','REFUNDED') AND "terminalEventProcessedAt" IS NULL)) +
    (SELECT count(*) FROM public.mlm_payouts WHERE statut::text IN ('PENDING','PROCESSING')) +
    (SELECT count(*) FROM public.withdrawal_requests WHERE type::text='MOBILE_MONEY' AND statut::text IN ('EN_ATTENTE','APPROUVE'))
    AS pending`)).rows[0].pending;
  requireSafe(pending === '0', 'PENDING_PROVIDER_PAYMENTS');
}

async function assertMaintenance(client: Client) {
  await client.query('SELECT pg_stat_clear_snapshot()');
  const proof = (await client.query(`SELECT
    (SELECT count(*) FROM pg_stat_activity WHERE datid=(SELECT oid FROM pg_database WHERE datname=current_database())
      AND pid<>pg_backend_pid())::int AS sessions,
    (SELECT count(*) FROM pg_roles WHERE rolcanlogin AND rolname<>current_user
      AND has_database_privilege(oid,current_database(),'CONNECT'))::int AS other_logins,
    (SELECT count(*) FROM pg_database, aclexplode(coalesce(datacl,acldefault('d',datdba)))
      WHERE datname=current_database() AND grantee=0 AND privilege_type='CONNECT')::int AS public_connect,
    (SELECT count(*) FROM pg_prepared_xacts WHERE database=current_database())::int AS prepared,
    (SELECT count(*) FROM pg_subscription WHERE subdbid=(SELECT oid FROM pg_database WHERE datname=current_database()) AND subenabled)::int AS subscriptions,
    (SELECT rolsuper OR pg_has_role(current_user,'pg_read_all_stats','MEMBER') FROM pg_roles WHERE rolname=current_user) AS visibility
  `)).rows[0];
  requireSafe(proof.visibility, 'MAINTENANCE_VISIBILITY_REQUIRED');
  requireSafe(proof.sessions === 0, 'OTHER_DATABASE_SESSIONS');
  requireSafe(proof.other_logins === 0 && proof.public_connect === 0, 'DATABASE_LOGIN_FENCE_REQUIRED');
  requireSafe(proof.prepared === 0 && proof.subscriptions === 0, 'BACKGROUND_WRITERS_PRESENT');
}

export async function inspectTarget(sourceUrl: string) {
  const client = await connect(sourceUrl);
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const catalog = await readCatalog(client);
    return { fingerprint: await targetFingerprint(client, sourceUrl), counts: await counts(client, catalog.tables),
      unknownTables: catalog.tables.filter(table => !applicationTables.includes(table)),
      dependenciesReviewRequired: catalog.unsafeObjects.length, schema: 'public' };
  } finally { await client.query('ROLLBACK').catch(() => undefined); await client.end(); }
}

function assertOutsideGit(directory: string) {
  const absolute = path.resolve(directory);
  const relative = path.relative(repositoryRoot, absolute);
  requireSafe(relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative), 'BACKUP_INSIDE_REPOSITORY');
  let cursor = absolute;
  while (true) {
    if (fs.existsSync(cursor)) {
      requireSafe(!fs.lstatSync(cursor).isSymbolicLink(), 'BACKUP_SYMLINK_FORBIDDEN');
      requireSafe(!fs.existsSync(path.join(cursor, '.git')), 'BACKUP_INSIDE_REPOSITORY');
    }
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
}

function restrictDirectory(directory: string, create = false) {
  assertOutsideGit(directory);
  if (create && !fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    if (process.platform === 'win32') {
      execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
        "$ErrorActionPreference='Stop'; $acl=New-Object System.Security.AccessControl.DirectorySecurity; $sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User; $acl.SetOwner($sid); $acl.SetAccessRuleProtection($true,$false); foreach($identity in @($sid,[System.Security.Principal.SecurityIdentifier]'S-1-5-18')) {$rule=New-Object System.Security.AccessControl.FileSystemAccessRule($identity,'FullControl','ContainerInherit,ObjectInherit','None','Allow'); $acl.AddAccessRule($rule)}; [System.IO.Directory]::SetAccessControl($env:MAINTENANCE_ACL_PATH,$acl)"],
        { env: { ...process.env, MAINTENANCE_ACL_PATH: directory }, windowsHide: true, stdio: 'pipe' });
    }
  }
  requireSafe(fs.existsSync(directory) && fs.statSync(directory).isDirectory(), 'BACKUP_DIRECTORY_REQUIRED');
  assertPrivatePath(directory);
}

export const WINDOWS_PRIVATE_ACL_POLICY = "if($acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value -notin $allowed) {exit 2}; if($acl.Access.Count -eq 0) {exit 2}; foreach($rule in $acl.Access) {if($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value -notin $allowed) {exit 2}}";

function assertPrivatePath(filename: string, recursive = false) {
  if (process.platform === 'win32') {
    try {
      execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
        `$ErrorActionPreference='Stop'; $sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value; $allowed=@($sid,'S-1-5-18'); $pending=New-Object 'System.Collections.Generic.Stack[string]'; $pending.Push($env:MAINTENANCE_ACL_PATH); while($pending.Count -gt 0) {$item=$pending.Pop(); if(([System.IO.File]::GetAttributes($item) -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {exit 3}; if([System.IO.Directory]::Exists($item)) {$acl=[System.IO.Directory]::GetAccessControl($item); if($env:MAINTENANCE_ACL_RECURSIVE -eq '1') {foreach($child in [System.IO.Directory]::GetFileSystemEntries($item)) {$pending.Push($child)}}} else {$acl=[System.IO.File]::GetAccessControl($item)}; ${WINDOWS_PRIVATE_ACL_POLICY}}`],
        { env: { ...process.env, MAINTENANCE_ACL_PATH: filename, MAINTENANCE_ACL_RECURSIVE: recursive ? '1' : '0' }, windowsHide: true, stdio: 'pipe' });
    } catch { throw new SafetyError('BACKUP_ACL_NOT_PRIVATE'); }
  } else {
    const stat = fs.lstatSync(filename);
    requireSafe(!stat.isSymbolicLink() && (stat.mode & 0o077) === 0 && stat.uid === process.getuid(), 'BACKUP_ACL_NOT_PRIVATE');
    if (recursive && stat.isDirectory()) for (const child of fs.readdirSync(filename)) assertPrivatePath(path.join(filename, child), true);
  }
}

async function assertRestorePrivacy(client: Client, restoreUrl: string) {
  const target = resolvedConnection(restoreUrl);
  const service = (await client.query(`SELECT system_user = 'scram-sha-256:' || current_user AS authenticated,
    inet_server_addr()::text AS address, inet_server_port() AS port,
    current_setting('listen_addresses') AS listen, current_setting('data_directory') AS directory,
    current_setting('hba_file') AS hba, current_setting('config_file') AS config,
    current_setting('logging_collector') AS logging, current_setting('log_directory') AS logs,
    current_setting('transaction_read_only') AS read_only,
    (SELECT count(*)::int FROM pg_roles WHERE rolcanlogin AND rolname<>current_user) AS other_logins,
    (SELECT count(*)::int FROM pg_database WHERE datname NOT IN ('postgres','template0','template1')
      AND datname !~ '^ebn_restore_[a-z0-9_]+$') AS shared_databases,
    (SELECT count(*)::int FROM pg_tablespace WHERE pg_tablespace_location(oid)<>'') AS external_tablespaces
  `)).rows[0];
  requireSafe(service.authenticated, 'RESTORE_SCRAM_AUTH_REQUIRED');
  requireSafe(['127.0.0.1/32', '::1/128'].includes(service.address) && service.port === target.port
    && service.read_only === 'off' && service.listen.split(',').every((address: string) => ['127.0.0.1', '::1'].includes(address.trim())), 'RESTORE_NOT_LOCAL_WRITABLE');
  requireSafe(service.other_logins === 0 && service.shared_databases === 0, 'RESTORE_DEDICATED_CLUSTER_REQUIRED');
  await assertMaintenance(client);
  const sessions = (await client.query(`SELECT count(*)::int AS count FROM pg_stat_activity
    WHERE backend_type='client backend' AND pid<>pg_backend_pid()`)).rows[0].count;
  requireSafe(sessions === 0, 'RESTORE_CLUSTER_NOT_EXCLUSIVE');
  const rules = (await client.query('SELECT type, address, netmask, auth_method, error FROM pg_hba_file_rules')).rows;
  requireSafe(rules.length > 0 && rules.every(rule => !rule.error && (rule.auth_method === 'reject'
    || (rule.auth_method === 'scram-sha-256' && (rule.type === 'local'
      || (['host', 'hostssl', 'hostnossl'].includes(rule.type) &&
        ((rule.address === '127.0.0.1' && rule.netmask === '255.255.255.255')
          || (rule.address === '::1' && rule.netmask === 'ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff'))))))), 'RESTORE_SCRAM_HBA_REQUIRED');
  try {
    requireSafe(path.isAbsolute(service.directory) && service.external_tablespaces === 0 && service.logging === 'on', 'RESTORE_PRIVATE_STORAGE_REQUIRED');
    assertOutsideGit(service.directory);
    for (const filename of [service.hba, service.config, path.resolve(service.directory, service.logs)]) {
      const relative = path.relative(service.directory, filename);
      requireSafe(relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative), 'RESTORE_PRIVATE_STORAGE_REQUIRED');
    }
    const pid = fs.readFileSync(path.join(service.directory, 'postmaster.pid'), 'utf8').split(/\r?\n/);
    requireSafe(Number(pid[3]) === target.port && path.resolve(pid[1]) === path.resolve(service.directory), 'RESTORE_PRIVATE_STORAGE_REQUIRED');
    assertPrivatePath(service.directory, true);
  } catch { throw new SafetyError('RESTORE_PRIVATE_STORAGE_REQUIRED'); }
}

async function native(pgBin: string, executable: string, sourceUrl: string, args: string[]) {
  requireSafe(pgBin && path.isAbsolute(pgBin), 'PG_BIN_ABSOLUTE_PATH_REQUIRED');
  const filename = path.join(pgBin, executable + (process.platform === 'win32' ? '.exe' : ''));
  requireSafe(fs.existsSync(filename), 'NATIVE_POSTGRES_TOOL_MISSING');
  const target = resolvedConnection(sourceUrl);
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('PG')));
  Object.assign(env, { PGHOST: target.host, PGPORT: String(target.port),
    PGUSER: target.user, PGPASSWORD: target.password, PGDATABASE: target.database, PGSSLMODE: target.sslMode,
    PGPASSFILE: path.join(pgBin, '.maintenance-no-passfile'), PGCLIENTENCODING: 'UTF8',
    PGCONNECT_TIMEOUT: '10', PGAPPNAME: 'ebn-maintenance-native', PGOPTIONS: '-c timezone=UTC -c datestyle=ISO,YMD' });
  return new Promise<string>((resolve, reject) => {
    const child = spawn(filename, args, { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    const timer = setTimeout(() => { child.kill(); reject(new SafetyError('NATIVE_TOOL_TIMEOUT')); }, 300000);
    child.stdout.on('data', data => { output += data.toString(); });
    child.stderr.resume();
    child.on('error', () => { clearTimeout(timer); reject(new SafetyError('NATIVE_TOOL_FAILED')); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) reject(new SafetyError('NATIVE_TOOL_FAILED'));
      else resolve(output);
    });
  });
}

async function snapshot(client: Client, sourceUrl: string, pgBin: string) {
  const catalog = await readCatalog(client);
  const data: Record<string, { count: string; digest: string }> = {};
  for (const table of catalog.tables) {
    await client.query(`DECLARE maintenance_rows NO SCROLL CURSOR FOR SELECT to_jsonb(record)::text AS value
      FROM ${tableName(table)} record ORDER BY to_jsonb(record)::text COLLATE "C"`);
    const digest = createHash('sha256');
    let count = 0n;
    try {
      while (true) {
        const batch = await client.query('FETCH 1000 FROM maintenance_rows');
        if (!batch.rows.length) break;
        for (const row of batch.rows) { digest.update(`${Buffer.byteLength(row.value)}:${row.value}`); count++; }
      }
    } finally { await client.query('CLOSE maintenance_rows'); }
    data[table] = { count: String(count), digest: digest.digest('hex') };
  }
  const sequences: Record<string, unknown> = {};
  for (const sequence of (await client.query(`SELECT sequencename FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename`)).rows) {
    sequences[sequence.sequencename] = (await client.query(`SELECT last_value::text, is_called FROM ${tableName(sequence.sequencename)}`)).rows[0];
  }
  const schema = (await client.query(`SELECT kind, identity, definition FROM (
    SELECT 'column' AS kind, relname || '.' || attnum::text AS identity,
      jsonb_build_array(attname,format_type(atttypid,atttypmod),attnotnull,attidentity,attgenerated,
        pg_get_expr(adbin,adrelid))::text AS definition
      FROM pg_attribute JOIN pg_class ON attrelid=pg_class.oid JOIN pg_namespace ON relnamespace=pg_namespace.oid
      LEFT JOIN pg_attrdef ON adrelid=attrelid AND adnum=attnum WHERE nspname='public' AND attnum>0 AND NOT attisdropped
    UNION ALL SELECT 'constraint', relname || '.' || conname,
      jsonb_build_array(pg_get_constraintdef(pg_constraint.oid),convalidated,condeferrable,condeferred)::text
      FROM pg_constraint JOIN pg_class ON conrelid=pg_class.oid JOIN pg_namespace ON relnamespace=pg_namespace.oid WHERE nspname='public'
    UNION ALL SELECT 'index', indexname, indexdef FROM pg_indexes WHERE schemaname='public'
    UNION ALL SELECT 'trigger', relname || '.' || tgname, jsonb_build_array(pg_get_triggerdef(pg_trigger.oid),tgenabled)::text
      FROM pg_trigger JOIN pg_class ON tgrelid=pg_class.oid JOIN pg_namespace ON relnamespace=pg_namespace.oid WHERE nspname='public' AND NOT tgisinternal
    UNION ALL SELECT 'function', proname || '(' || pg_get_function_identity_arguments(pg_proc.oid) || ')', pg_get_functiondef(pg_proc.oid)
      FROM pg_proc JOIN pg_namespace ON pronamespace=pg_namespace.oid WHERE nspname='public' AND prokind IN ('f','p')
      AND NOT EXISTS (SELECT 1 FROM pg_depend WHERE classid='pg_proc'::regclass AND objid=pg_proc.oid AND deptype='e')
    UNION ALL SELECT 'enum', typname, string_agg(enumlabel,',' ORDER BY enumsortorder)
      FROM pg_type JOIN pg_namespace ON typnamespace=pg_namespace.oid JOIN pg_enum ON enumtypid=pg_type.oid WHERE nspname='public' GROUP BY typname
    UNION ALL SELECT 'sequence', sequencename, (to_jsonb(sequence_row)-'sequenceowner'-'last_value')::text FROM pg_sequences sequence_row WHERE schemaname='public'
  ) definitions ORDER BY kind COLLATE "C", identity COLLATE "C"`)).rows;
  return { data, sequences, schema: hash(JSON.stringify(schema)) };
}

type BackupOptions = AdminSelection & { sourceUrl: string; fingerprint: string; backupRoot: string; pgBin: string };
type VerifyOptions = AdminSelection & { sourceUrl: string; fingerprint: string; bundle: string; restoreUrl: string; pgBin: string };
type PurgeOptions = AdminSelection & { sourceUrl: string; fingerprint: string; execute?: boolean; bundle?: string; restoreUrl?: string; pgBin?: string };

export async function createBackup(options: BackupOptions) {
  const selection = normalizedAdminIds(options);
  const client = await connect(options.sourceUrl);
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await assertFingerprint(client, options.sourceUrl, options.fingerprint);
    restrictDirectory(options.backupRoot, true);
    assertCatalogSafe(await readCatalog(client));
    const preservedAdmins = await selectedAdmins(client, selection);
    await assertNoPayments(client);
    await assertMaintenance(client);
    const bundle = path.join(options.backupRoot, `backup-${randomUUID()}`);
    restrictDirectory(bundle, true);
    const before = await snapshot(client, options.sourceUrl, options.pgBin);
    const exported = (await client.query('SELECT pg_export_snapshot() AS snapshot')).rows[0].snapshot;
    const dump = path.join(bundle, 'public.dump');
    await native(options.pgBin, 'pg_dump', options.sourceUrl, ['--schema=public', '--format=custom', `--snapshot=${exported}`, `--file=${dump}`]);
    const after = await snapshot(client, options.sourceUrl, options.pgBin);
    requireSafe(JSON.stringify(before) === JSON.stringify(after), 'BACKUP_CHANGED_DURING_EXPORT');
    await assertMaintenance(client);
    fs.writeFileSync(path.join(bundle, 'manifest.json'), JSON.stringify({ format: 2, fingerprint: options.fingerprint,
      preservedAdminIds: preservedAdmins.map(admin => admin.id),
      preservedAdminId: preservedAdmins.length === 1 ? preservedAdmins[0].id : undefined, requiresAdminSelection: selection !== undefined,
      createdAt: new Date().toISOString(), dumpHash: hash(fs.readFileSync(dump)), snapshot: before }, null, 2), { flag: 'wx', mode: 0o600 });
    if (process.platform !== 'win32') fs.chmodSync(dump, 0o600);
    assertPrivatePath(dump);
    assertPrivatePath(path.join(bundle, 'manifest.json'));
    return { bundle, fingerprint: options.fingerprint, restored: false };
  } finally { await client.query('ROLLBACK').catch(() => undefined); await client.end(); }
}

function readManifest(options: AdminSelection & { bundle: string; fingerprint: string }) {
  const selection = normalizedAdminIds(options);
  restrictDirectory(options.bundle);
  for (const file of ['manifest.json', 'public.dump']) {
    const filename = path.join(options.bundle, file);
    requireSafe(!fs.lstatSync(filename).isSymbolicLink(), 'BACKUP_SYMLINK_FORBIDDEN');
    assertPrivatePath(filename);
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(options.bundle, 'manifest.json'), 'utf8'));
  requireSafe([1, 2].includes(manifest.format) && manifest.fingerprint === options.fingerprint, 'TARGET_FINGERPRINT_MISMATCH');
  const storedIds = manifest.format === 1 ? [manifest.preservedAdminId] : manifest.preservedAdminIds;
  let preservedAdminIds: string[];
  try {
    preservedAdminIds = normalizedAdminIds({ preserveAdminIds: storedIds });
  } catch { throw new SafetyError('PRESERVED_ADMIN_MISMATCH'); }
  requireSafe(preservedAdminIds && JSON.stringify(storedIds) === JSON.stringify(preservedAdminIds)
    && typeof manifest.requiresAdminSelection === 'boolean'
    && (manifest.requiresAdminSelection || preservedAdminIds.length === 1)
    && (manifest.preservedAdminId === undefined || (preservedAdminIds.length === 1 && manifest.preservedAdminId === preservedAdminIds[0]))
    && (!manifest.requiresAdminSelection || selection !== undefined)
    && (selection === undefined || JSON.stringify(selection) === JSON.stringify(preservedAdminIds)), 'PRESERVED_ADMIN_MISMATCH');
  requireSafe(manifest.dumpHash === hash(fs.readFileSync(path.join(options.bundle, 'public.dump'))), 'BACKUP_HASH_MISMATCH');
  return { ...manifest, preservedAdminIds };
}

export async function verifyBackup(options: VerifyOptions) {
  assertRestoreTarget(options.restoreUrl, options.sourceUrl);
  requireSafe(resolvedConnection(options.restoreUrl).password.length > 0, 'RESTORE_PASSWORD_REQUIRED');
  const manifest = readManifest(options);
  const restored = await connect(options.restoreUrl);
  try {
    await assertRestorePrivacy(restored, options.restoreUrl);
    const objects = (await restored.query(`SELECT count(*)::int AS count FROM pg_class JOIN pg_namespace ON relnamespace=pg_namespace.oid
      WHERE nspname NOT IN ('pg_catalog','information_schema') AND nspname NOT LIKE 'pg_toast%'`)).rows[0].count;
    requireSafe(objects === 0, 'RESTORE_DATABASE_NOT_EMPTY');
    const restoreList = path.join(options.bundle, `restore-${randomUUID()}.list`);
    const listing = await native(options.pgBin, 'pg_restore', options.restoreUrl, ['--list', path.join(options.bundle, 'public.dump')]);
    fs.writeFileSync(restoreList, listing.split(/\r?\n/).filter(line => !/^\d+; \d+ \d+ SCHEMA - public /.test(line)).join('\n'), { flag: 'wx', mode: 0o600 });
    await native(options.pgBin, 'pg_restore', options.restoreUrl, ['--exit-on-error', '--single-transaction', '--no-owner', '--no-privileges', '--use-list', restoreList,
      '--dbname', decodeURIComponent(connectionUrl(options.restoreUrl).pathname.slice(1)), path.join(options.bundle, 'public.dump')]);
    await assertRestorePrivacy(restored, options.restoreUrl);
    await restored.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const actual = await snapshot(restored, options.restoreUrl, options.pgBin);
    requireSafe(JSON.stringify(actual) === JSON.stringify(manifest.snapshot), 'RESTORE_CONTENT_MISMATCH');
    assertCatalogSafe(await readCatalog(restored));
    const restoredAdmins = await selectedAdmins(restored, manifest.preservedAdminIds);
    requireSafe(JSON.stringify(restoredAdmins.map(admin => admin.id)) === JSON.stringify(manifest.preservedAdminIds), 'PRESERVED_ADMIN_MISMATCH');
    requireSafe(manifest.dumpHash === hash(fs.readFileSync(path.join(options.bundle, 'public.dump'))), 'BACKUP_HASH_MISMATCH');
    return { verified: true, fingerprint: options.fingerprint, snapshot: actual };
  } finally { await restored.query('ROLLBACK').catch(() => undefined); await restored.end(); }
}

export async function purge(options: PurgeOptions) {
  const selection = normalizedAdminIds(options);
  requireSafe(!options.execute || (options.bundle && options.restoreUrl && options.pgBin), 'VERIFIED_BACKUP_REQUIRED');
  if (options.bundle) readManifest({ ...options, bundle: options.bundle });
  const client = await connect(options.sourceUrl);
  try {
    await client.query(options.execute ? 'BEGIN ISOLATION LEVEL READ COMMITTED' : 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await assertFingerprint(client, options.sourceUrl, options.fingerprint);
    let catalog = await readCatalog(client);
    assertCatalogSafe(catalog);
    let admins = await selectedAdmins(client, selection);
    await assertNoPayments(client);
    const order = orderDeletes(catalog.tables.filter(table => DELETE_TABLES.includes(table)), catalog.foreignKeys);
    let deleteCounts = await counts(client, order);
    deleteCounts.utilisateurs = String(BigInt(deleteCounts.utilisateurs) - BigInt(admins.length));
    if (!options.execute) return { executed: false, deleteCounts, preservedTables: catalog.tables.filter(table => !DELETE_TABLES.includes(table)) };
    await assertMaintenance(client);
    await client.query(`LOCK TABLE ${catalog.tables.map(tableName).join(', ')} IN ACCESS EXCLUSIVE MODE`);
    const lockedCatalog = await readCatalog(client);
    requireSafe(JSON.stringify(catalog) === JSON.stringify(lockedCatalog), 'CATALOG_CHANGED');
    catalog = lockedCatalog;
    assertCatalogSafe(catalog);
    admins = await selectedAdmins(client, selection);
    deleteCounts = await counts(client, order);
    deleteCounts.utilisateurs = String(BigInt(deleteCounts.utilisateurs) - BigInt(admins.length));
    const verified = await verifyBackup(options as VerifyOptions);
    const before = await snapshot(client, options.sourceUrl, options.pgBin);
    requireSafe(JSON.stringify(before) === JSON.stringify(verified.snapshot), 'LIVE_BACKUP_MISMATCH');
    await assertMaintenance(client);
    await assertNoPayments(client);
    const preservedIds = admins.map(admin => admin.id);
    await client.query('UPDATE public.utilisateurs SET "siteId"=NULL WHERE id=ANY($1::text[])', [preservedIds]);
    const immutable = catalog.triggers.find(trigger => trigger.name === 'placement_history_immutable');
    if (immutable) await client.query('ALTER TABLE public.placement_history DISABLE TRIGGER placement_history_immutable');
    for (const table of order) {
      if (table === 'utilisateurs') await client.query('DELETE FROM public.utilisateurs WHERE NOT (id=ANY($1::text[]))', [preservedIds]);
      else await client.query(`DELETE FROM ${tableName(table)}`);
    }
    if (immutable) await client.query('ALTER TABLE public.placement_history ENABLE TRIGGER placement_history_immutable');
    const preservedAdmins = await selectedAdmins(client, preservedIds);
    requireSafe(JSON.stringify(admins) === JSON.stringify(preservedAdmins), 'SUPER_ADMIN_CHANGED');
    const remaining = await counts(client, order);
    requireSafe(order.every(table => remaining[table] === (table === 'utilisateurs' ? String(admins.length) : '0')), 'PURGE_POSTCONDITION_FAILED');
    const after = await snapshot(client, options.sourceUrl, options.pgBin);
    for (const table of catalog.tables.filter(table => !DELETE_TABLES.includes(table))) {
      requireSafe(JSON.stringify(before.data[table]) === JSON.stringify(after.data[table]), 'PRESERVED_DATA_CHANGED');
    }
    requireSafe(before.schema === after.schema && JSON.stringify(before.sequences) === JSON.stringify(after.sequences), 'SCHEMA_OR_SEQUENCE_CHANGED');
    await assertMaintenance(client);
    await client.query('COMMIT');
    return { executed: true, deleteCounts, preservedTables: catalog.tables.filter(table => !DELETE_TABLES.includes(table)) };
  } finally { await client.query('ROLLBACK').catch(() => undefined); await client.end(); }
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const sourceUrl = process.env.MAINTENANCE_DATABASE_URL;
  requireSafe(sourceUrl, 'MAINTENANCE_DATABASE_URL_REQUIRED');
  const common = { sourceUrl, fingerprint: options.fingerprint, pgBin: options['pg-bin'], bundle: options.bundle,
    restoreUrl: process.env.MAINTENANCE_RESTORE_URL, backupRoot: options['backup-root'], preserveAdminId: options['preserve-admin-id'],
    preserveAdminIds: options['preserve-admin-ids'] };
  if (options.mode === 'inspect') return inspectTarget(sourceUrl);
  if (options.mode === 'backup') return createBackup(common);
  if (options.mode === 'verify') {
    const result = await verifyBackup(common);
    return { verified: result.verified, fingerprint: result.fingerprint };
  }
  return purge({ ...common, execute: options.execute });
}

if (require.main === module) {
  main().then(result => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)).catch(error => {
    process.stderr.write(`${error instanceof SafetyError ? error.message : 'MAINTENANCE_FAILED_NO_DETAILS_LOGGED'}\n`);
    process.exitCode = 1;
  });
}
