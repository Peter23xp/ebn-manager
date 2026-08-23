import { describe, expect, it, jest } from '@jest/globals';
import { KpayWebhookService } from './kpay-webhook.service';

describe('KpayWebhookService', () => {
  it('does not finalise a terminal KPay event twice', async () => {
    const findFirst: any = jest.fn();
    const update: any = jest.fn();
    findFirst
      .mockResolvedValueOnce({ id: 'tx-1', operationType: 'SALE_PAYMENT', terminalEventProcessedAt: null })
      .mockResolvedValueOnce({ id: 'tx-1', operationType: 'SALE_PAYMENT', terminalEventProcessedAt: new Date() });
    update.mockResolvedValue({});
    const prisma = {
      kpayTransaction: {
        findFirst,
        update,
      },
    };
    const service = new KpayWebhookService(prisma as never);
    const finalizer = jest.fn(async () => undefined);
    service.registerFinalizer('SALE_PAYMENT', finalizer);
    const event = {
      event: 'payment.completed', paymentId: 'pay-1', reference: 'KPAY-1', status: 'COMPLETED' as const,
      amount: 25, externalId: 'SALE-1', timestamp: new Date().toISOString(),
    };

    await service.process(event);
    await service.process(event);

    expect(finalizer).toHaveBeenCalledTimes(1);
  });
});
