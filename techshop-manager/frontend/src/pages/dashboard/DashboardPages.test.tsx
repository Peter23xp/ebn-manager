import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth.store';
import { useUIStore } from '@/store/ui.store';
import type { Role } from '@/types';
import DashboardPage from './DashboardPage';
import DashboardRegionalPage from './DashboardRegionalPage';

const { get, post, charts } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), charts: [] as any[] }));
vi.mock('@/lib/api', () => ({ api: { get, post } }));
vi.mock('@/lib/offline', () => ({ getCachedData: vi.fn().mockResolvedValue(null), cacheData: vi.fn().mockResolvedValue(undefined) }));
vi.mock('react-chartjs-2', () => ({
  Bar: (props: any) => { charts.push(props); return <canvas role="img" aria-label={props['aria-label']} />; },
  Line: (props: any) => { charts.push(props); return <canvas role="img" aria-label={props['aria-label']} />; },
}));

const chart = { labels: ['Lun 21', 'Mar 22'], datasets: [
  { site: 'Goma', siteId: 'goma', color: '#2563eb', data: [1200.25, 900] },
  { site: 'Bukavu', siteId: 'bukavu', color: '#15803d', data: [320, 500] },
] };
const stats = { clientsActifs: 120, ventesJour: 1200.25, alertesStock: 3, rupturesStock: 1, nouveauxFilleuls: 8,
  trends: { clientsActifs: 12, ventesJour: -5, nouveauxFilleuls: 0 } };
const transactions = [{ id: 'sale-1', numeroVente: 'VTE-001', clientNom: 'Aline Kabeya', produit: 'Samsung Galaxy A55', montant: 1200.25, site: 'Goma', statut: 'VALIDE', createdAt: '2026-09-21T08:00:00Z' }];
const alerts = [{ produitNom: 'Chargeur USB-C', sku: 'USB-01', siteNom: 'Goma', stockActuel: 0, seuilAlerte: 5, type: 'RUPTURE' }];
const regional = {
  comparison: { sites: [{ siteId: 'goma', siteNom: 'Goma', siteVille: 'Goma', ca: 4321.25, nbVentes: 27, nbClientsActifs: 120, alertesStock: 3, caVariation: -12 }],
    totaux: { ca: 4321.25, nbVentes: 27, nbClientsActifs: 120, alertesStock: 3 } },
  revenueChart: chart,
  topProduits: [{ rang: 1, produitId: 'product-1', produitNom: 'Samsung Galaxy A55', sku: 'SAM-01', categorie: 'Téléphones', quantiteVendue: 12, caGenere: 3000, siteLeader: 'Goma' }],
  topParrains: [],
};
let queryClient: QueryClient;

function showPage(role: Role = 'DIRECTEUR_REGIONAL', regionalView = false) {
  useAuthStore.setState({ user: { id: 'test-user', name: 'Compte test', role, siteId: 'goma' }, isAuthenticated: true });
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={[regionalView ? '/dashboard/regional' : '/dashboard']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <Routes>
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/dashboard/regional" element={<DashboardRegionalPage />} />
      <Route path="/sales/:id" element={<h1>Détail de la vente</h1>} />
      <Route path="/clients" element={<h1>Liste des clients</h1>} />
    </Routes>
  </MemoryRouter></QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  charts.length = 0;
  useUIStore.setState({ selectedSiteId: 'bukavu' });
  get.mockImplementation(async (url: string) => {
    if (url.includes('/dashboard/stats')) return { data: stats };
    if (url.includes('/dashboard/sales-chart')) return { data: chart };
    if (url.includes('/dashboard/recent-transactions')) return { data: { transactions } };
    if (url.includes('/dashboard/stock-alerts')) return { data: { alerts } };
    if (url.includes('/dashboard/regional')) return { data: regional };
    throw new Error(`Unexpected request: ${url}`);
  });
});
afterEach(() => { cleanup(); queryClient?.clear(); });

