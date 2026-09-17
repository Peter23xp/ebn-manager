# Maintenance backup / restore / purge (task 7)

## Current authorization boundary

The delivered tooling is NOT permission to execute against a remote database. Tests use synthetic source fixtures on `127.0.0.1:55432` and a separate private SCRAM-authenticated restore service on `127.0.0.1:55433`. The worker did not read `.env`, access Supabase, change provider state, seed an application, or access main's `mlm_integration` database. The shared trust-only source fixture server is NOT an acceptable real-data restore target.

Main reports two active SUPER_ADMIN accounts and a session-pooler-only endpoint (including DIRECT_URL). The user explicitly chose to preserve BOTH existing accounts. The operator must supply their exact confirmed IDs using `--preserve-admin-ids`; the tool never selects all current or future administrators automatically. The strict `scripts/maintenance.ts` commands still require exactly one SUPER_ADMIN when no explicit selection is supplied, support the backwards-compatible single-account flag, and reject every hostname containing `pooler`. Their direct/offline gates are unchanged. The separately approved legacy workflow below has different site-preservation and source-fencing semantics; it is not a bypass flag for those strict commands. This worker has performed no remote operation.

## Secured legacy entry point: transaction-fenced profile

`prisma/purge.ts` is now a thin, import-safe entry point into the same maintenance engine. Merely importing it neither constructs a database client nor connects/deletes. Invocation without arguments inspects only; `--mode purge` without `--execute` is read-only. No implicit application `.env`, DATABASE_URL, seed or migration is used. Main alone owns remote execution and operational authorization.

This profile requires EXACTLY TWO explicitly selected SUPER_ADMIN IDs, preserving their complete records INCLUDING siteId. It preserves sites, configuration, career levels, calendars if present, the migration ledger (including failed entries), and unknown independent tables. The established required/optional-table policy permits the pre-migration legacy schema without placement_history/calendar; absence of a required table still fails. Unselected users and only allowlisted business tables are deleted in dependency order. It does not repair or retry migrations.

Source policy defaults to `direct`. Only this entry point accepts `--source-policy supabase-session`: the accepted source shape is `aws-<number>-<region>.pooler.supabase.com`, explicit port 5432, user `postgres.<20-lowercase-alphanumeric-project-ref>`, and sslmode require or verify-full. Port 6543, arbitrary poolers, wrong users, unsafe routing options and missing TLS are refused. The restore URL remains governed by the unchanged literal-loopback/private-SCRAM policy; the source exception never applies to restore connections. API inspection can explicitly call `inspectTarget(sourceUrl, 'supabase-session')`; omission retains the direct-only guard.

Hostname shape is not sufficient target/session evidence. Main must confirm the intended project, pinned session routing and native exported-snapshot import for the actual endpoint. Main reports a successful read-only native session proof, but this worker has not independently connected remotely. The real workflow uses the same resolved parameters for control/native connections, revalidates the supplied fingerprint, and requires a successful native snapshot backup and content-verified local restoration before any deletion.

The explicitly selected transaction-fenced + supabase-session SOURCE profile requires exactly the six reviewed managed event triggers: issue_graphql_placeholder, issue_pg_cron_access, issue_pg_graphql_access, issue_pg_net_access, pgrst_ddl_watch and pgrst_drop_watch. It pins each event/name/tag set (including NULL), enabled O state, extensions function name/schema, empty identity arguments, both owners supabase_admin, security-definer false, `proconfig=['search_path=""']`, and SHA-256 of the exact UTF-8 pg_get_functiondef bytes with no normalization. The reviewed hashes are fixed in code; there is no arbitrary allowlist/skip flag. Missing, additional, duplicate or changed entries fail closed. Full metadata/hashes stay in the source catalog and every fresh-observer comparison; they are not filtered away to pass the gate. Inspection still reports their count as requiring review.

This exception requires ZERO public non-internal triggers, including otherwise recognized placement_history/positions triggers, and retains every other rule/internal-trigger/dependency check. The session-source path therefore cannot enter the shared trigger-ALTER branch: it emits transaction controls, locks, reads and allowlisted DELETE only. The inspected extension handlers can grant privileges on extension DDL; they are not generally harmless. No trigger is disabled or modified. This exception does not apply to direct-fenced, strict-source or private-restore profiles, and does not authorize later migration DDL. Global trigger/function definitions are outside the public-only dump; retain main's separately reviewed metadata/definition evidence for project-level recovery.

