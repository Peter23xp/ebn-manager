# Progressive commission catch-up

This tool implements Task 4 only. It uses the existing progressive `preview` / `account` service, commissions and matrix high-water marks. It never purges, validates a commission, credits a wallet, creates a reinvestment lot, or starts a payment. Deployment, remote migrations and production execution are not authorized by this document.

## Preconditions

- Run from `techshop-manager/backend` with the additive progressive migration already installed and the Prisma client generated.
- Set **`CATCHUP_SOURCE_URL` explicitly** in the operator environment. There is no fallback to `DATABASE_URL` and no `.env` loading. The PostgreSQL driver adapter receives only the explicitly parsed connection. Direct endpoints and the existing maintenance URL/TLS policy apply; transaction/session-pooler workarounds are not supported.
- Keep URLs, passwords and tokens out of argv, reports, Git and console output. Supply restore credentials only through `CATCHUP_RESTORE_URL`.
- Use an absolute, **out-of-repository private directory** on a trusted host. New output directories receive the existing maintenance ACL policy: current user and SYSTEM on Windows, owner-only on POSIX. Existing permissive directories, symlinks, nonregular files, hardlinked report files and existing output names are rejected. Do not use the checkout's `.superpowers` directory for financial reports or dumps.
- An active `SUPER_ADMIN` ID is required for apply. Use that same ID for backup administrator selection and every retry of this operation.

## 1. Read-only preview

After securely setting `CATCHUP_SOURCE_URL`:

```powershell
npx --no-install tsx scripts/mlm-progressive-catchup.ts --output C:\PrivateMlmCatchup\page-001.json
```

Default mode is `preview`, with 100 matrices maximum. `--limit` accepts integers from 1 through 200. Keyset pagination uses ascending matrix IDs and an exclusive `--after` cursor:

```powershell
npx --no-install tsx scripts/mlm-progressive-catchup.ts --limit 100 --after '<previous nextAfter>' --output C:\PrivateMlmCatchup\page-002.json
```

Each page has its own operation UUID, format and calculation-policy versions, creation time, nonsecret target fingerprint, page cursor, audit summary, report hash and per-matrix state hashes. A matrix entry includes member/level identity, capacity, current and accounted positions, frozen budget, proposed range/amounts, suspension and anomaly information. History, promotions, bonuses, matrix context and member context are compared without exporting their underlying rows.

Preview uses repeatable-read, read-only transactions. It neither initializes legacy matrices nor writes commissions. Existing `inspectTarget` and `auditMlm` are read-only; the global structural audit is not a paginated business repair and can time out on a large graph. Audit findings are summarized with counts and at most 20 examples per category. A timeout aborts; there is no silent partial audit.

Review the complete page. Unknown/duplicate/missing history, invalid budgets, ambiguous promotions/bonuses and structural audit findings block execution. A legacy full-generation commission must satisfy the core's promotion/bonus reconciliation, regardless of payment status. Do not edit a report to suppress anomalies or recompute its hashes. Correct the source through an independently reviewed process, then make a new preview.

Hashes detect corruption and changes; they are not digital signatures or a substitute for private filesystem access and operator review.

## 2. Strict offline backup

Stop source application workers and payment processing through the normal operational procedure. Establish the existing strict-offline maintenance fence: no other source sessions, no PUBLIC CONNECT, no other login role with CONNECT, no prepared transactions/subscriptions/background writers, no pending provider payments, and adequate catalog visibility. Keep exclusive custody of the maintenance credentials until the run is complete.

The CLI does **not** revoke privileges, terminate sessions, modify authentication or weaken this fence. If hosting permissions or payment state make the strict workflow impossible, stop. There is no transaction-fenced/purge fallback.

Create a backup **after** the approved preview:

```powershell
npx --no-install tsx scripts/mlm-progressive-catchup.ts --mode backup --fingerprint '<preview targetFingerprint>' --actor-id '<super-admin-id>' --pg-bin 'C:\PostgreSQL\bin' --backup-root C:\PrivateMlmCatchup\bundles --output C:\PrivateMlmCatchup\backup.json
```

This calls unchanged `createBackup` in strict-offline mode. Its native dump, manifest, schema/data/sequence checksums and selected administrator are authoritative. The private receipt contains the returned bundle directory; the dump contains confidential database rows and must remain private. Backup does not alter source data. A receipt is **not** proof of successful restore verification.

## 3. Restore verification and explicit apply

Provision a **fresh empty** database named `ebn_restore_<suffix>` on a separate, dedicated private local PostgreSQL cluster. Set `CATCHUP_RESTORE_URL` securely. Existing `verifyBackup` enforces literal loopback, a password and SCRAM authentication, exclusive cluster use, private data/config/HBA/log files, no unrelated databases, safe catalog objects and exact restored snapshot equivalence. A shared trust-authenticated integration server is not an acceptable restore target.

```powershell
npx --no-install tsx scripts/mlm-progressive-catchup.ts --mode apply --execute --fingerprint '<preview targetFingerprint>' --actor-id '<same-super-admin-id>' --preview C:\PrivateMlmCatchup\page-001.json --bundle '<bundle from backup.json>' --pg-bin 'C:\PostgreSQL\bin' --output C:\PrivateMlmCatchup\result-001.json
```

Apply always performs a genuine native restore through `verifyBackup`; it cannot accept a `--verified` flag or a hand-written verification receipt. The approved entries are also compared against the restored database, proving the bundle contains their reviewed state. A bundle predating the preview, different target, wrong administrator, changed dump, unsafe catalog/restore service or failed comparison stops the run before source accounting. Keep the original bundle for retries. The source must remain strictly offline; the source fence and active administrator are checked again before each write transaction.

