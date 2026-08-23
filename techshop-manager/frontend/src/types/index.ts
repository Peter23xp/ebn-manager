// ============================================
// ENUMS
// ============================================

export type Role = 'SUPER_ADMIN' | 'DIRECTEUR_REGIONAL' | 'GERANT' | 'AGENT' | 'FORMATEUR' | 'CLIENT';

export type StatutClient = 'EN_COURS' | 'ACTIF' | 'SUSPENDU' | 'ARCHIVE';



export type EtapeOnboarding = 'RECIT' | 'FORMATION' | 'FICHE' | 'ACTIVATION';

export type StatutEtape = 'EN_ATTENTE' | 'EN_COURS' | 'COMPLETE';

export type ModePaiement = 'CASH' | 'MPESA' | 'AIRTEL_MONEY' | 'VIREMENT';

export type StatutVente = 'VALIDE' | 'RETOURNEE_PARTIELLE' | 'RETOURNEE' | 'ANNULEE' | 'EN_ATTENTE_PAIEMENT' | (string & {});

export type TypeMouvement = 'ENTREE' | 'SORTIE_VENTE' | 'TRANSFERT_DEPART' | 'TRANSFERT_ARRIVEE' | 'AJUSTEMENT_INVENTAIRE';

export type StatutTransfert = 'EN_TRANSIT' | 'RECU' | 'ANNULE';

export type MembreStatut = 'EN_ATTENTE' | 'ACTIF' | 'SUSPENDU' | 'ARCHIVE';
export type BonusStatut = 'EN_ATTENTE' | 'EN_COURS' | 'LIVRE' | 'ANNULE';
export type TransactionType = 'COMMISSION' | 'PROMOTION' | 'SALAIRE' | 'BONUS_RETRAITE' | 'DEBIT';

export type StatutStock = 'OK' | 'ALERTE' | 'RUPTURE';

// ============================================
// AUTH
// ============================================

export interface AuthUser {
  id: string;
  role: Role;
  name: string;
  nom?: string;
  prenom?: string;
  siteId?: string | null;
  siteName?: string | null;
  site?: { id: string; nom: string } | null;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

// ============================================
// SITE
// ============================================

export interface Site {
  id: string;
  nom: string;
  ville: string;
  adresse?: string;
  actif: boolean;
  createdAt: string;
}

// ============================================
// UTILISATEUR
// ============================================

export interface Utilisateur {
  id: string;
  nom: string;
  telephone: string;
  email?: string;
  role: Role;
  actif: boolean;
  langue: string;
  siteId?: string;
  site?: Pick<Site, 'id' | 'nom'>;
  derniereConnexion?: string;
}

// ============================================
// CLIENT
// ============================================

export interface Client {
  id: string;
  prenom: string;
  nom: string;
  telephone: string;
  email?: string;
  matricule?: string;
  codeParrain?: string;
  statut: StatutClient;
  notes?: string;
  dateInscription: string;
  dateActivation?: string;
  siteInscriptionId: string;
  siteInscription?: Pick<Site, 'id' | 'nom'>;
}

export interface OnboardingEtape {
  id: string;
  etape: EtapeOnboarding;
  statut: StatutEtape;
  completeeAt?: string;
  montant?: number;
  modePaiement?: ModePaiement;
  referenceTransaction?: string;
  notes?: string;
  agent?: Pick<Utilisateur, 'id' | 'nom'>;
  site?: Pick<Site, 'id' | 'nom'>;
}

// ============================================
// PRODUIT / STOCK
// ============================================

export interface Produit {
  id: string;
  sku: string;
  nom: string;
  description?: string;
  categorie: string;
  prixVente: number;
  prixAchat?: number;
  actif?: boolean;
  // champs supplémentaires retournés par /produits/search
  stockDisponible?: number;
  seuilAlerte?: number;
  statut?: string;
}

export interface StockSite {
  siteId: string;
  siteNom: string;
  quantite: number;
  seuilAlerte: number;
  statut: StatutStock;
  updatedAt: string;
}

export interface StockItem {
  produit: Produit;
  siteId: string;
  quantite: number;
  seuilAlerte: number;
  statut: StatutStock;
}

export interface MouvementStock {
  id: string;
  type: TypeMouvement;
  quantite: number;
  quantiteAvant: number;
  quantiteApres: number;
  reference?: string;
  createdAt: string;
  produit?: Pick<Produit, 'id' | 'nom' | 'sku'>;
  site?: Pick<Site, 'id' | 'nom'>;
  agent?: Pick<Utilisateur, 'id' | 'nom'>;
}

export interface TransfertStock {
  id: string;
  quantiteEnvoyee: number;
  quantiteRecue?: number;
  motif?: string;
  statut: StatutTransfert;
  dateExpedition: string;
  dateReception?: string;
  produit?: Pick<Produit, 'id' | 'nom' | 'sku'>;
  siteSource?: Pick<Site, 'id' | 'nom'>;
  siteDestination?: Pick<Site, 'id' | 'nom'>;
}

// ============================================
// VENTE
// ============================================

export interface LigneVente {
  id: string;
  quantite: number;
  prixUnitaire: number;
  sousTotal: number;
  produit: Pick<Produit, 'id' | 'nom' | 'sku'>;
}

export interface Vente {
  id: string;
  numeroVente: string;
  statut: StatutVente;
  montantBrut: number;
  montantNet: number;
  modePaiement: ModePaiement;
  referenceTransaction?: string;
  montantRecu?: number;
  monnaieRendue?: number;

