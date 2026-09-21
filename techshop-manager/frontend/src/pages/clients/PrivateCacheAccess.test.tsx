import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import App from '@/App';
import ClientDetailPage from './ClientDetailPage';
import OnboardingFormationPage from './OnboardingFormationPage';
import OnboardingActivationPage from './OnboardingActivationPage';
import { useAuthStore } from '@/store/auth.store';
import { useUIStore } from '@/store/ui.store';
import type { AuthUser } from '@/types';
import toast from 'react-hot-toast';
import { AxiosError, AxiosHeaders } from 'axios';

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
const { toBlob, createObjectURL } = vi.hoisted(() => ({ toBlob: vi.fn(), createObjectURL: vi.fn(() => 'blob:synthetic') }));
vi.mock('@/lib/api', () => ({ api: { get, post }, getErrorMessage: () => 'Accès refusé' }));
vi.mock('@/lib/offline', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/offline')>(), getPendingVentes: async () => [] }));
vi.mock('@react-pdf/renderer', async importOriginal => ({ ...await importOriginal<typeof import('@react-pdf/renderer')>(), pdf: () => ({ toBlob }) }));

const site = { id: 'foreign-site', nom: 'Synthetic site' };
const client = {
  id: 'private-client', prenom: 'Synthetic', nom: 'FOREIGN-PRIVATE', telephone: '+243900000099', statut: 'EN_COURS',
  site, siteInscriptionId: site.id, createdAt: '2026-09-19T12:00:00Z', dateInscription: '2026-09-19T12:00:00Z', codeParrain: 'EBN-TEST',
  onboardingEtapes: [{ etape: 'RECIT', statut: 'COMPLETE', completeeAt: '2026-09-19T12:00:00Z', montant: 7, modePaiement: 'CASH' }],
  ventes: [], membre: null, parrain: null, hasTransactions: false,
};
const sale = {
  id: 'private-sale', numeroVente: 'FOREIGN-PRIVATE', createdAt: '2026-09-19T12:00:00Z', statut: 'VALIDE',
  client, agent: { id: 'previous', nom: 'Synthetic agent' }, site, lignes: [], montantNet: 10, montantBrut: 10, modePaiement: 'CASH',
};
const credit = { avoir: {
  id: 'private-return', numeroAvoir: 'FOREIGN-PRIVATE', dateEmission: '2026-09-19T12:00:00Z', motif: 'AUTRE', modeRemboursement: 'CASH',
  montantRembourse: 10, montantHT: 10, montantTVA: 0, tauxTVA: 0, lignes: [], vente: { ...sale, dateVente: sale.createdAt },
} };
const list = { data: [client], meta: { page: 1, limit: 25, total: 1, totalPages: 1 } };
const queue = {
  queue: [{ ...client, etapeActuelle: 'RECIT', prochainRoute: '/clients/private-client/recit', createdBy: null,
    etapes: { recit: { statut: 'EN_ATTENTE' }, fiche: null, activation: null } }],
  stats: { total: 1, ficheEnAttente: 0, activationEnAttente: 0 },
};
const payments = {
  paiements: [{ id: 'private-payment', etape: 'RECIT', montant: 7, modePaiement: 'CASH', referenceTransaction: null,
    completeeAt: '2026-09-19T12:00:00Z', client, site, agent: null }],
  meta: { total: 1, page: 1, totalPages: 1, limit: 50 },
  kpis: { totalEncaisse: 7, totalEncaisseJour: 7, nbRecitJour: 1, nbFicheJour: 0, montantRecitJour: 7, montantFicheJour: 0 },
};

const views = [
  { path: '/clients/private-client', endpoint: '/clients/private-client', data: client },
  { path: '/clients/private-client/recit', endpoint: '/clients/private-client', data: client },
  { path: '/clients/private-client/formation', endpoint: '/clients/private-client', data: client },
  { path: '/clients/private-client/fiche', endpoint: '/clients/private-client', data: client },
  { path: '/clients/private-client/activate', endpoint: '/clients/private-client', data: client },
  { path: '/clients', endpoint: '/clients', data: list },
  { path: '/clients/queue', endpoint: '/clients/onboarding-queue', data: queue },
  { path: '/clients/paiements', endpoint: '/clients/paiements-onboarding', data: payments },
  { path: '/sales/private-sale/receipt', endpoint: '/ventes/private-sale', data: sale },
  { path: '/sales/retours/private-return/avoir', endpoint: '/ventes/retours/private-return/avoir', data: credit },
];
const manager: AuthUser = { id: 'manager', name: 'Manager', role: 'GERANT', siteId: 'foreign-site' };
const cashier: AuthUser = { id: 'cashier', name: 'Cashier', role: 'CAISSIER', siteId: 'local-site' };

function deferred() {
  let resolve!: (value: { data: unknown }) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<{ data: unknown }>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  void promise.catch(() => undefined);
  return { promise, resolve, reject };
}

function ancillary(url: string) {
  if (url === '/sites') return { data: { data: [site] } };
  if (url === '/config') return { data: { montantRecit: 7, montantFiche: 11 } };
  if (url === '/produits/search') return { data: { produits: [] } };
  return { data: {} };
}

beforeEach(() => {
  useAuthStore.setState(useAuthStore.getInitialState(), true);
  useUIStore.setState({ selectedSiteId: null, isOnline: true });
  get.mockReset(); post.mockReset();
  toBlob.mockReset(); createObjectURL.mockClear();
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL = createObjectURL;
    static revokeObjectURL() {}
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  vi.spyOn(window, 'print').mockImplementation(() => undefined);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function mount(view: typeof views[number], actor = manager, page?: React.ReactNode) {
  useAuthStore.getState().setAuth(actor, 'token');
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 300000, refetchOnWindowFocus: false } } });
  window.history.replaceState({}, '', view.path);
  render(<QueryClientProvider client={queryClient}>{page
    ? <MemoryRouter initialEntries={['/clients/private-client']}><Routes><Route path="/clients/:id" element={page} /></Routes></MemoryRouter>
    : <App />}</QueryClientProvider>);
  return queryClient;
}

