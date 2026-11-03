/**
 * PortalPointsPage — portefeuille du membre (solde, retrait mobile money,
 * historique des transactions). Remplace l'ancienne suite « points fidélité »
 * devenue obsolète quand la page a été transformée en portefeuille.
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PortalWalletTransaction } from '@/lib/portal.api';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockHistory = vi.fn();
vi.mock('@/hooks/usePortalPoints', () => ({ usePortalWalletHistory: () => mockHistory() }));

const mockMlm = vi.fn();
vi.mock('@/hooks/usePortalMlm', () => ({ usePortalMlm: () => mockMlm() }));

const initPayout = vi.fn();
vi.mock('@/lib/portal.api', () => ({ portalApi: { initPayout: (...a: unknown[]) => initPayout(...a) } }));

vi.mock('@/lib/mobile-money', () => ({ MOBILE_MONEY_AVAILABLE: true }));
vi.mock('@/components/payments/MobileMoneyUnavailableNotice', () => ({ MobileMoneyUnavailableNotice: () => null }));
vi.mock('@/components/portal/PortalLayout', () => ({
  PortalLayout: ({ title, children }: { title: string; children: React.ReactNode }) => <div><h1>{title}</h1>{children}</div>,
}));
vi.mock('@/components/mlm/FinancialSummary', () => ({ FinancialSummary: () => <div data-testid="financial-summary" /> }));
vi.mock('@/components/mlm/ReinvestLots', () => ({ ReinvestLots: () => <div data-testid="reinvest-lots" /> }));
vi.mock('@/components/mlm/ProgressiveCommissions', () => ({ ProgressiveCommissions: () => <div data-testid="progressive" /> }));

import PortalPointsPage from './PortalPointsPage';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TX: PortalWalletTransaction[] = [
  { id: 't1', type: 'COMMISSION', montant: 12.5, description: 'Matrice Builder complète', createdAt: '2026-10-02T09:15:00Z' },
  { id: 't2', type: 'DEBIT', montant: 5, description: 'Retrait M-Pesa', createdAt: '2026-10-03T14:00:00Z' },
];

const setTypeFilter = vi.fn();
const fetchNextPage = vi.fn();
const retryWallet = vi.fn();

function history(overrides: Record<string, unknown> = {}) {
  return { transactions: TX, typeFilter: 'all', setTypeFilter, isLoading: false, fetchNextPage, hasNextPage: false, isFetchingNextPage: false, ...overrides };
}

function mlm(overrides: Record<string, unknown> = {}) {
  return {
    wallet: { soldeDisponible: 1234.5, totalGagne: 2000 },
    financialSummary: null, progressiveCommissions: [], lots: [],
    error: null, isLoading: false, retryWallet, ...overrides,
  };
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter><PortalPointsPage /></MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockHistory.mockReturnValue(history());
  mockMlm.mockReturnValue(mlm());
});

// ── Solde ─────────────────────────────────────────────────────────────────────

describe('Solde', () => {
  test('affiche le solde disponible et le total gagné en USD', () => {
    renderPage();
    expect(screen.getByText('$1,234.50')).toBeInTheDocument();
    expect(screen.getByText('$2,000.00')).toBeInTheDocument();
  });

  test('affiche un tiret pendant le chargement du portefeuille', () => {
    mockMlm.mockReturnValue(mlm({ isLoading: true }));
    renderPage();
    expect(screen.getAllByText('—')).toHaveLength(2);
  });

  test('signale une erreur et permet de réessayer', async () => {
    mockMlm.mockReturnValue(mlm({ error: new Error('boom') }));
    renderPage();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Portefeuille indisponible');
    await userEvent.click(within(alert).getByRole('button', { name: 'Réessayer' }));
    expect(retryWallet).toHaveBeenCalled();
  });
});

// ── Historique ────────────────────────────────────────────────────────────────

describe('Historique', () => {
  test('propose les filtres Tout, Gains et Retraits', async () => {
    renderPage();
    for (const name of ['Tout', 'Gains', 'Retraits']) expect(screen.getByRole('button', { name })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Gains' }));
    expect(setTypeFilter).toHaveBeenCalledWith('gains');
  });

  test('affiche les gains en positif et les débits en négatif', () => {
    renderPage();
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Commission MLM');
    expect(items[0]).toHaveTextContent('+$12.50');
    expect(items[1]).toHaveTextContent('Retrait / débit');
    expect(items[1]).toHaveTextContent('-$5.00');
  });

  test("affiche un état vide adapté au filtre", () => {
    mockHistory.mockReturnValue(history({ transactions: [], typeFilter: 'retraits' }));
    renderPage();
    expect(screen.getByText('Aucune transaction')).toBeInTheDocument();
    expect(screen.getByText("Vous n'avez pas encore de retraits.")).toBeInTheDocument();
  });

  test('affiche des squelettes pendant le chargement', () => {
    mockHistory.mockReturnValue(history({ transactions: [], isLoading: true }));
    const { container } = renderPage();
    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText('Aucune transaction')).not.toBeInTheDocument();
  });

  test('charge la page suivante quand il en reste', async () => {
    mockHistory.mockReturnValue(history({ hasNextPage: true }));
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Charger plus' }));
    expect(fetchNextPage).toHaveBeenCalled();
    expect(screen.queryByText("Fin de l'historique.")).not.toBeInTheDocument();
  });

  test("indique la fin de l'historique", () => {
    renderPage();
    expect(screen.queryByRole('button', { name: 'Charger plus' })).not.toBeInTheDocument();
    expect(screen.getByText("Fin de l'historique.")).toBeInTheDocument();
  });
});

// ── Retrait ───────────────────────────────────────────────────────────────────

describe('Retrait mobile money', () => {
  async function fillAndSubmit() {
    await userEvent.type(screen.getByLabelText('Montant en USD'), '25');
    await userEvent.selectOptions(screen.getByLabelText('Opérateur'), 'AIRTEL_COD');
    const phone = screen.getByLabelText('Numéro Mobile Money');
    await userEvent.clear(phone);
    await userEvent.type(phone, '243970000000');
    await userEvent.click(screen.getByRole('button', { name: 'Demander le retrait' }));
  }

  test('initie le retrait avec le montant, l’opérateur et le numéro', async () => {
    initPayout.mockResolvedValue({ status: 'PENDING' });
    renderPage();
    await fillAndSubmit();
    expect(initPayout).toHaveBeenCalledWith({ amount: 25, provider: 'AIRTEL_COD', phoneNumber: '243970000000' });
    expect(await screen.findByText('Retrait initié (PENDING).')).toBeInTheDocument();
    expect(screen.getByLabelText('Montant en USD')).toHaveValue(null);
  });

  test('affiche le message du serveur si le retrait échoue', async () => {
    initPayout.mockRejectedValue({ response: { data: { message: 'Solde insuffisant' } } });
    renderPage();
    await fillAndSubmit();
    expect(await screen.findByText('Solde insuffisant')).toBeInTheDocument();
  });
});
