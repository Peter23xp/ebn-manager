import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/store/auth.store';
import { useSalesDetailReport } from './useSalesDetailReport';
import { useStocksReport } from './useStocksReport';
import { useExportJob } from './useExportJob';
import { useReportsDashboard } from './useReportsDashboard';

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({ api: { get, post } }));
const actor = { id: 'director', name: 'Director', role: 'DIRECTEUR_REGIONAL' as const, siteId: 'site-1' };
let client: QueryClient;

beforeEach(() => {
  useAuthStore.setState(useAuthStore.getInitialState(), true);
  useAuthStore.getState().setAuth(actor, 'token');
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  get.mockReset(); post.mockReset();
});
afterEach(() => { cleanup(); client.clear(); vi.useRealTimers(); });
const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;

describe.each([
  { name: 'sales', hook: () => useSalesDetailReport({}) },
  { name: 'stocks', hook: () => useStocksReport({}) },
  { name: 'dashboard', hook: () => useReportsDashboard({ dateRange: { from: new Date('2026-09-01'), to: new Date('2026-09-20') } }) },
])('$name private queries', ({ hook }) => {
  it('withholds cached data across identity, role and session changes', async () => {
    get.mockResolvedValue({ data: { secret: 'previous-session' } });
    const { result } = renderHook(() => hook(), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual({ secret: 'previous-session' }));
    get.mockImplementation(() => new Promise(() => {}));
    act(() => useAuthStore.getState().setAuth({ ...actor, id: 'next' }, 'new-token'));
    expect(result.current.data).toBeUndefined();
    act(() => useAuthStore.getState().setAuth({ ...actor, role: 'CAISSIER' }, 'new-token'));
    const calls = get.mock.calls.length;
    await act(async () => { await result.current.refetch(); });
    expect(get).toHaveBeenCalledTimes(calls);
    expect(result.current.data).toBeUndefined();
  });

  it.each(['site', 'role', 'reused-token'] as const)('partitions a changed %s even for the same user', async change => {
    get.mockResolvedValue({ data: { secret: 'previous-session' } });
    const { result } = renderHook(() => hook(), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual({ secret: 'previous-session' }));
    get.mockImplementation(() => new Promise(() => {}));
    act(() => {
      if (change === 'reused-token') useAuthStore.getState().logout();
      useAuthStore.getState().setAuth({ ...actor, ...(change === 'site' ? { siteId: 'site-2' } : {}), ...(change === 'role' ? { role: 'SUPER_ADMIN' } : {}) }, 'token');
    });
    expect(result.current.data).toBeUndefined();
    expect(get).toHaveBeenCalledTimes(2);
  });
});

describe('export lifecycle', () => {
  it('ignores a creation response after reset', async () => {
    let resolve!: (value: { data: { jobId: string } }) => void;
    post.mockImplementation(() => new Promise(done => { resolve = done; }));
    const { result } = renderHook(useExportJob, { wrapper });
    act(() => { void result.current.startJob({ type: 'VENTES', format: 'CSV' }); });
    await waitFor(() => expect(post).toHaveBeenCalledOnce());
    act(() => result.current.reset());
    await act(async () => resolve({ data: { jobId: 'obsolete-job' } }));
    expect(result.current.jobId).toBeNull();
    expect(result.current.startError).toBeNull();
    expect(get).not.toHaveBeenCalled();
  });

  it('clears a failed mutation on reset', async () => {
    post.mockRejectedValue(new Error('Create failed'));
    const { result } = renderHook(useExportJob, { wrapper });
    act(() => { void result.current.startJob({ type: 'VENTES', format: 'CSV' }); });
    await waitFor(() => expect(result.current.startError).not.toBeNull());
    act(() => result.current.reset());
    expect(result.current.startError).toBeNull();
  });

  it('clears the current job on logout and does not reuse it on login', async () => {
    post.mockResolvedValue({ data: { jobId: 'old-job' } });
    get.mockResolvedValue({ data: { jobId: 'old-job', statut: 'READY', fileName: 'secret.csv' } });
    const { result } = renderHook(useExportJob, { wrapper });
    act(() => { void result.current.startJob({ type: 'VENTES', format: 'CSV' }); });
    await waitFor(() => expect(result.current.status?.statut).toBe('READY'));
    act(() => useAuthStore.getState().logout());
    expect(result.current.status).toBeNull();
    expect(result.current.jobId).toBeNull();
    act(() => useAuthStore.getState().setAuth(actor, 'token'));
    expect(result.current.jobId).toBeNull();
  });

  it('stops polling after a network error instead of silently retrying', async () => {
    vi.useFakeTimers();
    post.mockResolvedValue({ data: { jobId: 'failed-job' } });
    get.mockRejectedValue(new Error('Suivi indisponible'));
    const { result } = renderHook(useExportJob, { wrapper });
    await act(async () => { await result.current.startJob({ type: 'VENTES', format: 'CSV' }); });
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(result.current.pollingError).toBeInstanceOf(Error);
    const requests = get.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(get).toHaveBeenCalledTimes(requests);
    expect(result.current.isPolling).toBe(false);
  });

  it('bounds pending jobs and reports the timeout', async () => {
    vi.useFakeTimers();
    post.mockResolvedValue({ data: { jobId: 'pending-job' } });
    get.mockResolvedValue({ data: { jobId: 'pending-job', statut: 'PENDING' } });
    const { result } = renderHook(useExportJob, { wrapper });
    await act(async () => { await result.current.startJob({ type: 'VENTES', format: 'CSV' }); });
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(result.current.isPolling).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
    expect(result.current.pollingError?.message).toMatch(/deux minutes/);
    expect(result.current.isPolling).toBe(false);
    const requests = get.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(get).toHaveBeenCalledTimes(requests);
    act(() => result.current.reset());
    expect(result.current.pollingError).toBeNull();
  });
});
