import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { api } from '@/lib/api';
import { clientsApi, type ClientDetail } from '@/lib/clients.api';
import { useAuthStore } from '@/store/auth.store';
import type { Role } from '@/types';
import { ClientInfoTab } from './ClientInfoTab';

const client: ClientDetail = {
  id: 'client-1', prenom: 'Jean', nom: 'Client', telephone: '+243900000000',
  statut: 'ACTIF', siteInscriptionId: 'site-1', site: { id: 'site-1', nom: 'Goma' },
  dateInscription: '2026-09-01T10:00:00Z', membre: null, parrain: null,
  onboardingEtapes: [], ventes: [], hasTransactions: false,
};
const recruiter = {
  id: 'recruiter-1', nom: 'Alice Recruteuse', codeParrain: 'EBN-A',
  telephone: '+243900000001', statut: 'ACTIF',
};
const attribution = {
  id: 'attribution-1', clientId: 'client-1', parrainClientId: 'recruiter-1',
  reason: 'Oubli lors de l’inscription', createdAt: '2026-09-17T10:30:00Z',
  actor: { id: 'manager-1', nom: 'Paul Gérant' },
  parrain: { id: 'recruiter-1', prenom: 'Alice', nom: 'Recruteuse', statut: 'ACTIF' },
};
const get = vi.spyOn(api, 'get');
const post = vi.spyOn(api, 'post');

function authenticate(role: Role = 'GERANT', siteId: string | null = 'site-1') {
  useAuthStore.setState({ user: { id: 'manager-1', name: 'Paul', role, siteId } });
}

function mount(details: ClientDetail = client, queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: 2, retryDelay: 1 } },
})) {
  const result = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><ClientInfoTab client={details} /></MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...result, queryClient };
}

async function selectRecruiter() {
  fireEvent.change(await screen.findByPlaceholderText('Matricule, téléphone ou nom du parrain…'), {
    target: { value: 'Alice' },
  });
  fireEvent.mouseDown(await screen.findByRole('button', { name: /EBN-A.*Alice/ }));
}

async function review(reason = '  Oubli lors de l’inscription  ') {
  await selectRecruiter();
  fireEvent.change(screen.getByRole('textbox', { name: /Motif/ }), { target: { value: reason } });
  fireEvent.click(screen.getByRole('button', { name: 'Vérifier l’attribution' }));
}

beforeEach(() => {
  authenticate();
  get.mockReset().mockImplementation(async (url) => ({
    data: String(url).includes('search-parrain') ? { results: [recruiter] } : null,
  }));
  post.mockReset().mockResolvedValue({ data: attribution });
});

