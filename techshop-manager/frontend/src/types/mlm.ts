export type MembreStatut = 'EN_ATTENTE' | 'ACTIF' | 'SUSPENDU' | 'ARCHIVE';
export type TransactionType = 'COMMISSION' | 'PROMOTION' | 'SALAIRE' | 'BONUS_RETRAITE' | 'DEBIT';
export interface MlmLevel { id: number; ordre: number; nom: string; couleur: string; filleulsRequis: number; commissionParFilleul: number; commissionTotale: number; bonusDescription: string; salaireMensuel: number; salaireActif: boolean; }
export interface Membre { id: string; clientId: string; matricule: string; statut: MembreStatut; level: MlmLevel; dateInscription: string; }
export interface WalletTransaction { id: string; type: TransactionType; montant: number; description: string; createdAt: string; }
export interface Wallet { soldeDisponible: number; totalGagne: number; transactions: WalletTransaction[]; membre: Membre; }
