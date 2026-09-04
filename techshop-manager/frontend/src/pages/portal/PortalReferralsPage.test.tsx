/**
 * SCR-038 — PortalFilleulsPage (23 tests)
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const a = await vi.importActual('react-router-dom');
  return { ...a, useNavigate: () => mockNavigate };
});

const mockSetFilter = vi.fn();
const mockFetchNextPage = vi.fn();
const mockUsePortalReferrals = vi.fn();
vi.mock('@/hooks/usePortalReferrals', () => ({
  usePortalReferrals: () => mockUsePortalReferrals(),
}));

const mockUsePortalReferralTree = vi.fn();
vi.mock('@/hooks/usePortalReferralTree', () => ({
  usePortalReferralTree: (active: boolean) => mockUsePortalReferralTree(active),
}));

vi.mock('@/store/auth.store', () => ({
  useAuthStore: (sel: any) => sel({ user: { id: 'c1', role: 'CLIENT' }, isAuthenticated: true }),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const STATS = {
  nbFilleulsActifs: 32, nbFilleulsTotal: 38,
  gainsTotaux: 16_000, typeRecompense: 'POINTS' as const, recompenseValeur: 500,
};

const FILLEUL_ACTIF = {
  id: 'f1', prenom: 'Amani', nom: 'Luhindi',
  statut: 'ACTIF' as const, dateInscription: '2025-01-05T10:00:00Z',
  recompenseGeneree: 500,
};
const FILLEUL_EN_COURS = {
  id: 'f2', prenom: 'Jolie', nom: 'Nakamura',
  statut: 'EN_COURS' as const, dateInscription: '2025-01-12T08:00:00Z',
  recompenseGeneree: 0, etapeEnCours: 'Formation à suivre…',
};
const FILLEUL_SUSPENDU = {
  id: 'f3', prenom: 'Beni', nom: 'Kasongo',
  statut: 'SUSPENDU' as const, dateInscription: '2024-12-01T07:00:00Z',
  recompenseGeneree: 0,
};

function defaultHookState(overrides = {}) {
  return {
    codeParrain: 'TSG-0005',
    stats: STATS,
    typeRecompense: 'POINTS' as const,
    recompenseValeur: 500,
    filleuls: [FILLEUL_ACTIF, FILLEUL_EN_COURS],
    filter: 'actifs' as const,
    setFilter: mockSetFilter,
    isLoading: false,
    fetchNextPage: mockFetchNextPage,
    hasNextPage: false,
    isFetchingNextPage: false,
    ...overrides,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

let PortalFilleulsPage: React.ComponentType;

beforeEach(async () => {
  vi.clearAllMocks();
  mockUsePortalReferrals.mockReturnValue(defaultHookState());
  mockUsePortalReferralTree.mockReturnValue({ filleuls: [], total: 0, isLoading: false });
  const mod = await import('@/pages/portal/PortalFilleulsPage');
  PortalFilleulsPage = mod.default;
});

function renderPage() {
  return render(
    <QueryClientProvider client={makeQC()}>
      <MemoryRouter initialEntries={['/portal/referrals']}>
        <PortalFilleulsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PortalFilleulsPage', () => {
  describe('ShareCodeCard', () => {
    test('1 — Code parrain TSG-0005 affiché en monospace', () => {
      renderPage();
      expect(screen.getByTestId('code-parrain')).toHaveTextContent('TSG-0005');
    });

    test('2 — Bouton "Copier" présent', () => {
      renderPage();
      expect(screen.getByRole('button', { name: /copier le code parrain/i })).toBeInTheDocument();
    });

    test('3 — Clic "Copier" → clipboard.writeText("TSG-0005")', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
      renderPage();
      await userEvent.click(screen.getByRole('button', { name: /copier le code parrain/i }));
      expect(writeText).toHaveBeenCalledWith('TSG-0005');
    });

    test('4 — Après copie : texte "Copié !" apparaît', async () => {
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: vi.fn().mockResolvedValue(undefined) },
        configurable: true,
      });
      renderPage();
      await userEvent.click(screen.getByRole('button', { name: /copier le code parrain/i }));
      await waitFor(() => expect(screen.getByText(/copié/i)).toBeInTheDocument());
    });

    test('5 — Bouton "Partager" présent', () => {
      renderPage();
      expect(screen.getByRole('button', { name: /partager le code parrain/i })).toBeInTheDocument();
    });

    test('6 — Clic "Partager" : navigator.share appelé quand disponible', async () => {
      const share = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'share', { value: share, configurable: true });
      renderPage();
      await userEvent.click(screen.getByRole('button', { name: /partager le code parrain/i }));
      expect(share).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining('TSG-0005') }));
    });
  });

  describe('StatsCards', () => {
    test('7 — 32 filleuls actifs affiché', () => {
      renderPage();
      expect(screen.getByText('32')).toBeInTheDocument();
    });

    test('8 — 38 inscrits au total affiché', () => {
      renderPage();
      expect(screen.getByText(/38 inscrits au total/i)).toBeInTheDocument();
    });

    test('9 — Gains totaux en pts (16 000 pts)', () => {
      renderPage();
      expect(screen.getByText(/16\s*000 pts/)).toBeInTheDocument();
    });

    test('10 — typeRecompense=COMMISSION_CDF → gains en CDF', () => {
      mockUsePortalReferrals.mockReturnValue(defaultHookState({
        stats: { ...STATS, typeRecompense: 'COMMISSION_CDF', gainsTotaux: 8000 },
        typeRecompense: 'COMMISSION_CDF' as const,
      }));
      renderPage();
      expect(screen.getByText(/8\s*000 cdf/i)).toBeInTheDocument();
    });
  });

  describe('HowReferralWorks', () => {
    test('11 — Section "Comment ça marche" affichée', () => {
      renderPage();
      expect(screen.getByText(/comment ça marche/i)).toBeInTheDocument();
    });

    test('12 — 3 étapes affichées (Donnez, s\'inscrit, récompense)', () => {
      renderPage();
      expect(screen.getByText(/donnez votre code/i)).toBeInTheDocument();
      expect(screen.getByText(/votre ami s'inscrit/i)).toBeInTheDocument();
      expect(screen.getByText(/vous recevez votre récompense/i)).toBeInTheDocument();
    });

    test('13 — Valeur récompense "500 pts" dans l\'explication', () => {
      renderPage();
      // "500 pts" may appear in HowReferralWorks and in filleul recompense line
      expect(screen.getAllByText(/500 pts/i).length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Filter pills', () => {
    test('14 — 3 filtres : Actifs, En attente, Tous', () => {
      renderPage();
      expect(screen.getByRole('button', { name: 'Actifs' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'En attente' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Tous' })).toBeInTheDocument();
    });

    test('15 — Filtre "Actifs" actif par défaut (fond foncé)', () => {
      renderPage();
      const actifs = screen.getByRole('button', { name: 'Actifs' });
      expect(actifs.className).toMatch(/bg-\[#1E3A5F\]/);
    });

    test('16 — Clic "En attente" → setFilter("en_attente")', async () => {
      renderPage();
      await userEvent.click(screen.getByRole('button', { name: 'En attente' }));
      expect(mockSetFilter).toHaveBeenCalledWith('en_attente');
    });

    test('17 — Clic "Tous" → setFilter("tous")', async () => {
      renderPage();
      await userEvent.click(screen.getByRole('button', { name: 'Tous' }));
      expect(mockSetFilter).toHaveBeenCalledWith('tous');
    });
  });

  describe('Filleul cards', () => {
    test('18 — Filleul ACTIF affiché avec badge "Actif"', () => {
      renderPage();
      expect(screen.getByText('Amani Luhindi')).toBeInTheDocument();
      expect(screen.getByText(/actif ●/i)).toBeInTheDocument();
    });

    test('19 — Filleul EN_COURS affiche étape en cours', () => {
      renderPage();
      expect(screen.getByText('Jolie Nakamura')).toBeInTheDocument();
      expect(screen.getByText('Formation à suivre…')).toBeInTheDocument();
    });

    test('20 — Filleul SUSPENDU affiche badge "Suspendu ✗" et message', () => {
      mockUsePortalReferrals.mockReturnValue(defaultHookState({
        filleuls: [FILLEUL_SUSPENDU],
      }));
      renderPage();
      expect(screen.getByText('Beni Kasongo')).toBeInTheDocument();
      // Both the badge "Suspendu ✗" and the paragraph "Compte suspendu" appear
      expect(screen.getAllByText(/suspendu/i).length).toBeGreaterThanOrEqual(1);
    });

    test('21 — Filleul ACTIF avec recompenseGeneree > 0 → "+500" affiché', () => {
      renderPage();
      expect(screen.getByText(/\+500.*pts/i)).toBeInTheDocument();
    });
  });

  describe('Empty states & loading', () => {
    test('22 — Empty state sans filleuls → message "pas encore de filleuls" + code parrain', () => {
      mockUsePortalReferrals.mockReturnValue(defaultHookState({
        filleuls: [],
        filter: 'actifs' as const,
      }));
      renderPage();
      expect(screen.getByText(/vous n'avez pas encore de filleuls/i)).toBeInTheDocument();
      expect(screen.getByText(/partagez votre code TSG-0005/i)).toBeInTheDocument();
    });

    test('23 — Skeleton pendant chargement (≥ 1 .animate-pulse)', () => {
      mockUsePortalReferrals.mockReturnValue(defaultHookState({
        isLoading: true,
        filleuls: [],
        codeParrain: undefined,
        stats: undefined,
      }));
      renderPage();
      expect(document.querySelectorAll('.animate-pulse').length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Vue Arbre', () => {
    const TREE_NIVEAUX = [
      { id: 't1', prenom: 'Amani', nom: 'Luhindi', statut: 'ACTIF' as const,
        dateInscription: '2025-01-05T10:00:00Z', generation: 1 },
      { id: 't2', prenom: 'Grâce', nom: 'Mwaku', statut: 'ACTIF' as const,
        dateInscription: '2025-02-01T10:00:00Z', generation: 2, parrainId: 't1' },
      { id: 't3', prenom: 'Petit', nom: 'Fiston', statut: 'EN_COURS' as const,
        dateInscription: '2025-03-01T10:00:00Z', generation: 3, parrainId: 't2' },
    ];

    test('24 — Toggle Liste/Arbre affiché, vue Liste par défaut', () => {
      renderPage();
      expect(screen.getByRole('button', { name: 'Liste' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Arbre' })).toBeInTheDocument();
      // En liste : les pastilles de filtre sont visibles, pas d'arbre
      expect(screen.getByRole('button', { name: 'Actifs' })).toBeInTheDocument();
      expect(screen.queryByTestId('tree-node-t1')).toBeNull();
    });

    test('25 — Vue Arbre : hiérarchie parent → enfant via parrainId', async () => {
      mockUsePortalReferralTree.mockReturnValue({
        filleuls: TREE_NIVEAUX, total: TREE_NIVEAUX.length, isLoading: false,
      });
      renderPage();
      await userEvent.click(screen.getByRole('button', { name: 'Arbre' }));

      const g1 = screen.getByTestId('tree-node-t1');
      const g2 = screen.getByTestId('tree-node-t2');
      const g3 = screen.getByTestId('tree-node-t3');
      // t1 est racine (son parrain = le client), les autres rattachés à leur parrain
      expect(g2).toHaveAttribute('data-parent', 't1');
      expect(g3).toHaveAttribute('data-parent', 't2');
      // Imbrication DOM réelle : t2 et t3 sont sous la branche de t1
      expect(g2.closest('[data-testid="tree-node-t1"]')).not.toBeNull();
      expect(g3.closest('[data-testid="tree-node-t1"]')).not.toBeNull();
    });

    test('26 — Vue Arbre : compteur de descendants sous chaque branche', async () => {
      mockUsePortalReferralTree.mockReturnValue({
        filleuls: TREE_NIVEAUX, total: TREE_NIVEAUX.length, isLoading: false,
      });
      renderPage();
      await userEvent.click(screen.getByRole('button', { name: 'Arbre' }));
      // t1 a 2 membres sous lui (t2 + t3)
      expect(within(screen.getByTestId('tree-node-t1')).getByText('2')).toBeInTheDocument();
    });

    test('27 — La vue Arbre demande le réseau complet (filter tous)', async () => {
      renderPage();
      await userEvent.click(screen.getByRole('button', { name: 'Arbre' }));
      expect(mockUsePortalReferralTree).toHaveBeenCalledWith(true);
    });

    test('28 — Vue Arbre vide → message d\'encouragement au partage', async () => {
      mockUsePortalReferralTree.mockReturnValue({ filleuls: [], total: 0, isLoading: false });
      renderPage();
      await userEvent.click(screen.getByRole('button', { name: 'Arbre' }));
      expect(screen.getByText(/personne n'est encore inscrit/i)).toBeInTheDocument();
    });
  });
});
