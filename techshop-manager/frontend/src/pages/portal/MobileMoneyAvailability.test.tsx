import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PortalPointsPage from './PortalPointsPage';
import PortalWithdrawalPage from './PortalWithdrawalPage';
import MlmWithdrawalRequestsPage from '../mlm/MlmWithdrawalRequestsPage';
import RetoursPage from '../ventes/RetoursPage';

const { get, post, put, patch } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn() }));
vi.mock('@/lib/api', () => ({ api: { get, post, put, patch }, getErrorMessage: (error: Error) => error.message }));
vi.mock('@/store/auth.store', () => ({ useAuthStore: (selector?: (state: unknown) => unknown) => {
  const state = { user: { id: 'admin', role: 'SUPER_ADMIN', prenom: 'Admin' }, hasRole: () => true };
  return selector ? selector(state) : state;
} }));
vi.mock('@/components/portal/PortalLayout', () => ({ PortalLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
const message = 'Le paiement Mobile Money est en cours de développement. Veuillez utiliser le paiement en espèces.';
const wallet = { soldeDisponible: 100, soldeDisponibleRetrait: 100, soldeReserve: 0, soldeReinvesti: 0, totalGagne: 100 };
const request = { id: 'mobile', montant: 10, type: 'MOBILE_MONEY', provider: 'AIRTEL_COD', phoneNumber: '243900000001', statut: 'EN_ATTENTE', commissionIds: [], createdAt: '2026-09-17T08:00:00Z', membre: { id: 'member', matricule: 'EBN-1', client: { id: 'client', prenom: 'Alice', nom: 'Client', telephone: '243900000001' }, level: { id: 1, ordre: 1, nom: 'Bronze', couleur: '#000000' } } };
const sale = { id: 'sale', numeroVente: 'V-1', createdAt: new Date().toISOString(), statut: 'VALIDEE', montantBrut: 10, montantNet: 10, modePaiement: 'MPESA', client: { id: 'client', prenom: 'Alice', nom: 'Client', telephone: '243900000001' }, lignes: [{ id: 'line', produit: { id: 'product', sku: 'P-1', nom: 'Produit test' }, quantite: 1, prixUnitaire: 10, sousTotal: 10, quantiteRetournee: 0, retournee: false }] };

beforeEach(() => {
  vi.clearAllMocks();
  for (const method of [post, put, patch]) method.mockResolvedValue({ data: {} });
  get.mockImplementation(async (url: string) => {
    if (url === '/portal/wallet') return { data: { wallet, reinvestLots: [], stats: { gainsTotaux: 100 } } };
    if (url === '/portal/me') return { data: { client: { id: 'client', prenom: 'Alice', nom: 'Client' } } };
    if (url === '/portal/wallet/transactions') return { data: { transactions: [{ id: 'tx', type: 'DEBIT', montant: -10, description: 'Ancien retrait mobile', createdAt: request.createdAt }], meta: { totalPages: 1 } } };
    if (url === '/portal/withdrawal-requests') return { data: { requests: [request], meta: { totalPages: 1 } } };
    if (url === '/mlm/withdrawal-requests') return { data: { requests: [request, { ...request, id: 'cash', type: 'CASH', membre: { ...request.membre, client: { ...request.membre.client, prenom: 'Cash' } } }, { ...request, id: 'approved', statut: 'APPROUVE', membre: { ...request.membre, client: { ...request.membre.client, prenom: 'Pending' } } }], meta: { totalPages: 1 } } };
    if (url === '/ventes/sale') return { data: sale };
    throw new Error(`Unexpected GET ${url}`);
  });
});

function mount(page: React.ReactNode, path = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Routes><Route path="*" element={page} /><Route path="/portal/commissions" element={<PortalWithdrawalPage />} /></Routes></MemoryRouter></QueryClientProvider>);
}

describe('standalone Mobile Money initiation screens', () => {
  it('blocks portal payouts on programmatic submit and provides an explicit cash path', async () => {
    mount(<PortalPointsPage />);
    await screen.findByText('Ancien retrait mobile');
    fireEvent.change(screen.getByLabelText('Montant en USD'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('Numéro Mobile Money'), { target: { value: '243900000001' } });
    fireEvent.submit(screen.getByLabelText('Montant en USD').closest('form')!);
    expect(post).not.toHaveBeenCalled();
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Demander le retrait' })).toBeDisabled();
    await userEvent.click(screen.getByRole('link', { name: 'Demander un retrait en espèces' }));
    expect(await screen.findByRole('button', { name: 'Espèces' })).toHaveAttribute('aria-pressed', 'true');
    expect(post).not.toHaveBeenCalled();
  });

  it('blocks mobile withdrawal but keeps explicit cash and historical cancellation', async () => {
    mount(<PortalWithdrawalPage />);
    fireEvent.change(await screen.findByLabelText('Montant (USD)'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('Numéro de téléphone'), { target: { value: '243900000001' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Soumettre la demande' }).closest('form')!);
    expect(post).not.toHaveBeenCalled();
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Soumettre la demande' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Espèces' }));
    await userEvent.click(screen.getByRole('button', { name: 'Soumettre la demande' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/portal/withdrawal-requests', { montant: 10, type: 'CASH', provider: undefined, phoneNumber: undefined, notes: undefined }));
    await userEvent.click(await screen.findByRole('button', { name: 'Annuler la demande' }));
    await waitFor(() => expect(patch).toHaveBeenCalledWith('/portal/withdrawal-requests/mobile/cancel'));
  });

  it('blocks new mobile approvals but preserves cash approval and pending reconciliation', async () => {
    mount(<MlmWithdrawalRequestsPage />);
    const mobileRow = (await screen.findByText('Alice Client')).closest('tr')!;
    expect(within(mobileRow).getByRole('button', { name: 'Approuver' })).toBeDisabled();
    expect(within(mobileRow).getByText(message)).toBeInTheDocument();
    expect(within(mobileRow).getByRole('button', { name: 'Rejeter' })).toBeEnabled();
    fireEvent.click(within(mobileRow).getByRole('button', { name: 'Approuver' }));
    expect(put).not.toHaveBeenCalled();
    await userEvent.click(within(screen.getByText('Cash Client').closest('tr')!).getByRole('button', { name: 'Approuver' }));
    await userEvent.click(screen.getByRole('button', { name: "Confirmer l'approbation" }));
    await waitFor(() => expect(put).toHaveBeenCalledWith('/mlm/withdrawal-requests/cash/approve', { approvedById: 'admin', notes: undefined }));
    await userEvent.click(screen.getByRole('button', { name: 'Marquer payé' }));
    await waitFor(() => expect(put).toHaveBeenCalledWith('/mlm/withdrawal-requests/approved/mark-paid'));
  });

  it.each(['MOBILE_MONEY', 'KPAY'])('blocks %s refunds and allows switching explicitly to cash', async mode => {
    mount(<RetoursPage />, '/?venteId=sale');
    await screen.findByText('Produit test');
    fireEvent.click(screen.getAllByRole('checkbox')[0]);
    fireEvent.change(screen.getByLabelText('Motif *'), { target: { value: 'DEFECTUEUX' } });
    const mobile = document.querySelector<HTMLInputElement>(`input[value="${mode}"]`)!;
    fireEvent.click(mobile);
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /VALIDER LE RETOUR/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /VALIDER LE RETOUR/ }));
    expect(post).not.toHaveBeenCalled();
    fireEvent.click(document.querySelector('input[value="CASH"]')!);
    fireEvent.click(screen.getByLabelText('Je confirme que les produits sont récupérés physiquement.'));
    await userEvent.click(screen.getByRole('button', { name: /VALIDER LE RETOUR/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Valider' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/ventes/sale/retour', expect.objectContaining({ modeRemboursement: 'CASH' })));
  });
});
