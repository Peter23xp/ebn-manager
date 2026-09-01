import { describe, expect, it, jest } from '@jest/globals';
import { KpayWebhookService } from './kpay-webhook.service';

const makeService = () => {
  const findFirst = jest.fn<any>();
  const update = jest.fn<any>().mockResolvedValue({});
  const prisma = { kpayTransaction: { findFirst, update } };
  const service = new KpayWebhookService(prisma as never);
  return { service, findFirst, update };
};

const baseEvent = {
  event: 'payment.completed' as const,
  paymentId: 'pay-1',
  reference: 'KPAY-1',
  amount: 25,
  externalId: 'SALE-1',
  timestamp: new Date().toISOString(),
};

describe('KpayWebhookService', () => {
  it('does not finalise a terminal KPay event twice', async () => {
    const { service, findFirst } = makeService();
    findFirst
      .mockResolvedValueOnce({ id: 'tx-1', operationType: 'SALE_PAYMENT', terminalEventProcessedAt: null })
      .mockResolvedValueOnce({ id: 'tx-1', operationType: 'SALE_PAYMENT', terminalEventProcessedAt: new Date() });
    const finalizer = jest.fn(async () => undefined);
    service.registerFinalizer('SALE_PAYMENT', finalizer);

    await service.process({ ...baseEvent, status: 'COMPLETED' });
    await service.process({ ...baseEvent, status: 'COMPLETED' });

    expect(finalizer).toHaveBeenCalledTimes(1);
  });

  it('calls finalizer with COMPLETED status', async () => {
    const { service, findFirst } = makeService();
    findFirst.mockResolvedValueOnce({ id: 'tx-2', operationType: 'ONBOARDING_PAYMENT', terminalEventProcessedAt: null });
    const finalizer = jest.fn(async () => undefined);
    service.registerFinalizer('ONBOARDING_PAYMENT', finalizer);

    await service.process({ ...baseEvent, status: 'COMPLETED' });

    expect(finalizer).toHaveBeenCalledTimes(1);
    expect(finalizer).toHaveBeenCalledWith('tx-2', expect.objectContaining({ status: 'COMPLETED' }));
  });

  it('calls finalizer with FAILED status (not COMPLETE)', async () => {
    const { service, findFirst } = makeService();
    findFirst.mockResolvedValueOnce({ id: 'tx-3', operationType: 'ONBOARDING_PAYMENT', terminalEventProcessedAt: null });
    const finalizer = jest.fn(async () => undefined);
    service.registerFinalizer('ONBOARDING_PAYMENT', finalizer);

    await service.process({ ...baseEvent, status: 'FAILED', failureReason: 'Solde insuffisant' });

    // Le finalizer est appelé, mais avec status FAILED — c'est lui qui décide si valider ou non
    expect(finalizer).toHaveBeenCalledTimes(1);
    expect(finalizer).toHaveBeenCalledWith('tx-3', expect.objectContaining({ status: 'FAILED' }));
  });

  it('calls finalizer with CANCELLED status', async () => {
    const { service, findFirst } = makeService();
    findFirst.mockResolvedValueOnce({ id: 'tx-4', operationType: 'ONBOARDING_PAYMENT', terminalEventProcessedAt: null });
    const finalizer = jest.fn(async () => undefined);
    service.registerFinalizer('ONBOARDING_PAYMENT', finalizer);

    await service.process({ ...baseEvent, status: 'CANCELLED' });

    expect(finalizer).toHaveBeenCalledTimes(1);
    expect(finalizer).toHaveBeenCalledWith('tx-4', expect.objectContaining({ status: 'CANCELLED' }));
  });

  it('does nothing if transaction is not found', async () => {
    const { service, findFirst } = makeService();
    findFirst.mockResolvedValueOnce(null);
    const finalizer = jest.fn(async () => undefined);
    service.registerFinalizer('ONBOARDING_PAYMENT', finalizer);

    await service.process({ ...baseEvent, status: 'COMPLETED' });

    expect(finalizer).not.toHaveBeenCalled();
  });
});
