import { useState, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { MlmApi } from '@/lib/mlm.api';
import { invalidateMlm } from '@/lib/mlm-query';
import { useAuthStore } from '@/store/auth.store';
import MlmTreePage from '@/pages/mlm/MlmTreePage';
import { treeNode } from '@/pages/mlm/task6.fixtures';
import type { MatrixTreeNode } from '@/types/mlm';
import { MatrixNetworkExplorer } from './MatrixNetworkExplorer';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', () => ({ api: { get } }));

const rootIdentity = { id: 'root', matricule: 'ROOT', client: { prenom: 'Racine', nom: 'Membre' } };
const parentIdentity = { id: 'parent', matricule: 'PARENT', client: { prenom: 'Parent', nom: 'Membre' } };
const leaf: MatrixTreeNode = { ...treeNode, id: 'leaf', client: { prenom: 'Branche', nom: 'Complète' }, generation: 2, position: 1, matrixParent: parentIdentity, hasMore: false };
const parent: MatrixTreeNode = { ...treeNode, ...parentIdentity, generation: 1, position: 1, matrixParent: rootIdentity, children: [leaf], emptyPositions: [2, 3, 4], hasMore: false };
const root: MatrixTreeNode = { ...treeNode, ...rootIdentity, generation: 0, position: null, matrixParent: null, children: [parent], emptyPositions: [2, 3, 4], hasMore: false };
const ascended: MatrixTreeNode = { ...leaf, generation: 1, position: 2, matrixParent: rootIdentity };
const refreshedRoot: MatrixTreeNode = { ...root, children: [{ ...parent, children: [], emptyPositions: [1, 2, 3, 4] }, ascended], emptyPositions: [3, 4] };
const lazyRoot: MatrixTreeNode = { ...root, children: [{ ...parent, children: [], hasMore: true }] };
let client: QueryClient;
let currentRoot: MatrixTreeNode;
let currentLeaf: MatrixTreeNode;
let currentParent: MatrixTreeNode;
let denied: { id: string; status: number } | null;

function renderNetwork(element: ReactNode) {
  return render(element, { wrapper: ({ children }) => <QueryClientProvider client={client}>
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{children}</MemoryRouter>
  </QueryClientProvider> });
}

function SelectionHarness({ data, snapshot, onSelection, onLost }: {
  data: MatrixTreeNode; snapshot: string;
  onSelection: (node: MatrixTreeNode) => void; onLost: () => void;
}) {
  const [selected, setSelected] = useState<MatrixTreeNode | null>(null);
  return <>
    <MatrixNetworkExplorer root={data} snapshot={snapshot} scope="admin" loadTree={MlmApi.getNetworkTree}
      onSelect={node => { onSelection(node); setSelected(node); }}
      onNavigate={() => { onLost(); setSelected(null); }} />
    <output aria-label="Sélection externe">{selected ? `${selected.generation} / ${selected.matrixParent?.id}` : 'Aucune'}</output>
  </>;
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  currentRoot = root;
  currentLeaf = leaf;
  currentParent = parent;
  denied = null;
  useAuthStore.setState({ user: { id: 'admin', name: 'Administrateur', role: 'SUPER_ADMIN' } });
  get.mockReset();
  get.mockImplementation(async (url: string) => {
    if (url === '/mlm/members') return { data: { membres: [currentRoot] } };
    if (url.endsWith('/history')) return { data: { items: [], meta: { page: 1, limit: 20, total: 0, totalPages: 1 } } };
    if (denied && url === `/mlm/matrix/${denied.id}/tree`) throw { response: { status: denied.status } };
    if (url === '/mlm/matrix/root/tree') return { data: currentRoot };
    if (url === '/mlm/matrix/parent/tree') return { data: { ...currentParent, generation: 0, children: currentParent.children.map(node => ({ ...node, generation: 1 })) } };
    if (url === '/mlm/matrix/leaf/tree') return { data: { ...currentLeaf, generation: 0 } };
    throw new Error(`Lecture inattendue : ${url}`);
  });
});

