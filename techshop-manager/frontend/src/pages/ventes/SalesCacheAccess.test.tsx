import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from '@/App';
import { useAuthStore } from '@/store/auth.store';
import { useUIStore } from '@/store/ui.store';
import type { AuthUser } from '@/types';
import type { SalesListResponse } from '@/lib/ventes.api';

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({ api: { get, post }, getErrorMessage: () => 'Accès refusé' }));
vi.mock('@/lib/offline', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/offline')>(), getPendingVentes: async () => [] }));

const foreignSale = {
  id: 'foreign-sale', numeroVente: 'FOREIGN-SECRET', createdAt: '2026-09-19T12:00:00Z',
  agent: { id: 'previous-staff', nom: 'Ancien agent' },
  client: { id: 'foreign-client', nom: 'Confidentiel', prenom: 'Client', telephone: '+243900000099' },
  site: { id: 'foreign-site', nom: 'Site étranger' }, lignes: [],
  montantBrut: 900, montantNet: 900, modePaiement: 'CASH' as const, statut: 'VALIDE' as const,
};
const localSale = {
  ...foreignSale, id: 'local-sale', numeroVente: 'LOCAL-ONLY', site: { id: 'local-site', nom: 'Goma' },
  client: { id: 'local-client', nom: 'Local', prenom: 'Client', telephone: '+243900000001' },
  agent: { id: 'cashier', nom: 'Caissier local' },
};

function history(sale = foreignSale): SalesListResponse {
  return { ventes: [sale], meta: { page: 1, limit: 50, total: 1, totalPages: 1 }, kpis: { totalCA: sale.montantNet, nbVentes: 1, panierMoyen: sale.montantNet } };
}

function deferred<Data>() {
  let resolve!: (data: Data) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<Data>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  void promise.catch(() => undefined);
  return { promise, resolve, reject };
}

const manager: AuthUser = { id: 'manager', name: 'Responsable', role: 'GERANT', siteId: 'foreign-site' };
const cashier: AuthUser = { id: 'cashier', name: 'Caissier', role: 'CAISSIER', siteId: 'local-site' };
const transitions: Array<{ name: string; previous: AuthUser; next: AuthUser; token: string }> = [
  { name: 'account and site change', previous: manager, next: cashier, token: 'next-token' },
  { name: 'site change without a new token', previous: { ...cashier, siteId: 'foreign-site' }, next: cashier, token: 'token' },
  { name: 'role change without a new token', previous: { ...manager, siteId: 'local-site' }, next: { ...manager, siteId: 'local-site', role: 'CAISSIER' }, token: 'token' },
  { name: 'new session for the same account', previous: cashier, next: cashier, token: 'new-session-token' },
];

let downloads: Blob[];

beforeEach(() => {
  useAuthStore.setState(useAuthStore.getInitialState(), true);
  useUIStore.setState({ selectedSiteId: 'foreign-site', isOnline: true });
  get.mockReset(); post.mockReset();
  downloads = [];
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL(blob: Blob) { downloads.push(blob); return 'blob:test-export'; }
    static revokeObjectURL() {}
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  get.mockImplementation(async (url: string) => {
    if (url === '/ventes') return { data: history() };
    if (url === '/ventes/foreign-sale') return { data: foreignSale };
    if (url.includes('notifications')) return { data: {} };
    throw new Error(`Unexpected GET ${url}`);
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mount(path: string, previous: AuthUser, seed = true) {
  useAuthStore.getState().setAuth(previous, 'token');
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 5 * 60_000, refetchOnWindowFocus: false } } });
  if (seed) {
    queryClient.setQueryData(['ventes', { periode: 'month', modePaiement: '', search: '', page: 1, sortOrder: 'desc' }], history());
    queryClient.setQueryData(['vente', 'foreign-sale'], foreignSale);
  }
  window.history.replaceState({}, '', path);
  render(<QueryClientProvider client={queryClient}><App /></QueryClientProvider>);
  return { queryClient, user: userEvent.setup() };
}

function switchSession(next: AuthUser, token: string) {
  act(() => useAuthStore.getState().setAuth(next, token));
}

function seedActive(queryClient: QueryClient, prefix: string, data: unknown) {
  const query = queryClient.getQueryCache().findAll({ queryKey: [prefix] }).find(entry => entry.getObserversCount() > 0);
  expect(query).toBeDefined();
  act(() => queryClient.setQueryData(query!.queryKey, data, { updatedAt: Date.now() }));
}

function expectNoForeignSale() {
  expect(screen.queryAllByText('FOREIGN-SECRET')).toHaveLength(0);
  expect(screen.queryByText('Site étranger')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Export CSV' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Imprimer' })).not.toBeInTheDocument();
  expect(downloads).toHaveLength(0);
}

