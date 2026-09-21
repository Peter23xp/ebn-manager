import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthGuard } from './AuthGuard';
import { AppLayout } from './AppLayout';
import { PortalHeader } from '@/components/portal/PortalHeader';
import { useAuthStore } from '@/store/auth.store';
import type { Role } from '@/types';

vi.mock('@/hooks/useOnlineSync', () => ({ useOnlineSync: () => undefined }));
vi.mock('@/components/layout/NotificationBell', () => ({ NotificationBell: () => null }));

function renderSession(path: string) {
  return render(<MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <Routes>
      <Route path="/" element={<h1>Accueil public</h1>} />
      <Route path="/login" element={<h1>Connexion staff</h1>} />
      <Route path="/portal/home" element={<AuthGuard><PortalHeader /><p>Contenu privé client</p></AuthGuard>} />
      <Route element={<AuthGuard><AppLayout /></AuthGuard>}>
        <Route path="/dashboard" element={<p>Contenu privé staff</p>} />
      </Route>
    </Routes>
  </MemoryRouter>);
}

beforeEach(() => {
  localStorage.clear();
  useAuthStore.setState(useAuthStore.getInitialState(), true);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('Retour à l’accueil après déconnexion', () => {
  it.each<[Role, string, string]>([
    ['AGENT', '/dashboard', 'Déconnexion'],
    ['CAISSIER' as Role, '/dashboard', 'Déconnexion'],
    ['CLIENT', '/portal/home', 'Se déconnecter'],
  ])('renvoie %s à l’accueil après le bouton de déconnexion', async (role, path, button) => {
    useAuthStore.getState().setAuth({ id: 'member', name: 'Compte test', role }, 'session-token');
    renderSession(path);
    await userEvent.click(screen.getByRole('button', { name: button }));
    expect(await screen.findByRole('heading', { name: 'Accueil public' })).toBeInTheDocument();
    expect(screen.queryByText(/Contenu privé/)).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Connexion staff' })).not.toBeInTheDocument();
    expect(useAuthStore.getState()).toMatchObject({ isAuthenticated: false, user: null, accessToken: null });
    expect(localStorage.getItem('ebn_auth_v1')).toBeNull();
  });

  it.each<[Role, string]>([['AGENT', '/dashboard'], ['CAISSIER' as Role, '/dashboard'], ['CLIENT', '/portal/home']])('ne laisse pas le garde renvoyer %s vers login lorsque la session se termine', async (role, path) => {
    useAuthStore.getState().setAuth({ id: 'member', name: 'Compte test', role }, 'session-token');
    renderSession(path);
    act(() => useAuthStore.getState().logout());
    expect(await screen.findByRole('heading', { name: 'Accueil public' })).toBeInTheDocument();
    expect(screen.queryByText(/Contenu privé/)).not.toBeInTheDocument();
  });

  it('conserve la session si le client annule la confirmation', async () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    useAuthStore.getState().setAuth({ id: 'member', name: 'Compte test', role: 'CLIENT' }, 'session-token');
    renderSession('/portal/home');
    await userEvent.click(screen.getByRole('button', { name: 'Se déconnecter' }));
    expect(screen.getByText('Contenu privé client')).toBeInTheDocument();
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(localStorage.getItem('ebn_auth_v1')).not.toBeNull();
  });

  it('continue à protéger une page privée ouverte sans session', async () => {
    renderSession('/dashboard');
    expect(await screen.findByRole('heading', { name: 'Connexion staff' })).toBeInTheDocument();
    expect(screen.queryByText(/Contenu privé/)).not.toBeInTheDocument();
  });

  it('autorise une nouvelle connexion après une déconnexion', () => {
    useAuthStore.getState().logout();
    useAuthStore.getState().setAuth({ id: 'new-member', name: 'Nouveau compte', role: 'CLIENT' }, 'new-token');
    renderSession('/portal/home');
    expect(screen.getByText('Contenu privé client')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Accueil public' })).not.toBeInTheDocument();
  });
});
