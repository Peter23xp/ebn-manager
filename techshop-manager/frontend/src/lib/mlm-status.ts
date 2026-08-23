const COMMISSION_LABELS: Record<string, string> = {
  EN_ATTENTE: 'En attente',
  VALIDEE: 'Validée — à payer',
  PAYEE: 'Déjà payée',
  ANNULEE: 'Annulée',
};

const PAYOUT_LABELS: Record<string, string> = {
  PENDING: 'En attente de validation',
  PROCESSING: 'Paiement en cours',
  COMPLETED: 'Déjà payé',
  FAILED: 'Paiement échoué',
  CANCELLED: 'Annulé',
};

export function getCommissionStatusLabel(status: string) {
  return COMMISSION_LABELS[status] ?? status;
}

export function getPayoutStatusLabel(status: string) {
  return PAYOUT_LABELS[status] ?? status;
}