async function exportedText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

describe('Online sales cache authorization with a retained QueryClient', () => {
  it.each(transitions)('does not display or export fresh prior history after $name', async ({ previous, next, token }) => {
    const { queryClient, user } = mount('/sales', previous);
    expect(await screen.findByText('FOREIGN-SECRET', {}, { timeout: 5000 })).toBeInTheDocument();
    seedActive(queryClient, 'ventes', history());
    const localResponse = deferred<{ data: SalesListResponse }>();
    get.mockImplementation((url: string) => url === '/ventes' ? localResponse.promise : Promise.resolve({ data: {} }));
    switchSession(next, token);
    expectNoForeignSale();
    await act(async () => { localResponse.resolve({ data: history(localSale) }); });
    expect(await screen.findByText('LOCAL-ONLY')).toBeInTheDocument();
    expect(screen.queryByText('FOREIGN-SECRET')).not.toBeInTheDocument();
    expect(get).toHaveBeenLastCalledWith('/ventes', { params: expect.objectContaining({ siteId: 'local-site' }) });
    await user.click(screen.getByRole('button', { name: 'Export CSV' }));
    expect(downloads).toHaveLength(1);
    expect(await exportedText(downloads[0])).toContain('LOCAL-ONLY');
    expect(await exportedText(downloads[0])).not.toContain('FOREIGN-SECRET');
  });

  it.each(transitions)('does not display or print a fresh prior detail after $name', async ({ previous, next, token }) => {
    const { queryClient } = mount('/sales/foreign-sale', previous);
    expect(await screen.findByRole('heading', { name: 'FOREIGN-SECRET' }, { timeout: 5000 })).toBeInTheDocument();
    seedActive(queryClient, 'vente', foreignSale);
    const forbiddenResponse = deferred<{ data: typeof foreignSale }>();
    get.mockImplementation((url: string) => url === '/ventes/foreign-sale' ? forbiddenResponse.promise : Promise.resolve({ data: {} }));
    switchSession(next, token);
    expectNoForeignSale();
    await act(async () => { forbiddenResponse.reject({ response: { status: 403 } }); });
    expect(await screen.findByText('Vente introuvable')).toBeInTheDocument();
    expectNoForeignSale();
  });

  it.each([
    ['history', 'before'], ['history', 'after'], ['detail', 'before'], ['detail', 'after'],
  ])('ignores a late foreign %s response settling %s the current response', async (page, order) => {
    const foreignResponse = deferred<{ data: SalesListResponse | typeof foreignSale }>();
    const currentResponse = deferred<{ data: SalesListResponse | typeof foreignSale }>();
    const endpoint = page === 'history' ? '/ventes' : '/ventes/foreign-sale';
    get.mockImplementation((url: string) => {
      if (url !== endpoint) return Promise.resolve({ data: {} });
      return useAuthStore.getState().user?.id === manager.id ? foreignResponse.promise : currentResponse.promise;
    });
    const { queryClient } = mount(page === 'history' ? '/sales' : '/sales/foreign-sale', manager, false);
    await waitFor(() => expect(get.mock.calls.some(([url]) => url === endpoint)).toBe(true));
    switchSession(cashier, 'next-token');
    expectNoForeignSale();
    const settleCurrent = async () => {
      if (page === 'history') {
        await act(async () => { currentResponse.resolve({ data: history(localSale) }); });
        expect(await screen.findByText('LOCAL-ONLY')).toBeInTheDocument();
      } else {
        await act(async () => { currentResponse.reject({ response: { status: 403 } }); });
        expect(await screen.findByText('Vente introuvable')).toBeInTheDocument();
      }
    };
    if (order === 'after') await settleCurrent();
    await act(async () => { foreignResponse.resolve({ data: page === 'history' ? history() : foreignSale }); });
    await waitFor(() => expect(queryClient.getQueryCache().findAll({ queryKey: [page === 'history' ? 'ventes' : 'vente'] }).some(query => query.state.status === 'success')).toBe(true));
    expect(screen.queryAllByText('FOREIGN-SECRET')).toHaveLength(0);
    if (order === 'before') {
      expectNoForeignSale();
      await settleCurrent();
    }
    expect(screen.queryAllByText('FOREIGN-SECRET')).toHaveLength(0);
  });

  it.each(['/sales', '/sales/foreign-sale'])('withholds cached sales and requests when the assigned site disappears at %s', async path => {
    const { queryClient } = mount(path, cashier);
    expect((await screen.findAllByText('FOREIGN-SECRET', {}, { timeout: 5000 })).length).toBeGreaterThan(0);
    seedActive(queryClient, path === '/sales' ? 'ventes' : 'vente', path === '/sales' ? history() : foreignSale);
    get.mockClear();
    switchSession({ ...cashier, siteId: null }, 'token');
    expectNoForeignSale();
    expect(get).not.toHaveBeenCalled();
  });

  it('keeps higher-role history unfiltered and changes partitions after logout/login', async () => {
    const { queryClient } = mount('/sales', manager, false);
    expect(await screen.findByText('FOREIGN-SECRET', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(get.mock.calls.find(([url]) => url === '/ventes')?.[1].params.siteId).toBeUndefined();
    seedActive(queryClient, 'ventes', history());
    get.mockImplementation(() => new Promise(() => undefined));
    act(() => {
      useAuthStore.getState().logout();
      useAuthStore.getState().setAuth(cashier, 'token');
    });
    expectNoForeignSale();
  });

  it('keeps same-session history placeholders and existing list/detail invalidation prefixes working', async () => {
    get.mockImplementation(async (url: string) => ({ data: url === '/ventes' ? history(localSale) : localSale }));
    const { queryClient, user } = mount('/sales', cashier, false);
    expect(await screen.findByText('LOCAL-ONLY', {}, { timeout: 5000 })).toBeInTheDocument();
    const filteredResponse = deferred<{ data: SalesListResponse }>();
    get.mockImplementation(() => filteredResponse.promise);
    await user.click(screen.getByRole('button', { name: 'Cette semaine' }));
    expect(screen.getByText('LOCAL-ONLY')).toBeInTheDocument();
    await act(async () => { filteredResponse.resolve({ data: history(localSale) }); });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Rafraîchir' })).toBeEnabled());
    get.mockClear();
    get.mockResolvedValue({ data: history(localSale) });
    await act(async () => { await queryClient.invalidateQueries({ queryKey: ['ventes'] }); });
    expect(get).toHaveBeenCalledTimes(1);
    get.mockResolvedValue({ data: localSale });
    await user.click(screen.getByText('LOCAL-ONLY'));
    expect(await screen.findByRole('heading', { name: 'LOCAL-ONLY' })).toBeInTheDocument();
    get.mockClear();
    await act(async () => { await queryClient.invalidateQueries({ queryKey: ['vente', 'local-sale'] }); });
    expect(get).toHaveBeenCalledWith('/ventes/local-sale');
  });
});
