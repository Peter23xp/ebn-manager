import { describe, expect, it } from 'vitest';
import { getCommissionStatusLabel, getPayoutStatusLabel } from './mlm-status';

describe('MLM payment status labels', () => {
  it('explains whether a commission is validated or already paid', () => {
    expect(getCommissionStatusLabel('VALIDEE')).toBe('Validée — à payer');
    expect(getCommissionStatusLabel('PAYEE')).toBe('Déjà payée');
  });

  it('explains payout progress for the admin', () => {
    expect(getPayoutStatusLabel('PENDING')).toBe('En attente de validation');
    expect(getPayoutStatusLabel('PROCESSING')).toBe('Paiement en cours');
    expect(getPayoutStatusLabel('COMPLETED')).toBe('Déjà payé');
  });
});
