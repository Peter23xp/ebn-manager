import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import MlmMembersPage from './MlmMembersPage';
import { member, parent, renderMlm } from './task6.fixtures';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', () => ({ api: { get } }));

function renderMember(overrides: Record<string, unknown> = {}) {
  const row = {
    ...member, matrixParentId: parent.id,
    portefeuille: { totalGagne: 0, soldeDisponible: 0, soldeDisponibleRetrait: 0 },
    commissionSummary: { generatedTotal: '83.33', pendingTotal: '83.33', validatedTotal: '0.00' },
    ...overrides,
  };
  get.mockImplementation(async (url: string) => {
    if (url === '/mlm/members') return { data: { membres: [row] } };
    if (url === '/mlm/config') return { data: [] };
    throw new Error(`Unexpected request: ${url}`);
  });
  return renderMlm(<MlmMembersPage />, '/mlm/members', '/mlm/members');
}

beforeEach(() => { get.mockReset(); });

describe('MLM members relationship and earnings display', () => {
  it('shows the matrix parent name and matricule instead of its technical ID', async () => {
    renderMember();
    const link = await screen.findByRole('link', { name: 'Paul Parent' });
    expect(link).toHaveAttribute('href', '/mlm/members/parent');
    expect(screen.getByText('EBN-P')).toBeInTheDocument();
    expect(screen.getByText('Alice Recruteur')).toBeInTheDocument();
    expect(screen.queryByText('parent', { exact: true })).not.toBeInTheDocument();
  });

  it('shows generated and pending amounts without treating them as credited earnings', async () => {
    renderMember();
    const row = (await screen.findByText('Serge Mutombo')).closest('tr')!;
    expect(within(row).getByText(/Commissions générées/)).toHaveTextContent('83,33 USD');
    expect(within(row).getByText(/À valider/)).toHaveTextContent('83,33 USD');
    expect(within(row).getByText(/Gains crédités/)).toHaveTextContent('0 USD');
    expect(within(row).getByText(/Disponibles/)).toHaveTextContent('0 USD');
  });

  it('keeps actual wallet gains and available balance distinct from commission totals', async () => {
    renderMember({ portefeuille: { totalGagne: 173.33, soldeDisponible: 100, soldeDisponibleRetrait: 20 }, commissionSummary: { generatedTotal: '256.66', pendingTotal: '83.33', validatedTotal: '173.33' } });
    expect(await screen.findByText(/Gains crédités/)).toHaveTextContent('173,33 USD');
    expect(screen.getByText(/Disponibles/)).toHaveTextContent('20 USD');
    expect(screen.getByText(/Commissions générées/)).toHaveTextContent('256,66 USD');
  });

  it('marks missing parent and commission details as unavailable, not as a root or zero', async () => {
    renderMember({ matrixParent: undefined, matrixParentId: '127570eb-db26-481b-9bb8-f4f69327dc7b', commissionSummary: undefined });
    expect(await screen.findByText('Parent non fourni')).toBeInTheDocument();
    expect(screen.queryByText('127570eb-db26-481b-9bb8-f4f69327dc7b')).not.toBeInTheDocument();
    expect(screen.queryByText('Racine')).not.toBeInTheDocument();
    expect(screen.getByText('Commissions non fournies')).toBeInTheDocument();
  });

  it('shows a root and no wallet without inventing earnings', async () => {
    renderMember({ matrixParent: null, matrixParentId: null, portefeuille: null });
    expect(await screen.findByText('Racine')).toBeInTheDocument();
    expect(screen.getByText('Portefeuille non disponible')).toBeInTheDocument();
  });
});