  createdAt: string;
  client?: Pick<Client, 'id' | 'nom' | 'prenom' | 'telephone'>;
  site?: Pick<Site, 'id' | 'nom'>;
  agent?: Pick<Utilisateur, 'id' | 'nom'>;
  lignes?: LigneVente[];
}

// ============================================
// MLM
// ============================================

export interface MlmLevel {
  id: number;
  ordre: number;
  nom: string;
  filleulsRequis: number;
  commissionParFilleul: number;
  commissionTotale: number;
  bonusDescription: string;
  salaireMensuel: number;
  salaireActif: boolean;
  isActive: boolean;
  couleur: string;
  icone: string;
}

export interface Membre {
  id: string;
  clientId: string;
  matricule: string;
  parrainId?: string;
  mlmLevelId: number;
  statut: MembreStatut;
  dateActivation: string;
  dateInscription: string;
  client?: Client;
  level?: MlmLevel;
  parrain?: Membre;
  filleuls?: Membre[];
}

export interface Matrix {
  id: string;
  membreId: string;
  mlmLevelId: number;
  filleulsValides: number;
  estComplete: boolean;
  dateComplete?: string;
  createdAt: string;
  positions?: Position[];
}

export interface Position {
  id: string;
  matrixId: string;
  numeroPosition: number;
  filleulId?: string;
  estValide: boolean;
  dateValidation?: string;
  filleul?: {
    id: string;
    matricule: string;
    statut: string;
    client?: { id: string; prenom: string; nom: string };
    level?: { id: number; ordre: number; nom: string; couleur?: string };
  } | null;
}

export interface Portefeuille {
  id: string;
  membreId: string;
  soldeDisponible: number;
  totalGagne: number;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionPortefeuille {
  id: string;
  portefeuilleId: string;
  type: TransactionType;
  montant: number;
  description: string;
  referenceId?: string;
  createdAt: string;
}

export interface BonusAttribue {
  id: string;
  membreId: string;
  mlmLevelId: number;
  description: string;
  statut: BonusStatut;
  dateAttribution: string;
  dateLivraison?: string;
  notes?: string;
}

export interface Promotion {
  id: string;
  membreId: string;
  niveauAvantId: number;
  niveauApresId: number;
  commissionVersee: number;
  datePromotion: string;
  declencheParId: string;
}

export interface SalaireVerse {
  id: string;
  membreId: string;
  montant: number;
  moisAnnee: string;
  dateVersement: string;
  statut: string;
}

export const MLM_LEVELS_REF = [
  { ordre: 1, nom: 'Niveau 1', filleulsRequis: 4, commissionParFilleul: 10, commissionTotale: 40, bonusDescription: 'Accès au système', salaireMensuel: 0, salaireActif: false, couleur: '#cbd5e1', icone: 'star' },
  { ordre: 2, nom: 'Niveau 2', filleulsRequis: 4, commissionParFilleul: 15, commissionTotale: 60, bonusDescription: 'Bonus niveau 2', salaireMensuel: 0, salaireActif: false, couleur: '#94a3b8', icone: 'award' },
  { ordre: 3, nom: 'Niveau 3', filleulsRequis: 4, commissionParFilleul: 25, commissionTotale: 100, bonusDescription: 'Bonus niveau 3', salaireMensuel: 0, salaireActif: false, couleur: '#64748b', icone: 'shield' },
  { ordre: 4, nom: 'Niveau 4', filleulsRequis: 4, commissionParFilleul: 50, commissionTotale: 200, bonusDescription: 'Bonus niveau 4', salaireMensuel: 0, salaireActif: false, couleur: '#334155', icone: 'zap' },
  { ordre: 5, nom: 'Niveau 5', filleulsRequis: 4, commissionParFilleul: 100, commissionTotale: 400, bonusDescription: 'Bonus niveau 5', salaireMensuel: 100, salaireActif: true, couleur: '#f59e0b', icone: 'crown' },
  { ordre: 6, nom: 'Niveau 6', filleulsRequis: 4, commissionParFilleul: 250, commissionTotale: 1000, bonusDescription: 'Bonus niveau 6', salaireMensuel: 250, salaireActif: true, couleur: '#d97706', icone: 'gem' },
  { ordre: 7, nom: 'Niveau 7', filleulsRequis: 4, commissionParFilleul: 500, commissionTotale: 2000, bonusDescription: 'Bonus niveau 7', salaireMensuel: 500, salaireActif: true, couleur: '#b45309', icone: 'trending-up' },
  { ordre: 8, nom: 'Crown Ambassadeur', filleulsRequis: 4, commissionParFilleul: 1250, commissionTotale: 5000, bonusDescription: 'Bonus Retraite 50000$', salaireMensuel: 1000, salaireActif: true, couleur: '#78350f', icone: 'award' },
];

// ============================================
// PAGINATION
// ============================================

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface ApiError {
  statusCode: number;
  code: string;
  message: string;
  timestamp: string;
  path: string;
}
