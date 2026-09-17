import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MlmTreePage from '@/pages/mlm/MlmTreePage';
import { ReferralTree } from '@/components/portal/ReferralTree';
import { renderMlm, treeNode } from '@/pages/mlm/task6.fixtures';

const { get, auth } = vi.hoisted(() => ({ get: vi.fn(), auth: { user: { id: 'client-1', role: 'CLIENT' } } }));
vi.mock('@/lib/api', () => ({ api: { get } }));
vi.mock('@/store/auth.store', () => ({ useAuthStore: (selector: any) => selector(auth) }));

const grandchild = { ...treeNode, id: 'grandchild', client: { prenom: 'Petit', nom: 'Enfant' }, position: 1, generation: 2, hasMore: false, children: [] };
const child = { ...treeNode, id: 'child', client: { prenom: 'Alice', nom: 'Filleule' }, position: 2, generation: 1, hasMore: false, children: [grandchild] };
const root = { ...treeNode, hasMore: false, children: [child] };

beforeEach(() => {
  get.mockReset();
  get.mockImplementation(async (url: string) => {
    if (url === '/mlm/members') return { data: { membres: [root] } };
    if (url.endsWith('/history')) return { data: { items: [], meta: { page: 1, totalPages: 1, total: 0 } } };
    if (url.includes('/grandchild/')) return { data: { ...grandchild, generation: 0 } };
    if (url.includes('/child/')) return { data: { ...child, generation: 0, children: [{ ...grandchild, generation: 1 }] } };
    return { data: root };
  });
});

