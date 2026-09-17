export type MembreStatut = 'EN_ATTENTE' | 'ACTIF' | 'SUSPENDU' | 'ARCHIVE';
export type TransactionType = 'COMMISSION' | 'PROMOTION' | 'SALAIRE' | 'BONUS_RETRAITE' | 'DEBIT';
export interface MlmLevel { id: number; ordre: number; nom: string; couleur: string; filleulsRequis: number; commissionParFilleul: number; commissionTotale: number; bonusDescription: string; salaireMensuel: number; salaireActif: boolean; }
export interface Membre { id: string; clientId: string; matricule: string; statut: MembreStatut; level: MlmLevel; dateInscription: string; }
export interface WalletTransaction { id: string; type: TransactionType; montant: number; description: string; createdAt: string; }
export interface Wallet { soldeDisponible: number; totalGagne: number; transactions: WalletTransaction[]; membre: Membre; }

export interface GenerationLevel {
  id: number;
  ordre: number;
  nom: string;
  couleur?: string;
  requiredPositions?: number;
  immediateAmount?: string;
  heldAmount?: string;
  totalAmount?: string;
  bonusDescription?: string;
}

export interface GenerationProgress {
  currentLevel: GenerationLevel | null;
  nextLevel: GenerationLevel | null;
  currentGeneration: number;
  completedPositions: number;
  requiredPositions: number;
  remainingPositions: number;
  progressPercentage: number;
  highestLevelAchieved: number;
}

export interface MemberIdentity {
  id: string;
  matricule: string;
  client: { id?: string; prenom: string; nom: string };
}

export interface MatrixTreeNode extends MemberIdentity {
  level: GenerationLevel | null;
  statut: string;
  generation: number;
  position: number | null;
  positionId: string | null;
  recruiter: MemberIdentity | null;
  matrixParent: MemberIdentity | null;
  progression: GenerationProgress;
  directMatrixChildrenCount: number;
  personalRecruitCount: number;
  totalDescendants: number;
  emptyPositions: number[];
  children: MatrixTreeNode[];
  hasMore: boolean;
}

export interface FinancialSummary {
  generatedTotal: string;
  validatedTotal: string;
  immediateAmount: string;
  heldAmount: string;
  releasableAmount: string;
  releasedAmount: string;
}

export interface ReinvestLot {
  id: string;
  amount: string;
  releaseDate: string;
  releasedAt: string | null;
  status: 'HOLD_PERIOD' | 'RELEASABLE' | 'RELEASED' | 'CANCELLED';
  commissionId: string;
  calendarVersion: string;
  timezone: string;
}

export interface CalendarYear {
  year: number;
  holidays: string[];
  version: string;
  source: string;
  timezone: 'Africa/Lubumbashi';
}

export interface PlacementHistory {
  id: string;
  memberId: string;
  recruiterId: string | null;
  oldParentId: string | null;
  newParentId: string | null;
  oldPosition: number | null;
  newPosition: number | null;
  actorId: string | null;
  reason: string;
  operationId: string;
  operationType: string;
  createdAt: string;
}

export interface MoveMemberInput {
  memberId: string;
  newParentId: string;
  newPosition: number;
  expectedPositionId: string | null;
  operationId: string;
  reason: string;
}

export interface SwapMembersInput {
  memberId: string;
  otherMemberId: string;
  expectedPositionId: string | null;
  otherExpectedPositionId: string | null;
  operationId: string;
  reason: string;
}
