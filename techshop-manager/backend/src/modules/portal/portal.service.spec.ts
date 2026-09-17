import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { PortalService } from './portal.service';
import { Prisma } from '@prisma/client';

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
        updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
      },
      portefeuille: {
        findUnique: jest.fn<any>(),
        update: jest.fn<any>(),
      },
      reinvestLote: {
        findMany: jest.fn<any>().mockResolvedValue([]),
      },
      // SELECT ... FOR UPDATE (verrou de ligne portefeuille)
      $queryRaw: jest.fn<any>().mockResolvedValue([{ soldeDisponible: 120, soldeReserve: 20 }]),
      $transaction: jest.fn<any>(async (cb: any) => cb(prisma)),
    };

    mlmWallet = {
      initPayout: jest.fn<any>(),
      getWallet: jest.fn<any>().mockResolvedValue({
        soldeDisponible: 120, soldeReserve: 20, soldeDisponibleRetrait: 100, soldeReinvesti: 80, totalGagne: 200,
        financialSummary: {
          generatedTotal: '200.00', validatedTotal: '200.00', immediateAmount: '120.00',
          heldAmount: '80.00', releasableAmount: '0.00', releasedAmount: '0.00',
        },
        reinvestLots: [],
        reinvestLotsMeta: { total: 0, page: 1, limit: 100, totalPages: 0 },
      }),
    };

    mlmMatrix = {
      onClientActivated: jest.fn<any>(),
      getNetworkTree: jest.fn<any>(),
    };

    service = new PortalService(prisma, mlmWallet, mlmMatrix);
  });

  describe('getReferrals', () => {
    it('returns the real matrix separately while preserving personal referral filters, pagination and statistics', async () => {
      prisma.client.findUnique.mockResolvedValue({ codeParrain: 'CODE-1' });
      prisma.membre.findUnique.mockResolvedValue({ id: 'member-1', portefeuille: { totalGagne: new Prisma.Decimal('40') } });
      const activatedAt = new Date('2026-09-10T12:00:00Z');
      prisma.membre.findMany
        .mockResolvedValueOnce([
          { id: 'personal-1', parrainId: 'member-1', statut: 'ACTIF', dateActivation: activatedAt, client: { prenom: 'Alice', nom: 'One' } },
          { id: 'personal-2', parrainId: 'member-1', statut: 'INACTIF', createdAt: activatedAt, client: { prenom: 'Bob', nom: 'Two' } },
        ])
        .mockResolvedValueOnce([
          { id: 'personal-3', parrainId: 'personal-1', statut: 'ACTIF', dateActivation: activatedAt, client: { prenom: 'Claire', nom: 'Three' } },
        ])
        .mockResolvedValueOnce([]);
      mlmMatrix.getNetworkTree.mockResolvedValue({
        id: 'member-1', generation: 0,
        children: [{ id: 'spillover-1', generation: 1, recruiter: { id: 'other-recruiter' }, matrixParent: { id: 'member-1' }, children: [] }],
      });

      const result = await service.getReferrals('client-1', { filter: 'actifs', page: 2, limit: 1 });

      expect(result.matrixTree).toEqual({
        id: 'member-1', generation: 0,
        children: [{ id: 'spillover-1', generation: 1, recruiter: { id: 'other-recruiter' }, matrixParent: { id: 'member-1' }, children: [] }],
      });
      expect(mlmMatrix.getNetworkTree).toHaveBeenCalledWith('member-1', 2);
      expect(result.codeParrain).toBe('CODE-1');
      expect(result.stats).toEqual({ nbFilleulsActifs: 2, nbFilleulsTotal: 3, gainsTotaux: 40 });
      expect(result.meta).toEqual({ total: 2, page: 2, limit: 1, totalPages: 2 });
      expect(result.filleuls).toEqual([{
        id: 'personal-3', parrainId: 'personal-1', prenom: 'Claire', nom: 'Three', statut: 'ACTIF',
        generation: 2, dateInscription: '2026-09-10T12:00:00.000Z', etapeOnboarding: undefined, etapeMessage: undefined,
      }]);
    });

    it('still exposes matrix placements when the member has no personal referrals', async () => {
      prisma.client.findUnique.mockResolvedValue({ codeParrain: null });
      prisma.membre.findUnique.mockResolvedValue({ id: 'member-1', portefeuille: { totalGagne: new Prisma.Decimal('0') } });
      prisma.membre.findMany.mockResolvedValue([]);
      mlmMatrix.getNetworkTree.mockResolvedValue({ id: 'member-1', children: [{ id: 'spillover-1', children: [] }] });

      const result = await service.getReferrals('client-1', {});

      expect(result.matrixTree).toEqual({ id: 'member-1', children: [{ id: 'spillover-1', children: [] }] });
      expect(result.filleuls).toEqual([]);
      expect(result.stats).toEqual({ nbFilleulsActifs: 0, nbFilleulsTotal: 0, gainsTotaux: 0 });
      expect(result.meta).toEqual({ total: 0, page: 1, limit: 20, totalPages: 0 });
    });
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
            soldeReinvesti: 80,
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
      expect(res.wallet?.soldeReinvesti).toBe(80);
      expect(res.wallet?.totalGagne).toBe(200);
      expect(res.stats?.gainsTotaux).toBe(200);
    });
  });

  describe('getWallet — lots de réinvestissement', () => {
    it('returns the shared summary and complete capped lot history without recomputing finances', async () => {
      prisma.membre.findUnique.mockResolvedValue({
        id: 'm-1', clientId: 'c-1',
        portefeuille: { soldeDisponible: 50, soldeReserve: 0, soldeReinvesti: 40, totalGagne: 90 },
      });
      mlmWallet.getWallet.mockResolvedValueOnce({
        soldeDisponible: 50, soldeReserve: 0, soldeDisponibleRetrait: 50, soldeReinvesti: 40, totalGagne: 90,
        financialSummary: {
          generatedTotal: '90.00', validatedTotal: '90.00', immediateAmount: '50.00',
          heldAmount: '0.00', releasableAmount: '40.00', releasedAmount: '0.00',
        },
        reinvestLots: [{
          id: 'l-1', amount: '40.00', releaseDate: '2026-10-12T00:00:00.000Z', releasedAt: null,
          status: 'RELEASABLE', commissionId: 'c-1', calendarVersion: 'historic-v1', timezone: 'Africa/Lubumbashi',
        }],
        reinvestLotsMeta: { total: 101, page: 1, limit: 100, totalPages: 2 },
      });

      const res = await service.getWallet('c-1');

      expect(res.financialSummary).toEqual({
        generatedTotal: '90.00', validatedTotal: '90.00', immediateAmount: '50.00',
        heldAmount: '0.00', releasableAmount: '40.00', releasedAmount: '0.00',
      });
      expect(res.reinvestLots).toEqual([{
        id: 'l-1', amount: '40.00', releaseDate: '2026-10-12T00:00:00.000Z', releasedAt: null,
        status: 'RELEASABLE', commissionId: 'c-1', calendarVersion: 'historic-v1', timezone: 'Africa/Lubumbashi',
      }]);
      expect(res.reinvestLotsMeta).toEqual({ total: 101, page: 1, limit: 100, totalPages: 2 });
      expect(mlmWallet.getWallet).toHaveBeenCalledWith('m-1');
      expect(prisma.reinvestLote.findMany).not.toHaveBeenCalled();
    });

    it('returns zero financial strings and no lots for a client without a wallet', async () => {
      prisma.membre.findUnique.mockResolvedValue(null);
      prisma.client.findUnique.mockResolvedValue({ statut: 'INACTIF' });

      const result = await service.getWallet('inactive-client');
      expect(result.financialSummary).toEqual({
        generatedTotal: '0.00', validatedTotal: '0.00', immediateAmount: '0.00',
        heldAmount: '0.00', releasableAmount: '0.00', releasedAmount: '0.00',
      });
      expect(result.reinvestLots).toEqual([]);
      expect(mlmWallet.getWallet).not.toHaveBeenCalled();
    });

    it('preserves the delegated Decimal-derived remaining balance for legacy clients', async () => {
      prisma.membre.findUnique.mockResolvedValue({
        id: 'm-1', clientId: 'c-1', portefeuille: {
          soldeDisponible: new Prisma.Decimal('0.30'), soldeReserve: new Prisma.Decimal('0.10'),
          soldeReinvesti: new Prisma.Decimal('16'), totalGagne: new Prisma.Decimal('40'),
        },
      });
      mlmWallet.getWallet.mockResolvedValueOnce({
        soldeDisponible: 0.3, soldeReserve: 0.1, soldeDisponibleRetrait: 0.2, soldeReinvesti: 16, totalGagne: 40,
        financialSummary: { generatedTotal: '40.00', validatedTotal: '40.00', immediateAmount: '24.00', heldAmount: '16.00', releasableAmount: '0.00', releasedAmount: '0.00' },
        reinvestLots: [], reinvestLotsMeta: { total: 0, page: 1, limit: 100, totalPages: 0 },
      });
      const result = await service.getWallet('c-1');
      expect(result.wallet.soldeDisponibleRetrait).toBe(0.2);
    });

    it('uses only delegated snapshot balances and stats after intervening financial changes and forwards pagination', async () => {
      prisma.membre.findUnique.mockResolvedValue({
        id: 'm-1', portefeuille: { soldeDisponible: 24, soldeReserve: 3, soldeReinvesti: 16, totalGagne: 80 },
      });
      mlmWallet.getWallet.mockResolvedValueOnce({
        soldeDisponible: 40, soldeReserve: 5, soldeDisponibleRetrait: 35, soldeReinvesti: 0, totalGagne: 40,
        financialSummary: { generatedTotal: '40.00', validatedTotal: '40.00', immediateAmount: '24.00', heldAmount: '0.00', releasableAmount: '0.00', releasedAmount: '16.00' },
        reinvestLots: [{ id: 'lot-1', status: 'RELEASED', amount: '16.00', releasedAt: '2026-09-17T00:00:00.000Z' }],
        reinvestLotsMeta: { total: 3, page: 2, limit: 1, totalPages: 3 },
      });

      const result = await service.getWallet('c-1', { page: 2, limit: 1 });

      expect(result.wallet).toEqual({ soldeDisponible: 40, soldeReserve: 5, soldeDisponibleRetrait: 35, soldeReinvesti: 0, totalGagne: 40 });
      expect(result.stats).toEqual({ gainsTotaux: 40 });
      expect(result.financialSummary.releasedAmount).toBe('16.00');
      expect(result.reinvestLots[0].status).toBe('RELEASED');
      expect(result.reinvestLotsMeta).toEqual({ total: 3, page: 2, limit: 1, totalPages: 3 });
      expect(mlmWallet.getWallet).toHaveBeenCalledWith('m-1', { page: 2, limit: 1 });
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
            type: { in: ['COMMISSION', 'PROMOTION', 'SALAIRE', 'BONUS_RETRAITE', 'REINVESTISSEMENT'] },
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
      prisma.portefeuille.findUnique.mockResolvedValue({ soldeDisponible: 120, soldeReserve: 20 });
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