### Non-negotiable operational prerequisite

Before remote execute, main/operator must stop application ingress, workers, webhook consumers, scheduled/provider work and schema deployments, and prevent stale requests from resuming until postflight. Do not infer this from six managed sessions, empty queues, a momentary zero-payment count, or the table locks themselves. An application can contact a payment provider before trying its blocked SQL write; queued writes can resume after commit/rollback. No local boolean/force switch attests external shutdown. Unknown/uncontrolled application or provider activity is an operational blocker. Managed services need not be killed and their privileges are not changed by this script.

### One fenced transaction, fresh backup, verified restore

- Candidate relation names and preflight identity are gathered outside the purge transaction. Inside the dedicated read/write REPEATABLE READ transaction, every public table is locked SHARE ROW EXCLUSIVE BEFORE any SELECT/fingerprint/catalog query establishes its snapshot. A writer committed while lock acquisition waits is included in the post-lock snapshot.
- The same source client/transaction holds the entire fence through exported-snapshot native pg_dump, confidential pg_restore verification, deletes, postconditions and commit. No intermediate commit, reconnect/retry, or unlocked fallback exists. ACCESS EXCLUSIVE is not taken before pg_dump; SHARE ROW EXCLUSIVE admits its ACCESS SHARE reads while preventing table writes.
- Backend PID, transaction ID and granted locks covering every public table are checked repeatedly. Prepared transactions, subscriptions, pending payments, unreviewed objects/dependencies and catalog changes still fail closed. A separate read-only source observer checks fresh catalog/schema/sequence state so a repeatable-read catalog snapshot cannot hide concurrent DDL. This observer must match the source fingerprint and never performs deletes.
- Sequences and new namespace/function objects are not universally frozen by table locks. Observed sequence/schema/catalog drift aborts without resetting sequences or repairing objects; deployment/sequence users must also remain quiescent. Concurrent SELECT FOR UPDATE and queued DDL can still cause contention; failure is a bounded rollback, not permission to weaken the fence.
- Source lock waits are limited to 5 seconds, statements to 60 seconds, idle transaction time to 6 minutes and the whole PostgreSQL 17 transaction to 10 minutes. Native tools have a 5-minute process limit. Fenced pg_dump additionally receives its own `--lock-wait-timeout=5s` because pg_dump resets session timeout defaults; source native startup options also specify bounded waits. Lock/deadlock/restore failures do not continue into deletion.
- A new private bundle is always created inside this transaction. Existing `--bundle` inputs and separate legacy backup/verify modes are refused. The manifest binds workflow, source policy, fingerprint and exact selected ID set; the strict workflow rejects a fenced bundle. Archive hash/content and full selected records are checked before mutation; postflight verifies selected ID/hash/all attributes/site links, retained table data, schema and sequences. The direct-source profile retains the named placement_history trigger handling if present; the reviewed session-source profile forbids all public user triggers and performs no trigger ALTER.

Use privately supplied `MAINTENANCE_DATABASE_URL` and `MAINTENANCE_RESTORE_URL`; the latter must name a NEW empty private restore database for each execution attempt. Actual IDs and secrets must not be pasted into this runbook or Git. The variables below are operator-provided values, not authorization to run against any configured target.

```powershell
npx --no-install tsx prisma/purge.ts --source-policy supabase-session
npx --no-install tsx prisma/purge.ts --mode purge --source-policy supabase-session --fingerprint $fingerprint --preserve-admin-ids $preservedAdminIds
# Only main/operator, after reviewed quiescence and target evidence:
npx --no-install tsx prisma/purge.ts --mode purge --execute --source-policy supabase-session --fingerprint $fingerprint --preserve-admin-ids $preservedAdminIds --backup-root $privateBackupRoot --pg-bin $pgBin
```

Successful execution returns counts, preserved table names, fingerprint and the private bundle path. On failure, source changes roll back; completed backups and confidential restore copies are retained, not silently removed. A partial bundle must never be treated as verified. Inspect the private backup root to locate failure artifacts without publishing their data. Keep services paused until main's target-specific postflight and separately reviewed migration steps finish. The following sections document the ORIGINAL STRICT workflow, whose purge clears selected site links and deletes sites; do not confuse its commands with the site-preserving legacy profile.

## Strict entry point and secrets

Run from `backend`: `npx --no-install tsx scripts/maintenance.ts`.

