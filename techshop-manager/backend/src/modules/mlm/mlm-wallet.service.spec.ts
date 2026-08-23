import { describe, expect, it, jest } from '@jest/globals';
import { MlmWalletService } from './mlm-wallet.service';

describe('MlmWalletService withdrawals', () => {
  const resolved = (value: any) => {
    const mock = jest.fn();
    (mock as any).mockResolvedValue(value);
    return mock;
  };

  it('creates a pending withdrawal without calling KPay', async () => {
    const kpay = { initPayout: jest.fn() };
    const tx = {
      portefeuille: { findUnique: resolved({ id: 'wallet-1', soldeDisponible: 100, soldeReserve: 0 }), update: jest.fn() },
      mlmPayout: { create: resolved({ id: 'payout-1', statut: 'PENDING' }) },
      kpayTransaction: { create: jest.fn() },
    };
    const prisma = { $transaction: jest.fn(async (callback: any) => callback(tx)) };
    const service = new MlmWalletService(prisma as never, kpay as never, {} as never);

    const result = await service.initPayout('member-1', {
      amount: 25,
      provider: 'AIRTEL_COD',
      phoneNumber: '243812345678',
    });

    expect(result).toMatchObject({ payoutId: 'payout-1', status: 'PENDING' });
    expect(kpay.initPayout).not.toHaveBeenCalled();
    expect(tx.portefeuille.update).toHaveBeenCalledWith(expect.objectContaining({ data: { soldeReserve: { increment: 25 } } }));
    expect(tx.kpayTransaction.create).not.toHaveBeenCalled();
  });

  it('approves a pending withdrawal, debits the wallet, and starts KPay', async () => {
    const kpay = { initPayout: resolved({ id: 'pay-1', reference: 'KPAY-1', status: 'PENDING' }) };
    const tx = {
      portefeuille: {
        findUnique: resolved({ id: 'wallet-1', soldeDisponible: 100, soldeReserve: 25 }),
        update: jest.fn(),
      },
      mlmPayout: {
        findUnique: resolved({ id: 'payout-1', membreId: 'member-1', montant: 25, provider: 'AIRTEL_COD', phoneNumber: '243812345678', statut: 'PENDING' }),
        update: jest.fn(),
      },
      kpayTransaction: { findUnique: resolved(null), create: resolved({ id: 'tx-1', externalId: 'MLM-PAYOUT-payout-1' }) },
      transactionPortefeuille: { create: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: any) => callback(tx)),
      kpayTransaction: { update: jest.fn() },
    };
    const service = new MlmWalletService(prisma as never, kpay as never, {} as never);

    const result = await service.approvePayout('payout-1');

    expect(result).toMatchObject({ payoutId: 'payout-1', status: 'PENDING' });
    expect(tx.portefeuille.update).toHaveBeenCalledWith(expect.objectContaining({ data: { soldeDisponible: { decrement: 25 }, soldeReserve: { decrement: 25 } } }));
    expect(tx.transactionPortefeuille.create).toHaveBeenCalled();
    expect(kpay.initPayout).toHaveBeenCalledWith(expect.objectContaining({ amount: 25, provider: 'AIRTEL_COD', phoneNumber: '243812345678' }));
  });

  it('reuses an existing KPay transaction when approval is retried', async () => {
    const kpay = { initPayout: resolved({ id: 'pay-1', reference: 'KPAY-1', status: 'PENDING' }) };
    const tx = {
      portefeuille: { findUnique: resolved({ id: 'wallet-1', soldeDisponible: 100, soldeReserve: 25 }), update: jest.fn() },
      mlmPayout: { findUnique: resolved({ id: 'payout-1', membreId: 'member-1', montant: 25, provider: 'AIRTEL_COD', phoneNumber: '243812345678', statut: 'PENDING' }), update: jest.fn() },
      kpayTransaction: { findUnique: resolved({ id: 'tx-existing', externalId: 'MLM-PAYOUT-payout-1', status: 'PENDING' }), create: jest.fn() },
      transactionPortefeuille: { create: jest.fn() },
    };
    const prisma = { $transaction: jest.fn(async (callback: any) => callback(tx)), kpayTransaction: { update: jest.fn() } };
    const service = new MlmWalletService(prisma as never, kpay as never, {} as never);

    await service.approvePayout('payout-1');

    expect(tx.kpayTransaction.create).not.toHaveBeenCalled();
    expect(kpay.initPayout).toHaveBeenCalledTimes(1);
  });

  it('reconciles a processing payout with the final KPay status', async () => {
    const kpay = { getPayout: resolved({ id: 'pay-1', reference: 'KPAY-1', status: 'FAILED', failureReason: 'RECIPIENT_NOT_FOUND' }) };
    const prisma = { kpayTransaction: { update: jest.fn() } };
    const service = new MlmWalletService(prisma as never, kpay as never, {} as never);
    const finalizePayout = jest.spyOn(service as any, 'finalizePayout').mockResolvedValue(undefined);

    await (service as any).syncPayoutStatus({ id: 'tx-1', status: 'PROCESSING', kpayPaymentId: 'pay-1' });

    expect(kpay.getPayout).toHaveBeenCalledWith('pay-1');
    expect(prisma.kpayTransaction.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'tx-1' },
      data: expect.objectContaining({ status: 'FAILED', failureReason: 'RECIPIENT_NOT_FOUND' }),
    }));
    expect(finalizePayout).toHaveBeenCalledWith('tx-1', 'FAILED');
  });
});
