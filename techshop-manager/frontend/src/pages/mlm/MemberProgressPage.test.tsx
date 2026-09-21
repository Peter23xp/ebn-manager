import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import MemberProgressPage from './MemberProgressPage';
import { MatrixGrid } from '@/components/mlm/MatrixGrid';
import { WalletCard } from '@/components/portal/WalletCard';
import { builder, lot, progressData, renderMlm, sapphire, summary } from './task6.fixtures';
import { useAuthStore } from '@/store/auth.store';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', () => ({ api: { get } }));

describe('Task 6 — progression et finances serveur', () => {
  beforeEach(() => { useAuthStore.getState().setAuth({ id: 'staff', name: 'Staff', role: 'GERANT' }, 'synthetic'); get.mockReset(); get.mockResolvedValue({ data: progressData }); });

  it('affiche Builder en cours avant 4/4 malgré le niveau technique Builder', async () => {
    renderMlm(<MemberProgressPage />);
    expect(await screen.findByRole('heading', { name: 'Builder en cours' })).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Progression de génération' })).toHaveAttribute('aria-valuenow', '75');
    expect(within(screen.getByRole('progressbar').parentElement!).getByText('3 / 4 positions validées')).toBeInTheDocument();
  });

  it('après Builder acquis vise 16 places sans confondre recrutements et enfants matriciels', async () => {
    get.mockResolvedValue({ data: { ...progressData, progression: { ...progressData.progression, currentLevel: builder, nextLevel: sapphire, currentGeneration: 2, completedPositions: 5, requiredPositions: 16, remainingPositions: 11, progressPercentage: 31.25, highestLevelAchieved: 1 } } });
    renderMlm(<MemberProgressPage />);
    expect(await screen.findByText('5 / 16 positions validées')).toBeInTheDocument();
    expect(screen.getByText('Alice Recruteur')).toBeInTheDocument();
    expect(screen.getByText('Paul Parent')).toBeInTheDocument();
    expect(screen.getByText('Recrutements personnels', { selector: 'dt' }).parentElement).toHaveTextContent('7');
    expect(screen.getByText('Enfants matriciels').parentElement).toHaveTextContent('3');
    expect(screen.getByText('Total descendants').parentElement).toHaveTextContent('11');
  });

  it('termine au rang 8 sans objectif de génération 9', async () => {
    const crown = { ...builder, id: 8, ordre: 8, nom: 'Crown Ambassadeur' };
    get.mockResolvedValue({ data: { ...progressData, progression: { currentLevel: crown, nextLevel: null, currentGeneration: 8, completedPositions: 65536, requiredPositions: 65536, remainingPositions: 0, progressPercentage: 100, highestLevelAchieved: 8 } } });
    renderMlm(<MemberProgressPage />);
    expect(await screen.findByText('Parcours complet — rang 8 atteint')).toBeInTheDocument();
    expect(screen.queryByText(/génération 9/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/prête pour promotion/i)).not.toBeInTheDocument();
  });

  it('sépare 40 générés, 24 immédiats historiques, 16 retenus et 9 disponibles', async () => {
    renderMlm(<MemberProgressPage />);
    await screen.findByRole('heading', { name: 'Serge Mutombo' });
    expect(screen.getByText('Total généré').parentElement).toHaveTextContent('40');
    expect(screen.getByText('Immédiat crédité (historique)').parentElement).toHaveTextContent('24');
    expect(screen.getByText('Retenu non échu').parentElement).toHaveTextContent('16');
    expect(screen.getByText('Disponible courant').parentElement).toHaveTextContent('9');
    expect(within(screen.getByRole('region', { name: 'Synthèse financière' })).getByText(/Source : serveur/)).toBeInTheDocument();
  });

  it('ne matérialise pas de cases physiques pour une génération agrégée', () => {
    renderMlm(<MatrixGrid matrix={{ id: 'matrix-8', niveau: { ...builder, ordre: 8 }, requiredPositions: 65536, occupiedPositions: 1200, filleulsValides: 1100, positions: [], estComplete: false } as any} />);
    expect(screen.getByText('1100 / 65536 positions validées')).toBeInTheDocument();
    expect(screen.getByText('1200 positions occupées')).toBeInTheDocument();
    expect(screen.queryAllByText('Position libre')).toHaveLength(0);
  });

  it('garde une place occupée non validée et les vrais numéros des places libres', () => {
    renderMlm(<MatrixGrid matrix={{ id: 'matrix-1', niveau: builder, requiredPositions: 4, occupiedPositions: 1, filleulsValides: 0, positions: [{ id: 'slot-3', numeroPosition: 3, filleulId: 'suspended', estValide: false, filleul: { client: { prenom: 'Jean', nom: 'Suspendu' } } }] } as any} />);
    expect(screen.getByText('Jean Suspendu')).toBeInTheDocument();
    expect(screen.getByText('Occupée — non validée')).toBeInTheDocument();
    expect(screen.getAllByText('Position libre')).toHaveLength(3);
  });

  it('le portail distingue échéance serveur et restitution effective en heure locale', () => {
    renderMlm(<WalletCard {...{ solde: 9, gainsTotaux: 40, soldeReinvesti: 16, lots: [lot], financialSummary: summary, onWithdraw: vi.fn() } as any} />);
    expect(screen.getByText(/Échéance : 24\/10\/2026/)).toBeInTheDocument();
    expect(screen.getByText('Retenue en cours')).toBeInTheDocument();
    expect(screen.getByText('Immédiat crédité (historique)').parentElement).toHaveTextContent('24');
    expect(screen.queryByText(/libéré le/i)).not.toBeInTheDocument();
  });
});
