import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import SitesPage from './SitesPage';
import UsersPage from './UsersPage';
import { sitesApi, usersApi, type SiteWithCounts } from '@/lib/settings.api';
import { useAuthStore } from '@/store/auth.store';
import type { AuthUser, Utilisateur } from '@/types';

const sites: SiteWithCounts[] = [
  { id: 'goma', nom: 'Goma Commerce', ville: 'Goma', actif: true, createdAt: '2026-09-21', adresse: 'Avenue du Commerce', _count: { utilisateurs: 6, clients: 24 } },
  { id: 'bukavu', nom: 'Bukavu Centre', ville: 'Bukavu', actif: false, createdAt: '2026-09-20', _count: { utilisateurs: 2, clients: 8 } },
];
const employee: Utilisateur = { id: 'cashier', nom: 'Marie Test', telephone: '+243812345678', role: 'CAISSIER', actif: true, langue: 'fr', siteId: 'goma', site: { id: 'goma', nom: 'Goma Commerce' } };
let client: QueryClient;

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  useAuthStore.setState({ user: { id: 'admin', name: 'Admin', role: 'SUPER_ADMIN' } as AuthUser, isAuthenticated: true });
  vi.spyOn(sitesApi, 'getAll').mockResolvedValue({ data: sites, total: 2 });
  vi.spyOn(sitesApi, 'create').mockResolvedValue(sites[0]);
  vi.spyOn(sitesApi, 'update').mockResolvedValue(sites[0]);
  vi.spyOn(usersApi, 'getAll').mockResolvedValue({ data: [employee], total: 1 });
  vi.spyOn(usersApi, 'desactiver').mockResolvedValue({ ...employee, actif: false });
  vi.spyOn(usersApi, 'resetPassword').mockResolvedValue({ success: true, message: 'SMS envoyé' });
});
afterEach(() => { cleanup(); client.clear(); vi.restoreAllMocks(); useAuthStore.setState({ user: null, isAuthenticated: false }); });

function renderPage(page = <SitesPage />) {
  return render(<MemoryRouter><QueryClientProvider client={client}>{page}</QueryClientProvider></MemoryRouter>);
}

