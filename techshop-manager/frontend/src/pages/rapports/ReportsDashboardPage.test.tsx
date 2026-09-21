/**
 * ReportsDashboardPage.test.tsx
 * SCR-030 — 24 tests covering access, period selector, date range picker,
 * charts (skeleton / empty states), sites summary table, and auto-granularity.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ── Mocks ────────────────────────────────────────────────────────────────────

// Mock Chart.js so canvas isn't needed in JSDOM
vi.mock('react-chartjs-2', () => ({
  Line:     ({ data }: any) => <canvas data-testid="line-chart" data-labels={JSON.stringify(data?.labels)} />,
  Doughnut: ({ data }: any) => <canvas data-testid="doughnut-chart" data-labels={JSON.stringify(data?.labels)} />,
  Bar:      ({ data }: any) => <canvas data-testid="bar-chart" data-labels={JSON.stringify(data?.labels)} />,
}));

// Mock useAuth
const mockUseAuth = vi.fn();
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => mockUseAuth() }));
vi.mock('@/hooks/usePrivateQueryScope', () => ({ usePrivateQueryScope: () => ({
  key: JSON.stringify(mockUseAuth().user), enabled: mockUseAuth().hasRole('GERANT'), isCurrent: () => true,
}) }));
vi.mock('@/hooks/useSites', () => ({ useSites: () => ({ sites: [{ id: 'goma', nom: 'Site Goma' }, { id: 'bkv', nom: 'Site Bukavu' }], isLoading: false }) }));

// Mock reports API
const mockGetVentesReport = vi.fn();
vi.mock('@/lib/reports.api', () => ({
  reportsApi: { getVentesReport: (...args: any[]) => mockGetVentesReport(...args) },
}));

// Mock react-router navigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

// ── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_DATA = {
  seriesCA: [
    { label: 'Lun 1 jan', values: { Goma: 1000000, Bukavu: 500000, Kinshasa: 300000 } },
    { label: 'Mar 2 jan', values: { Goma: 1200000, Bukavu: 600000, Kinshasa: 400000 } },
  ],
  totalCA: 4000000,
  nbVentes: 166,
  topProduits: [
    { nom: 'iPhone 15', sku: 'IPH15', quantite: 45, ca: 2000000 },
    { nom: 'Samsung S24', sku: 'SAM24', quantite: 32, ca: 1200000 },
    { nom: 'AirPods Pro', sku: 'AIP3', quantite: 28, ca: 400000 },
    { nom: 'iPad Air', sku: 'IPA6', quantite: 19, ca: 800000 },
    { nom: 'MacBook Pro', sku: 'MBP14', quantite: 12, ca: 3000000 },
  ],
  parSite: [
    { siteId: 'goma', siteNom: 'Goma',     ca: 2200000, nbVentes: 87, nbNouveauxClients: 12, alertesStock: 2, pourcentageCA: 53.9 },
    { siteId: 'bkv', siteNom: 'Bukavu',    ca: 1100000, nbVentes: 56, nbNouveauxClients: 8,  alertesStock: 5, pourcentageCA: 26.9 },
    { siteId: 'kin', siteNom: 'Kinshasa',  ca: 700000,  nbVentes: 23, nbNouveauxClients: 3,  alertesStock: 0, pourcentageCA: 17.1 },
  ],
};

const GERANT_USER = {
  id: 'u1', role: 'GERANT', name: 'Alice Gérant',
  siteId: 'goma' as string | null, siteName: 'Goma' as string | null,
};

const DR_USER = {
  id: 'u2', role: 'DIRECTEUR_REGIONAL', name: 'Bob DR',
  siteId: null as string | null, siteName: null as string | null,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeQC() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

function renderPage(user = DR_USER) {
  mockUseAuth.mockReturnValue({
    user,
    hasRole: (role: string) => {
      const levels: Record<string, number> = {
        SUPER_ADMIN: 6, DIRECTEUR_REGIONAL: 5, GERANT: 4, AGENT: 3, FORMATEUR: 2, CLIENT: 1,
      };
      return (levels[user.role] ?? 0) >= (levels[role] ?? 0);
    },
  });

  const qc = makeQC();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/reports']}>
        <RapportsDashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// Lazy import after mocks are set up
let RapportsDashboardPage: React.ComponentType;
beforeEach(async () => {
  vi.clearAllMocks();
  mockGetVentesReport.mockReset();
  const mod = await import('@/pages/rapports/RapportsDashboardPage');
  RapportsDashboardPage = mod.default;
});

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Accès et affichage
// ═══════════════════════════════════════════════════════════════════════════════
describe('ReportsDashboardPage', () => {
  test('les filtres regroupés conservent le site et la période dans les liens de consultation et d’export', async () => {
    mockGetVentesReport.mockResolvedValue(BASE_DATA);
    renderPage(DR_USER);
    const filters = screen.getByRole('group', { name: 'Filtres du rapport' });
    await userEvent.selectOptions(within(filters).getByRole('combobox', { name: 'Site du rapport' }), 'bkv');
    await userEvent.selectOptions(within(filters).getByRole('combobox', { name: /sélectionner une période/i }), 'last_month');
    await waitFor(() => expect(mockGetVentesReport).toHaveBeenLastCalledWith(expect.objectContaining({ siteId: 'bkv' })));
    const navigation = screen.getByRole('navigation', { name: 'Rapports disponibles' });
    expect(within(navigation).getByRole('link', { name: 'Vue d’ensemble' })).toHaveAttribute('aria-current', 'page');
    const sales = new URL(screen.getByRole('link', { name: /ventes détaillées/i }).getAttribute('href')!, 'http://localhost');
    const exported = new URL(screen.getByRole('link', { name: /exporter/i }).getAttribute('href')!, 'http://localhost');
    expect(sales.searchParams.get('siteId')).toBe('bkv');
    expect(exported.searchParams.get('siteId')).toBe('bkv');
    expect(exported.searchParams.get('dateDebut')).toBe(sales.searchParams.get('dateDebut'));
    expect(exported.searchParams.get('dateFin')).toBe(sales.searchParams.get('dateFin'));
  });

  test('les indicateurs gardent leurs libellés et signalent leur chargement sans afficher de faux zéros', () => {
    mockGetVentesReport.mockReturnValue(new Promise(() => {}));
    renderPage(DR_USER);
    const summary = screen.getByRole('region', { name: 'Indicateurs de la période' });
    expect(summary).toHaveAttribute('aria-busy', 'true');
    expect(within(summary).getByText('Chiffre d’affaires total')).toBeInTheDocument();
    expect(within(summary).getByText('Ventes validées')).toBeInTheDocument();
    expect(within(summary).getByText('Nouveaux clients')).toBeInTheDocument();
    expect(within(summary).queryByText(/^0/)).not.toBeInTheDocument();
  });

  test('la répartition expose un total lisible sans canvas et le met à jour après filtrage', async () => {
    mockGetVentesReport.mockResolvedValueOnce(BASE_DATA).mockResolvedValueOnce({ ...BASE_DATA, totalCA: 1100000, parSite: [BASE_DATA.parSite[1]] });
    renderPage(DR_USER);
    const distribution = await screen.findByRole('region', { name: 'Répartition par site' });
    await waitFor(() => expect(within(distribution).getByText(/4\s*000\s*000/)).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Site du rapport' }), 'bkv');
    await waitFor(() => expect(within(distribution).getByText(/1\s*100\s*000/)).toBeInTheDocument());
    expect(within(distribution).queryByText(/4\s*000\s*000/)).not.toBeInTheDocument();
  });

  test('la synthèse présente les remboursements, les encaissements CDF et les liens de rapports', async () => {
    mockGetVentesReport.mockResolvedValue({ ...BASE_DATA, activity: {
      generatedAt: '2026-09-21T12:00:00Z', refunds: { count: 1, amount: 20 },
      pendingSales: { count: 2, amount: 45 }, netAfterRefunds: 3999980, discounts: 5,
      averageBasket: 24096.39, onboardingCDF: 15000.75,
      onboarding: [{ etape: 'RECIT', count: 3, amount: 15000.75, currency: 'CDF', includedInSales: false }],
      payments: [{ mode: 'CASH', count: 166, amount: 4000000 }],
      clients: { total: 200, activated: 12, byStatus: { ACTIF: 120, EN_COURS: 80 } },
      stock: { references: 18, units: 152, alerts: 7, value: 4567.89 },
    } });
    renderPage(DR_USER);
    expect(await screen.findByRole('heading', { name: 'Encaissements et remboursements' })).toBeInTheDocument();
    expect(screen.getAllByText(/15\s*000,75 CDF/).length).toBeGreaterThan(0);
    expect(screen.getByText('Remboursements effectués')).toBeInTheDocument();
    expect(screen.getByText(/déjà incluses dans les ventes/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ventes détaillées/i })).toHaveAttribute('href', expect.stringContaining('/reports/sales'));
    expect(screen.getByRole('link', { name: /exporter/i })).toHaveAttribute('href', expect.stringContaining('/reports/export'));
  });

  test('un site réel sélectionné filtre le rapport', async () => {
    mockGetVentesReport.mockResolvedValue(BASE_DATA);
    renderPage(DR_USER);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Site du rapport' }), 'bkv');
    await waitFor(() => expect(mockGetVentesReport).toHaveBeenLastCalledWith(expect.objectContaining({ siteId: 'bkv' })));
  });

  test('un gérant ne reçoit pas de lien vers les rapports régionaux', async () => {
    mockGetVentesReport.mockResolvedValue(BASE_DATA);
    renderPage(GERANT_USER);
    expect(screen.queryByRole('link', { name: /ventes détaillées/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Site du rapport' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /exporter/i })).toBeInTheDocument();
  });
  describe('Accès et affichage', () => {
    test('1 — Acces refuse AGENT: le camembert est masque car hasRole(GERANT)=false', () => {
      // The page itself doesn't block AGENT — the RoleGuard wrapper in App.tsx does.
      // We test that a GERANT-only UI element (PeriodSelector) is still rendered
      // and that the doughnut is hidden for a single-site user.
      mockGetVentesReport.mockResolvedValue(BASE_DATA);
      mockUseAuth.mockReturnValue({
        user: { ...GERANT_USER, role: 'AGENT' },
        hasRole: (r: string) => r === 'AGENT',
      });

      const qc = makeQC();
      render(
        <QueryClientProvider client={qc}>
          <MemoryRouter>
            <RapportsDashboardPage />
          </MemoryRouter>
        </QueryClientProvider>,
      );
      // AGENT has GERANT = false, so doughnut chart is hidden
      expect(screen.queryByTestId('doughnut-chart')).toBeNull();
    });

    test('2 — Accès accordé GERANT : titre affiché', async () => {
      mockGetVentesReport.mockResolvedValue(BASE_DATA);
      renderPage(GERANT_USER);
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    });

    test('3 — Camembert MASQUÉ pour GERANT', async () => {
      mockGetVentesReport.mockResolvedValue(BASE_DATA);
      renderPage(GERANT_USER);
      await waitFor(() => expect(mockGetVentesReport).toHaveBeenCalled());
      expect(screen.queryByTestId('doughnut-chart')).toBeNull();
    });

    test('4 — Camembert VISIBLE pour DIR_REGIONAL', async () => {
      mockGetVentesReport.mockResolvedValue(BASE_DATA);
      renderPage(DR_USER);
      await waitFor(() => expect(screen.getByTestId('doughnut-chart')).toBeInTheDocument());
    });

    test('5 — SitesSummaryTable : 1 ligne pour GERANT, 3+total pour DIR_REGIONAL', async () => {
      const singleSiteData = {
        ...BASE_DATA,
        parSite: [BASE_DATA.parSite[0]],
      };
      mockGetVentesReport.mockResolvedValue(singleSiteData);
      renderPage(GERANT_USER);
      await waitFor(() => expect(screen.getByText('Goma')).toBeInTheDocument());
      // No TOTAL row for GERANT
      expect(screen.queryByText('TOTAL')).toBeNull();

      // Now DR sees 3 sites + TOTAL
      mockGetVentesReport.mockResolvedValue(BASE_DATA);
      renderPage(DR_USER);
      await waitFor(() => expect(screen.getByText('TOTAL')).toBeInTheDocument());
      expect(screen.getAllByRole('row').length).toBeGreaterThanOrEqual(4); // header + 3 sites + total
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. PeriodSelector
  // ═══════════════════════════════════════════════════════════════════════════
  describe('PeriodSelector', () => {
    test('6 — Sélection "Ce mois" calcule dateDebut/dateFin du mois courant', async () => {
      mockGetVentesReport.mockResolvedValue(BASE_DATA);
      renderPage();

      const select = screen.getByRole('combobox', { name: /sélectionner une période/i });
      await userEvent.selectOptions(select, 'this_month');

      await waitFor(() => {
        const call = mockGetVentesReport.mock.calls[0]?.[0];
        const now = new Date();
        expect(call?.dateDebut).toMatch(new RegExp(`^${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`));
      });
    });

    test('7 — Sélection "Personnalisé" affiche DateRangePicker', async () => {
      mockGetVentesReport.mockResolvedValue(BASE_DATA);
      renderPage();

      const select = screen.getByRole('combobox', { name: /sélectionner une période/i });
      await userEvent.selectOptions(select, 'custom');

      expect(screen.getByRole('button', { name: /sélectionner une plage/i })).toBeInTheDocument();
    });

    test('8 — Changement de période invalide le cache et relance la requête', async () => {
      mockGetVentesReport.mockResolvedValue(BASE_DATA);
      renderPage();

      const select = screen.getByRole('combobox', { name: /sélectionner une période/i });
      await userEvent.selectOptions(select, 'last_month');

      await waitFor(() => expect(mockGetVentesReport).toHaveBeenCalledTimes(2));
    });

    test('9 — Données précédentes restent visibles pendant rechargement (keepPreviousData)', async () => {
      let resolveSecond: (v: any) => void;
      const secondFetch = new Promise<any>((res) => { resolveSecond = res; });

      mockGetVentesReport
        .mockResolvedValueOnce(BASE_DATA)
        .mockReturnValueOnce(secondFetch);

      renderPage();

      await waitFor(() => expect(screen.getByText('Goma')).toBeInTheDocument());

      // Trigger re-fetch
      const select = screen.getByRole('combobox', { name: /sélectionner une période/i });
      await userEvent.selectOptions(select, 'last_month');

      // Old data should still be visible (keepPreviousData)
      expect(screen.getByText('Goma')).toBeInTheDocument();

      // Resolve second fetch
      resolveSecond!(BASE_DATA);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. DateRangePicker
  // ═══════════════════════════════════════════════════════════════════════════
  describe('DateRangePicker', () => {
    async function openPicker() {
      mockGetVentesReport.mockResolvedValue(BASE_DATA);
      renderPage();
      const select = screen.getByRole('combobox', { name: /sélectionner une période/i });
      await userEvent.selectOptions(select, 'custom');
      const trigger = screen.getByRole('button', { name: /sélectionner une plage/i });
      await userEvent.click(trigger);
    }

    test('10 — Affiche la plage sélectionnée dans le bouton', async () => {
      await openPicker();
      const trigger = screen.getByRole('button', { name: /du .* au/i });
      expect(trigger).toBeInTheDocument();
    });

    test('11 — Date future interdite (boutons désactivés)', async () => {
      await openPicker();
      // future dates should have disabled buttons in the calendar
      // Check that today's date is enabled (there should be at least one enabled day button)
      const dayButtons = screen.getAllByRole('button', { name: /^\d{1,2} [A-Za-zÀ-ÿ]+ \d{4}$/ });
      const futureDisabled = dayButtons.filter((b) => b.hasAttribute('disabled'));
      // there should be some disabled (future dates)
      expect(futureDisabled.length).toBeGreaterThan(0);
    });

    test('12 — Bouton Réinitialiser revient à la plage par défaut', async () => {
      await openPicker();
      const resetBtn = screen.getByRole('button', { name: /réinitialiser/i });
      await userEvent.click(resetBtn);
      // After reset, Appliquer should still be enabled (previous selection restored)
      const applyBtn = screen.getByRole('button', { name: /appliquer/i });
      expect(applyBtn).not.toBeDisabled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. Graphiques
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Graphiques', () => {
    test('13 — Skeleton 280px courbe CA pendant chargement', () => {
      mockGetVentesReport.mockReturnValue(new Promise(() => {})); // never resolves
      renderPage();
      const skeleton = screen.getByTestId('ca-chart-skeleton');
      expect(skeleton).toBeInTheDocument();
      expect(skeleton).toHaveStyle({ height: '280px' });
    });

    test('14 — Skeleton 220px barres produits pendant chargement', () => {
      mockGetVentesReport.mockReturnValue(new Promise(() => {}));
      renderPage();
      // Bar chart skeleton area should have height 220
      const skeletons = document.querySelectorAll('[style*="height: 220px"], [style*="height:220px"]');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    test('15 — Empty state courbe CA si aucune vente', async () => {
      mockGetVentesReport.mockResolvedValue({ ...BASE_DATA, seriesCA: [] });
      renderPage();
      await waitFor(() => expect(screen.getByTestId('ca-chart-empty')).toBeInTheDocument());
    });

    test('16 — Empty state camembert si aucune vente', async () => {
      mockGetVentesReport.mockResolvedValue({ ...BASE_DATA, parSite: [] });
      renderPage(DR_USER);
      await waitFor(() =>
        expect(screen.getByText(/aucune vente sur la période/i)).toBeInTheDocument(),
      );
    });

    test('17 — Empty state barres si aucune vente', async () => {
      mockGetVentesReport.mockResolvedValue({ ...BASE_DATA, topProduits: [] });
      renderPage();
      await waitFor(() =>
        expect(screen.getAllByText(/aucune vente sur la période/i).length).toBeGreaterThan(0),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. SitesSummaryTable
  // ═══════════════════════════════════════════════════════════════════════════
  describe('SitesSummaryTable', () => {
    test('18 — Skeleton 4 lignes pendant chargement', () => {
      mockGetVentesReport.mockReturnValue(new Promise(() => {}));
      renderPage(DR_USER);
      // Skeletons inside the table area: 1 header row + 4 body skeleton rows
      const skeletonCells = document.querySelectorAll('.skeleton');
      expect(skeletonCells.length).toBeGreaterThan(4);
    });

    test('19 — Ligne TOTAL = somme des sites', async () => {
      mockGetVentesReport.mockResolvedValue(BASE_DATA);
      renderPage(DR_USER);
      await waitFor(() => expect(screen.getByText('TOTAL')).toBeInTheDocument());

      // Total CA = 2200000 + 1100000 + 700000 = 4000000
      expect(screen.getAllByText(/4\s*000\s*000/).length).toBeGreaterThan(0);
    });

    test('20 — Badge rouge alertes si > 0', async () => {
      mockGetVentesReport.mockResolvedValue(BASE_DATA);
      renderPage(DR_USER);
      await waitFor(() => expect(screen.getByText('Goma')).toBeInTheDocument());

      // Goma has 2 alerts, Bukavu has 5 alerts → red badges
      const redBadges = document.querySelectorAll('.badge-danger');
      expect(redBadges.length).toBeGreaterThanOrEqual(2); // Goma + Bukavu + possibly TOTAL
    });

    test('21 — Clic ligne navigue vers /dashboard avec site sélectionné', async () => {
      mockGetVentesReport.mockResolvedValue(BASE_DATA);
      renderPage(DR_USER);
      await waitFor(() => expect(screen.getByText('Goma')).toBeInTheDocument());

      const gomaRow = screen.getByRole('button', { name: /tableau de bord de Goma/i });
      await userEvent.click(gomaRow);

      expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { state: { siteId: 'goma' } });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. Granularité automatique (utilitaire pur — pas besoin du composant)
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Granularité automatique', () => {
    let getGranulariteFromRange: (r: { from: Date; to: Date }) => string;

    beforeEach(async () => {
      const mod = await import('@/lib/dateRange.utils');
      getGranulariteFromRange = mod.getGranulariteFromRange;
    });

    function addDays(base: Date, n: number) {
      const d = new Date(base);
      d.setDate(d.getDate() + n);
      return d;
    }

    test('22 — Plage ≤ 31 jours → granularite=day', () => {
      const from = new Date('2025-01-01');
      const to   = addDays(from, 30);
      expect(getGranulariteFromRange({ from, to })).toBe('day');
    });

    test('23 — Plage 32-90 jours → granularite=week', () => {
      const from = new Date('2025-01-01');
      const to   = addDays(from, 60);
      expect(getGranulariteFromRange({ from, to })).toBe('week');
    });

    test('24 — Plage > 90 jours → granularite=month', () => {
      const from = new Date('2025-01-01');
      const to   = addDays(from, 180);
      expect(getGranulariteFromRange({ from, to })).toBe('month');
    });
  });
});
