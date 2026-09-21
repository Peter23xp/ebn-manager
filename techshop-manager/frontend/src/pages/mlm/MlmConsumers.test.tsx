import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HelmetProvider } from 'react-helmet-async';
import WalletPage from './WalletPage';
import MlmMembersPage from './MlmMembersPage';
import PortalPointsPage from '@/pages/portal/PortalPointsPage';
import PortalWithdrawalPage from '@/pages/portal/PortalWithdrawalPage';
import { ReferralTree } from '@/components/portal/ReferralTree';
import { builder, lot, member, progression, renderMlm, summary, treeNode } from './task6.fixtures';

const { get, auth } = vi.hoisted(() => ({ get: vi.fn(), auth: { isAuthenticated: true, sessionVersion: 1, user: { role: 'CLIENT', id: 'client-1', prenom: 'Serge', nom: 'Mutombo' }, logout: vi.fn() } }));
vi.mock('@/lib/api', () => ({ api: { get }, authApi: { logout: vi.fn() } }));
vi.mock('@/store/auth.store', () => ({ useAuthStore: Object.assign((selector?: any) => selector ? selector(auth) : auth, { getState: () => auth }) }));
const wallet = { id: 'wallet-1', membreId: member.id, membre: member, soldeDisponible: 9, soldeDisponibleRetrait: 7, soldeReserve: 2, soldeReinvesti: 16, totalGagne: 40, financialSummary: summary, reinvestLots: [lot] };

describe('Task 6 — consommateurs MLM et portail', () => {
  beforeEach(() => {
    auth.user.role = 'CLIENT';
    get.mockReset();
    get.mockImplementation(async (url: string) => {
      if (url === '/mlm/members') return { data: { membres: [{ ...member, matrixParent: undefined, matrixParentId: 'parent-id', currentLevel: null, progression, personalRecruitCount: 7, directMatrixChildrenCount: 3, totalDescendants: 11 }], meta: { totalPages: 1 } } };
      if (url === '/mlm/config') return { data: [builder] };
      if (url === '/mlm/stats') return { data: { totalCommissionsVerseesUSD: '777.77', soldeDisponibleTotalUSD: '888.88', membresActifs: 12 } };
      if (url === '/portal/wallet') return { data: { wallet, financialSummary: summary, reinvestLots: [lot], stats: { gainsTotaux: 40 } } };
      if (url.includes('/wallet/transactions')) return { data: { transactions: [{ id: 'tx-1', type: 'COMMISSION', montant: 24, createdAt: '2026-09-17T00:00:00Z' }], meta: { total: 1, page: 1, totalPages: 1 } } };
      if (url.includes('/withdrawal-requests')) return { data: { requests: [], meta: { totalPages: 1 } } };
      return { data: wallet };
    });
  });

  it('affiche les totaux réseau du serveur au lieu de sommer une page de portefeuilles', async () => {
    auth.user.role = 'GERANT';
    renderMlm(<WalletPage />);
    expect(await screen.findByText(/888,88 USD/)).toBeInTheDocument();
    expect(screen.getByText(/777,77 USD/)).toBeInTheDocument();
    expect(screen.queryByText('Crédits (page)')).not.toBeInTheDocument();
  });

  it('affiche les finances et retenues du membre choisi sans sommer ses transactions', async () => {
    auth.user.role = 'GERANT';
    renderMlm(<WalletPage />);
    await screen.findByRole('option', { name: /Serge Mutombo/ });
    fireEvent.change(screen.getByLabelText('Filtrer les transactions par membre'), { target: { value: 'member-1' } });
    expect((await screen.findByText('Immédiat crédité (historique)')).parentElement).toHaveTextContent('24,00 USD');
    expect(screen.getByText('Disponible courant').parentElement).toHaveTextContent('9,00 USD');
    expect(screen.getByText('Retenu non échu').parentElement).toHaveTextContent('16,00 USD');
  });

  it('la liste des membres ne présente pas le niveau technique comme acquis', async () => {
    renderMlm(<MlmMembersPage />);
    expect(await screen.findByText('Builder en cours')).toBeInTheDocument();
    expect(screen.getByText('Parent non fourni')).toBeInTheDocument();
    expect(screen.queryByText('parent-id')).not.toBeInTheDocument();
    expect(screen.getByText(/7 recrutements personnels directs/)).toBeInTheDocument();
  });

  it('l’historique portail montre le split financier et les dates serveur', async () => {
    renderMlm(<HelmetProvider><PortalPointsPage /></HelmetProvider>);
    await waitFor(() => expect(screen.getByText('Immédiat crédité (historique)').parentElement).toHaveTextContent('24,00 USD'));
    expect(screen.getByText(/Échéance : 24\/10\/2026/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Restituer la retenue' })).not.toBeInTheDocument();
  });

  it('le retrait portail explique les jours ouvrables et non une libération automatique', async () => {
    renderMlm(<HelmetProvider><PortalWithdrawalPage /></HelmetProvider>);
    expect(await screen.findByText(/30 jours ouvrables après validation/)).toBeInTheDocument();
    expect(screen.queryByText(/libéré 30 jours après attribution/)).not.toBeInTheDocument();
  });

  it('utilise matrixTree quand fourni sans reconstruire les parents depuis parrainId', async () => {
    const child = { ...treeNode, id: 'spillover', client: { prenom: 'Enfant', nom: 'Spillover' }, generation: 1, hasMore: false };
    renderMlm(<ReferralTree {...{ nodes: [], total: 0, isLoading: false, matrixTree: { ...treeNode, children: [child], hasMore: false } } as any} />);
    expect(screen.getByText('Réseau matriciel')).toBeInTheDocument();
    expect(screen.getByText('Enfant Spillover')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Détails de Enfant Spillover'));
    expect(screen.getAllByText('Alice Recruteur').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Paul Parent').length).toBeGreaterThan(0);
  });

  it('sans matrixTree nomme explicitement le réseau de recrutement personnel', () => {
    renderMlm(<ReferralTree nodes={[{ id: 'personal', prenom: 'Jean', nom: 'Recruté', statut: 'ACTIF', dateInscription: '2026-09-17' }]} total={1} isLoading={false} />);
    expect(screen.getByText('Réseau de recrutement personnel')).toBeInTheDocument();
    expect(screen.getByText(/Les placements matriciels ne sont pas fournis/)).toBeInTheDocument();
  });
});
