import { createHash, randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { Client, Pool } from 'pg';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { assertCatalogSafe, assertPrivatePath, assertRestoreTarget, createBackup, inspectTarget, readCatalog,
  restrictDirectory, SafetyError, schemaState, verifyBackup } from './maintenance';
import { auditMlm } from './mlm-audit';
import { MlmProgressiveService, ProgressiveEvent } from '../src/modules/mlm/mlm-progressive.service';
import { PROGRESSIVE_POLICY } from '../src/modules/mlm/mlm-progressive';

const service = new MlmProgressiveService();
const VERSION = 1;
type CatchupPreview = Awaited<ReturnType<MlmProgressiveService['preview']>> & { contextFingerprint: string };
export type CatchupEntry = { matrixId: string; preview: CatchupPreview | null; stateHash: string; error?: string };
type Target = { sourceUrl: string; fingerprint: string };
type WriteTarget = Target & { schema: string };
type AuditSummary = Record<string, { count: number; sample: unknown[] }>;
type CatchupReport = { version: number; policy: string; operationId: string; createdAt: string;
  targetFingerprint: string; limit: number; after: string | null; nextAfter: string | null;
  entries: CatchupEntry[]; audit: AuditSummary; reportHash: string };

export interface CatchupOptions {
  mode: 'preview' | 'backup' | 'apply';
  execute: boolean;
  limit: number;
  after?: string;
  output: string;
  preview?: string;
  fingerprint?: string;
  bundle?: string;
  pgBin?: string;
  actorId?: string;
  backupRoot?: string;
}

function requireSafe(condition: unknown, code: string): asserts condition {
  if (!condition) throw new SafetyError(code);
}

export function parseCatchupOptions(args: string[]): CatchupOptions {
  const values: Record<string, string> = {};
  const seen = new Set<string>();
  let execute = false;
  for (let index = 0; index < args.length; index++) {
    const key = args[index];
    requireSafe(['--mode', '--execute', '--limit', '--after', '--output', '--preview', '--fingerprint',
      '--bundle', '--pg-bin', '--actor-id', '--backup-root'].includes(key), 'UNKNOWN_ARGUMENT');
    requireSafe(!seen.has(key), 'DUPLICATE_ARGUMENT');
    seen.add(key);
    if (key === '--execute') execute = true;
    else {
      const value = args[++index];
      requireSafe(value?.trim() && !value.startsWith('--') && !/[\u0000-\u001f\u007f]/u.test(value), 'MISSING_ARGUMENT');
      values[key.slice(2)] = value;
    }
  }
  const mode = values.mode ?? 'preview';
  requireSafe(['preview', 'backup', 'apply'].includes(mode), 'UNKNOWN_MODE');
  requireSafe(!execute || mode === 'apply', 'EXECUTE_REQUIRES_APPLY');
  const limit = values.limit ?? '100';
  requireSafe(/^\d+$/.test(limit) && Number(limit) >= 1 && Number(limit) <= 200, 'INVALID_LIMIT');
  requireSafe(values.output, 'OUTPUT_REQUIRED');
  if (mode !== 'preview') {
    requireSafe(!values.after && !values.limit, 'PAGINATION_REQUIRES_PREVIEW');
    requireSafe(values.fingerprint && values['pg-bin'] && values['actor-id'], 'TARGET_BACKUP_ACTOR_REQUIRED');
  }
  if (mode === 'apply') requireSafe(execute && values.preview && values.bundle, 'EXECUTE_PREVIEW_BACKUP_REQUIRED');
  if (mode === 'backup') requireSafe(values['backup-root'], 'BACKUP_ROOT_REQUIRED');
  return { mode: mode as CatchupOptions['mode'], execute, limit: Number(limit), after: values.after,
    output: values.output, preview: values.preview, fingerprint: values.fingerprint, bundle: values.bundle,
    pgBin: values['pg-bin'], actorId: values['actor-id'], backupRoot: values['backup-root'] };
}

export function catchupStateHash(value: unknown): string {
  const canonical = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(canonical);
    if (item && typeof item === 'object') return Object.fromEntries(Object.keys(item).sort()
      .map(key => [key, canonical(item[key])]));
    return item;
  };
  return createHash('sha256').update(JSON.stringify(canonical(JSON.parse(JSON.stringify(value))))).digest('hex');
}

