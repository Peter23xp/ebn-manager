import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth.store';
import { treeNode } from '@/pages/mlm/task6.fixtures';
import type { MatrixTreeNode, PlacementHistory } from '@/types/mlm';
import type { Role } from '@/types';
import { MatrixMemberDetails } from './MatrixMemberDetails';

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({ api: { get, post } }));

const reconciliation: PlacementHistory = {
  id: 'history-check', memberId: 'member-1', recruiterId: 'recruiter',
  oldParentId: 'parent', newParentId: 'parent', oldPosition: 2, newPosition: 2,
  actorId: 'admin', reason: 'Vérification administrative de la remontée automatique',
  operationId: 'operation-check', operationType: 'RECONCILE', createdAt: '2026-09-17T08:00:00Z',
};
const ascent: PlacementHistory = {
  ...reconciliation, id: 'history-ascent', newParentId: 'grandparent', newPosition: 3,
  reason: 'Branche complète', operationType: 'AUTO_ASCEND',
};
const descent: PlacementHistory = {
  ...reconciliation, id: 'history-descent', memberId: 'other-member',
  oldParentId: 'grandparent', newParentId: 'parent', oldPosition: 3, newPosition: 2,
  reason: 'Branche remplacée', operationType: 'AUTO_DESCEND',
};
let currentNode: MatrixTreeNode;
let historyItems: PlacementHistory[];
let client: QueryClient;

function renderDetails(node: MatrixTreeNode = currentNode) {
  return render(<QueryClientProvider client={client}><MatrixMemberDetails node={node} /></QueryClientProvider>);
}

beforeEach(() => {
  currentNode = treeNode;
  historyItems = [];
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } });
  useAuthStore.setState({ user: { id: 'admin', name: 'Administrateur', role: 'SUPER_ADMIN' } });
  get.mockReset();
  post.mockReset();
  get.mockImplementation(async (url: string) => {
    if (url === '/mlm/matrix/member-1/tree') return { data: currentNode };
    if (url === '/mlm/matrix/member-1/history') return { data: { items: historyItems, meta: { total: historyItems.length, page: 1, limit: 20, totalPages: 1 } } };
    throw new Error(`Lecture inattendue : ${url}`);
  });
  post.mockResolvedValue({ data: [reconciliation] });
});

afterEach(() => {
  cleanup();
  client.clear();
  useAuthStore.setState({ user: null });
  vi.restoreAllMocks();
});

