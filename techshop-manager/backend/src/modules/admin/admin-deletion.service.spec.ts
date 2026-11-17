import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AdminDeletionService } from './admin-deletion.service';

const MODELS = [
  'site', 'utilisateur', 'client', 'produit', 'vente', 'mouvementStock', 'transfertStock', 'onboardingEtape',
  'stockSite', 'clientParrainAttribution', 'retour', 'withdrawalRequest', 'placementHistory', 'membre',
  'parrainClaim', 'ligneVente', 'ligneRetour', 'exportJob',
] as const;

function prismaMock() {
  const db: Record<string, any> = {};
  for (const m of MODELS) {
    db[m] = {
      findUnique: jest.fn(), count: (jest.fn() as any).mockResolvedValue(0), delete: (jest.fn() as any).mockResolvedValue({}),
      deleteMany: (jest.fn() as any).mockResolvedValue({ count: 0 }), update: (jest.fn() as any).mockResolvedValue({}),
    };
  }
  db.$transaction = jest.fn((fn: any) => fn(db));
  return db as any;
}

const admin = { id: 'admin-1' };

describe('AdminDeletionService', () => {
  let db: ReturnType<typeof prismaMock>;
  let service: AdminDeletionService;

  beforeEach(() => {
    db = prismaMock();
    service = new AdminDeletionService(db);
  });

  it('refuse un type inconnu (ex. vente, pièce comptable)', () => {
    expect(() => service.parseEntity('vente')).toThrow(BadRequestException);
    expect(service.parseEntity('client')).toBe('client');
  });

  it('supprime un client sans historique avec ses étapes non payées', async () => {
    db.client.findUnique.mockResolvedValue({ prenom: 'Awa', nom: 'Test', statut: 'EN_COURS' });
    await expect(service.remove('client', 'c1', admin)).resolves.toEqual({ deleted: true, label: 'Awa Test' });
    expect(db.onboardingEtape.deleteMany).toHaveBeenCalledWith({ where: { clientId: 'c1' } });
    expect(db.parrainClaim.deleteMany).toHaveBeenCalledWith({ where: { filleulClientId: 'c1' } });
    expect(db.client.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
  });

  it('bloque la suppression d’un client qui a des ventes et un compte MLM, et propose l’archivage', async () => {
    db.client.findUnique.mockResolvedValue({ prenom: 'Awa', nom: 'Test', statut: 'ACTIF' });
    db.vente.count.mockResolvedValue(3);
    db.membre.count.mockResolvedValue(1);

    const impact = await service.impact('client', 'c1', admin);
    expect(impact).toMatchObject({ canDelete: false, fallback: 'ARCHIVER', alreadyInactive: false });
    expect(impact.blockers.map((b) => [b.key, b.count])).toEqual([['ventes', 3], ['membre', 1]]);

    await expect(service.remove('client', 'c1', admin)).rejects.toBeInstanceOf(ConflictException);
    expect(db.client.delete).not.toHaveBeenCalled();
  });

  it('archive un client au lieu de le supprimer', async () => {
    db.client.findUnique.mockResolvedValue({ prenom: 'Awa', nom: 'Test', statut: 'ACTIF' });
    await service.deactivate('client', 'c1', admin);
    expect(db.client.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { statut: 'ARCHIVE' } });
  });

  it('interdit de supprimer ou désactiver son propre compte', async () => {
    db.utilisateur.findUnique.mockResolvedValue({ nom: 'Moi', role: 'SUPER_ADMIN', actif: true });
    const impact = await service.impact('utilisateur', admin.id, admin);
    expect(impact.canDelete).toBe(false);
    await expect(service.remove('utilisateur', admin.id, admin)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.deactivate('utilisateur', admin.id, admin)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('garde au moins un super administrateur actif', async () => {
    db.utilisateur.findUnique.mockResolvedValue({ nom: 'Autre admin', role: 'SUPER_ADMIN', actif: true });
    db.utilisateur.count.mockResolvedValue(0);
    await expect(service.remove('utilisateur', 'u2', admin)).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.utilisateur.delete).not.toHaveBeenCalled();
  });

  it('bloque un produit encore en stock', async () => {
    db.produit.findUnique.mockResolvedValue({ nom: 'Savon', sku: 'TSG-COS-1', actif: true });
    db.stockSite.count.mockResolvedValue(2);
    const impact = await service.impact('produit', 'p1', admin);
    expect(impact.blockers).toEqual([{ key: 'stock', label: 'site(s) où il reste du stock', count: 2 }]);
  });

  it('transforme une contrainte de clé étrangère imprévue en refus lisible', async () => {
    db.site.findUnique.mockResolvedValue({ nom: 'Goma', ville: 'Goma', actif: true });
    db.site.delete.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('fk', { code: 'P2003', clientVersion: 'test' }));
    await expect(service.remove('site', 's1', admin)).rejects.toBeInstanceOf(ConflictException);
  });
});
