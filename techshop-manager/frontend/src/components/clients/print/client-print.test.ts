import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadClientPrintRows } from './client-print';
import type { ClientQueryParams, ClientRow } from '@/lib/clients.api';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', () => ({ api: { get } }));

const client: ClientRow = { id: 'client', prenom: 'Aline', nom: 'Test', telephone: '+243900000001', codeParrain: null, statut: 'ACTIF', site: { id: 'local', nom: 'Goma' }, createdAt: '2026-09-21T10:00:00Z' };
const options = () => ({ filters: { search: ' Aline ', siteId: 'local', statut: 'ACTIF' as const }, mode: 'all' as const, signal: new AbortController().signal, isCurrent: () => true, onProgress: vi.fn() });
const batch = (rows: ClientRow[], page = 1, total = rows.length, limit = 100) => ({ data: { data: rows, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } } });

beforeEach(() => { get.mockReset(); });

describe('bounded client print pagination', () => {
  it('rejects a response that does not respect the frozen status filter', async () => {
    get.mockResolvedValue(batch([{ ...client, statut: 'SUSPENDU' }]));
    await expect(loadClientPrintRows(options())).rejects.toThrow(/filtres|statut/i);
  });

  it('rejects a client from a different site rather than filtering it out silently', async () => {
    get.mockResolvedValue(batch([{ ...client, site: { id: 'foreign', nom: 'Autre' } }]));
    await expect(loadClientPrintRows(options())).rejects.toThrow(/site autorisé/);
  });

  it.each(['short-page', 'duplicate', 'wrong-page', 'changed-total', 'wrong-pages'] as const)('refuses incomplete or unstable pagination: %s', async scenario => {
    const firstRows = Array.from({ length: 100 }, (_, index) => ({ ...client, id: `row-${index}` }));
    const first = batch(firstRows, 1, 101);
    const second = batch([{ ...client, id: 'last' }], 2, 101);
    if (scenario === 'short-page') first.data.data.pop();
    if (scenario === 'duplicate') second.data.data[0].id = 'row-0';
    if (scenario === 'wrong-page') second.data.meta.page = 1;
    if (scenario === 'changed-total') second.data.meta.total = 100;
    if (scenario === 'wrong-pages') first.data.meta.totalPages = 1;
    get.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    await expect(loadClientPrintRows(options())).rejects.toThrow(/liste a changé/);
  });

  it('allows exactly 1000 clients and preserves frozen filters on every request', async () => {
    const settings = options();
    const params: ClientQueryParams[] = [];
    get.mockImplementation(async (_url: string, config: { params: ClientQueryParams }) => {
      params.push({ ...config.params });
      settings.filters.search = 'CHANGED';
      return batch(Array.from({ length: 100 }, (_, index) => ({ ...client, id: `${config.params.page}-${index}` })), config.params.page, 1000);
    });
    const rows = await loadClientPrintRows(settings);
    expect(rows).toHaveLength(1000);
    expect(rows[999].id).toBe('10-99');
    expect(params).toHaveLength(10);
    for (const request of params) expect(request).toMatchObject({ search: ' Aline ', siteId: 'local', statut: 'ACTIF', limit: 100 });
    expect(settings.onProgress).toHaveBeenLastCalledWith(1000, 1000);
  });

  it('allows one page even when the filtered total is over the all-results maximum', async () => {
    get.mockResolvedValue(batch(Array.from({ length: 25 }, (_, index) => ({ ...client, id: `row-${index}` })), 2, 2000, 25));
    const rows = await loadClientPrintRows({ ...options(), mode: 'page', filters: { ...options().filters, page: 2, limit: 25 } });
    expect(rows).toHaveLength(25);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('does not send any request when access is stale or cancellation has already occurred', async () => {
    await expect(loadClientPrintRows({ ...options(), isCurrent: () => false })).rejects.toMatchObject({ name: 'AbortError' });
    const controller = new AbortController();
    controller.abort();
    await expect(loadClientPrintRows({ ...options(), signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(get).not.toHaveBeenCalled();
  });
});
