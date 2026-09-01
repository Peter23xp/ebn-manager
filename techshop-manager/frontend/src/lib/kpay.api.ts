import { api } from '@/lib/api';

export type KpayProvider = 'VODACOM_MPESA_COD' | 'AIRTEL_COD' | 'ORANGE_COD';

export const kpayApi = {
  initSale: (body: { siteId: string; clientId?: string; lignes: Array<{ produitId: string; quantite: number }>; modePaiement: string; provider: KpayProvider; phoneNumber: string }) => api.post('/ventes/kpay/init', body).then((r) => r.data),
  saleStatus: (transactionId: string) => api.get(`/ventes/kpay/${transactionId}`).then((r) => r.data),
  initFiche: (clientId: string, body: { amount: number; provider: KpayProvider; phoneNumber: string }) => api.post(`/clients/${clientId}/onboarding/fiche/kpay/init`, body).then((r) => r.data),
  initRecit: (body: Record<string, unknown>) => api.post('/clients/onboarding/recit/kpay/init', body).then((r) => r.data),
  /** Reprise du RÉCIT Cash d'un client existant (depuis la file d'attente) */
  resumeRecit: (clientId: string, body: { montantRecit: number; modePaiement: string; numeroRecu?: string }) =>
    api.post(`/clients/${clientId}/onboarding/recit`, body).then((r) => r.data),
  /** Reprise du RÉCIT KPay d'un client existant (depuis la file d'attente) */
  resumeRecitKpay: (clientId: string, body: { montantRecit: number; provider: KpayProvider; phoneNumber: string }) =>
    api.post(`/clients/${clientId}/onboarding/recit/kpay/init`, body).then((r) => r.data),
  initPayout: (memberId: string, body: { amount: number; provider: KpayProvider; phoneNumber: string }) => api.post(`/mlm/wallet/${memberId}/payouts`, body).then((r) => r.data),
};
