# MLM Automatic Ascent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox syntax for tracking.

**Goal:** Automatically lift complete branches past incomplete matrix parents without changing recruiters or other branches.

**Architecture:** Extend MlmPlacementService under its existing advisory lock and transaction. Reuse Position, append-only PlacementHistory, descendant deltas, generation recalculation and commission idempotence. No second network or financial engine.

**Tech Stack:** NestJS, Prisma 5, PostgreSQL, Jest, existing React tree consumers.

**Spec:** docs/superpowers/specs/2026-09-17-mlm-automatic-ascent-design.md

## Global Constraints

- Four direct positions maximum; no root replacement, forced displacement or cycle.
- Recruiters and entire subtrees are preserved.
- Stop at full parents/destinations, inactive placements or the root.
- No production database mutations, purge, commit, push or deployment in this task.
- Preserve pending Mobile Money changes in the working tree.

## Task 1: Reproduce and implement branch ascent

Files: backend/src/modules/mlm/mlm-ascent.integration.spec.ts, backend/src/modules/mlm/mlm-placement.service.ts.

- [x] Add real PostgreSQL fixtures in the existing guarded local integration database. Construct grandparent -> parent (three children including candidate); candidate has three children. Activate its fourth through the real MlmMatrixService.
- [x] Assert the candidate is now attached to grandparent, parent still attached to grandparent, the candidate's four children retain their incoming positions, and parent has its two remaining children. Run `npm test -- --runInBand mlm-ascent.integration.spec.ts`; confirm RED.
- [x] Add transaction-level ascent settlement in MlmPlacementService. Read actual direct positions, validate incoming/member/parent/destination status, select lowest free slot, clear conditionally, claim with original validation metadata, append AUTO_ASCEND history, update totals, recalculate affected ancestors, and queue affected neighborhoods. Use finite upward moves, never recursive callbacks into the placement API.
- [x] Integrate settlement after place/move/swap, preserving administrative replay contracts and actor identity. Return the actual final position from placement.
- [x] Test success, multi-generation cascades, stop conditions, preserved children/recruiters and history. Confirm GREEN.

## Task 2: Safe replay, audit and regressions

Files: backend/src/modules/mlm/mlm-ascent.integration.spec.ts, backend/src/modules/mlm/mlm-placement.service.spec.ts; existing MLM controller/DTO if an explicit administrative reconciliation entry is needed.

- [x] Provide an authenticated administrative reconciliation entry using the same transaction-level ascent rules for existing members. Keep GET requests read-only, validate input and reuse historical actor/operation keys.
- [x] Test replay and concurrent activation, rollback on journal failure, exact aggregate counts from recursive SQL, generation commission uniqueness, unchanged financial amounts, and tree/list generation results.
- [x] Run targeted and full backend tests, targeted frontend tree consumers, backend/frontend builds, `prisma validate`, local migration status/diff, and `git diff --check`.
- [x] Request independent review, resolve important findings, document verification and deployment/reconciliation boundaries. No commit or push.

## Execution notes

- Kept the supplied checkout and prior Mobile Money work intact; no worktree, branch, commit or deployment created.
- Added frontend reconciliation action with retry-stable operation IDs and history labels. Tree selection now follows refreshed generations/parents and clears when a member leaves the visible subtree.
- Independent review found no blocking implementation defect. Added coverage for inactive candidates/children, invalid positions, competing branches, validated financial balances/lots, and SWAP-triggered ascent/replay/rollback.
- Negative PostgreSQL fixtures initially changed validation flags without refreshing their aggregate projections. Fixed fixture setup and repaired only the previous synthetic ascent fixtures in the explicit loopback database. No production data correction.
- Full frontend regression also attempted: 273 passing, 21 pre-existing failures in PortalPointsPage.test.tsx (obsolete hook mock) and NotFoundPage.test.tsx (obsolete copy/link expectations). These unrelated tests/pages were not modified.
