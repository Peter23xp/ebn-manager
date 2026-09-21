import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from '@/App';
import { useAuthStore } from '@/store/auth.store';
import { useUIStore } from '@/store/ui.store';
import type { Role } from '@/types';

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({ api: { get, post }, getErrorMessage: () => 'Erreur réseau' }));
vi.mock('@/lib/offline', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/offline')>(), getPendingVentes: async () => [], getCachedData: async () => null, cacheData: async () => undefined }));
vi.mock('react-chartjs-2', () => ({ Line: () => null }));

const site = { id: 'site-1', nom: 'Goma' };
const dossier = {
  id: 'draft', prenom: 'Alice', nom: 'Client', telephone: '+243900000001', statut: 'EN_COURS', site,
  siteInscriptionId: site.id, createdAt: '2026-09-19T12:00:00Z', dateInscription: '2026-09-19T12:00:00Z',
  onboardingEtapes: [{ etape: 'RECIT', statut: 'EN_ATTENTE', completeeAt: null, montant: null, modePaiement: null }],
  ventes: [], membre: null, parrain: null, hasTransactions: false,
};

beforeEach(() => {
  useUIStore.setState({ selectedSiteId: 'foreign-site', isOnline: true });
  get.mockReset(); post.mockReset();
  get.mockImplementation(async (url: string) => {
    if (url === '/sites') return { data: { data: [site, { id: 'foreign-site', nom: 'Site étranger' }] } };
    if (url === '/config') return { data: { montantRecit: 5000, montantFiche: 10000 } };
    if (url === '/clients/draft') return { data: dossier };
    if (url === '/clients/next-code') return { data: { nextCode: 'EBN-TEST' } };
    if (url === '/clients/onboarding-queue') return { data: {
      queue: [{ ...dossier, etapeActuelle: 'RECIT', prochainRoute: '/clients/draft/recit', createdBy: null, etapes: { recit: { statut: 'EN_ATTENTE' }, fiche: { statut: 'EN_ATTENTE' }, activation: null } }],
      stats: { total: 1, ficheEnAttente: 0, activationEnAttente: 0 },
    } };
    if (url === '/clients/paiements-onboarding') return { data: { paiements: [], meta: { total: 0, totalPages: 0 }, kpis: { totalEncaisse: 0, totalEncaisseJour: 0, nbRecitJour: 0, nbFicheJour: 0, montantRecitJour: 0, montantFicheJour: 0 } } };
    if (url === '/clients') return { data: { data: [dossier], meta: { total: 1, page: 1, totalPages: 1, limit: 25 } } };
    if (url === '/ventes') return { data: { ventes: [], meta: { total: 0, totalPages: 0 }, kpis: { totalCA: 0, nbVentes: 0, panierMoyen: 0 } } };
    if (url === '/ventes/sale') return { data: { id: 'sale', numeroVente: 'V-TEST', createdAt: new Date().toISOString(), statut: 'VALIDE', agent: { id: 'cashier', nom: 'Caissier' }, site, lignes: [], montantNet: 10, montantBrut: 10, modePaiement: 'CASH' } };
    if (url === '/produits/search') return { data: { produits: [] } };
    if (url === '/produits/categories') return { data: { categories: [] } };
    if (url.startsWith('/dashboard/stats')) return { data: { clientsActifs: 1, ventesJour: 0, alertesStock: 0, rupturesStock: 0, nouveauxFilleuls: 0, trends: {} } };
    if (url.startsWith('/dashboard/sales-chart')) return { data: { labels: [], datasets: [] } };
    if (url.startsWith('/dashboard/recent-transactions')) return { data: { transactions: [{ id: 'sale', numeroVente: 'V-TEST', clientNom: 'Alice Client', montant: 10, statut: 'VALIDE', createdAt: new Date().toISOString() }] } };
    if (url.startsWith('/dashboard/stock-alerts')) return { data: { alerts: [] } };
    if (url.includes('notifications')) return { data: {} };
    throw new Error(`Unexpected request: ${url}`);
  });
});
afterEach(cleanup);

function renderRoute(path: string, role: Role, siteId: string | null = 'site-1') {
  useAuthStore.getState().setAuth({ id: role, name: role, role, siteId: siteId ?? undefined, siteName: siteId ? 'Goma' : undefined }, 'token');
  window.history.replaceState({}, '', path);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  queryClient.setQueryData(['sites'], { data: [{ id: 'foreign-site', nom: 'Site étranger', actif: true }] });
  render(<QueryClientProvider client={queryClient}><App /></QueryClientProvider>);
  return userEvent.setup();
}

describe('Actual staff routes', () => {
  it.each(['/clients/draft/recit', '/clients/draft/fiche', '/clients/draft/activate', '/sales/pos', '/clients/paiements', '/sales', '/sales/sale'])('rejects an agent at %s without mounting payment', async path => {
    renderRoute(path, 'AGENT');
    expect(await screen.findByRole('heading', { name: 'Tableau de bord' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/dashboard');
    expect(screen.queryByRole('radio', { name: 'Cash' })).not.toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it.each([
    ['/clients/draft/recit', 'Compléter le récit'], ['/clients/draft/fiche', 'Fiche client'],
    ['/clients/draft/activate', 'Activation du compte'], ['/clients/paiements', 'Paiements onboarding'],
    ['/sales', 'Historique des ventes'], ['/sales/sale', 'V-TEST'],
  ])('allows the cashier into %s', async (path, heading) => {
    renderRoute(path, 'CAISSIER');
    expect(await screen.findByRole('heading', { name: heading }, { timeout: 5000 })).toBeInTheDocument();
    expect(window.location.pathname).toBe(path);
    expect(get).not.toHaveBeenCalledWith('/sites');
  });

  it('mounts the actual POS on the cashier site, not a cached foreign option', async () => {
    renderRoute('/sales/pos', 'CAISSIER');
    await act(async () => { await vi.dynamicImportSettled(); });
    expect(await screen.findByText('CAISSE — Goma')).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Site étranger' })).not.toBeInTheDocument();
    await waitFor(() => expect(get).toHaveBeenCalledWith('/produits/search', { params: expect.objectContaining({ siteId: 'site-1' }) }));
    expect(get).not.toHaveBeenCalledWith('/sites');
  });

  it.each(['/sales/returns', '/sales/journal-retours', '/sales/retours/return/ecritures'])('keeps returns manager-only at %s', async path => {
    renderRoute(path, 'CAISSIER');
    expect(await screen.findByRole('heading', { name: 'Tableau de bord' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/dashboard');
  });

  it.each<Role>(['CAISSIER', 'GERANT', 'DIRECTEUR_REGIONAL', 'SUPER_ADMIN'])('shows sale returns only to managers (%s)', async role => {
    renderRoute('/sales/sale', role);
    expect(await screen.findByRole('heading', { name: 'V-TEST' })).toBeInTheDocument();
    const button = screen.queryByRole('button', { name: /Initier un retour/ });
    if (role === 'CAISSIER') expect(button).not.toBeInTheDocument();
    else expect(button).toBeInTheDocument();
  });

  it('takes agents from the queue to consultation, never to payment, with pending indicators', async () => {
    const user = renderRoute('/clients/queue', 'AGENT');
    const row = (await screen.findByText('Alice Client')).closest('tr')!;
    expect(within(row).getByText('En attente de passage en caisse')).toBeInTheDocument();
    expect(within(row).getByText('Récit')).not.toHaveClass('text-success');
    expect(within(row).getByText('Fiche')).not.toHaveClass('text-success');
    await user.click(within(row).getByRole('button', { name: 'Ouvrir le dossier' }));
    await act(async () => { await vi.dynamicImportSettled(); });
    expect(await screen.findByRole('heading', { name: 'Alice Client' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/clients/draft');
    expect(screen.getByText('En attente de passage en caisse')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Continuer/ })).not.toBeInTheDocument();
    expect(get).not.toHaveBeenCalledWith('/sites');
  });

  it('lets the cashier resume from the same queue on the assigned site', async () => {
    const user = renderRoute('/clients/queue', 'CAISSIER');
    expect(await screen.findByText('Récit à encaisser')).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Tous les sites' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Compléter le récit' }));
    expect(await screen.findByRole('heading', { name: 'Compléter le récit' })).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith('/clients/onboarding-queue', { params: { siteId: 'site-1' } });
    expect(get).not.toHaveBeenCalledWith('/sites');
  });

  it('does not mark an unpaid récit as complete on fiche or activation', async () => {
    const user = renderRoute('/clients/draft/fiche', 'CAISSIER');
    expect(await screen.findByText('Récit non complété')).toBeInTheDocument();
    expect(screen.queryByText(/Récit acheté le/)).not.toBeInTheDocument();
    expect(within(screen.getByRole('navigation', { name: "Étapes d'onboarding" })).getByText('Récit')).not.toHaveClass('text-success');
    expect(screen.getByRole('button', { name: /Valider l'achat de la Fiche/ })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /Reprendre depuis le Récit/ }));
    expect(await screen.findByRole('heading', { name: 'Compléter le récit' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/clients/draft/recit');
  });

  it('keeps activation prerequisites linked to the existing unpaid dossier', async () => {
    renderRoute('/clients/draft/activate', 'CAISSIER');
    expect(await screen.findByRole('link', { name: /Compléter l.onboarding/ })).toHaveAttribute('href', '/clients/draft/recit');
    const stepper = screen.getByRole('navigation', { name: "Étapes d'onboarding" });
    expect(within(stepper).getByText('Récit')).not.toHaveClass('text-success');
    expect(within(stepper).getByText('Fiche')).not.toHaveClass('text-success');
  });

  it('preserves completed indicators and continuation for an already paid dossier', async () => {
    const original = get.getMockImplementation()!;
    get.mockImplementation(async (url: string) => url === '/clients/draft' ? { data: { ...dossier, onboardingEtapes: [{ etape: 'RECIT', statut: 'COMPLETE', montant: 5000, completeeAt: '2026-09-19T12:00:00Z' }] } } : original(url));
    renderRoute('/clients/draft/fiche', 'CAISSIER');
    expect(await screen.findByText(/Récit acheté le/)).toBeInTheDocument();
    const stepper = screen.getByRole('navigation', { name: "Étapes d'onboarding" });
    expect(within(stepper).getByText('Récit')).toHaveClass('text-success');
    expect(within(stepper).getByRole('link', { name: "Retour à l'étape Récit" })).toHaveAttribute('href', '/clients/draft/recit');
  });

  it.each<Role>(['AGENT', 'CAISSIER'])('keeps the client list on the authenticated site for %s', async role => {
    renderRoute('/clients', role);
    expect(await screen.findByRole('heading', { name: 'Clients' })).toBeInTheDocument();
    await waitFor(() => expect(get).toHaveBeenCalledWith('/clients', { params: expect.objectContaining({ siteId: 'site-1' }) }));
    expect(screen.queryByRole('option', { name: 'Archivé' })).not.toBeInTheDocument();
  });

  it.each<Role>(['AGENT', 'CAISSIER'])('keeps purchase consultation without forbidden sale links for %s', async role => {
    const original = get.getMockImplementation()!;
    get.mockImplementation(async (url: string) => url === '/clients/draft' ? { data: { ...dossier, ventes: [{ id: 'sale', numeroVente: 'V-CLIENT', createdAt: new Date().toISOString(), lignes: [], montantNet: 10, montantBrut: 10, modePaiement: 'CASH', statut: 'VALIDE' }] } } : original(url));
    renderRoute('/clients/draft?tab=achats', role);
    expect(await screen.findByRole('heading', { name: 'Alice Client' })).toBeInTheDocument();
    expect(screen.getByText('V-CLIENT')).toBeInTheDocument();
    const link = screen.queryByRole('link', { name: 'V-CLIENT' });
    if (role === 'AGENT') expect(link).not.toBeInTheDocument();
    else expect(link).toHaveAttribute('href', '/sales/sale');
  });

  it('does not allow a cashier with no assigned site to choose a foreign POS site', async () => {
    renderRoute('/sales/pos', 'CAISSIER', null);
    await waitFor(() => expect(window.location.pathname).toBe('/sales/pos'));
    expect((await screen.findAllByText(/site.*responsable/i)).length).toBeGreaterThan(0);
    expect(screen.queryByRole('option', { name: 'Site étranger' })).not.toBeInTheDocument();
    expect(get).not.toHaveBeenCalledWith('/sites');
  });

  it('preserves manager site selection but removes cached options after cashier authentication', async () => {
    renderRoute('/clients/queue', 'GERANT');
    expect(await screen.findByRole('option', { name: 'Tous les sites' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Site étranger' })).toBeInTheDocument();
    act(() => useAuthStore.getState().setAuth({ id: 'cashier', name: 'Caissier', role: 'CAISSIER', siteId: 'site-1' }, 'new-token'));
    expect(screen.queryByRole('option', { name: 'Site étranger' })).not.toBeInTheDocument();
  });

  it('does not count pending amounts as money already paid before activation', async () => {
    const original = get.getMockImplementation()!;
    get.mockImplementation(async (url: string) => url === '/clients/draft' ? { data: { ...dossier, onboardingEtapes: [{ etape: 'RECIT', statut: 'EN_ATTENTE', montant: 5000, modePaiement: 'CASH' }] } } : original(url));
    renderRoute('/clients/draft/activate', 'CAISSIER');
    const label = await screen.findByText('Total payé');
    expect(label.nextElementSibling).toHaveTextContent(/^0 CDF$/);
  });

  it.each(['EN_ATTENTE', 'COMPLETE'])('keeps formation consultable by the agent without payment links (%s)', async statut => {
    const original = get.getMockImplementation()!;
    get.mockImplementation(async (url: string) => url === '/clients/draft' ? { data: { ...dossier, onboardingEtapes: [{ etape: 'RECIT', statut, montant: statut === 'COMPLETE' ? 5000 : null }] } } : original(url));
    renderRoute('/clients/draft/formation', 'AGENT');
    expect(await screen.findByRole('heading', { name: 'Formation' })).toBeInTheDocument();
    const stepper = screen.getByRole('navigation', { name: "Étapes d'onboarding" });
    expect(within(stepper).queryByRole('link')).not.toBeInTheDocument();
    if (statut === 'EN_ATTENTE') {
      expect(within(stepper).getByText('Récit')).not.toHaveClass('text-success');
      expect(screen.getByRole('link', { name: 'Ouvrir le dossier' })).toHaveAttribute('href', '/clients/draft');
    }
  });

  it.each([200, 409])('returns an agent to consultation after formation (%s)', async status => {
    const original = get.getMockImplementation()!;
    get.mockImplementation(async (url: string) => url === '/clients/draft' ? { data: { ...dossier, onboardingEtapes: [{ etape: 'RECIT', statut: 'COMPLETE', montant: 5000 }] } } : original(url));
    if (status === 409) post.mockRejectedValueOnce({ response: { status } });
    else post.mockResolvedValueOnce({ data: {} });
    const user = renderRoute('/clients/draft/formation', 'AGENT');
    await user.click(await screen.findByRole('checkbox', { name: /Je certifie/ }));
    await user.type(screen.getByLabelText(/Durée/), '45');
    await user.click(screen.getByRole('button', { name: /Valider la Formation/ }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(window.location.pathname).toBe('/clients/draft'));
    expect(await screen.findByRole('heading', { name: 'Alice Client' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/clients/draft');
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('uses the authenticated cashier site on dashboard despite a foreign UI selection', async () => {
    renderRoute('/dashboard', 'CAISSIER');
    await waitFor(() => expect(get).toHaveBeenCalledWith('/dashboard/stats?period=today&siteId=site-1'));
  });

  it('keeps dashboard shortcuts away from forbidden sales routes for agents', async () => {
    renderRoute('/dashboard', 'AGENT');
    expect(await screen.findByRole('heading', { name: 'Tableau de bord' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /V-TEST/ })).not.toBeInTheDocument();
    const main = screen.getByRole('main');
    expect(within(main).queryByRole('button', { name: /Voir tout/ })).not.toBeInTheDocument();
  });

  it('keeps the staff preparation route reachable after a fresh role change', async () => {
    renderRoute('/clients/new/recit', 'AGENT');
    expect(await screen.findByRole('button', { name: 'Enregistrer le dossier' })).toBeInTheDocument();
    act(() => useAuthStore.getState().setAuth({ id: 'cashier', name: 'Caissier', role: 'CAISSIER', siteId: 'site-1' }, 'new-token'));
    expect(await screen.findByLabelText('Montant payé * (CDF)')).toBeInTheDocument();
  });
});