- `MAINTENANCE_DATABASE_URL`: explicitly selected direct connection, supplied privately by the operator. No implicit `.env`, DATABASE_URL, or NODE_ENV fallback.
- `MAINTENANCE_RESTORE_URL`: an explicitly password-authenticated disposable literal-loopback database named `ebn_restore_<suffix>`, on the dedicated private restore service described below.
- `--pg-bin`: absolute directory containing native `pg_dump` and `pg_restore`.
- `--fingerprint`: exact SHA-256 fingerprint returned by inspection; endpoint, database OID, server address/version, role, and schema are bound.
- `--backup-root`: private, nonsymlink directory OUTSIDE every Git repository.
- `--bundle`: private backup bundle produced by this tool.
- `--preserve-admin-ids`: comma-separated, explicitly confirmed IDs. Surrounding whitespace is trimmed and IDs are sorted case-sensitively; empty entries, duplicates and malformed IDs are refused. Use the same exact set for backup, verification, dry-run and execution. Do not mix it with `--preserve-admin-id` or repeat either flag.
- `--preserve-admin-id`: backwards-compatible single-account selection. Omission of both flags is permitted only when exactly one SUPER_ADMIN exists. Unselected administrators are deleted with business users; no future administrator is automatically added to the preserved set.

The exact normalized selection is bound into the backup manifest. Subsets, supersets, replacements and omission of an explicit selection are refused by verification and purge (including dry-run when a bundle is supplied). Reordering the same IDs is accepted. New manifests use format 2 with `preservedAdminIds`; singleton manifests retain the legacy `preservedAdminId` field. Format 1 singleton bundles remain readable with their original explicit-selection requirement. Never edit a manifest to change the selection: create a new backup after confirming the intended set.

Never put credentials in command arguments, logs, reports, or Git. The CLI logs only generic error codes, counts, table names, and a target fingerprint. Native client passwords are supplied through the child environment, never argv; native stderr is not echoed. Local administrators can still inspect process memory/environment: use a trusted host.

Both URLs must contain an explicit port. A portless URL is refused even if PGPORT is set. Control and native clients use the same explicitly resolved host/port/database/user/password and SSL mode; inherited PG routing, password, TLS, replication, startup options, and passfile settings cannot redirect them. Only `disable` (loopback only), `require` (TLS encryption), and `verify-full` (TLS certificate/hostname validation) are supported. Omitted SSL mode means `disable` and is therefore refused remotely. No remote TLS endpoint has been tested in this task; provide appropriately trusted CA configuration when using `verify-full`.

## Read-only inspection and dry-run

```powershell
npx --no-install tsx scripts/maintenance.ts
npx --no-install tsx scripts/maintenance.ts --mode purge --fingerprint $fingerprint --preserve-admin-ids $preservedAdminIds
```

For these examples, the operator supplies `$preservedAdminIds` as the comma-separated exact two confirmed IDs; real IDs do not belong in this runbook or source code. For a different approved single-account operation, use `--preserve-admin-id` instead. Inspection and dry-run use read-only transactions. Dry-run validates table/foreign-key/trigger policy, every selected SUPER_ADMIN identity, and pending payment guards; it returns the business delete counts (total users minus the selected set size) and preserved tables. It neither disables triggers nor writes rows. `purge` without `--execute` always remains a dry-run. There is deliberately no `--maintenance`, `--force`, `--skip-backup`, or `--skip-restore` option.

## Objectively establish maintenance before backup

The operator must stop application ingress, workers, scheduled jobs, and webhook consumers; reconcile in-flight provider operations without using this script to contact a provider. Keep them stopped until postflight is complete. The maintenance credential must be dedicated and unavailable to application processes. External ingress/provider shutdown is an operational prerequisite, not something PostgreSQL can attest.

The script additionally verifies database evidence, not an operator boolean:

- No other session in the source database, including idle sessions; no prepared transactions or enabled subscriptions.
- The current role can see activity statistics.
- PUBLIC has no CONNECT grant, and no other LOGIN role can CONNECT (including superusers and inherited privileges).
- Pending/processing KPay operations and MLM payouts, unhandled successful/refunded KPay terminal events, and pending/approved mobile-money withdrawals block the operation.

The tool does not revoke privileges, terminate sessions, alter roles/databases, or shut down services for the operator. Shared-hosted Supabase roles can make this strict gate impossible; stop and design a verified alternative rather than bypass it. Database evidence cannot prove that someone holding the maintenance credentials will not reconnect; exclusive credential custody is required.

