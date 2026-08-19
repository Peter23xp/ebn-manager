import { api } from '@/lib/api';
import type { Vente, ModePaiement, StatutVente } from '@/types';

export interface ProduitPOS {
  id: string;
  sku: string;
  nom: string;
  categorie: string;
  prixVente: number;
  stockDisponible: number;
  seuilAlerte: number;
  statut: 'OK' | 'ALERTE' | 'RUPTURE';
}

export interface CreateVenteDto {
  clientId?: string;
  siteId: string;
  lignes: Array<{ produitId: string; quantite: number; prixUnitaire: number }>;
  modePaiement: ModePaiement;
  referenceTransaction?: string;
  montantRecu?: number;
}

export interface VenteResult {
  id: string;
  numeroVente: string;
  montantBrut: number;
  montantNet: number;
  createdAt: string;
}

export interface SalesFilters {
  siteId?: string;
  dateDebut?: string;
  dateFin?: string;
  modePaiement?: string;
  search?: string;
  statut?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: string;
}

export interface SalesListResponse {
  ventes: Array<{
    id: string;
    numeroVente: string;
    createdAt: string;
    agent: { id: string; nom: string; prenom?: string };
    client?: { id: string; nom: string; prenom: string };
    montantNet: number;
    modePaiement: ModePaiement;
    statut: StatutVente;
  }>;
  meta: { total: number; page: number; limit: number; totalPages: number };
  kpis: { totalCA: number; nbVentes: number; panierMoyen: number };
}

export const ventesApi = {
  searchProduits: (params: { q?: string; siteId: string; categorie?: string; stockOnly?: boolean }) =>
    api.get<{ produits: ProduitPOS[] }>('/produits/search', { params }).then((r) => r.data),

  create: (body: CreateVenteDto) =>
    api.post<{ vente: VenteResult }>('/ventes', body).then((r) => r.data),

  list: (filters: SalesFilters) =>
    api.get<SalesListResponse>('/ventes', { params: filters }).then((r) => r.data),

  getById: (id: string) =>
    api.get<Vente>(`/ventes/${id}`).then((r) => r.data),
};
