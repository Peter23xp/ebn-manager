import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { MlmWalletService } from './mlm-wallet.service';
import { Prisma } from '@prisma/client';
import { MlmCalendarService } from './mlm-calendar.service';
import { PortalService } from '../portal/portal.service';

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
    const service = new MlmWalletService(prisma as never, kpay as never, {} as never, {} as never);

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
    const service = new MlmWalletService(prisma as never, kpay as never, {} as never, {} as never);

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
    const service = new MlmWalletService(prisma as never, kpay as never, {} as never, {} as never);

    await service.approvePayout('payout-1');

    expect(tx.kpayTransaction.create).not.toHaveBeenCalled();
    expect(kpay.initPayout).toHaveBeenCalledTimes(1);
  });

  it('reconciles a processing payout with the final KPay status', async () => {
    const kpay = { getPayout: resolved({ id: 'pay-1', reference: 'KPAY-1', status: 'FAILED', failureReason: 'RECIPIENT_NOT_FOUND' }) };
    const prisma = { kpayTransaction: { update: jest.fn() } };
    const service = new MlmWalletService(prisma as never, kpay as never, {} as never, {} as never);
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
    new MlmWalletService(prisma as never, {} as never, {} as never, {} as never);

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

  it('bloque une nouvelle approbation MOBILE_MONEY sans débit ni modification de statut', async () => {
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

    await expect(service.approveWithdrawalRequest('wr-1', 'user-1')).rejects.toMatchObject({
      message: 'Le paiement Mobile Money est en cours de développement. Veuillez utiliser le paiement en espèces.',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.portefeuille.updateMany).not.toHaveBeenCalled();
    expect(tx.withdrawalRequest.updateMany).not.toHaveBeenCalled();
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

describe('MlmWalletService commission holds', () => {
  const validatedAt = new Date('2026-09-10T12:00:00Z');
  const releaseDate = new Date('2026-10-15T12:00:00Z');
  const setup = () => {
    const tx: any = {
      portefeuille: { findUnique: jest.fn<any>().mockResolvedValue({ id: 'pf-1' }), update: jest.fn<any>() },
      reinvestLote: {
        findUnique: jest.fn<any>().mockResolvedValue(null),
        create: jest.fn<any>().mockImplementation(async ({ data }: any) => ({ id: 'lot-1', ...data })),
      },
      transactionPortefeuille: { create: jest.fn<any>() },
      mlmCalendarYear: {
        findUnique: jest.fn<any>().mockResolvedValue({
          year: 2026, holidays: [], version: 'approved-v1', source: 'test fixture', timezone: 'Africa/Lubumbashi',
        }),
      },
    };
    const calendar = new MlmCalendarService({} as never);
    const kpay = { initPayout: jest.fn() };
    const service = new MlmWalletService({} as never, kpay as never, {} as never, calendar);
    return { tx, calendar, kpay, service };
  };

  it('credits 24 immediate and 16 held exactly, using the validation calendar and a separate deadline', async () => {
    const { tx, service, kpay, calendar } = setup();
    const schedule = jest.spyOn(calendar, 'getReleaseSchedule');

    await service.creditWalletInTx(tx, 'm-1', new Prisma.Decimal('24'), 'COMMISSION', 'Builder', 'c-1');
    await service.creditReinvestInTx(tx, 'm-1', '16', 'c-1', 'Builder', validatedAt);

    expect(tx.portefeuille.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'pf-1' },
      data: { soldeDisponible: { increment: new Prisma.Decimal('24') }, totalGagne: { increment: new Prisma.Decimal('24') } },
    });
    expect(tx.portefeuille.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'pf-1' },
      data: { soldeReinvesti: { increment: new Prisma.Decimal('16') }, totalGagne: { increment: new Prisma.Decimal('16') } },
    });
    expect(tx.reinvestLote.create).toHaveBeenCalledWith({
      data: {
        membreId: 'm-1', amount: new Prisma.Decimal('16'), commissionId: 'c-1',
        releaseDate, releasedAt: null, released: false, status: 'HOLD_PERIOD',
        calendarVersion: expect.any(String), timezone: 'Africa/Lubumbashi',
      },
    });
    const capturedVersion = tx.reinvestLote.create.mock.calls[0][0].data.calendarVersion;
    expect(capturedVersion).toBe((await schedule.mock.results[0].value as { calendarVersion: string }).calendarVersion);
    expect(JSON.parse(capturedVersion)).toEqual([expect.objectContaining({ year: 2026, version: 'approved-v1' })]);
    expect(tx.transactionPortefeuille.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        type: 'REINVESTISSEMENT', portefeuilleId: 'pf-1', montant: new Prisma.Decimal('16'), referenceId: 'c-1',
      }),
    });
    expect(kpay.initPayout).not.toHaveBeenCalled();
  });

  it('keeps decimal input exact instead of converting it to a floating-point number', async () => {
    const { tx, service } = setup();
    await service.creditReinvestInTx(tx, 'm-1', '666.67', 'c-1', 'Diamond', validatedAt);
    expect(tx.portefeuille.update).toHaveBeenCalledWith({
      where: { id: 'pf-1' },
      data: { soldeReinvesti: { increment: new Prisma.Decimal('666.67') }, totalGagne: { increment: new Prisma.Decimal('666.67') } },
    });
  });

  it('refuses a validation without calendar coverage before any held credit or journal', async () => {
    const { tx, service } = setup();
    tx.mlmCalendarYear.findUnique.mockResolvedValue(null);

    await expect(service.creditReinvestInTx(tx, 'm-1', 16, 'c-1', 'Builder', validatedAt)).rejects.toThrow(/2026/);
    expect(tx.reinvestLote.create).not.toHaveBeenCalled();
    expect(tx.portefeuille.update).not.toHaveBeenCalled();
    expect(tx.transactionPortefeuille.create).not.toHaveBeenCalled();
  });

  it('reuses an existing commission lot without recalculating its historical calendar or crediting again', async () => {
    const { tx, service } = setup();
    const existing = { id: 'lot-1', membreId: 'm-1', commissionId: 'c-1', amount: new Prisma.Decimal(16), status: 'CANCELLED', releaseDate };
    tx.reinvestLote.findUnique.mockResolvedValue(existing);

    expect(await service.creditReinvestInTx(tx, 'm-1', 16, 'c-1', 'Builder', validatedAt)).toEqual(existing);
    expect(tx.reinvestLote.findUnique).toHaveBeenCalledWith({ where: { commissionId: 'c-1' } });
    expect(tx.mlmCalendarYear.findUnique).not.toHaveBeenCalled();
    expect(tx.reinvestLote.create).not.toHaveBeenCalled();
    expect(tx.portefeuille.update).not.toHaveBeenCalled();
    expect(tx.transactionPortefeuille.create).not.toHaveBeenCalled();
  });

  it('does not credit if the unique commission lot cannot be created', async () => {
    const { tx, service } = setup();
    tx.reinvestLote.create.mockRejectedValue(new Error('unique commissionId'));
    await expect(service.creditReinvestInTx(tx, 'm-1', 16, 'c-1', 'Builder', validatedAt)).rejects.toThrow('unique commissionId');
    expect(tx.portefeuille.update).not.toHaveBeenCalled();
    expect(tx.transactionPortefeuille.create).not.toHaveBeenCalled();
  });

  it('rejects new orphan holds without a commission reference', async () => {
    const { tx, service } = setup();
    await expect(service.creditReinvestInTx(tx, 'm-1', 16, null, 'Builder', validatedAt)).rejects.toThrow();
    expect(tx.reinvestLote.create).not.toHaveBeenCalled();
    expect(tx.portefeuille.update).not.toHaveBeenCalled();
  });

  it('rejects a missing wallet', async () => {
    const { tx, service } = setup();
    tx.portefeuille.findUnique.mockResolvedValue(null);
    await expect(service.creditReinvestInTx(tx, 'missing', 16, 'c-1', 'Builder', validatedAt)).rejects.toThrow();
    expect(tx.reinvestLote.create).not.toHaveBeenCalled();
  });
});