## Native backup and restore rehearsal

```powershell
npx --no-install tsx scripts/maintenance.ts --mode backup --fingerprint $fingerprint --backup-root $privateBackupRoot --pg-bin $pgBin --preserve-admin-ids $preservedAdminIds
npx --no-install tsx scripts/maintenance.ts --mode verify --fingerprint $fingerprint --bundle $bundle --pg-bin $pgBin --preserve-admin-ids $preservedAdminIds
```

Create the empty local restore database explicitly before verification. Reuse is refused once any application objects exist; create a new `ebn_restore_...` database for each verification or execution attempt. The tool never resets a restore target or drops a schema.

### Restore confidentiality gate (before any archive data is loaded)

Restoration is a second sensitive backup copy, not merely a test database. The tool requires all of the following, with no force/skip/test bypass:

- A nonempty password explicitly present in the privately supplied restore URL. `system_user` must attest that this actual control connection authenticated with SCRAM-SHA-256; passing an arbitrary password to a trust server does not qualify.
- A dedicated cluster with only the current role enabled for LOGIN; no databases other than the built-in administrative/templates and `ebn_restore_*`. Keep its password in exclusive operator custody, unavailable to applications and other local users.
- Literal-loopback server/listener addresses and the expected explicit server port. All accepted HBA entries must use SCRAM on local/loopback addresses; reject entries are allowed. Trust/peer/unreviewed authentication fails closed.
- No PUBLIC CONNECT, no other role able to connect, no competing session in the restore database or any other database on its cluster, no prepared transaction, and no enabled subscription. The script checks these facts; it does not establish them by changing an operator's grants or terminating sessions.
- The server-reported data directory must be locally accessible, outside Git, with a matching `postmaster.pid` data path/port. HBA/config and collected logs must remain inside it, with no external tablespace. The recursive storage ACL check rejects exposed descendants and symlinks/reparse points. Windows requires both every object's owner SID and its Allow trustees to be the current OS user or SYSTEM; an untrusted owner is rejected even when its DACL currently looks private. POSIX permits only the current owner with no group/other access.

These checks run before and after native restoration. Failure before loading leaves the target empty. Failure after loading may leave a sensitive restored copy; retain the private service, credential and filesystem protection until an operator removes that specific copy. Successful verification does not make the copy public or relax any grants. The script cannot prove exclusive credential custody against someone who already knows the password or a privileged host administrator; those remain trust assumptions. Apply the same confidential retention policy to live restore databases, their WAL/logs and their storage as to the dump bundles. Do not move a restored copy back to the shared trust-only fixture server.

Backup uses `pg_dump --schema=public --format=custom --snapshot=<exported snapshot>` from a read-only repeatable-read transaction. It contains the complete public schema/data, including unknown independent public tables and `_prisma_migrations` if present. It is not a whole Supabase project backup: auth/storage, external Storage objects, role definitions, and KPay accounts/payments are excluded. Native dump archives retain owner/ACL metadata; local rehearsal deliberately uses `--no-owner --no-privileges`, so role/ACL restoration is NOT certified by the rehearsal and must be reviewed separately for disaster recovery.

Windows bundles and files must allow only the current user and SYSTEM; POSIX directories/files must be private. No existing permissive destination is silently accepted. The manifest contains selected administrator IDs and checksums, not raw credentials or other row contents. Dumps DO contain private rows and password hashes. Keep the ACL restrictions, use an encrypted volume if required by policy, and manage retention outside Git.

Verification checks archive SHA-256, table counts and SHA-256 digests of canonical PostgreSQL JSON row text (not JS floating-point conversions), schema columns/defaults/types, constraints/FKs, indexes, function/trigger definitions, enums, and sequence values/is_called. Rehearsal uses native `pg_restore --single-transaction --exit-on-error`. Only the archive's CREATE SCHEMA public entry is omitted because a fresh PostgreSQL database already has public. No other TOC entry is omitted. Failures leave the local restore database for investigation; no remote restore occurs.

## Destructive path — separate operator decision only

Do not run the command below until identity, direct connection, objectively verified maintenance, engine validation, backup restoration, and dry-run review are all complete. Main owns the engine-validation evidence and final authorization. This worker has not executed this command remotely.

```powershell
npx --no-install tsx scripts/maintenance.ts --mode purge --execute --fingerprint $fingerprint --bundle $bundle --pg-bin $pgBin --preserve-admin-ids $preservedAdminIds
```

