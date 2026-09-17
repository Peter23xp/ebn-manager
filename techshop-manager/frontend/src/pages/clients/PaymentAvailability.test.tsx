import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import OnboardingFichePage from './OnboardingFichePage';
import OnboardingRecitResumePage from './OnboardingRecitResumePage';
import OnboardingActivationPage from './OnboardingActivationPage';
import POSPage from '../ventes/POSPage';
import { useCartStore } from '@/store/cart.store';

const { get, post, savePendingVente } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), savePendingVente: vi.fn() }));
vi.mock('@/lib/api', () => ({ api: { get, post }, getErrorMessage: (error: Error) => error.message }));
vi.mock('@/lib/offline', () => ({ savePendingVente }));
vi.mock('@/store/auth.store', () => ({ useAuthStore: () => ({ user: { id: 'agent', role: 'AGENT', siteId: 'site' }, hasRole: () => true }) }));
const client = { id: 'client', prenom: 'Alice', nom: 'Client', telephone: '243900000001', statut: 'EN_COURS', codeParrain: null, siteInscriptionId: 'site', site: { id: 'site', nom: 'Goma' }, parrain: null, onboardingEtapes: [{ etape: 'RECIT', statut: 'COMPLETE', montant: 10 }] };
const product = { id: 'product', sku: 'P-1', nom: 'Produit test', categorie: 'TEST', prixVente: 10, stockDisponible: 10, seuilAlerte: 1, statut: 'OK' as const };

beforeEach(() => {
  vi.clearAllMocks();
  useCartStore.getState().clearCart();
  get.mockImplementation(async (url: string) => {
    if (url === '/clients/client') return { data: client };
    if (url === '/config') return { data: { montantFiche: 10, montantRecit: 10 } };
    if (url === '/clients/next-code') return { data: { nextCode: 'EBN-1' } };
    if (url === '/produits/search') return { data: { produits: [product] } };
    if (url === '/produits/categories') return { data: { categories: [] } };
    if (url === '/sites') return { data: { data: [{ id: 'site', nom: 'Goma', ville: 'Goma', actif: true }] } };
    throw new Error(`Unexpected GET ${url}`);
  });
  post.mockResolvedValue({ data: { client, vente: { id: 'sale', numeroVente: 'V-1', montantNet: 10 } } });
});

function mount(page: React.ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={['/clients/client']}><Routes><Route path="/clients/:id" element={page} /><Route path="*" element={<p>Étape suivante</p>} /></Routes></MemoryRouter></QueryClientProvider>);
}

describe('onboarding and POS payment availability', () => {
  it.each([
    ['fiche', <OnboardingFichePage />],
    ['récit resume', <OnboardingRecitResumePage />],
  ])('blocks mobile in %s and preserves explicit cash', async (_name, page) => {
    mount(page);
    await userEvent.click(await screen.findByLabelText('Paiement mobile'));
    const amount = screen.getByRole('spinbutton');
    fireEvent.change(amount, { target: { value: '10' } });
    await act(async () => { fireEvent.submit(amount.closest('form')!); });
    expect(post).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Le paiement Mobile Money est en cours de développement. Veuillez utiliser le paiement en espèces.');
    expect(screen.getByRole('button', { name: 'Payer par Mobile Money' })).toBeDisabled();
    const extraSubmit = amount.closest('form')!.querySelector('button[type="submit"]');
    if (extraSubmit) expect(extraSubmit).toBeDisabled();
    await userEvent.click(screen.getByLabelText('Cash'));
    await act(async () => { fireEvent.submit(amount.closest('form')!); });
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0][1].modePaiement).toBe('CASH');
  });

  it.each(['M-Pesa', 'Airtel Money'])('blocks POS %s without queuing offline and keeps cash working', async mode => {
    useCartStore.getState().addItem(product);
    useCartStore.getState().setClient(client);
    mount(<POSPage />);
    await userEvent.click(screen.getByRole('button', { name: mode }));
    fireEvent.change(screen.getByLabelText('Numéro Mobile Money'), { target: { value: '243900000001' } });
    fireEvent.click(screen.getByRole('button', { name: 'Payer par Mobile Money' }));
    fireEvent.click(screen.getByRole('button', { name: /Valider —/ }));
    expect(post).not.toHaveBeenCalled();
    expect(savePendingVente).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Le paiement Mobile Money est en cours de développement. Veuillez utiliser le paiement en espèces.');
    await userEvent.click(screen.getByRole('button', { name: 'Espèces' }));
    act(() => useCartStore.getState().setMontantRecu(10));
    await userEvent.click(screen.getByRole('button', { name: /Valider —/ }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/ventes', expect.objectContaining({ modePaiement: 'CASH', montantRecu: 10 })));
  });

  it('preserves cash activation and historical mobile payment labels', async () => {
    const initialGet = get.getMockImplementation()!;
    get.mockImplementation(async (url: string) => url === '/clients/client' ? { data: { ...client, onboardingEtapes: [...client.onboardingEtapes, { etape: 'FICHE', statut: 'COMPLETE', montant: 10, modePaiement: 'MPESA' }] } } : initialGet(url));
    mount(<OnboardingActivationPage />);
    const search = await screen.findByLabelText('Rechercher un produit');
    fireEvent.change(search, { target: { value: 'Produit' } });
    await userEvent.click(await screen.findByRole('option', { name: /Produit test/ }));
    expect(screen.queryByRole('button', { name: 'M-Pesa' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Activer le compte et générer/ }));
    await userEvent.click(screen.getByRole('button', { name: '✓ Activer le compte' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/clients/client/onboarding/activate', { produitId: 'product', modePaiement: 'CASH' }));
  });
});
