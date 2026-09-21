import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ExportPage from './ExportPage';
import RapportVentesPage from './RapportVentesPage';
import RapportStocksPage from './RapportStocksPage';
import { useAuthStore } from '@/store/auth.store';
import type { AuthUser } from '@/types';

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({ api: { get, post } }));

const director: AuthUser = { id: 'director', name: 'Directeur', role: 'DIRECTEUR_REGIONAL', siteId: null };
const manager: AuthUser = { id: 'manager', name: 'Gérant', role: 'GERANT', siteId: 'own-site', siteName: 'Site attribué' };
const sites = [{ id: 'real-site', nom: 'Site réel', ville: 'Ville', actif: true }];
const sales = {
  ventes: [], meta: { total: 0, page: 1, limit: 50, totalPages: 0 },
  resume: { totalCA: 0, nbVentes: 0, remisesAccordees: 0, ticketMoyen: 0, trends: { ca: 0, ventes: 0 } },
  totauxParAgent: [],
};
const ready = {
  jobId: 'private-job', type: 'VENTES_DETAIL', format: 'XLSX', statut: 'READY',
  fileName: 'ventes.xlsx', rowCount: 2, fileSize: 1400, expiresAt: '2099-09-21T12:00:00Z',
  downloadUrl: 'https://untrusted.example/file', createdAt: '2026-09-21T12:00:00Z', updatedAt: '2026-09-21T12:00:00Z',
};
const clients: QueryClient[] = [];

function response(url: string) {
  if (url === '/sites') return { data: { data: sites } };
  if (url === '/rapports/export/estimate') return { data: { estimatedRows: 2 } };
  if (url === '/rapports/ventes/detail') return { data: sales };
  if (url === '/rapports/stocks') return { data: { data: [], totalProduits: 0, totalSites: 0 } };
  if (url.endsWith('/download')) return { data: new Blob(['real,data'], { type: 'text/csv' }) };
  return { data: ready };
}

function mount(path: string, actor = director) {
  useAuthStore.getState().setAuth(actor, 'token');
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <Routes>
      <Route path="/reports/export" element={<ExportPage />} />
      <Route path="/reports/sales" element={<RapportVentesPage />} />
      <Route path="/reports/stocks" element={<RapportStocksPage />} />
    </Routes>
  </MemoryRouter></QueryClientProvider>);
  return client;
}

beforeEach(() => {
  useAuthStore.setState(useAuthStore.getInitialState(), true);
  get.mockReset().mockImplementation(async (url: string) => response(url));
  post.mockReset().mockResolvedValue({ data: { jobId: 'private-job' } });
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL = vi.fn(() => 'blob:private-export');
    static revokeObjectURL = vi.fn();
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  vi.spyOn(window, 'open').mockImplementation(() => null);
});