describe('settings presentation and preserved operations', () => {
  it('connects all four settings pages with an identified current page', async () => {
    renderPage();
    const navigation = within(screen.getByRole('navigation', { name: 'Paramètres' }));
    expect(navigation.getByRole('link', { name: 'Sites' })).toHaveAttribute('aria-current', 'page');
    expect(navigation.getByRole('link', { name: 'Utilisateurs' })).toHaveAttribute('href', '/settings/users');
    expect(navigation.getByRole('link', { name: 'Mon profil' })).toHaveAttribute('href', '/settings/profile');
    expect(navigation.getByRole('link', { name: 'Configuration' })).toHaveAttribute('href', '/settings/general');
  });

  it('does not advertise administrative links to a cashier', () => {
    useAuthStore.setState({ user: { id: 'cashier', name: 'Marie', role: 'CAISSIER' } as AuthUser });
    renderPage();
    const navigation = within(screen.getByRole('navigation', { name: 'Paramètres' }));
    expect(navigation.getAllByRole('link')).toHaveLength(1);
    expect(navigation.getByRole('link', { name: 'Mon profil' })).toBeInTheDocument();
  });

  it('names staff counts accurately and distinguishes unavailable data from zero', async () => {
    renderPage();
    const summary = within(screen.getByRole('region', { name: 'Synthèse des sites' }));
    await waitFor(() => expect(summary.getByText('32')).toBeInTheDocument());
    expect(summary.getByText('Utilisateurs rattachés')).toBeInTheDocument();
    expect(summary.getByText('8')).toBeInTheDocument();
  });

  it('does not show zero statistics while sites are loading', () => {
    vi.mocked(sitesApi.getAll).mockReturnValue(new Promise(() => {}));
    renderPage();
    const summary = screen.getByRole('region', { name: 'Synthèse des sites' });
    expect(summary).toHaveAttribute('aria-busy', 'true');
    expect(within(summary).queryByText('0')).not.toBeInTheDocument();
  });

  it('filters sites by text and status without changing global counts', async () => {
    renderPage();
    await screen.findByText('Goma Commerce');
    await userEvent.type(screen.getByRole('searchbox', { name: 'Rechercher un site' }), 'bukavu');
    expect(screen.queryByText('Goma Commerce')).not.toBeInTheDocument();
    expect(screen.getByText('Bukavu Centre')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Statut des sites'), 'true');
    expect(screen.getByText('Aucun site ne correspond aux filtres')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Réinitialiser les filtres' }));
    expect(screen.getByText('Goma Commerce')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Synthèse des sites' })).getByText('32')).toBeInTheDocument();
  });

  it('uses a named confirmation and never toggles a site before confirmation', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Désactiver Goma Commerce' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Désactiver Goma Commerce ?' }));
    expect(sitesApi.update).not.toHaveBeenCalled();
    await userEvent.click(dialog.getByRole('button', { name: 'Désactiver' }));
    await waitFor(() => expect(sitesApi.update).toHaveBeenCalledWith('goma', { actif: false }));
  });

  it('closes a site form with Escape and returns focus to its trigger', async () => {
    renderPage();
    const trigger = screen.getByRole('button', { name: 'Créer un nouveau site' });
    await userEvent.click(trigger);
    expect(screen.getByRole('dialog', { name: 'Nouveau site' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(sitesApi.create).not.toHaveBeenCalled();
  });

  it('keeps the site creation payload and validation', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Créer un nouveau site' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Nouveau site' }));
    await userEvent.click(dialog.getByRole('button', { name: 'Créer le site' }));
    expect(sitesApi.create).not.toHaveBeenCalled();
    await userEvent.type(dialog.getByLabelText('Nom du site'), 'Nouveau site');
    await userEvent.type(dialog.getByLabelText('Ville'), 'Kinshasa');
    await userEvent.click(dialog.getByRole('button', { name: 'Créer le site' }));
    await waitFor(() => expect(sitesApi.create).toHaveBeenCalledWith({ nom: 'Nouveau site', ville: 'Kinshasa', adresse: '', gerantId: undefined }));
  });

  it('shows a human readable site error and retries', async () => {
    vi.mocked(sitesApi.getAll).mockRejectedValueOnce(new Error('network'));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger les sites');
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText('Goma Commerce')).toBeInTheDocument();
  });

  it('does not replace unknown site counts with zero', async () => {
    vi.mocked(sitesApi.getAll).mockResolvedValue({ data: [{ ...sites[0], _count: undefined }], total: 1 });
    renderPage();
    await screen.findByText('Goma Commerce');
    const summary = within(screen.getByRole('region', { name: 'Synthèse des sites' }));
    expect(summary.queryByText('0')).not.toBeInTheDocument();
    expect(summary.getAllByText('Non disponible')).toHaveLength(2);
  });

  it('makes user filters visible and gives every reset action a specific name', async () => {
    renderPage(<UsersPage />);
    await screen.findByText('Marie Test');
    expect(screen.getByLabelText('Rechercher un utilisateur')).toBeInTheDocument();
    expect(screen.getByText('Rôle', { selector: 'label' })).toBeInTheDocument();
    expect(screen.getByText('Statut', { selector: 'label' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réinitialiser le mot de passe de Marie Test' })).toBeInTheDocument();
  });

  it('keeps client-side user searching and filter reset', async () => {
    renderPage(<UsersPage />);
    await screen.findByText('Marie Test');
    await userEvent.type(screen.getByRole('searchbox', { name: 'Rechercher un utilisateur' }), 'inconnu');
    expect(screen.getByText('Aucun résultat pour ces critères')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Réinitialiser les filtres' }));
    expect(screen.getByText('Marie Test')).toBeInTheDocument();
  });

  it('keeps user deactivation behind a confirmation', async () => {
    renderPage(<UsersPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Désactiver Marie Test' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Désactiver Marie Test ?' }));
    expect(usersApi.desactiver).not.toHaveBeenCalled();
    await userEvent.click(dialog.getByRole('button', { name: 'Désactiver' }));
    await waitFor(() => expect(usersApi.desactiver).toHaveBeenCalledWith('cashier'));
  });

  it('offers keyboard-accessible password visibility in the user form', async () => {
    renderPage(<UsersPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Créer un nouvel utilisateur' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Créer un utilisateur' }));
    const control = dialog.getByRole('button', { name: 'Afficher le mot de passe temporaire' });
    expect(control.tabIndex).toBe(0);
    await userEvent.click(control);
    expect(dialog.getByLabelText('Mot de passe temporaire')).toHaveAttribute('type', 'text');
    await userEvent.click(dialog.getByRole('button', { name: 'Masquer le mot de passe temporaire' }));
    expect(dialog.getByLabelText('Mot de passe temporaire')).toHaveAttribute('type', 'password');
    expect(dialog.getByRole('button', { name: 'Fermer' })).toBeInTheDocument();
  });

  it('keeps keyboard focus inside a site dialog', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Créer un nouveau site' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Nouveau site' }));
    dialog.getByRole('button', { name: 'Créer le site' }).focus();
    await userEvent.tab();
    expect(dialog.getByRole('button', { name: 'Fermer' })).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(dialog.getByRole('button', { name: 'Créer le site' })).toHaveFocus();
  });

  it('does not close a site confirmation while its request is pending', async () => {
    vi.mocked(sitesApi.update).mockReturnValue(new Promise(() => {}));
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Désactiver Goma Commerce' }));
    const dialog = within(screen.getByRole('dialog'));
    await userEvent.click(dialog.getByRole('button', { name: 'Désactiver' }));
    await waitFor(() => expect(dialog.getByRole('button', { name: 'Annuler' })).toBeDisabled());
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(sitesApi.update).toHaveBeenCalledTimes(1);
  });

  it('keeps site edits separate from manager assignment when no manager is selected', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Modifier Goma Commerce' }));
    const dialog = within(screen.getByRole('dialog'));
    await userEvent.clear(dialog.getByLabelText('Ville'));
    await userEvent.type(dialog.getByLabelText('Ville'), 'Bukavu');
    await userEvent.click(dialog.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(sitesApi.update).toHaveBeenCalledWith('goma', { nom: 'Goma Commerce', ville: 'Bukavu', adresse: 'Avenue du Commerce', gerantId: undefined }));
  });
});
