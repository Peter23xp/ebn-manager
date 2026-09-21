import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MlmTreePage from './MlmTreePage';
import MlmConfigPage from './MlmConfigPage';
import MlmLevelsPage from './MlmLevelsPage';
import MlmCommissionsPage from './MlmCommissionsPage';
import { ReinvestLots } from '@/components/mlm/ReinvestLots';
import { builder, lot, member, renderMlm, sapphire, treeNode } from './task6.fixtures';

const { get, post, put, auth } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), auth: { isAuthenticated: true, sessionVersion: 1, user: { id: 'staff', role: 'SUPER_ADMIN' } } }));
vi.mock('@/lib/api', () => ({ api: { get, post, put } }));
vi.mock('@/store/auth.store', () => ({ useAuthStore: Object.assign((selector?: any) => selector ? selector(auth) : auth, { getState: () => auth }) }));

const calendar = { year: 2026, holidays: ['2026-01-01'], version: 'v1', source: 'Texte officiel', timezone: 'Africa/Lubumbashi' };
const target = { ...treeNode, id: 'target', client: { prenom: 'Cible', nom: 'Membre' }, positionId: 'target-slot', position: 3, emptyPositions: [2], hasMore: false };

async function openPlacement() {
  renderMlm(<MlmTreePage />);
  await userEvent.click(await screen.findByRole('button', { name: 'Détails de Serge Mutombo' }));
  fireEvent.change(screen.getByLabelText('Identifiant du membre cible'), { target: { value: 'target' } });
  await userEvent.click(screen.getByRole('button', { name: 'Charger la cible' }));
  await screen.findByText('Cible Membre');
  fireEvent.change(screen.getByLabelText('Motif du placement'), { target: { value: 'Correction du placement' } });
}