export function assertCatchupEntry(entry: { preview: unknown; stateHash?: string; error?: string }, current: unknown) {
  requireSafe(entry?.preview && !entry.error, 'CATCHUP_ENTRY_BLOCKED');
  requireSafe(entry.stateHash === catchupStateHash(entry.preview), 'CATCHUP_REPORT_TAMPERED');
  requireSafe(entry.stateHash === catchupStateHash(current), 'Apercu perime: CATCHUP_STALE_STATE');
}

export function reconcileCatchupEntry(entry: CatchupEntry, current: CatchupPreview,
  history: ReadonlyArray<Record<string, any>>, event: ProgressiveEvent): 'unchanged' | 'already-applied' {
  assertCatchupEntry(entry, entry.preview);
  if (entry.stateHash === catchupStateHash(current)) return 'unchanged';
  const approved = entry.preview;
  requireSafe(current.initialized && current.from === approved.to && current.accountedPositions === approved.to,
    'Apercu perime: CATCHUP_STALE_STATE');
  requireSafe(Object.values(current.proposed).every(amount => amount === '0.00'), 'CATCHUP_RESUME_DIVERGED');
  let historyFingerprint = current.historyFingerprint;
  if (new Prisma.Decimal(approved.proposed.total).gt(0)) {
    const reference = `generation-progress:${approved.matrixId}:${approved.to}:${PROGRESSIVE_POLICY}`;
    const matches = history.filter(row => row.referenceId === reference);
    requireSafe(matches.length === 1, 'CATCHUP_RESUME_COMMISSION_MISSING');
    const row = matches[0];
    requireSafe(row.matrixId === approved.matrixId && row.membreId === approved.memberId && row.mlmLevelId === approved.levelId
      && row.progressFrom === approved.from && row.progressTo === approved.to && row.calculationVersion === PROGRESSIVE_POLICY
      && row.generationEventId === event.id && row.generationActorId === event.actorId && row.origin === 'CATCH_UP'
      && row.filleulId === null && row.positionId === null && row.statut === 'EN_ATTENTE'
      && row.valideeAt === null && row.payeeAt === null && row.validatedById === null && row.notes === null
      && new Prisma.Decimal(row.montant).eq(approved.proposed.total)
      && new Prisma.Decimal(row.montantSysteme).eq(approved.proposed.immediate)
      && new Prisma.Decimal(row.montantRetour).eq(approved.proposed.held)
      && row.description === `Rattrapage de génération ${approved.generation} — ${approved.levelName} : ${approved.from + 1}–${approved.to}/${approved.capacity}`
      && new Date(row.createdAt).getTime() === new Date(row.updatedAt).getTime(), 'CATCHUP_RESUME_COMMISSION_CHANGED');
    requireSafe(createHash('sha256').update(JSON.stringify(history)).digest('hex') === current.historyFingerprint,
      'CATCHUP_RESUME_HISTORY_CHANGED');
    historyFingerprint = createHash('sha256').update(JSON.stringify(history.filter(previous => previous !== row))).digest('hex');
  } else {
    requireSafe(Object.values(approved.proposed).every(amount => amount === '0.00')
      && (approved.to > approved.from || (!approved.initialized && approved.accountedPositions > 0)), 'CATCHUP_RESUME_DIVERGED');
  }
  assertCatchupEntry(entry, { ...current, initialized: approved.initialized, from: approved.from,
    accountedPositions: approved.accountedPositions, proposed: approved.proposed, historyFingerprint });
  return 'already-applied';
}

