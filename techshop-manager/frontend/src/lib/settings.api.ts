import { api } from './api';
import type { Utilisateur, Site, Role } from '@/types';

// ── Users ─────────────────────────────────────────────────────────
export interface UsersListResponse {
  data: Utilisateur[];
  total: number;
}

export interface CreateUserPayload {
  nom: string;
  telephone: string;
  role: Role;
  siteId?: string;
  passwordTemp: string;
}

export interface ResetPasswordResponse {
  success: boolean;
  message: string;
  tempPassword?: string;
}

export interface UpdateUserPayload {
  nom?: string;
  email?: string;
  role?: Role;
  siteId?: string | null;
}

export const usersApi = {
  getAll: (params?: { role?: string; siteId?: string; actif?: string }) =>
    api.get<UsersListResponse>('/users', { params }).then((r) => r.data),

  create: (payload: CreateUserPayload) =>
    api.post<Utilisateur>('/users', payload).then((r) => r.data),

  update: (id: string, payload: UpdateUserPayload) =>
    api.patch<Utilisateur>(`/users/${id}`, payload).then((r) => r.data),

  desactiver: (id: string) =>
    api.patch<Utilisateur>(`/users/${id}/desactiver`).then((r) => r.data),

  reactiver: (id: string) =>
    api.patch<Utilisateur>(`/users/${id}/reactiver`).then((r) => r.data),

  resetPassword: (id: string) =>
    api.patch<ResetPasswordResponse>(`/users/${id}/reset-password`).then((r) => r.data),

  updateProfile: (payload: { nom?: string; email?: string; langue?: string }) =>
    api.patch<Utilisateur>('/users/me', payload).then((r) => r.data),

  changePassword: (payload: { currentPassword: string; newPassword: string }) =>
    api.patch<{ success: boolean; message: string }>('/users/me/password', payload).then((r) => r.data),

  me: () => api.get<Utilisateur>('/users/me').then((r) => r.data),
};

// ── Sites ─────────────────────────────────────────────────────────
export interface SiteWithCounts extends Site {
  _count?: { utilisateurs: number; clients: number };
  gerant?: Pick<Utilisateur, 'id' | 'nom'>;
}

export interface SitesListResponse {
  data: SiteWithCounts[];
  total: number;
}

export interface CreateSitePayload {
  nom: string;
  ville: string;
  adresse?: string;
  gerantId?: string;
}

export interface UpdateSitePayload {
  nom?: string;
  ville?: string;
  adresse?: string;
  gerantId?: string;
  actif?: boolean;
}

export const sitesApi = {
  getAll: () => api.get<SitesListResponse>('/sites').then((r) => r.data),

  create: (payload: CreateSitePayload) =>
    api.post<SiteWithCounts>('/sites', payload).then((r) => r.data),

  update: (id: string, payload: UpdateSitePayload) =>
    api.patch<SiteWithCounts>(`/sites/${id}`, payload).then((r) => r.data),
};

// ── Config ────────────────────────────────────────────────────────
export interface AppConfig {
  generale: {
    matriculeExterneActif: boolean;
    matriculeRegex: string | null;
    dureeSectionHeures: number;
    delaiRetourJours: number;
    fraisRetourPct: number;
    smsApiKey: string | null;
    smsUsername: string | null;
    smsSenderId: string | null;
    kpayAutoPayoutActif: boolean;
    kpayAutoPayoutProvider: 'VODACOM_MPESA_COD' | 'AIRTEL_COD' | 'ORANGE_COD' | null;
    kpayAutoPayoutPhone: string | null;
    kpayAdminMpesaPhone: string | null;
    kpayAdminAirtelPhone: string | null;
    kpayAdminOrangePhone: string | null;
  };
  fidelite: {
    ratioPtsCDF: number;
    dureeValiditeMois: number;
    cumulRemises: boolean;
    niveaux: Array<{ id?: string; nom: string; seuilPts: number; remisePct: number }>;
  };
  parrainage: {
    multiNiveaux: boolean;
    typeRecompense: 'POINTS' | 'REMISE_PROCHAINE_VENTE' | 'COMMISSION_CDF';
    valeurNiveau1: number;
    valeurNiveau2: number | null;
    conditionDeclenchement: 'ACTIVATION' | 'PREMIER_ACHAT';
    plafondMensuel: number | null;
  };
}

export type UpdateConfigPayload = {
  generale?: Partial<AppConfig['generale']>;
  fidelite?: Partial<AppConfig['fidelite']>;
  parrainage?: Partial<AppConfig['parrainage']>;
};

export interface SystemStats {
  clients: { total: number; actifs: number; enCours: number };
  utilisateurs: { total: number; actifs: number; inactifs: number };
  sites: { total: number; actifs: number; inactifs: number };
  stocks: { totalProduits: number; alertes: number; ruptures: number };
  ventes: {
    aujourdhui: { count: number; montant: number };
    mois: { count: number; montant: number };
  };
  parrainage: { total: number };
  systeme: {
    nodeVersion: string;
    uptime: number;
    memoire: number;
    environnement: string;
    smsConfigured: boolean;
  };
}

export const configApi = {
  getConfig: () => api.get<AppConfig>('/config').then((r) => r.data),
  updateConfig: (payload: UpdateConfigPayload) =>
    api.patch<{ success: boolean }>('/config', payload).then((r) => r.data),
  testSms: (phone: string) =>
    api.post<{ success: boolean; message: string }>('/config/test-sms', { phone }).then((r) => r.data),
  getSystemStats: () => api.get<SystemStats>('/config/system-stats').then((r) => r.data),
};
