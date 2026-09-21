import { api } from '@/lib/api';

// ── Shared types ──────────────────────────────────────────────────────────────

export type Granularite = 'day' | 'week' | 'month';

export interface DateRange {
  from: Date;
  to: Date;
}

// ── SCR-030 : Ventes Dashboard ────────────────────────────────────────────────

export interface VentesReportParams {
  siteId?: string;
  dateDebut: string;   // ISO "2025-01-01"
  dateFin: string;     // ISO "2025-01-31"
  granularite: Granularite;
}

export interface SiteCA {
  siteId: string;
  siteNom: string;
  ca: number;
  nbVentes: number;
  nbNouveauxClients: number;
  alertesStock: number;
  pourcentageCA: number;
}

export interface TopProduit {
  nom: string;
  sku: string;
  quantite: number;
  ca: number;
}

export interface SeriesPoint {
  label: string;
  values: Record<string, number>; // siteNom → CA
}

export interface VentesReportResponse {
  seriesCA: SeriesPoint[];
  totalCA: number;
  nbVentes: number;
  topProduits: TopProduit[];
  parSite: SiteCA[];
}

// ── SCR-031 : Ventes détaillées ───────────────────────────────────────────────

export interface VentesDetailParams {
  sortDir?: 'asc' | 'desc';
  siteId?: string;
  dateDebut?: string;
  dateFin?: string;
  page?: number;
  limit?: number;
  search?: string;
  modePaiement?: string;
  agentId?: string;
  categorie?: string;
}

export interface VenteDetail {
  id: string;
  numeroVente: string;
  createdAt: string;
  montantNet: number;
  montantBrut: number;
  remiseFidelite: number;
  remiseParrainage: number;
  pointsAttribues: number;
  modePaiement: string;
  statut: string;
  agent?: { id: string; nom: string };
  client?: { id: string; nom: string; prenom: string } | null;
  site?: { id: string; nom: string };
  lignes?: Array<{ produit: { nom: string; sku: string; categorie?: string }; quantite: number; prixUnitaire: number; sousTotal: number }>;
}

export interface AgentPerformance {
  agentId: string;
  agentNom: string;
  siteNom: string;
  nbVentes: number;
  caTotal: number;
  caMoyen: number;
  remisesAccordees: number;
}

export interface VentesDetailResponse {
  ventes: VenteDetail[];
  meta: { total: number; page: number; limit: number; totalPages: number };
  resume: {
    totalCA: number;
    nbVentes: number;
    remisesAccordees: number;
    ticketMoyen: number;
    trends: { ca: number; ventes: number };
  };
  totauxParAgent: AgentPerformance[];
}

// ── SCR-032 : Stocks consolidé ────────────────────────────────────────────────

export interface StocksReportParams {
  search?: string;
  siteId?: string;
  categorie?: string;
}

export interface StocksReportResponse {
  data: Array<{
    produit: { id: string; sku: string; nom: string; categorie: string; prixVente: number; prixAchat: number };
    totalQuantite: number;
    valeurStock: number;
    sites: Array<{ site: { id: string; nom: string }; quantite: number; seuilAlerte: number; alerte: boolean }>;
  }>;
  totalProduits: number;
  totalSites: number;
}

// ── SCR-033 : Parrainage ──────────────────────────────────────────────────────

export interface ParrainageReportParams {
  siteId?: string;
  dateDebut?: string;
  dateFin?: string;
}

export interface FunnelData {
  recits: number;
  formations: number;
  fiches: number;
  activations: number;
  tauxConversion: number;
}

export interface TopParrain {
  rang: number;
  clientId: string;
  nom: string;
  prenom: string;
  siteNom: string;
  nbFilleulsActives: number;
  caGenereParFilleuls: number;
  recompenseDue: number;
  recompenseType: string;
  statutRecompense: string;
}

export interface RecompenseDue {
  id: string;
  parrainId: string;
  parrainNom: string;
  filleulId: string;
  filleulNom: string;
  dateActivation: string;
  recompenseType: string;
  recompenseValeur: number;
  statutRecompense: string;
  createdAt: string;
}

export interface ParrainageReportResponse {
  summary: {
    parrainagesActifs: number;
    filleulsActives: number;
    recompensesDues: number;
    caGenereParFilleuls: number;
  };
  funnel: FunnelData;
  topParrains: TopParrain[];
  recompensesDues: RecompenseDue[];
}

// ── SCR-034 : Export ──────────────────────────────────────────────────────────

export type ExportType = 'VENTES' | 'VENTES_DETAIL' | 'STOCKS' | 'CLIENTS';
export type ExportFormat = 'XLSX' | 'CSV';

export interface ExportJobDto {
  type: ExportType;
  format: ExportFormat;
  filtres?: Record<string, unknown>;
}

export interface ExportJobStatus {
  jobId: string;
  type: string;
  format: string;
  statut: 'PENDING' | 'READY' | 'ERROR';
  downloadUrl?: string;
  fileName?: string;
  fileSize?: number;
  rowCount?: number;
  errorMsg?: string;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ── API client ────────────────────────────────────────────────────────────────

export const reportsApi = {
  // SCR-030
  getVentesReport: (params: VentesReportParams) =>
    api.get<VentesReportResponse>('/rapports/ventes/dashboard', { params }).then((r) => r.data),

  // SCR-031
  getVentesDetail: (params: VentesDetailParams, signal?: AbortSignal) =>
    api.get<VentesDetailResponse>('/rapports/ventes/detail', { params, signal }).then((r) => r.data),

  // SCR-034 estimate
  getExportEstimate: (body: ExportJobDto, signal?: AbortSignal) =>
    api.get<{ estimatedRows: number }>('/rapports/export/estimate', {
      params: { ...body.filtres, type: body.type, format: body.format }, signal,
    }).then((r) => r.data),

  // SCR-032
  getStocksReport: (params: StocksReportParams, signal?: AbortSignal) =>
    api.get<StocksReportResponse>('/rapports/stocks', { params, signal }).then((r) => r.data),

  // SCR-033
  getParrainageReport: (params: ParrainageReportParams) =>
    api.get<ParrainageReportResponse>('/rapports/parrainage', { params }).then((r) => r.data),

  // Ancien endpoint compatible (pour les anciens composants)
  getParrainage: (params: ParrainageReportParams) =>
    api.get('/rapports/parrainage', { params }).then((r) => r.data),

  // SCR-034
  createExportJob: (body: ExportJobDto, signal?: AbortSignal) =>
    api.post<{ jobId: string }>('/rapports/export', body, { signal }).then((r) => r.data),

  getExportJobStatus: (jobId: string, signal?: AbortSignal) =>
    api.get<ExportJobStatus>(`/rapports/export/${encodeURIComponent(jobId)}`, { signal }).then((r) => r.data),

  downloadExportJob: (jobId: string, signal?: AbortSignal) =>
    api.get<Blob>(`/rapports/export/${encodeURIComponent(jobId)}/download`, { responseType: 'blob', signal }).then((r) => r.data),
};
