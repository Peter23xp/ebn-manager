import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HelmetProvider } from 'react-helmet-async';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import MemberProgressPage from './MemberProgressPage';
import MlmCommissionsPage from './MlmCommissionsPage';
import WalletPage from './WalletPage';
import PortalHomePage from '@/pages/portal/PortalHomePage';
import PortalPointsPage from '@/pages/portal/PortalPointsPage';
import { WalletCard } from '@/components/portal/WalletCard';
import { usePortalMlm } from '@/hooks/usePortalMlm';
import { builder, member, progressData, renderMlm } from './task6.fixtures';
import { catchupCommission, legacyCommission, progressiveBuilder, progressiveCommission, progressiveProgress, progressiveRows, progressiveWallet } from './progressive.fixtures';

const { get, auth } = vi.hoisted(() => ({ get: vi.fn(), auth: { isAuthenticated: true, sessionVersion: 1, user: { id: 'client-1', role: 'SUPER_ADMIN', prenom: 'Serge', nom: 'Mutombo' }, logout: vi.fn() } }));
vi.mock('@/lib/api', () => ({ api: { get }, authApi: { logout: vi.fn() } }));
vi.mock('@/store/auth.store', () => ({ useAuthStore: Object.assign((selector?: any) => selector ? selector(auth) : auth, { getState: () => auth }) }));

function OwnWallet() {
  const data = usePortalMlm();
  return <WalletCard solde={data.wallet?.soldeDisponibleRetrait ?? 0} gainsTotaux={0} soldeReinvesti={0} lots={[]} onWithdraw={() => {}} {...data as any} />;
}

beforeEach(() => {
  auth.user = { id: 'client-1', role: 'SUPER_ADMIN', prenom: 'Serge', nom: 'Mutombo' };
  get.mockReset();
  get.mockImplementation(async (url: string) => {
    if (url.endsWith('/progress')) return { data: progressiveProgress };
    if (url === '/mlm/commissions') return { data: { commissions: [progressiveCommission, catchupCommission, legacyCommission], summary: {}, meta: { totalPages: 1 } } };
    if (url === '/mlm/config') return { data: [builder] };
    if (url === '/mlm/members') return { data: { membres: [member, { ...member, id: 'member-2', client: { ...member.client, prenom: 'Autre' } }], meta: { totalPages: 1 } } };
    if (url === '/mlm/stats') return { data: {} };
    if (url.endsWith('/wallet/transactions')) return { data: { transactions: [], meta: { totalPages: 1 } } };
    if (url.startsWith('/mlm/wallet/')) return { data: { ...progressiveWallet.wallet, financialSummary: progressiveWallet.financialSummary, reinvestLots: [], progressiveCommissions: progressiveRows } };
    if (url === '/portal/wallet') return { data: progressiveWallet };
    if (url === '/portal/me') return { data: { client: member.client, prochainNiveau: null, niveauxConfig: [], nbFilleulsActifs: 1, nbFilleulsTotal: 1, dernierAchats: [] } };
    throw new Error(`Unexpected mocked request: ${url}`);
  });
});

