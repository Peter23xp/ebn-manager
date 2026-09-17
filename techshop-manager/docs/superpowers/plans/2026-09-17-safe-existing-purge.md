# Safe Existing Purge Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development and test-driven-development. Main alone may execute against the authorized remote target.

**Goal:** Secure and execute the existing `backend/prisma/purge.ts`, retaining the two approved super-admins, technical configuration, MLM levels and the sites already preserved by that command.

**Architecture:** Replace the legacy sequence of independent Prisma deletes with a thin entry point into the existing maintenance helpers. Keep the strict direct/offline maintenance commands unchanged. Add an explicitly selected and independently reviewed transaction-fenced workflow: lock every public table in SHARE ROW EXCLUSIVE mode, create a native consistent snapshot backup, restore it confidentially and verify it, then delete only allowed business rows and commit after preservation checks. SHARE ROW EXCLUSIVE blocks concurrent data writes but permits the second pg_dump connection to read the exported snapshot; ACCESS EXCLUSIVE before pg_dump would deadlock that reader.

**Tech Stack:** Existing TypeScript, pg, native PostgreSQL 17 tools, Jest, private local SCRAM restore cluster.

**Spec:** User approval on 17 September 2026 to secure the identified legacy file before executing it; previous MLM specification and preservation of BOTH super-admin accounts continue to apply.

## Constraints

- No remote deletion before successful backup and restoration verification. No force/skip-backup/skip-restore flags.
- No credential or private row contents in logs, argv or Git. Backup and restored copy stay outside Git under verified private ACLs.
- Existing strict maintenance paths retain their original connection/privacy/offline guards.
- Session-pooler support is explicit, restricted to the known Supabase session endpoint shape, port 5432 and TLS. Transaction pooling is refused. Native/control connection parameters and exported snapshot must address the same database.
- The transaction holds all public-table write locks through snapshot, restoration, deletion and postflight. Use bounded lock/statement timeouts and reject catalog drift, unknown dependencies and in-flight payments. Do not terminate managed Supabase services or weaken their permissions.
- Preserve sites, configuration, levels, calendars, migration ledger and unknown independent tables. Preserve the exact selected administrator records, including their site links because sites remain. No automatic preserve-all-admins rule.
- Do not run the demo seed or change unrelated modules. No automatic new commits/push for this amendment unless requested.

## Task 1: Legacy entry point and tested transaction-fenced workflow

**Files:** `backend/prisma/purge.ts`, `backend/scripts/maintenance.ts`, maintenance unit/integration tests, `docs/superpowers/maintenance-runbook.md`.

- [x] Write failing tests: import does not delete, explicit execution, exact two admins/config/sites preserved, missing/tampered backup or restoration failure leaves source untouched, injected mid-delete failure rolls back, concurrent writer cannot modify a locked source table, pooler mode rejects unsafe variants and original direct guard still refuses it.
- [x] Reuse existing native backup, ACL, catalog/FK, fingerprint, snapshot, restoration and selected-admin helpers; keep the legacy file a small guarded CLI.
- [x] Run RED/GREEN unit and native integration cases on local synthetic fixtures, not the remote target.
- [x] Independently review the source/restore isolation and operational safety before remote execution.

## Task 2: Authorized remote operation (main only)

- [x] Read-only preflight: exact target and two admin identities, no pending payments, known catalog and schema version. Verify actual session-mode exported-snapshot/native connectivity; no hostname masquerading.
- [x] Prepare private backup directory and a fresh private local restore database. Audit/resolve any restoration incompatibility before deletion, never omit unknown archive entries to make a check pass.
- [x] Execute the reviewed `prisma/purge.ts` with explicit target fingerprint, exact preserved IDs and backup/restore parameters. Any failed gate rolls back the transaction and is reported, not bypassed.
- [x] Verify remote business counts, both administrators unchanged, configuration/sites/levels unchanged and retained backup location. Report precisely what was and was not executed.
- [x] Record test/operation results without secrets. Leave application migration/calendar steps explicit if still pending.

## Operational results

- The replacement passes 17 focused unit tests. The 12 original fenced native cases pass; three additional managed-policy native cases pass. Independent final review passes with matching tested file hashes.
- Executed the existing `backend/prisma/purge.ts` against the approved remote target on 17 September 2026. It returned `executed: true`, exit 0, after a native public-schema dump, private SCRAM restoration and exact snapshot verification under continuous source table locks.
- Private retained bundle: `%LOCALAPPDATA%/EBN-maintenance/remote-edwivhwdmajotuezyffj-20260917/backup-99f83770-a64b-49ed-8efe-b4d881ad7a03`. Operation and verification records remain beside it, outside Git. Separately retained managed event-trigger definitions are not represented as contents of the public-only archive.
- Independent postflight at 13:46 UTC confirms all targeted business tables empty, exactly two selected administrators unchanged from the fenced backup, five sites, one configuration row, eight levels and all 20 migration-ledger rows unchanged. The earlier preflight administrator digest is not substituted for the newer fenced-backup record.
- Render initially confirmed suspension; a later fresh observation showed the service active again. Suspension was reapplied and verified after page reload before migration. Do not claim uninterrupted external suspension beyond those observations; the purge's continuous database fence and fresh restored-copy postflight succeeded.
- Verified the failed migration checksum, sole pending migration and complete absence of its partial DDL. Separately marked that failed attempt rolled back, then successfully deployed `20260917000000_mlm_generations`. Prisma status is up to date, validation passes and database-to-model diff reports no difference.
- Initialized only the existing eight MLM levels in one transaction, with the requested exact 60/40 amounts. No general/demo seed ran. This authorized configuration update occurred after the purge's unchanged-level postcondition.
- Post-migration verification at 13:51 UTC confirms both complete administrator rows, sites and configuration unchanged, empty business tables, the failed attempt retained as rolled back and a successful new attempt. All six managed event-trigger definitions remain unchanged.
- RDC calendar years remain unconfigured (zero rows); commission validation correctly requires approved calendar coverage. No guessed holiday dates were inserted.
- Backend resumed and manual Render deployment `dep-dalv1d942hec73dq5qgg` of `ec66b60e3af8e6c0cba8cc87d242de537cdf68e2` succeeds: dashboard reports `Deploy succeeded | Live`, logs report no pending migrations and a successful Nest startup.
- Live HTTP smoke checks at 13:56 UTC: `/api/v1/health` returns 200/status ok; the actual `/api/v1/mlm/config`, `/api/v1/mlm/config/calendar` and `/api/v1/mlm/stats` routes correctly return 401 without credentials. An initial probe mistakenly used nonexistent `/mlm/levels` and returned 404; the controller-confirmed routes pass, with no application change required.
- Final full backend run: 298 tests pass, 42 optional native tests skipped in that invocation; backend build passes. Native evidence is the separately executed 12 fenced and three managed-policy cases, not the skipped full-run entries. Scoped TypeScript and Git whitespace checks pass.
- Remote `main` remains the previously requested and pushed `ec66b60`; the additional purge-script hardening and its tests/runbook/plan remain local, uncommitted. The pre-existing untracked technical guide is untouched.
