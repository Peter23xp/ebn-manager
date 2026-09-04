import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { StocksService } from './stocks.service';

describe('StocksService — catégories persistées', () => {
  let service: StocksService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      categorie: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
        createMany: jest.fn(),
      },
      produit: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
    };
    service = new StocksService(prisma as never);
  });

  it('seeds the table from distinct product categories when empty', async () => {
    prisma.categorie.findMany.mockResolvedValueOnce([]);
    prisma.produit.findMany.mockResolvedValueOnce([
      { categorie: 'Bio' },
      { categorie: 'Cosmetiques' },
    ]);
    prisma.categorie.createMany.mockResolvedValueOnce({ count: 2 });
    prisma.categorie.findMany.mockResolvedValueOnce([{ nom: 'Bio' }, { nom: 'Cosmetiques' }]);

    const categories = await service.getCategories();

    expect(prisma.categorie.createMany).toHaveBeenCalledWith({
      data: [{ nom: 'Bio' }, { nom: 'Cosmetiques' }],
      skipDuplicates: true,
    });
    expect(categories).toEqual(['Bio', 'Cosmetiques']);
  });

  it('returns empty list when table and products are both empty', async () => {
    prisma.categorie.findMany.mockResolvedValueOnce([]);
    prisma.produit.findMany.mockResolvedValueOnce([]);

    const categories = await service.getCategories();

    expect(prisma.categorie.createMany).not.toHaveBeenCalled();
    expect(categories).toEqual([]);
  });

  it('reads existing categories without re-seeding', async () => {
    prisma.categorie.findMany.mockResolvedValue([{ nom: 'Bio' }]);

    const categories = await service.getCategories();

    expect(prisma.produit.findMany).not.toHaveBeenCalled();
    expect(categories).toEqual(['Bio']);
  });

  it('creates a new category (case-insensitive check)', async () => {
    prisma.categorie.findMany.mockResolvedValueOnce([{ nom: 'Bio' }]);
    prisma.categorie.create.mockResolvedValueOnce({ nom: 'Cosmetiques' });
    prisma.categorie.findMany.mockResolvedValueOnce([{ nom: 'Bio' }, { nom: 'Cosmetiques' }]);

    const res = await service.addCategorie('Cosmetiques');

    expect(prisma.categorie.create).toHaveBeenCalledWith({ data: { nom: 'Cosmetiques' } });
    expect(res.categories).toEqual(['Bio', 'Cosmetiques']);
  });

  it('refuses a duplicate category (case-insensitive)', async () => {
    prisma.categorie.findMany.mockResolvedValueOnce([{ nom: 'Bio' }]);
    await expect(service.addCategorie('bio')).rejects.toThrow();
    expect(prisma.categorie.create).not.toHaveBeenCalled();
  });

  it('refuses to delete a category in use by active products', async () => {
    prisma.produit.count.mockResolvedValueOnce(3);
    await expect(service.deleteCategorie('Bio')).rejects.toThrow();
    expect(prisma.categorie.delete).not.toHaveBeenCalled();
  });

  it('deletes an unused category', async () => {
    prisma.produit.count.mockResolvedValueOnce(0);
    prisma.categorie.findUnique.mockResolvedValueOnce({ id: 'cat-1', nom: 'Vieux' });
    prisma.categorie.delete.mockResolvedValueOnce({});
    prisma.categorie.findMany.mockResolvedValueOnce([]);
    prisma.produit.findMany.mockResolvedValueOnce([]);

    const res = await service.deleteCategorie('Vieux');

    expect(prisma.categorie.delete).toHaveBeenCalledWith({ where: { id: 'cat-1' } });
    expect(res.categories).toEqual([]);
  });
});
