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

export interface PortalFilleul {
  id: string;
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
};