async function readPreview(tx: Prisma.TransactionClient, matrixId: string): Promise<CatchupPreview> {
  const preview = await service.preview(tx, matrixId);
  const matrix = await tx.matrix.findUniqueOrThrow({ where: { id: matrixId }, include: { level: true, membre: true } });
  const { commissionAccountedPositions, commissionBudgetTotal, commissionBudgetImmediate, commissionBudgetHeld,
    commissionPolicyVersion, commissionAccountedAt, generationRewardedAt, ...context } = matrix;
  const promotions = await tx.promotion.findMany({ where: { membreId: preview.memberId, niveauApresId: preview.levelId }, orderBy: { id: 'asc' } });
  const bonuses = await tx.bonusAttribue.findMany({ where: { membreId: preview.memberId, mlmLevelId: preview.levelId }, orderBy: { id: 'asc' } });
  const positions = await tx.position.findMany({ where: { matrixId }, orderBy: { id: 'asc' } });
  return { ...preview, contextFingerprint: catchupStateHash({ context, promotions, bonuses, positions }) };
}

async function assertTransactionTarget(tx: Prisma.TransactionClient, target: Target) {
  const source = new URL(target.sourceUrl);
  const rows = await tx.$queryRaw<Array<Record<string, unknown>>>`SELECT current_database()::text AS database, current_user::text AS role,
    oid::text AS database_oid, inet_server_addr()::text AS address, inet_server_port() AS port,
    current_setting('server_version_num') AS version FROM pg_database WHERE datname=current_database()`;
  const fingerprint = createHash('sha256').update(JSON.stringify({ host: source.hostname, port: source.port, ...rows[0], schema: 'public' })).digest('hex');
  requireSafe(fingerprint === target.fingerprint, 'TARGET_FINGERPRINT_MISMATCH');
}

async function assertSourceOffline(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SELECT pg_stat_clear_snapshot()`;
  const rows = await tx.$queryRaw<Array<{ sessions: number; other_logins: number; public_connect: number;
    prepared: number; subscriptions: number; visible: boolean; payments: number }>>`SELECT
    (SELECT count(*)::int FROM pg_stat_activity WHERE datid=(SELECT oid FROM pg_database WHERE datname=current_database())
      AND pid<>pg_backend_pid()) AS sessions,
    (SELECT count(*)::int FROM pg_roles WHERE rolcanlogin AND rolname<>current_user
      AND has_database_privilege(oid,current_database(),'CONNECT')) AS other_logins,
    (SELECT count(*)::int FROM pg_database, aclexplode(coalesce(datacl,acldefault('d',datdba)))
      WHERE datname=current_database() AND grantee=0 AND privilege_type='CONNECT') AS public_connect,
    (SELECT count(*)::int FROM pg_prepared_xacts WHERE database=current_database()) AS prepared,
    (SELECT count(*)::int FROM pg_subscription WHERE subdbid=(SELECT oid FROM pg_database WHERE datname=current_database()) AND subenabled) AS subscriptions,
    (SELECT rolsuper OR pg_has_role(current_user,'pg_read_all_stats','MEMBER') FROM pg_roles WHERE rolname=current_user) AS visible,
    ((SELECT count(*) FROM public.kpay_transactions WHERE status::text IN ('PENDING','PROCESSING')
      OR (status::text IN ('COMPLETED','REFUNDED') AND "terminalEventProcessedAt" IS NULL)) +
    (SELECT count(*) FROM public.mlm_payouts WHERE statut::text IN ('PENDING','PROCESSING')) +
    (SELECT count(*) FROM public.withdrawal_requests WHERE type::text='MOBILE_MONEY' AND statut::text IN ('EN_ATTENTE','APPROUVE')))::int AS payments`;
  const proof = rows[0];
  requireSafe(proof.visible && proof.sessions === 0 && proof.other_logins === 0 && proof.public_connect === 0
    && proof.prepared === 0 && proof.subscriptions === 0 && proof.payments === 0, 'SOURCE_NOT_OFFLINE');
}

async function assertActor(tx: Prisma.TransactionClient, actorId: string, lock = false) {
  const actor = lock
    ? await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM public.utilisateurs
        WHERE id = ${actorId} AND role::text = 'SUPER_ADMIN' AND actif = true FOR SHARE`
    : await tx.utilisateur.findMany({ where: { id: actorId, role: 'SUPER_ADMIN', actif: true }, select: { id: true }, take: 1 });
  requireSafe(actor.length === 1, 'SUPER_ADMIN_REQUIRED');
}

