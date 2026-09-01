import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { MlmMatrixService } from './mlm-matrix.service';

describe('MlmMatrixService - Parrain Attachment on Client Activation', () => {
  let service: MlmMatrixService;
  let prisma: any;
  let walletService: any;

  beforeEach(() => {
    prisma = {
      membre: {
        findUnique: jest.fn<any>(),
        findFirst: jest.fn<any>(),
        count: jest.fn<any>().mockResolvedValue(0),
        create: jest.fn<any>(),
        update: jest.fn<any>(),
      },
      client: {
        findUnique: jest.fn<any>(),
        update: jest.fn<any>(),
      },
      mlmLevel: {
        findFirst: jest.fn<any>().mockResolvedValue({ id: 1, ordre: 1, nom: 'Niveau 1' }),
      },
      portefeuille: {
        create: jest.fn<any>(),
      },
      matrix: {
        create: jest.fn<any>().mockResolvedValue({ id: 'matrix-1', estComplete: false, positions: [], filleulsValides: 0 }),
        findUnique: jest.fn<any>().mockResolvedValue({ id: 'parrain-matrix-1', estComplete: false, positions: [{ id: 'pos-1', estValide: false }], filleulsValides: 0 }),
        update: jest.fn<any>(),
      },
      position: {
        createMany: jest.fn<any>(),
        update: jest.fn<any>(),
      },
      $transaction: jest.fn<any>(async (cb: any) => cb(prisma)),
    };

    walletService = {};
    service = new MlmMatrixService(prisma, walletService);
  });

  it('attaches parrain when parrainCode is the Client.id of the sponsor (parrainClientId)', async () => {
    const sponsorClientId = 'sponsor-client-uuid-123';
    const newClientId = 'new-client-uuid-456';
    const sponsorMembreId = 'sponsor-membre-uuid-789';

    prisma.client.findUnique.mockResolvedValueOnce({
      id: newClientId,
      matriculeExterne: null,
      codeParrain: null,
      parrainClientId: sponsorClientId,
    });

    prisma.membre.findUnique.mockResolvedValueOnce(null); // Not yet a member

    // Finding sponsor member by clientId
    prisma.membre.findFirst.mockResolvedValueOnce({
      id: sponsorMembreId,
      clientId: sponsorClientId,
    });

    prisma.membre.create.mockResolvedValueOnce({
      id: 'new-membre-uuid',
      clientId: newClientId,
      parrainId: sponsorMembreId,
    });

    await service.onClientActivated(newClientId, sponsorClientId);

    expect(prisma.membre.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { id: sponsorClientId },
            { clientId: sponsorClientId },
            { matricule: sponsorClientId },
            { client: { id: sponsorClientId } },
          ]),
        }),
      }),
    );

    expect(prisma.membre.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          clientId: newClientId,
          parrainId: sponsorMembreId,
        }),
      }),
    );
  });

  it('heals parrain relationship if member already exists with parrainId=null but client has parrainClientId', async () => {
    const sponsorClientId = 'sponsor-client-uuid-123';
    const existingMemberClientId = 'existing-client-uuid-456';
    const sponsorMembreId = 'sponsor-membre-uuid-789';
    const existingMembreId = 'existing-membre-uuid-999';

    prisma.client.findUnique.mockResolvedValueOnce({
      id: existingMemberClientId,
      parrainClientId: sponsorClientId,
    });

    prisma.membre.findFirst.mockResolvedValueOnce({
      id: sponsorMembreId,
      clientId: sponsorClientId,
    });

    // Member already exists with parrainId = null
    prisma.membre.findUnique.mockResolvedValueOnce({
      id: existingMembreId,
      clientId: existingMemberClientId,
      parrainId: null,
    });

    await service.onClientActivated(existingMemberClientId, sponsorClientId);

    expect(prisma.membre.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: existingMembreId },
        data: { parrainId: sponsorMembreId },
      }),
    );
  });
});
