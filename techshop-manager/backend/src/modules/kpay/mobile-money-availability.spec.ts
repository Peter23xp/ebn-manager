import { afterEach, describe, expect, it, jest } from '@jest/globals';
import axios from 'axios';
import { KpayService } from './kpay.service';
import { ClientsService } from '../clients/clients.service';
import { VentesService } from '../ventes/ventes.service';

const message = 'Le paiement Mobile Money est en cours de développement. Veuillez utiliser le paiement en espèces.';

afterEach(() => jest.restoreAllMocks());

function gateway() {
  const transport = { request: jest.fn<any>().mockResolvedValue({ data: { id: 'existing', status: 'COMPLETED' } }) };
  jest.spyOn(axios, 'create').mockReturnValue(transport as never);
  const config: any = { get: (key: string, fallback?: string) => ({ KPAY_API_KEY: 'kpay_test_fixture', KPAY_SECRET_KEY: 'a'.repeat(64) }[key] ?? fallback) };
  return { service: new KpayService(config), transport };
}

describe('Mobile Money gateway suspension', () => {
  it.each(['deposit', 'payout', 'refund'] as const)('blocks a new %s before any gateway request', async operation => {
    const { service, transport } = gateway();
    const input = { amount: 10, externalId: 'new', provider: 'AIRTEL_COD' as const, phoneNumber: '243812345678' };
    await expect(Promise.resolve().then(() => operation === 'deposit' ? service.initDeposit(input)
      : operation === 'payout' ? service.initPayout(input) : service.refundDeposit('existing', { externalId: 'new', reason: 'Return' })))
      .rejects.toMatchObject({ message });
    expect(transport.request).not.toHaveBeenCalled();
  });

  it.each(['deposit', 'payout'] as const)('continues to read the status of an existing %s', async operation => {
    const { service } = gateway();
    expect(await (operation === 'deposit' ? service.getDeposit('existing') : service.getPayout('existing')))
      .toMatchObject({ id: 'existing', status: 'COMPLETED' });
  });
});

describe('Existing payment finalization during suspension', () => {
  it('finalizes a paid onboarding step without creating an automatic mobile transfer', async () => {
    const updateMany = jest.fn<any>().mockResolvedValue({ count: 1 });
    const configRead = jest.fn<any>().mockResolvedValue({ kpayAdminMpesaPhone: '243812345678' });
    const prisma: any = {
      kpayTransaction: { findUnique: jest.fn<any>().mockResolvedValue({ onboardingEtapeId: 'step', metadata: {} }) },
      onboardingEtape: { updateMany }, configGenerale: { findFirst: configRead },
    };
    const service = new ClientsService(prisma, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
    await (service as any).finalizeKpayOnboarding('existing');
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'step', statut: { not: 'COMPLETE' } },
      data: { statut: 'COMPLETE', completeeAt: expect.any(Date) },
    });
    expect(configRead).not.toHaveBeenCalled();
  });

  it('does not initiate automatic sale transfers during suspension', async () => {
    const configRead = jest.fn<any>().mockResolvedValue(null);
    const service = new VentesService({ configGenerale: { findFirst: configRead } } as never, {} as never, {} as never);
    await (service as any).initiateConfiguredAutoPayout('existing-sale');
    expect(configRead).not.toHaveBeenCalled();
  });
});