async function assertSourceSchema(tx: Prisma.TransactionClient, expectedSchema?: string, lockTables = false) {
  await tx.$executeRaw`SET LOCAL search_path = pg_catalog`;
  const reader = { query: async (sql: string, parameters: unknown[] = []) => {
    const rows = await tx.$queryRawUnsafe<Array<{ record: Record<string, unknown> }>>(
      `SELECT row_to_json(maintenance_record) AS record FROM (${sql}) AS maintenance_record`, ...parameters);
    return { rows: rows.map(row => row.record) };
  } } as unknown as Client;
  const catalog = await readCatalog(reader);
  assertCatalogSafe(catalog);
  if (lockTables) {
    const tables = catalog.tables.map(table => `public."${table.replace(/"/g, '""')}"`).join(', ');
    await tx.$executeRawUnsafe(`LOCK TABLE ${tables} IN SHARE ROW EXCLUSIVE MODE`);
    assertCatalogSafe(await readCatalog(reader));
  }
  const current = await schemaState(reader);
  requireSafe(expectedSchema === undefined || current.schema === expectedSchema, 'SOURCE_SCHEMA_MISMATCH');
  return current.schema;
}

export async function previewCatchupPage(prisma: PrismaClient, options: { limit: number; after?: string }, target?: Target) {
  requireSafe(Number.isSafeInteger(options.limit) && options.limit >= 1 && options.limit <= 200, 'INVALID_LIMIT');
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    await tx.$executeRaw`SET LOCAL statement_timeout = '30s'`;
    if (target) await assertTransactionTarget(tx, target);
    const matrices = await tx.matrix.findMany({ where: options.after ? { id: { gt: options.after } } : {},
      orderBy: { id: 'asc' }, take: options.limit + 1, select: { id: true } });
    const entries: CatchupEntry[] = [];
    for (const matrix of matrices.slice(0, options.limit)) {
      try {
        const preview = await readPreview(tx, matrix.id);
        entries.push({ matrixId: matrix.id, preview, stateHash: catchupStateHash(preview) });
      } catch (error) {
        if (!(error instanceof BadRequestException || error instanceof ConflictException)) throw error;
        const anomaly = { matrixId: matrix.id, preview: null, error: error.message };
        entries.push({ ...anomaly, stateHash: catchupStateHash(anomaly) });
      }
    }
    return { entries, nextAfter: matrices.length > options.limit ? entries[entries.length - 1].matrixId : null };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, maxWait: 5000, timeout: 60000 });
}

