import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import OnboardingRecitPage from './OnboardingRecitPage';

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({ api: { get, post }, getErrorMessage: () => 'Erreur réseau' }));
vi.mock('@/store/auth.store', () => ({ useAuthStore: () => ({ user: { role: 'AGENT', siteId: 'site-1' }, hasRole: () => true }) }));

const alice = { id: 'alice', codeParrain: 'EBN-ALICE', nom: 'Alice Parrain', telephone: '+243900000010', statut: 'ACTIF' };
const bruno = { id: 'bruno', codeParrain: 'EBN-BRUNO', nom: 'Bruno Parrain', telephone: '+243900000020', statut: 'EN_COURS' };
const searchPlaceholder = 'Matricule, téléphone ou nom du parrain…';

beforeEach(() => {
  get.mockReset(); post.mockReset();
  get.mockImplementation(async (url: string) => {
    if (url === '/config') return { data: { montantRecit: 5000 } };
    if (url.startsWith('/clients/check-phone/')) return { data: { exists: false } };
    if (url.startsWith('/clients/search-parrain?')) return { data: { results: url.includes('Alice') ? [alice] : [bruno] } };
    throw new Error(`Unexpected request: ${url}`);
  });
  post.mockImplementation(async (_url: string, body: Record<string, unknown>) => ({ data: { client: { id: `client-${body.telephone}`, ...body }, etapeId: 'step' } }));
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter><OnboardingRecitPage /></MemoryRouter></QueryClientProvider>);
  return userEvent.setup();
}

async function fillClient(user: ReturnType<typeof userEvent.setup>, name: string, phone: string) {
  await user.type(screen.getByLabelText('Prénom *'), name);
  await user.type(screen.getByLabelText('Nom *'), 'Client');
  await user.type(screen.getByPlaceholderText('8X XXX XXXX'), phone);
}

async function selectParrain(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.type(screen.getByPlaceholderText(searchPlaceholder), name);
  await user.click(await screen.findByRole('button', { name: new RegExp(`${name} Parrain`) }));
  expect(screen.getByRole('button', { name: 'Effacer le parrain' })).toBeInTheDocument();
}

describe('Successive récit registrations', () => {
  it('blocks mobile and programmatic form submission, then allows explicit cash', async () => {
    const user = renderPage();
    await fillClient(user, 'Premier', '900000001');
    await user.click(screen.getByLabelText('Paiement mobile'));
    fireEvent.submit(screen.getByLabelText('Prénom *').closest('form')!);
    await waitFor(() => expect(screen.getByLabelText('Prénom *')).toHaveValue('Premier'));
    expect(post).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Payer par Mobile Money' })).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Le paiement Mobile Money est en cours de développement. Veuillez utiliser le paiement en espèces.');
    await user.click(screen.getByLabelText('Cash'));
    await user.click(screen.getByRole('button', { name: '+ Enregistrer ce client' }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0][1].modePaiement).toBe('CASH');
  });

  it.each(['CASH'])('clears the displayed recruiter after %s and sends the newly selected recruiter for the second client', async mode => {
    const user = renderPage();
    await fillClient(user, 'Premier', '900000001');
    await selectParrain(user, 'Alice');
    if (mode === 'KPAY') {
      await user.click(screen.getByLabelText('Paiement mobile'));
      await user.type(screen.getByLabelText('Numéro Mobile Money'), '900000001');
    }
    const submit = () => user.click(screen.getByRole('button', { name: mode === 'KPAY' ? 'Payer par Mobile Money' : '+ Enregistrer ce client' }));
    await submit();
    await waitFor(() => expect(screen.getByLabelText('Prénom *')).toHaveValue(''));
    expect(screen.queryByText('Alice Parrain')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText(searchPlaceholder)).toHaveValue('');
    expect(post.mock.calls[0][1]).toMatchObject({ telephone: '+243900000001', codeParrain: 'EBN-ALICE' });
    expect(screen.getByLabelText('Montant payé * (CDF)')).toHaveValue(5000);
    await fillClient(user, 'Second', '900000002');
    await selectParrain(user, 'Bruno');
    await submit();
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(post.mock.calls[1][0]).toBe(mode === 'KPAY' ? '/clients/onboarding/recit/kpay/init' : '/clients/onboarding/recit');
    expect(post.mock.calls[1][1]).toMatchObject({ telephone: '+243900000002', codeParrain: 'EBN-BRUNO', siteId: 'site-1', montantRecit: 5000 });
  });

  it('allows the same recruiter to be explicitly selected again for a second client', async () => {
    const user = renderPage();
    await fillClient(user, 'Premier', '900000001');
    await selectParrain(user, 'Alice');
    await user.click(screen.getByRole('button', { name: '+ Enregistrer ce client' }));
    await waitFor(() => expect(screen.getByLabelText('Prénom *')).toHaveValue(''));
    await fillClient(user, 'Second', '900000002');
    await selectParrain(user, 'Alice');
    await user.click(screen.getByRole('button', { name: '+ Enregistrer ce client' }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(post.mock.calls[1][1]).toMatchObject({ telephone: '+243900000002', codeParrain: 'EBN-ALICE' });
  });

  it('does not silently reuse the previous recruiter when the second client has none', async () => {
    const user = renderPage();
    await fillClient(user, 'Premier', '900000001');
    await selectParrain(user, 'Alice');
    await user.click(screen.getByRole('button', { name: '+ Enregistrer ce client' }));
    await waitFor(() => expect(screen.getByLabelText('Prénom *')).toHaveValue(''));
    expect(screen.queryByRole('button', { name: 'Effacer le parrain' })).not.toBeInTheDocument();
    await fillClient(user, 'Second', '900000002');
    await user.click(screen.getByRole('button', { name: '+ Enregistrer ce client' }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(post.mock.calls[1][1].codeParrain).toBeUndefined();
  });

  it('preserves the selected recruiter after an error and sends it on retry', async () => {
    const user = renderPage();
    post.mockRejectedValueOnce(new Error('offline'));
    await fillClient(user, 'Premier', '900000001');
    await selectParrain(user, 'Alice');
    await user.click(screen.getByRole('button', { name: '+ Enregistrer ce client' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '+ Enregistrer ce client' })).toBeEnabled());
    expect(screen.getByText('Alice Parrain')).toBeInTheDocument();
    expect(screen.getByLabelText('Prénom *')).toHaveValue('Premier');
    await user.click(screen.getByRole('button', { name: '+ Enregistrer ce client' }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(post.mock.calls[1][1].codeParrain).toBe('EBN-ALICE');
  });
});
