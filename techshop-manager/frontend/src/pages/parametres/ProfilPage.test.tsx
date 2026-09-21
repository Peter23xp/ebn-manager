import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AxiosError, AxiosHeaders } from 'axios';
import ProfilPage from './ProfilPage';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import type { AuthUser, Utilisateur } from '@/types';

const actor: AuthUser = {
  id: 'profile-agent', name: 'Amina Kabeya', role: 'AGENT',
  siteId: 'site-goma', siteName: 'Goma centre',
};
const profile: Utilisateur = {
  id: 'profile-agent', nom: 'Amina Kabeya', telephone: '+243812345678',
  email: 'amina@example.test', role: 'AGENT', actif: true, langue: 'fr',
  siteId: 'site-goma', site: { id: 'site-goma', nom: 'Goma centre' },
  derniereConnexion: '2026-09-21T08:00:00Z',
};
let queryClient: QueryClient;

function requestError(status: number, message: string) {
  return new AxiosError(message, 'ERR_BAD_REQUEST', undefined, undefined, {
    status, statusText: 'Request failed', data: { message },
    headers: {}, config: { headers: new AxiosHeaders() },
  });
}

function pendingProfile() {
  let resolve!: (value: { data: Utilisateur }) => void;
  const promise = new Promise<{ data: Utilisateur }>(resolvePromise => { resolve = resolvePromise; });
  return { promise, resolve };
}

function renderProfile() {
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/settings/profile']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ProfilPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function openSecurity() {
  await screen.findByLabelText('Nom complet');
  await userEvent.click(screen.getByRole('button', { name: 'Sécurité' }));
}

function passwordSubmit() {
  return screen.getAllByRole('button', { name: 'Changer le mot de passe' })
    .find(button => button.getAttribute('type') === 'submit')!;
}

beforeEach(() => {
  useAuthStore.setState(useAuthStore.getInitialState(), true);
  useAuthStore.getState().setAuth(actor, 'synthetic-profile-token');
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
  vi.spyOn(api, 'get').mockImplementation(async url => {
    if (url !== '/users/me') throw new Error(`Unexpected read: ${url}`);
    return { data: profile };
  });
  vi.spyOn(api, 'patch').mockRejectedValue(new Error('Unexpected write'));
});

afterEach(() => {
  cleanup();
  queryClient.clear();
  vi.restoreAllMocks();
  useAuthStore.setState(useAuthStore.getInitialState(), true);
  localStorage.clear();
});

describe('profile loading and access', () => {
  it('preserves unsaved edits across a transient refetch failure and retry', async () => {
    renderProfile();
    await userEvent.clear(await screen.findByLabelText('Nom complet'));
    await userEvent.type(screen.getByLabelText('Nom complet'), 'Amina Brouillon');
    vi.mocked(api.get).mockRejectedValueOnce(requestError(503, 'Indisponible'));
    await act(async () => { await queryClient.refetchQueries({ queryKey: ['users', 'me'] }); });
    await screen.findByRole('alert');
    expect(screen.getByLabelText('Nom complet')).toHaveValue('Amina Brouillon');
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.getByLabelText('Nom complet')).toHaveValue('Amina Brouillon');
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('does not restore forbidden cached identity after a later network failure', async () => {
    renderProfile();
    await screen.findByLabelText('Nom complet');
    vi.mocked(api.get).mockRejectedValueOnce(requestError(403, 'Accès refusé'));
    await act(async () => { await queryClient.refetchQueries({ queryKey: ['users', 'me'] }); });
    expect(await screen.findByRole('alert')).toHaveTextContent('Accès au profil refusé');
    vi.mocked(api.get).mockRejectedValueOnce(requestError(503, 'Indisponible'));
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    await waitFor(() => expect(queryClient.getQueryState(['users', 'me'])?.fetchStatus).toBe('idle'));
    expect(screen.queryByLabelText('Nom complet')).not.toBeInTheDocument();
    expect(screen.queryByText('Amina Kabeya')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByLabelText('Nom complet')).toHaveValue('Amina Kabeya');
  });

  it('announces loading without placeholder identity or an editable form', async () => {
    const pending = pendingProfile();
    vi.mocked(api.get).mockReturnValue(pending.promise);
    renderProfile();
    expect(screen.getByRole('status')).toHaveTextContent('Chargement du profil');
    expect(screen.queryByText(actor.name)).not.toBeInTheDocument();
    expect(screen.queryByText('—')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Nom complet')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enregistrer' })).not.toBeInTheDocument();
    await act(async () => pending.resolve({ data: profile }));
    expect(await screen.findByLabelText('Nom complet')).toHaveValue('Amina Kabeya');
    expect(screen.getByText('+243812345678')).toBeInTheDocument();
  });

  it('keeps forms unavailable after failure and restores real values on retry', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(requestError(500, 'Service indisponible'));
    renderProfile();
    expect(await screen.findByRole('alert')).toHaveTextContent(/Impossible de charger/);
    expect(screen.queryByLabelText('Nom complet')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Mot de passe actuel')).not.toBeInTheDocument();
    expect(screen.queryByText(actor.name)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByLabelText('Nom complet')).toHaveValue('Amina Kabeya');
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('withholds retained identity and editing after a forbidden refetch', async () => {
    queryClient.setQueryData(['users', 'me'], profile);
    vi.mocked(api.get).mockRejectedValue(requestError(403, 'Accès refusé'));
    renderProfile();
    expect(await screen.findByRole('alert')).toHaveTextContent(/accès|autorisé/i);
    expect(screen.queryByText('Amina Kabeya')).not.toBeInTheDocument();
    expect(screen.queryByText('+243812345678')).not.toBeInTheDocument();
    expect(screen.queryByText('Goma centre')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Nom complet')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sécurité' })).not.toBeInTheDocument();
    expect(api.patch).not.toHaveBeenCalled();
  });
});