describe('Tableau de bord principal', () => {
  test('les indicateurs conservent leurs libellés pendant le chargement sans afficher de faux zéros', () => {
    get.mockReturnValue(new Promise(() => {}));
    showPage();
    const summary = screen.getByRole('region', { name: 'Indicateurs du tableau de bord' });
    expect(summary).toHaveAttribute('aria-busy', 'true');
    expect(within(summary).getByText('Clients actifs')).toBeVisible();
    expect(within(summary).queryByText('0')).not.toBeInTheDocument();
    expect(within(summary).queryByRole('button')).not.toBeInTheDocument();
  });

  test('la période sélectionnée est accessible et actualise les ventes sans changer les sept jours du graphique', async () => {
    showPage();
    const period = screen.getByRole('group', { name: 'Période des indicateurs' });
    expect(within(period).getByRole('button', { name: "Aujourd’hui" })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(within(period).getByRole('button', { name: 'Semaine' }));
    expect(within(period).getByRole('button', { name: 'Semaine' })).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(get).toHaveBeenCalledWith('/dashboard/stats?period=week&siteId=bukavu'));
    expect(get).toHaveBeenCalledWith('/dashboard/sales-chart?days=7&siteId=bukavu');
    expect(screen.getByText('Ventes cette semaine')).toBeVisible();
  });

  test.each(['AGENT', 'CAISSIER', 'GERANT'] as Role[])('%s reste limité à son site', async role => {
    showPage(role);
    await screen.findByText('Aline Kabeya');
    expect(get).toHaveBeenCalledWith('/dashboard/stats?period=today&siteId=goma');
    expect(screen.queryByRole('link', { name: /Vue régionale/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Vue régionale/ })).not.toBeInTheDocument();
  });

  test('un agent consulte ses données sans accès à la vente ni à la gestion des stocks', async () => {
    showPage('AGENT');
    await screen.findByText('Aline Kabeya');
    expect(screen.queryByRole('group', { name: /Période/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Aline Kabeya/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Gérer/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Clients actifs/ }));
    expect(screen.getByRole('heading', { name: 'Liste des clients' })).toBeVisible();
  });

  test('le caissier peut ouvrir une transaction mais pas gérer les alertes', async () => {
    showPage('CAISSIER');
    const transaction = await screen.findByRole('button', { name: /Aline Kabeya/ });
    expect(screen.queryByRole('button', { name: /Gérer/ })).not.toBeInTheDocument();
    await userEvent.click(transaction);
    expect(screen.getByRole('heading', { name: 'Détail de la vente' })).toBeVisible();
  });

  test('la légende du graphique ne présente que le site affiché et les montants restent en USD', async () => {
    showPage('GERANT');
    const graph = await screen.findByRole('region', { name: 'Ventes — 7 derniers jours' });
    await within(graph).findByRole('img');
    expect(within(graph).getByText('Goma')).toBeVisible();
    expect(within(graph).queryByText('Bukavu')).not.toBeInTheDocument();
    const config = charts[charts.length - 1];
    expect(config.data.datasets).toHaveLength(1);
    expect(config.options.plugins.tooltip.callbacks.label({ dataset: { label: 'Goma' }, parsed: { y: 1200.25 } })).toMatch(/1\s200,25 USD/);
  });

  test('une erreur réseau propose de réessayer sans annoncer des stocks suffisants', async () => {
    get.mockRejectedValue(new Error('network'));
    showPage();
    const retry = await screen.findByRole('button', { name: 'Réessayer' });
    expect(screen.queryByText('Tous les stocks sont suffisants')).not.toBeInTheDocument();
    get.mockImplementation(async (url: string) => ({ data: url.includes('/stats') ? stats : url.includes('/sales-chart') ? chart : url.includes('/recent-transactions') ? { transactions } : { alerts } }));
    await userEvent.click(retry);
    expect(await screen.findByText('Aline Kabeya')).toBeVisible();
  });
});

