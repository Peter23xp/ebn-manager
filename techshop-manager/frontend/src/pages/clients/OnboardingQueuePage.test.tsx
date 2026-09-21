import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/auth.store';
import type { Role } from '@/types';
import OnboardingQueuePage from './OnboardingQueuePage';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', () => ({ api: { get } }));

const sites = [{ id: 'goma', nom: 'Goma', ville: 'Goma', actif: true }, { id: 'bukavu', nom: 'Bukavu', ville: 'Bukavu', actif: true }];
const clients = [
  { id: 'recit', prenom: 'Aline', nom: 'Kabeya', telephone: '+243900000001', site: sites[0], createdBy: { id: 'agent', nom: 'Patrick' }, createdAt: '2026-09-21T08:00:00Z', etapeActuelle: 'RECIT', prochainRoute: '/clients/recit/recit', etapes: { recit: { statut: 'EN_ATTENTE' }, fiche: null, activation: null } },
  { id: 'fiche', prenom: 'Rose', nom: 'Mukendi', telephone: '+243900000002', site: sites[0], createdBy: null, createdAt: '2026-09-20T08:00:00Z', etapeActuelle: 'FICHE', prochainRoute: '/clients/fiche/fiche', etapes: { recit: { statut: 'COMPLETE' }, fiche: { statut: 'EN_ATTENTE' }, activation: null } },
  { id: 'activation', prenom: 'Jonathan', nom: 'Mbala', telephone: '+243900000003', site: sites[0], createdBy: null, createdAt: '2026-09-19T08:00:00Z', etapeActuelle: 'ACTIVATION', prochainRoute: '/clients/activation/activate', etapes: { recit: { statut: 'COMPLETE' }, fiche: { statut: 'COMPLETE' }, activation: { statut: 'EN_ATTENTE' } } },
];
const response = { queue: clients, stats: { total: 3, ficheEnAttente: 1, activationEnAttente: 1 } };
let queryClient: QueryClient;

function Destination() {
  return <><h1>Dossier suivant</h1><output aria-label="Route du dossier">{useLocation().pathname}</output></>;
}

function showPage(role: Role = 'GERANT', siteId: string | null = 'goma') {
  useAuthStore.getState().setAuth({ id: 'test-user', name: 'Compte test', role, siteId, siteName: 'Goma' }, 'synthetic');
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={queryClient}>
    <MemoryRouter initialEntries={['/clients/queue']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes><Route path="/clients/queue" element={<OnboardingQueuePage />} /><Route path="*" element={<Destination />} /></Routes>
    </MemoryRouter>
  </QueryClientProvider>);
}

beforeEach(() => {
  get.mockReset();
  get.mockImplementation(async (url: string) => {
    if (url === '/sites') return { data: { data: sites } };
    if (url === '/clients/onboarding-queue') return { data: response };
    throw new Error(`Unexpected request: ${url}`);
  });
});
afterEach(() => { cleanup(); queryClient?.clear(); });