describe('Task 6 — administration MLM', () => {
  beforeEach(() => {
    auth.user.role = 'SUPER_ADMIN';
    get.mockReset(); post.mockReset(); put.mockReset();
    post.mockResolvedValue({ data: {} }); put.mockResolvedValue({ data: {} });
    get.mockImplementation(async (url: string, options?: any) => {
      if (url === '/mlm/members') return { data: { membres: [{ ...member, currentLevel: null }] } };
      if (url === '/mlm/config') return { data: [builder, sapphire] };
      if (url === '/mlm/config/calendar') return { data: [calendar] };
      if (url === '/mlm/members-by-level') return { data: [] };
      if (url === '/mlm/matrix/target/tree') return { data: target };
      if (url.endsWith('/history')) return { data: { items: [{ id: `h-${options?.params?.page}`, memberId: member.id, recruiterId: 'recruiter', oldParentId: null, newParentId: 'parent', oldPosition: null, newPosition: 2, actorId: 'admin', reason: `Placement page ${options?.params?.page}`, operationId: 'operation', operationType: 'MOVE', createdAt: '2026-09-17T08:00:00Z' }], meta: { total: 21, page: options?.params?.page, limit: 20, totalPages: 2 } } };
      if (url.endsWith('/tree')) return { data: treeNode };
      return { data: {} };
    });
  });

  it('limite la profondeur et charge uniquement une génération à la demande', async () => {
    const child = { ...target, id: 'child', generation: 1, client: { prenom: 'Enfant', nom: 'Matriciel' }, children: [] };
    get.mockImplementation(async (url: string, options?: any) => url === '/mlm/members' ? { data: { membres: [member] } } : { data: options.params.depth === 1 ? { ...treeNode, children: [child], hasMore: false } : treeNode });
    renderMlm(<MlmTreePage />);
    expect(screen.queryByRole('button', { name: '4 niv' })).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Charger les enfants de Serge Mutombo' }));
    expect(await screen.findByText('Enfant Matriciel')).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith('/mlm/matrix/member-1/tree', { params: { depth: 1 } });
    expect(screen.getByText('Génération 1')).toBeInTheDocument();
    expect(screen.getByText('Places libres : 4')).toBeInTheDocument();
  });

  it('déplace avec place attendue, motif, UUID et sans acteur fourni par le navigateur', async () => {
    await openPlacement();
    fireEvent.change(screen.getByLabelText('Nouvelle position'), { target: { value: '2' } });
    await userEvent.click(screen.getByRole('button', { name: 'Confirmer le déplacement' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/mlm/matrix/move', { memberId: 'member-1', newParentId: 'target', newPosition: 2, expectedPositionId: 'slot-1', operationId: expect.stringMatching(/^[0-9a-f-]{36}$/i), reason: 'Correction du placement' }));
    expect(await screen.findByText('Placement enregistré.')).toBeInTheDocument();
  });

  it('échange avec les deux positions attendues du serveur', async () => {
    await openPlacement();
    fireEvent.change(screen.getByLabelText('Opération'), { target: { value: 'swap' } });
    await userEvent.click(screen.getByRole('button', { name: "Confirmer l’échange" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/mlm/matrix/swap', { memberId: 'member-1', otherMemberId: 'target', expectedPositionId: 'slot-1', otherExpectedPositionId: 'target-slot', operationId: expect.any(String), reason: 'Correction du placement' }));
  });

  it('resynchronise les détails du membre après un déplacement', async () => {
    const initialGet = get.getMockImplementation()!;
    let moved = false;
    get.mockImplementation(async (url: string, options?: any) => url === '/mlm/matrix/member-1/tree' && moved ? { data: { ...treeNode, directMatrixChildrenCount: 1 } } : initialGet(url, options));
    post.mockImplementation(async () => { moved = true; return { data: {} }; });
    await openPlacement();
    fireEvent.change(screen.getByLabelText('Nouvelle position'), { target: { value: '2' } });
    await userEvent.click(screen.getByRole('button', { name: 'Confirmer le déplacement' }));
    const details = screen.getByRole('region', { name: 'Détails de Serge Mutombo' });
    await waitFor(() => expect(within(details).getByText('Enfants matriciels').parentElement).toHaveTextContent('1'));
  });

  it('conserve la clé d’idempotence après une réponse réseau incertaine', async () => {
    post.mockRejectedValueOnce(new Error('Coupure réseau')).mockResolvedValue({ data: {} });
    await openPlacement();
    fireEvent.change(screen.getByLabelText('Nouvelle position'), { target: { value: '2' } });
    await userEvent.click(screen.getByRole('button', { name: 'Confirmer le déplacement' }));
    await screen.findByRole('alert');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmer le déplacement' }));
    await screen.findByText('Placement enregistré.');
    expect(post.mock.calls[0][1].operationId).toBe(post.mock.calls[1][1].operationId);
  });

  it('conserve le calendrier en lecture seule pour un directeur', async () => {
    auth.user.role = 'DIRECTEUR_REGIONAL';
    renderMlm(<MlmConfigPage />);
    await screen.findByDisplayValue('v1');
    expect(screen.getByLabelText('Version du calendrier')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Enregistrer le calendrier' })).not.toBeInTheDocument();
  });

  it('ne présente pas de restitution aux clients même si le lot est restituable', () => {
    auth.user.role = 'CLIENT';
    renderMlm(<ReinvestLots lots={[{ ...lot, status: 'RELEASABLE' } as any]} />);
    expect(screen.queryByRole('button', { name: 'Restituer la retenue' })).not.toBeInTheDocument();
  });

  it('affiche les conflits serveur sans prétendre avoir déplacé le membre', async () => {
    post.mockRejectedValue({ response: { status: 409, data: { message: 'La position a changé' } } });
    await openPlacement();
    fireEvent.change(screen.getByLabelText('Nouvelle position'), { target: { value: '2' } });
    await userEvent.click(screen.getByRole('button', { name: 'Confirmer le déplacement' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('La position a changé');
    expect(screen.queryByText('Placement enregistré.')).not.toBeInTheDocument();
  });

  it('charge l’historique paginé pour le membre sélectionné', async () => {
    renderMlm(<MlmTreePage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Détails de Serge Mutombo' }));
    expect(await screen.findByText('Placement page 1')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Page suivante' }));
    expect(await screen.findByText('Placement page 2')).toBeInTheDocument();
  });

  it('ne propose pas de déplacement à un gérant', async () => {
    auth.user.role = 'GERANT';
    renderMlm(<MlmTreePage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Détails de Serge Mutombo' }));
    expect(await screen.findByText('Placement page 1')).toBeInTheDocument();
    expect(screen.queryByLabelText('Motif du placement')).not.toBeInTheDocument();
  });

  it('enregistre seulement le montant immédiat et le salaire en chaînes décimales', async () => {
    renderMlm(<MlmConfigPage />);
    await userEvent.click((await screen.findAllByRole('button', { name: 'Modifier' }))[0]);
    fireEvent.change(screen.getByLabelText('Montant immédiat (USD)'), { target: { value: '25.01' } });
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(put).toHaveBeenCalledWith('/mlm/config', { levelId: 1, immediateAmount: '25.01', salaireMensuel: '0', bonusDescription: '2 pagnes', salaireActif: false, isActive: true }));
  });

  it('édite le calendrier annuel sans recalculer les échéances existantes', async () => {
    renderMlm(<MlmConfigPage />);
    await screen.findByDisplayValue('v1');
    fireEvent.change(screen.getByLabelText('Jours fériés (une date par ligne)'), { target: { value: '2026-01-01\n2026-06-30' } });
    fireEvent.change(screen.getByLabelText('Version du calendrier'), { target: { value: 'v2' } });
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer le calendrier' }));
    await waitFor(() => expect(put).toHaveBeenCalledWith('/mlm/config/calendar/2026', { holidays: ['2026-01-01', '2026-06-30'], version: 'v2', source: 'Texte officiel', timezone: 'Africa/Lubumbashi' }));
  });

  it('présente les niveaux et montants serveur sans total financier local', async () => {
    renderMlm(<MlmLevelsPage />);
    expect(await screen.findByText('16 positions requises')).toBeInTheDocument();
    expect(screen.getAllByText(/83,33 USD/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Com. \/ personne/)).not.toBeInTheDocument();
    expect(screen.queryByText(/sans validation/)).not.toBeInTheDocument();
  });

  it('ne restitue que les lots restituables et rafraîchit après confirmation', async () => {
    renderMlm(<ReinvestLots lots={[lot as any, { ...lot, id: 'eligible', status: 'RELEASABLE' } as any]} />);
    const actions = screen.getAllByRole('button', { name: 'Restituer la retenue' });
    expect(actions).toHaveLength(1);
    await userEvent.click(actions[0]);
    expect(post).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Confirmer la restitution' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/mlm/reinvest/eligible/release'));
  });

  it('affiche le split et le statut de retenue même pour une commission payée', async () => {
    get.mockImplementation(async (url: string) => ({ data: url === '/mlm/config' ? [builder] : { commissions: [{ id: 'commission-1', membre: member, level: builder, montant: '40.00', montantSysteme: '24.00', montantRetour: '16.00', statut: 'PAYEE', createdAt: '2026-09-17', reinvestLot: lot }], summary: {}, meta: { totalPages: 1 } } }));
    renderMlm(<MlmCommissionsPage />);
    expect(await screen.findByText(/Immédiat : 24,00 USD/)).toBeInTheDocument();
    expect(screen.getByText(/Retenu : 16,00 USD/)).toBeInTheDocument();
    expect(screen.getByText('Retenue en cours')).toBeInTheDocument();
  });
});
