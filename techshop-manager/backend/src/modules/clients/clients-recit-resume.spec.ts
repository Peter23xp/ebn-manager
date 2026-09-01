import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ClientsService } from './clients.service';
import { EtapeOnboarding, KpayTransactionStatus, ModePaiement, StatutClient, StatutEtape } from '@prisma/client';

describe('ClientsService - Recit Resume', () => {
  let service: ClientsService;
  let prisma: any;
  let kpay: any;
  let kpayWebhooks: any;
  let portalAuthService: any;
  let mailer: any;
  let mlmMatrixService: any;

  beforeEach(() => {
    prisma = {
      client: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      onboardingEtape: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        upsert: jest.fn(),
        updateMany: jest.fn(),
      },
      kpayTransaction: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      site: {
        findUnique: jest.fn(),
      },
      configGenerale: {
        findFirst: jest.fn(),
      },
      $transaction: jest.fn((cb: any) => cb(prisma)),
    };

    kpay = {
      initDeposit: jest.fn(),
    };
    kpayWebhooks = {
      registerFinalizer: jest.fn(),
    };
    portalAuthService = {};
    mailer = {};
    mlmMatrixService = {};

    service = new ClientsService(
      prisma,
      portalAuthService,
      mailer,
      mlmMatrixService,
      kpay,
      kpayWebhooks,
    );
  });

  describe('onboardingRecit (Cash creation/resume)', () => {
    it('resumes existing EN_COURS client with incomplete recit step without creating duplicate', async () => {
      const existingClient = {
        id: 'client-1',
        prenom: 'Jean',
        nom: 'Dupont',
        telephone: '+243999999999',
        statut: StatutClient.EN_COURS,
        siteInscriptionId: 'site-1',
        onboardingEtapes: [
          { id: 'step-1', etape: EtapeOnboarding.RECIT, statut: StatutEtape.EN_COURS },
        ],
      };

      prisma.client.findUnique.mockResolvedValueOnce(existingClient);
      prisma.onboardingEtape.upsert.mockResolvedValueOnce({ id: 'step-1', statut: StatutEtape.COMPLETE });
      jest.spyOn(service, 'findOne').mockResolvedValueOnce({ ...existingClient, statut: StatutClient.EN_COURS } as any);

      const result = await service.onboardingRecit({
        prenom: 'Jean',
        nom: 'Dupont',
        telephone: '+243999999999',
        siteId: 'site-1',
        montantRecit: 5000,
        modePaiement: ModePaiement.CASH,
        agentId: 'agent-1',
      });

      expect(result.etapeId).toBe('step-1');
      expect(prisma.client.create).not.toHaveBeenCalled();
      expect(prisma.onboardingEtape.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { clientId_etape: { clientId: 'client-1', etape: EtapeOnboarding.RECIT } },
          update: expect.objectContaining({
            statut: StatutEtape.COMPLETE,
            montant: 5000,
            modePaiement: ModePaiement.CASH,
          }),
        }),
      );
    });

    it('resets step to EN_COURS and resumes when recit was marked COMPLETE but linked KPay transaction is FAILED', async () => {
      const existingClient = {
        id: 'client-2',
        prenom: 'Marie',
        nom: 'Claire',
        telephone: '+243888888888',
        statut: StatutClient.EN_COURS,
        siteInscriptionId: 'site-1',
        onboardingEtapes: [
          { id: 'step-2', etape: EtapeOnboarding.RECIT, statut: StatutEtape.COMPLETE },
        ],
      };

      prisma.client.findUnique.mockResolvedValueOnce(existingClient);
      prisma.kpayTransaction.findFirst.mockResolvedValueOnce({ id: 'tx-failed-1' });
      prisma.onboardingEtape.update.mockResolvedValueOnce({ id: 'step-2', statut: StatutEtape.EN_COURS });
      prisma.onboardingEtape.upsert.mockResolvedValueOnce({ id: 'step-2', statut: StatutEtape.COMPLETE });
      jest.spyOn(service, 'findOne').mockResolvedValueOnce(existingClient as any);

      const result = await service.onboardingRecit({
        prenom: 'Marie',
        nom: 'Claire',
        telephone: '+243888888888',
        siteId: 'site-1',
        montantRecit: 5000,
        modePaiement: ModePaiement.CASH,
        agentId: 'agent-1',
      });

      expect(prisma.onboardingEtape.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'step-2' },
          data: expect.objectContaining({ statut: StatutEtape.EN_COURS }),
        }),
      );
      expect(result.etapeId).toBe('step-2');
    });

    it('throws ConflictException when client already has a valid completed recit', async () => {
      const existingClient = {
        id: 'client-3',
        prenom: 'Alice',
        nom: 'Test',
        telephone: '+243777777777',
        statut: StatutClient.EN_COURS,
        siteInscriptionId: 'site-1',
        onboardingEtapes: [
          { id: 'step-3', etape: EtapeOnboarding.RECIT, statut: StatutEtape.COMPLETE },
        ],
      };

      prisma.client.findUnique.mockResolvedValueOnce(existingClient);
      prisma.kpayTransaction.findFirst.mockResolvedValueOnce(null); // No failed transaction

      await expect(
        service.onboardingRecit({
          prenom: 'Alice',
          nom: 'Test',
          telephone: '+243777777777',
          siteId: 'site-1',
          montantRecit: 5000,
          modePaiement: ModePaiement.CASH,
          agentId: 'agent-1',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('resumeOnboardingRecit (Direct by ID)', () => {
    it('resumes recit by clientId directly', async () => {
      const client = {
        id: 'client-direct-1',
        statut: StatutClient.EN_COURS,
        siteInscriptionId: 'site-1',
        onboardingEtapes: [
          { id: 'step-d-1', etape: EtapeOnboarding.RECIT, statut: StatutEtape.EN_COURS },
        ],
      };

      prisma.client.findUnique.mockResolvedValueOnce(client);
      prisma.onboardingEtape.upsert.mockResolvedValueOnce({ id: 'step-d-1', statut: StatutEtape.COMPLETE });
      jest.spyOn(service, 'findOne').mockResolvedValueOnce(client as any);

      const res = await service.resumeOnboardingRecit('client-direct-1', {
        montantRecit: 5000,
        modePaiement: ModePaiement.CASH,
        agentId: 'agent-1',
      });

      expect(res.etapeId).toBe('step-d-1');
      expect(prisma.onboardingEtape.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { clientId_etape: { clientId: 'client-direct-1', etape: EtapeOnboarding.RECIT } },
          update: expect.objectContaining({
            statut: StatutEtape.COMPLETE,
          }),
        }),
      );
    });

    it('throws NotFoundException if client does not exist', async () => {
      prisma.client.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.resumeOnboardingRecit('non-existent', {
          montantRecit: 5000,
          modePaiement: ModePaiement.CASH,
          agentId: 'agent-1',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getOnboardingQueue', () => {
    it('generates /clients/:id/recit route for clients whose recit is not completed', async () => {
      prisma.client.findMany.mockResolvedValueOnce([
        {
          id: 'queue-client-1',
          prenom: 'Bob',
          nom: 'Marley',
          telephone: '+243999000111',
          siteInscription: { id: 'site-1', nom: 'Goma' },
          createdBy: { id: 'agent-1', nom: 'Agent 1' },
          createdAt: new Date(),
          onboardingEtapes: [
            { etape: EtapeOnboarding.RECIT, statut: StatutEtape.EN_COURS, completeeAt: null, agentId: 'agent-1' },
          ],
        },
      ]);

      const result = await service.getOnboardingQueue();
      expect(result.queue[0].etapeActuelle).toBe('RECIT');
      expect(result.queue[0].prochainRoute).toBe('/clients/queue-client-1/recit');
    });
  });
});
