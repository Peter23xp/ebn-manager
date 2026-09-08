import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { ClientsService } from './clients.service';
import { BadRequestException } from '@nestjs/common';

describe('Enregistrement filleul — parrain EN_COURS → claim', () => {
  let service: ClientsService;
  let prisma: any;
  let mlmClaim: any;

  const parrainEnCours = {
    id: 'parrain-uuid-1', telephone: '+243900000001',
    prenom: 'Jean', nom: 'Kasavuru', statut: 'EN_COURS',
  };

  beforeEach(() => {
    // findUnique({where:{telephone}}) → lookup "client existant" = null
    // findUnique({where:{id}})        → findOne(final) retourne le nouveau client
    const clientRow = {
      id: 'filleul-uuid-9', prenom: 'Marie', nom: 'Kabila', telephone: '+243900000002',
      email: null, matriculeExterne: null, codeParrain: null, parrainClientId: 'parrain-uuid-1',
      statut: 'EN_COURS', onboardingEtapes: [], membre: null, siteInscription: null,
      parrainClient: null, ventes: [],
    };
    prisma = {
      client: {
        findFirst: jest.fn<any>().mockResolvedValue(null),
        findUnique: jest.fn<any>().mockImplementation((args: any) =>
          Promise.resolve(args?.where?.telephone ? null : clientRow)),
        create: jest.fn<any>().mockResolvedValue({ id: 'filleul-uuid-9', telephone: '+243900000002' }),
      },
      parrainClaim: {
        upsert: jest.fn<any>().mockResolvedValue({ id: 'claim-1' }),
      },
      onboardingEtape: {
        create: jest.fn<any>().mockResolvedValue({ id: 'etape-1' }),
        upsert: jest.fn<any>().mockResolvedValue({ id: 'etape-1' }),
      },
      kpayTransaction: {
        create: jest.fn<any>().mockResolvedValue({ id: 'ktx-1' }),
        update: jest.fn<any>().mockResolvedValue({}),
      },
      site: { findUnique: jest.fn<any>().mockResolvedValue({ id: 'site-1' }) },
      $transaction: jest.fn<any>(async (cb: any) => cb(prisma)),
    };
    mlmClaim = {
      resolveParrain: jest.fn<any>().mockResolvedValue(parrainEnCours),
    };
    service = new ClientsService(
      prisma as any,
      {} as any, // portalAuthService
      {} as any, // mailer
      { onClientActivated: jest.fn<any>() } as any, // mlmMatrixService
      { initDeposit: jest.fn<any>() } as any, // kpay
      { registerFinalizer: jest.fn<any>() } as any, // kpayWebhooks
      mlmClaim as any, // mlmClaimService
    );
  });

  it('accepte un parrain EN_COURS (téléphone saisi) et crée un claim EN_ATTENTE via onboardingRecit', async () => {
    const result = await service.onboardingRecit({
      prenom: 'Marie', nom: 'Kabila', telephone: '+243900000002',
      siteId: 'site-1', codeParrain: '+243900000001', // téléphone du parrain EN_COURS
      montantRecit: 10000, modePaiement: 'CASH' as any, agentId: 'agent-1',
    });

    expect(mlmClaim.resolveParrain).toHaveBeenCalledWith('+243900000001');
    expect(prisma.parrainClaim.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { filleulClientId: 'filleul-uuid-9' },
        create: expect.objectContaining({
          filleulClientId: 'filleul-uuid-9',
          parrainClientId: 'parrain-uuid-1',
          statut: 'EN_ATTENTE',
          telephoneParrainSaisi: '+243900000001',
        }),
      }),
    );
    expect((result as any).warning).toBe('PARRAIN_NON_ACTIVE');
  });

  it('rejette quand aucun parrain ne match (ERR_PARRAIN_NOT_FOUND)', async () => {
    mlmClaim.resolveParrain.mockResolvedValue(null);
    await expect(
      service.onboardingRecit({
        prenom: 'Marie', nom: 'Kabila', telephone: '+243900000002',
        siteId: 'site-1', codeParrain: '0000000000',
        montantRecit: 10000, modePaiement: 'CASH' as any, agentId: 'agent-1',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.client.create).not.toHaveBeenCalled();
  });

  it('ne crée pas de claim pour un parrain ACTIF', async () => {
    mlmClaim.resolveParrain.mockResolvedValue({ ...parrainEnCours, statut: 'ACTIF' });
    await service.onboardingRecit({
      prenom: 'Marie', nom: 'Kabila', telephone: '+243900000002',
      siteId: 'site-1', codeParrain: '202509010001',
      montantRecit: 10000, modePaiement: 'CASH' as any, agentId: 'agent-1',
    });
    expect(prisma.parrainClaim.upsert).not.toHaveBeenCalled();
  });

  it('refuse l\'auto-parrainage (même téléphone)', async () => {
    mlmClaim.resolveParrain.mockResolvedValue({ ...parrainEnCours, telephone: '+243900000002' });
    await expect(
      service.onboardingRecit({
        prenom: 'Marie', nom: 'Kabila', telephone: '+243900000002',
        siteId: 'site-1', codeParrain: '+243900000002',
        montantRecit: 10000, modePaiement: 'CASH' as any, agentId: 'agent-1',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.client.create).not.toHaveBeenCalled();
  });

  it('initKpayRecit accepte un parrain EN_COURS et crée un claim', async () => {
    mlmClaim.resolveParrain.mockResolvedValue({ ...parrainEnCours, statut: 'EN_COURS' });
    const kpay = { initDeposit: jest.fn<any>().mockResolvedValue({ id: 'tx-1', reference: 'ref-1', status: 'PENDING' }) };
    service = new ClientsService(
      prisma as any, {} as any, {} as any,
      { onClientActivated: jest.fn<any>() } as any,
      kpay as any, { registerFinalizer: jest.fn<any>() } as any,
      mlmClaim as any,
    );
    // requireConfiguredAdminPhone passe si KPAY_CONFIGURED — on stub la méthode privée
    (service as any).requireConfiguredAdminPhone = jest.fn<any>().mockResolvedValue(undefined);

    const result = await service.initKpayRecit({
      prenom: 'Marie', nom: 'Kabila', telephone: '+243900000002',
      siteId: 'site-1', codeParrain: '+243900000001',
      montantRecit: 10000, provider: 'M-PESA', phoneNumber: '+243900000002', agentId: 'agent-1',
    });

    expect(prisma.parrainClaim.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          parrainClientId: 'parrain-uuid-1',
          statut: 'EN_ATTENTE',
        }),
      }),
    );
    expect((result as any).warning).toBe('PARRAIN_NON_ACTIVE');
  });
});
