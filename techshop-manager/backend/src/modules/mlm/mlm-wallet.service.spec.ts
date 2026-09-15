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

describe('MlmWalletService — withdrawal requests (solde)', () => {
  const resolved = (value: any) => {
    const mock = jest.fn();
    (mock as any).mockResolvedValue(value);
    return mock;
  };
  const buildService = (prisma: any) =>
    new MlmWalletService(prisma as never, {} as never, {} as never);

  const demande = (over: any = {}) => ({
    id: 'wr-1', membreId: 'm-1', type: 'CASH', statut: 'EN_ATTENTE',
    montant: 150, commissionIds: [], notes: null, ...over,
  });

  it('listWithdrawalRequests retourne le résumé GLOBAL par statut (rev. #1)', async () => {
    const prisma = {
      withdrawalRequest: {
        findMany: resolved([]),
        count: resolved(0),
        groupBy: resolved([
          { statut: 'EN_ATTENTE', _count: { id: 3 }, _sum: { montant: 240 } },
          { statut: 'PAYE', _count: { id: 1 }, _sum: { montant: 50 } },
        ]),
      },
    };
    const service = buildService(prisma);
    const res = await service.listWithdrawalRequests({});
    expect(res.summary).toEqual({
      EN_ATTENTE: { count: 3, montant: 240 },
      PAYE: { count: 1, montant: 50 },
    });
  });

  it('approuve CASH: débit montant + réserve, journalise DEBIT, statut PAYE', async () => {
    const tx = {
      portefeuille: {
        findUnique: resolved({ id: 'pf-1', soldeDisponible: 200, soldeReserve: 150 }),
        updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }), // débit conditionnel (verrou fonds)
      },
      transactionPortefeuille: { create: jest.fn() },
      withdrawalRequest: {
        updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }), // EN_ATTENTE → PAYE (verrou)
        findUnique: jest.fn<any>().mockResolvedValue({ statut: 'PAYE', montant: 150 }),
      },
    };
    const prisma = {
      withdrawalRequest: { findUnique: resolved(demande()) },
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    };
    const service = buildService(prisma);

    const result = await service.approveWithdrawalRequest('wr-1', 'user-1', 'note');

    expect(tx.portefeuille.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'pf-1',
          soldeDisponible: { gte: expect.anything() },
          soldeReserve: { gte: expect.anything() },
        }),
        data: expect.objectContaining({
          soldeDisponible: { decrement: expect.anything() },
          soldeReserve: { decrement: expect.anything() },
        }),
      }),
    );
    expect(tx.transactionPortefeuille.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'DEBIT', portefeuilleId: 'pf-1', referenceId: 'wr-1' }),
      }),
    );
    // Approbation = payé (tous types confondus)
    expect(result.statut).toBe('PAYE');
    expect(tx.withdrawalRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'wr-1', statut: 'EN_ATTENTE' },
        data: expect.objectContaining({ statut: 'PAYE', paidAt: expect.any(Date) }),
      }),
    );
  });

  it('refuse et ne débite RIEN si portefeuille.updateMany count=0 (solde passé entre-temps)', async () => {
    const tx = {
      portefeuille: {
        findUnique: resolved({ id: 'pf-1', soldeDisponible: 10, soldeReserve: 10 }),
        updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }), // course perdue
      },
      transactionPortefeuille: { create: jest.fn() },
      withdrawalRequest: {
        updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
        findUnique: resolved({ statut: 'PAYE' }),
      },
    };
    const prisma = {
      withdrawalRequest: { findUnique: resolved(demande()) },
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    };
    const service = buildService(prisma);
    await expect(service.approveWithdrawalRequest('wr-1', 'user-1')).rejects.toThrow();
    expect(tx.transactionPortefeuille.create).not.toHaveBeenCalled();
  });

  it("approuve MOBILE_MONEY: statut PAYE direct (plus d'étape intermédiaire)", async () => {
    const tx = {
      portefeuille: {
        findUnique: resolved({ id: 'pf-1', soldeDisponible: 200, soldeReserve: 150 }),
        updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
      },
      transactionPortefeuille: { create: jest.fn() },
      withdrawalRequest: {
        updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
        findUnique: resolved({ statut: 'PAYE', montant: 150 }),
      },
    };
    const prisma = {
      withdrawalRequest: { findUnique: resolved(demande({ type: 'MOBILE_MONEY' })) },
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    };
    const service = buildService(prisma);

    const result = await service.approveWithdrawalRequest('wr-1', 'user-1');
    expect(result.statut).toBe('PAYE');
    // Une seule transition de statut (EN_ATTENTE → PAYE)
    expect(tx.withdrawalRequest.updateMany).toHaveBeenCalledTimes(1);
  });

  it('refuse une demande déjà traitée', async () => {
    const prisma = { withdrawalRequest: { findUnique: resolved(demande({ statut: 'APPROUVE' })) } };
    const service = buildService(prisma);
    await expect(service.approveWithdrawalRequest('wr-1', 'user-1')).rejects.toThrow();
  });

  it('rejet: REJETE + restitution de la réserve', async () => {
    const tx = {
      portefeuille: { findUnique: resolved({ id: 'pf-1' }), update: jest.fn() },
      withdrawalRequest: {
        updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
        findUnique: resolved({ id: 'wr-1', statut: 'REJETE', rejectReason: 'Coordonnées invalides' }),
      },
    };
    const prisma = {
      withdrawalRequest: { findUnique: resolved(demande()) },
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    };
    const service = buildService(prisma);

    const result = await service.rejectWithdrawalRequest('wr-1', 'Coordonnées invalides');

    expect(result.statut).toBe('REJETE');
    expect(tx.portefeuille.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'pf-1' },
        data: { soldeReserve: { decrement: expect.anything() } },
      }),
    );
  });

  it('course approuvée deux fois: 2e updateMany count=0 -> débit UNIQUE (anti TOCTOU)', async () => {
    const tx = {
      portefeuille: { findUnique: resolved({ id: 'pf-1', soldeDisponible: 200, soldeReserve: 150 }), update: jest.fn() },
      transactionPortefeuille: { create: jest.fn() },
      withdrawalRequest: { updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }), update: jest.fn() },
    };
    const prisma = {
      withdrawalRequest: { findUnique: resolved(demande()) },
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    };
    const service = buildService(prisma);

    await expect(service.approveWithdrawalRequest('wr-1', 'user-1')).rejects.toThrow();
    expect(tx.portefeuille.update).not.toHaveBeenCalled();
    expect(tx.transactionPortefeuille.create).not.toHaveBeenCalled();
  });

  it('course rejet/approbation: updateMany count=0 -> réserve non restituée deux fois', async () => {
    const tx = {
      portefeuille: { findUnique: resolved({ id: 'pf-1' }), update: jest.fn() },
      withdrawalRequest: { updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }), update: jest.fn() },
    };
    const prisma = {
      withdrawalRequest: { findUnique: resolved(demande()) },
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    };
    const service = buildService(prisma);

    await expect(service.rejectWithdrawalRequest('wr-1', 'x')).rejects.toThrow();
    expect(tx.portefeuille.update).not.toHaveBeenCalled();
  });

  it('refuse de rejeter une demande déjà traitée', async () => {
    const prisma = { withdrawalRequest: { findUnique: resolved({ id: 'wr-1', statut: 'APPROUVE' }) } };
    const service = buildService(prisma);
    await expect(service.rejectWithdrawalRequest('wr-1', 'x')).rejects.toThrow();
  });

  it('refuses mark-paid on a request that is not APPROUVE', async () => {
    const prisma = {
      withdrawalRequest: { findUnique: resolved({ id: 'wr-1', statut: 'EN_ATTENTE' }) },
    };
    const service = buildService(prisma);

    await expect(service.markWithdrawalAsPaid('wr-1')).rejects.toThrow();
  });
});