The current source catalog is checked with the unchanged maintenance `readCatalog` / `assertCatalogSafe` policy; `inspectTarget` alone is informational and is not sufficient. Each write or resume transaction also binds `schemaState().schema` to the genuinely verified backup's schema hash. After advisory locking, the tool locks the source's public tables in `SHARE ROW EXCLUSIVE` mode and rechecks the catalog/schema before accounting and before returning/committing, including already-applied entries. Unknown source triggers or changed functions, constraints, columns, enums, indexes or sequence definitions block the operation. The hash deliberately excludes row contents and current sequence values: expected committed accounting and sequence advancement do not invalidate a legitimate resume. DDL changes require a new reviewed backup/workflow, not a verification override. Exclusive credential custody remains necessary; do not run DDL concurrently with catch-up.

Each approved matrix is re-read under advisory lock **604008** in its own bounded transaction. Changed state is rejected rather than silently repriced. The same core accounting method creates only `EN_ATTENTE` commissions, with the operation ID and administrator as the catch-up event, and no invented triggering member/position. Legacy-only/zero-money accounting may advance matrix state without creating a financial row. Unchanged or suspended matrices do not generate money.

The strict catalog policy also checks the live source, not only the restored backup. Each write transaction locks the application tables, rechecks the catalog, and compares the source schema fingerprint with the genuinely verified backup before and after accounting, including on resume. A new trigger, changed function or other schema drift must be reviewed through a new backup/preview workflow; business-row hashes alone do not authorize it. Sequence counters may advance with data, but sequence definitions remain part of the checked schema.

Transactions use a 5-second lock timeout, 30-second statement timeout and 45-second transaction timeout. A page is not globally atomic: an earlier matrix may commit before a later one fails. The private result is updated after each commit using a flushed temporary file and rename. Inspect `status` and per-entry ranges; interruption is an operational failure, not authorization to continue on divergent data.

## 4. Resume after interruption

Use the **same original preview, operation ID, actor and bundle**, a **new empty restore database**, and a **new output filename**. Every attempt genuinely verifies the bundle again. The tool does not clear a previously restored database and will reject it as nonempty.

Recovery does not depend on the result file having been written after commit. It requires the expected unique commission reference plus exact beneficiary, level, event, actor, origin, pending status, trigger absence, range, amounts and unchanged other history/context. A validated, cancelled, edited, missing or unrelated commission is not blindly skipped. A subsequent legitimate financial operation therefore requires a fresh reviewed preview rather than automatic recovery.

For zero-money or legacy-only accounting, only the known initialized/from/accounted/proposed changes are normalized. Commission-history and context fingerprints must remain identical. No parallel ledger table or database is created. Reports and receipts are private operational artifacts, not payment authority.

## Validation and calendar

Catch-up does not start a hold period. Normal commission validation credits the positive immediate portion and creates the positive held portion through the existing financial workflow. The held tranche's 30 working days begin at validation, Monday through Saturday excluding RDC public holidays. Required calendar years must be configured before validation; this tool does not invent holiday dates or bypass missing-calendar errors.

## Local tests

Pure tests require no database:

```powershell
npm test -- --runInBand mlm-progressive-catchup.spec.ts
```

The prefixed-row transaction tests accept only the exact synthetic URL; they do not seed/reset levels or mutate another test's fixtures:

```powershell
$env:CATCHUP_TEST_DATABASE_URL = 'postgresql://postgres@127.0.0.1:55432/mlm_integration'
npm test -- --runInBand mlm-progressive-catchup.integration.spec.ts
```

The optional native workflow test additionally requires `CATCHUP_TEST_PG_BIN` and `CATCHUP_TEST_RESTORE_CREDENTIALS` (the private JSON credential file for the existing dedicated `127.0.0.1:55433` synthetic restore service). It creates/migrates only its own UUID-suffixed `ebn_catchup_test_*` source database and `ebn_restore_*` targets, verifies a native backup, applies, resumes and drops only those databases. Private synthetic bundles remain in `ebn-catchup-*` temp directories for controlled retention. It does not alter shared-source roles, authentication, levels or fixtures. Missing restore prerequisites fail the opted-in test, never turn verification into a stub.

The native test credential file accepts only `host`, `port`, `database`, `user` and `password`, with the exact dedicated local host/port/database/operator checked before any connection. Additional routing options such as `connectionString` are rejected. Cleanup does not connect after rejected setup or when no restore database was allocated. `CATCHUP_TEST_PG_BIN` must contain both `pg_dump` and `pg_restore`, not just the server executable. Native regressions cover source triggers added after backup or after verification, and schema drift on resume, without permitting wallet credits.

The native credential file must contain exactly `host`, `port`, `database`, `user`, and a nonempty string `password`. The target must be literal `127.0.0.1`, numeric port `55433`, database `postgres`, and user `ebn_restore_operator`. Additional options, especially `connectionString`, `ssl`, `options` or `stream`, are rejected. The fixture builds a new allowlisted PostgreSQL configuration instead of spreading parsed JSON. Only validated credentials enter cleanup state; rejected setup or zero allocated restore databases causes no cleanup connection. Only successfully allocated source/restore databases are eligible for cleanup.

DB-free fixture validation and teardown regressions can also be run without either server:

```powershell
npm test -- --runInBand mlm-progressive-catchup.integration.spec.ts -t 'fixture guards'
```

The genuine native regression installs a wallet-crediting trigger on its disposable source after backup, and again immediately after real restore verification. Both attempts must leave wallets, commissions and matrices unchanged. A later catalog-safe column change must block resume through schema binding; after removing it, clean apply/resume and sequence-data advancement remain supported.
