import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { useAuthStore } from '@/store/auth.store';
import type { AuthUser } from '@/types';
import { useEarningsByLevel, useMemberProgress, useWallet, useWalletTransactions } from './useMlm';
import WalletPage from '@/pages/mlm/WalletPage';
import MlmCommissionsPage from '@/pages/mlm/MlmCommissionsPage';
import { member, builder } from '@/pages/mlm/task6.fixtures';
import { progressiveBuilder, progressiveCommission, progressiveWallet } from '@/pages/mlm/progressive.fixtures';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', () => ({ api: { get } }));

const actor: AuthUser = { id: 'staff', name: 'Synthetic staff', role: 'GERANT', siteId: 'site-a' };
const transitions = ['identity', 'role', 'site', 'logout/login'] as const;
let client: QueryClient;

function transition(change: typeof transitions[number]) {
  if (change === 'logout/login') useAuthStore.getState().logout();
  useAuthStore.getState().setAuth({ ...actor,
    ...(change === 'identity' ? { id: 'next-staff' } : {}),
    ...(change === 'role' ? { role: 'DIRECTEUR_REGIONAL' } as const : {}),
    ...(change === 'site' ? { siteId: 'site-b' } : {}),
  }, 'same-token');
}

function deferred() {
  let resolve!: (response: { data: any }) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<{ data: any }>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
}

const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}><MemoryRouter>{children}</MemoryRouter></QueryClientProvider>;

beforeEach(() => {
  useAuthStore.getState().logout();
  useAuthStore.getState().setAuth(actor, 'same-token');
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 300_000, refetchOnWindowFocus: false } } });
  get.mockReset();
});
afterEach(() => { cleanup(); client.clear(); });

