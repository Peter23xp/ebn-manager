import { describe, expect, it, vi } from 'vitest';
import { canSyncPendingVente, syncPendingVentes } from './offline-sales-sync';
import type { OfflineSyncSession, PendingQueueRecord, PendingVente } from './offline-sales-sync';
import type { CreateVenteDto } from './ventes.api';
import type { Role } from '@/types';

const payload: CreateVenteDto = {
  siteId: 'site-a', lignes: [{ produitId: 'product-a', quantite: 1, prixUnitaire: 10 }], modePaiement: 'CASH',
};
const owned: PendingVente = {
  localId: 'owned', ownerUserId: 'cashier', ownerSiteId: 'site-a', createdAt: '2026-09-19T10:00:00.000Z', payload,
};
const cashier: OfflineSyncSession = {
  user: { id: 'cashier', name: 'Caisse', role: 'CAISSIER', siteId: 'site-a' },
  isAuthenticated: true, sessionVersion: 1, effectiveSiteId: 'site-a',
};

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
}

function repository(initial: PendingQueueRecord[] = [owned]) {
  const records = structuredClone(initial);
  let session = structuredClone(cashier);
  const remove = vi.fn(async (localId: string) => { records.splice(records.findIndex(record => record.localId === localId), 1); });
  const setReviewRequired = vi.fn(async (localId: string, required: boolean) => {
    const index = records.findIndex(record => record.localId === localId);
    const next = { ...records[index] } as PendingQueueRecord;
    if (required) next.reviewRequired = true;
    else delete next.reviewRequired;
    records[index] = next;
  });
  const send = vi.fn(async (_payload: CreateVenteDto, _version: number): Promise<unknown> => ({ id: 'server-sale' }));
  return {
    records, remove, send, setReviewRequired,
    load: async () => [...records],
    getSession: () => session,
    setSession: (next: OfflineSyncSession) => { session = next; },
  };
}

describe('canSyncPendingVente', () => {
  it.each<[Role, boolean]>([
    ['CLIENT', false], ['FORMATEUR', false], ['AGENT', false], ['CAISSIER', true],
    ['GERANT', true], ['DIRECTEUR_REGIONAL', true], ['SUPER_ADMIN', true],
  ])('requires caisse permission for %s', (role, allowed) => {
    expect(canSyncPendingVente(owned, { ...cashier, user: { ...cashier.user!, role } })).toBe(allowed);
  });

  it.each<Partial<OfflineSyncSession>>([
    { isAuthenticated: false }, { user: null }, { effectiveSiteId: null }, { effectiveSiteId: 'site-b' },
    { user: { ...cashier.user!, id: 'other' } },
    { user: { ...cashier.user!, siteId: 'site-b' } },
    { user: { ...cashier.user!, siteId: null } },
  ])('rejects an unauthorized owner/site/session: %j', change => {
    expect(canSyncPendingVente(owned, { ...cashier, ...change })).toBe(false);
  });

  it.each<PendingQueueRecord>([
    { localId: 'legacy', ...payload },
    { ...owned, localId: '' }, { ...owned, ownerUserId: '' }, { ...owned, ownerSiteId: '' },
    { ...owned, createdAt: '' }, { ...owned, createdAt: 'invalid' },
    { ...owned, reviewRequired: true },
    { ...owned, payload: null }, { ...owned, payload: { ...payload, siteId: 'site-b' } },
    { localId: 'partial', ownerUserId: 'cashier', ownerSiteId: 'site-a', payload },
  ])('preserves incomplete or mismatched envelopes: %j', record => {
    expect(canSyncPendingVente(record, cashier)).toBe(false);
  });

  it('allows higher roles at the effective site without taking another owner’s queue', () => {
    const manager = { ...cashier, user: { ...cashier.user!, role: 'GERANT' as const, siteId: 'site-b' } };
    expect(canSyncPendingVente(owned, manager)).toBe(true);
    expect(canSyncPendingVente({ ...owned, ownerUserId: 'other' }, manager)).toBe(false);
  });
});

