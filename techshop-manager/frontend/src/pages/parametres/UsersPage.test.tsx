import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import UsersPage from './UsersPage';
import { MemoryRouter } from 'react-router-dom';
import { sitesApi, usersApi } from '@/lib/settings.api';
import type { Role, Utilisateur } from '@/types';

const cashier: Utilisateur = {
  id: 'cashier', nom: 'Cashier Test', telephone: '+243812345678',
  role: 'CAISSIER' as Role, actif: true, langue: 'fr', siteId: 'site-1',
  site: { id: 'site-1', nom: 'Site 1' },
};
let queryClient: QueryClient;

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  vi.spyOn(usersApi, 'getAll').mockResolvedValue({ data: [cashier], total: 1 });
  vi.spyOn(sitesApi, 'getAll').mockResolvedValue({ data: [{ id: 'site-1', nom: 'Site 1', ville: 'Ville', actif: true, createdAt: '2026-09-19' }], total: 1 });
  vi.spyOn(usersApi, 'create').mockResolvedValue(cashier);
  vi.spyOn(usersApi, 'update').mockResolvedValue(cashier);
});

afterEach(() => { cleanup(); queryClient.clear(); vi.restoreAllMocks(); });

function renderUsers() {
  render(<MemoryRouter><QueryClientProvider client={queryClient}><UsersPage /></QueryClientProvider></MemoryRouter>);
}

describe('cashier user management', () => {
  it('offers the cashier filter and renders its label', async () => {
    renderUsers();
    expect(within(screen.getByRole('combobox', { name: 'Filtrer par rôle' })).getByRole('option', { name: 'Caissier' })).toBeInTheDocument();
    expect(await screen.findByText('Cashier Test')).toBeInTheDocument();
    expect(within(screen.getByRole('table', { name: 'Liste des utilisateurs' })).getByText('Caissier')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Filtrer par rôle' }), 'CAISSIER');
    await waitFor(() => expect(usersApi.getAll).toHaveBeenLastCalledWith({ role: 'CAISSIER', actif: undefined }));
  });

  it('requires a site and submits the cashier role when creating', async () => {
    renderUsers();
    await userEvent.click(screen.getByRole('button', { name: 'Créer un nouvel utilisateur' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Créer un utilisateur' }));
    expect(dialog.getByRole('option', { name: 'Caissier' })).toBeInTheDocument();
    await userEvent.type(dialog.getByLabelText('Nom complet'), 'New Cashier');
    await userEvent.type(dialog.getByLabelText('Téléphone'), '+243822345678');
    await userEvent.type(dialog.getByLabelText('Mot de passe temporaire'), 'temporary-password');
    await userEvent.selectOptions(dialog.getByLabelText('Rôle'), 'CAISSIER');
    await userEvent.click(dialog.getByRole('button', { name: 'Valider la création' }));
    expect(await dialog.findByText('Le site est obligatoire')).toBeInTheDocument();
    expect(usersApi.create).not.toHaveBeenCalled();
    await userEvent.selectOptions(dialog.getByLabelText('Site'), 'site-1');
    await userEvent.click(dialog.getByRole('button', { name: 'Valider la création' }));
    await waitFor(() => expect(usersApi.create).toHaveBeenCalledWith({ nom: 'New Cashier', telephone: '+243822345678', passwordTemp: 'temporary-password', role: 'CAISSIER', siteId: 'site-1' }));
  });

  it('requires a site and preserves the cashier role when editing', async () => {
    renderUsers();
    await userEvent.click(await screen.findByRole('button', { name: 'Modifier Cashier Test' }));
    const dialog = within(screen.getByRole('dialog', { name: "Modifier l'utilisateur" }));
    expect(dialog.getByLabelText('Rôle')).toHaveValue('CAISSIER');
    await userEvent.selectOptions(dialog.getByLabelText('Site'), '');
    await userEvent.click(dialog.getByRole('button', { name: /Enregistrer/ }));
    expect(await dialog.findByText('Le site est obligatoire')).toBeInTheDocument();
    expect(usersApi.update).not.toHaveBeenCalled();
    await userEvent.selectOptions(dialog.getByLabelText('Site'), 'site-1');
    await userEvent.click(dialog.getByRole('button', { name: /Enregistrer/ }));
    await waitFor(() => expect(usersApi.update).toHaveBeenCalledWith('cashier', { nom: 'Cashier Test', email: undefined, role: 'CAISSIER', siteId: 'site-1' }));
  });
});