afterEach(() => {
  cleanup();
  client.clear();
  useAuthStore.setState({ user: null });
});

describe('Synchronisation des détails sélectionnés après remontée', () => {
  it('actualise la génération administrative de 2 à 1 et le parent après invalidation', async () => {
    renderNetwork(<MlmTreePage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Détails de Branche Complète' }));
    const details = screen.getByRole('region', { name: 'Détails de Branche Complète' });
    expect(within(details).getByText('Génération relative à la racine affichée').nextElementSibling).toHaveTextContent(/^2$/);
    currentLeaf = ascended;
    currentRoot = refreshedRoot;
    await act(async () => { await invalidateMlm(client); });
    await waitFor(() => expect(within(details).getByText('Génération relative à la racine affichée').nextElementSibling).toHaveTextContent(/^1$/));
    expect(within(details).getByText('Parent matriciel').nextElementSibling).toHaveTextContent('Racine Membre');
  });

  it('ferme les détails administratifs si le membre quitte le sous-arbre affiché', async () => {
    renderNetwork(<MlmTreePage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Détails de Branche Complète' }));
    currentRoot = { ...root, children: [] };
    await act(async () => { await client.refetchQueries({ queryKey: ['mlm-tree'] }); });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Détails de Branche Complète' })).not.toBeInTheDocument());
    expect(screen.queryByRole('region', { name: 'Détails de Branche Complète' })).not.toBeInTheDocument();
  });

  it.each([403, 404])('ferme les détails si la racine administrative devient inaccessible (%s)', async status => {
    renderNetwork(<MlmTreePage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Détails de Branche Complète' }));
    denied = { id: 'root', status };
    await act(async () => { await client.refetchQueries({ queryKey: ['mlm-tree'] }); });
    await screen.findByText("Erreur lors de la récupération de l'arbre MLM.");
    expect(screen.queryByRole('region', { name: 'Détails de Branche Complète' })).not.toBeInTheDocument();
  });

  it.each([403, 404])('ferme les détails si le sous-arbre exploré devient inaccessible (%s)', async status => {
    renderNetwork(<MlmTreePage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Voir l’arbre de Parent Membre' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Détails de Branche Complète' }));
    denied = { id: 'parent', status };
    await act(async () => { await client.refetchQueries({ queryKey: ['mlm-tree-focus'] }); });
    await screen.findByText('Ce réseau n’est pas accessible avec votre compte.');
    expect(screen.queryByRole('region', { name: 'Détails de Branche Complète' })).not.toBeInTheDocument();
  });

  it('notifie une fois le nouveau placement sans boucle avec des callbacks recréés', async () => {
    const onSelection = vi.fn();
    const onLost = vi.fn();
    const view = (data: MatrixTreeNode, snapshot: string) => <SelectionHarness data={data} snapshot={snapshot} onSelection={onSelection} onLost={onLost} />;
    const { rerender } = renderNetwork(view(root, 'initial'));
    await userEvent.click(screen.getByRole('button', { name: 'Détails de Branche Complète' }));
    expect(onSelection).toHaveBeenCalledTimes(1);
    rerender(view(refreshedRoot, 'refresh'));
    expect(screen.getByLabelText('Sélection externe')).toHaveTextContent('1 / root');
    expect(onSelection).toHaveBeenCalledTimes(2);
    expect(onSelection).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'leaf', generation: 1, matrixParent: rootIdentity }));
    rerender(view(refreshedRoot, 'refresh'));
    rerender(view(refreshedRoot, 'unchanged-data'));
    await userEvent.click(screen.getByRole('button', { name: 'Vue liste' }));
    expect(onSelection).toHaveBeenCalledTimes(2);
    expect(onLost).not.toHaveBeenCalled();
  });

  it('retrouve une sélection chargée à la demande dans le nouvel instantané après remontée', async () => {
    const onSelection = vi.fn();
    const onLost = vi.fn();
    const view = (data: MatrixTreeNode, snapshot: string) => <SelectionHarness data={data} snapshot={snapshot} onSelection={onSelection} onLost={onLost} />;
    const { rerender } = renderNetwork(view(lazyRoot, 'initial'));
    await userEvent.click(screen.getByRole('button', { name: 'Charger les enfants de Parent Membre' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Détails de Branche Complète' }));
    expect(screen.getByLabelText('Sélection externe')).toHaveTextContent('2 / parent');
    rerender(view(refreshedRoot, 'refresh'));
    expect(screen.getByLabelText('Sélection externe')).toHaveTextContent('1 / root');
    expect(onSelection).toHaveBeenCalledTimes(2);
    expect(onLost).not.toHaveBeenCalled();
  });

  it('conserve et actualise la sélection explorée pendant le renouvellement de son instantané', async () => {
    const onSelection = vi.fn();
    const onLost = vi.fn();
    const view = (snapshot: string) => <SelectionHarness data={root} snapshot={snapshot} onSelection={onSelection} onLost={onLost} />;
    const { rerender } = renderNetwork(view('initial'));
    await userEvent.click(screen.getByRole('button', { name: 'Voir l’arbre de Parent Membre' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Détails de Branche Complète' }));
    onLost.mockClear();
    currentParent = { ...parent, children: [{ ...leaf, position: 3 }] };
    rerender(view('refresh'));
    await waitFor(() => expect(onSelection).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'leaf', generation: 1, position: 3 })));
    expect(onSelection).toHaveBeenCalledTimes(2);
    expect(onLost).not.toHaveBeenCalled();
  });

  it('efface une seule fois une sélection perdue au changement d’instantané sans la rouvrir au rechargement', async () => {
    const onSelection = vi.fn();
    const onLost = vi.fn();
    const view = (snapshot: string) => <SelectionHarness data={lazyRoot} snapshot={snapshot} onSelection={onSelection} onLost={onLost} />;
    const { rerender } = renderNetwork(view('initial'));
    await userEvent.click(screen.getByRole('button', { name: 'Charger les enfants de Parent Membre' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Détails de Branche Complète' }));
    rerender(view('refresh'));
    expect(screen.getByLabelText('Sélection externe')).toHaveTextContent('Aucune');
    expect(onLost).toHaveBeenCalledTimes(1);
    rerender(view('refresh'));
    await userEvent.click(screen.getByRole('button', { name: 'Charger les enfants de Parent Membre' }));
    await screen.findByRole('button', { name: 'Détails de Branche Complète' });
    expect(screen.getByLabelText('Sélection externe')).toHaveTextContent('Aucune');
    expect(onLost).toHaveBeenCalledTimes(1);
    expect(onSelection).toHaveBeenCalledTimes(1);
  });

  it.each(['departed', 403, 404])('efface la sélection externe après actualisation d’une branche chargée : %s', async outcome => {
    const onSelection = vi.fn();
    const onLost = vi.fn();
    renderNetwork(<SelectionHarness data={lazyRoot} snapshot="initial" onSelection={onSelection} onLost={onLost} />);
    await userEvent.click(screen.getByRole('button', { name: 'Charger les enfants de Parent Membre' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Détails de Branche Complète' }));
    if (typeof outcome === 'number') denied = { id: 'parent', status: outcome };
    else currentParent = { ...parent, children: [], emptyPositions: [1, 2, 3, 4] };
    await act(async () => { await client.refetchQueries({ queryKey: ['mlm-tree-branch'] }); });
    await waitFor(() => expect(screen.getByLabelText('Sélection externe')).toHaveTextContent('Aucune'));
    expect(onLost).toHaveBeenCalledTimes(1);
    expect(onSelection).toHaveBeenCalledTimes(1);
  });
});