describe('File d’attente des clients', () => {
  test('le chargement conserve les libellés sans présenter des zéros comme des données chargées', () => {
    get.mockReturnValue(new Promise(() => {}));
    showPage();
    const summary = screen.getByRole('region', { name: 'Synthèse de la file' });
    expect(summary).toHaveAttribute('aria-busy', 'true');
    expect(within(summary).getByText('Clients en attente')).toBeVisible();
    expect(within(summary).queryByText('0')).not.toBeInTheDocument();
    expect(screen.queryByText('Aucun client en attente')).not.toBeInTheDocument();
  });

  test('le filtre récit annonce sa sélection et ne modifie pas les compteurs globaux du site', async () => {
    showPage();
    await screen.findByText('Aline Kabeya');
    const filters = screen.getByRole('group', { name: 'Étape du dossier' });
    await userEvent.click(within(filters).getByRole('button', { name: 'Récit' }));
    expect(within(filters).getByRole('button', { name: 'Récit' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(filters).getByRole('button', { name: 'Tous' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('Aline Kabeya')).toBeVisible();
    expect(screen.queryByText('Rose Mukendi')).not.toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Synthèse de la file' })).getByText('3')).toBeVisible();
    expect(screen.getByRole('status', { name: 'Nombre de dossiers affichés' })).toHaveTextContent('1 dossier');
  });

  test('un filtre sans résultat peut être réinitialisé sans masquer une file qui contient des clients', async () => {
    get.mockImplementation(async url => ({ data: url === '/sites' ? { data: sites } : { queue: [clients[0]], stats: { total: 1, ficheEnAttente: 0, activationEnAttente: 0 } } }));
    showPage();
    await screen.findByText('Aline Kabeya');
    await userEvent.click(within(screen.getByRole('group', { name: 'Étape du dossier' })).getByRole('button', { name: 'Fiche' }));
    expect(screen.getByText('Aucun dossier à cette étape')).toBeVisible();
    expect(screen.queryByText('Aucun client en attente')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Afficher toutes les étapes' }));
    expect(screen.getByText('Aline Kabeya')).toBeVisible();
  });

  test('le choix du site reste explicite et interroge le site choisi', async () => {
    showPage();
    const site = await screen.findByRole('combobox', { name: 'Site' });
    await within(site).findByRole('option', { name: 'Bukavu' });
    await userEvent.selectOptions(site, 'bukavu');
    expect(get).toHaveBeenCalledWith('/clients/onboarding-queue', { params: { siteId: 'bukavu' } });
  });

  test.each(['AGENT', 'CAISSIER'] as Role[])('%s conserve sa restriction au site attribué', async role => {
    showPage(role);
    await screen.findByText('Aline Kabeya');
    expect(screen.queryByRole('combobox', { name: 'Site' })).not.toBeInTheDocument();
    expect(get).toHaveBeenCalledWith('/clients/onboarding-queue', { params: { siteId: 'goma' } });
    expect(get).not.toHaveBeenCalledWith('/sites');
  });

  test('l’agent consulte le dossier sans accéder aux paiements ou à l’activation', async () => {
    showPage('AGENT');
    const row = (await screen.findByText('Jonathan Mbala')).closest('tr')!;
    expect(within(row).getByText('En attente de passage en caisse')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Activer le compte' })).not.toBeInTheDocument();
    await userEvent.click(within(row).getByRole('button', { name: 'Ouvrir le dossier' }));
    expect(screen.getByRole('status', { name: 'Route du dossier' })).toHaveTextContent('/clients/activation');
  });

  test.each([
    ['Aline Kabeya', 'Compléter le récit', '/clients/recit/recit'],
    ['Rose Mukendi', 'Enregistrer la fiche', '/clients/fiche/fiche'],
    ['Jonathan Mbala', 'Activer le compte', '/clients/activation/activate'],
  ])('le caissier reprend le dossier de %s à l’étape fournie par le backend', async (name, action, route) => {
    showPage('CAISSIER');
    const row = (await screen.findByText(name)).closest('tr')!;
    await userEvent.click(within(row).getByRole('button', { name: action }));
    expect(screen.getByRole('status', { name: 'Route du dossier' })).toHaveTextContent(route);
  });

  test('la progression distingue les étapes terminées des étapes en attente sans se fier uniquement aux couleurs', async () => {
    showPage();
    const row = (await screen.findByText('Jonathan Mbala')).closest('tr')!;
    const progress = within(row).getByRole('list', { name: 'Progression du dossier' });
    expect(within(progress).getByRole('listitem', { name: 'Récit : terminé' })).toBeInTheDocument();
    expect(within(progress).getByRole('listitem', { name: 'Fiche : terminé' })).toBeInTheDocument();
    expect(within(progress).getByRole('listitem', { name: 'Activation : en attente' })).toBeInTheDocument();
  });

  test('une panne affiche un message et un bouton de reprise plutôt qu’une file vide', async () => {
    get.mockImplementation(async url => {
      if (url === '/sites') return { data: { data: sites } };
      throw new Error('network');
    });
    showPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger');
    expect(screen.queryByText('Aucun client en attente')).not.toBeInTheDocument();
    get.mockResolvedValue({ data: response });
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText('Aline Kabeya')).toBeVisible();
  });

  test('une panne d’actualisation conserve les dossiers déjà chargés avec un avertissement', async () => {
    showPage();
    await screen.findByText('Aline Kabeya');
    get.mockRejectedValue(new Error('network'));
    await userEvent.click(screen.getByRole('button', { name: 'Actualiser' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('dernières données');
    expect(screen.getByText('Aline Kabeya')).toBeVisible();
  });

  test('un accès refusé retire les données précédentes et affiche une explication non technique', async () => {
    showPage('CAISSIER');
    await screen.findByText('Aline Kabeya');
    get.mockRejectedValue({ response: { status: 403 }, message: 'Technical server message' });
    await userEvent.click(screen.getByRole('button', { name: 'Actualiser' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Contactez votre responsable');
    expect(alert).not.toHaveTextContent(/403|Technical|serveur/);
    expect(screen.queryByText('Aline Kabeya')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Réessayer' })).not.toBeInTheDocument();
  });

  test('un caissier sans site ne peut pas forcer la lecture de la file avec Actualiser', async () => {
    showPage('CAISSIER', null);
    expect(screen.getByRole('alert')).toHaveTextContent('site');
    expect(screen.getByRole('button', { name: 'Actualiser' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Actualiser' }));
    expect(get).not.toHaveBeenCalled();
  });

  test('un refus d’accès reste bloquant après une panne jusqu’à une nouvelle réponse autorisée', async () => {
    showPage('CAISSIER');
    await screen.findByText('Aline Kabeya');
    get.mockRejectedValue({ response: { status: 403 } });
    await userEvent.click(screen.getByRole('button', { name: 'Actualiser' }));
    await screen.findByRole('alert');
    expect(screen.queryByText('Aline Kabeya')).not.toBeInTheDocument();
    get.mockRejectedValue(new Error('network'));
    await userEvent.click(screen.getByRole('button', { name: 'Actualiser' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('autorisations');
    expect(screen.queryByText('Aline Kabeya')).not.toBeInTheDocument();
    get.mockResolvedValue({ data: response });
    await userEvent.click(screen.getByRole('button', { name: 'Actualiser' }));
    expect(await screen.findByText('Aline Kabeya')).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  test('le refus d’un site ne bloque pas un autre site et reste mémorisé au retour', async () => {
    showPage();
    await screen.findByText('Aline Kabeya');
    get.mockRejectedValue({ response: { status: 403 } });
    await userEvent.click(screen.getByRole('button', { name: 'Actualiser' }));
    await screen.findByRole('alert');
    get.mockResolvedValue({ data: { queue: [{ ...clients[0], prenom: 'Client', nom: 'Bukavu', site: sites[1] }], stats: { total: 1, ficheEnAttente: 0, activationEnAttente: 0 } } });
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Site' }), 'bukavu');
    expect(await screen.findByText('Client Bukavu')).toBeVisible();
    get.mockRejectedValue(new Error('network'));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Site' }), 'goma');
    expect(await screen.findByRole('alert')).toHaveTextContent('autorisations');
    expect(screen.queryByText('Aline Kabeya')).not.toBeInTheDocument();
    expect(screen.queryByText('Client Bukavu')).not.toBeInTheDocument();
  });

  test('une file réellement vide permet toujours de démarrer le parcours existant', async () => {
    get.mockResolvedValue({ data: { queue: [], stats: { total: 0, ficheEnAttente: 0, activationEnAttente: 0 } } });
    showPage('AGENT');
    expect(await screen.findByText('Aucun client en attente')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: /Nouveau client/ }));
    expect(screen.getByRole('status', { name: 'Route du dossier' })).toHaveTextContent('/clients/new/recit');
  });
});