function expectPrivateHidden() {
  expect(screen.queryAllByText(/FOREIGN-PRIVATE/i)).toHaveLength(0);
  for (const button of screen.queryAllByRole('button', { name: /Imprimer|Envoyer par SMS/ })) expect(button).toBeDisabled();
  expect(window.print).not.toHaveBeenCalled();
}

const changes = [
  { name: 'identity', previous: manager, next: cashier, token: 'next' },
  { name: 'site with unchanged token', previous: { ...cashier, siteId: 'foreign-site' }, next: cashier, token: 'token' },
  { name: 'role with unchanged token', previous: manager, next: { ...manager, role: 'CAISSIER' as const }, token: 'token' },
  { name: 'logout/login with reused token', previous: cashier, next: cashier, token: 'token', logout: true },
];

describe('client detail access-denied message', () => {
  function failRequest(status: number) {
    get.mockRejectedValue(new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_REQUEST', undefined, undefined, {
      status, statusText: status === 403 ? 'Forbidden' : 'Internal Server Error',
      data: { message: 'Technical server message' }, headers: {}, config: { headers: new AxiosHeaders() },
    }));
  }

  it.each(['CAISSIER', 'AGENT'] as const)('explains site restrictions to %s without exposing technical errors or private data', async role => {
    failRequest(403);
    mount(views[0], { ...cashier, role }, <ClientDetailPage />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Vous n’avez pas accès à ce dossier.');
    expect(alert).toHaveTextContent('Vous pouvez uniquement consulter les clients de votre site.');
    expect(alert).toHaveTextContent('Contactez votre responsable si nécessaire.');
    expect(alert).not.toHaveTextContent(/403|Request failed|Technical server message|Erreur réseau/);
    expect(screen.queryByRole('button', { name: 'Réessayer' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Retour à la liste' })).toHaveAttribute('href', '/clients');
    expectPrivateHidden();
    expect(post).not.toHaveBeenCalled();
  });

  it('does not describe a regional administrator as limited to one site', async () => {
    failRequest(403);
    mount(views[0], { id: 'regional', name: 'Responsable', role: 'DIRECTEUR_REGIONAL', siteId: null }, <ClientDetailPage />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Vous n’avez pas accès à ce dossier.');
    expect(alert).toHaveTextContent('Contactez votre responsable si nécessaire.');
    expect(alert).not.toHaveTextContent('uniquement consulter les clients de votre site');
    expect(alert).not.toHaveTextContent(/403|Request failed|Technical server message/);
  });

  it('keeps retry available for a server failure rather than reporting an access denial', async () => {
    failRequest(500);
    mount(views[0], cashier, <ClientDetailPage />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Impossible de charger ce client.');
    expect(alert).not.toHaveTextContent('Vous n’avez pas accès à ce dossier.');
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  });
});

describe.each(views)('retained QueryClient on actual $path', view => {
  it.each(changes)('withholds fresh private data and printing after $name', async change => {
    get.mockImplementation(async (url: string) => url === view.endpoint ? { data: view.data } : ancillary(url));
    mount(view, change.previous);
    expect((await screen.findAllByText(/FOREIGN-PRIVATE/i)).length).toBeGreaterThan(0);
    const current = deferred();
    get.mockImplementation((url: string) => url === view.endpoint ? current.promise : Promise.resolve(ancillary(url)));
    act(() => {
      if (change.logout) useAuthStore.getState().logout();
      useAuthStore.getState().setAuth(change.next, change.token);
    });
    expectPrivateHidden();
    await act(async () => { current.reject({ response: { status: 403 } }); });
    expectPrivateHidden();
  });

  it('disables direct private reads and print after assigned-site removal', async () => {
    get.mockImplementation(async (url: string) => url === view.endpoint ? { data: view.data } : ancillary(url));
    mount(view, cashier);
    expect((await screen.findAllByText(/FOREIGN-PRIVATE/i)).length).toBeGreaterThan(0);
    get.mockClear();
    act(() => useAuthStore.getState().setAuth({ ...cashier, siteId: null }, 'token'));
    expectPrivateHidden();
    expect(get.mock.calls.filter(([url]) => url === view.endpoint)).toHaveLength(0);
  });

  it.each(['before', 'after'])('ignores old private responses settling %s current denial', async order => {
    const previous = deferred();
    const current = deferred();
    get.mockImplementation((url: string) => url !== view.endpoint ? Promise.resolve(ancillary(url))
      : useAuthStore.getState().user?.id === manager.id ? previous.promise : current.promise);
    const queryClient = mount(view);
    await waitFor(() => expect(get.mock.calls.some(([url]) => url === view.endpoint)).toBe(true));
    act(() => useAuthStore.getState().setAuth(cashier, 'next'));
    if (order === 'after') await act(async () => { current.reject({ response: { status: 403 } }); });
    await act(async () => { previous.resolve({ data: view.data }); });
    expectPrivateHidden();
    if (order === 'before') await act(async () => { current.reject({ response: { status: 403 } }); });
    expectPrivateHidden();
    expect(queryClient.getQueryCache().getAll().some(query => query.state.data === view.data)).toBe(true);
  });
});

describe('authorized controls and print timing', () => {
  it.each(['site', 'role', 'logout'])('discards a pending client PDF after %s changes', async change => {
    let finish!: (blob: Blob) => void;
    toBlob.mockImplementation(() => new Promise<Blob>(resolve => { finish = resolve; }));
    get.mockImplementation(async (url: string) => url === '/clients/private-client'
      ? { data: { ...client, statut: 'ACTIF' } } : ancillary(url));
    mount(views[0], cashier);
    await userEvent.click(await screen.findByRole('button', { name: 'Fiche PDF' }));
    expect(toBlob).toHaveBeenCalledTimes(1);
    get.mockImplementation(() => new Promise(() => undefined));
    act(() => {
      if (change === 'logout') useAuthStore.getState().logout();
      else useAuthStore.getState().setAuth({ ...cashier, ...(change === 'site' ? { siteId: null } : { role: 'AGENT' as const }) }, 'token');
    });
    await act(async () => { finish(new Blob(['FOREIGN-PRIVATE'])); });
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
  });

  it('downloads a client PDF within the same authorized partition', async () => {
    toBlob.mockResolvedValue(new Blob(['Synthetic PDF']));
    get.mockImplementation(async (url: string) => url === '/clients/private-client'
      ? { data: { ...client, statut: 'ACTIF' } } : ancillary(url));
    mount(views[0], cashier);
    await userEvent.click(await screen.findByRole('button', { name: 'Fiche PDF' }));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
  });

  it.each([views[0], views[5], views[8], views[9]])('preserves AGENT reads on $path', async view => {
    get.mockImplementation(async (url: string) => url === view.endpoint ? { data: view.data } : ancillary(url));
    mount(view, { ...cashier, role: 'AGENT' });
    expect((await screen.findAllByText(/FOREIGN-PRIVATE/i)).length).toBeGreaterThan(0);
    if (view === views[8] || view === views[9]) {
      await userEvent.click(screen.getByRole('button', { name: /Imprimer/ }));
      expect(window.print).toHaveBeenCalledTimes(1);
    }
  });

  it.each([<ClientDetailPage />, <OnboardingFormationPage />])('preserves the actual FORMATEUR consumer without an assigned site', async page => {
    get.mockImplementation(async (url: string) => url === '/clients/private-client' ? { data: client } : ancillary(url));
    mount(views[0], { id: 'trainer', name: 'Trainer', role: 'FORMATEUR', siteId: null }, page);
    expect((await screen.findAllByText(/FOREIGN-PRIVATE/i)).length).toBeGreaterThan(0);
  });

  it('preserves same-partition list placeholders and invalidation prefixes', async () => {
    get.mockImplementation(async (url: string) => url === '/clients' ? { data: list } : ancillary(url));
    const queryClient = mount(views[5], cashier);
    await screen.findAllByText(/FOREIGN-PRIVATE/i);
    const pending = deferred();
    get.mockImplementation((url: string) => url === '/clients' ? pending.promise : Promise.resolve(ancillary(url)));
    await userEvent.type(screen.getByPlaceholderText('Nom, téléphone, matricule…'), 'Synthetic');
    await waitFor(() => expect(get.mock.calls.filter(([url]) => url === '/clients').length).toBe(2));
    expect(screen.getAllByText(/FOREIGN-PRIVATE/i).length).toBeGreaterThan(0);
    await act(async () => { pending.resolve({ data: list }); });
    get.mockClear();
    get.mockResolvedValue({ data: list });
    await act(async () => { await queryClient.invalidateQueries({ queryKey: ['clients'] }); });
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('cancels receipt auto-print when authorization changes before the timer fires', async () => {
    get.mockImplementation(async (url: string) => url === '/ventes/private-sale' ? { data: sale } : ancillary(url));
    mount({ ...views[8], path: `${views[8].path}?autoprint=true` });
    await screen.findAllByText(/FOREIGN-PRIVATE/i);
    get.mockImplementation(() => new Promise(() => undefined));
    act(() => useAuthStore.getState().setAuth(cashier, 'next'));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 650)); });
    expectPrivateHidden();
  });
});

describe('activation success-screen PDF authorization', () => {
  async function activateClient() {
    const product = { id: 'activation-product', nom: 'Activation product', sku: 'SYNTHETIC', prixVente: 30 };
    const activationClient = {
      ...client, site: { id: cashier.siteId, nom: 'Synthetic local site' }, siteInscriptionId: cashier.siteId,
      onboardingEtapes: [...client.onboardingEtapes, { etape: 'FICHE', statut: 'COMPLETE', montant: 11, modePaiement: 'CASH' }],
    };
    get.mockImplementation(async (url: string) => {
      if (url === '/clients/private-client') return { data: activationClient };
      if (url === '/produits/search') return { data: { produits: [product] } };
      return ancillary(url);
    });
    post.mockResolvedValue({ data: { ...activationClient, statut: 'ACTIF', dateActivation: '2026-09-20T12:00:00Z' } });
    mount(views[4], cashier, <OnboardingActivationPage />);
    fireEvent.change(await screen.findByLabelText('Rechercher un produit'), { target: { value: 'Activation' } });
    await userEvent.click(await screen.findByRole('option', { name: /Activation product/ }));
    await userEvent.click(screen.getByRole('button', { name: /Activer le compte et générer/ }));
    await userEvent.click(screen.getByRole('button', { name: '✓ Activer le compte' }));
    expect(await screen.findByRole('heading', { name: 'Compte activé avec succès !' })).toBeInTheDocument();
    vi.spyOn(toast, 'success').mockImplementation(() => 'synthetic-toast');
    vi.spyOn(toast, 'error').mockImplementation(() => 'synthetic-toast');
  }

  function pendingBlob() {
    let resolve!: (blob: Blob) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<Blob>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
    toBlob.mockReturnValue(promise);
    return { resolve, reject };
  }

  function changeAuthorization(change: string) {
    if (change === 'logout') useAuthStore.getState().logout();
    else useAuthStore.getState().setAuth({
      ...cashier, ...(change === 'site' ? { siteId: 'another-site' } : { role: 'AGENT' as const }),
    }, 'token');
  }

  it.each(['role', 'site', 'logout'])('discards deferred success without stale state or toast after %s changes', async change => {
    await activateClient();
    const pending = pendingBlob();
    await userEvent.click(screen.getByRole('button', { name: 'Générer la Fiche PDF' }));
    expect(toBlob).toHaveBeenCalledTimes(1);
    get.mockImplementation(() => new Promise(() => undefined));
    act(() => changeAuthorization(change));
    await act(async () => { pending.resolve(new Blob(['FOREIGN-PRIVATE'])); });
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(screen.queryByText(/Fiche téléchargée/)).not.toBeInTheDocument();
  });

  it.each(['role', 'site', 'logout'])('suppresses deferred failure toast after %s changes', async change => {
    await activateClient();
    const pending = pendingBlob();
    await userEvent.click(screen.getByRole('button', { name: 'Générer la Fiche PDF' }));
    get.mockImplementation(() => new Promise(() => undefined));
    act(() => changeAuthorization(change));
    await act(async () => { pending.reject(new Error('Synthetic renderer failure')); });
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('checks the live authorization before starting generation', async () => {
    await activateClient();
    toBlob.mockResolvedValue(new Blob(['FOREIGN-PRIVATE']));
    const button = screen.getByRole('button', { name: 'Générer la Fiche PDF' });
    get.mockImplementation(() => new Promise(() => undefined));
    await act(async () => {
      changeAuthorization('role');
      fireEvent.click(button);
    });
    expect(toBlob).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('downloads deferred success and restores controls within the authorized partition', async () => {
    await activateClient();
    const pending = pendingBlob();
    await userEvent.click(screen.getByRole('button', { name: 'Générer la Fiche PDF' }));
    expect(screen.getByRole('button', { name: 'Génération…' })).toBeDisabled();
    expect(createObjectURL).not.toHaveBeenCalled();
    await act(async () => { pending.resolve(new Blob(['Synthetic activation PDF'])); });
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith('Fiche générée avec succès !');
    expect(toast.error).not.toHaveBeenCalled();
    expect(screen.getByText(/Fiche téléchargée/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Générer la Fiche PDF' })).toBeEnabled();
  });

  it('reports a current-partition renderer failure and restores controls', async () => {
    await activateClient();
    const pending = pendingBlob();
    await userEvent.click(screen.getByRole('button', { name: 'Générer la Fiche PDF' }));
    await act(async () => { pending.reject(new Error('Synthetic renderer failure')); });
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('Erreur lors de la génération du PDF.');
    expect(screen.queryByText(/Fiche téléchargée/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Générer la Fiche PDF' })).toBeEnabled();
  });
});