describe.each([
  { name: 'progress', hook: () => useMemberProgress('member-1') },
  { name: 'wallet', hook: () => useWallet('member-1') },
  { name: 'transactions', hook: () => useWalletTransactions({ page: 1, limit: 20, memberId: 'member-1' }) },
  { name: 'earnings array', hook: () => useEarningsByLevel('member-1') },
])('staff $name private query', ({ hook }) => {
  it.each(transitions)('does not reuse a fresh five-minute cache after %s changes', async change => {
    const privateData = { secret: 'PRIVATE-PREVIOUS' };
    get.mockResolvedValue({ data: privateData });
    const { result } = renderHook(hook, { wrapper });
    await waitFor(() => expect(result.current.data).toEqual(privateData));
    const current = deferred();
    get.mockImplementation(() => current.promise);
    act(() => transition(change));
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    await act(async () => current.reject({ response: { status: 403 } }));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  it.each(transitions)('discards an in-flight response from before the %s transition', async change => {
    const previous = deferred();
    const current = deferred();
    get.mockImplementationOnce(() => previous.promise).mockImplementation(() => current.promise);
    const { result } = renderHook(hook, { wrapper });
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    act(() => transition(change));
    await act(async () => previous.resolve({ data: { secret: 'PRIVATE-LATE' } }));
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(client.getQueryCache().getAll().every(query => query.state.data === undefined)).toBe(true));
    await act(async () => current.resolve({ data: { secret: 'CURRENT-ONLY' } }));
    await waitFor(() => expect(result.current.data).toEqual({ secret: 'CURRENT-ONLY' }));
    expect(client.getQueryCache().getAll().some(query => JSON.stringify(query.state.data)?.includes('PRIVATE-LATE'))).toBe(false);
  });

  it('blocks manual refetch from obsolete closures and from missing-site, client and logged-out scopes', async () => {
    get.mockResolvedValue({ data: { secret: 'PRIVATE-PREVIOUS' } });
    const { result } = renderHook(hook, { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const oldRefetch = result.current.refetch;
    act(() => useAuthStore.getState().setAuth({ ...actor, role: 'AGENT', siteId: null }, 'same-token'));
    await act(async () => { await oldRefetch(); await result.current.refetch(); });
    expect(result.current.data).toBeUndefined();
    expect(get).toHaveBeenCalledTimes(1);
    act(() => useAuthStore.getState().setAuth({ ...actor, role: 'CLIENT' }, 'same-token'));
    await act(async () => { await result.current.refetch(); });
    expect(get).toHaveBeenCalledTimes(1);
    act(() => useAuthStore.getState().logout());
    await act(async () => { await result.current.refetch(); });
    expect(get).toHaveBeenCalledTimes(1);
  });
});

const privateWallet = { ...progressiveWallet.wallet, id: 'wallet-1', membreId: member.id, membre: member, financialSummary: progressiveWallet.financialSummary, reinvestLots: [], progressiveCommissions: [{ ...progressiveBuilder, levelName: 'PRIVATE-GENERATION' }] };

function walletResponse(url: string) {
  if (url === '/mlm/members') return { data: { membres: [member], meta: { totalPages: 1 } } };
  if (url === '/mlm/stats') return { data: { soldeDisponibleTotalUSD: '9876.54', totalCommissionsVerseesUSD: '8765.43' } };
  if (url === '/mlm/wallet/transactions') return { data: { transactions: [{ id: 'private-tx', montant: '12.00', type: 'COMMISSION', description: 'PRIVATE-TRANSACTION', createdAt: '2026-09-21' }], meta: { totalPages: 1 } } };
  if (url === '/mlm/wallet/member-1') return { data: privateWallet };
  throw new Error(`Unexpected request: ${url}`);
}

describe('staff WalletPage private consumers', () => {
  it.each(transitions)('hides member, transaction, network and selected-wallet caches after %s', async change => {
    get.mockImplementation(async (url: string) => walletResponse(url));
    render(<WalletPage />, { wrapper });
    await screen.findByRole('option', { name: /Serge Mutombo/ });
    fireEvent.change(screen.getByLabelText('Filtrer les transactions par membre'), { target: { value: member.id } });
    await screen.findByText(/PRIVATE-GENERATION/);
    expect(screen.getByText('PRIVATE-TRANSACTION')).toBeInTheDocument();
    get.mockImplementation(() => new Promise(() => {}));
    act(() => transition(change));
    expect(screen.queryByText(/PRIVATE-GENERATION/)).not.toBeInTheDocument();
    expect(screen.queryByText('PRIVATE-TRANSACTION')).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Serge Mutombo/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/9.?876,54 USD/)).not.toBeInTheDocument();
  });

  it.each(transitions)('does not reuse the all-wallets batch after %s', async change => {
    get.mockImplementation(async (url: string) => walletResponse(url));
    render(<WalletPage />, { wrapper });
    await screen.findByRole('option', { name: /Serge Mutombo/ });
    fireEvent.click(screen.getByRole('button', { name: /Soldes membres/ }));
    await screen.findByRole('link', { name: /Serge Mutombo/ });
    get.mockImplementation((url: string) => url === '/mlm/members' ? Promise.resolve(walletResponse(url)) : new Promise(() => {}));
    act(() => transition(change));
    await waitFor(() => expect(get.mock.calls.filter(([url]) => url === '/mlm/members')).toHaveLength(2));
    expect(screen.queryByRole('link', { name: /Serge Mutombo/ })).not.toBeInTheDocument();
  });

  it('discards all-wallets batch results after logout, even when requests resolve late', async () => {
    const previous = deferred();
    get.mockImplementation((url: string) => url === '/mlm/wallet/member-1' ? previous.promise : Promise.resolve(walletResponse(url)));
    render(<WalletPage />, { wrapper });
    await screen.findByRole('option', { name: /Serge Mutombo/ });
    fireEvent.click(screen.getByRole('button', { name: /Soldes membres/ }));
    await waitFor(() => expect(get.mock.calls.some(([url]) => url === '/mlm/wallet/member-1')).toBe(true));
    act(() => useAuthStore.getState().logout());
    await act(async () => previous.resolve({ data: privateWallet }));
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(screen.queryByRole('link', { name: /Serge Mutombo/ })).not.toBeInTheDocument();
    expect(client.getQueryCache().getAll().some(query => JSON.stringify(query.state.data)?.includes('PRIVATE-GENERATION'))).toBe(false);
    get.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Actualiser' }));
    expect(get).not.toHaveBeenCalled();
  });
});

describe('staff commissions private query', () => {
  it.each(transitions)('hides a fresh commission list after %s', async change => {
    get.mockImplementation(async (url: string) => ({ data: url === '/mlm/config' ? [builder] : { commissions: [{ ...progressiveCommission, filleul: { ...member, client: { ...member.client, prenom: 'PRIVATE-COMMISSION' } } }], summary: {}, meta: { totalPages: 1 } } }));
    render(<MlmCommissionsPage />, { wrapper });
    await screen.findByText(/PRIVATE-COMMISSION/);
    get.mockImplementation(() => new Promise(() => {}));
    act(() => transition(change));
    expect(screen.queryByText(/PRIVATE-COMMISSION/)).not.toBeInTheDocument();
  });

  it('does not load commissions for an agent even when mounted without its route guard', async () => {
    useAuthStore.getState().setAuth({ ...actor, role: 'AGENT' }, 'same-token');
    get.mockResolvedValue({ data: [] });
    render(<MlmCommissionsPage />, { wrapper });
    await act(async () => {});
    expect(get.mock.calls.some(([url]) => url === '/mlm/commissions')).toBe(false);
  });
});