describe('Commissions progressives — lectures et historique', () => {
  it('sépare positions actuelles, positions comptabilisées et rang acquis', async () => {
    renderMlm(<MemberProgressPage />);
    const region = await screen.findByRole('region', { name: 'Progression financière par génération' });
    const builderRow = within(region).getByRole('group', { name: 'Génération 1 — Builder' });
    expect(within(builderRow).getByText('Positions valides actuelles').parentElement).toHaveTextContent('1 / 4');
    expect(within(builderRow).getByText('Positions déjà comptabilisées').parentElement).toHaveTextContent('2 / 4');
    expect(within(region).getByRole('group', { name: 'Génération 2 — Sapphire' })).toHaveTextContent('5,21 USD');
    expect(screen.getByText('Rang acquis : 0 / 8')).toBeInTheDocument();
    expect(screen.queryByText(/après accomplissement et validation/i)).not.toBeInTheDocument();
  });

  it('affiche les montants backend, dont annulations et retenues, sans les convertir en solde', async () => {
    renderMlm(<MemberProgressPage />);
    const region = await screen.findByRole('region', { name: 'Progression financière par génération' });
    const sapphireRow = within(region).getByRole('group', { name: 'Génération 2 — Sapphire' });
    expect(within(sapphireRow).getByText('Budget total').parentElement).toHaveTextContent('83,33 USD');
    expect(within(sapphireRow).getByText('Immédiat crédité (historique)').parentElement).toHaveTextContent('3,13 USD');
    expect(within(sapphireRow).getByText('Retenues en cours').parentElement).toHaveTextContent('2,08 USD');
    expect(within(sapphireRow).getByText('Reste à comptabiliser').parentElement).toHaveTextContent('78,12 USD');
    const builderRow = within(region).getByRole('group', { name: 'Génération 1 — Builder' });
    expect(within(builderRow).getByText('Annulées (droits consommés)').parentElement).toHaveTextContent('10,00 USD');
    expect(within(region).getByText(/ne constitue pas le solde retirable/)).toBeInTheDocument();
    expect(screen.getByText('Disponible courant').parentElement).toHaveTextContent('9,00 USD');
  });

  it('affiche les huit générations et le motif de suspension du serveur', async () => {
    const rows = [4, 16, 64, 256, 1024, 4096, 16384, 65536].map((capacity, index) => ({ ...progressiveBuilder, matrixId: `matrix-${index}`, generation: index + 1, capacity, levelName: `Niveau ${index + 1}`, suspendedReason: index === 7 ? 'Niveau désactivé' : null }));
    get.mockResolvedValue({ data: { ...progressData, progressiveCommissions: rows } });
    renderMlm(<MemberProgressPage />);
    const region = await screen.findByRole('region', { name: 'Progression financière par génération' });
    expect(within(region).getAllByRole('group')).toHaveLength(8);
    expect(within(region).getByText(/Niveau désactivé/)).toBeInTheDocument();
  });

  it('conserve la génération dépliée quand des matrices non commencées sont réordonnées', async () => {
    const rows = progressiveRows.map(row => ({ ...row, matrixId: null }));
    get.mockResolvedValue({ data: { ...progressData, progressiveCommissions: rows } });
    const { client } = renderMlm(<MemberProgressPage />);
    const builderRow = await screen.findByRole('group', { name: 'Génération 1 — Builder' });
    await userEvent.click(within(builderRow).getByText('Génération 1 — Builder', { exact: true }));
    expect(builderRow).toHaveAttribute('open');
    await act(async () => { client.setQueriesData({ queryKey: ['mlm-progress'] }, { ...progressData, progressiveCommissions: [...rows].reverse() }); });
    await waitFor(() => expect(within(screen.getByRole('region', { name: 'Progression financière par génération' })).getAllByRole('group')[0]).toHaveAttribute('aria-label', 'Génération 2 — Sapphire'));
    expect(screen.getByRole('group', { name: 'Génération 1 — Builder' })).toHaveAttribute('open');
    expect(screen.getByRole('group', { name: 'Génération 2 — Sapphire' })).not.toHaveAttribute('open');
  });

  it.each([{ label: 'absente', rows: undefined }, { label: 'vide', rows: [] }])('ne fabrique pas de gains si la liste est $label', async ({ rows }) => {
    get.mockResolvedValue({ data: { ...progressData, progressiveCommissions: rows } });
    renderMlm(<MemberProgressPage />);
    const region = await screen.findByRole('region', { name: 'Progression financière par génération' });
    expect(within(region).getByRole('status')).toHaveTextContent(rows ? 'Aucune progression financière' : 'Progression financière non fournie');
    expect(within(region).queryByText(/0,00 USD/)).not.toBeInTheDocument();
  });

  it('affiche plages et origine sans inventer un filleul pour le rattrapage', async () => {
    renderMlm(<MlmCommissionsPage />);
    const label = await screen.findByText('Rattrapage de génération');
    const row = label.closest('tr')!;
    expect(row).toHaveTextContent('1 → 3');
    expect(row).toHaveTextContent('12,00 USD');
    expect(row).toHaveTextContent('8,00 USD');
    expect(label.parentElement).not.toHaveTextContent('Serge');
    expect(screen.getByText('Progression de génération').closest('tr')).toHaveTextContent('0 → 1');
    const legacy = screen.getByText('Historique sans plage').closest('tr')!;
    expect(legacy).toHaveTextContent('Serge Mutombo');
    expect(legacy).not.toHaveTextContent('→');
  });

  it('affiche aussi les plages et parts dans l’historique du membre', async () => {
    renderMlm(<MemberProgressPage />);
    expect((await screen.findByText('Rattrapage de génération')).closest('tr')).toHaveTextContent('1 → 3');
    expect(screen.getByText(/Immédiat : 12,00 USD/)).toBeInTheDocument();
    expect(screen.getByText(/Retenu : 8,00 USD/)).toBeInTheDocument();
  });

  it('remplace une liste en erreur par une erreur lisible et permet la reprise', async () => {
    const respond = get.getMockImplementation()!;
    let failed = true;
    get.mockImplementation((url: string) => url === '/mlm/commissions' && failed ? Promise.reject(new Error('offline')) : respond(url));
    renderMlm(<MlmCommissionsPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Commissions indisponibles');
    expect(screen.queryByText('Aucune commission trouvée.')).not.toBeInTheDocument();
    failed = false;
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer les commissions' }));
    expect(await screen.findByText('Rattrapage de génération')).toBeInTheDocument();
  });
});

describe('Commissions progressives — consommateurs et périmètre', () => {
  it('utilise les agrégats du portefeuille sélectionné et masque l’ancien membre pendant le chargement', async () => {
    renderMlm(<WalletPage />);
    await screen.findByRole('option', { name: /Serge Mutombo/ });
    expect(get.mock.calls.some(([url]) => url.endsWith('/progress'))).toBe(false);
    fireEvent.change(screen.getByLabelText('Filtrer les transactions par membre'), { target: { value: 'member-1' } });
    expect(await screen.findByRole('group', { name: 'Génération 2 — Sapphire' })).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith('/mlm/wallet/member-1');
    expect(get.mock.calls.some(([url]) => url.endsWith('/progress'))).toBe(false);
    let finish!: (value: unknown) => void;
    const respond = get.getMockImplementation()!;
    get.mockImplementation((url: string) => url === '/mlm/wallet/member-2' ? new Promise(resolve => { finish = resolve; }) : respond(url));
    fireEvent.change(screen.getByLabelText('Filtrer les transactions par membre'), { target: { value: 'member-2' } });
    expect(screen.queryByRole('group', { name: 'Génération 2 — Sapphire' })).not.toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Chargement de la progression financière' })).toBeInTheDocument();
    await act(async () => finish({ data: { ...progressiveWallet.wallet, progressiveCommissions: [] } }));
    expect(await screen.findByText(/Aucune progression financière/)).toBeInTheDocument();
    expect(get.mock.calls.some(([url]) => url.includes('earnings-by-level'))).toBe(false);
  });

  it('masque les agrégats après refus serveur et permet de réessayer sans exposer l’erreur brute', async () => {
    const respond = get.getMockImplementation()!;
    get.mockImplementation((url: string) => url === '/mlm/wallet/member-1' ? Promise.reject({ response: { status: 403, data: { message: 'secret-member' } } }) : respond(url));
    renderMlm(<WalletPage />);
    await screen.findByRole('option', { name: /Serge Mutombo/ });
    fireEvent.change(screen.getByLabelText('Filtrer les transactions par membre'), { target: { value: 'member-1' } });
    const region = screen.getByRole('region', { name: 'Progression financière par génération' });
    expect(await within(region).findByRole('alert')).toHaveTextContent('Progression financière indisponible');
    expect(screen.queryByText(/secret-member/)).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Génération 1 — Builder' })).not.toBeInTheDocument();
  });

  it.each([['accueil', PortalHomePage], ['portefeuille', PortalPointsPage]] as const)('affiche les générations dans le portail depuis le portefeuille propriétaire (%s)', async (_name, Page) => {
    auth.user.role = 'CLIENT';
    renderMlm(<HelmetProvider><Page /></HelmetProvider>);
    const region = await screen.findByRole('region', { name: 'Progression financière par génération' });
    expect(await within(region).findByRole('group', { name: 'Génération 2 — Sapphire' })).toHaveTextContent('5,21 USD');
    expect(get.mock.calls.every(([url]) => url.startsWith('/portal/'))).toBe(true);
    expect(screen.queryByRole('button', { name: 'Restituer la retenue' })).not.toBeInTheDocument();
  });

  it('ne réutilise pas les montants du précédent propriétaire à un changement de compte', async () => {
    auth.user.role = 'CLIENT';
    const view = renderMlm(<OwnWallet />);
    await screen.findByRole('group', { name: 'Génération 2 — Sapphire' });
    auth.user = { ...auth.user, id: 'client-2' };
    get.mockResolvedValue({ data: { ...progressiveWallet, progressiveCommissions: [] } });
    view.rerender(<QueryClientProvider client={view.client}><MemoryRouter><OwnWallet /></MemoryRouter></QueryClientProvider>);
    await waitFor(() => expect(screen.queryByRole('group', { name: 'Génération 2 — Sapphire' })).not.toBeInTheDocument());
    expect(await screen.findByText(/Aucune progression financière/)).toBeInTheDocument();
  });
});
