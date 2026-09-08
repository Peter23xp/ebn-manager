import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { ClientsService } from './clients.service';
import { ConflictException, BadRequestException } from '@nestjs/common';

describe('Activation du parrain — confirmation des claims par code facture', () => {
  let service: ClientsService;
  let prisma: any;
  let mlmClaim: any;

  const activeClientShape = {
    id: 'parrain-1', statut: 'EN_COURS', siteInscriptionId: 'site-1',
    telephone: '+243900000001', email: null,
    onboardingEtapes: [
      { etape: 'FICHE', statut: 'COMPLETE' },
      { etape: 'RECIT', statut: 'COMPLETE' },
      { etape: 'FORMATION', statut: 'COMPLETE' },
    ],
  };

  beforeEach(() => {
    prisma = {
      client: {
        findUnique: jest.fn<any>().mockResolvedValue(activeClientShape),
        findFirst: jest.fn<any>().mockResolvedValue(null), // generateUniqueCodeParrain collision check
        count: jest.fn<any>().mockResolvedValue(0), // codeParrain déjà générés aujourd'hui
      },
      parrainClaim: { count: jest.fn<any>() },
      produit: { findUnique: jest.fn<any>().mockResolvedValue({ id: 'p-1', actif: true, nom: 'Starter Kit', prixVente: 50 }) },
      stockSite: { findUnique: jest.fn<any>().mockResolvedValue({ quantite: 5 }) },
      site: { findUnique: jest.fn<any>().mockResolvedValue({ nom: 'Goma' }) },
      vente: { findFirst: jest.fn<any>().mockResolvedValue(null), create: jest.fn<any>() },
      $transaction: jest.fn<any>(async () => {
        throw new Error('NEVER: transaction must not run before claim validation');
      }),
    };
    mlmClaim = {
      attachConfirmedClaims: jest.fn<any>().mockResolvedValue({ attachés: 1, conflits: 0 }),
    };
    service = new ClientsService(
      prisma as any, {} as any, {} as any,
      { onClientActivated: jest.fn<any>() } as any,
      { initDeposit: jest.fn<any>() } as any,
      { registerFinalizer: jest.fn<any>() } as any,
      mlmClaim as any,
    );
  });

  it('avec claims et sans codeFacture → 409 ERR_CLAIM_CODE_REQUIRED, client non activé', async () => {
    prisma.parrainClaim.count.mockResolvedValue(2);
    await expect(
      service.onboardingActivate('parrain-1', {
        produitId: 'p-1', modePaiement: 'CASH' as any,
      } as any, 'agent-1'),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.onboardingActivate('parrain-1', {
        produitId: 'p-1', modePaiement: 'CASH' as any,
      } as any, 'agent-1'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'ERR_CLAIM_CODE_REQUIRED',
        nbFilleulsEnAttente: 2,
      }),
    });
    // Le $transaction qui active a été configuré pour jeter — jamais appelé sur ce chemin,
    // mais on vérifie explicitement qu'aucun attach n'a eu lieu :
    expect(mlmClaim.attachConfirmedClaims).not.toHaveBeenCalled();
  });

  it('avec claims et codeFacture invalide → 400 ERR_CLAIM_CODE_INVALID', async () => {
    prisma.parrainClaim.count.mockResolvedValue(1);
    await expect(
      service.onboardingActivate('parrain-1', {
        produitId: 'p-1', modePaiement: 'CASH' as any, codeFacture: '9999',
      } as any, 'agent-1'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ERR_CLAIM_CODE_INVALID' }),
    });
    expect(mlmClaim.attachConfirmedClaims).not.toHaveBeenCalled();
  });

  it('sans claims → le bloc de validation claim ne bloque pas (ERR_CLAIM_CODE_* jamais levé)', async () => {
    prisma.parrainClaim.count.mockResolvedValue(0);
    // La transaction est mockée pour jeter "NEVER…" : sur ce chemin on ATTEINT la transaction
    // (validation claim passée), donc l'erreur levée doit être "NEVER", pas une erreur claim.
    await expect(
      service.onboardingActivate('parrain-1', {
        produitId: 'p-1', modePaiement: 'CASH' as any,
      } as any, 'agent-1'),
    ).rejects.toThrow(/NEVER/);
    expect(prisma.parrainClaim.count).toHaveBeenCalledWith({
      where: { parrainClientId: 'parrain-1', statut: 'EN_ATTENTE' },
    });
  });

  it('codeFacture au format complet est accepté (la transaction est alors atteinte)', async () => {
    prisma.parrainClaim.count.mockResolvedValue(1);
    // numeroVente attendu : préfixe GOM-<YYYY><MM>-0001 → reconstruire pour le mock
    const now = new Date();
    const prefix = `GOM-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-0001`;
    await expect(
      service.onboardingActivate('parrain-1', {
        produitId: 'p-1', modePaiement: 'CASH' as any, codeFacture: prefix,
      } as any, 'agent-1'),
    ).rejects.toThrow(/NEVER/); // a passé la validation → atteint $transaction
  });

  it('deferClaims (voie webhook) → pas de 409 même avec des claims', async () => {
    prisma.parrainClaim.count.mockResolvedValue(3);
    await expect(
      service.onboardingActivate('parrain-1', {
        produitId: 'p-1', modePaiement: 'CASH' as any,
      } as any, 'agent-1', { deferClaims: true }),
    ).rejects.toThrow(/NEVER/); // la validation du code est court-circuitée
  });
});
