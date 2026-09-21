import { describe, expect, it } from '@jest/globals';
import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import * as path from 'path';
import { parseCatchupOptions, catchupStateHash, assertCatchupEntry, reconcileCatchupEntry, runCatchup } from '../../../scripts/mlm-progressive-catchup';

describe('progressive catch-up safety', () => {
  it('defaults to preview and requires explicit execution prerequisites', () => {
    expect(parseCatchupOptions(['--output', 'preview.json'])).toMatchObject({ mode: 'preview', limit: 100 });
    expect(() => parseCatchupOptions(['--execute'])).toThrow();
    expect(() => parseCatchupOptions(['--mode', 'purge'])).toThrow();
    expect(() => parseCatchupOptions(['--limit', '100000'])).toThrow();
    expect(() => parseCatchupOptions(['--limit', '0'])).toThrow();
  });

  it('rejects a stale approved entry rather than silently recomputing money', () => {
    const approved = { matrixId: 'm', from: 0, to: 1, currentValidPositions: 1, budget: { total: '40.00' } };
    const entry = { preview: approved, stateHash: catchupStateHash(approved) };
    expect(() => assertCatchupEntry(entry, approved)).not.toThrow();
    expect(() => assertCatchupEntry(entry, { ...approved, currentValidPositions: 2 })).toThrow(/perime/i);
    expect(() => assertCatchupEntry(entry, { ...approved, budget: { total: '80.00' } })).toThrow(/perime/i);
  });

  it('rejects a tampered report or blocked anomaly', () => {
    const preview = { matrixId: 'm', from: 0, to: 1 };
    expect(() => assertCatchupEntry({ preview, stateHash: 'invalid' }, preview)).toThrow();
    expect(() => assertCatchupEntry({ preview: null, error: 'Historique ambigu' }, preview)).toThrow();
  });

  it('requires target confirmation, backup and operator identity for apply', () => {
    expect(() => parseCatchupOptions(['--mode', 'apply', '--execute', '--preview', 'preview.json'])).toThrow();
    const options = parseCatchupOptions(['--mode', 'apply', '--execute', '--preview', 'preview.json', '--fingerprint', 'target', '--bundle', 'backup', '--pg-bin', 'bin', '--actor-id', 'admin', '--output', 'result.json']);
    expect(options.mode).toBe('apply');
    expect(options.execute).toBe(true);
  });

  it('hashes key order canonically without ignoring nested changes or array order', () => {
    expect(catchupStateHash({ second: 2, first: { amount: '6.00' } }))
      .toBe(catchupStateHash({ first: { amount: '6.00' }, second: 2 }));
    expect(catchupStateHash(['a', 'b'])).not.toBe(catchupStateHash(['b', 'a']));
  });

  it.each([
    ['--execute', '--output', 'report.json'], ['--output', 'report.json', '--verified', 'true'],
    ['--output', 'report.json', '--limit', '1.5'], ['--output', 'report.json', '--limit', '201'],
    ['--output', 'report.json', '--limit', '1', '--limit', '2'],
  ])('rejects ambiguous or unsafe arguments %j', (...args) => {
    expect(() => parseCatchupOptions(args)).toThrow();
  });

  it('requires its own explicit URL instead of DATABASE_URL or .env', async () => {
    await expect(runCatchup(['--output', 'report.json'], { DATABASE_URL: 'postgresql://do-not-use.invalid/db' }))
      .rejects.toThrow('CATCHUP_SOURCE_URL_REQUIRED');
  });

  it('rejects in-repository outputs before attempting a database connection', async () => {
    await expect(runCatchup(['--output', path.join(__dirname, 'unsafe-report.json')],
      { CATCHUP_SOURCE_URL: 'postgresql://postgres@127.0.0.1:1/never_connected' })).rejects.toThrow('BACKUP_INSIDE_REPOSITORY');
  });
});