describe('Vue régionale', () => {
  test('les données déjà chargées restent visibles si une actualisation échoue', async () => {
    showPage('DIRECTEUR_REGIONAL', true);
    const summary = screen.getByRole('region', { name: 'Indicateurs régionaux' });
    expect(await within(summary).findByText(/4\s321,25 USD/)).toBeVisible();
    get.mockRejectedValue(new Error('network'));
    await userEvent.click(screen.getByRole('button', { name: 'Actualiser les données' }));
    await screen.findByRole('button', { name: 'Réessayer' }, { timeout: 3000 });
    expect(screen.getByRole('region', { name: 'Indicateurs régionaux' })).toBeVisible();
    expect(within(summary).getByText(/4\s321,25 USD/)).toBeVisible();
  });

  test('les courbes régionales peuvent être masquées et réaffichées au clavier', async () => {
    showPage('DIRECTEUR_REGIONAL', true);
    const site = await screen.findByRole('button', { name: 'Bukavu' });
    expect(site).toHaveAttribute('aria-pressed', 'true');
    site.focus();
    await userEvent.keyboard('{Enter}');
    expect(site).toHaveAttribute('aria-pressed', 'false');
    expect(charts[charts.length - 1].data.datasets[1].hidden).toBe(true);
    await userEvent.keyboard('{Enter}');
    expect(site).toHaveAttribute('aria-pressed', 'true');
    expect(charts[charts.length - 1].data.datasets[1].hidden).toBe(false);
  });

  test('les totaux du backend sont lisibles dans une synthèse distincte du comparatif', async () => {
    showPage('DIRECTEUR_REGIONAL', true);
    const summary = screen.getByRole('region', { name: 'Indicateurs régionaux' });
    expect(await within(summary).findByText(/4\s321,25 USD/)).toBeVisible();
    expect(within(summary).getByText('27')).toBeVisible();
    expect(within(summary).getByText('120')).toBeVisible();
    expect(within(summary).getByText('3')).toBeVisible();
  });

  test('la période régionale actualise les données et reste annoncée comme sélectionnée', async () => {
    showPage('DIRECTEUR_REGIONAL', true);
    await userEvent.click(screen.getByRole('button', { name: 'Ce trimestre' }));
    expect(screen.getByRole('button', { name: 'Ce trimestre' })).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(get).toHaveBeenCalledWith('/dashboard/regional?period=quarter'));
  });

  test('le comparatif garde sa sémantique de tableau et le site est accessible au clavier', async () => {
    showPage('DIRECTEUR_REGIONAL', true);
    const table = screen.getByRole('table', { name: 'Performance par site' });
    const siteButton = await within(table).findByRole('button', { name: /Goma/ });
    expect(siteButton.closest('tr')).not.toHaveAttribute('role', 'button');
    siteButton.focus();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible();
    await waitFor(() => expect(get).toHaveBeenCalledWith('/dashboard/stats?period=today&siteId=goma'));
  });

  test('une variation négative ne se présente pas comme un pourcentage positif', async () => {
    showPage('DIRECTEUR_REGIONAL', true);
    expect(await screen.findByText('-12 %')).toBeVisible();
  });

  test('une région sans sites ni ventes affiche des états vides explicites', async () => {
    get.mockResolvedValue({ data: { ...regional, comparison: { sites: [], totaux: { ca: 0, nbVentes: 0, nbClientsActifs: 0, alertesStock: 0 } }, revenueChart: { labels: [], datasets: [] }, topProduits: [] } });
    showPage('DIRECTEUR_REGIONAL', true);
    expect(await screen.findByText('Aucun site à comparer')).toBeVisible();
    const revenue = screen.getByRole('region', { name: 'Évolution du chiffre d’affaires' });
    expect(within(revenue).getByRole('status')).toHaveTextContent('Aucune vente');
    expect(within(revenue).queryByRole('img')).not.toBeInTheDocument();
  });
});
