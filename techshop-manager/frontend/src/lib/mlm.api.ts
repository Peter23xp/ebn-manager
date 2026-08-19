import { api } from './api';

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
  getMemberFilleuls: async (memberId: string) => {
    const { data } = await api.get(`/mlm/members/${memberId}/filleuls`);
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
  getNetworkTree: async (memberId: string, depth = 3) => {
    const { data } = await api.get(`/mlm/matrix/${memberId}/tree`, { params: { depth } });
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
};
