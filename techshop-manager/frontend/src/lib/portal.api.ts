import { api } from '@/lib/api';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface NiveauConfig {
  id: string;
  nom: string;
  seuilPts: number;
  remisePct: number;
  couleur?: string;
}

export interface PortalHomeData {
  client: {
    id: string;
    prenom: string;
    nom: string;
    telephone: string;
    codeParrain?: string;
    statut: string;
    /** Legacy loyalty — retained during MLM migration, portal still reads these */
    niveauFidelite?: string;
    pointsFidelite?: number;
    pointsCumules?: number;
    remisePct?: number;
  };
  prochainNiveau: {
    nom: string;
    seuilPts: number;
    pointsManquants: number;
  } | null;
  niveauxConfig: NiveauConfig[];
  nbFilleulsActifs: number;
  nbFilleulsTotal: number;
  dernierAchats: DernierAchat[];
}

export interface DernierAchat {
  id: string;
  date: string;
  produitPrincipal: string;
  montantTotal: number;
  nbArticles: number;
}

export interface PortalPurchase {
  id: string;
  date: string;
  siteNom: string;
  produitPrincipal: string;
  nbArticles: number;
  montantTotal: number;
  remiseAppliquee: number;
  pointsAttribues: number;
  modePaiement: string;
}

export interface PortalPurchasesResponse {
  achats: PortalPurchase[];
  stats: {
    totalDepense: number;
    nbAchats: number;
    totalPointsGagnes: number;
  };
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export interface PortalPurchaseDetail {
  vente: {
    id: string;
    numeroVente?: string;
    date: string;
    siteNom: string;
    modePaiement: string;
    lignes: Array<{
      nom: string;
      quantite: number;
      prixUnitaire: number;
      sousTotal: number;
    }>;
    montantBrut: number;
    remiseFidelite: number;
    montantNet: number;
    pointsAttribues: number;
    soldePointsApres?: number;
  };
}

export interface PortalWalletTransaction {
  id: string;
  type: string;
  montant: number;
  description?: string;
  createdAt: string;
}

export interface PortalWalletTransactionsResponse {
  transactions: PortalWalletTransaction[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export interface PortalPayoutInput {
  amount: number;
  provider: 'VODACOM_MPESA_COD' | 'AIRTEL_COD' | 'ORANGE_COD';
  phoneNumber: string;
}

export interface ValidatedCommission {
  id: string;
  montant: number;
  description: string;
  createdAt: string;
  valideeAt: string | null;
  level: {
    id: number;
    ordre: number;
    nom: string;
  };
  filleul: {
    id: string;
    matricule: string;
    client: {
      id: string;
      prenom: string;
      nom: string;
    };
  } | null;
}

export interface ValidatedCommissionsResponse {
  commissions: ValidatedCommission[];
  totalDisponible: number;
}

export interface WithdrawalRequest {
  id: string;
  montant: number;
  type: 'MOBILE_MONEY' | 'CASH';
  provider?: string;
  phoneNumber?: string;
  statut: 'EN_ATTENTE' | 'APPROUVE' | 'REJETE' | 'PAYE' | 'ANNULE';
  commissionIds: string[];
  notes?: string;
  rejectReason?: string;
  createdAt: string;
  approvedAt?: string;
  paidAt?: string;
}

export interface WithdrawalRequestsResponse {
  requests: WithdrawalRequest[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export interface CreateWithdrawalRequestInput {
  montant: number;
  type: 'MOBILE_MONEY' | 'CASH';
  provider?: string;
  phoneNumber?: string;
  commissionIds: string[];
  notes?: string;
}

export interface PortalFilleul {
  id: string;
  parrainId?: string;
  prenom: string;
  nom: string;
  statut: 'ACTIF' | 'EN_COURS' | 'SUSPENDU';
  dateInscription: string;
  etapeEnCours?: string;
  generation?: number;
}

export interface PortalReferralsResponse {
  codeParrain: string;
    stats: {
    nbFilleulsActifs: number;
    nbFilleulsTotal: number;
    gainsTotaux: number;
    typeRecompense: string;
    recompenseValeur: number;
  };
  filleuls: PortalFilleul[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

// ── API calls ─────────────────────────────────────────────────────────────────

export const portalApi = {
  getHomeData: (): Promise<PortalHomeData> =>
    api.get('/portal/me').then((r) => r.data),

  getPurchases: (params: {
    period: 'month' | '3months' | 'all';
    page: number;
    limit?: number;
  }): Promise<PortalPurchasesResponse> =>
    api.get('/portal/purchases', { params: { ...params, limit: params.limit ?? 20 } }).then((r) => r.data),

  getPurchaseDetail: (venteId: string): Promise<PortalPurchaseDetail> =>
    api.get(`/portal/purchases/${venteId}`).then((r) => r.data),

  getWalletTransactions: (params: {
    typeFilter: 'all' | 'gains' | 'retraits';
    page: number;
    limit?: number;
  }): Promise<PortalWalletTransactionsResponse> =>
    api.get('/portal/wallet/transactions', { params: { ...params, limit: params.limit ?? 20 } }).then((r) => r.data),

  getReferrals: (params: {
    filter: 'actifs' | 'en_attente' | 'tous';
    page: number;
    limit?: number;
  }): Promise<PortalReferralsResponse> =>
    api.get('/portal/referrals', { params: { ...params, limit: params.limit ?? 20 } }).then((r) => r.data),

  getWallet: () =>
    api.get('/portal/wallet').then((r) => r.data),

  initPayout: (input: PortalPayoutInput) =>
    api.post('/portal/wallet/payouts', input).then((r) => r.data),

  getValidatedCommissions: (): Promise<ValidatedCommissionsResponse> =>
    api.get('/portal/commissions/validated').then((r) => r.data),

  createWithdrawalRequest: (input: CreateWithdrawalRequestInput) =>
    api.post('/portal/withdrawal-requests', input).then((r) => r.data),

  getWithdrawalRequests: (params: {
    statut?: string;
    page: number;
    limit?: number;
  }): Promise<WithdrawalRequestsResponse> =>
    api.get('/portal/withdrawal-requests', { params: { ...params, limit: params.limit ?? 20 } }).then((r) => r.data),

  cancelWithdrawalRequest: (requestId: string): Promise<{ id: string; statut: string }> =>
    api.patch(`/portal/withdrawal-requests/${requestId}/cancel`).then((r) => r.data),
};