describe('Navigation des réseaux', () => {
  it('ouvre le sous-arbre d’un membre en administration puis revient à la racine initiale', async () => {
    renderMlm(<MlmTreePage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Voir l’arbre de Alice Filleule' }));
    const breadcrumb = await screen.findByRole('navigation', { name: 'Chemin du réseau' });
    expect(within(breadcrumb).getByText('Alice Filleule')).toHaveAttribute('aria-current', 'page');
    expect(get).toHaveBeenCalledWith('/mlm/matrix/child/tree', { params: { depth: 3 } });
    expect(within(screen.getByRole('region', { name: 'Arbre du réseau' })).queryByRole('button', { name: 'Détails de Serge Mutombo' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retour à mon arbre' }));
    expect(await screen.findByRole('button', { name: 'Détails de Serge Mutombo' })).toBeInTheDocument();
  });

  it('conserve la racine et les branches repliées en passant de l’arbre à la liste', async () => {
    renderMlm(<MlmTreePage />);
    await screen.findByRole('button', { name: 'Détails de Alice Filleule' });
    await userEvent.click(screen.getByRole('button', { name: 'Masquer les branches de Alice Filleule' }));
    await userEvent.click(screen.getByRole('button', { name: 'Vue liste' }));
    expect(screen.queryByRole('region', { name: 'Arbre du réseau' })).not.toBeInTheDocument();
    const list = screen.getByRole('region', { name: 'Liste du réseau' });
    expect(within(list).getByRole('button', { name: 'Détails de Alice Filleule' })).toBeInTheDocument();
    expect(within(list).queryByRole('button', { name: 'Détails de Petit Enfant' })).not.toBeInTheDocument();
    await userEvent.click(within(list).getByRole('button', { name: 'Afficher les branches de Alice Filleule' }));
    expect(within(list).getByRole('button', { name: 'Détails de Petit Enfant' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Voir l’arbre de Alice Filleule' }));
    expect(await screen.findByRole('region', { name: 'Liste du réseau' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vue liste' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('n’utilise que l’endpoint portail pour explorer un filleul et remonte par le chemin', async () => {
    renderMlm(<ReferralTree matrixTree={root} nodes={[]} total={0} isLoading={false} />);
    await userEvent.click(screen.getByRole('button', { name: 'Voir l’arbre de Alice Filleule' }));
    await screen.findByRole('navigation', { name: 'Chemin du réseau' });
    await screen.findByRole('button', { name: 'Voir l’arbre de Petit Enfant' });
    expect(get).toHaveBeenCalledWith('/portal/network/child/tree', { params: { depth: 2 } });
    expect(get.mock.calls.some(([url]) => url.startsWith('/mlm/'))).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'Voir l’arbre de Petit Enfant' }));
    await screen.findByText('Arbre de Petit Enfant');
    await userEvent.click(within(screen.getByRole('navigation', { name: 'Chemin du réseau' })).getByRole('button', { name: 'Alice Filleule' }));
    expect(await screen.findByText('Arbre de Alice Filleule')).toBeInTheDocument();
  });

  it('affiche le refus d’accès sans réutiliser l’ancien arbre et permet de revenir', async () => {
    get.mockRejectedValue({ response: { status: 403 } });
    renderMlm(<ReferralTree matrixTree={root} nodes={[]} total={0} isLoading={false} />);
    await userEvent.click(screen.getByRole('button', { name: 'Voir l’arbre de Alice Filleule' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Ce réseau n’est pas accessible');
    expect(screen.queryByRole('region', { name: 'Arbre du réseau' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retour à mon arbre' }));
    expect(screen.getByRole('button', { name: 'Détails de Serge Mutombo' })).toBeInTheDocument();
  });

  it('explore également la liste personnelle sans inventer des placements matriciels', async () => {
    renderMlm(<ReferralTree nodes={[
      { id: 'child', prenom: 'Alice', nom: 'Filleule', statut: 'ACTIF', dateInscription: '2026-09-17' },
      { id: 'grandchild', prenom: 'Petit', nom: 'Enfant', parrainId: 'child', statut: 'ACTIF', dateInscription: '2026-09-17' },
    ]} total={2} isLoading={false} />);
    await userEvent.click(screen.getByRole('button', { name: 'Voir l’arbre de Alice Filleule' }));
    await userEvent.click(screen.getByRole('button', { name: 'Vue liste' }));
    expect(within(screen.getByRole('region', { name: 'Liste du réseau' })).getByText('Petit Enfant')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Liste du réseau' })).getByText('Génération 0')).toBeInTheDocument();
    expect(screen.getByText(/Les placements matriciels ne sont pas fournis/)).toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
  });

  it('retire les détails d’un membre supprimé d’une branche chargée à la demande', async () => {
    const { client } = renderMlm(<ReferralTree matrixTree={{ ...root, children: [{ ...child, children: [], hasMore: true }] }} nodes={[]} total={0} isLoading={false} />);
    await userEvent.click(screen.getByRole('button', { name: 'Charger les enfants de Alice Filleule' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Détails de Petit Enfant' }));
    expect(screen.getByRole('region', { name: 'Détails de Petit Enfant' })).toBeInTheDocument();
    get.mockResolvedValue({ data: { ...child, children: [], hasMore: false, directMatrixChildrenCount: 0, emptyPositions: [1, 2, 3, 4] } });
    await act(async () => { await client.refetchQueries({ queryKey: ['mlm-tree-branch'] }); });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Détails de Petit Enfant' })).not.toBeInTheDocument());
    expect(screen.queryByRole('region', { name: 'Détails de Petit Enfant' })).not.toBeInTheDocument();
  });

  it.each([403, 404])('masque une branche en cache et ses détails si son accès devient refusé (%s)', async status => {
    const { client } = renderMlm(<ReferralTree matrixTree={{ ...root, children: [{ ...child, children: [], hasMore: true }] }} nodes={[]} total={0} isLoading={false} />);
    await userEvent.click(screen.getByRole('button', { name: 'Charger les enfants de Alice Filleule' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Détails de Petit Enfant' }));
    get.mockRejectedValue({ response: { status } });
    await act(async () => { await client.refetchQueries({ queryKey: ['mlm-tree-branch'] }); });
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Détails de Petit Enfant' })).not.toBeInTheDocument());
    expect(screen.queryByRole('region', { name: 'Détails de Petit Enfant' })).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Accès à cette branche refusé');
  });

  it('respecte la profondeur administrative choisie lors de l’ouverture d’un sous-arbre', async () => {
    renderMlm(<MlmTreePage />);
    await screen.findByRole('button', { name: 'Détails de Alice Filleule' });
    await userEvent.click(screen.getByRole('button', { name: '1 niv' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Voir l’arbre de Alice Filleule' }));
    await waitFor(() => expect(get).toHaveBeenCalledWith('/mlm/matrix/child/tree', { params: { depth: 1 } }));
  });
});
