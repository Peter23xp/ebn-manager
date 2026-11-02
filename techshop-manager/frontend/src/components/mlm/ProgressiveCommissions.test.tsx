import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ProgressiveCommissions } from './ProgressiveCommissions';
import { progressiveBuilder, progressiveSapphire } from '@/pages/mlm/progressive.fixtures';

describe('unavailable historical generation accounting', () => {
  it('explains sequential unlocking and displays the server completion requirement', () => {
    render(<ProgressiveCommissions summaries={[
      { ...progressiveSapphire, suspendedReason: 'En attente de la complétion de la génération 1 (4 positions validées requises).' },
    ]} />);
    expect(screen.getByText(/Chaque génération rapporte progressivement après la complétion des générations précédentes/)).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Génération 2 — Sapphire' })).toHaveTextContent('4 positions validées requises');
    expect(screen.queryByText(/rapportent indépendamment/)).not.toBeInTheDocument();
  });

  it('labels nullable budgets and accounting as unavailable while preserving known aggregates and other generations', () => {
    render(<ProgressiveCommissions summaries={[
      { ...progressiveBuilder, budgetTotal: null, budgetImmediate: null, budgetHeld: null, accountedPositions: null, remainingTotal: null, suspendedReason: 'Historique incohérent' },
      progressiveSapphire,
    ]} />);
    const invalid = screen.getByRole('group', { name: 'Génération 1 — Builder' });
    for (const label of ['Budget total', 'Budget immédiat', 'Budget retenu', 'Positions déjà comptabilisées', 'Reste à comptabiliser']) {
      expect(within(invalid).getByText(label).parentElement).toHaveTextContent('Indisponible');
      expect(within(invalid).getByText(label).parentElement).not.toHaveTextContent('0,00');
    }
    expect(invalid.querySelector('summary')).toHaveTextContent('Comptabilisation : Indisponible');
    expect(invalid).toHaveTextContent('Historique incohérent');
    expect(within(invalid).getByText('Positions valides actuelles').parentElement).toHaveTextContent('1 / 4');
    expect(within(invalid).getByText('Total généré').parentElement).toHaveTextContent('20,00 USD');
    expect(within(invalid).getByText('Retenues en cours').parentElement).toHaveTextContent('0,00 USD');
    expect(screen.getByRole('group', { name: 'Génération 2 — Sapphire' })).toHaveTextContent('83,33 USD');
  });
});
