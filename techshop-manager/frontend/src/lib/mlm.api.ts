import { api } from '@/lib/api';
import type { Membre, Wallet } from '@/types/mlm';

export const mlmApi = {
  getStats: () => api.get('/mlm/stats'),
  getMember: (id: string) => api.get<Membre>(`/mlm/members/${id}/progress`),
  getMatrix: (id: string) => api.get(`/mlm/members/${id}/matrix`),
  getMyWallet: () => api.get<Wallet>('/mlm/wallet'),
  getWallet: (id: string) => api.get<Wallet>(`/mlm/wallet/${id}`),
  getLevels: () => api.get('/mlm/config/levels'),
  getBonuses: (params?: Record<string, string>) => api.get('/mlm/bonuses/pending', { params }),
  getSalaryPeriod: (month: string) => api.get(`/mlm/salaries/${month}`),
};
