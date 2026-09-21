import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import axios, { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { useOnlineSync } from './useOnlineSync';
import { api } from '@/lib/api';
import { ventesApi } from '@/lib/ventes.api';
import { useAuthStore } from '@/store/auth.store';
import { useUIStore } from '@/store/ui.store';
import { useCartStore } from '@/store/cart.store';
import POSPage from '@/pages/ventes/POSPage';
import type { PendingQueueRecord, PendingVente } from '@/lib/offline-sales-sync';
import type { AuthUser } from '@/types';

const { records, database, notification } = vi.hoisted(() => {
  const records = new Map<string, PendingQueueRecord>();
  const database = {
    getAll: vi.fn(async () => structuredClone([...records.values()])),
    put: vi.fn(async (_store: string, record: PendingQueueRecord) => { records.set(record.localId, structuredClone(record)); }),
    delete: vi.fn(async (_store: string, localId: string) => { records.delete(localId); }),
    transaction: vi.fn(() => ({
      store: {
        get: async (localId: string) => structuredClone(records.get(localId)),
        put: async (record: PendingQueueRecord) => { records.set(record.localId, structuredClone(record)); },
      },
      done: Promise.resolve(),
    })),
  };
  const notification = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() });
  return { records, database, notification };
});
vi.mock('idb', () => ({ openDB: async () => database }));
vi.mock('react-hot-toast', () => ({ default: notification }));

const cashier: AuthUser = { id: 'cashier', name: 'Caisse', role: 'CAISSIER', siteId: 'site-a' };
const owned: PendingVente = {
  localId: 'owned', ownerUserId: 'cashier', ownerSiteId: 'site-a', createdAt: '2026-09-19T10:00:00.000Z',
  payload: { siteId: 'site-a', lignes: [{ produitId: 'product-a', quantite: 1, prixUnitaire: 10 }], modePaiement: 'CASH' },
};
const adapter = vi.fn<(config: InternalAxiosRequestConfig) => Promise<AxiosResponse>>();
const saleRequests = () => adapter.mock.calls.filter(([config]) => config.method === 'post' && config.url === '/ventes');

function response(config: InternalAxiosRequestConfig, data: unknown = { vente: { id: 'server-sale', numeroVente: 'V-1', montantNet: 10 } }): AxiosResponse {
  return { data, config, status: 200, statusText: 'OK', headers: {} };
}

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
}

async function flush() {
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
}

beforeEach(() => {
  vi.clearAllMocks();
  records.clear();
  database.getAll.mockImplementation(async () => structuredClone([...records.values()]));
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  useAuthStore.getState().setAuth(cashier, 'cashier-token');
  useAuthStore.setState({ isOfflineMode: false });
  useUIStore.setState({ selectedSiteId: null, isOnline: true, pendingSyncCount: 0 });
  useCartStore.getState().clearCart();
  api.defaults.adapter = adapter;
  adapter.mockImplementation(async config => {
    if (config.method === 'post') return response(config);
    if (config.url === '/produits/search') return response(config, { produits: [] });
    if (config.url === '/produits/categories') return response(config, { categories: [] });
    if (config.url === '/sites') return response(config, { data: [
      { id: 'site-a', nom: 'Site A', ville: 'A', actif: true }, { id: 'site-b', nom: 'Site B', ville: 'B', actif: true },
    ] });
    throw new Error(`Unexpected request ${config.url}`);
  });
});

afterEach(async () => { cleanup(); await flush(); });

