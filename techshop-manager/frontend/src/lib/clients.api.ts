import { api } from '@/lib/api';
import type {
  Client,
  StatutClient,
  PaginatedResponse,
  ModePaiement,
  EtapeOnboarding,
  StatutEtape,
} from '@/types';

// ── Type réponse détail client ────────────────────────────────────

export interface OnboardingEtapeDetail {
  etape: EtapeOnboarding;
  statut: StatutEtape;
  completeeAt: string | null;
  agentNom: string | null;
  agentRole: string | null;
  montant: number | null;
  modePaiement: ModePaiement | null;
  referenceTransaction: string | null;
  notes: string | null;
}

export interface FilleulRow {
  id: string;
  prenom: string;
  nom: string;
  codeParrain: string | null;
  statut: StatutClient;
  dateActivation: string | null;
  pointsGeneres: number;
  createdAt: string;
}

export interface AchatRow {
  id: string;
  numeroVente: string;
  createdAt: string;
  lignes: Array<{ produitNom: string; quantite: number }>;
  montantNet: number;
  montantBrut: number;
  modePaiement: ModePaiement;
  statut: string;
}


export interface ClientDetail extends Client {
  site: { id: string; nom: string };
  parrain: { id: string; prenom: string; nom: string; codeParrain: string; siteNom?: string } | null;
  onboardingEtapes: OnboardingEtapeDetail[];
  ventes: AchatRow[];
  hasTransactions: boolean;
}

// ── Types requêtes / réponses ─────────────────────────────────────

export interface ClientQueryParams {
  search?: string;
  siteId?: string | null;
  statut?: StatutClient | '';
  page?: number;
  limit?: number;
}

export interface ClientRow {
  id: string;
  prenom: string;
  nom: string;
  telephone: string;
  statut: StatutClient;
  site: { id: string; nom: string };
  codeParrain: string | null;
  createdAt: string;
}


export interface ClientSearchResult {
  id: string;
  prenom: string;
  nom: string;
  telephone: string;
  codeParrain: string | null;
  statut: StatutClient;
}
export interface OnboardingRecitDto {
  prenom: string;
  nom: string;
  telephone: string;
  email?: string;
  siteId: string;
  codeParrain?: string;
  matriculeExterne?: string;
  montantRecit: number;
  modePaiement: ModePaiement;
  numeroRecu?: string;
}

export interface OnboardingFormationDto {
  formateurId: string;
  dateFormation: string;
  dureeMinutes?: number;
  notes?: string;
}

export interface OnboardingFicheDto {
  montantFiche: number;
  modePaiement: ModePaiement;
  numeroTransaction?: string;
}

export interface UpdateClientDto {
  prenom?: string;
  nom?: string;
  telephone?: string;
  email?: string;
  notes?: string;
}

export interface ImportPreviewRow {
  ligne: number;
  matricule: string;
  nom: string;
  telephone: string;
  statut: 'OK' | 'DOUBLON' | 'ERREUR';
  message?: string;
}

export interface ImportPreviewResponse {
  total: number;
  ok: number;
  doublons: number;
  erreurs: number;
  lignes: ImportPreviewRow[];
}

export interface ImportExecuteResponse {
  success: number;
  doublons: number;
  errors: number;
  errorDetails?: Array<{ ligne: number; message: string }>;
}

// ── API client layer ──────────────────────────────────────────────

export const clientsApi = {
  // SCR-005 — Liste
  getList: (params: ClientQueryParams) =>
    api
      .get<PaginatedResponse<ClientRow>>('/clients', { params })
      .then((r) => r.data),

  // Recherche rapide (Caisse POS)
  search: (q: string) =>
    api
      .get<{ clients: ClientSearchResult[] }>('/clients/search', {
        params: { q, statut: 'ACTIF' },
      })
      .then((r) => r.data),

  // Vérification téléphone (dédoublonnage formulaires)
  checkPhone: (phone: string) =>
    api
      .get<{ exists: boolean; clientId?: string }>(
        `/clients/check-phone/${phone}`,
      )
      .then((r) => r.data),

  // Vérification code parrain
  checkCodeParrain: (code: string) =>
    api
      .get<{ valid: boolean; parrainNom?: string }>(
        `/parrainage/check-code/${code}`,
      )
      .then((r) => r.data),

  // SCR-006 — Détail simple (utilisé par d'autres modules)
  getById: (id: string) =>
    api.get<Client>(`/clients/${id}`).then((r) => r.data),

  // SCR-006 — Détail complet avec onboarding, parrainage, achats, points
  getDetailById: (id: string) =>
    api.get<ClientDetail>(`/clients/${id}`).then((r) => r.data),

  update: (id: string, body: UpdateClientDto) =>
    api.patch<{ client: Client }>(`/clients/${id}`, body).then((r) => r.data),

  // SCR-007 — Onboarding étape 1
  createOnboardingRecit: (body: OnboardingRecitDto) =>
    api
      .post<{ client: Client; etapeId: string }>('/clients/onboarding/recit', body)
      .then((r) => r.data),

  // SCR-008 — Onboarding étape 2
  validateFormation: (clientId: string, body: OnboardingFormationDto) =>
    api
      .post<{ success: boolean }>(`/clients/${clientId}/onboarding/formation`, body)
      .then((r) => r.data),

  // SCR-009 — Onboarding étape 3
  validateFiche: (clientId: string, body: OnboardingFicheDto) =>
    api
      .post<{ success: boolean }>(`/clients/${clientId}/onboarding/fiche`, body)
      .then((r) => r.data),

  // SCR-010 — Activation
  activateAccount: (clientId: string) =>
    api
      .post<{ client: Client; codeParrain: string }>(
        `/clients/${clientId}/onboarding/activate`,
      )
      .then((r) => r.data),

  // SCR-011 — Import CSV
  importPreview: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api
      .post<ImportPreviewResponse>('/clients/import/preview', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data);
  },

  importExecute: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api
      .post<ImportExecuteResponse>('/clients/import/execute', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data);
  },
};
