import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AdminDeleteButton } from './AdminDeleteButton';
import { adminDeletionApi, type DeletionImpact } from '@/lib/admin-deletion.api';
import { useAuthStore } from '@/store/auth.store';
import type { Role } from '@/types';

vi.mock('@/lib/admin-deletion.api', () => ({
  adminDeletionApi: { impact: vi.fn(), remove: vi.fn(), deactivate: vi.fn() },
}));

const api = vi.mocked(adminDeletionApi);

function impact(over: Partial<DeletionImpact> = {}): DeletionImpact {
  return {
    entity: 'client', id: 'c1', label: 'Awa Test', canDelete: true, blockers: [],
    forbiddenReason: null, fallback: 'ARCHIVER', alreadyInactive: false, ...over,
  };
}

function renderButton(role: Role, onDone = vi.fn()) {
  useAuthStore.getState().setAuth({ id: 'me', name: 'Moi', role }, 'token');
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AdminDeleteButton entity="client" id="c1" label="Awa Test" onDone={onDone} />
    </QueryClientProvider>,
  );
  return onDone;
}

beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); });
afterEach(() => { cleanup(); useAuthStore.setState(useAuthStore.getInitialState(), true); });

describe('AdminDeleteButton', () => {
  it.each<Role>(['GERANT', 'DIRECTEUR_REGIONAL', 'AGENT'])('reste invisible pour %s', (role) => {
    renderButton(role);
    expect(screen.queryByRole('button', { name: /Supprimer/ })).not.toBeInTheDocument();
  });

  it('supprime définitivement un élément sans historique après confirmation', async () => {
    api.impact.mockResolvedValue(impact());
    api.remove.mockResolvedValue({ deleted: true, label: 'Awa Test' });
    const onDone = renderButton('SUPER_ADMIN');

    await userEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
    await userEvent.click(await screen.findByRole('button', { name: /Supprimer définitivement/ }));

    expect(api.remove).toHaveBeenCalledWith('client', 'c1');
    await vi.waitFor(() => expect(onDone).toHaveBeenCalledWith('deleted'));
  });

  it('explique le blocage et propose l’archivage quand il y a un historique', async () => {
    api.impact.mockResolvedValue(impact({
      canDelete: false,
      blockers: [{ key: 'ventes', label: 'vente(s)', count: 4 }],
    }));
    api.deactivate.mockResolvedValue({ deactivated: true, label: 'Awa Test' });
    const onDone = renderButton('SUPER_ADMIN');

    await userEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
    expect(await screen.findByText('vente(s)', { exact: false })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Supprimer définitivement/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Archiver' }));
    expect(api.deactivate).toHaveBeenCalledWith('client', 'c1');
    expect(api.remove).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(onDone).toHaveBeenCalledWith('deactivated'));
  });

  it('affiche la règle qui interdit l’action (ex. son propre compte)', async () => {
    api.impact.mockResolvedValue(impact({ canDelete: false, forbiddenReason: 'Vous ne pouvez pas supprimer votre propre compte.' }));
    renderButton('SUPER_ADMIN');
    await userEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('propre compte');
    expect(screen.queryByRole('button', { name: /Supprimer définitivement|Archiver/ })).not.toBeInTheDocument();
  });
});