export async function applyCatchupEntry(prisma: PrismaClient, entry: CatchupEntry, event: ProgressiveEvent, target?: WriteTarget) {
  assertCatchupEntry(entry, entry.preview);
  requireSafe(entry.matrixId === entry.preview.matrixId && event.id?.trim() && event.actorId?.trim()
    && event.origin === 'CATCH_UP' && !event.triggerId && !event.positionId, 'INVALID_CATCHUP_EVENT');
  requireSafe(!target || /^[0-9a-f]{64}$/.test(target.schema), 'VERIFIED_SCHEMA_REQUIRED');
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SET LOCAL statement_timeout = '30s'`;
    await tx.$executeRaw`SET LOCAL lock_timeout = '5s'`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(604008)`;
    if (target) {
      await assertTransactionTarget(tx, target);
      await assertSourceOffline(tx);
      await assertSourceSchema(tx, target.schema, true);
    }
    await assertActor(tx, event.actorId, true);
    const current = await readPreview(tx, entry.matrixId);
    const history = await tx.commission.findMany({ where: { membreId: current.memberId, mlmLevelId: current.levelId },
      orderBy: [{ progressTo: 'asc' }, { id: 'asc' }] });
    const state = reconcileCatchupEntry(entry, current, history, event);
    const referenceId = new Prisma.Decimal(entry.preview.proposed.total).gt(0)
      ? `generation-progress:${entry.matrixId}:${entry.preview.to}:${PROGRESSIVE_POLICY}` : null;
    if (state === 'already-applied') {
      if (target) await assertSourceSchema(tx, target.schema);
      return { matrixId: entry.matrixId, status: state, referenceId,
        from: entry.preview.from, to: entry.preview.to, proposed: entry.preview.proposed };
    }
    const commission = await service.account(tx, entry.matrixId, event);
    const after = await readPreview(tx, entry.matrixId);
    const afterHistory = await tx.commission.findMany({ where: { membreId: current.memberId, mlmLevelId: current.levelId },
      orderBy: [{ progressTo: 'asc' }, { id: 'asc' }] });
    const reconciled = reconcileCatchupEntry(entry, after, afterHistory, event);
    requireSafe(!referenceId || (commission?.referenceId === referenceId && reconciled === 'already-applied'), 'CATCHUP_ACCOUNT_DIVERGED');
    if (target) await assertSourceSchema(tx, target.schema);
    return { matrixId: entry.matrixId, status: commission ? 'created' : reconciled === 'unchanged' ? 'unchanged' : 'accounted',
      referenceId, from: entry.preview.from, to: entry.preview.to, proposed: entry.preview.proposed };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 5000, timeout: 45000 });
}

function connectionConfig(sourceUrl: string) {
  const source = new URL(sourceUrl);
  const sslmode = source.searchParams.get('sslmode') ?? 'disable';
  return { host: source.hostname.replace(/^\[|\]$/g, ''), port: Number(source.port), user: decodeURIComponent(source.username),
    password: () => decodeURIComponent(source.password), database: decodeURIComponent(source.pathname.slice(1)),
    ssl: sslmode === 'disable' ? false as const : { rejectUnauthorized: sslmode === 'verify-full' },
    options: '-c timezone=UTC -c datestyle=ISO,YMD -c search_path=public -c statement_timeout=30000 -c lock_timeout=5000',
    application_name: 'ebn-progressive-catchup', connectionTimeoutMillis: 10000 };
}

async function withPrisma<Result>(sourceUrl: string, action: (prisma: PrismaClient) => Promise<Result>): Promise<Result> {
  const pool = new Pool({ ...connectionConfig(sourceUrl), max: 1 });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool), errorFormat: 'minimal' });
  try { return await action(prisma); }
  finally { await prisma.$disconnect(); await pool.end(); }
}

function privateInput(filename: string) {
  requireSafe(path.isAbsolute(filename), 'PRIVATE_ABSOLUTE_PATH_REQUIRED');
  restrictDirectory(path.dirname(filename));
  assertPrivatePath(filename);
  const stat = fs.lstatSync(filename);
  requireSafe(stat.isFile() && stat.nlink === 1 && stat.size <= 10 * 1024 * 1024, 'INVALID_PRIVATE_REPORT');
  return JSON.parse(fs.readFileSync(filename, 'utf8'));
}

function checkOutput(filename: string) {
  requireSafe(path.isAbsolute(filename), 'PRIVATE_ABSOLUTE_PATH_REQUIRED');
  restrictDirectory(path.dirname(filename), true);
  requireSafe(!fs.existsSync(filename), 'OUTPUT_ALREADY_EXISTS');
}

