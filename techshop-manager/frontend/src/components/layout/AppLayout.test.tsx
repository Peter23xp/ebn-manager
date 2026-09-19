import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AppLayout } from './AppLayout';
import { useAuthStore } from '@/store/auth.store';
import type { Role } from '@/types';

vi.mock('@/hooks/useOnlineSync', () => ({ useOnlineSync: () => undefined }));
vi.mock('@/components/layout/NotificationBell', () => ({ NotificationBell: () => null }));

function renderLayout(role: Role) {
  useAuthStore.getState().setAuth({ id: 'staff', name: 'Compte test', role }, 'test-token');
  return render(
    <MemoryRouter initialEntries={['/dashboard']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<h1>Tableau de bord</h1>} />
          <Route path="/mlm/config" element={<h1>Configuration du réseau</h1>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  useAuthStore.setState(useAuthStore.getInitialState(), true);
});

afterEach(cleanup);

describe('Accès à la configuration MLM depuis le menu', () => {
  it.each<Role>(['SUPER_ADMIN', 'DIRECTEUR_REGIONAL'])('permet à %s de naviguer depuis le menu ordinateur', async role => {
    renderLayout(role);
    const navigation = screen.getByRole('navigation', { name: 'Navigation principale' });
    expect(within(navigation).getByText('Réseau MLM')).toBeInTheDocument();
    const link = within(navigation).getByRole('link', { name: 'Configuration MLM' });
    expect(link).toHaveAttribute('href', '/mlm/config');
    await userEvent.click(link);
    expect(await screen.findByRole('heading', { name: 'Configuration du réseau' })).toBeInTheDocument();
    expect(link).toHaveAttribute('aria-current', 'page');
    expect(within(navigation).getByRole('link', { name: 'Dashboard MLM' })).not.toHaveAttribute('aria-current');
  });

  it.each<Role>(['SUPER_ADMIN', 'DIRECTEUR_REGIONAL'])('ferme le menu mobile après navigation pour %s', async role => {
    renderLayout(role);
    await userEvent.click(screen.getByRole('button', { name: 'Ouvrir le menu' }));
    const mobileSidebar = screen.getByRole('button', { name: 'Fermer le menu' }).closest('aside')!;
    await userEvent.click(within(mobileSidebar).getByRole('link', { name: 'Configuration MLM' }));
    expect(await screen.findByRole('heading', { name: 'Configuration du réseau' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Fermer le menu' })).not.toBeInTheDocument();
  });

  it.each<Role>(['GERANT', 'AGENT', 'FORMATEUR', 'CLIENT'])('masque le lien à %s dans les deux menus', async role => {
    renderLayout(role);
    expect(screen.queryByRole('link', { name: 'Configuration MLM' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ouvrir le menu' }));
    expect(screen.getByRole('button', { name: 'Fermer le menu' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Configuration MLM' })).not.toBeInTheDocument();
  });
});
