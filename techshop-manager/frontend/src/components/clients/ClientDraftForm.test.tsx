import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import OnboardingRecitPage from '@/pages/clients/OnboardingRecitPage';
import { useAuthStore } from '@/store/auth.store';

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({ api: { get, post }, getErrorMessage: () => 'Erreur réseau' }));
const searchPlaceholder = 'Matricule, téléphone ou nom du parrain…';

beforeEach(() => {
  useAuthStore.getState().setAuth({ id: 'agent', name: 'Agent local', role: 'AGENT', siteId: 'site-1', siteName: 'Goma' }, 'test-token');
  get.mockReset();
  post.mockReset();
  get.mockImplementation(async (url: string) => {
    if (url === '/config') return { data: { montantRecit: 5000 } };
    if (url.startsWith('/clients/check-phone/')) return { data: { exists: false } };
    if (url.startsWith('/clients/search-parrain?')) {
      const name = url.includes('Alice') ? 'Alice' : 'Bruno';
      return { data: { results: [{ id: name, nom: `${name} Parrain`, telephone: '+243900000010', codeParrain: `EBN-${name.toUpperCase()}`, statut: 'ACTIF' }] } };
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  post.mockImplementation(async (_url: string, body: Record<string, unknown>) => ({ data: { client: { id: `client-${body.prenom}`, ...body, statut: 'EN_COURS' }, etapeId: 'draft-step' } }));
});
afterEach(cleanup);

function renderForm() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  queryClient.setQueryData(['sites'], { data: [{ id: 'foreign-site', nom: 'Site étranger', actif: true }] });
  render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={['/clients/new/recit']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Routes>
    <Route path="/clients/new/recit" element={<OnboardingRecitPage />} />
    <Route path="/clients" element={<h1>Liste des clients</h1>} />
    <Route path="/clients/:id" element={<h1>Dossier enregistré</h1>} />
  </Routes></MemoryRouter></QueryClientProvider>);
  return userEvent.setup();
}

async function fillIdentity(user: ReturnType<typeof userEvent.setup>, name = 'Premier', phone = '900000001') {
  await user.type(screen.getByLabelText('Prénom *'), name);
  await user.type(screen.getByLabelText('Nom *'), 'Client');
  await user.type(screen.getByPlaceholderText('8X XXX XXXX'), phone);
}

async function selectRecruiter(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.type(screen.getByPlaceholderText(searchPlaceholder), name);
  await user.click(await screen.findByRole('button', { name: new RegExp(`${name} Parrain`) }));
}

describe('Préparation de dossier sans encaissement', () => {
  it('shows only identity fields and the assigned site, never financial controls or foreign sites', () => {
    renderForm();
    expect(screen.queryByLabelText(/mode de paiement/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/montant payé/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/matricule externe/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /cash/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /encaisser/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enregistrer le dossier' })).toBeEnabled();
    expect(screen.getByLabelText('Site *')).toHaveValue('Goma');
    expect(screen.getByLabelText('Site *')).toBeDisabled();
    expect(screen.queryByText('Site étranger')).not.toBeInTheDocument();
    expect(get).not.toHaveBeenCalledWith('/sites');
    expect(get).not.toHaveBeenCalledWith('/config');
  });

  it('submits the draft without an external registration number, resets identity/recruiter, and opens the created dossier', async () => {
    const user = renderForm();
    await fillIdentity(user);
    await user.type(screen.getByLabelText('Email'), 'client@example.test');
    await selectRecruiter(user, 'Alice');
    await user.click(screen.getByRole('button', { name: 'Enregistrer le dossier' }));
    await waitFor(() => expect(screen.getByLabelText('Prénom *')).toHaveValue(''));
    expect(post).toHaveBeenCalledWith('/clients/onboarding/draft', {
      prenom: 'Premier', nom: 'Client', telephone: '+243900000001', email: 'client@example.test', siteId: 'site-1', codeParrain: 'EBN-ALICE',
    });
    expect(post.mock.calls[0][1]).not.toHaveProperty('matriculeExterne');
    expect(screen.getByPlaceholderText(searchPlaceholder)).toHaveValue('');
    expect(screen.queryByLabelText(/matricule externe/i)).not.toBeInTheDocument();
    expect(screen.getByText('En attente de passage en caisse')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Ouvrir le dossier' });
    expect(link).toHaveAttribute('href', '/clients/client-Premier');
    await user.click(link);
    expect(screen.getByRole('heading', { name: 'Dossier enregistré' })).toBeInTheDocument();
  });

  it.each(['Bruno', 'Alice', ''])('does not carry the previous recruiter into the next dossier (%s)', async recruiter => {
    const user = renderForm();
    await fillIdentity(user);
    await selectRecruiter(user, 'Alice');
    await user.click(screen.getByRole('button', { name: 'Enregistrer le dossier' }));
    await waitFor(() => expect(screen.getByLabelText('Prénom *')).toHaveValue(''));
    expect(screen.queryByRole('button', { name: 'Effacer le parrain' })).not.toBeInTheDocument();
    await fillIdentity(user, 'Second', '900000002');
    if (recruiter) await selectRecruiter(user, recruiter);
    await user.click(screen.getByRole('button', { name: 'Enregistrer le dossier' }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(post.mock.calls[1][0]).toBe('/clients/onboarding/draft');
    expect(post.mock.calls[1][1]).toMatchObject({ siteId: 'site-1', telephone: '+243900000002', codeParrain: recruiter ? `EBN-${recruiter.toUpperCase()}` : undefined });
  });

  it('preserves all inputs after a network error and retries without payment', async () => {
    const user = renderForm();
    post.mockRejectedValueOnce(new Error('offline'));
    await fillIdentity(user);
    await selectRecruiter(user, 'Alice');
    await user.click(screen.getByRole('button', { name: 'Enregistrer le dossier' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/données sont conservées/i);
    expect(screen.getByLabelText('Prénom *')).toHaveValue('Premier');
    expect(screen.getByText('Alice Parrain')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Enregistrer le dossier' }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(post.mock.calls[1]).toEqual(post.mock.calls[0]);
  });

  it.each([true, false])('offers a duplicate dossier only when the server grants access (%s)', async accessible => {
    const user = renderForm();
    post.mockRejectedValueOnce({ response: { status: 409, data: { code: 'ERR_DUPLICATE_CLIENT', message: 'Un client avec ces informations existe déjà.', ...(accessible ? { clientId: 'existing' } : {}) } } });
    await fillIdentity(user);
    await user.click(screen.getByRole('button', { name: 'Enregistrer le dossier' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    if (accessible) expect(await screen.findByRole('link', { name: 'Ouvrir le dossier' })).toHaveAttribute('href', '/clients/existing');
    else expect(screen.queryByRole('link', { name: 'Ouvrir le dossier' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Prénom *')).toHaveValue('Premier');
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('cancels entry without writing anything', async () => {
    const user = renderForm();
    await fillIdentity(user);
    await user.click(screen.getByRole('link', { name: 'Annuler' }));
    expect(screen.getByRole('heading', { name: 'Liste des clients' })).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it('switches to the paid form after new cashier authentication without fetching sites', async () => {
    renderForm();
    expect(screen.getByRole('button', { name: 'Enregistrer le dossier' })).toBeInTheDocument();
    act(() => useAuthStore.getState().setAuth({ id: 'cashier', name: 'Caissier', role: 'CAISSIER', siteId: 'site-1' }, 'new-token'));
    expect(await screen.findByLabelText('Montant payé * (CDF)')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enregistrer le dossier' })).not.toBeInTheDocument();
    expect(get).not.toHaveBeenCalledWith('/sites');
  });
});
