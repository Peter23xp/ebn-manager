import { describe, expect, it, jest } from '@jest/globals';
import { MlmMatrixService } from './mlm-matrix.service';

// Niveau 1 Builder : 10 USD/filleul → 6 USD système (60 %) + 4 USD réinvestis (40 %)
const LEVEL1 = {
  id: 7, ordre: 1, nom: 'Builder',
  commissionParFilleul: 10, commissionTotale: 40,
  commissionSysteme: 6, commissionRetour: 4,
};

const resolved = (value: any) => {
  const mock = jest.fn();
  (mock as any).mockResolvedValue(value);
  return mock;
};

function buildTx(over: Record<string, any> = {}) {
  const matrix = {
    id: 'mx-1', membreId: 'p-1', mlmLevelId: 7,
    estComplete: false, filleulsValides: 0,
    positions: [
      { id: 'pos-1', estValide: false },
      { id: 'pos-2', estValide: false },
      { id: 'pos-3', estValide: false },
      { id: 'pos-4', estValide: true },
    ],
  };
  return {
    matrix: {
      findUnique: resolved(matrix),
      create: jest.fn(),
      update: jest.fn(),
    },
    position: { update: jest.fn() },
    mlmLevel: { findUnique: resolved(LEVEL1), findFirst: resolved(null) },
    membre: { findUnique: resolved({ id: 'p-1', parrainId: null, level: LEVEL1, parrain: null }), update: jest.fn(), create: jest.fn() },
    commission: { findUnique: resolved(null), create: jest.fn<any>().mockResolvedValue({ id: 'com-1' }) },
    portefeuille: { findUnique: resolved({ id: 'pf-1' }), create: jest.fn() },
    promotion: { create: jest.fn() },
    bonusAttribue: { create: jest.fn() },
    salaireVerse: { findUnique: resolved(null), create: jest.fn() },
    bonusRetraite: { findUnique: resolved(null), create: jest.fn() },
    ...over,
  } as any;
}

function buildService(tx: any) {
  const prisma = { $transaction: jest.fn(async (cb: any) => cb(tx)) };
  const walletService = {
    creditReinvestInTx: jest.fn(),
    creditWalletInTx: jest.fn(),
  };
  const service = new MlmMatrixService(prisma as never, walletService as never);
  return { service, walletService };
}

describe('MlmMatrixService — commission à CHAQUE filleul validé (règle 10 $/filleul)', () => {
  it('crée une commission 10 $ (6/4) et crédite les 4 $ dès qu\'un filleul occupe une position', async () => {
    const tx = buildTx();
    const { service, walletService } = buildService(tx);

    await (service as any)._fillParrainPosition(tx, 'p-1', 'f-5', 7);

    expect(tx.position.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'pos-1' }, data: expect.objectContaining({ filleulId: 'f-5', estValide: true }) }),
    );
    expect(tx.commission.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          membreId: 'p-1',
          filleulId: 'f-5',
          mlmLevelId: 7,
          montant: 10,
          montantSysteme: 6,
          montantRetour: 4,
          statut: 'EN_ATTENTE',
          referenceId: 'commission-p-1-level1-f-5',
        }),
      }),
    );
    // 40 % → poche réinvestissement bloquée J+30
    expect(walletService.creditReinvestInTx).toHaveBeenCalledWith(tx, 'p-1', 4, 'com-1', 'Builder');
    // matrice non complète (1/4) → pas de promotion
    expect(tx.promotion.create).not.toHaveBeenCalled();
  });

  it('ne recrée pas de commission si la référence existe déjà (idempotence)', async () => {
    const tx = buildTx({ commission: { findUnique: resolved({ id: 'com-existing' }), create: jest.fn() } });
    const { service, walletService } = buildService(tx);

    await (service as any)._fillParrainPosition(tx, 'p-1', 'f-5', 7);

    expect(tx.commission.create).not.toHaveBeenCalled();
    expect(walletService.creditReinvestInTx).not.toHaveBeenCalled();
  });

  it('à 4/4 : la 4e commission est créée, la promotion a lieu SANS commission de complétion', async () => {
    const tx = buildTx();
    tx.matrix.findUnique = resolved({
      id: 'mx-1', membreId: 'p-1', mlmLevelId: 7, estComplete: false, filleulsValides: 3,
      positions: [{ id: 'pos-4', estValide: false }],
    });
    const nextLevel = { id: 8, ordre: 2, nom: 'Sapphire', bonusDescription: 'kit', salaireActif: false, salaireMensuel: 0 };
    tx.mlmLevel.findFirst = resolved(nextLevel);
    const { service, walletService } = buildService(tx);

    await (service as any)._fillParrainPosition(tx, 'p-1', 'f-9', 7);

    // commission du 4e filleul uniquement (10 $, split 6/4)
    expect(tx.commission.create).toHaveBeenCalledTimes(1);
    expect(tx.commission.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ montant: 10, montantSysteme: 6, montantRetour: 4 }) }),
    );
    expect(walletService.creditReinvestInTx).toHaveBeenCalledWith(tx, 'p-1', 4, 'com-1', 'Builder');
    // promotion au niveau 2, sans créer de seconde commission de « complétion »
    expect(tx.promotion.create).toHaveBeenCalledTimes(1);
    expect(tx.membre.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'p-1' }, data: { mlmLevelId: 8 } }),
    );
    expect(tx.commission.create).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ montant: 40 }) }),
    );
  });
});