describe('MlmWalletService.creditReinvestInTx — 40 % bloqué J+30', () => {
  const resolved = (value: any) => {
    const mock = jest.fn();
    (mock as any).mockResolvedValue(value);
    return mock;
  };

  it('crédite soldeReinvesti+totalGagne, crée le lot à +30j et journalise REINVESTISSEMENT', async () => {
    const tx = {
      portefeuille: { findUnique: resolved({ id: 'pf-1' }), update: jest.fn() },
      reinvestLote: { create: jest.fn() },
      transactionPortefeuille: { create: jest.fn() },
    };
    const service = new MlmWalletService({} as never, {} as never, {} as never);
    const now = new Date('2026-09-10T12:00:00Z');

    await service.creditReinvestInTx(tx as never, 'm-1', 40, 'c-1', 'Argent', now);

    expect(tx.portefeuille.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'pf-1' },
        data: { soldeReinvesti: { increment: expect.anything() }, totalGagne: { increment: expect.anything() } },
      }),
    );
    expect(tx.reinvestLote.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          membreId: 'm-1',
          amount: expect.anything(),
          releasedAt: new Date('2026-10-10T12:00:00Z'),
          commissionId: 'c-1',
          released: false,
        }),
      }),
    );
    expect(tx.transactionPortefeuille.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'REINVESTISSEMENT', portefeuilleId: 'pf-1' }),
      }),
    );
  });

  it('lève une erreur si le portefeuille du membre est introuvable', async () => {
    const tx = { portefeuille: { findUnique: resolved(null) } };
    const service = new MlmWalletService({} as never, {} as never, {} as never);
    await expect(service.creditReinvestInTx(tx as never, 'm-x', 40, null, 'Bronze')).rejects.toThrow();
  });
});