describe('Recruiter assignment on the rendered client info tab', () => {
  it('normalizes an empty attribution response to null', async () => {
    get.mockResolvedValue({ data: '' });
    expect(await clientsApi.getParrainAttribution(client.id)).toBeNull();
  });

  it.each(['ACTIF', 'EN_COURS'] as const)('allows a same-site GERANT before/after activation (%s)', async statut => {
    mount({ ...client, statut });
    expect(await screen.findByRole('textbox', { name: /Motif/ })).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith('/clients/client-1/parrain/attribution');
  });

  it('allows SUPER_ADMIN across sites', async () => {
    authenticate('SUPER_ADMIN', 'other-site');
    mount();
    expect(await screen.findByRole('textbox', { name: /Motif/ })).toBeInTheDocument();
  });

  it('uses siteInscriptionId when the site relation is absent', async () => {
    mount({ ...client, site: undefined } as unknown as ClientDetail);
    expect(await screen.findByRole('textbox', { name: /Motif/ })).toBeInTheDocument();
  });

  it.each([
    ['GERANT', 'other-site'], ['GERANT', null], ['DIRECTEUR_REGIONAL', 'site-1'],
    ['AGENT', 'site-1'], ['FORMATEUR', 'site-1'], ['CLIENT', 'site-1'],
  ] as const)('does not expose assignment or history to %s at %s', async (role, siteId) => {
    authenticate(role, siteId);
    mount();
    await act(async () => {});
    expect(screen.queryByRole('textbox', { name: /Motif/ })).not.toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
  });

  it.each([
    { parrain: { id: 'existing', prenom: 'Marc', nom: 'Parrain' } },
    { parrainClientId: 'existing' },
    { membre: { matricule: 'EBN-X', statut: 'ACTIF', level: null, parrainId: 'existing' } },
    { parrainClaim: { id: 'claim', statut: 'EN_ATTENTE' } },
    { parrainClaim: { id: 'claim', statut: 'CONFIRME' } },
  ])('blocks replacement for existing recruiter/claim: %j', async existing => {
    mount({ ...client, ...existing } as ClientDetail);
    expect(await screen.findByText(/déjà.*parrain|déjà.*recruteur|déjà.*demande/i)).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /Motif/ })).not.toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it('requires a selected recruiter and a trimmed reason of 3 to 500 characters', async () => {
    mount();
    const reason = await screen.findByRole('textbox', { name: /Motif/ });
    const button = screen.getByRole('button', { name: 'Vérifier l’attribution' });
    fireEvent.change(reason, { target: { value: 'Motif valide' } });
    expect(button).toBeDisabled();
    await selectRecruiter();
    for (const value of ['   ', ' ab ', 'x'.repeat(501)]) {
      fireEvent.change(reason, { target: { value } });
      expect(button).toBeDisabled();
    }
    for (const value of [' abc ', 'x'.repeat(500)]) {
      fireEvent.change(reason, { target: { value } });
      expect(button).toBeEnabled();
    }
    expect(post).not.toHaveBeenCalled();
  });

  it('confirms the selected recruiter and consequences before posting the trimmed body', async () => {
    mount();
    await review();
    const confirmation = screen.getByRole('region', { name: 'Confirmer l’attribution' });
    expect(within(confirmation).getByText(/EBN-A/)).toBeInTheDocument();
    expect(screen.getByText(/définitif/)).toBeInTheDocument();
    expect(screen.getByText(/sous-arbre.*conserv/i)).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Confirmer l’attribution' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/clients/client-1/parrain', {
      codeParrain: 'EBN-A', reason: 'Oubli lors de l’inscription',
    }));
    expect(await screen.findByText('Paul Gérant')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /Motif/ })).not.toBeInTheDocument();
  });

  it('allows cancelling confirmation without POST', async () => {
    mount();
    await review();
    fireEvent.click(screen.getByRole('button', { name: 'Modifier la sélection' }));
    expect(screen.queryByRole('region', { name: 'Confirmer l’attribution' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Motif/ })).toHaveValue('  Oubli lors de l’inscription  ');
    expect(post).not.toHaveBeenCalled();
  });

  it('accepts a pending recruiter and explains the existing claim activation flow', async () => {
    get.mockImplementation(async url => ({
      data: String(url).includes('search-parrain')
        ? { results: [{ ...recruiter, statut: 'EN_COURS' }] } : null,
    }));
    mount();
    await review();
    expect(screen.getByText(/demandes.*existantes|claims.*existants/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer l’attribution' }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
  });

  it('shows persisted actor/date/reason history and prevents another assignment', async () => {
    get.mockResolvedValue({ data: attribution });
    mount();
    expect(await screen.findByText('Paul Gérant')).toBeInTheDocument();
    expect(screen.getByText(attribution.reason)).toBeInTheDocument();
    expect(screen.getByText(/17\/09\/2026/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Alice Recruteuse' })).toHaveAttribute('href', '/clients/recruiter-1');
    expect(screen.queryByRole('textbox', { name: /Motif/ })).not.toBeInTheDocument();
  });

  it('fails closed until history loads and offers an explicit GET retry', async () => {
    get.mockRejectedValueOnce(new Error('Unavailable'));
    mount();
    expect(screen.queryByRole('textbox', { name: /Motif/ })).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Réessayer le chargement' }));
    expect(await screen.findByRole('textbox', { name: /Motif/ })).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it('never automatically retries an ambiguous error and permits only the same confirmed body', async () => {
    post.mockRejectedValueOnce(new Error('Network timeout'));
    mount();
    await review();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer l’attribution' }));
    const retry = await screen.findByRole('button', { name: 'Réessayer la même attribution' });
    expect(screen.getByRole('alert')).toHaveTextContent(/aucun nouvel envoi automatique/i);
    expect(screen.getByRole('textbox', { name: /Motif/ })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Modifier la sélection' })).not.toBeInTheDocument();
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(post).toHaveBeenCalledTimes(1);
    fireEvent.click(retry);
    expect(await screen.findByText('Paul Gérant')).toBeInTheDocument();
    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[1]).toEqual(post.mock.calls[0]);
  });

  it('prevents duplicate posts and selection changes while the request is pending', async () => {
    let resolvePost!: (value: unknown) => void;
    post.mockImplementationOnce(() => new Promise(resolve => { resolvePost = resolve; }));
    mount();
    await review();
    const confirm = screen.getByRole('button', { name: 'Confirmer l’attribution' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Enregistrement…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Modifier la sélection' })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: /Motif/ })).toBeDisabled();
    await act(async () => resolvePost({ data: attribution }));
    expect(await screen.findByText('Paul Gérant')).toBeInTheDocument();
  });

  it('blocks an open confirmation when refreshed client data contains a recruiter', async () => {
    const { rerender, queryClient } = mount();
    await review();
    rerender(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <ClientInfoTab client={{ ...client, parrainClientId: 'another-recruiter' }} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.queryByRole('button', { name: 'Confirmer l’attribution' })).not.toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it('invalidates actual detail, clients and network keys without invalidating unrelated data', async () => {
    const { queryClient } = mount();
    const affectedKeys = [
      ['client', 'client-1'], ['clients', { page: 2 }], ['client-basic', 'client-1'],
      ['client-activation', 'client-1'], ['mlm-members'], ['mlm-tree', 'member-1', 3],
      ['mlm-tree-focus'], ['mlm-tree-branch'], ['mlm-tree-detail'], ['mlm-matrix'],
      ['mlm-progress'], ['mlm-stats'], ['mlm-members-by-level'], ['mlm-claims-pending'],
      ['mlm-notifications-counts'], ['portal', 'referrals', 'recruiter-1'],
      ['portal', 'referrals-tree', 'recruiter-1'],
      ['portal-claims-pending'],
    ];
    affectedKeys.forEach(key => queryClient.setQueryData(key, {}));
    queryClient.setQueryData(['stocks'], {});
    await review();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer l’attribution' }));
    await screen.findByText('Paul Gérant');
    affectedKeys.forEach(key => expect(queryClient.getQueryState(key)?.isInvalidated, JSON.stringify(key)).toBe(true));
    expect(queryClient.getQueryState(['stocks'])?.isInvalidated).toBe(false);
  });
});
