import { api } from './api';
import { withPaymentAvailability } from './mobile-money';
import type { CalendarYear, MatrixTreeNode, MoveMemberInput, PlacementHistory, SwapMembersInput } from '@/types/mlm';

export const MlmApi = {
  // ── Stats & Dashboard ───────────────────────────────────────────────────────
  getNetworkStats: async () => {
    const { data } = await api.get('/mlm/stats');
    return data;
  },
  getMembersByLevel: async () => {
    const { data } = await api.get('/mlm/members-by-level');
    return data;
  },
  getRecentPromotions: async (limit = 10) => {
    const { data } = await api.get('/mlm/promotions/recent', { params: { limit } });
    return data;
  },

  // ── Members & Progression ───────────────────────────────────────────────────
  listMembers: async (params: {
    page?: number;
    limit?: number;
    statut?: string;
    levelId?: number;
    parrainId?: string;
    search?: string;
  }) => {
    const { data } = await api.get('/mlm/members', { params });
    return data;
  },
  getMemberProgress: async (memberId: string) => {
    const { data } = await api.get(`/mlm/members/${memberId}/progress`);
    return data;
  },
  getMemberFilleuls: async (memberId: string, params: { page?: number; limit?: number } = {}) => {
    const { data } = await api.get(`/mlm/members/${memberId}/filleuls`, { params });
    return data;
  },
  getPromotionHistory: async (memberId: string) => {
    const { data } = await api.get(`/mlm/members/${memberId}/promotions`);
    return data;
  },

  // ── Matrix & Tree ───────────────────────────────────────────────────────────
  getMemberMatrix: async (memberId: string, level: number) => {
    const { data } = await api.get(`/mlm/matrix/${memberId}/${level}`);
    return data;
  },
  getNetworkTree: async (memberId: string, depth = 3): Promise<MatrixTreeNode> => {
    const { data } = await api.get(`/mlm/matrix/${memberId}/tree`, { params: { depth } });
    return data;
  },

  moveMember: async (input: MoveMemberInput) => {
    const { data } = await api.post('/mlm/matrix/move', input);
    return data;
  },
  swapMembers: async (input: SwapMembersInput) => {
    const { data } = await api.post('/mlm/matrix/swap', input);
    return data;
  },
  reconcileAscents: async (memberId: string, input: { operationId: string; reason: string }): Promise<PlacementHistory[]> => {
    const { data } = await api.post<PlacementHistory[]>(`/mlm/matrix/${memberId}/reconcile-ascents`, input);
    return data;
  },
  getPlacementHistory: async (memberId: string, page = 1, limit = 20): Promise<{ items: PlacementHistory[]; meta: { total: number; page: number; limit: number; totalPages: number } }> => {
    const { data } = await api.get(`/mlm/matrix/${memberId}/history`, { params: { page, limit } });
    return data;
  },
  getCalendar: async (): Promise<CalendarYear[]> => {
    const { data } = await api.get('/mlm/config/calendar');
    return data;
  },
  updateCalendar: async (year: number, input: Omit<CalendarYear, 'year'>) => {
    const { data } = await api.put(`/mlm/config/calendar/${year}`, input);
    return data;
  },
  releaseReinvestLot: async (lotId: string) => {
    const { data } = await api.post(`/mlm/reinvest/${lotId}/release`);
    return data;
  },

  // ── Commissions (Option B) ──────────────────────────────────────────────────
  listCommissions: async (params: {
    page?: number;
    limit?: number;
    statut?: string;
    membreId?: string;
    levelId?: number;
    dateFrom?: string;
    dateTo?: string;
  }) => {
    const { data } = await api.get('/mlm/commissions', { params });
    return data;
  },
  validateCommission: async (commissionId: string) => {
    const { data } = await api.put(`/mlm/commissions/${commissionId}/validate`);
    return data;
  },
  payCommission: async (commissionId: string) => {
    const { data } = await api.put(`/mlm/commissions/${commissionId}/pay`);
    return data;
  },
  cancelCommission: async (commissionId: string, notes?: string) => {
    const { data } = await api.patch(`/mlm/commissions/${commissionId}/cancel`, { notes });
    return data;
  },
  listPayouts: async (params: { page?: number; limit?: number; statut?: string } = {}) => {
    const { data } = await api.get('/mlm/payouts', { params });
    return data;
  },
  approvePayout: async (payoutId: string) => {
    const { data } = await withPaymentAvailability('MOBILE_MONEY', () => api.put(`/mlm/payouts/${payoutId}/approve`));
    return data;
  },
  cancelPayout: async (payoutId: string) => {
    const { data } = await api.patch(`/mlm/payouts/${payoutId}/cancel`);
    return data;
  },

  // ── Withdrawal Requests (Admin) ─────────────────────────────────────────────
  listWithdrawalRequests: async (params: {
    page?: number;
    limit?: number;
    statut?: string;
    membreId?: string;
  }) => {
    const { data } = await api.get('/mlm/withdrawal-requests', { params });
    return data;
  },
  approveWithdrawalRequest: async (requestId: string, approvedById: string, notes?: string, type: 'CASH' | 'MOBILE_MONEY' = 'MOBILE_MONEY') => {
    const { data } = await withPaymentAvailability(type, () => api.put(`/mlm/withdrawal-requests/${requestId}/approve`, {
      approvedById,
      notes,
    }));
    return data;
  },
  rejectWithdrawalRequest: async (requestId: string, rejectReason: string) => {
    const { data } = await api.patch(`/mlm/withdrawal-requests/${requestId}/reject`, {
      rejectReason,
    });
    return data;
  },
  markWithdrawalAsPaid: async (requestId: string) => {
    const { data } = await api.put(`/mlm/withdrawal-requests/${requestId}/mark-paid`);
    return data;
  },

  // ── Wallet ──────────────────────────────────────────────────────────────────
  getWallet: async (memberId?: string) => {
    const url = memberId ? `/mlm/wallet/${memberId}` : '/mlm/wallet';
    const { data } = await api.get(url);
    return data;
  },
  getTransactions: async (params: { page: number; limit: number; memberId?: string; type?: string }) => {
    const { data } = await api.get('/mlm/wallet/transactions', { params });
    return data;
  },
  getEarningsByLevel: async (memberId?: string) => {
    const url = memberId ? `/mlm/wallet/${memberId}/earnings-by-level` : '/mlm/wallet/earnings-by-level';
    const { data } = await api.get(url);
    return data;
  },

  // ── Configuration ───────────────────────────────────────────────────────────
  getConfig: async () => {
    const { data } = await api.get('/mlm/config');
    return data;
  },
  updateConfig: async (config: any) => {
    const { data } = await api.put('/mlm/config', config);
    return data;
  },

  // ── Bonuses ─────────────────────────────────────────────────────────────────
  getNotificationCounts: async (): Promise<{
    retraitsEnAttente: number;
    bonusALivrer: number;
    reclamationsEnAttente: number;
    total: number;
  }> => {
    const { data } = await api.get('/mlm/notifications/counts');
    return data;
  },

  getPendingBonuses: async (params: { page: number; limit: number }) => {
    const { data } = await api.get('/mlm/bonuses/pending', { params });
    return data;
  },
  deliverBonus: async (bonusId: string) => {
    const { data } = await api.put(`/mlm/bonuses/${bonusId}/deliver`);
    return data;
  },

  // ── Salaries & Retirement ───────────────────────────────────────────────────
  getMemberSalaries: async (memberId: string) => {
    const { data } = await api.get(`/mlm/salaries/member/${memberId}`);
    return data;
  },
  getAllSalariesPeriod: async (period: string) => {
    const { data } = await api.get('/mlm/salaries', { params: { period } });
    return data;
  },
  getMemberRetirement: async (memberId: string) => {
    const { data } = await api.get(`/mlm/retirement/${memberId}`);
    return data;
  },
  validateRetirement: async (bonusId: string) => {
    const { data } = await api.put(`/mlm/retirement/${bonusId}/validate`);
    return data;
  },

  // ── Réclamations de filleuls (parrain non activé) ──────────────────────────
  listPendingClaims: async (params?: { siteId?: string }) => {
    const { data } = await api.get('/mlm/claims', { params });
    return data as Array<{
      id: string;
      createdAt: string;
      filleul: { id: string; prenom: string; nom: string; telephone: string; statut: string };
      parrain: { id: string; prenom: string; nom: string; telephone: string; statut: string };
    }>;
  },
  confirmClaim: async (body: { parrainClientId?: string; telephoneParrain?: string; codeFacture: string }) => {
    const { data } = await api.post('/mlm/claims/confirm', body);
    return data as { attachés: number; conflits: number; facture: string };
  },
};
