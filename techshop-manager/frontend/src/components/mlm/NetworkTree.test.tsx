import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import { ReferralTree } from '@/components/portal/ReferralTree';
import { MatrixNetworkTree } from './MatrixNetworkTree';
import { renderMlm, treeNode } from '@/pages/mlm/task6.fixtures';
import type { MatrixTreeNode } from '@/types/mlm';

function memberNode(id: string, position: number | null = null, children: MatrixTreeNode[] = []): MatrixTreeNode {
  return {
    ...treeNode, id, client: { prenom: id, nom: 'Membre' }, position, children,
    directMatrixChildrenCount: children.length,
    emptyPositions: [1, 2, 3, 4].filter(slot => !children.some(child => child.position === slot)),
    hasMore: false,
  };
}

function renderTree(root: MatrixTreeNode) {
  return renderMlm(<ReferralTree matrixTree={root} nodes={[]} total={0} isLoading={false} />);
}

describe('Arbre vertical commun', () => {
  it('relie une racine à quatre enfants puis à seize petits-enfants, sans ajouter une génération fictive', () => {
    const children = [1, 2, 3, 4].map(slot => memberNode(`P${slot}`, slot,
      [1, 2, 3, 4].map(place => memberNode(`P${slot}-${place}`, place))));
    renderTree(memberNode('Racine', null, children));
    const diagram = screen.getByRole('region', { name: 'Arbre du réseau' });
    expect(within(diagram).getAllByRole('button', { name: /^Détails de/ })).toHaveLength(21);
    expect(diagram.querySelectorAll('svg[data-tree-connectors] line')).toHaveLength(20);
    expect(screen.queryByText('Place libre')).not.toBeInTheDocument();
  });

  it('garde les places vides et les numéros réels sans déplacer visuellement un membre', () => {
    renderTree(memberNode('Racine', null, [memberNode('Troisième', 3), memberNode('Premier', 1)]));
    const positions = screen.getByRole('list', { name: 'Positions de Racine Membre' });
    const slots = Array.from(positions.children);
    expect(slots).toHaveLength(4);
    expect(slots[0]).toHaveTextContent('Premier Membre');
    expect(slots[1]).toHaveTextContent('Place libre');
    expect(slots[2]).toHaveTextContent('Troisième Membre');
    expect(slots[3]).toHaveTextContent('Place libre');
  });

  it('ne présente jamais une position non chargée comme une place libre', () => {
    renderTree({ ...memberNode('Racine'), children: [], directMatrixChildrenCount: 3, emptyPositions: [4], hasMore: true });
    const slots = Array.from(screen.getByRole('list', { name: 'Positions de Racine Membre' }).children);
    expect(slots.slice(0, 3).every(slot => slot.textContent?.includes('Non chargé'))).toBe(true);
    expect(slots[3]).toHaveTextContent('Place libre');
    expect(screen.getByRole('button', { name: 'Charger les enfants de Racine Membre' })).toBeInTheDocument();
  });

  it('replie une branche et la rouvre sans perdre ses membres', async () => {
    renderTree(memberNode('Racine', null, [memberNode('Enfant', 1)]));
    await userEvent.click(screen.getByRole('button', { name: 'Masquer les branches de Racine Membre' }));
    expect(screen.queryByRole('button', { name: 'Détails de Enfant Membre' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Afficher les branches de Racine Membre' }));
    expect(screen.getByRole('button', { name: 'Détails de Enfant Membre' })).toBeInTheDocument();
  });

  it('zoome puis réinitialise et conserve les détails recruteur / parent matriciel au clic', async () => {
    renderTree(memberNode('Racine'));
    const zoom = screen.getByLabelText('Zoom actuel');
    expect(zoom).toHaveTextContent('100 %');
    await userEvent.click(screen.getByRole('button', { name: 'Zoom avant' }));
    expect(zoom).toHaveTextContent('125 %');
    await userEvent.click(screen.getByRole('button', { name: 'Zoom arrière' }));
    expect(zoom).toHaveTextContent('100 %');
    await userEvent.click(screen.getByRole('button', { name: 'Recentrer sur la racine' }));
    await userEvent.click(screen.getByRole('button', { name: 'Détails de Racine Membre' }));
    const details = screen.getByRole('region', { name: 'Détails de Racine Membre' });
    expect(within(details).getByText('Alice Recruteur')).toBeInTheDocument();
    expect(within(details).getByText('Paul Parent')).toBeInTheDocument();
    expect(within(details).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '75');
  });

  it('applique le même diagramme au recrutement personnel sans tronquer au quatrième filleul', () => {
    const nodes = [1, 2, 3, 4, 5].map(index => ({
      id: `f-${index}`, prenom: `Filleul${index}`, nom: 'Personnel', statut: 'ACTIF' as const,
      dateInscription: '2026-09-17', parrainId: index === 1 ? undefined : 'f-1',
    }));
    nodes.push({ ...nodes[4], id: 'f-6', prenom: 'Sixième' });
    renderMlm(<ReferralTree nodes={nodes} total={6} isLoading={false} />);
    const diagram = screen.getByRole('region', { name: 'Arbre du réseau' });
    expect(within(diagram).getByText('Sixième Personnel')).toBeInTheDocument();
    expect(within(diagram).getByTestId('tree-node-f-6')).toHaveAttribute('data-parent', 'f-1');
    expect(screen.queryByText('Place libre')).not.toBeInTheDocument();
  });

  it('conserve un accès à la fiche de chaque membre pour l’administration', () => {
    renderMlm(<MatrixNetworkTree root={memberNode('Racine')} onSelect={() => undefined} />);
    expect(screen.getByRole('link', { name: 'Fiche membre de Racine Membre' })).toHaveAttribute('href', '/mlm/members/Racine');
  });

  it('actualise les détails sélectionnés et les ferme si le membre quitte le sous-arbre', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const child = memberNode('Enfant', 1);
    const root = memberNode('Racine', null, [child]);
    const view = (data: MatrixTreeNode) => <QueryClientProvider client={client}><MatrixNetworkTree root={data} /></QueryClientProvider>;
    const { rerender } = render(view(root));
    await userEvent.click(screen.getByRole('button', { name: 'Détails de Enfant Membre' }));
    rerender(view({ ...root, children: [{ ...child, directMatrixChildrenCount: 4, personalRecruitCount: 9, totalDescendants: 18 }] }));
    expect(within(screen.getByRole('region', { name: 'Détails de Enfant Membre' })).getByText('4 / 9 / 18')).toBeInTheDocument();
    rerender(view(memberNode('Racine')));
    expect(screen.queryByRole('region', { name: 'Détails de Enfant Membre' })).not.toBeInTheDocument();
  });

  it('affiche aussi les détails au clic dans le réseau personnel sans inventer un parent matriciel', async () => {
    renderMlm(<ReferralTree nodes={[
      { id: 'parent', prenom: 'Alice', nom: 'Recruteur', statut: 'ACTIF', dateInscription: '2026-09-17' },
      { id: 'child', prenom: 'Jean', nom: 'Filleul', statut: 'EN_COURS', parrainId: 'parent', dateInscription: '2026-09-17' },
    ]} total={2} isLoading={false} />);
    await userEvent.click(screen.getByRole('button', { name: 'Détails de Jean Filleul' }));
    const details = screen.getByRole('region', { name: 'Détails de Jean Filleul' });
    expect(within(details).getByText('Alice Recruteur')).toBeInTheDocument();
    expect(within(details).getByText('Placement matriciel non fourni')).toBeInTheDocument();
  });
});