describe('syncPendingVentes', () => {
  it('keeps legacy and foreign records byte-for-byte without sending them', async () => {
    const storage = repository([{ localId: 'legacy', ...payload }, { ...owned, ownerUserId: 'other' }]);
    const before = structuredClone(storage.records);
    expect(await syncPendingVentes(storage)).toEqual({ synced: 0, blocked: 2, failed: 0 });
    expect(storage.records).toEqual(before);
    expect(storage.send).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it('sends only the payload tagged with the authorized session and removes only after success', async () => {
    const storage = repository();
    const response = deferred<unknown>();
    storage.send.mockReturnValue(response.promise);
    const draining = syncPendingVentes(storage);
    await vi.waitFor(() => expect(storage.send).toHaveBeenCalledWith(payload, 1));
    expect(storage.records).toEqual([{ ...owned, reviewRequired: true }]);
    expect(storage.remove).not.toHaveBeenCalled();
    response.resolve({ id: 'server-sale' });
    expect(await draining).toEqual({ synced: 1, blocked: 0, failed: 0 });
    expect(storage.records).toEqual([]);
  });

  it.each(['logout', 'account', 'relogin', 'role', 'site'] as const)('blocks a %s transition during delayed load', async transition => {
    const storage = repository();
    const loaded = deferred<PendingQueueRecord[]>();
    const draining = syncPendingVentes({ ...storage, load: () => loaded.promise });
    if (transition === 'logout') storage.setSession({ ...cashier, user: null, isAuthenticated: false, sessionVersion: 2 });
    if (transition === 'account') storage.setSession({ ...cashier, user: { ...cashier.user!, id: 'other' }, sessionVersion: 2 });
    if (transition === 'relogin') storage.setSession({ ...cashier, sessionVersion: 3 });
    if (transition === 'role') storage.setSession({ ...cashier, user: { ...cashier.user!, role: 'AGENT' } });
    if (transition === 'site') storage.setSession({ ...cashier, effectiveSiteId: 'site-b' });
    loaded.resolve(storage.records);
    expect(await draining).toEqual({ synced: 0, blocked: 1, failed: 0 });
    expect(storage.send).not.toHaveBeenCalled();
    expect(storage.records).toHaveLength(1);
  });

  it('rechecks the session immediately before the send', async () => {
    const storage = repository();
    const getSession = vi.fn().mockReturnValueOnce(cashier).mockReturnValue({ ...cashier, sessionVersion: 2 });
    expect(await syncPendingVentes({ ...storage, getSession })).toEqual({ synced: 0, blocked: 1, failed: 0 });
    expect(storage.send).not.toHaveBeenCalled();
  });

  it.each(['logout', 'account', 'relogin', 'role', 'site'] as const)('acknowledges the confirmed entry but stops later sends after %s', async transition => {
    const untouched: PendingQueueRecord[] = [
      { ...owned, localId: 'next' },
      { localId: 'legacy', ...payload },
      { ...owned, localId: 'foreign', ownerUserId: 'other' },
    ];
    const storage = repository([owned, ...untouched]);
    const response = deferred<unknown>();
    storage.send.mockReturnValue(response.promise);
    const draining = syncPendingVentes(storage);
    await vi.waitFor(() => expect(storage.send).toHaveBeenCalledTimes(1));
    if (transition === 'logout') storage.setSession({ ...cashier, user: null, isAuthenticated: false, sessionVersion: 2 });
    if (transition === 'account') storage.setSession({ ...cashier, user: { ...cashier.user!, id: 'other' }, sessionVersion: 2 });
    if (transition === 'relogin') storage.setSession({ ...cashier, sessionVersion: 3 });
    if (transition === 'role') storage.setSession({ ...cashier, user: { ...cashier.user!, role: 'AGENT' } });
    if (transition === 'site') storage.setSession({ ...cashier, effectiveSiteId: 'site-b' });
    response.resolve({ id: 'server-sale' });
    expect(await draining).toEqual({ synced: 1, blocked: 3, failed: 0 });
    expect(storage.send).toHaveBeenCalledTimes(1);
    expect(storage.remove).toHaveBeenCalledExactlyOnceWith('owned');
    expect(storage.records).toEqual(untouched);
  });

  it('rechecks after a delayed removal before starting the next sale', async () => {
    const storage = repository([owned, { ...owned, localId: 'next' }]);
    const removed = deferred<void>();
    const remove = vi.fn(async (localId: string) => { await removed.promise; await storage.remove(localId); });
    const draining = syncPendingVentes({ ...storage, remove });
    await vi.waitFor(() => expect(remove).toHaveBeenCalledTimes(1));
    storage.setSession({ ...cashier, sessionVersion: 2 });
    removed.resolve();
    expect(await draining).toEqual({ synced: 1, blocked: 1, failed: 0 });
    expect(storage.send).toHaveBeenCalledTimes(1);
    expect(storage.records.map(record => record.localId)).toEqual(['next']);
  });

  it.each([
    { response: { status: 403 } }, { response: { status: 409 } }, { code: 'NETWORK_OFFLINE' },
    { code: 'ERR_CANCELED' }, { code: 'MOBILE_MONEY_UNAVAILABLE', response: { status: 503 } },
  ])('retains a known denial or no-dispatch sale as retryable: %j', async error => {
    const storage = repository();
    storage.send.mockRejectedValue(error);
    expect(await syncPendingVentes(storage)).toEqual({ synced: 0, blocked: 0, failed: 1 });
    expect(storage.records).toEqual([owned]);
    expect(storage.send).toHaveBeenCalledTimes(1);
    expect(storage.remove).not.toHaveBeenCalled();
    storage.send.mockResolvedValue({ id: 'server-sale' });
    expect(await syncPendingVentes(storage)).toEqual({ synced: 1, blocked: 0, failed: 0 });
  });

  it.each([
    { code: 'ERR_NETWORK' }, { code: 'ECONNABORTED' }, { code: 'ETIMEDOUT' },
    { code: 'ERR_CANCELED', request: {} }, { response: { status: 408 } }, { response: { status: 502 } }, new Error('Uncertain outcome'),
  ])('persistently blocks uncertain dispatched outcomes from another drain: %j', async error => {
    const storage = repository();
    storage.send.mockRejectedValue(error);
    expect(await syncPendingVentes(storage)).toEqual({ synced: 0, blocked: 0, failed: 1 });
    expect(storage.records).toEqual([{ ...owned, reviewRequired: true }]);
    storage.setSession({ ...cashier, sessionVersion: 3 });
    expect(await syncPendingVentes(storage)).toEqual({ synced: 0, blocked: 1, failed: 0 });
    expect(storage.send).toHaveBeenCalledTimes(1);
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it('does not dispatch if the protective marker cannot be persisted', async () => {
    const storage = repository();
    storage.setReviewRequired.mockRejectedValueOnce(new Error('Storage unavailable'));
    expect(await syncPendingVentes(storage)).toEqual({ synced: 0, blocked: 0, failed: 1 });
    expect(storage.records).toEqual([owned]);
    expect(storage.send).not.toHaveBeenCalled();
  });

  it('clears the marker without dispatching when the session changes during persistence', async () => {
    const storage = repository();
    const setReviewRequired = storage.setReviewRequired.getMockImplementation()!;
    storage.setReviewRequired.mockImplementationOnce(async (localId, required) => {
      await setReviewRequired(localId, required);
      storage.setSession({ ...cashier, sessionVersion: 2 });
    });
    expect(await syncPendingVentes(storage)).toEqual({ synced: 0, blocked: 1, failed: 0 });
    expect(storage.records).toEqual([owned]);
    expect(storage.send).not.toHaveBeenCalled();
  });

  it('keeps a confirmed sale blocked if local acknowledgement fails', async () => {
    const storage = repository();
    storage.remove.mockRejectedValueOnce(new Error('Storage unavailable'));
    expect(await syncPendingVentes(storage)).toEqual({ synced: 0, blocked: 0, failed: 1 });
    expect(storage.records).toEqual([{ ...owned, reviewRequired: true }]);
    expect(await syncPendingVentes(storage)).toEqual({ synced: 0, blocked: 1, failed: 0 });
    expect(storage.send).toHaveBeenCalledTimes(1);
  });
});