function writePrivateJson(filename: string, value: unknown) {
  restrictDirectory(path.dirname(filename));
  if (fs.existsSync(filename)) {
    assertPrivatePath(filename);
    const stat = fs.lstatSync(filename);
    requireSafe(stat.isFile() && stat.nlink === 1, 'INVALID_PRIVATE_REPORT');
  }
  const temporary = path.join(path.dirname(filename), `.catchup-${randomUUID()}.tmp`);
  const descriptor = fs.openSync(temporary, 'wx', 0o600);
  try {
    fs.writeFileSync(descriptor, JSON.stringify(value, null, 2), 'utf8');
    fs.fsyncSync(descriptor);
  } finally { fs.closeSync(descriptor); }
  assertPrivatePath(temporary);
  fs.renameSync(temporary, filename);
  assertPrivatePath(filename);
}

function readReport(filename: string, fingerprint: string): CatchupReport {
  const report = privateInput(filename) as CatchupReport;
  requireSafe(report.version === VERSION && report.policy === PROGRESSIVE_POLICY, 'CATCHUP_VERSION_MISMATCH');
  requireSafe(report.targetFingerprint === fingerprint, 'TARGET_FINGERPRINT_MISMATCH');
  const { reportHash, ...body } = report;
  requireSafe(reportHash === catchupStateHash(body), 'CATCHUP_REPORT_TAMPERED');
  requireSafe(/^[0-9a-f-]{36}$/.test(report.operationId) && Number.isFinite(Date.parse(report.createdAt))
    && Number.isSafeInteger(report.limit) && report.limit >= 1 && report.limit <= 200
    && Array.isArray(report.entries) && report.entries.length <= report.limit, 'INVALID_CATCHUP_REPORT');
  const matrixIds = new Set<string>();
  for (const entry of report.entries) {
    assertCatchupEntry(entry, entry.preview);
    requireSafe(entry.matrixId === entry.preview.matrixId && !matrixIds.has(entry.matrixId), 'INVALID_CATCHUP_REPORT');
    matrixIds.add(entry.matrixId);
  }
  requireSafe(report.audit && Object.values(report.audit).every(finding => finding.count === 0), 'MLM_AUDIT_BLOCKED');
  return report;
}

async function inspectAudit(sourceUrl: string): Promise<AuditSummary> {
  const client = new Client(connectionConfig(sourceUrl));
  await client.connect();
  try {
    const findings = await auditMlm(client);
    return Object.fromEntries(Object.entries(findings).map(([key, rows]) => [key, { count: rows.length, sample: rows.slice(0, 20) }]));
  } finally { await client.end(); }
}

function safeError(error: unknown): string {
  if (error instanceof SafetyError) return error.message;
  if (error instanceof BadRequestException || error instanceof ConflictException) return 'CATCHUP_HISTORY_ANOMALY';
  return 'CATCHUP_FAILED';
}

