import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { PortalService } from './portal.service';

describe('PortalService', () => {
  let service: PortalService;
  let prisma: any;
  let mlmWallet: any;
  let mlmMatrix: any;

  beforeEach(() => {
    prisma = {
      client: {
        findUnique: jest.fn<any>(),
      },
      membre: {
        findUnique: jest.fn<any>(),
        findMany: jest.fn<any>(),
      },
      vente: {
        findMany: jest.fn<any>(),
        findUnique: jest.fn<any>(),
        aggregate: jest.fn<any>(),
      },
      transactionPortefeuille: {
        findMany: jest.fn<any>(),
        count: jest.fn<any>(),
      },
    };

    mlmWallet = {
      initPayout: jest.fn<any>(),
    };

    mlmMatrix = {
      onClientActivated: jest.fn<any>(),
    };

    service = new PortalService(prisma, mlmWallet, mlmMatrix);
  });

  describe('getPurchases', () => {
    it('returns client purchases with pointsAttribues and remiseAppliquee', async () => {
      const clientId = 'client-1';
      prisma.vente.findMany.mockResolvedValueOnce([
        {
          id: 'vente-1',
          numeroVente: 'GOM-202609-0001',
          createdAt: new Date(),
          site: { nom: 'Goma' },
          modePaiement: 'CASH',
          montantNet: 45,
          pointsAttribues: 40,
          remiseFidelite: 5,
          lignes: [
            { quantite: 1, produit: { nom: 'Produit Test' } },
          ],
        },
      ]);

      prisma.vente.aggregate.mockResolvedValueOnce({
        _count: { id: 1 },
        _sum: { montantNet: 45, pointsAttribues: 40 },
      });

      const res = await service.getPurchases(clientId, { period: 'all' });

      expect(res.achats).toHaveLength(1);
      expect(res.achats[0].pointsAttribues).toBe(40);
      expect(res.achats[0].remiseAppliquee).toBe(5);
      expect(res.achats[0].montantTotal).toBe(45);
      expect(res.stats.totalPointsGagnes).toBe(40);
      expect(res.stats.totalDepense).toBe(45);
      expect(res.stats.nbAchats).toBe(1);
    });
  });

  describe('getWallet & auto-heal', () => {
    it('auto-heals active client missing member profile and returns wallet balances', async () => {
      const clientId = 'client-active-no-member';

      // 1st check: member not found
      prisma.membre.findUnique
        .mockResolvedValueOnce(null)
        // 2nd check after auto-heal: member exists
        .mockResolvedValueOnce({
          id: 'membre-healed',
          clientId,
          portefeuille: {
            soldeDisponible: 120,
            soldeReserve: 20,
            totalGagne: 200,
          },
        });

      prisma.client.findUnique.mockResolvedValueOnce({
        id: clientId,
        statut: 'ACTIF',
        parrainClientId: 'parrain-uuid',
      });

      const res = await service.getWallet(clientId);

      expect(mlmMatrix.onClientActivated).toHaveBeenCalledWith(clientId, 'parrain-uuid');
      expect(res.wallet?.soldeDisponible).toBe(120);
      expect(res.wallet?.soldeDisponibleRetrait).toBe(100);
      expect(res.wallet?.totalGagne).toBe(200);
      expect(res.stats?.gainsTotaux).toBe(200);
    });
  });

  describe('getWalletTransactions', () => {
    it('filters gains with valid MLM transaction types', async () => {
      const clientId = 'client-1';
      prisma.membre.findUnique.mockResolvedValueOnce({
        id: 'membre-1',
        portefeuille: { id: 'wallet-1' },
      });

      prisma.transactionPortefeuille.findMany.mockResolvedValueOnce([
        {
          id: 'tx-1',
          type: 'COMMISSION',
          montant: 50,
          description: 'Commission directe',
          createdAt: new Date(),
        },
      ]);
      prisma.transactionPortefeuille.count.mockResolvedValueOnce(1);

      const res = await service.getWalletTransactions(clientId, { typeFilter: 'gains' });

      expect(prisma.transactionPortefeuille.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            portefeuilleId: 'wallet-1',
            type: { in: ['COMMISSION', 'PROMOTION', 'SALAIRE', 'BONUS_RETRAITE'] },
          }),
        }),
      );

      expect(res.transactions).toHaveLength(1);
      expect(res.transactions[0].montant).toBe(50);
    });
  });
});
