import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import ClientsListPage from './ClientsListPage';
import { useAuthStore } from '@/store/auth.store';
import type { AuthUser, PaginatedResponse } from '@/types';
import type { ClientQueryParams, ClientRow } from '@/lib/clients.api';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', () => ({ api: { get } }));

const actor: AuthUser = { id: 'agent', name: 'Agent test', role: 'AGENT', siteId: 'site-local', siteName: 'Goma' };
const client: ClientRow = {
  id: 'client-1', prenom: 'Aline', nom: 'Test', telephone: '+243900000001',
  matricule: 'EBN-001', codeParrain: 'OLD-001', statut: 'ACTIF',
  site: { id: 'site-local', nom: 'Goma' }, createdAt: '2026-09-21T10:00:00Z',
};
const queryClients: QueryClient[] = [];
type Response = { data: PaginatedResponse<ClientRow> };
type Request = { params: ClientQueryParams; signal?: AbortSignal };

function response(rows = [client], page = 1, total = rows.length, limit = 25): Response {
  return { data: { data: rows, meta: { page, total, limit, totalPages: Math.ceil(total / limit) } } };
}

function deferred() {
  let resolve!: (result: Response) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<Response>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
}

function mount(user = actor) {
  useAuthStore.getState().setAuth(user, 'test-token');
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
  queryClients.push(queryClient);
  return render(<QueryClientProvider client={queryClient}><MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><ClientsListPage /></MemoryRouter></QueryClientProvider>);
}

async function openPreview() {
  await screen.findByRole('table', { name: 'Liste des clients' });
  fireEvent.click(screen.getByRole('button', { name: 'Imprimer' }));
  return screen.getByRole('region', { name: 'Impression des clients' });
}

function printRequests() {
  return get.mock.calls.filter(([, config]) => config.signal);
}

beforeEach(() => {
  useAuthStore.setState(useAuthStore.getInitialState(), true);
  get.mockReset();
  get.mockImplementation((_url: string, config: Request) => Promise.resolve(response([client], config.params.page, 1, config.params.limit)));
  vi.spyOn(window, 'print').mockImplementation(() => undefined);
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  queryClients.splice(0).forEach(queryClient => queryClient.clear());
  vi.restoreAllMocks();
});

