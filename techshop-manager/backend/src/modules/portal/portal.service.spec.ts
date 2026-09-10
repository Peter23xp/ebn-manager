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
      portefeuille: {
        findUnique: jest.fn<any>(),
        update: jest.fn<any>(),
      },
      $transaction: jest.fn<any>(async (cb: any) => cb(prisma)),
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

  describe('createWithdrawalRequest — plafond au solde retirable + réserve', () => {
    // portefeuille: dispo 120, réservé 20 → retirable = 100
    const membreAvecPortefeuille = {
      id: 'membre-1', clientId: 'client-1',
      portefeuille: { id: 'w-1', soldeDisponible: 120, soldeReserve: 20 },
    };

    function mockHappy() {
      prisma.membre.findUnique.mockResolvedValue(membreAvecPortefeuille);
      prisma.portefeuille.update.mockResolvedValue({ id: 'w-1' });
      prisma.withdrawalRequest.create.mockResolvedValue({
        id: 'wr-1', montant: 25, type: 'MOBILE_MONEY', provider: 'AIRTEL_COD',
        phoneNumber: '+243812345678', statut: 'EN_ATTENTE', commissionIds: [], notes: null, createdAt: new Date(),
      });
    }

    it('normalise 243XXXXXXXXX en +243XXXXXXXXX et réserve le montant', async () => {
      mockHappy();
      await service.createWithdrawalRequest('client-1', {
        montant: 25, type: 'MOBILE_MONEY' as never, provider: 'AIRTEL_COD', phoneNumber: '243812345678',
      } as never);
      expect(prisma.withdrawalRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            phoneNumber: '+243812345678',
            commissionIds: [],
          }),
        }),
      );
      expect(prisma.portefeuille.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'w-1' },
          data: { soldeReserve: { increment: expect.anything() } },
        }),
      );
    });

    it('normalise 0XXXXXXXXX (préfixe local) en +243XXXXXXXXX', async () => {
      mockHappy();
      await service.createWithdrawalRequest('client-1', {
        montant: 25, type: 'MOBILE_MONEY' as never, provider: 'AIRTEL_COD', phoneNumber: '0812345678',
      } as never);
      expect(prisma.withdrawalRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ phoneNumber: '+243812345678' }),
        }),
      );
    });

    it('refuse un montant supérieur au solde retirable', async () => {
      prisma.membre.findUnique.mockResolvedValue(membreAvecPortefeuille);
      await expect(
        service.createWithdrawalRequest('client-1', { montant: 100.01, type: 'CASH' } as never),
      ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'ERR_INSUFFICIENT_WITHDRAWABLE' }) });
      expect(prisma.withdrawalRequest.create).not.toHaveBeenCalled();
      expect(prisma.portefeuille.update).not.toHaveBeenCalled();
    });

    it('refuse sans portefeuille (retirable = 0)', async () => {
      // ensureMember: membre sans portefeuille → tentative auto-heal → client non ACTIF → membre sans portefeuille
      prisma.membre.findUnique.mockResolvedValue({ id: 'membre-1', clientId: 'client-1', portefeuille: null });
      prisma.client.findUnique.mockResolvedValue({ id: 'client-1', statut: 'EN_COURS', parrainClientId: null });
      await expect(
        service.createWithdrawalRequest('client-1', { montant: 1, type: 'CASH' } as never),
      ).rejects.toMatchObject({ response: expect.objectContaining({ code: 'ERR_INSUFFICIENT_WITHDRAWABLE' }) });
    });

    it('rejette un téléphone invalide', async () => {
      prisma.membre.findUnique.mockResolvedValue(membreAvecPortefeuille);
      await expect(
        service.createWithdrawalRequest('client-1', {
          montant: 25, type: 'MOBILE_MONEY' as never, provider: 'AIRTEL_COD', phoneNumber: '12345',
        } as never),
      ).rejects.toThrow();
      expect(prisma.withdrawalRequest.create).not.toHaveBeenCalled();
    });
  });

  describe('cancelWithdrawalRequest', () => {
    it('annule et restitue la réserve', async () => {
      prisma.membre.findUnique.mockResolvedValue({
        id: 'membre-1', clientId: 'client-1', portefeuille: { id: 'w-1' },
      });
      prisma.withdrawalRequest.findUnique.mockResolvedValue({
        id: 'wr-1', membreId: 'membre-1', montant: 25, statut: 'EN_ATTENTE',
      });
      prisma.portefeuille.update.mockResolvedValue({ id: 'w-1' });
      prisma.withdrawalRequest.update.mockResolvedValue({ id: 'wr-1', statut: 'ANNULE' });

      const res = await service.cancelWithdrawalRequest('client-1', 'wr-1');

      expect(res.statut).toBe('ANNULE');
      expect(prisma.portefeuille.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'w-1' },
          data: { soldeReserve: { decrement: expect.anything() } },
        }),
      );
    });

    it("refuse d'annuler la demande d'un autre", async () => {
      prisma.membre.findUnique.mockResolvedValue({ id: 'membre-1', clientId: 'client-1', portefeuille: null });
      prisma.client.findUnique.mockResolvedValue({ id: 'client-1', statut: 'ACTIF', parrainClientId: null });
      prisma.membre.findUnique.mockResolvedValue({ id: 'membre-1', clientId: 'client-1', portefeuille: null });
      prisma.withdrawalRequest.findUnique.mockResolvedValue({
        id: 'wr-2', membreId: 'membre-AUTRE', statut: 'EN_ATTENTE',
      });
      await expect(service.cancelWithdrawalRequest('client-1', 'wr-2')).rejects.toThrow();
    });

    it("refuse d'annuler une demande non EN_ATTENTE", async () => {
      prisma.membre.findUnique.mockResolvedValue({ id: 'membre-1', clientId: 'client-1', portefeuille: null });
      prisma.withdrawalRequest.findUnique.mockResolvedValue({
        id: 'wr-1', membreId: 'membre-1', statut: 'APPROUVE',
      });
      await expect(service.cancelWithdrawalRequest('client-1', 'wr-1')).rejects.toThrow();
    });
  });
});