afterEach(() => {
  cleanup();
  clients.splice(0).forEach(client => client.clear());
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

describe('private export flow', () => {
  it('offers only implemented types and formats with real sites', async () => {
    mount('/reports/export?type=VENTES');
    expect(await screen.findByRole('option', { name: 'Site réel' })).toHaveValue('real-site');
    expect(screen.getByRole('radio', { name: /CSV/ })).toBeEnabled();
    expect(screen.queryByRole('radio', { name: /PDF|Parrainage|Fidélité/ })).not.toBeInTheDocument();
  });

  it('keeps optional filters editable after clearing them and offers them for new exports', async () => {
    mount('/reports/export?type=VENTES_DETAIL&search=USB');
    const search = screen.getByRole('textbox', { name: 'Recherche' });
    fireEvent.change(search, { target: { value: '' } });
    expect(screen.getByRole('textbox', { name: 'Recherche' })).toHaveValue('');
    expect(screen.getByRole('combobox', { name: 'Mode de paiement' })).toBeEnabled();
    expect(screen.getByRole('textbox', { name: 'Catégorie' })).toBeEnabled();
  });

  it('shows download errors and permits an explicit retry', async () => {
    get.mockImplementation(async (url: string) => {
      if (url.endsWith('/download')) throw new Error('Téléchargement indisponible');
      return response(url);
    });
    mount('/reports/export?type=VENTES');
    await waitFor(() => expect(screen.getByRole('button', { name: /Générer l.export/ })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: /Générer l.export/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Télécharger/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Téléchargement indisponible/);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    get.mockImplementation(async (url: string) => response(url));
    fireEvent.click(screen.getByRole('button', { name: /Télécharger/ }));
    await waitFor(() => expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a sites query error instead of silently emptying the site selector', async () => {
    get.mockImplementation(async (url: string) => {
      if (url === '/sites') throw new Error('Sites indisponibles');
      return response(url);
    });
    mount('/reports/export?type=VENTES');
    expect(await screen.findByRole('alert')).toHaveTextContent(/charger les sites/);
    get.mockImplementation(async (url: string) => response(url));
    fireEvent.click(screen.getByRole('button', { name: /Réessayer les sites/ }));
    expect(await screen.findByRole('option', { name: 'Site réel' })).toBeInTheDocument();
  });

  it('forces the manager site for both estimate and generation', async () => {
    mount('/reports/export?type=VENTES_DETAIL&siteId=foreign-site&dateDebut=2026-09-01&dateFin=2026-09-20&modePaiement=CASH&agentId=agent-1&categorie=Audio&search=USB&sortDir=asc', manager);
    expect(screen.getByText('Site attribué')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /site/i })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: /Générer l.export/ })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: /Générer l.export/ }));
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post.mock.calls[0][1]).toEqual({ type: 'VENTES_DETAIL', format: 'XLSX', filtres: {
      siteId: 'own-site', dateDebut: '2026-09-01', dateFin: '2026-09-20', modePaiement: 'CASH', agentId: 'agent-1', categorie: 'Audio', search: 'USB', sortDir: 'asc',
    } });
    const estimate = get.mock.calls.find(([url]) => url === '/rapports/export/estimate')![1].params;
    expect(estimate).toEqual({ type: 'VENTES_DETAIL', format: 'XLSX', ...post.mock.calls[0][1].filtres });
    expect(get.mock.calls.some(([url]) => url === '/sites')).toBe(false);
  });

  it('downloads only after an explicit click through authenticated Axios and revokes its URL', async () => {
    mount('/reports/export?type=VENTES_DETAIL');
    await waitFor(() => expect(screen.getByRole('button', { name: /Générer l.export/ })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: /Générer l.export/ }));
    const download = await screen.findByRole('button', { name: /Télécharger/ });
    expect(window.open).not.toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    fireEvent.click(download);
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledOnce());
    expect(get).toHaveBeenCalledWith('/rapports/export/private-job/download', expect.objectContaining({ responseType: 'blob', signal: expect.any(AbortSignal) }));
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce();
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:private-export'));
  });

  it.each([0, 10001])('blocks generation for an estimate of %i rows', async estimatedRows => {
    get.mockImplementation(async (url: string) => url.endsWith('/estimate') ? { data: { estimatedRows } } : response(url));
    mount('/reports/export?type=VENTES');
    await screen.findByText(estimatedRows === 0 ? /Aucune ligne/ : /10.?000 lignes/);
    expect(screen.getByRole('button', { name: /Générer l.export/ })).toBeDisabled();
    expect(post).not.toHaveBeenCalled();
  });

  it('shows estimate failures instead of allowing an unestimated export', async () => {
    get.mockImplementation(async (url: string) => {
      if (url.endsWith('/estimate')) throw new Error('Estimation indisponible');
      return response(url);
    });
    mount('/reports/export?type=VENTES');
    expect(await screen.findByRole('alert')).toHaveTextContent(/Estimation|estimation/);
    expect(screen.getByRole('button', { name: /Générer l.export/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Réessayer/ })).toBeEnabled();
  });

  it('allows the exact 10,000-row limit and refetches the estimate when format changes', async () => {
    get.mockImplementation(async (url: string) => url.endsWith('/estimate') ? { data: { estimatedRows: 10000 } } : response(url));
    mount('/reports/export?type=VENTES');
    await waitFor(() => expect(screen.getByRole('button', { name: /Générer l.export/ })).toBeEnabled());
    fireEvent.click(screen.getByRole('radio', { name: 'CSV' }));
    await waitFor(() => expect(get.mock.calls.filter(([url]) => url.endsWith('/estimate')).slice(-1)[0][1].params.format).toBe('CSV'));
    await waitFor(() => expect(screen.getByRole('button', { name: /Générer l.export/ })).toBeEnabled());
  });

  it('shows initial generation progress before the first polling response', async () => {
    get.mockImplementation((url: string) => url === '/rapports/export/private-job' ? new Promise(() => {}) : Promise.resolve(response(url)));
    mount('/reports/export?type=VENTES');
    await waitFor(() => expect(screen.getByRole('button', { name: /Générer l.export/ })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: /Générer l.export/ }));
    expect(await screen.findByRole('status')).toHaveTextContent(/Génération en cours/);
    expect(screen.queryByRole('button', { name: /Générer l.export/ })).not.toBeInTheDocument();
  });

  it('shows server generation failures and expired files without a public download link', async () => {
    get.mockImplementation(async (url: string) => url === '/rapports/export/private-job'
      ? { data: { ...ready, statut: 'ERROR', errorMsg: 'Fichier trop volumineux' } } : response(url));
    mount('/reports/export?type=VENTES');
    await waitFor(() => expect(screen.getByRole('button', { name: /Générer l.export/ })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: /Générer l.export/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Fichier trop volumineux');
    expect(screen.queryByRole('link', { name: /Télécharger/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /autre export/ }));
    get.mockImplementation(async (url: string) => url === '/rapports/export/private-job'
      ? { data: { ...ready, expiresAt: '2020-01-01T00:00:00Z' } } : response(url));
    await waitFor(() => expect(screen.getByRole('button', { name: /Générer l.export/ })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: /Générer l.export/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/expiré/);
    expect(screen.getByRole('button', { name: /Télécharger/ })).toBeDisabled();
  });

  it('shows polling failures and lets reset clear the failed job', async () => {
    get.mockImplementation(async (url: string) => {
      if (url === '/rapports/export/private-job') throw new Error('Suivi indisponible');
      return response(url);
    });
    mount('/reports/export?type=VENTES');
    await waitFor(() => expect(screen.getByRole('button', { name: /Générer l.export/ })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: /Générer l.export/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Suivi|suivi/);
    fireEvent.click(screen.getByRole('button', { name: /autre export|Réinitialiser/ }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Générer l.export/ })).toBeInTheDocument();
  });

  it('ignores an in-flight download after a session switch', async () => {
    let resolveDownload!: (value: { data: Blob }) => void;
    get.mockImplementation((url: string) => url.endsWith('/download')
      ? new Promise(resolve => { resolveDownload = resolve; }) : Promise.resolve(response(url)));
    mount('/reports/export?type=VENTES');
    await waitFor(() => expect(screen.getByRole('button', { name: /Générer l.export/ })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: /Générer l.export/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Télécharger/ }));
    await waitFor(() => expect(resolveDownload).toBeDefined());
    act(() => useAuthStore.getState().setAuth({ ...director, id: 'other-director' }, 'new-token'));
    await act(async () => resolveDownload({ data: new Blob(['private']) }));
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(screen.queryByText('ventes.xlsx')).not.toBeInTheDocument();
  });

  it.each([null, { ...manager, siteId: null }, { ...manager, role: 'CAISSIER' as const }])('blocks unavailable report access for %j', async actor => {
    mount('/reports/export?type=VENTES', actor ?? director);
    if (!actor) act(() => useAuthStore.getState().logout());
    expect(await screen.findByRole('alert')).toHaveTextContent(/accès|site|session/i);
    expect(screen.queryByRole('button', { name: /Générer l.export/ })).not.toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });
});

