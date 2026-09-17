import { describe, expect, it, jest } from '@jest/globals';
import { Prisma } from '@prisma/client';
import { MlmMatrixService } from './mlm-matrix.service';

function fixture(statut = 'EN_ATTENTE') {
  const commission = {
    id: 'commission', membreId: 'member', filleulId: 'trigger', mlmLevelId: 1, matrixId: 'matrix',
    montant: new Prisma.Decimal(40), montantSysteme: new Prisma.Decimal(24), montantRetour: new Prisma.Decimal(16),
    statut, referenceId: 'generation:member:1', description: 'Builder complet',
  };
  const transaction: any = {
    $queryRaw: jest.fn<any>().mockResolvedValue([{ id: 'wallet', soldeDisponible: new Prisma.Decimal(24), soldeReserve: new Prisma.Decimal(0), soldeReinvesti: new Prisma.Decimal(16) }]),
    portefeuille: { findUnique: jest.fn<any>().mockResolvedValue({ id: 'wallet' }), update: jest.fn<any>() },
    commission: {
      findUnique: jest.fn<any>().mockResolvedValue(commission),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
    },
    reinvestLote: {
      findMany: jest.fn<any>().mockResolvedValue([{ id: 'lot', amount: new Prisma.Decimal(16), released: false, status: 'HOLD_PERIOD' }]),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
    },
    transactionPortefeuille: {
      findMany: jest.fn<any>().mockResolvedValue([{ montant: new Prisma.Decimal(24) }]),
      create: jest.fn<any>(),
    },
    mlmLevel: { findUnique: jest.fn<any>().mockResolvedValue({ nom: 'Builder' }) },
  };
  const prisma: any = { ...transaction, $transaction: jest.fn<any>(async callback => callback(transaction)) };
  const wallet: any = { creditWalletInTx: jest.fn<any>(), creditReinvestInTx: jest.fn<any>() };
  return { commission, transaction, wallet, service: new MlmMatrixService(prisma, wallet) };
}

describe('generation commissions', () => {
  it('validates both pockets using captured Decimal amounts and the same validation instant', async () => {
    const { service, wallet, transaction } = fixture();
    await service.validateCommission('commission', 'admin');
    expect(wallet.creditWalletInTx).toHaveBeenCalledWith(transaction, 'member', new Prisma.Decimal(24), 'COMMISSION', 'Builder complet', 'generation:member:1');
    expect(wallet.creditReinvestInTx).toHaveBeenCalledWith(transaction, 'member', new Prisma.Decimal(16), 'commission', 'Builder', expect.any(Date));
    expect(transaction.commission.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'commission', statut: 'EN_ATTENTE' },
      data: expect.objectContaining({ validatedById: 'admin', valideeAt: expect.any(Date) }),
    }));
  });

  it('does not double credit an already validated event', async () => {
    const { service, wallet } = fixture('VALIDEE');
    await service.validateCommission('commission', 'admin');
    expect(wallet.creditWalletInTx).not.toHaveBeenCalled();
    expect(wallet.creditReinvestInTx).not.toHaveBeenCalled();
  });

  it('does not credit when a concurrent transition has already won', async () => {
    const { service, wallet, transaction } = fixture();
    transaction.commission.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.validateCommission('commission', 'admin')).rejects.toThrow();
    expect(wallet.creditWalletInTx).not.toHaveBeenCalled();
  });

  it('cancels a credited commission without deleting hold history', async () => {
    const { service, transaction } = fixture('VALIDEE');
    await service.cancelCommission('commission', 'Correction administrative');
    expect(transaction.reinvestLote.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { commissionId: 'commission', status: { not: 'CANCELLED' } }, data: { status: 'CANCELLED' },
    }));
    expect(transaction.portefeuille.update).toHaveBeenCalledWith(expect.objectContaining({ data: {
      soldeDisponible: { decrement: new Prisma.Decimal(24) },
      soldeReinvesti: { decrement: new Prisma.Decimal(16) },
      totalGagne: { decrement: new Prisma.Decimal(40) },
    } }));
  });

  it('does not touch balances when cancelling a pending commission', async () => {
    const { service, transaction } = fixture();
    await service.cancelCommission('commission', 'Correction');
    expect(transaction.portefeuille.update).not.toHaveBeenCalled();
  });

  it('preserves reserved funds during cancellation', async () => {
    const { service, transaction } = fixture('VALIDEE');
    transaction.$queryRaw.mockResolvedValue([{ id: 'wallet', soldeDisponible: new Prisma.Decimal(24), soldeReserve: new Prisma.Decimal(1), soldeReinvesti: new Prisma.Decimal(16) }]);
    await expect(service.cancelCommission('commission')).rejects.toThrow();
    expect(transaction.portefeuille.update).not.toHaveBeenCalled();
  });
});