describe('MlmWalletService.releaseHeldLot', () => {
  const setup = (overrides: any = {}) => {
    const lot = {
      id: 'lot-1', membreId: 'm-1', commissionId: 'c-1', amount: new Prisma.Decimal('16'),
      status: 'RELEASABLE', released: false, releaseDate: new Date('2000-01-01T12:00:00Z'),
      releasedAt: null, releasedById: null, calendarVersion: 'historic-v1', timezone: 'Africa/Lubumbashi',
      ...overrides,
    };
    const tx: any = {
      portefeuille: {
        findUnique: jest.fn<any>().mockResolvedValue({ id: 'pf-1' }),
        updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
        update: jest.fn<any>(),
      },
      reinvestLote: {
        findUnique: jest.fn<any>().mockImplementation(async () => ({ ...lot })),
        updateMany: jest.fn<any>().mockImplementation(async ({ where, data }: any) => {
          if (lot.status !== where.status || lot.released || lot.releaseDate > where.releaseDate.lte) return { count: 0 };
          Object.assign(lot, data);
          return { count: 1 };
        }),
      },
      transactionPortefeuille: { create: jest.fn<any>() },
      $queryRaw: jest.fn<any>().mockResolvedValue([{ id: 'pf-1' }]),
    };
    const prisma: any = { $transaction: jest.fn<any>(async (callback: any) => callback(tx)) };
    const kpay = { initPayout: jest.fn() };
    const service = new MlmWalletService(prisma, kpay as never, {} as never, {} as never);
    return { service, tx, prisma, lot, kpay };
  };

  it('locks the wallet before transitioning the lot and transfers held funds once without adding gains', async () => {
    const { service, tx, lot, kpay } = setup();
    const before = new Date();
    const result = await service.releaseHeldLot('lot-1', 'admin-1');

    expect(result).toMatchObject({
      status: 'RELEASED', released: true, releasedById: 'admin-1', releasedAt: expect.any(Date),
      releaseDate: new Date('2000-01-01T12:00:00Z'), calendarVersion: 'historic-v1',
    });
    expect(result.releasedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(tx.$queryRaw.mock.calls[0][0].join(' ')).toMatch(/FROM portefeuilles.*FOR UPDATE/);
    expect(tx.$queryRaw.mock.calls[0][1]).toBe('pf-1');
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.reinvestLote.updateMany.mock.invocationCallOrder[0]);
    expect(tx.reinvestLote.updateMany).toHaveBeenCalledWith({
      where: { id: 'lot-1', status: 'RELEASABLE', released: false, releaseDate: { lte: expect.any(Date) } },
      data: { status: 'RELEASED', released: true, releasedAt: expect.any(Date), releasedById: 'admin-1' },
    });
    expect(tx.portefeuille.updateMany).toHaveBeenCalledWith({
      where: { id: 'pf-1', soldeReinvesti: { gte: new Prisma.Decimal('16') } },
      data: { soldeReinvesti: { decrement: new Prisma.Decimal('16') }, soldeDisponible: { increment: new Prisma.Decimal('16') } },
    });
    expect(tx.transactionPortefeuille.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        portefeuilleId: 'pf-1', type: 'REINVESTISSEMENT', montant: new Prisma.Decimal('16'), referenceId: 'release:lot-1',
      }),
    });
    expect(tx.portefeuille.update).not.toHaveBeenCalled();
    expect(kpay.initPayout).not.toHaveBeenCalled();
    expect(lot.amount.toFixed(2)).toBe('16.00');
  });

  it('does not duplicate the transfer or journal when two callers compete for one lot', async () => {
    const { service, tx } = setup();
    const results = await Promise.all([
      service.releaseHeldLot('lot-1', 'admin-1'),
      service.releaseHeldLot('lot-1', 'admin-2'),
    ]);
    expect(results.map((result: any) => result.status)).toEqual(['RELEASED', 'RELEASED']);
    expect(tx.portefeuille.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.transactionPortefeuille.create).toHaveBeenCalledTimes(1);
  });

  it('returns an already released lot without rewriting its original actor or date', async () => {
    const releasedAt = new Date('2020-02-01T00:00:00Z');
    const { service, tx } = setup({ status: 'RELEASED', released: true, releasedAt, releasedById: 'original-admin' });
    expect(await service.releaseHeldLot('lot-1', 'admin-2')).toMatchObject({ releasedAt, releasedById: 'original-admin' });
    expect(tx.reinvestLote.updateMany).not.toHaveBeenCalled();
    expect(tx.portefeuille.updateMany).not.toHaveBeenCalled();
    expect(tx.transactionPortefeuille.create).not.toHaveBeenCalled();
  });

  it.each([
    ['HOLD_PERIOD', new Date('2000-01-01')],
    ['CANCELLED', new Date('2000-01-01')],
    ['RELEASABLE', new Date('2999-01-01')],
  ])('refuses %s lots that are not eligible and due', async (status, releaseDate) => {
    const { service, tx } = setup({ status, releaseDate });
    await expect(service.releaseHeldLot('lot-1', 'admin-1')).rejects.toThrow();
    expect(tx.reinvestLote.updateMany).not.toHaveBeenCalled();
    expect(tx.portefeuille.updateMany).not.toHaveBeenCalled();
    expect(tx.transactionPortefeuille.create).not.toHaveBeenCalled();
  });

  it('rechecks status after acquiring the wallet lock so cancellation wins safely', async () => {
    const { service, tx, lot } = setup();
    tx.$queryRaw.mockImplementation(async () => {
      lot.status = 'CANCELLED';
      return [{ id: 'pf-1' }];
    });
    await expect(service.releaseHeldLot('lot-1', 'admin-1')).rejects.toThrow();
    expect(tx.portefeuille.updateMany).not.toHaveBeenCalled();
    expect(tx.transactionPortefeuille.create).not.toHaveBeenCalled();
  });

  it('refuses a failed conditional claim without moving funds', async () => {
    const { service, tx } = setup();
    tx.reinvestLote.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.releaseHeldLot('lot-1', 'admin-1')).rejects.toThrow();
    expect(tx.portefeuille.updateMany).not.toHaveBeenCalled();
    expect(tx.transactionPortefeuille.create).not.toHaveBeenCalled();
  });

  it('rejects insufficient held funds so the transaction can roll back the status claim', async () => {
    const { service, tx } = setup();
    tx.portefeuille.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.releaseHeldLot('lot-1', 'admin-1')).rejects.toThrow();
    expect(tx.transactionPortefeuille.create).not.toHaveBeenCalled();
  });

  it('rejects missing lots and never credits a wallet', async () => {
    const { service, tx } = setup();
    tx.reinvestLote.findUnique.mockResolvedValue(null);
    await expect(service.releaseHeldLot('missing', 'admin-1')).rejects.toThrow();
    expect(tx.portefeuille.updateMany).not.toHaveBeenCalled();
  });

  it('requires an audit actor before entering the transaction', async () => {
    const { service, prisma } = setup();
    await expect(service.releaseHeldLot('lot-1', '')).rejects.toThrow();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('wallet earned credit versus release transfer history', () => {
  function matches(row: any, where: any): boolean {
    return Object.entries(where ?? {}).every(([field, condition]: [string, any]) => {
      if (field === 'OR') return condition.some((clause: any) => matches(row, clause));
      if (field === 'AND') return [condition].flat().every((clause: any) => matches(row, clause));
      if (field === 'NOT') return ![condition].flat().some((clause: any) => matches(row, clause));
      if (condition === null || typeof condition !== 'object') return row[field] === condition;
      if ('in' in condition) return condition.in.includes(row[field]);
      if ('startsWith' in condition) return typeof row[field] === 'string' && row[field].startsWith(condition.startsWith);
      if ('not' in condition) return row[field] !== null && !matches(row, { [field]: condition.not });
      throw new Error(`Unsupported journal test predicate: ${field}`);
    });
  }

  let prisma: any;
  let wallet: any;
  let journal: any[];
  let service: MlmWalletService;
  let portal: PortalService;
  let kpay: any;

  beforeEach(async () => {
    wallet = { id: 'pf-1', membreId: 'm-1', soldeDisponible: new Prisma.Decimal(0), soldeReserve: new Prisma.Decimal(0), soldeReinvesti: new Prisma.Decimal(0), totalGagne: new Prisma.Decimal(0) };
    journal = [];
    let lot: any;
    const mutateWallet = ({ data }: any) => {
      for (const [field, change] of Object.entries(data) as [string, any][]) {
        wallet[field] = change.increment !== undefined ? wallet[field].plus(change.increment) : wallet[field].minus(change.decrement);
      }
      return wallet;
    };
    prisma = {
      portefeuille: {
        findUnique: jest.fn<any>(async () => wallet),
        update: jest.fn<any>(async (args: any) => mutateWallet(args)),
        updateMany: jest.fn<any>(async (args: any) => { mutateWallet(args); return { count: 1 }; }),
      },
      membre: { findUnique: jest.fn<any>().mockImplementation(async () => ({ id: 'm-1', portefeuille: wallet })) },
      reinvestLote: {
        findUnique: jest.fn<any>(async () => lot ? { ...lot } : null),
        create: jest.fn<any>(async ({ data }: any) => { lot = { id: 'lot-1', ...data }; return lot; }),
        updateMany: jest.fn<any>(async ({ data }: any) => { Object.assign(lot, data); return { count: 1 }; }),
      },
      transactionPortefeuille: {
        create: jest.fn<any>(async ({ data }: any) => {
          const entry = { id: `entry-${journal.length + 1}`, createdAt: new Date(), referenceId: null, ...data,
            portefeuille: { membre: { id: 'm-1', client: { prenom: 'Test', nom: 'Member' } } } };
          journal.push(entry);
          return entry;
        }),
        groupBy: jest.fn<any>(async ({ where }: any) => {
          const groups = new Map<string, any>();
          for (const entry of journal.filter((row) => matches(row, where))) {
            const group = groups.get(entry.type) ?? { type: entry.type, _sum: { montant: new Prisma.Decimal(0) }, _count: { id: 0 } };
            group._sum.montant = group._sum.montant.plus(entry.montant);
            group._count.id += 1;
            groups.set(entry.type, group);
          }
          return [...groups.values()];
        }),
        findMany: jest.fn<any>(async ({ where, skip = 0, take = 20 }: any) => journal.filter((row) => matches(row, where)).slice(skip, skip + take)),
        count: jest.fn<any>(async ({ where }: any) => journal.filter((row) => matches(row, where)).length),
      },
      $queryRaw: jest.fn<any>().mockResolvedValue([{ id: 'pf-1' }]),
    };
    prisma.$transaction = jest.fn<any>(async (callback: any) => callback(prisma));
    kpay = { initPayout: jest.fn() };
    const calendar = { getReleaseSchedule: jest.fn<any>().mockResolvedValue({ releaseDate: new Date('2000-02-01'), calendarVersion: 'fixture-v1', timezone: 'Africa/Lubumbashi' }) };
    service = new MlmWalletService(prisma, kpay, {} as never, calendar as never);
    portal = new PortalService(prisma, service, {} as never);
    await service.creditWalletInTx(prisma, 'm-1', '24', 'COMMISSION', 'Builder', 'generation:m-1:1');
    await service.creditReinvestInTx(prisma, 'm-1', '16', 'c-1', 'Builder', new Date('2000-01-01'));
    await prisma.reinvestLote.updateMany({ data: { status: 'RELEASABLE' } });
    await service.releaseHeldLot('lot-1', 'admin-1');
    await service.releaseHeldLot('lot-1', 'admin-2');
  });

  it('keeps Builder earnings at 24 immediate plus 16 held after release and duplicate release', async () => {
    expect(await service.getEarningsByLevel('m-1')).toEqual([
      { type: 'COMMISSION', total: 24, count: 1 },
      { type: 'REINVESTISSEMENT', total: 16, count: 1 },
    ]);
    expect(wallet.soldeDisponible.toFixed(2)).toBe('40.00');
    expect(wallet.soldeReinvesti.toFixed(2)).toBe('0.00');
    expect(wallet.totalGagne.toFixed(2)).toBe('40.00');
    expect(journal).toHaveLength(3);
    expect(kpay.initPayout).not.toHaveBeenCalled();
  });

  it('preserves original held earnings with nullable legacy references', async () => {
    await prisma.transactionPortefeuille.create({ data: { portefeuilleId: 'pf-1', type: 'REINVESTISSEMENT', montant: new Prisma.Decimal(3), description: 'release: misleading display text', referenceId: null } });
    expect(await service.getEarningsByLevel('m-1')).toEqual([
      { type: 'COMMISSION', total: 24, count: 1 },
      { type: 'REINVESTISSEMENT', total: 19, count: 2 },
    ]);
  });

  it('projects distinct kinds and references in both administrative and portal history', async () => {
    for (const entry of journal) entry.description = 'Same display description';
    const admin = await service.getTransactions({ memberId: 'm-1' });
    const client = await portal.getWalletTransactions('client-1', { typeFilter: 'all' });
    for (const response of [admin, client]) {
      expect(response.transactions.map((entry: any) => ({ kind: entry.kind, referenceId: entry.referenceId, montant: entry.montant }))).toEqual([
        { kind: 'COMMISSION', referenceId: 'generation:m-1:1', montant: 24 },
        { kind: 'HELD_CREDIT', referenceId: 'c-1', montant: 16 },
        { kind: 'HELD_RELEASE_TRANSFER', referenceId: 'release:lot-1', montant: 16 },
      ]);
      expect(response.meta.total).toBe(3);
    }
  });

  it('includes original held credit in portal gains but excludes transfers from both rows and count', async () => {
    const result = await portal.getWalletTransactions('client-1', { typeFilter: 'gains', page: 2, limit: 1 });
    expect(result.transactions).toEqual([expect.objectContaining({ montant: 16, kind: 'HELD_CREDIT', referenceId: 'c-1' })]);
    expect(result.meta).toEqual({ page: 2, limit: 1, total: 2, totalPages: 2 });
  });
});

describe('MlmWalletService financial reads', () => {
  const summary = {
    generatedTotal: '589.99', validatedTotal: '256.66', immediateAmount: '154.00',
    heldAmount: '16.00', releasableAmount: '33.33', releasedAmount: '53.33',
  };
  const setup = () => {
    const prisma: any = {
      promotion: { groupBy: jest.fn<any>().mockResolvedValue([]) },
      bonusAttribue: { groupBy: jest.fn<any>().mockResolvedValue([]) },
      mlmLevel: { findMany: jest.fn<any>().mockResolvedValue([]) },
      matrix: { findMany: jest.fn<any>().mockResolvedValue([]) },
      $queryRaw: jest.fn<any>().mockResolvedValue([]),
      portefeuille: { findUnique: jest.fn<any>().mockResolvedValue({
        id: 'pf-1', membreId: 'm-1', soldeDisponible: new Prisma.Decimal('0.30'), soldeReserve: new Prisma.Decimal('0.10'),
        soldeReinvesti: new Prisma.Decimal('49.33'), totalGagne: new Prisma.Decimal('256.66'), membre: {}, updatedAt: new Date(),
      }) },
      commission: { groupBy: jest.fn<any>().mockResolvedValue([]), findMany: jest.fn<any>().mockResolvedValue([]), aggregate: jest.fn<any>().mockImplementation(async ({ where }: any) => ({
        _sum: where.statut.not
          ? { montant: new Prisma.Decimal('589.99') }
          : { montant: new Prisma.Decimal('256.66'), montantSysteme: new Prisma.Decimal('154') },
      })) },
      reinvestLote: {
        groupBy: jest.fn<any>().mockResolvedValue([
          { status: 'HOLD_PERIOD', _sum: { amount: new Prisma.Decimal('16') } },
          { status: 'RELEASABLE', _sum: { amount: new Prisma.Decimal('33.33') } },
          { status: 'RELEASED', _sum: { amount: new Prisma.Decimal('53.33') } },
        ]),
        findMany: jest.fn<any>().mockResolvedValue([]),
        count: jest.fn<any>().mockResolvedValue(0),
      },
    };
    prisma.$transaction = jest.fn<any>(async (callback: any) => callback(prisma));
    const service = new MlmWalletService(prisma, {} as never, {} as never, {} as never);
    return { prisma, service };
  };

  it('keeps balances, summary, lots and count in one repeatable snapshot when a release commits between reads', async () => {
    const { prisma, service } = setup();
    const balance = {
      id: 'pf-1', membreId: 'm-1', soldeDisponible: new Prisma.Decimal(24), soldeReserve: new Prisma.Decimal(0),
      soldeReinvesti: new Prisma.Decimal(16), totalGagne: new Prisma.Decimal(40), membre: {}, updatedAt: new Date('2026-09-17'),
    };
    const lot = {
      id: 'lot-1', amount: new Prisma.Decimal(16), status: 'RELEASABLE', releaseDate: new Date('2026-09-01'),
      releasedAt: null, commissionId: 'c-1', calendarVersion: 'historic-v1', timezone: 'Africa/Lubumbashi',
    };
    const summaryAggregate = { _sum: { montant: new Prisma.Decimal(40), montantSysteme: new Prisma.Decimal(24) } };
    const snapshot: any = {
      promotion: { groupBy: jest.fn<any>().mockResolvedValue([]) },
      bonusAttribue: { groupBy: jest.fn<any>().mockResolvedValue([]) },
      mlmLevel: { findMany: jest.fn<any>().mockResolvedValue([]) },
      matrix: { findMany: jest.fn<any>().mockResolvedValue([]) },
      $queryRaw: jest.fn<any>().mockResolvedValue([]),
      portefeuille: { findUnique: jest.fn<any>().mockResolvedValue(balance) },
      commission: { groupBy: jest.fn<any>().mockResolvedValue([]), findMany: jest.fn<any>().mockResolvedValue([]), aggregate: jest.fn<any>().mockResolvedValue(summaryAggregate) },
      reinvestLote: {
        groupBy: jest.fn<any>().mockResolvedValue([{ status: 'RELEASABLE', _sum: { amount: new Prisma.Decimal(16) } }]),
        findMany: jest.fn<any>().mockResolvedValue([lot]),
        count: jest.fn<any>().mockResolvedValue(1),
      },
    };
    const commitRelease = async () => {
      prisma.portefeuille.findUnique.mockResolvedValue({ ...balance, soldeDisponible: new Prisma.Decimal(40), soldeReinvesti: new Prisma.Decimal(0) });
      prisma.reinvestLote.groupBy.mockResolvedValue([{ status: 'RELEASED', _sum: { amount: new Prisma.Decimal(16) } }]);
      prisma.reinvestLote.findMany.mockResolvedValue([{ ...lot, status: 'RELEASED', releasedAt: new Date('2026-09-17') }]);
      return balance;
    };
    prisma.portefeuille.findUnique.mockImplementationOnce(commitRelease);
    snapshot.portefeuille.findUnique.mockImplementationOnce(commitRelease);
    prisma.commission.aggregate.mockResolvedValue(summaryAggregate);
    prisma.reinvestLote.count.mockResolvedValue(1);
    prisma.$transaction.mockImplementation(async (callback: any, options: any) => callback(options?.isolationLevel === 'RepeatableRead' ? snapshot : prisma));

    const result = await service.getWallet('m-1', { page: 1, limit: 20 });

    expect(result.soldeDisponible).toBe(24);
    expect(result.soldeReinvesti).toBe(16);
    expect(result.financialSummary).toEqual({
      generatedTotal: '40.00', validatedTotal: '40.00', immediateAmount: '24.00',
      heldAmount: '0.00', releasableAmount: '16.00', releasedAmount: '0.00',
    });
    expect(result.reinvestLots).toEqual([expect.objectContaining({ status: 'RELEASABLE', releasedAt: null })]);
    expect(result.reinvestLotsMeta).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'RepeatableRead' });
    expect(prisma.portefeuille.findUnique).not.toHaveBeenCalled();
    expect(prisma.commission.aggregate).not.toHaveBeenCalled();
    expect(prisma.reinvestLote.groupBy).not.toHaveBeenCalled();
    expect(prisma.reinvestLote.findMany).not.toHaveBeenCalled();
    expect(prisma.reinvestLote.count).not.toHaveBeenCalled();
    expect(snapshot.reinvestLote.count).toHaveBeenCalledWith({ where: { membreId: 'm-1' } });
  });

  it('uses a repeatable snapshot for standalone summaries and reuses a supplied transaction without nesting', async () => {
    const { prisma, service } = setup();
    expect(await service.getFinancialSummary('m-1')).toEqual(summary);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'RepeatableRead' });
    prisma.$transaction.mockClear();
    expect(await service.getFinancialSummary('m-1', prisma)).toEqual(summary);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('aggregates all commission totals in the database and splits held statuses without counting cancellations', async () => {
    const { prisma, service } = setup();
    expect(await service.getFinancialSummary('m-1')).toEqual(summary);
    expect(prisma.commission.aggregate).toHaveBeenCalledWith({
      where: { membreId: 'm-1', statut: { not: 'ANNULEE' } }, _sum: { montant: true },
    });
    expect(prisma.commission.aggregate).toHaveBeenCalledWith({
      where: { membreId: 'm-1', statut: { in: ['VALIDEE', 'PAYEE'] } }, _sum: { montant: true, montantSysteme: true },
    });
    expect(prisma.reinvestLote.groupBy).toHaveBeenCalledWith({
      by: ['status'], where: { membreId: 'm-1', status: { in: ['HOLD_PERIOD', 'RELEASABLE', 'RELEASED'] } }, _sum: { amount: true },
    });
    expect(prisma.reinvestLote.findMany).not.toHaveBeenCalled();
  });

  it('serializes empty aggregates as exact zero strings', async () => {
    const { prisma, service } = setup();
    prisma.commission.aggregate.mockResolvedValue({ _sum: { montant: null, montantSysteme: null } });
    prisma.reinvestLote.groupBy.mockResolvedValue([]);
    expect(await service.getFinancialSummary('m-1')).toEqual({
      generatedTotal: '0.00', validatedTotal: '0.00', immediateAmount: '0.00',
      heldAmount: '0.00', releasableAmount: '0.00', releasedAmount: '0.00',
    });
  });

  it('does not lose precision when aggregate totals exceed the safe integer range', async () => {
    const { prisma, service } = setup();
    prisma.commission.aggregate.mockResolvedValue({ _sum: { montant: new Prisma.Decimal('9007199254740993.33'), montantSysteme: null } });
    expect((await service.getFinancialSummary('m-1')).generatedTotal).toBe('9007199254740993.33');
  });

  it('returns the same summary with capped, paginated lot history including released and cancelled holds', async () => {
    const { prisma, service } = setup();
    prisma.reinvestLote.count.mockResolvedValue(202);
    prisma.reinvestLote.findMany.mockResolvedValue([
      {
        id: 'lot-1', amount: new Prisma.Decimal('16'), releaseDate: new Date('2026-10-15T12:00:00Z'), releasedAt: null,
        status: 'CANCELLED', commissionId: 'c-1', calendarVersion: 'historic-v1', timezone: 'Africa/Lubumbashi',
      },
      {
        id: 'lot-2', amount: new Prisma.Decimal('53.33'), releaseDate: new Date('2026-09-01T12:00:00Z'),
        releasedAt: new Date('2026-09-10T12:00:00Z'), status: 'RELEASED', commissionId: 'c-2',
        calendarVersion: null, timezone: 'Africa/Lubumbashi',
      },
    ]);

    const result = await service.getWallet('m-1', { page: 2, limit: 500 });
    expect(result.financialSummary).toEqual(summary);
    expect(result.soldeDisponibleRetrait).toBe(0.2);
    expect(result.reinvestLots).toEqual([
      {
        id: 'lot-1', amount: '16.00', releaseDate: '2026-10-15T12:00:00.000Z', releasedAt: null,
        status: 'CANCELLED', commissionId: 'c-1', calendarVersion: 'historic-v1', timezone: 'Africa/Lubumbashi',
      },
      {
        id: 'lot-2', amount: '53.33', releaseDate: '2026-09-01T12:00:00.000Z', releasedAt: '2026-09-10T12:00:00.000Z',
        status: 'RELEASED', commissionId: 'c-2', calendarVersion: null, timezone: 'Africa/Lubumbashi',
      },
    ]);
    expect(prisma.reinvestLote.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { membreId: 'm-1' }, take: 100, skip: 100, orderBy: [{ releaseDate: 'asc' }, { id: 'asc' }],
    }));
    expect(result.reinvestLotsMeta).toEqual({ total: 202, page: 2, limit: 100, totalPages: 3 });
  });

  it('caps the default lot read at 100 and rejects invalid pagination before database reads', async () => {
    const { prisma, service } = setup();
    await service.getWallet('m-1');
    expect(prisma.reinvestLote.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 100, skip: 0 }));
    prisma.reinvestLote.findMany.mockClear();
    await expect(service.getWallet('m-1', { page: 0 })).rejects.toThrow();
    await expect(service.getWallet('m-1', { limit: -1 })).rejects.toThrow();
    expect(prisma.reinvestLote.findMany).not.toHaveBeenCalled();
  });
});