The execution path repeats native restoration into a NEW empty local restore database; it does not trust a manifest `verified` flag. It locks all public tables with ACCESS EXCLUSIVE in one transaction, obtains fresh post-lock state, rechecks catalog/maintenance/payment gates, and compares live schema/data/sequences with the restored backup. Stale/tampered backups abort before row deletion. An unexpected FK (including a new FK between known tables), dependency cycle, external-schema dependency, view, rule, event trigger, enabled publication/subscription, RLS/partition/foreign table, disabled constraint/internal trigger, or unreviewed user trigger/function blocks execution.

Deletion uses a static application-table allowlist and a child-before-parent order. Unknown independent tables, `_prisma_migrations`, technical configuration, career levels, and calendar rows are preserved. Every explicitly selected SUPER_ADMIN keeps every attribute except `siteId`, which is set to NULL before site deletion. Only users outside that exact set are deleted. Before commit, the entire preserved set's IDs, password hashes and non-site attribute digests are compared, and the remaining user count must equal the selected set size. No TRUNCATE, CASCADE deletion, DROP SCHEMA, global reset, sequence reset, or general trigger disabling is used. If present, ONLY `placement_history_immutable` is disabled and re-enabled within that transaction. Failure rolls back rows and trigger state.

## Postflight owned by main

Keep maintenance in place. Apply only approved explicit migrations, then use the separately reviewed `initializeMlmLevels(prisma)` from `backend/prisma/mlm-levels.ts` and the approved calendar initialization. This script intentionally does not import/run a seed, migrate, or rewrite level/calendar settings. Verify eight career levels, approved calendar, zero business rows, the exact two approved admin IDs/hashes/attributes unchanged (apart from cleared siteId), technical configuration, and non-destructive engine/API smoke tests before reopening services. On failure, retain maintenance and coordinate rollback of code/schema/data together; never restore a public-only dump blindly over an active project.

## Local verification commands

Server and clients are PostgreSQL 17.10. Server tools: `%LOCALAPPDATA%\EBN-maintenance\pg17-task7\package\native\bin`; clients: `%LOCALAPPDATA%\EBN-maintenance\pg17-task7\clients\pgsql\bin`. The shared source fixture listener is `127.0.0.1:55432`, disposable-local role `postgres` with trust authentication. Do not expose it, use it for confidential restored copies, alter its authentication/roles, or stop it while main's core tests use it.

The separate restore service listens on `127.0.0.1:55433`; its data directory is `%LOCALAPPDATA%\EBN-maintenance\pg17-restore-task7\data`, with collected logs under `data\log`. Its sole LOGIN role is `ebn_restore_operator`, protected by a freshly generated SCRAM password stored only under the private runtime root. `%LOCALAPPDATA%\EBN-maintenance\pg17-restore-task7\credentials.json` supplies the local integration fixture connection parameters. Never print/copy its contents into logs, commands, reports or Git. This is a test runtime credential, not a chosen production password.

```powershell
$env:MAINTENANCE_TEST_PG_BIN = "$env:LOCALAPPDATA\EBN-maintenance\pg17-task7\clients\pgsql\bin"
$env:MAINTENANCE_TEST_RESTORE_CREDENTIALS = "$env:LOCALAPPDATA\EBN-maintenance\pg17-restore-task7\credentials.json"
npm test -- --runInBand --runTestsByPath src/modules/mlm/mlm-maintenance.spec.ts src/modules/mlm/mlm-maintenance-postgres.spec.ts
npx --no-install tsc --noEmit --target ES2021 --module commonjs --skipLibCheck scripts/maintenance.ts
```

The integration suite is opt-in via MAINTENANCE_TEST_PG_BIN, and additionally requires the private restore fixture credential file; a missing privacy fixture is an error, never a bypass. It uses literal loopback and creates/drops ONLY UUID-suffixed `ebn_maintenance_test_*` and `ebn_restore_*` databases it allocated itself. Negative privacy tests briefly modify only the dedicated restore service's fixture role/HBA/file ACL and restore them; no shared-cluster authentication/role change occurs. Main's `mlm_integration` is never touched. Test backups remain in private `ebn-maintenance-backups-*` directories under the user temp directory for audit; these contain synthetic fixtures only. Coordinate cleanup/shutdown with main and target ONLY the selected runtime's data directory using its `pg_ctl`, never a global process kill or service stop. Do not delete the private credential while retained restore copies still need controlled access.