describe('Vérification administrative de la remontée automatique', () => {
  it('traduit les opérations de remontée dans l’historique sans masquer les autres opérations', async () => {
    historyItems = [reconciliation, ascent, descent, { ...reconciliation, id: 'history-move', operationType: 'MOVE' }];
    renderDetails();
    expect(await screen.findByText(/^Vérification de remontée ·/)).toBeInTheDocument();
    expect(screen.getByText(/^Remontée automatique ·/)).toBeInTheDocument();
    expect(screen.getByText(/^Descente après échange ·/)).toBeInTheDocument();
    expect(screen.getByText(/^MOVE ·/)).toBeInTheDocument();
  });

  it.each<Role>(['SUPER_ADMIN', 'DIRECTEUR_REGIONAL'])('envoie une vérification explicite avec UUID et motif pour %s', async role => {
    useAuthStore.setState({ user: { id: 'admin', name: 'Administrateur', role } });
    const randomUUID = vi.spyOn(crypto, 'randomUUID');
    renderDetails();
    await screen.findByText('Aucun placement enregistré.');
    expect(post).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Vérifier la remontée' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Vérification terminée : aucune remontée effectuée.');
    expect(randomUUID).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledExactlyOnceWith('/mlm/matrix/member-1/reconcile-ascents', {
      operationId: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i),
      reason: 'Vérification administrative de la remontée automatique',
    });
  });

  it.each<Role | null>(['GERANT', 'AGENT', 'FORMATEUR', 'CLIENT', null])('ne propose pas de vérification pour %s', async role => {
    useAuthStore.setState({ user: role ? { id: 'user', name: 'Utilisateur', role } : null });
    renderDetails();
    await waitFor(() => expect(client.getQueryState(['mlm-tree-detail', 'member-1'])?.status).toBe('success'));
    expect(screen.queryByRole('button', { name: 'Vérifier la remontée' })).not.toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it.each([
    { label: 'incomplet', node: treeNode },
    { label: 'inactif', node: { ...treeNode, statut: 'SUSPENDU' } },
    { label: 'racine', node: { ...treeNode, matrixParent: null, positionId: null, position: null } },
  ])('laisse le serveur décider pour un membre $label', async ({ node }) => {
    currentNode = node;
    renderDetails();
    await userEvent.click(screen.getByRole('button', { name: 'Vérifier la remontée' }));
    expect(await screen.findByRole('status')).toHaveTextContent('aucune remontée effectuée');
    expect(post).toHaveBeenCalledTimes(1);
  });

  it.each([
    { label: 'réponse vide', result: [], message: 'Vérification terminée : aucune remontée effectuée.' },
    { label: 'marqueur seul', result: [reconciliation], message: 'Vérification terminée : aucune remontée effectuée.' },
    { label: 'une remontée', result: [reconciliation, ascent], message: 'Vérification terminée : 1 remontée automatique effectuée.' },
    { label: 'un échange de branches', result: [reconciliation, ascent, descent], message: 'Vérification terminée : 1 remontée automatique effectuée.' },
    { label: 'remontées successives', result: [reconciliation, ascent, { ...ascent, id: 'history-ascent-2' }], message: 'Vérification terminée : 2 remontées automatiques effectuées.' },
  ])('distingue les mouvements effectifs : $label', async ({ result, message }) => {
    post.mockResolvedValue({ data: result });
    renderDetails();
    await userEvent.click(screen.getByRole('button', { name: 'Vérifier la remontée' }));
    expect(await screen.findByRole('status')).toHaveTextContent(message);
  });

  it.each([false, true])('invalide les caches de tout le réseau même sans mouvement (remontée : %s)', async moved => {
    const cachedKeys = [
      ['mlm-tree', 'parent', 3], ['mlm-tree', 'grandparent', 1],
      ['mlm-tree-focus', 'admin', 'parent', 'member-1', 'snapshot', 3],
      ['mlm-tree-branch', 'parent', 'snapshot', 'admin'], ['mlm-tree-detail', 'parent'],
      ['mlm-members', { page: 1 }], ['mlm-progress', 'parent'], ['mlm-progress', 'member-1'],
      ['mlm-matrix', 'parent', 1], ['mlm-history', 'member-1', 2], ['mlm-history', 'parent', 1],
      ['mlm-stats'], ['mlm-members-by-level', 'scheme-20260825'], ['mlm-recent-promotions'],
      ['portal', 'referrals-tree', 'client-1'], ['portal', 'referrals', 'client-1', 'all'],
    ];
    for (const queryKey of cachedKeys) client.setQueryData(queryKey, { cached: true });
    client.setQueryData(['produits'], { cached: true });
    post.mockImplementation(async () => {
      historyItems = moved ? [reconciliation, ascent] : [reconciliation];
      if (moved) currentNode = {
        ...treeNode, position: 3, positionId: 'grandparent-slot',
        matrixParent: { id: 'grandparent', matricule: 'EBN-G', client: { prenom: 'Nouveau', nom: 'Parent' } },
        progression: { ...treeNode.progression, completedPositions: 4, remainingPositions: 0, progressPercentage: 100 },
      };
      return { data: historyItems };
    });
    renderDetails();
    await screen.findByText('Aucun placement enregistré.');
    await userEvent.click(screen.getByRole('button', { name: 'Vérifier la remontée' }));
    await screen.findByText(/^Vérification de remontée ·/);
    for (const queryKey of cachedKeys) expect(client.getQueryState(queryKey)?.isInvalidated, JSON.stringify(queryKey)).toBe(true);
    expect(client.getQueryState(['produits'])?.isInvalidated).toBe(false);
    expect(get.mock.calls.filter(([url]) => url === '/mlm/matrix/member-1/tree')).toHaveLength(2);
    if (moved) {
      expect(await screen.findByText('Nouveau Parent')).toBeInTheDocument();
      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
      expect(screen.getByText('Alice Recruteur')).toBeInTheDocument();
    }
  });

  it('désactive le bouton pendant la vérification et empêche un second envoi', async () => {
    let complete!: (result: { data: PlacementHistory[] }) => void;
    post.mockReturnValue(new Promise(resolve => { complete = resolve; }));
    renderDetails();
    await userEvent.click(screen.getByRole('button', { name: 'Vérifier la remontée' }));
    const pendingButton = screen.getByRole('button', { name: 'Vérification…' });
    expect(pendingButton).toBeDisabled();
    await userEvent.click(pendingButton);
    expect(post).toHaveBeenCalledTimes(1);
    await act(async () => { complete({ data: [reconciliation] }); });
    expect(await screen.findByRole('button', { name: 'Vérifier la remontée' })).toBeEnabled();
  });

  it.each([
    { error: { response: { status: 403, data: { message: 'Accès refusé' } } }, message: 'Accès refusé' },
    { error: new Error('Coupure réseau'), message: 'Vérification non confirmée. Réessayez.' },
  ])('affiche l’erreur sans annoncer de succès : $message', async ({ error, message }) => {
    post.mockRejectedValueOnce(error);
    renderDetails();
    await userEvent.click(screen.getByRole('button', { name: 'Vérifier la remontée' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vérifier la remontée' })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'Vérifier la remontée' }));
    expect(await screen.findByRole('status')).toHaveTextContent('aucune remontée effectuée');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('réutilise la clé après une réponse perdue puis renouvelle la clé après un succès confirmé', async () => {
    post.mockRejectedValueOnce(new Error('Réponse perdue'));
    renderDetails();
    await userEvent.click(screen.getByRole('button', { name: 'Vérifier la remontée' }));
    await screen.findByRole('alert');
    const firstId = post.mock.calls[0][1].operationId;
    await userEvent.click(screen.getByRole('button', { name: 'Vérifier la remontée' }));
    await screen.findByRole('status');
    expect(post.mock.calls[1][1].operationId).toBe(firstId);
    await userEvent.click(screen.getByRole('button', { name: 'Vérifier la remontée' }));
    await screen.findByRole('status');
    expect(post.mock.calls[2][1].operationId).not.toBe(firstId);
  });
});
