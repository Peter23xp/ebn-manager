import { describe, expect, it } from '@jest/globals';
import { KpayService } from './kpay.service';

describe('KpayService', () => {
  const config = {
    get: (key: string, fallback?: string) =>
      ({
        KPAY_API_KEY: 'kpay_test_public',
        KPAY_SECRET_KEY: 'a'.repeat(64),
        KPAY_WEBHOOK_SECRET: 'webhook-secret',
        KPAY_GATEWAY_SECRET: 'gateway-secret',
        KPAY_BASE_URL: 'https://admin.kpay.site',
      }[key] ?? fallback),
  };

  it('rejects a Mobile Money number outside the DRC before any provider call', async () => {
    const service = new KpayService(config as never);

    await expect(
      service.initDeposit({
        amount: 25,
        provider: 'AIRTEL_COD',
        phoneNumber: '237653456789',
        externalId: 'SALE-1',
      }),
    ).rejects.toThrow('Le numéro Mobile Money doit être un numéro RDC au format 243');
  });

  it('rejects a webhook body with a signature that does not match the shared secret', () => {
    const service = new KpayService(config as never);

    expect(() => service.verifyWebhook(Buffer.from('{"event":"payment.completed"}'), 'bad')).toThrow(
      'Signature KPay invalide',
    );
  });

  it('normalizes local DRC numbers without requiring the country code', () => {
    const service = new KpayService(config as never);

    expect(service.normalizeDrcPhone('081 234 5678')).toBe('243812345678');
    expect(service.normalizeDrcPhone('812345678')).toBe('243812345678');
  });
});