const historyHash = (rows: unknown[]) => createHash('sha256').update(JSON.stringify(rows)).digest('hex');
const preview = {
  matrixId: 'matrix', memberId: 'member', levelId: 1, generation: 1, levelName: 'Builder', capacity: 4,
  currentValidPositions: 1, accountedPositions: 0, from: 0, to: 1, initialized: false,
  budget: { total: '40.00', immediate: '24.00', held: '16.00' },
  proposed: { total: '10.00', immediate: '6.00', held: '4.00' },
  rewardedAt: null, suspendedReason: null, historyFingerprint: historyHash([]), contextFingerprint: 'context',
};
const row = {
  id: 'commission', membreId: 'member', mlmLevelId: 1, matrixId: 'matrix', filleulId: null, positionId: null,
  referenceId: 'generation-progress:matrix:1:v1', calculationVersion: 'v1', generationEventId: 'operation',
  generationActorId: 'admin', origin: 'CATCH_UP', progressFrom: 0, progressTo: 1, statut: 'EN_ATTENTE',
  montant: new Prisma.Decimal(10), montantSysteme: new Prisma.Decimal(6), montantRetour: new Prisma.Decimal(4),
  description: 'Rattrapage de génération 1 — Builder : 1–1/4', notes: null, valideeAt: null, payeeAt: null,
  validatedById: null, createdAt: new Date('2026-09-21T10:00:00Z'), updatedAt: new Date('2026-09-21T10:00:00Z'),
};
const entry = (state = preview) => ({ matrixId: state.matrixId, preview: state, stateHash: catchupStateHash(state) });
const completed = (rows = [row]) => ({ ...preview, initialized: true, from: 1, accountedPositions: 1,
  proposed: { total: '0.00', immediate: '0.00', held: '0.00' }, historyFingerprint: historyHash(rows) });
const event = { id: 'operation', actorId: 'admin', origin: 'CATCH_UP' as const };

describe('catch-up commit-before-output recovery', () => {
  it('accepts only the exact pending committed event and range', () => {
    expect(reconcileCatchupEntry(entry(), completed(), [row], event)).toBe('already-applied');
  });

  it.each([
    { generationEventId: 'different' }, { generationActorId: 'different' }, { origin: 'PROGRESSIVE' },
    { progressFrom: 1 }, { progressTo: 2 }, { montant: new Prisma.Decimal(20) },
    { statut: 'VALIDEE' }, { notes: 'changed' }, { positionId: 'invented' }, { filleulId: 'invented' },
    { updatedAt: new Date('2026-09-21T11:00:00Z') },
  ])('rejects changed expected commission %j', change => {
    const rows = [{ ...row, ...change }];
    expect(() => reconcileCatchupEntry(entry(), completed(rows), rows, event)).toThrow();
  });

  it('does not hide changed other commission history during recovery', () => {
    const previous = { ...row, id: 'old', referenceId: 'old-reference' };
    const approved = { ...preview, historyFingerprint: historyHash([previous]) };
    const rows = [{ ...previous, notes: 'changed' }, row];
    expect(() => reconcileCatchupEntry(entry(approved), completed(rows), rows, event)).toThrow();
  });

  it.each(['contextFingerprint', 'currentValidPositions', 'rewardedAt'])('does not normalize unrelated %s changes', key => {
    expect(() => reconcileCatchupEntry(entry(), { ...completed(), [key]: 'changed' }, [row], event)).toThrow();
  });

  it('recovers zero-money accounting without pretending a commission exists', () => {
    const zero = { ...preview, budget: { total: '0.00', immediate: '0.00', held: '0.00' },
      proposed: { total: '0.00', immediate: '0.00', held: '0.00' } };
    const after = { ...zero, initialized: true, from: 1, accountedPositions: 1 };
    expect(reconcileCatchupEntry(entry(zero), after, [], event)).toBe('already-applied');
    expect(() => reconcileCatchupEntry(entry(zero), { ...after, historyFingerprint: 'changed' }, [], event)).toThrow();
  });

  it('recovers legacy initialization only when the historical fingerprint remains identical', () => {
    const legacy = { ...preview, from: 4, to: 4, accountedPositions: 4,
      proposed: { total: '0.00', immediate: '0.00', held: '0.00' }, historyFingerprint: 'legacy' };
    expect(reconcileCatchupEntry(entry(legacy), { ...legacy, initialized: true }, [], event)).toBe('already-applied');
    expect(() => reconcileCatchupEntry(entry(legacy), { ...legacy, initialized: true, historyFingerprint: 'edited' }, [], event)).toThrow();
  });
});
