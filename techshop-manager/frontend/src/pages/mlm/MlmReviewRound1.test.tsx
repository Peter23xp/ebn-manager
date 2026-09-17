import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { onlineManager } from '@tanstack/react-query';
import MlmTreePage from './MlmTreePage';
import { MlmCalendarConfig } from '@/components/mlm/MlmCalendarConfig';
import { member, renderMlm, treeNode } from './task6.fixtures';

const { get, put, auth } = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), auth: { user: { role: 'SUPER_ADMIN' } } }));
vi.mock('@/lib/api', () => ({ api: { get, put } }));
vi.mock('@/store/auth.store', () => ({ useAuthStore: (selector: any) => selector(auth) }));

const calendar = { year: 2026, holidays: ['2026-01-01'], version: 'v1', source: 'Texte officiel', timezone: 'Africa/Lubumbashi' };
const secondMember = { ...member, id: 'second', matricule: 'EBN-201', client: { ...member.client, prenom: 'Ancêtre', nom: 'Éloigné' } };

async function settleQueries() {
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
}

beforeEach(() => {
  get.mockReset(); put.mockReset();
  get.mockImplementation(async (url: string) => {
    if (url === '/mlm/members') return { data: { membres: [member, secondMember] } };
    if (url === '/mlm/config/calendar') return { data: [calendar] };
    if (url.endsWith('/tree')) return { data: treeNode };
    throw new Error(`Unexpected request: ${url}`);
  });
});

afterEach(() => { onlineManager.setOnline(true); });

describe('Task 6 review — root selection', () => {
  it.each(['Ancêtre', 'EBN-201'])('searches the server for %s beyond the first 100 and keeps the chosen root across pages/searches', async search => {
    get.mockImplementation(async (url: string, options?: any) => {
      if (url === '/mlm/members') {
        const { page = 1, limit = 20, search: term = '' } = options?.params ?? {};
        return { data: { membres: term === search && page === 1 ? [secondMember] : [member], meta: { total: 201, page, limit, totalPages: 11 } } };
      }
      return { data: url.includes('/second/') ? { ...treeNode, ...secondMember, level: null } : treeNode };
    });
    renderMlm(<MlmTreePage />);
    await screen.findByRole('button', { name: 'Détails de Serge Mutombo' }, { timeout: 3000 });
    expect(screen.queryByRole('option', { name: /Ancêtre/ })).not.toBeInTheDocument();
    const input = screen.getByRole('searchbox', { name: 'Rechercher un membre par nom ou matricule' });
    fireEvent.change(input, { target: { value: search } });
    expect(get.mock.calls.filter(([url, options]) => url === '/mlm/members' && options.params.search === search)).toHaveLength(0);
    await screen.findByRole('option', { name: /Ancêtre/ });
    expect(get).toHaveBeenCalledWith('/mlm/members', { params: { page: 1, limit: 20, search } });
    await userEvent.selectOptions(screen.getByLabelText('Sélectionner le membre racine'), 'second');
    await screen.findByRole('button', { name: 'Détails de Ancêtre Éloigné' });
    expect(get).toHaveBeenCalledWith('/mlm/matrix/second/tree', { params: { depth: 3 } });
    await userEvent.click(screen.getByRole('button', { name: 'Page suivante' }));
    await waitFor(() => expect(get).toHaveBeenCalledWith('/mlm/members', { params: { page: 2, limit: 20, search } }));
    await settleQueries();
    expect(screen.getByLabelText('Sélectionner le membre racine')).toHaveValue('second');
    expect(screen.getByRole('heading', { name: 'Ancêtre Éloigné' })).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'Serge' } });
    await waitFor(() => expect(get).toHaveBeenCalledWith('/mlm/members', { params: { page: 1, limit: 20, search: 'Serge' } }));
    await settleQueries();
    expect(screen.getByLabelText('Sélectionner le membre racine')).toHaveValue('second');
    expect(screen.getByRole('button', { name: 'Détails de Ancêtre Éloigné' })).toBeInTheDocument();
    fireEvent.change(input, { target: { value: search } });
    await waitFor(() => expect(screen.getByLabelText('Sélectionner le membre racine')).toBeEnabled());
    expect(screen.getByRole('button', { name: '1' })).toHaveAttribute('aria-current', 'page');
  });

  it('shows loading, empty and recoverable search errors without losing the root', async () => {
    renderMlm(<MlmTreePage />);
    await screen.findByRole('button', { name: 'Détails de Serge Mutombo' });
    let finishSearch!: (response: unknown) => void;
    get.mockImplementationOnce(() => new Promise(resolve => { finishSearch = resolve; }));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Introuvable' } });
    expect(await screen.findByText('Recherche des membres…')).toBeInTheDocument();
    await waitFor(() => expect(finishSearch).toBeTypeOf('function'));
    await act(async () => finishSearch({ data: { membres: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } } }));
    expect(await screen.findByText('Aucun membre ne correspond à cette recherche.')).toBeInTheDocument();
    get.mockRejectedValueOnce(new Error('Network unavailable'));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Erreur' } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Recherche des membres indisponible');
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer la recherche' }));
    await screen.findByRole('option', { name: /EBN-201/ });
    expect(screen.getByLabelText('Sélectionner le membre racine')).toHaveValue('member-1');
  });
});

