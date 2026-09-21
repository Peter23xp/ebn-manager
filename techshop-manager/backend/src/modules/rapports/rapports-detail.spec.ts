import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { RapportsService } from './rapports.service';

describe('Rapports détaillés', () => {
  let prisma: any;
  let service: RapportsService;
  beforeEach(() => {
    prisma = {
      vente: {
        findMany: jest.fn<any>().mockResolvedValue([]), count: jest.fn<any>().mockResolvedValue(0),
        aggregate: jest.fn<any>().mockResolvedValue({ _sum: {}, _count: { id: 0 } }), groupBy: jest.fn<any>().mockResolvedValue([]),
      },
      utilisateur: { findMany: jest.fn<any>().mockResolvedValue([]) },
      stockSite: { findMany: jest.fn<any>().mockResolvedValue([]) },
      site: { count: jest.fn<any>().mockResolvedValue(1) },
    };
    service = new RapportsService(prisma);
  });

  it('applique recherche, tri stable, paiement et période à toutes les ventes réglées', async () => {
    await service.getVentesDetail({ dateDebut: '2026-09-01', dateFin: '2026-09-30', search: 'Alice', sortDir: 'asc', page: 2, limit: 25, modePaiement: 'CASH' });
    expect(prisma.vente.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 25, take: 25, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], where: expect.objectContaining({
      modePaiement: 'CASH', statut: { in: ['VALIDE', 'RETOURNEE_PARTIELLE', 'RETOURNEE'] },
      OR: expect.arrayContaining([{ numeroVente: { contains: 'Alice', mode: 'insensitive' } }]),
      createdAt: { gte: new Date('2026-09-01Z'), lte: new Date('2026-09-30T23:59:59.999Z') },
    }) }));
    expect(prisma.vente.aggregate.mock.calls[1][0].where.createdAt.lte.toISOString()).toBe('2026-08-31T23:59:59.999Z');
  });

  it.each([{ page: 0 }, { limit: 201 }, { sortDir: 'invalid' }, { modePaiement: 'invalid' }])('refuse les paramètres invalides %j', async query => {
    await expect(service.getVentesDetail(query as any)).rejects.toThrow();
    expect(prisma.vente.findMany).not.toHaveBeenCalled();
  });

  it('filtre les stocks par site, catégorie et nom ou SKU', async () => {
    await service.getStocksConsolide({ siteId: 'one', categorie: 'Téléphone', search: 'Galaxy' });
    expect(prisma.stockSite.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { siteId: 'one', produit: { categorie: 'Téléphone', OR: [
      { nom: { contains: 'Galaxy', mode: 'insensitive' } }, { sku: { contains: 'Galaxy', mode: 'insensitive' } },
    ] } } }));
  });

  it('conserve les centimes du panier moyen et des valorisations de stock', async () => {
    prisma.vente.aggregate.mockResolvedValue({ _sum: { montantNet: '100.10', remiseFidelite: '0.10', remiseParrainage: '0.20' }, _count: { id: 2 } });
    const sales = await service.getVentesDetail({});
    expect(sales.resume.ticketMoyen).toBe(50.05);
    expect(sales.resume.remisesAccordees).toBe(0.3);
    prisma.stockSite.findMany.mockResolvedValue([{ produitId: 'product', produit: { id: 'product', prixAchat: '0.10' }, site: { id: 'site' }, quantite: 3, seuilAlerte: 1 }]);
    const stocks = await service.getStocksConsolide({});
    expect(stocks.data[0].valeurStock).toBe(0.3);
  });
});
