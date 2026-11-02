import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MlmActivationRetry } from './MlmActivationRetry';
import { useAuthStore } from '@/store/auth.store';
import type { ClientDetail } from '@/lib/clients.api';
import type { Role } from '@/types';

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('@/lib/api', () => ({ api: { post }, getErrorMessage: (error: Error) => error.message }));
const client = { id: 'client', statut: 'ACTIF', membre: null, site: { id: 'site-a' } } as ClientDetail;
const activated = { ...client, membre: { matricule: '202611020001', statut: 'ACTIF', level: { ordre: 1, nom: 'Builder' } } };

beforeEach(() => {
  post.mockReset();
  useAuthStore.setState(useAuthStore.getInitialState(), true);
});

function mount(value = client, role: Role = 'CAISSIER', siteId = 'site-a') {
  useAuthStore.getState().setAuth({ id: 'staff', name: 'Staff', role, siteId }, 'test-token');
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={queryClient}><MlmActivationRetry client={value} /></QueryClientProvider>);
  return queryClient;
}

describe('MLM activation retry', () => {
  it('uses only the retry endpoint, blocks double clicks and refreshes the detail and network', async () => {
    let resolve!: (value: unknown) => void;
    post.mockReturnValue(new Promise(done => { resolve = done; }));
    const queryClient = mount();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const button = screen.getByRole('button', { name: 'Relancer le MLM' });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post).toHaveBeenCalledWith('/clients/client/mlm/retry', undefined, { timeout: 120000 });
    expect(screen.getByRole('button', { name: /Relance en cours/ })).toBeDisabled();
    await act(async () => resolve({ data: activated }));
    expect(await screen.findByRole('status')).toHaveTextContent('MLM activé');
    expect(queryClient.getQueriesData({ queryKey: ['client', 'client'] })[0][1]).toEqual(activated);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['clients'] });
    expect(invalidate).toHaveBeenCalledWith(expect.objectContaining({ predicate: expect.any(Function) }));
  });

  it('shows a failure and permits another attempt', async () => {
    post.mockRejectedValueOnce(new Error('Connexion interrompue')).mockResolvedValueOnce({ data: activated });
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Relancer le MLM' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Connexion interrompue');
    fireEvent.click(screen.getByRole('button', { name: 'Relancer le MLM' }));
    expect(await screen.findByRole('status')).toHaveTextContent('MLM activé');
  });

  it('does not claim success if the response still has no member', async () => {
    post.mockResolvedValue({ data: client });
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Relancer le MLM' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it.each(['EN_COURS', 'SUSPENDU', 'ARCHIVE'] as const)('hides the action for %s clients', statut => {
    mount({ ...client, statut });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it.each(['CLIENT', 'FORMATEUR', 'AGENT'] as const)('hides the action for %s', role => {
    mount(client, role);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('hides the action for existing members', () => {
    mount(activated as ClientDetail);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('hides foreign-site clients from a cashier', () => {
    mount(client, 'CAISSIER', 'site-b');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('does not repopulate private caches after logout', async () => {
    let resolve!: (value: unknown) => void;
    post.mockReturnValue(new Promise(done => { resolve = done; }));
    const queryClient = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Relancer le MLM' }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    act(() => useAuthStore.getState().logout());
    await act(async () => resolve({ data: activated }));
    expect(queryClient.getQueriesData({ queryKey: ['client'] })).toEqual([]);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
