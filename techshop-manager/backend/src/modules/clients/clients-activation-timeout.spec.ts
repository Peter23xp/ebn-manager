import { describe, expect, it, jest } from '@jest/globals';
import { ClientsService } from './clients.service';

describe('bounded MLM work during client activation', () => {
  it('returns the saved activation with a missing member after an MLM timeout, without repeating the expired transaction', async () => {
    const client: any = { id: 'client', statut: 'EN_COURS', telephone: 'synthetic', siteInscriptionId: 'site',
      membre: null, ventes: [], siteInscription: { id: 'site', nom: 'Test' },
      onboardingEtapes: [{ etape: 'FICHE', statut: 'COMPLETE' }] };
    const prisma: any = {
      client: { findUnique: jest.fn<any>().mockResolvedValue(client), update: jest.fn<any>(async ({ data }) => Object.assign(client, data)) },
      produit: { findUnique: jest.fn<any>().mockResolvedValue({ nom: 'Product', prixVente: 40 }) },
      stockSite: { findUnique: jest.fn<any>().mockResolvedValue({ quantite: 2 }), update: jest.fn<any>() },
      site: { findUnique: jest.fn<any>().mockResolvedValue({ nom: 'Test' }) },
      vente: { findFirst: jest.fn<any>().mockResolvedValue(null), create: jest.fn<any>() },
      onboardingEtape: { upsert: jest.fn<any>() }, mouvementStock: { create: jest.fn<any>() },
      parrainClaim: { count: jest.fn<any>().mockResolvedValue(0) },
    };
    prisma.$transaction = async (callback: any) => callback(prisma);
    const mlm: any = { onClientActivated: jest.fn<any>().mockRejectedValue(Object.assign(new Error('Transaction expired'), { code: 'P2028' })) };
    const portal: any = { initDefaultPin: jest.fn<any>().mockResolvedValue('synthetic') };
    const service = new ClientsService(prisma, portal, {} as never, mlm, {} as never, {} as never, {} as never, {} as never);
    jest.spyOn(service as any, 'generateUniqueCodeParrain').mockResolvedValue('synthetic-code');
    const errorLog = jest.spyOn(console, 'error').mockImplementation(() => {});
    const pinLog = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const result = await service.onboardingActivate('client', { produitId: 'product', modePaiement: 'CASH' }, 'agent');
      expect(result).toMatchObject({ statut: 'ACTIF', membre: null, codeParrain: 'synthetic-code' });
      expect(mlm.onClientActivated).toHaveBeenCalledTimes(1);
      expect(prisma.vente.create).toHaveBeenCalledTimes(1);
      expect(prisma.stockSite.update).toHaveBeenCalledTimes(1);
    } finally { errorLog.mockRestore(); pinLog.mockRestore(); }
  });
});