export async function runCatchup(args: string[], environment: NodeJS.ProcessEnv = process.env) {
  const options = parseCatchupOptions(args);
  const sourceUrl = environment.CATCHUP_SOURCE_URL;
  requireSafe(sourceUrl?.trim(), 'CATCHUP_SOURCE_URL_REQUIRED');
  if (options.mode === 'apply') {
    requireSafe(environment.CATCHUP_RESTORE_URL, 'CATCHUP_RESTORE_URL_REQUIRED');
    assertRestoreTarget(environment.CATCHUP_RESTORE_URL, sourceUrl);
  }
  checkOutput(options.output);
  const inspected = await inspectTarget(sourceUrl);
  const target = { sourceUrl, fingerprint: inspected.fingerprint };
  requireSafe(!options.fingerprint || options.fingerprint === target.fingerprint, 'TARGET_FINGERPRINT_MISMATCH');
  if (options.mode === 'backup') {
    const backup = await createBackup({ sourceUrl, fingerprint: target.fingerprint, backupRoot: options.backupRoot,
      pgBin: options.pgBin, preserveAdminId: options.actorId });
    writePrivateJson(options.output, { version: VERSION, createdAt: new Date().toISOString(), ...backup });
    return { mode: options.mode, fingerprint: target.fingerprint };
  }
  const audit = await inspectAudit(sourceUrl);
  if (options.mode === 'preview') {
    const page = await withPrisma(sourceUrl, prisma => previewCatchupPage(prisma, options, target));
    const body = { version: VERSION, policy: PROGRESSIVE_POLICY, operationId: randomUUID(),
      createdAt: new Date().toISOString(), targetFingerprint: target.fingerprint,
      limit: options.limit, after: options.after ?? null, ...page, audit };
    writePrivateJson(options.output, { ...body, reportHash: catchupStateHash(body) });
    return { mode: options.mode, fingerprint: target.fingerprint, entries: page.entries.length,
      anomalies: page.entries.filter(entry => entry.error).length, nextAfter: page.nextAfter };
  }
  requireSafe(inspected.unknownTables.length === 0 && inspected.dependenciesReviewRequired === 0, 'TARGET_REVIEW_REQUIRED');
  requireSafe(Object.values(audit).every(finding => finding.count === 0), 'MLM_AUDIT_BLOCKED');
  const report = readReport(options.preview, target.fingerprint);
  await withPrisma(sourceUrl, prisma => prisma.$transaction(async tx => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    await assertTransactionTarget(tx, target);
    await assertSourceOffline(tx);
    await assertActor(tx, options.actorId);
    await assertSourceSchema(tx);
  }, { maxWait: 5000, timeout: 45000 }));
  const manifest = privateInput(path.join(options.bundle, 'manifest.json'));
  requireSafe(Number.isFinite(Date.parse(manifest.createdAt)) && Date.parse(manifest.createdAt) >= Date.parse(report.createdAt), 'BACKUP_PREDATES_PREVIEW');
  const verified = await verifyBackup({ sourceUrl, fingerprint: target.fingerprint, bundle: options.bundle,
    restoreUrl: environment.CATCHUP_RESTORE_URL, pgBin: options.pgBin, preserveAdminId: options.actorId });
  requireSafe(verified.verified && verified.fingerprint === target.fingerprint, 'BACKUP_NOT_VERIFIED');
  const writeTarget = { ...target, schema: verified.snapshot.schema };
  await withPrisma(environment.CATCHUP_RESTORE_URL, prisma => prisma.$transaction(async tx => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    for (const entry of report.entries) assertCatchupEntry(entry, await readPreview(tx, entry.matrixId));
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, maxWait: 5000, timeout: 60000 }));
  requireSafe(Object.values(await inspectAudit(sourceUrl)).every(finding => finding.count === 0), 'MLM_AUDIT_BLOCKED');
  const result = { version: VERSION, operationId: report.operationId, targetFingerprint: target.fingerprint,
    actorId: options.actorId, startedAt: new Date().toISOString(), status: 'running',
    backup: { dumpHash: manifest.dumpHash, snapshotHash: catchupStateHash(verified.snapshot), schema: writeTarget.schema },
    entries: [] as Array<Record<string, unknown>>, error: undefined as string | undefined };
  writePrivateJson(options.output, result);
  try {
    await withPrisma(sourceUrl, async prisma => {
      for (const entry of report.entries) {
        const applied = await applyCatchupEntry(prisma, entry,
          { id: report.operationId, actorId: options.actorId, origin: 'CATCH_UP' }, writeTarget);
        result.entries.push(applied);
        writePrivateJson(options.output, result);
      }
    });
    result.status = 'complete';
    writePrivateJson(options.output, result);
  } catch (error) {
    result.status = 'interrupted';
    result.error = safeError(error);
    writePrivateJson(options.output, result);
    throw error;
  }
  return { mode: options.mode, fingerprint: target.fingerprint, entries: result.entries.length, status: result.status };
}

if (require.main === module) {
  runCatchup(process.argv.slice(2)).then(result => console.log(JSON.stringify(result)))
    .catch(error => { console.error(safeError(error)); process.exitCode = 1; });
}
