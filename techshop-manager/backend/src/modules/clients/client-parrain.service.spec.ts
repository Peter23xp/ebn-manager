import { describe, expect, it, jest } from '@jest/globals';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { ClientParrainService } from './client-parrain.service';

const actor = { id: 'admin', role: 'SUPER_ADMIN' as const };
const input = { codeParrain: 'PARENT', reason: 'Correction du parrain manquant' };

function fixture(statut = 'EN_COURS', parentStatut = 'ACTIF') {
  const child = { id: 'child', statut, parrainClientId: null, siteInscriptionId: 'site', membre: null, filleulClaim: null };
  const parent = { id: 'parent', statut: parentStatut, telephone: '+243900000000', prenom: 'Paul', nom: 'Parrain' };
  let assignment: any = null;
  const tx: any = {
    client: {
      findUnique: jest.fn<any>().mockResolvedValue(child),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
    },
    clientParrainAttribution: {
      findUnique: jest.fn<any>(async () => assignment),
      create: jest.fn<any>(async ({ data }) => { assignment = { id: 'assignment', ...data, actor: { id: 'admin', nom: 'Admin' }, parrain: parent }; return assignment; }),
    },
    parrainClaim: { create: jest.fn<any>() },
    membre: { findUnique: jest.fn<any>().mockResolvedValue(null) },
    $queryRaw: jest.fn<any>().mockResolvedValue([]),
  };
  const prisma: any = { $transaction: jest.fn<any>(async callback => callback(tx)) };
  const matrix: any = { onClientActivatedInTx: jest.fn<any>() };
  const placement: any = { lock: jest.fn<any>() };
  const claims: any = { resolveParrain: jest.fn<any>().mockResolvedValue(parent) };
  return { child, parent, tx, prisma, matrix, claims, placement, service: new ClientParrainService(prisma, matrix, claims, placement) };
}

describe('Client recruiter attribution', () => {
  it('stores an onboarding recruiter and actor history without initializing a member', async () => {
    const { service, tx, matrix } = fixture();
    tx.membre.findUnique.mockResolvedValue({ statut: 'ACTIF' });
    expect(await service.assign('child', input, actor)).toMatchObject({ clientId: 'child', parrainClientId: 'parent', actorId: 'admin', reason: input.reason });
    expect(tx.client.updateMany).toHaveBeenCalledWith({ where: { id: 'child', parrainClientId: null }, data: { parrainClientId: 'parent' } });
    expect(matrix.onClientActivatedInTx).not.toHaveBeenCalled();
    expect(tx.parrainClaim.create).not.toHaveBeenCalled();
  });

  it('uses existing activation/placement within the assignment transaction for active clients', async () => {
    const { service, tx, matrix } = fixture('ACTIF');
    await service.assign('child', input, actor);
    expect(matrix.onClientActivatedInTx).toHaveBeenCalledWith(tx, 'parent', undefined, 'admin');
    expect(matrix.onClientActivatedInTx).toHaveBeenCalledWith(tx, 'child', 'parent', 'admin');
  });

  it('initializes a missing active recruiter before the child is activated', async () => {
    const { service, tx, matrix } = fixture('EN_COURS');
    await service.assign('child', input, actor);
    expect(matrix.onClientActivatedInTx).toHaveBeenCalledTimes(1);
    expect(matrix.onClientActivatedInTx).toHaveBeenCalledWith(tx, 'parent', undefined, 'admin');
    expect(tx.parrainClaim.create).not.toHaveBeenCalled();
  });

  it('creates an existing-workflow claim when the recruiter is not activated', async () => {
    const { service, tx, matrix } = fixture('ACTIF', 'EN_COURS');
    await service.assign('child', input, actor);
    expect(tx.parrainClaim.create).toHaveBeenCalledWith({ data: { filleulClientId: 'child', parrainClientId: 'parent', telephoneParrainSaisi: 'PARENT', statut: 'EN_ATTENTE' } });
    expect(matrix.onClientActivatedInTx).not.toHaveBeenCalled();
  });

  it.each(['AGENT', 'CLIENT', 'FORMATEUR', 'DIRECTEUR_REGIONAL'])('rejects role %s before database access', async role => {
    const { service, prisma } = fixture();
    await expect(service.assign('child', input, { id: 'user', role: role as any })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a manager outside their site for writes and history', async () => {
    const { service, tx } = fixture();
    const manager = { id: 'manager', role: 'GERANT' as const, siteId: 'elsewhere' };
    await expect(service.assign('child', input, manager)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.getAttribution('child', manager)).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.client.updateMany).not.toHaveBeenCalled();
    expect(tx.clientParrainAttribution.findUnique).not.toHaveBeenCalled();
  });

  it.each(['client', 'member', 'claim'])('does not overwrite existing %s recruiter information', async source => {
    const { service, child, tx } = fixture();
    if (source === 'client') child.parrainClientId = 'original';
    if (source === 'member') child.membre = { parrainId: 'original' } as any;
    if (source === 'claim') child.filleulClaim = { parrainClientId: 'original' } as any;
    await expect(service.assign('child', input, actor)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.client.updateMany).not.toHaveBeenCalled();
  });

  it('rejects self-recruitment before writing', async () => {
    const { service, parent, tx } = fixture();
    parent.id = 'child';
    await expect(service.assign('child', input, actor)).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.client.updateMany).not.toHaveBeenCalled();
  });

  it('rejects an inactive MLM recruiter even if the client account is active', async () => {
    const { service, tx } = fixture('ACTIF');
    tx.membre.findUnique.mockResolvedValue({ statut: 'SUSPENDU' });
    await expect(service.assign('child', input, actor)).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.client.updateMany).not.toHaveBeenCalled();
  });

  it('does not reinitialize an existing recruiter when assigning an active child', async () => {
    const { service, tx, matrix } = fixture('ACTIF');
    tx.membre.findUnique.mockResolvedValue({ statut: 'ACTIF' });
    await service.assign('child', input, actor);
    expect(matrix.onClientActivatedInTx).toHaveBeenCalledTimes(1);
    expect(matrix.onClientActivatedInTx).toHaveBeenCalledWith(tx, 'child', 'parent', 'admin');
  });

  it('rejects recruitment or matrix cycles before writing', async () => {
    const { service, tx } = fixture();
    tx.$queryRaw.mockResolvedValue([{ id: 'child' }]);
    await expect(service.assign('child', input, actor)).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.client.updateMany).not.toHaveBeenCalled();
  });

  it('replays the same attribution without placing twice, but refuses a different reason', async () => {
    const { service, matrix, child } = fixture('ACTIF');
    const first = await service.assign('child', input, actor);
    child.parrainClientId = 'parent';
    expect(await service.assign('child', input, actor)).toEqual(first);
    expect(matrix.onClientActivatedInTx).toHaveBeenCalledTimes(2);
    await expect(service.assign('child', { ...input, reason: 'Autre demande' }, actor)).rejects.toBeInstanceOf(ConflictException);
  });
});