describe('detail report navigation', () => {
  it.each([
    ['/reports/sales', 'Ventes détaillées'],
    ['/reports/stocks', 'Stocks et inventaire'],
    ['/reports/export?type=STOCKS', 'Exports'],
  ])('identifies the current report and keeps the other authorized sections reachable on %s', async (path, current) => {
    mount(path);
    const navigation = screen.getByRole('navigation', { name: 'Rapports disponibles' });
    expect(within(navigation).getByRole('link', { name: current })).toHaveAttribute('aria-current', 'page');
    expect(within(navigation).getByRole('link', { name: 'Vue d’ensemble' })).toHaveAttribute('href', '/reports');
    expect(within(navigation).getByRole('link', { name: 'Ventes détaillées' })).toHaveAttribute('href', '/reports/sales');
    expect(within(navigation).getByRole('link', { name: 'Stocks et inventaire' })).toHaveAttribute('href', '/reports/stocks');
  });

  it('does not expose regional reports through the new export navigation for a manager', () => {
    mount('/reports/export?type=VENTES', manager);
    const navigation = screen.getByRole('navigation', { name: 'Rapports disponibles' });
    expect(within(navigation).queryByRole('link', { name: 'Ventes détaillées' })).not.toBeInTheDocument();
    expect(within(navigation).queryByRole('link', { name: 'Stocks et inventaire' })).not.toBeInTheDocument();
    expect(within(navigation).getByRole('link', { name: 'Exports' })).toHaveAttribute('aria-current', 'page');
  });

  it.each([
    ['/reports/stocks', '/rapports/stocks', 'Indicateurs du stock', 'Produits référencés'],
    ['/reports/sales', '/rapports/ventes/detail', 'Indicateurs des ventes', 'Remises accordées'],
  ])('keeps named indicators visible without false totals while %s loads', (path, endpoint, region, label) => {
    get.mockImplementation((url: string) => url === endpoint ? new Promise(() => {}) : Promise.resolve(response(url)));
    mount(path);
    const summary = screen.getByRole('region', { name: region });
    expect(summary).toHaveAttribute('aria-busy', 'true');
    expect(within(summary).getByText(label)).toBeInTheDocument();
    expect(within(summary).queryByText(/^0/)).not.toBeInTheDocument();
  });

  it('names the generated report in plain language rather than its internal export code', async () => {
    mount('/reports/export?type=VENTES_DETAIL');
    await waitFor(() => expect(screen.getByRole('button', { name: /Générer l.export/ })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: /Générer l.export/ }));
    await screen.findByRole('button', { name: /Télécharger/ });
    expect(screen.getByRole('status')).toHaveTextContent('Ventes détaillées');
    expect(screen.getByRole('status')).not.toHaveTextContent('VENTES_DETAIL');
  });

  it.each(['/reports/sales', '/reports/stocks'])('keeps filters and retry available after failure on %s', async path => {
    get.mockImplementation(async (url: string) => {
      if (url === '/rapports/ventes/detail' || url === '/rapports/stocks') throw new Error('Réseau indisponible');
      return response(url);
    });
    mount(path);
    expect(await screen.findByRole('alert')).toHaveTextContent(/Impossible de charger le rapport/);
    expect(screen.getByRole('combobox', { name: 'Site' })).toBeEnabled();
    get.mockImplementation(async (url: string) => response(url));
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.getAllByText(/Aucun.*(vente|produit)/).length).toBeGreaterThan(0);
  });

  it('sends date sorting to the backend and preserves all applied sales filters in the export', async () => {
    mount('/reports/sales?siteId=real-site&dateDebut=2026-09-01&dateFin=2026-09-20&modePaiement=CASH&agentId=agent-1&categorie=Audio&search=USB');
    const sort = await screen.findByRole('button', { name: /Trier par date/i });
    fireEvent.click(sort);
    await waitFor(() => expect(get.mock.calls.filter(([url]) => url === '/rapports/ventes/detail').slice(-1)[0][1].params).toMatchObject({ sortDir: 'asc', search: 'USB', siteId: 'real-site', categorie: 'Audio' }));
    fireEvent.click(screen.getByRole('button', { name: /Export/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Générer l.export/ })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: /Générer l.export/ }));
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post.mock.calls[0][1].filtres).toEqual({ siteId: 'real-site', dateDebut: '2026-09-01', dateFin: '2026-09-20', modePaiement: 'CASH', agentId: 'agent-1', categorie: 'Audio', search: 'USB', sortDir: 'asc' });
  });

  it('preserves stock site, category and search without inventing a date period', async () => {
    mount('/reports/stocks?siteId=real-site&categorie=Audio&search=USB');
    await screen.findByRole('option', { name: 'Site réel' });
    expect(get.mock.calls.find(([url]) => url === '/rapports/stocks')![1].params).toMatchObject({ siteId: 'real-site', categorie: 'Audio', search: 'USB' });
    fireEvent.click(screen.getByRole('button', { name: /Export/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Générer l.export/ })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: /Générer l.export/ }));
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post.mock.calls[0][1]).toEqual({ type: 'STOCKS', format: 'XLSX', filtres: { siteId: 'real-site', categorie: 'Audio', search: 'USB' } });
  });
});
