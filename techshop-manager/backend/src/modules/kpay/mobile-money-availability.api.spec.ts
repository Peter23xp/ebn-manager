import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ClientsController } from '../clients/clients.controller';
import { ClientsService } from '../clients/clients.service';
import { ClientParrainService } from '../clients/client-parrain.service';
import { VentesController } from '../ventes/ventes.controller';
import { VentesService } from '../ventes/ventes.service';
import { PortalController } from '../portal/portal.controller';
import { PortalService } from '../portal/portal.service';
import { MlmController } from '../mlm/mlm.controller';
import { MlmService } from '../mlm/mlm.service';
import { MlmMatrixService } from '../mlm/mlm-matrix.service';
import { MlmWalletService } from '../mlm/mlm-wallet.service';
import { MlmClaimService } from '../mlm/mlm-claim.service';
import { MlmPlacementService } from '../mlm/mlm-placement.service';
import { MlmCalendarService } from '../mlm/mlm-calendar.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { StaffScopeService } from '../../common/access/staff-scope.service';
import { PrismaService } from '../../prisma/prisma.service';

const request = require('supertest');
const message = 'Le paiement Mobile Money est en cours de développement. Veuillez utiliser le paiement en espèces.';
const paymentRoutes = [
  '/clients/onboarding/recit', '/clients/client/onboarding/recit',
  '/clients/client/onboarding/fiche', '/clients/client/onboarding/activate', '/ventes',
];
const mobileRoutes = [
  '/clients/onboarding/recit/kpay/init', '/clients/client/onboarding/recit/kpay/init',
  '/clients/client/onboarding/fiche/kpay/init', '/clients/client/onboarding/activate/kpay/init',
  '/ventes/kpay/init', '/ventes/sale/retour/kpay-refund',
  '/portal/wallet/payouts', '/mlm/wallet/member/payouts',
];

describe('Mobile Money suspension at HTTP boundaries', () => {
  let app: INestApplication;
  const business = jest.fn<any>(async () => ({ success: true }));
  const stub = Object.fromEntries([
    'onboardingRecit', 'resumeOnboardingRecit', 'resumeInitKpayRecit', 'initKpayRecit', 'initKpayFiche',
    'initKpayActivation', 'onboardingFiche', 'onboardingActivate', 'createVente', 'initKpayVente',
    'createRetour', 'initKpayRefund', 'initPayout', 'approvePayout', 'createWithdrawalRequest',
    'getKpayVenteStatus', 'getWithdrawalRequests', 'cancelWithdrawalRequest', 'listPayouts', 'cancelPayout',
    'rejectWithdrawalRequest', 'markWithdrawalAsPaid',
  ].map(method => [method, business]));

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ClientsController, VentesController, PortalController, MlmController],
      providers: [StaffScopeService, { provide: PrismaService, useValue: {
        client: { findUnique: async ({ where }) => where.id ? { id: where.id, siteInscriptionId: 'site' } : null },
        vente: { findUnique: async () => ({ siteId: 'site', client: null }) },
        kpayTransaction: { findFirst: async () => ({ venteId: 'sale' }) },
      } }, ...[ClientsService, ClientParrainService, VentesService, PortalService, MlmService,
        MlmMatrixService, MlmWalletService, MlmClaimService, MlmPlacementService, MlmCalendarService]
        .map(provide => ({ provide, useValue: stub }))],
    }).overrideGuard(JwtAuthGuard).useValue({ canActivate: context => {
      context.switchToHttp().getRequest().user = { id: 'actor', role: 'SUPER_ADMIN' };
      return true;
    } }).overrideGuard(RolesGuard).useValue({ canActivate: () => true }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  beforeEach(() => business.mockClear());
  afterAll(async () => { await app?.close(); });

  it.each(mobileRoutes)('blocks %s before business writes even when body claims cash', async route => {
    const response = await request(app.getHttpServer()).post(route).send({ modePaiement: 'CASH' }).expect(503);
    expect(response.body).toMatchObject({ code: 'MOBILE_MONEY_UNAVAILABLE', message });
    expect(business).not.toHaveBeenCalled();
  });

  it.each(paymentRoutes.flatMap(route => ['MPESA', 'AIRTEL_MONEY', 'KPAY'].map(modePaiement => ({ route, modePaiement }))))(
    'blocks legacy mobile mode $modePaiement on $route', async ({ route, modePaiement }) => {
      await request(app.getHttpServer()).post(route).send({ modePaiement }).expect(503);
      expect(business).not.toHaveBeenCalled();
    },
  );

  it.each(['MOBILE_MONEY', 'KPAY'])('blocks new %s refunds', async modeRemboursement => {
    await request(app.getHttpServer()).post('/ventes/sale/retour').send({ modeRemboursement }).expect(503);
    expect(business).not.toHaveBeenCalled();
  });

  it('blocks a new withdrawal request before reserving wallet funds', async () => {
    await request(app.getHttpServer()).post('/portal/withdrawal-requests').send({ type: 'MOBILE_MONEY' }).expect(503);
    expect(business).not.toHaveBeenCalled();
  });

  it('blocks approving a payout before debiting the wallet', async () => {
    await request(app.getHttpServer()).put('/mlm/payouts/payout/approve').send({}).expect(503);
    expect(business).not.toHaveBeenCalled();
  });

  it.each(paymentRoutes)('keeps cash payments available on %s', async route => {
    const response = await request(app.getHttpServer()).post(route).send({ modePaiement: 'CASH' }).expect(201);
    expect(response.body.success).toBe(true);
  });

  it.each(paymentRoutes.flatMap(route => [undefined, null, '', 'UNKNOWN'].map(modePaiement => ({ route, modePaiement }))))(
    'requires an explicit valid payment method on $route ($modePaiement)', async ({ route, modePaiement }) => {
      await request(app.getHttpServer()).post(route).send({ modePaiement }).expect(400);
      expect(business).not.toHaveBeenCalled();
    },
  );

  it.each(paymentRoutes)('preserves non-mobile bank transfers on %s', async route => {
    expect((await request(app.getHttpServer()).post(route).send({ modePaiement: 'VIREMENT' }).expect(201)).body.success).toBe(true);
  });

  it.each([
    ['/ventes/sale/retour', { modeRemboursement: 'CASH' }],
    ['/portal/withdrawal-requests', { type: 'CASH' }],
  ])('keeps cash refund/withdrawal available on %s', async (route, body) => {
    const response = await request(app.getHttpServer()).post(route).send(body).expect(201);
    expect(response.body.success).toBe(true);
  });

  it.each(['/ventes/kpay/existing', '/portal/withdrawal-requests', '/mlm/payouts'])('keeps existing tracking/history available on %s', async route => {
    expect((await request(app.getHttpServer()).get(route).expect(200)).body.success).toBe(true);
  });

  it.each(['/portal/withdrawal-requests/existing/cancel', '/mlm/payouts/existing/cancel', '/mlm/withdrawal-requests/existing/reject'])(
    'keeps cancellation/rejection available on %s', async route => {
      expect((await request(app.getHttpServer()).patch(route).send({ rejectReason: 'Espèces' }).expect(200)).body.success).toBe(true);
    },
  );
});