describe('profile changes', () => {
  it('sends only profile fields and updates the stored name without changing role or session', async () => {
    const updated = { ...profile, nom: 'Amina Mutombo', email: 'amina.m@example.test' };
    vi.mocked(api.patch).mockResolvedValue({ data: updated });
    vi.mocked(api.get).mockResolvedValueOnce({ data: profile }).mockResolvedValue({ data: updated });
    const sessionVersion = useAuthStore.getState().sessionVersion;
    renderProfile();
    const name = await screen.findByLabelText('Nom complet');
    const email = screen.getByLabelText(/Email/);
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
    await userEvent.clear(name);
    await userEvent.type(name, 'Amina Mutombo');
    await userEvent.clear(email);
    await userEvent.type(email, 'amina.m@example.test');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/users/me', {
      nom: 'Amina Mutombo', email: 'amina.m@example.test',
    }));
    expect(await screen.findByRole('status')).toHaveTextContent('Profil mis à jour avec succès');
    expect(useAuthStore.getState().user).toEqual({ ...actor, name: 'Amina Mutombo' });
    expect(useAuthStore.getState().accessToken).toBe('synthetic-profile-token');
    expect(useAuthStore.getState().sessionVersion).toBe(sessionVersion);
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Fermer le message' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it.each([
    { label: 'Nom complet', value: 'A', error: 'Nom trop court' },
    { label: 'Email (optionnel)', value: 'invalide', error: 'Email invalide' },
  ])('rejects invalid $label with an associated error before submitting', async ({ label, value, error }) => {
    renderProfile();
    await screen.findByLabelText('Nom complet');
    const field = screen.getByLabelText(label);
    await userEvent.clear(field);
    await userEvent.type(field, value);
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText(error)).toBeInTheDocument();
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveAccessibleDescription(error);
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('preserves the existing empty-email payload contract', async () => {
    vi.mocked(api.patch).mockResolvedValue({ data: { ...profile, nom: 'Amina Mutombo' } });
    renderProfile();
    await userEvent.clear(await screen.findByLabelText('Nom complet'));
    await userEvent.type(screen.getByLabelText('Nom complet'), 'Amina Mutombo');
    await userEvent.clear(screen.getByLabelText(/Email/));
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/users/me', { nom: 'Amina Mutombo', email: undefined }));
  });

  it('retains edits and the stored identity when saving fails', async () => {
    vi.mocked(api.patch).mockRejectedValue(requestError(500, 'Enregistrement indisponible'));
    renderProfile();
    const name = await screen.findByLabelText('Nom complet');
    await userEvent.clear(name);
    await userEvent.type(name, 'Amina Mutombo');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Enregistrement indisponible');
    expect(name).toHaveValue('Amina Mutombo');
    expect(useAuthStore.getState().user).toEqual(actor);
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeEnabled();
  });
});

