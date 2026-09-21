import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HelmetProvider } from 'react-helmet-async';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import LoginPage from './LoginPage';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import type { Role } from '@/types';

beforeEach(() => {
  localStorage.clear();
  useAuthStore.setState(useAuthStore.getInitialState(), true);
});

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('staff login destinations', () => {
  it.each<[Role, string, string]>([
    ['AGENT', '/dashboard', '/login'],
    ['CAISSIER' as Role, '/sales/pos', '/login'],
    ['SUPER_ADMIN', '/dashboard', '/login'],
    ['GERANT', '/dashboard', '/login'],
    ['DIRECTEUR_REGIONAL', '/dashboard/regional', '/login'],
    ['FORMATEUR', '/clients', '/login'],
    ['CLIENT', '/portal/home', '/login'],
    ['CAISSIER' as Role, '/sales/pos', '/login?redirect=/portal/home'],
    ['AGENT', '/dashboard', '/login?redirect=/portal/home'],
    ['CLIENT', '/portal/home', '/login?redirect=/sales/pos'],
  ])('sends %s to %s from %s', async (role, destination, initial) => {
    vi.spyOn(authApi, 'login').mockResolvedValue({ data: {
      user: { id: 'staff', name: 'Staff', role, siteId: 'site-1' }, accessToken: 'token',
    } } as never);
    render(<HelmetProvider><MemoryRouter initialEntries={[initial]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Routes>
      <Route path="/login" element={<LoginPage />} />
      {['/dashboard', '/dashboard/regional', '/sales/pos', '/clients', '/portal/home'].map((path) => (
        <Route key={path} path={path} element={<h1>{path}</h1>} />
      ))}
    </Routes></MemoryRouter></HelmetProvider>);
    await userEvent.type(screen.getByLabelText('Téléphone ou Email professionnel'), '+243812345678');
    await userEvent.type(screen.getByLabelText('Mot de passe', { exact: true }), 'password');
    await userEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
    expect(await screen.findByRole('heading', { name: destination })).toBeInTheDocument();
    expect(useAuthStore.getState().user).toMatchObject({ role, siteId: 'site-1' });
  });
});