describe('client list printing', () => {
  it('does not offer printing before the current session has a successful client list response', async () => {
    const pending = deferred();
    get.mockReturnValue(pending.promise);
    mount();
    expect(screen.getByRole('button', { name: 'Imprimer' })).toBeDisabled();
    await act(async () => pending.reject(new Error('Access denied')));
    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: 'Imprimer' })).toBeDisabled();
  });

  it('does not retain printing permission from a previous session while the new list is pending', async () => {
    mount();
    await screen.findByRole('table', { name: 'Liste des clients' });
    const pending = deferred();
    get.mockReturnValue(pending.promise);
    act(() => useAuthStore.getState().setAuth({ ...actor, id: 'other' }, 'other-token'));
    expect(screen.getByRole('button', { name: 'Imprimer' })).toBeDisabled();
    await act(async () => pending.reject(new Error('Access denied')));
    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: 'Imprimer' })).toBeDisabled();
  });

  it('previews only the requested current page with document headings, logo and fields', async () => {
    get.mockImplementation((_url: string, config: Request) => Promise.resolve(response(
      [{ ...client, nom: config.params.page === 2 ? 'Page deux' : 'Page une' }], config.params.page, 26, config.params.limit,
    )));
    mount();
    await screen.findByRole('table', { name: 'Liste des clients' });
    fireEvent.click(screen.getByRole('button', { name: /Page suivante/ }));
    await screen.findByText('Aline Page deux');
    const preview = await openPreview();
    fireEvent.click(within(preview).getByRole('button', { name: 'Préparer l’aperçu' }));
    const table = await within(preview).findByRole('table', { name: 'Clients à imprimer' });
    expect(table).toHaveTextContent('Aline Page deux');
    expect(table).not.toHaveTextContent('Page une');
    for (const heading of ['Matricule', 'Nom', 'Téléphone', 'Site', 'Statut']) expect(within(table).getByRole('columnheader', { name: heading })).toBeInTheDocument();
    expect(table).toHaveTextContent('EBN-001');
    expect(table).toHaveTextContent('+243900000001');
    expect(table).toHaveTextContent('Goma');
    expect(table).toHaveTextContent('Actif');
    expect(within(preview).getByRole('img', { name: 'Progress Business' })).toBeInTheDocument();
    expect(within(preview).getByText(/Édité le/)).toBeInTheDocument();
    expect(printRequests()).toHaveLength(1);
    expect(printRequests()[0][1].params).toMatchObject({ page: 2, limit: 25, siteId: 'site-local' });
    fireEvent.click(within(preview).getByRole('button', { name: 'Imprimer / Enregistrer en PDF' }));
    expect(window.print).toHaveBeenCalledTimes(1);
  });

  it('freezes exact search, status and site even before the search debounce settles', async () => {
    mount();
    await screen.findByRole('table', { name: 'Liste des clients' });
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: ' Aline +243 ' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Filtrer par statut' }), { target: { value: 'ACTIF' } });
    fireEvent.click(screen.getByRole('button', { name: 'Imprimer' }));
    const preview = screen.getByRole('region', { name: 'Impression des clients' });
    fireEvent.click(within(preview).getByRole('radio', { name: /Tous les résultats filtrés/ }));
    fireEvent.click(within(preview).getByRole('button', { name: 'Préparer l’aperçu' }));
    await within(preview).findByRole('table', { name: 'Clients à imprimer' });
    expect(printRequests()[0][1].params).toMatchObject({ search: ' Aline +243 ', statut: 'ACTIF', siteId: 'site-local', page: 1 });
    expect(within(preview).getByText(/Recherche :/)).toHaveTextContent('Aline +243');
  });

  it('loads all filtered pages, keeps order and never silently truncates', async () => {
    get.mockImplementation((_url: string, config: Request) => {
      if (!config.signal) return Promise.resolve(response());
      const page = config.params.page!;
      const limit = config.params.limit!;
      const total = limit + 1;
      const rows = page === 1 ? Array.from({ length: limit }, (_, index) => ({ ...client, id: `row-${index}`, nom: `Client ${index}` })) : [{ ...client, id: 'last', nom: 'Dernier' }];
      return Promise.resolve(response(rows, page, total, limit));
    });
    mount();
    const preview = await openPreview();
    fireEvent.click(within(preview).getByRole('radio', { name: /Tous les résultats filtrés/ }));
    fireEvent.click(within(preview).getByRole('button', { name: 'Préparer l’aperçu' }));
    const table = await within(preview).findByRole('table', { name: 'Clients à imprimer' });
    const requests = printRequests();
    expect(requests.map(([, config]) => config.params.page)).toEqual([1, 2]);
    expect(within(table).getAllByRole('row')).toHaveLength(requests[0][1].params.limit + 2);
    const tableRows = within(table).getAllByRole('row');
    expect(tableRows[tableRows.length - 1]).toHaveTextContent('Dernier');
  });

  it('rejects results above the explicit maximum instead of printing the first batch', async () => {
    get.mockImplementation((_url: string, config: Request) => Promise.resolve(config.signal ? response([client], 1, 1001, config.params.limit) : response()));
    mount();
    const preview = await openPreview();
    expect(preview).toHaveTextContent(/1[\s\u202f]?000/);
    fireEvent.click(within(preview).getByRole('radio', { name: /Tous les résultats filtrés/ }));
    fireEvent.click(within(preview).getByRole('button', { name: 'Préparer l’aperçu' }));
    expect(await within(preview).findByRole('alert')).toHaveTextContent(/limite|maximum/i);
    expect(within(preview).queryByRole('table')).not.toBeInTheDocument();
    expect(within(preview).getByRole('button', { name: 'Imprimer / Enregistrer en PDF' })).toBeDisabled();
    expect(printRequests()).toHaveLength(1);
  });

  it('discards partial data after an intermediate page fails', async () => {
    get.mockImplementation((_url: string, config: Request) => {
      if (!config.signal) return Promise.resolve(response());
      if (config.params.page === 2) return Promise.reject(new Error('network unavailable'));
      return Promise.resolve(response(Array.from({ length: config.params.limit! }, (_, index) => ({ ...client, id: `row-${index}` })), 1, config.params.limit! + 1, config.params.limit));
    });
    mount();
    const preview = await openPreview();
    fireEvent.click(within(preview).getByRole('radio', { name: /Tous les résultats filtrés/ }));
    fireEvent.click(within(preview).getByRole('button', { name: 'Préparer l’aperçu' }));
    expect(await within(preview).findByRole('alert')).toHaveTextContent(/Impossible de préparer/);
    expect(within(preview).queryByRole('table')).not.toBeInTheDocument();
    expect(within(preview).getByRole('button', { name: 'Imprimer / Enregistrer en PDF' })).toBeDisabled();
  });

  it('shows an empty state and does not allow an empty document to print', async () => {
    get.mockImplementation((_url: string, config: Request) => Promise.resolve(config.signal ? response([], 1, 0, config.params.limit) : response()));
    mount();
    const preview = await openPreview();
    fireEvent.click(within(preview).getByRole('button', { name: 'Préparer l’aperçu' }));
    expect(await within(preview).findByText(/Aucun client à imprimer/)).toBeInTheDocument();
    expect(within(preview).getByRole('button', { name: 'Imprimer / Enregistrer en PDF' })).toBeDisabled();
  });

  it('aborts pending requests on cancel and ignores late completion after restarting', async () => {
    const pending = deferred();
    get.mockImplementation((_url: string, config: Request) => config.signal ? pending.promise : Promise.resolve(response()));
    mount();
    const preview = await openPreview();
    fireEvent.click(within(preview).getByRole('button', { name: 'Préparer l’aperçu' }));
    await waitFor(() => expect(printRequests()).toHaveLength(1));
    const signal = printRequests()[0][1].signal;
    fireEvent.click(within(preview).getByRole('button', { name: 'Annuler le chargement' }));
    expect(signal.aborted).toBe(true);
    get.mockImplementation((_url: string, config: Request) => Promise.resolve(response([{ ...client, nom: 'Nouveau résultat' }], 1, 1, config.params.limit)));
    fireEvent.click(within(preview).getByRole('button', { name: 'Préparer l’aperçu' }));
    await within(preview).findByRole('table');
    await act(async () => pending.resolve(response([{ ...client, nom: 'Ancien résultat' }])));
    expect(preview).toHaveTextContent('Nouveau résultat');
    expect(preview).not.toHaveTextContent('Ancien résultat');
  });

  it.each(['logout', 'relogin', 'account', 'role', 'site'] as const)('removes prepared private data and blocks browser print after %s', async transition => {
    mount();
    const preview = await openPreview();
    fireEvent.click(within(preview).getByRole('button', { name: 'Préparer l’aperçu' }));
    await within(preview).findByRole('table');
    act(() => {
      if (transition === 'logout') useAuthStore.getState().logout();
      if (transition === 'relogin') { useAuthStore.getState().logout(); useAuthStore.getState().setAuth(actor, 'test-token'); }
      if (transition === 'account') useAuthStore.setState({ user: { ...actor, id: 'new-user' } });
      if (transition === 'role') useAuthStore.setState({ user: { ...actor, role: 'DIRECTEUR_REGIONAL' } });
      if (transition === 'site') useAuthStore.setState({ user: { ...actor, siteId: 'site-other' } });
      window.dispatchEvent(new Event('beforeprint'));
    });
    expect(screen.queryByText('Aline Test')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('table', { name: 'Clients à imprimer' })).toHaveLength(0);
    expect(within(preview).getByRole('button', { name: 'Imprimer / Enregistrer en PDF' })).toBeDisabled();
    expect(window.print).not.toHaveBeenCalled();
  });

  it('ignores a late response after access changes and aborts the request', async () => {
    const pending = deferred();
    get.mockImplementation((_url: string, config: Request) => config.signal ? pending.promise : Promise.resolve(response()));
    mount();
    const preview = await openPreview();
    fireEvent.click(within(preview).getByRole('button', { name: 'Préparer l’aperçu' }));
    await waitFor(() => expect(printRequests()).toHaveLength(1));
    act(() => useAuthStore.setState({ user: { ...actor, siteId: null } }));
    expect(printRequests()[0][1].signal.aborted).toBe(true);
    await act(async () => pending.resolve(response()));
    expect(screen.queryAllByText('Aline Test')).toHaveLength(0);
    expect(within(preview).getByRole('button', { name: 'Imprimer / Enregistrer en PDF' })).toBeDisabled();
  });

  it.each([{ ...actor, siteId: null }, { ...actor, role: 'CLIENT' as const }, { ...actor, role: 'FORMATEUR' as const }])('cannot open printing without the existing list access: $role / $siteId', user => {
    mount(user);
    expect(screen.getByRole('button', { name: 'Imprimer' })).toBeDisabled();
    expect(printRequests()).toHaveLength(0);
  });

  it('preserves the existing unrestricted manager scope', async () => {
    mount({ ...actor, role: 'GERANT' });
    const preview = await openPreview();
    fireEvent.click(within(preview).getByRole('button', { name: 'Préparer l’aperçu' }));
    await within(preview).findByRole('table');
    expect(printRequests()[0][1].params.siteId).toBeUndefined();
  });

  it('aborts and removes its print-only portal when closed', async () => {
    const pending = deferred();
    get.mockImplementation((_url: string, config: Request) => config.signal ? pending.promise : Promise.resolve(response()));
    mount();
    const preview = await openPreview();
    fireEvent.click(within(preview).getByRole('button', { name: 'Préparer l’aperçu' }));
    await waitFor(() => expect(printRequests()).toHaveLength(1));
    fireEvent.click(within(preview).getByRole('button', { name: 'Retour aux clients' }));
    expect(printRequests()[0][1].signal.aborted).toBe(true);
    expect(screen.queryByRole('region', { name: 'Impression des clients' })).not.toBeInTheDocument();
    expect(document.documentElement).not.toHaveAttribute('data-client-print');
    await act(async () => pending.resolve(response()));
    expect(screen.queryAllByRole('table', { name: 'Clients à imprimer' })).toHaveLength(0);
  });
});
