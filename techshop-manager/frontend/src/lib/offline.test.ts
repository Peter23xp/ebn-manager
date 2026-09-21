import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/store/auth.store';
import { useUIStore } from '@/store/ui.store';
import type { OfflineSyncSession } from './offline-sales-sync';
import type { CreateVenteDto } from './ventes.api';

const { openDB, records, database } = vi.hoisted(() => {
  const records = new Map<string, unknown>();
  const database = {
    put: vi.fn(async (_store: string, record: { localId: string }) => { records.set(record.localId, structuredClone(record)); }),
    getAll: vi.fn(async () => [...records.values()].map(record => structuredClone(record))),
    delete: vi.fn(async (_store: string, localId: string) => { records.delete(localId); }),
    transaction: vi.fn(() => ({
      store: {
        get: async (localId: string) => structuredClone(records.get(localId)),
        put: async (record: { localId: string }) => { records.set(record.localId, structuredClone(record)); },
      },
      done: Promise.resolve(),
    })),
  };
  return { records, database, openDB: vi.fn(async () => database) };
});
vi.mock('idb', () => ({ openDB }));

const payload: CreateVenteDto = { siteId: 'site-a', lignes: [{ produitId: 'product-a', quantite: 1, prixUnitaire: 10 }], modePaiement: 'CASH' };

function session(): OfflineSyncSession {
  const { user, isAuthenticated, sessionVersion } = useAuthStore.getState();
  return { user, isAuthenticated, sessionVersion, effectiveSiteId: user?.siteId ?? useUIStore.getState().selectedSiteId };
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  records.clear();
  openDB.mockResolvedValue(database);
  useAuthStore.getState().setAuth({ id: 'cashier', name: 'Caisse', role: 'CAISSIER', siteId: 'site-a' }, 'token');
  useUIStore.setState({ selectedSiteId: null });
  vi.doMock('@/store/auth.store', () => ({ useAuthStore }));
  vi.doMock('@/store/ui.store', () => ({ useUIStore }));
});

describe('offline persistence at the idb boundary', () => {
  it('stores an owned envelope without altering legacy entries or DB version 3', async () => {
    const legacy = { localId: 'legacy', ...payload };
    records.set('legacy', structuredClone(legacy));
    const { savePendingVente, getPendingVentes } = await import('./offline');
    const localId = await savePendingVente(payload, session());
    const saved = records.get(localId);
    expect(saved).toEqual({ localId, ownerUserId: 'cashier', ownerSiteId: 'site-a', createdAt: expect.any(String), payload });
    expect(openDB).toHaveBeenCalledWith('ebn-network-offline', 3, expect.any(Object));
    expect(await getPendingVentes()).toEqual([legacy, saved]);
    expect(records.get('legacy')).toEqual(legacy);
  });

  it.each(['agent', 'foreign-owner', 'foreign-site', 'logged-out', 'missing-site'] as const)('does not persist for %s', async scenario => {
    let captured = session();
    if (scenario === 'agent') {
      useAuthStore.getState().setAuth({ ...captured.user!, role: 'AGENT' }, 'token');
      captured = session();
    }
    if (scenario === 'foreign-owner') captured = { ...captured, user: { ...captured.user!, id: 'other' } };
    if (scenario === 'foreign-site') captured = { ...captured, effectiveSiteId: 'site-b' };
    if (scenario === 'logged-out') useAuthStore.getState().logout();
    if (scenario === 'missing-site') {
      useAuthStore.getState().setAuth({ ...captured.user!, siteId: null }, 'token');
      useUIStore.setState({ selectedSiteId: 'site-a' });
      captured = session();
    }
    const { savePendingVente } = await import('./offline');
    await expect(savePendingVente(payload, captured)).rejects.toThrow();
    expect(database.put).not.toHaveBeenCalled();
  });

  it.each(['logout', 'relogin', 'role', 'site'] as const)('revalidates %s after opening IndexedDB', async transition => {
    const captured = session();
    openDB.mockImplementationOnce(async () => {
      if (transition === 'logout') useAuthStore.getState().logout();
      if (transition === 'relogin') { useAuthStore.getState().logout(); useAuthStore.getState().setAuth(captured.user!, 'token'); }
      if (transition === 'role') useAuthStore.getState().setAuth({ ...captured.user!, role: 'AGENT' }, 'token');
      if (transition === 'site') useAuthStore.getState().setAuth({ ...captured.user!, siteId: 'site-b' }, 'token');
      return database;
    });
    const { savePendingVente } = await import('./offline');
    await expect(savePendingVente(payload, captured)).rejects.toThrow();
    expect(database.put).not.toHaveBeenCalled();
  });

  it('uses an administrator’s existing UI selection and rejects its change during DB open', async () => {
    useAuthStore.getState().setAuth({ id: 'admin', name: 'Admin', role: 'SUPER_ADMIN' }, 'admin-token');
    useUIStore.setState({ selectedSiteId: 'site-a' });
    const captured = session();
    openDB.mockImplementationOnce(async () => { useUIStore.setState({ selectedSiteId: 'site-b' }); return database; });
    const { savePendingVente } = await import('./offline');
    await expect(savePendingVente(payload, captured)).rejects.toThrow();
    expect(database.put).not.toHaveBeenCalled();
  });

  it('persists and clears only the exact review marker across adapter reloads without recreating absent records', async () => {
    const legacy = { localId: 'legacy', ...payload };
    const foreign = { localId: 'foreign', ownerUserId: 'other', ownerSiteId: 'site-a', createdAt: '2026-09-19T10:00:00.000Z', payload };
    records.set('legacy', legacy);
    records.set('foreign', foreign);
    const offline = await import('./offline');
    const localId = await offline.savePendingVente(payload, session());
    const original = records.get(localId) as object;
    await offline.setPendingVenteReviewRequired(localId, true);
    vi.resetModules();
    const reloaded = await import('./offline');
    expect(await reloaded.getPendingVentes()).toEqual([legacy, foreign, { ...original, reviewRequired: true }]);
    await reloaded.setPendingVenteReviewRequired(localId, false);
    await reloaded.setPendingVenteReviewRequired('missing', true);
    expect(await reloaded.getPendingVentes()).toEqual([legacy, foreign, original]);
    expect(database.transaction).toHaveBeenCalledWith('pending-ventes', 'readwrite');
    expect(openDB).toHaveBeenCalledWith('ebn-network-offline', 3, expect.any(Object));
  });

  it('saves an uncertain POS attempt with a persistent review marker in its original envelope', async () => {
    const { savePendingVente } = await import('./offline');
    const localId = await savePendingVente(payload, session(), { reviewRequired: true });
    expect(records.get(localId)).toEqual({ localId, ownerUserId: 'cashier', ownerSiteId: 'site-a', createdAt: expect.any(String), payload, reviewRequired: true });
  });
});
