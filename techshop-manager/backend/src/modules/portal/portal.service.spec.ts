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
      commission: {
        findMany: jest.fn<any>(),
      },
      withdrawalRequest: {
        create: jest.fn<any>(),
        findMany: jest.fn<any>(),
        findUnique: jest.fn<any>(),
        update: jest.fn<any>(),
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

  describe('createWithdrawalRequest — normalisation téléphone', () => {
    const baseMembre = { id: 'membre-1', clientId: 'client-1', portefeuille: { id: 'w-1' } };

    function setupHappyPath(phoneNumber: string) {
      prisma.membre.findUnique.mockResolvedValueOnce(baseMembre);
      prisma.commission.findMany.mockResolvedValueOnce([
        { id: 'c-1', montant: 25, statut: 'VALIDEE' },
      ]);
      prisma.withdrawalRequest.create.mockResolvedValueOnce({
        id: 'wr-1', montant: 25, type: 'MOBILE_MONEY', provider: 'AIRTEL_COD',
        phoneNumber, statut: 'EN_ATTENTE', commissionIds: ['c-1'], notes: null, createdAt: new Date(),
      });
      return { montant: 25, type: 'MOBILE_MONEY' as never, provider: 'AIRTEL_COD', phoneNumber, commissionIds: ['c-1'] };
    }

    it('normalizes 243XXXXXXXXX to +243XXXXXXXXX', async () => {
      const dto = setupHappyPath('243812345678');
      await service.createWithdrawalRequest('client-1', dto);
      expect(prisma.withdrawalRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ phoneNumber: '+243812345678' }),
        }),
      );
    });

    it('normalizes 0XXXXXXXXX (prefixe local) to +243XXXXXXXXX', async () => {
      const dto = setupHappyPath('0812345678');
      await service.createWithdrawalRequest('client-1', dto);
      expect(prisma.withdrawalRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ phoneNumber: '+243812345678' }),
        }),
      );
    });

    describe('cancelWithdrawalRequest', () => {
      it('cancels own pending request', async () => {
        prisma.membre.findUnique.mockResolvedValueOnce({ id: 'membre-1', clientId: 'client-1' });
        prisma.withdrawalRequest.findUnique.mockResolvedValueOnce({
          id: 'wr-1', membreId: 'membre-1', statut: 'EN_ATTENTE',
        });
        prisma.withdrawalRequest.update.mockResolvedValueOnce({ id: 'wr-1', statut: 'ANNULE' });

        const res = await service.cancelWithdrawalRequest('client-1', 'wr-1');
        expect(res.statut).toBe('ANNULE');
        expect(prisma.withdrawalRequest.update).toHaveBeenCalledWith(
          expect.objectContaining({ where: { id: 'wr-1' }, data: expect.objectContaining({ statut: 'ANNULE' }) }),
        );
      });

      it('refuses to cancel someone else’s request (404-like)', async () => {
        prisma.membre.findUnique.mockResolvedValueOnce({ id: 'membre-1', clientId: 'client-1' });
        prisma.withdrawalRequest.findUnique.mockResolvedValueOnce({
          id: 'wr-2', membreId: 'membre-AUTRE', statut: 'EN_ATTENTE',
        });
        await expect(service.cancelWithdrawalRequest('client-1', 'wr-2')).rejects.toThrow();
      });

      it('refuses to cancel a non-pending request', async () => {
        prisma.membre.findUnique.mockResolvedValueOnce({ id: 'membre-1', clientId: 'client-1' });
        prisma.withdrawalRequest.findUnique.mockResolvedValueOnce({
          id: 'wr-1', membreId: 'membre-1', statut: 'APPROUVE',
        });
        await expect(service.cancelWithdrawalRequest('client-1', 'wr-1')).rejects.toThrow();
      });
    });
  });
});