describe('profile security', () => {
  it('provides keyboard-operable section buttons with a correct pressed state', async () => {
    renderProfile();
    await screen.findByLabelText('Nom complet');
    const information = screen.getByRole('button', { name: 'Informations' });
    const security = screen.getByRole('button', { name: 'Sécurité' });
    expect(information).toHaveAttribute('aria-pressed', 'true');
    expect(security).toHaveAttribute('aria-pressed', 'false');
    information.focus();
    await userEvent.tab();
    expect(security).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(security).toHaveAttribute('aria-pressed', 'true');
    expect(information).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByLabelText('Mot de passe actuel')).toBeInTheDocument();
    expect(screen.queryByLabelText('Nom complet')).not.toBeInTheDocument();
  });

  it.each([
    { label: 'Mot de passe actuel', toggle: 'le mot de passe actuel', autocomplete: 'current-password' },
    { label: 'Nouveau mot de passe', toggle: 'le nouveau mot de passe', autocomplete: 'new-password' },
    { label: 'Confirmer le nouveau mot de passe', toggle: 'la confirmation du mot de passe', autocomplete: 'new-password' },
  ])('toggles $label independently by keyboard with a unique accessible name', async ({ label, toggle, autocomplete }) => {
    renderProfile();
    await openSecurity();
    const field = screen.getByLabelText(label);
    const otherFields = ['Mot de passe actuel', 'Nouveau mot de passe', 'Confirmer le nouveau mot de passe']
      .filter(other => other !== label).map(other => screen.getByLabelText(other));
    expect(field).toHaveAttribute('type', 'password');
    expect(field).toHaveAttribute('autocomplete', autocomplete);
    await userEvent.type(field, 'Example123');
    await userEvent.tab();
    const toggleButton = screen.getByRole('button', { name: `Afficher ${toggle}` });
    expect(toggleButton).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(field).toHaveAttribute('type', 'text');
    expect(field).toHaveValue('Example123');
    expect(screen.getByRole('button', { name: `Masquer ${toggle}` })).toHaveFocus();
    for (const otherField of otherFields) expect(otherField).toHaveAttribute('type', 'password');
    await userEvent.keyboard(' ');
    expect(field).toHaveAttribute('type', 'password');
  });

  it.each([
    { current: '', next: 'Secure123', confirm: 'Secure123', field: 'Mot de passe actuel', error: 'Requis' },
    { current: 'Current123', next: 'Short1', confirm: 'Short1', field: 'Nouveau mot de passe', error: 'Minimum 8 caractères' },
    { current: 'Current123', next: 'lowercase1', confirm: 'lowercase1', field: 'Nouveau mot de passe', error: 'Au moins une majuscule et un chiffre' },
    { current: 'Current123', next: 'NoDigitsHere', confirm: 'NoDigitsHere', field: 'Nouveau mot de passe', error: 'Au moins une majuscule et un chiffre' },
    { current: 'Current123', next: 'Secure123', confirm: 'Different123', field: 'Confirmer le nouveau mot de passe', error: 'Les mots de passe ne correspondent pas' },
    { current: 'Current123', next: 'Secure123', confirm: '', field: 'Confirmer le nouveau mot de passe', error: 'Requis' },
  ])('prevents password submission when $field fails $error', async ({ current, next, confirm, field, error }) => {
    renderProfile();
    await openSecurity();
    if (current) await userEvent.type(screen.getByLabelText('Mot de passe actuel'), current);
    await userEvent.type(screen.getByLabelText('Nouveau mot de passe'), next);
    if (confirm) await userEvent.type(screen.getByLabelText('Confirmer le nouveau mot de passe'), confirm);
    await userEvent.click(passwordSubmit());
    expect(await screen.findByText(error)).toBeInTheDocument();
    expect(screen.getByLabelText(field)).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(field)).toHaveAccessibleDescription(new RegExp(error));
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('sends current and new passwords only and clears all fields on success', async () => {
    vi.mocked(api.patch).mockResolvedValue({ data: { success: true, message: 'Mot de passe modifié' } });
    renderProfile();
    await openSecurity();
    await userEvent.type(screen.getByLabelText('Mot de passe actuel'), 'Current123');
    await userEvent.type(screen.getByLabelText('Nouveau mot de passe'), 'Secure123');
    await userEvent.type(screen.getByLabelText('Confirmer le nouveau mot de passe'), 'Secure123');
    await userEvent.click(passwordSubmit());
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/users/me/password', {
      currentPassword: 'Current123', newPassword: 'Secure123',
    }));
    expect(await screen.findByRole('status')).toHaveTextContent('Mot de passe modifié avec succès');
    for (const label of ['Mot de passe actuel', 'Nouveau mot de passe', 'Confirmer le nouveau mot de passe']) {
      expect(screen.getByLabelText(label)).toHaveValue('');
      expect(screen.getByLabelText(label)).toHaveAttribute('type', 'password');
    }
    expect(useAuthStore.getState().user).toEqual(actor);
  });

  it('keeps password values available for correction after a rejected update', async () => {
    vi.mocked(api.patch).mockRejectedValue(requestError(400, 'Mot de passe actuel incorrect'));
    renderProfile();
    await openSecurity();
    await userEvent.type(screen.getByLabelText('Mot de passe actuel'), 'Current123');
    await userEvent.type(screen.getByLabelText('Nouveau mot de passe'), 'Secure123');
    await userEvent.type(screen.getByLabelText('Confirmer le nouveau mot de passe'), 'Secure123');
    await userEvent.click(passwordSubmit());
    expect(await screen.findByRole('alert')).toHaveTextContent('Mot de passe actuel incorrect');
    expect(screen.getByLabelText('Nouveau mot de passe')).toHaveValue('Secure123');
    expect(passwordSubmit()).toBeEnabled();
  });
});