describe('Task 6 review — branch snapshot ownership', () => {
  it.each(['revisit', 'refresh', 'depth'])('discards a previous lazy branch on a fresh root snapshot: %s', async action => {
    const child = { ...treeNode, id: 'child', client: { prenom: 'Enfant', nom: 'Courant' }, generation: 1 };
    const formerOccupant = { ...treeNode, id: 'former', client: { prenom: 'Ancien', nom: 'Occupant' }, hasMore: false, generation: 1 };
    let changed = false;
    get.mockImplementation(async (url: string, options?: any) => {
      if (url === '/mlm/members') return { data: { membres: [member, secondMember] } };
      if (url.includes('/second/')) return { data: { ...treeNode, ...secondMember, level: null, hasMore: false } };
      if (url.includes('/child/')) return { data: { ...child, hasMore: false, children: [formerOccupant] } };
      return { data: { ...treeNode, hasMore: false, children: [changed ? { ...child, directMatrixChildrenCount: 0, children: [], hasMore: false } : child] } };
    });
    const { client } = renderMlm(<MlmTreePage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Charger les enfants de Enfant Courant' }));
    await screen.findByRole('button', { name: 'Détails de Ancien Occupant' });
    changed = true;
    if (action === 'revisit') {
      await userEvent.selectOptions(screen.getByLabelText('Sélectionner le membre racine'), 'second');
      await screen.findByRole('button', { name: 'Détails de Ancêtre Éloigné' });
      await userEvent.selectOptions(screen.getByLabelText('Sélectionner le membre racine'), member.id);
    } else {
      await userEvent.click(screen.getByRole('button', { name: action === 'refresh' ? 'Actualiser' : '2 niv' }));
    }
    await waitFor(() => expect(client.getQueryData<any>(['mlm-tree', member.id, action === 'depth' ? 2 : 3])?.children[0].directMatrixChildrenCount).toBe(0));
    await settleQueries();
    expect(screen.queryByRole('button', { name: 'Détails de Ancien Occupant' })).not.toBeInTheDocument();
    expect(screen.getByText('0 enfants matriciels')).toBeInTheDocument();
    expect(get.mock.calls.filter(([url]) => url.includes('/child/'))).toHaveLength(1);
    expect(get.mock.calls.filter(([url]) => url.endsWith('/tree')).every(([, options]) => options.params.depth <= 3)).toBe(true);
  });
});

describe('Task 6 review — calendar drafts', () => {
  it.each(['refetch', 'reconnect'])('preserves all dirty fields and focus on an unchanged background %s', async trigger => {
    const { client } = renderMlm(<MlmCalendarConfig />);
    await screen.findByDisplayValue('v1');
    fireEvent.change(screen.getByLabelText('Jours fériés (une date par ligne)'), { target: { value: '2026-01-01\n2026-06-30' } });
    fireEvent.change(screen.getByLabelText('Version du calendrier'), { target: { value: 'draft-v2' } });
    const source = screen.getByLabelText('Source officielle');
    fireEvent.change(source, { target: { value: 'Nouvelle source' } });
    source.focus();
    if (trigger === 'reconnect') {
      act(() => onlineManager.setOnline(false));
      act(() => onlineManager.setOnline(true));
      await waitFor(() => expect(get.mock.calls.filter(([url]) => url === '/mlm/config/calendar')).toHaveLength(2));
    } else {
      await act(async () => { await client.refetchQueries({ queryKey: ['mlm-calendar'] }); });
    }
    await settleQueries();
    expect(screen.getByLabelText('Jours fériés (une date par ligne)')).toHaveValue('2026-01-01\n2026-06-30');
    expect(screen.getByLabelText('Version du calendrier')).toHaveValue('draft-v2');
    expect(screen.getByLabelText('Source officielle')).toHaveValue('Nouvelle source');
    expect(source).toHaveFocus();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('adopts fresh values when clean, warns on concurrent changes when dirty, and offers explicit reset', async () => {
    const { client } = renderMlm(<MlmCalendarConfig />);
    await screen.findByDisplayValue('v1');
    get.mockResolvedValue({ data: [{ ...calendar, version: 'server-v2' }] });
    await act(async () => { await client.refetchQueries({ queryKey: ['mlm-calendar'] }); });
    await screen.findByDisplayValue('server-v2');
    fireEvent.change(screen.getByLabelText('Version du calendrier'), { target: { value: 'draft-v3' } });
    get.mockResolvedValue({ data: [{ ...calendar, version: 'server-v3' }] });
    await act(async () => { await client.refetchQueries({ queryKey: ['mlm-calendar'] }); });
    await settleQueries();
    expect(screen.getByLabelText('Version du calendrier')).toHaveValue('draft-v3');
    expect(screen.getByRole('alert')).toHaveTextContent('Le calendrier a changé sur le serveur');
    await userEvent.click(screen.getByRole('button', { name: 'Recharger la version serveur' }));
    expect(screen.getByLabelText('Version du calendrier')).toHaveValue('server-v3');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('replaces the submitted draft with the accepted server response after saving', async () => {
    let serverCalendar = calendar;
    get.mockImplementation(async () => ({ data: [serverCalendar] }));
    put.mockImplementation(async () => {
      serverCalendar = { ...calendar, version: 'accepted-v2', source: 'Source normalisée', holidays: ['2026-06-30'] };
      return { data: serverCalendar };
    });
    const { client } = renderMlm(<MlmCalendarConfig />);
    await screen.findByDisplayValue('v1');
    fireEvent.change(screen.getByLabelText('Version du calendrier'), { target: { value: 'draft-v2' } });
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer le calendrier' }));
    await screen.findByDisplayValue('accepted-v2');
    expect(screen.getByLabelText('Source officielle')).toHaveValue('Source normalisée');
    expect(screen.getByLabelText('Jours fériés (une date par ligne)')).toHaveValue('2026-06-30');
    serverCalendar = { ...serverCalendar, version: 'server-v3' };
    await act(async () => { await client.refetchQueries({ queryKey: ['mlm-calendar'] }); });
    expect(await screen.findByDisplayValue('server-v3')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('resets a dirty draft only on explicit year selection', async () => {
    get.mockResolvedValue({ data: [calendar, { ...calendar, year: 2027, version: '2027-v1' }] });
    renderMlm(<MlmCalendarConfig />);
    await screen.findByDisplayValue('v1');
    fireEvent.change(screen.getByLabelText('Version du calendrier'), { target: { value: 'draft' } });
    fireEvent.change(screen.getByLabelText('Année du calendrier'), { target: { value: '2027' } });
    expect(await screen.findByDisplayValue('2027-v1')).toBeInTheDocument();
  });
});
