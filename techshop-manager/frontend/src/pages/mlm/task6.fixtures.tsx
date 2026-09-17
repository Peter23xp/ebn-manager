import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render } from '@testing-library/react';

export const builder = { id: 1, ordre: 1, nom: 'Builder', couleur: '#f59e0b', requiredPositions: 4, immediateAmount: '24.00', heldAmount: '16.00', totalAmount: '40.00', commissionParFilleul: 10, commissionTotale: 40, bonusDescription: '2 pagnes', salaireMensuel: 0, salaireActif: false, isActive: true };
export const sapphire = { ...builder, id: 2, ordre: 2, nom: 'Sapphire', requiredPositions: 16, immediateAmount: '50.00', heldAmount: '33.33', totalAmount: '83.33' };
export const summary = { generatedTotal: '40.00', validatedTotal: '40.00', immediateAmount: '24.00', heldAmount: '16.00', releasableAmount: '0.00', releasedAmount: '0.00' };
export const lot = { id: 'lot-1', amount: '16.00', releaseDate: '2026-10-23T23:30:00Z', releasedAt: null, status: 'HOLD_PERIOD', commissionId: 'commission-1', calendarVersion: 'rdc-2026-v1', timezone: 'Africa/Lubumbashi' };
export const recruiter = { id: 'recruiter', matricule: 'EBN-R', client: { prenom: 'Alice', nom: 'Recruteur' } };
export const parent = { id: 'parent', matricule: 'EBN-P', client: { prenom: 'Paul', nom: 'Parent' } };
export const progression = { currentLevel: null, nextLevel: builder, currentGeneration: 1, completedPositions: 3, requiredPositions: 4, remainingPositions: 1, progressPercentage: 75, highestLevelAchieved: 0 };
export const member = { id: 'member-1', matricule: 'EBN-1', statut: 'ACTIF', client: { id: 'client-1', prenom: 'Serge', nom: 'Mutombo', telephone: '243900000001' }, level: builder, recruiter, matrixParent: parent, positionId: 'slot-1', position: 2 };
export const progressData = { membre: member, progression, directMatrixChildrenCount: 3, personalRecruitCount: 7, totalDescendants: 11, matrices: [{ id: 'matrix-1', niveau: builder, filleulsValides: 3, occupiedPositions: 4, requiredPositions: 4, positions: [], estComplete: false }], portefeuille: { soldeDisponible: '9.00', totalGagne: '40.00' }, financialSummary: summary, reinvestLots: [lot], filleuls: [], commissions: [] };
export const treeNode = { ...member, level: null, generation: 0, progression, directMatrixChildrenCount: 3, personalRecruitCount: 7, totalDescendants: 11, emptyPositions: [4], children: [], hasMore: true };

export function renderMlm(element: ReactNode, path = '/mlm/members/member-1', route = '/mlm/members/:id') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return { client, ...render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><Routes><Route path={route} element={element} /></Routes></MemoryRouter></QueryClientProvider>) };
}
