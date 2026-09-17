import { beforeEach, describe, expect, it, vi } from 'vitest';
import { kpayApi } from './kpay.api';
import { portalApi } from './portal.api';
import { MlmApi } from './mlm.api';
import { ventesApi } from './ventes.api';

const { get, post, put, patch } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn() }));
vi.mock('@/lib/api', () => ({ api: { get, post, put, patch } }));
const payment = { amount: 10, provider: 'VODACOM_MPESA_COD' as const, phoneNumber: '243900000001' };

beforeEach(() => {
  vi.clearAllMocks();
  for (const method of [get, post, put, patch]) method.mockResolvedValue({ data: { status: 'PENDING' } });
});

describe('frontend payment API safeguards', () => {
  it.each([
    ['sale', () => kpayApi.initSale({ ...payment, siteId: 'site', lignes: [], modePaiement: 'MPESA' })],
    ['legacy sale', () => ventesApi.create({ siteId: 'site', lignes: [], modePaiement: 'MPESA' })],
    ['récit', () => kpayApi.initRecit(payment)],
    ['fiche', () => kpayApi.initFiche('client', payment)],
    ['resume mobile', () => kpayApi.resumeRecitKpay('client', { ...payment, montantRecit: 10 })],
    ['resume legacy mobile', () => kpayApi.resumeRecit('client', { montantRecit: 10, modePaiement: 'MPESA' })],
    ['wallet', () => kpayApi.initPayout('member', payment)],
    ['portal payout', () => portalApi.initPayout(payment)],
    ['withdrawal', () => portalApi.createWithdrawalRequest({ montant: 10, type: 'MOBILE_MONEY', ...payment })],
    ['payout approval', () => MlmApi.approvePayout('payout')],
    ['mobile withdrawal approval', () => MlmApi.approveWithdrawalRequest('withdrawal', 'admin')],
  ])('blocks %s before any write request', async (_name, initiate) => {
    await expect(initiate()).rejects.toMatchObject({ message: 'Le paiement Mobile Money est en cours de développement. Veuillez utiliser le paiement en espèces.' });
    expect(post).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });

  it('preserves cash registrations and withdrawals', async () => {
    await kpayApi.resumeRecit('client', { montantRecit: 10, modePaiement: 'CASH' });
    await portalApi.createWithdrawalRequest({ montant: 10, type: 'CASH' });
    await MlmApi.approveWithdrawalRequest('cash', 'admin', undefined, 'CASH');
    expect(post).toHaveBeenCalledWith('/clients/client/onboarding/recit', { montantRecit: 10, modePaiement: 'CASH' });
    expect(post).toHaveBeenCalledWith('/portal/withdrawal-requests', { montant: 10, type: 'CASH' });
    expect(put).toHaveBeenCalledWith('/mlm/withdrawal-requests/cash/approve', { approvedById: 'admin', notes: undefined });
  });

  it('preserves non-mobile bank transfers', async () => {
    await ventesApi.create({ siteId: 'site', lignes: [], modePaiement: 'VIREMENT' });
    expect(post).toHaveBeenCalledWith('/ventes', { siteId: 'site', lignes: [], modePaiement: 'VIREMENT' });
  });

  it('preserves polling, history, rejection, cancellation and already approved reconciliation', async () => {
    await expect(kpayApi.saleStatus('pending')).resolves.toEqual({ status: 'PENDING' });
    await MlmApi.listPayouts();
    await portalApi.getWithdrawalRequests({ page: 1 });
    await MlmApi.markWithdrawalAsPaid('approved');
    await MlmApi.rejectWithdrawalRequest('pending', 'Annulé');
    await MlmApi.cancelPayout('pending');
    await portalApi.cancelWithdrawalRequest('pending');
    expect(get).toHaveBeenCalledTimes(3);
    expect(put).toHaveBeenCalledWith('/mlm/withdrawal-requests/approved/mark-paid');
    expect(patch).toHaveBeenCalledTimes(3);
  });
});
