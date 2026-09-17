import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '@/App';
import { builder } from './task6.fixtures';

const { get, put, auth } = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), auth: { isAuthenticated: true, user: { role: 'DIRECTEUR_REGIONAL' } } }));
vi.mock('@/lib/api', () => ({ api: { get, put } }));
vi.mock('@/store/auth.store', () => ({ useAuthStore: (selector?: any) => selector ? selector(auth) : auth }));
vi.mock('@/components/layout/AppLayout', async () => {
  const { Outlet } = await import('react-router-dom');
  return { AppLayout: () => <Outlet /> };
});
vi.mock('@/pages/dashboard/DashboardPage', () => ({ default: () => <h1>Tableau de bord</h1> }));

const calendar = { year: 2026, holidays: ['2026-01-01'], version: 'v1', source: 'Texte officiel', timezone: 'Africa/Lubumbashi' };

function renderConfigRoute() {
  window.history.replaceState({}, '', '/mlm/config');
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><App /></QueryClientProvider>);
}

describe('Task 6 review — actual config route permissions', () => {
  beforeEach(() => {
    auth.user.role = 'DIRECTEUR_REGIONAL';
    get.mockReset(); put.mockReset();
    get.mockImplementation(async (url: string) => {
      if (url === '/mlm/config') return { data: [builder] };
      if (url === '/mlm/config/calendar') return { data: [calendar] };
      throw new Error(`Unexpected request: ${url}`);
    });
    put.mockResolvedValue({ data: calendar });
  });

  it('lets a director reach the calendar through App and RoleGuard without enabling writes', async () => {
    renderConfigRoute();
    expect(await screen.findByRole('region', { name: 'Calendrier MLM' })).toBeInTheDocument();
    const version = await screen.findByLabelText('Version du calendrier');
    expect(version).toHaveValue('v1');
    expect(version).toBeDisabled();
    expect(screen.getByLabelText('Jours fériés (une date par ligne)')).toBeDisabled();
    expect(screen.getByLabelText('Source officielle')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Modifier' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Enregistrer le calendrier' })).not.toBeInTheDocument();
    fireEvent.submit(version.closest('form')!);
    expect(put).not.toHaveBeenCalled();
    expect(get).toHaveBeenCalledWith('/mlm/config/calendar');
    expect(window.location.pathname).toBe('/mlm/config');
  });

  it('keeps super-admin calendar writes and level editing available', async () => {
    auth.user.role = 'SUPER_ADMIN';
    renderConfigRoute();
    expect(await screen.findByLabelText('Version du calendrier')).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Modifier' })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer le calendrier' }));
    await waitFor(() => expect(put).toHaveBeenCalledWith('/mlm/config/calendar/2026', { holidays: ['2026-01-01'], version: 'v1', source: 'Texte officiel', timezone: 'Africa/Lubumbashi' }));
  });

  it.each(['GERANT', 'AGENT'])('still blocks %s at the actual route boundary', async role => {
    auth.user.role = role;
    renderConfigRoute();
    await screen.findByRole('heading', { name: 'Tableau de bord' });
    expect(window.location.pathname).toBe('/dashboard');
    expect(get).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });
});
