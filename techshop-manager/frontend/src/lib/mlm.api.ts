import { api } from './api';
import type { PaginatedResponse, Membre, MlmLevel, Matrix, TransactionPortefeuille, BonusAttribue, Promotion, SalaireVerse, Portefeuille } from '@/types';

export const MlmApi = {
  // Stats & Dashboard
  getNetworkStats: async () => {
    const { data } = await api.get('/mlm/stats');
    return data;
  },
  getMembersByLevel: async () => {
    const { data } = await api.get('/mlm/members-by-level');
    return data;
  },
  getRecentPromotions: async () => {
    const { data } = await api.get('/mlm/promotions/recent');
    return data;
  },

  // Members & Progression
  getMemberProgress: async (memberId: string) => {
    const { data } = await api.get(`/mlm/members/${memberId}/progress`);
    return data;
  },
  getPromotionHistory: async (memberId: string) => {
    const { data } = await api.get(`/mlm/members/${memberId}/promotions`);
    return data;
  },

  // Matrix
  getMemberMatrix: async (memberId: string, level: number) => {
    const { data } = await api.get(`/mlm/matrix/${memberId}/${level}`);
    return data;
  },
  getNetworkTree: async (memberId: string) => {
    const { data } = await api.get(`/mlm/matrix/${memberId}/tree`);
    return data;
  },

  // Wallet
  getWallet: async (memberId?: string) => {
    const url = memberId ? `/mlm/wallet/${memberId}` : '/mlm/wallet';
    const { data } = await api.get<{ portefeuille: Portefeuille }>(url);
    return data;
  },
  getTransactions: async (params: { page: number; limit: number; memberId?: string }) => {
    const { data } = await api.get<PaginatedResponse<TransactionPortefeuille>>('/mlm/wallet/transactions', { params });
    return data;
  },
  getEarningsByLevel: async (memberId?: string) => {
    const url = memberId ? `/mlm/wallet/${memberId}/earnings-by-level` : '/mlm/wallet/earnings-by-level';
    const { data } = await api.get(url);
    return data;
  },

  // Configuration
  getConfig: async () => {
    const { data } = await api.get('/mlm/config');
    return data;
  },
  updateConfig: async (config: any) => {
    const { data } = await api.put('/mlm/config', config);
    return data;
  },

  // Bonuses
  getPendingBonuses: async (params: { page: number; limit: number }) => {
    const { data } = await api.get<PaginatedResponse<BonusAttribue>>('/mlm/bonuses/pending', { params });
    return data;
  },
  deliverBonus: async (bonusId: string) => {
    const { data } = await api.put(`/mlm/bonuses/${bonusId}/deliver`);
    return data;
  },

  // Salaries & Retirement
  getMemberSalaries: async (memberId: string) => {
    const { data } = await api.get<SalaireVerse[]>(`/mlm/salaries/member/${memberId}`);
    return data;
  },
  getAllSalariesPeriod: async (period: string) => {
    const { data } = await api.get<SalaireVerse[]>('/mlm/salaries', { params: { period } });
    return data;
  },
  getMemberRetirement: async (memberId: string) => {
    const { data } = await api.get(`/mlm/retirement/${memberId}`);
    return data;
  },
};