describe('useOnlineSync with the real processor, idb boundary and Axios interceptor', () => {
  it('drains only owned sales, retaining legacy/foreign data and warning without render loops', async () => {
    const legacy = { localId: 'legacy', ...owned.payload };
    const foreign = { ...owned, localId: 'foreign', ownerUserId: 'other' };
    [legacy, foreign, owned].forEach(record => records.set(record.localId, record));
    const version = useAuthStore.getState().sessionVersion;
    const hook = renderHook(() => useOnlineSync());
    await waitFor(() => expect(useUIStore.getState().pendingSyncCount).toBe(2));
    expect([...records.values()]).toEqual([legacy, foreign]);
    expect(saleRequests()).toHaveLength(1);
    expect(JSON.parse(saleRequests()[0][0].data)).toEqual(owned.payload);
    expect(saleRequests()[0][0]).toMatchObject({ _sessionVersion: version });
    expect(notification).toHaveBeenCalledWith("Des ventes hors ligne nécessitent une vérification par un responsable ; elles n'ont pas été envoyées.", expect.any(Object));
    hook.rerender();
    act(() => useUIStore.getState().setSidebarOpen(false));
    act(() => window.dispatchEvent(new Event('online')));
    await flush();
    expect(notification).toHaveBeenCalledTimes(1);
    expect(saleRequests()).toHaveLength(1);
  });

  it('reacts to restored caisse permissions without granting an agent the queue', async () => {
    records.set(owned.localId, owned);
    useAuthStore.getState().setAuth({ ...cashier, role: 'AGENT' }, 'cashier-token');
    renderHook(() => useOnlineSync());
    await flush();
    expect(saleRequests()).toHaveLength(0);
    act(() => useAuthStore.getState().setAuth(cashier, 'cashier-token'));
    await waitFor(() => expect(records.size).toBe(0));
    expect(saleRequests()).toHaveLength(1);
  });

  it('counts offline records, then reconnects without parallel sends', async () => {
    records.set(owned.localId, owned);
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    const pending = deferred<AxiosResponse>();
    adapter.mockImplementation(config => config.method === 'post' ? pending.promise : Promise.resolve(response(config)));
    renderHook(() => useOnlineSync());
    await waitFor(() => expect(useUIStore.getState().pendingSyncCount).toBe(1));
    expect(saleRequests()).toHaveLength(0);
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    act(() => { window.dispatchEvent(new Event('online')); window.dispatchEvent(new Event('online')); });
    await waitFor(() => expect(saleRequests()).toHaveLength(1));
    act(() => window.dispatchEvent(new Event('online')));
    await flush();
    expect(saleRequests()).toHaveLength(1);
    await act(async () => pending.resolve(response(saleRequests()[0][0])));
    await waitFor(() => expect(useUIStore.getState().pendingSyncCount).toBe(0));
  });

  it('keeps the lock across unmount/remount while a sale is in flight', async () => {
    records.set(owned.localId, owned);
    const pending = deferred<AxiosResponse>();
    adapter.mockImplementation(() => pending.promise);
    const first = renderHook(() => useOnlineSync());
    await waitFor(() => expect(saleRequests()).toHaveLength(1));
    first.unmount();
    renderHook(() => useOnlineSync());
    await flush();
    const sentBeforeSuccess = saleRequests().length;
    await act(async () => pending.resolve(response(saleRequests()[0][0])));
    await flush();
    expect(sentBeforeSuccess).toBe(1);
    expect(database.delete).toHaveBeenCalledTimes(1);
  });

  it('does not lose an account-change trigger while an older drain is waiting', async () => {
    records.set(owned.localId, owned);
    records.set('other-sale', { ...owned, localId: 'other-sale', ownerUserId: 'other' });
    const pending = deferred<AxiosResponse>();
    adapter.mockImplementationOnce(() => pending.promise);
    renderHook(() => useOnlineSync());
    await waitFor(() => expect(saleRequests()).toHaveLength(1));
    act(() => useAuthStore.getState().setAuth({ ...cashier, id: 'other' }, 'other-token'));
    await flush();
    expect(saleRequests()).toHaveLength(1);
    await act(async () => pending.resolve(response(saleRequests()[0][0])));
    await waitFor(() => expect(records.has('other-sale')).toBe(false));
    expect(records.has(owned.localId)).toBe(false);
    expect(saleRequests()).toHaveLength(2);
    expect(saleRequests()[1][0].headers.Authorization).toBe('Bearer other-token');
  });

  it('does not send after logout while the queue load is delayed', async () => {
    records.set(owned.localId, owned);
    const loaded = deferred<PendingQueueRecord[]>();
    database.getAll.mockImplementation(() => loaded.promise);
    renderHook(() => useOnlineSync());
    await waitFor(() => expect(database.getAll).toHaveBeenCalled());
    act(() => useAuthStore.getState().logout());
    await act(async () => loaded.resolve([owned]));
    await flush();
    expect(saleRequests()).toHaveLength(0);
    expect(records.get(owned.localId)).toEqual(owned);
  });

  it('retains a failed sale without retrying on unrelated state updates', async () => {
    records.set(owned.localId, owned);
    adapter.mockRejectedValue(new AxiosError('network', 'ERR_NETWORK', undefined, {}));
    const hook = renderHook(() => useOnlineSync());
    await waitFor(() => expect(saleRequests()).toHaveLength(1));
    await flush();
    hook.rerender();
    act(() => useUIStore.getState().setSidebarOpen(true));
    await flush();
    expect(saleRequests()).toHaveLength(1);
    expect(records.get(owned.localId)).toEqual({ ...owned, reviewRequired: true });
  });

  it('does not retry an ambiguous sale when a cashier changes an irrelevant global site selection', async () => {
    records.set(owned.localId, owned);
    adapter.mockRejectedValue(new AxiosError('network', 'ERR_NETWORK', undefined, {}));
    renderHook(() => useOnlineSync());
    await waitFor(() => expect(saleRequests()).toHaveLength(1));
    await flush();
    act(() => useUIStore.getState().setSelectedSiteId('site-b'));
    await flush();
    expect(saleRequests()).toHaveLength(1);
    expect(records.get(owned.localId)).toEqual({ ...owned, reviewRequired: true });
  });

  it.each(['logout', 'relogin', 'account', 'site', 'role'] as const)('acknowledges late success after %s without replay on owner return, reconnect or remount', async transition => {
    const untouched: PendingQueueRecord[] = [
      { localId: 'legacy', ...owned.payload },
      { ...owned, localId: 'foreign', ownerUserId: 'foreign-user' },
    ];
    untouched.forEach(record => records.set(record.localId, record));
    records.set(owned.localId, owned);
    const pending = deferred<AxiosResponse>();
    adapter.mockImplementationOnce(() => pending.promise);
    const hook = renderHook(() => useOnlineSync());
    await waitFor(() => expect(saleRequests()).toHaveLength(1));
    act(() => {
      if (transition === 'logout') useAuthStore.getState().logout();
      if (transition === 'relogin') { useAuthStore.getState().logout(); useAuthStore.getState().setAuth(cashier, 'new-token'); }
      if (transition === 'account') useAuthStore.getState().setAuth({ ...cashier, id: 'other' }, 'other-token');
      if (transition === 'site') useAuthStore.getState().setAuth({ ...cashier, siteId: 'site-b' }, 'cashier-token');
      if (transition === 'role') useAuthStore.getState().setAuth({ ...cashier, role: 'AGENT' }, 'cashier-token');
    });
    await flush();
    await act(async () => pending.resolve(response(saleRequests()[0][0])));
    await flush();
    const afterSuccess = structuredClone([...records.values()]);
    act(() => useAuthStore.getState().setAuth(cashier, 'restored-token'));
    await flush();
    act(() => window.dispatchEvent(new Event('online')));
    await flush();
    hook.unmount();
    renderHook(() => useOnlineSync());
    await flush();
    expect(saleRequests()).toHaveLength(1);
    expect(afterSuccess).toEqual(untouched);
    expect([...records.values()]).toEqual(untouched);
    expect(database.delete).toHaveBeenCalledExactlyOnceWith('pending-ventes', 'owned');
    expect(useUIStore.getState().pendingSyncCount).toBe(2);
  });

  it('acknowledges success after logout and unmount without old-context UI updates', async () => {
    const legacy = { localId: 'legacy', ...owned.payload };
    records.set(legacy.localId, legacy);
    records.set(owned.localId, owned);
    const pending = deferred<AxiosResponse>();
    adapter.mockImplementationOnce(() => pending.promise);
    const hook = renderHook(() => useOnlineSync());
    await waitFor(() => expect(saleRequests()).toHaveLength(1));
    act(() => useAuthStore.getState().logout());
    hook.unmount();
    useUIStore.getState().setPendingSyncCount(99);
    await act(async () => pending.resolve(response(saleRequests()[0][0])));
    await flush();
    expect([...records.values()]).toEqual([legacy]);
    expect(saleRequests()).toHaveLength(1);
    expect(useUIStore.getState().pendingSyncCount).toBe(99);
    expect(notification).not.toHaveBeenCalled();
    expect(notification.success).not.toHaveBeenCalled();
    expect(notification.error).not.toHaveBeenCalled();
  });

  it.each(['unchanged', 'relogin', 'account', 'site', 'role'] as const)('holds an uncertain attempt through %s and later owner/site/reconnect/remount triggers', async transition => {
    const untouched: PendingQueueRecord[] = [
      { localId: 'legacy', ...owned.payload },
      { ...owned, localId: 'foreign', ownerUserId: 'foreign-user' },
    ];
    untouched.forEach(record => records.set(record.localId, record));
    records.set(owned.localId, owned);
    const pending = deferred<AxiosResponse>();
    adapter.mockImplementationOnce(() => pending.promise);
    const hook = renderHook(() => useOnlineSync());
    await waitFor(() => expect(saleRequests()).toHaveLength(1));
    act(() => {
      if (transition === 'relogin') { useAuthStore.getState().logout(); useAuthStore.getState().setAuth(cashier, 'new-token'); }
      if (transition === 'account') useAuthStore.getState().setAuth({ ...cashier, id: 'other' }, 'other-token');
      if (transition === 'site') useAuthStore.getState().setAuth({ ...cashier, siteId: 'site-b' }, 'cashier-token');
      if (transition === 'role') useAuthStore.getState().setAuth({ ...cashier, role: 'AGENT' }, 'cashier-token');
    });
    await flush();
    await act(async () => pending.reject(new AxiosError('network', 'ERR_NETWORK', saleRequests()[0][0], {})));
    await flush();
    act(() => useAuthStore.getState().setAuth({ ...cashier, siteId: 'site-b' }, 'changed-token'));
    await flush();
    act(() => useAuthStore.getState().setAuth(cashier, 'restored-token'));
    await flush();
    act(() => window.dispatchEvent(new Event('online')));
    await flush();
    hook.unmount();
    renderHook(() => useOnlineSync());
    await flush();
    expect(saleRequests()).toHaveLength(1);
    expect([...records.values()]).toEqual([...untouched, { ...owned, reviewRequired: true }]);
    expect(database.delete).not.toHaveBeenCalled();
    expect(JSON.parse(saleRequests()[0][0].data)).toEqual(owned.payload);
    expect(notification).toHaveBeenCalledWith('Le résultat de certaines ventes doit être vérifié par un responsable ; elles ne seront pas renvoyées automatiquement.', expect.any(Object));
  });

  it('retains a late known denial for later reconnect without immediate same-owner replay', async () => {
    records.set(owned.localId, owned);
    const pending = deferred<AxiosResponse>();
    adapter.mockImplementationOnce(() => pending.promise);
    renderHook(() => useOnlineSync());
    await waitFor(() => expect(saleRequests()).toHaveLength(1));
    act(() => { useAuthStore.getState().logout(); useAuthStore.getState().setAuth(cashier, 'new-token'); });
    await flush();
    await act(async () => {
      pending.reject(new AxiosError('forbidden', 'ERR_BAD_REQUEST', saleRequests()[0][0], {}, { ...response(saleRequests()[0][0]), status: 403 }));
    });
    await flush();
    expect(saleRequests()).toHaveLength(1);
    expect(records.get(owned.localId)).toEqual(owned);
    expect(database.delete).not.toHaveBeenCalled();
    act(() => window.dispatchEvent(new Event('online')));
    await waitFor(() => expect(records.has(owned.localId)).toBe(false));
    expect(saleRequests()).toHaveLength(2);
  });
});

function mountPOS(sync = false) {
  const cart = useCartStore.getState();
  cart.addItem({ id: 'product-a', sku: 'P-1', nom: 'Produit', categorie: 'TEST', prixVente: 10, stockDisponible: 10, seuilAlerte: 1, statut: 'OK' });
  cart.setClient({ id: 'client-a', prenom: 'Client', nom: 'A', telephone: '243900000001' });
  cart.setModePaiement('CASH');
  cart.setMontantRecu(10);
  function Sync() { useOnlineSync(); return null; }
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><MemoryRouter><POSPage />{sync && <Sync />}</MemoryRouter></QueryClientProvider>);
}

function submit() { fireEvent.click(screen.getAllByRole('button', { name: /Valider —/ })[0]); }

describe('POS submission and session tagging', () => {
  it('uses the existing interceptor to cancel a sale tagged before an account switch', async () => {
    const version = useAuthStore.getState().sessionVersion;
    const pending = ventesApi.create(owned.payload, version);
    useAuthStore.getState().setAuth({ ...cashier, id: 'other' }, 'other-token');
    await expect(pending).rejects.toSatisfy(axios.isCancel);
    expect(saleRequests()).toHaveLength(0);
  });

  it.each(['agent', 'logout', 'site'] as const)('checks current permission on a stale submit handler after %s', async transition => {
    mountPOS();
    const button = screen.getAllByRole('button', { name: /Valider —/ })[0];
    act(() => {
      if (transition === 'agent') useAuthStore.getState().setAuth({ ...cashier, role: 'AGENT' }, 'cashier-token');
      if (transition === 'logout') useAuthStore.getState().logout();
      if (transition === 'site') useAuthStore.getState().setAuth({ ...cashier, siteId: 'site-b' }, 'cashier-token');
      fireEvent.click(button);
    });
    await flush();
    expect(saleRequests()).toHaveLength(0);
    expect(database.put).not.toHaveBeenCalled();
  });

  it.each(['403', 'cancel', 'generic'] as const)('never falls back to the offline queue for %s', async kind => {
    const normalAdapter = adapter.getMockImplementation()!;
    adapter.mockImplementation(async config => {
      if (config.method !== 'post') return normalAdapter(config);
      if (kind === '403') throw new AxiosError('forbidden', 'ERR_NETWORK', config, {}, { ...response(config), status: 403 });
      if (kind === 'cancel') throw new axios.CanceledError('Session terminée');
      throw new Error('Local failure');
    });
    mountPOS();
    submit();
    await waitFor(() => expect(useCartStore.getState().isSubmitting).toBe(false));
    expect(saleRequests()).toHaveLength(1);
    expect(database.put).not.toHaveBeenCalled();
    expect(useCartStore.getState().items).toHaveLength(1);
  });

  it('holds a POS network failure for review rather than replaying its uncertain POST', async () => {
    const normalAdapter = adapter.getMockImplementation()!;
    adapter.mockImplementation(async config => {
      if (config.method === 'post') throw new AxiosError('network', 'ERR_NETWORK', config, {});
      return normalAdapter(config);
    });
    mountPOS();
    submit();
    await waitFor(() => expect(records.size).toBe(1));
    expect([...records.values()][0]).toMatchObject({ ownerUserId: 'cashier', ownerSiteId: 'site-a', payload: { ...owned.payload, clientId: 'client-a', montantRecu: 10 }, reviewRequired: true });
    expect(useCartStore.getState().items).toEqual([]);
    renderHook(() => useOnlineSync());
    await flush();
    act(() => window.dispatchEvent(new Event('online')));
    await flush();
    expect(saleRequests()).toHaveLength(1);
    expect(notification.success).not.toHaveBeenCalled();
    expect(notification).toHaveBeenCalledWith('Le résultat de certaines ventes doit être vérifié par un responsable ; elles ne seront pas renvoyées automatiquement.', expect.any(Object));
  });

  it('still automatically syncs an offline POS sale that was never dispatched', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    mountPOS();
    submit();
    await waitFor(() => expect(records.size).toBe(1));
    expect([...records.values()][0].reviewRequired).toBeUndefined();
    expect(saleRequests()).toHaveLength(0);
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    renderHook(() => useOnlineSync());
    await waitFor(() => expect(records.size).toBe(0));
    expect(saleRequests()).toHaveLength(1);
  });

  it.each(['logout', 'account', 'relogin', 'role', 'site'] as const)('does not queue a network result belonging to an old %s context', async transition => {
    const pending = deferred<AxiosResponse>();
    const normalAdapter = adapter.getMockImplementation()!;
    adapter.mockImplementation(config => config.method === 'post' ? pending.promise : normalAdapter(config));
    mountPOS();
    submit();
    await waitFor(() => expect(saleRequests()).toHaveLength(1));
    act(() => {
      if (transition === 'logout') useAuthStore.getState().logout();
      if (transition === 'account') useAuthStore.getState().setAuth({ ...cashier, id: 'other' }, 'other-token');
      if (transition === 'relogin') { useAuthStore.getState().logout(); useAuthStore.getState().setAuth(cashier, 'cashier-token'); }
      if (transition === 'role') useAuthStore.getState().setAuth({ ...cashier, role: 'AGENT' }, 'cashier-token');
      if (transition === 'site') useAuthStore.getState().setAuth({ ...cashier, siteId: 'site-b' }, 'cashier-token');
    });
    await act(async () => pending.reject(new AxiosError('network', 'ERR_NETWORK', saleRequests()[0][0], {})));
    expect(database.put).not.toHaveBeenCalled();
    expect(useCartStore.getState().items).toHaveLength(1);
  });

  it('does not reset the new account’s cart or show an old sale after a late success', async () => {
    const pending = deferred<AxiosResponse>();
    const normalAdapter = adapter.getMockImplementation()!;
    adapter.mockImplementation(config => config.method === 'post' ? pending.promise : normalAdapter(config));
    mountPOS();
    submit();
    await waitFor(() => expect(saleRequests()).toHaveLength(1));
    act(() => useAuthStore.getState().setAuth({ ...cashier, id: 'other' }, 'other-token'));
    await act(async () => pending.resolve(response(saleRequests()[0][0])));
    expect(useCartStore.getState().items).toHaveLength(1);
    expect(screen.queryByText('Vente enregistrée !')).not.toBeInTheDocument();
    expect(database.put).not.toHaveBeenCalled();
  });

  it('releases an old POS submission on account change without unlocking a newer in-flight sale', async () => {
    const oldResponse = deferred<AxiosResponse>();
    const newResponse = deferred<AxiosResponse>();
    const normalAdapter = adapter.getMockImplementation()!;
    adapter.mockImplementation(config => {
      if (config.method !== 'post') return normalAdapter(config);
      return config.headers.Authorization === 'Bearer cashier-token' ? oldResponse.promise : newResponse.promise;
    });
    mountPOS();
    submit();
    await waitFor(() => expect(saleRequests()).toHaveLength(1));
    act(() => useAuthStore.getState().setAuth({ ...cashier, id: 'other' }, 'other-token'));
    const releasedForNewAccount = !useCartStore.getState().isSubmitting;
    const newSubmit = screen.queryAllByRole('button', { name: /Valider —/ })[0];
    if (newSubmit) fireEvent.click(newSubmit);
    await flush();
    const newRequestCount = saleRequests().length;
    await act(async () => oldResponse.resolve(response(saleRequests()[0][0])));
    const newerSaleRemainsLocked = useCartStore.getState().isSubmitting;
    await act(async () => newResponse.resolve(response(saleRequests()[1]?.[0] ?? saleRequests()[0][0])));
    expect(releasedForNewAccount).toBe(true);
    expect(newRequestCount).toBe(2);
    expect(newerSaleRemainsLocked).toBe(true);
    expect(useCartStore.getState().isSubmitting).toBe(false);
  });

  it('does not apply a late sale response to the cart after leaving the POS', async () => {
    const pending = deferred<AxiosResponse>();
    const normalAdapter = adapter.getMockImplementation()!;
    adapter.mockImplementation(config => config.method === 'post' ? pending.promise : normalAdapter(config));
    const page = mountPOS();
    submit();
    await waitFor(() => expect(saleRequests()).toHaveLength(1));
    page.unmount();
    await act(async () => pending.resolve(response(saleRequests()[0][0])));
    expect(useCartStore.getState().items).toHaveLength(1);
    expect(useCartStore.getState().isSubmitting).toBe(false);
  });

  it('shares the real admin site selection with the sync session instead of a private POS selection', async () => {
    useAuthStore.getState().setAuth({ id: 'admin', name: 'Admin', role: 'SUPER_ADMIN' }, 'admin-token');
    useUIStore.setState({ selectedSiteId: 'site-a' });
    records.set('admin-sale', { ...owned, localId: 'admin-sale', ownerUserId: 'admin', ownerSiteId: 'site-b', payload: { ...owned.payload, siteId: 'site-b' } });
    mountPOS(true);
    await screen.findByRole('option', { name: 'Site B' });
    await flush();
    expect(saleRequests()).toHaveLength(0);
    fireEvent.change(screen.getByRole('option', { name: 'Site B' }).closest('select')!, { target: { value: 'site-b' } });
    expect(useUIStore.getState().selectedSiteId).toBe('site-b');
    await waitFor(() => expect(records.size).toBe(0));
    expect(JSON.parse(saleRequests()[0][0].data).siteId).toBe('site-b');
  });
});
