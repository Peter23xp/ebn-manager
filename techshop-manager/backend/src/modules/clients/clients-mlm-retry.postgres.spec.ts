import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { randomUUID } from 'crypto';
import { PrismaClient, Role } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { initializeMlmLevels } from '../../../prisma/mlm-levels';
import { PrismaService } from '../../prisma/prisma.service';
import { MlmMatrixService } from '../mlm/mlm-matrix.service';
import { MlmPlacementService } from '../mlm/mlm-placement.service';
import { ClientsService } from './clients.service';

const integration = process.env.MLM_TEST_DATABASE_URL ? describe : describe.skip;

integration('MLM activation retries on isolated PostgreSQL', () => {
  let prisma: PrismaService;
  let pool: Pool;
  beforeAll(async () => {
    const url = 'postgresql://postgres@127.0.0.1:55432/mlm_integration';
    if (process.env.MLM_TEST_DATABASE_URL !== url) throw new Error('Only the isolated synthetic database is allowed');
    pool = new Pool({ connectionString: url });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) }) as PrismaService;
    await initializeMlmLevels(prisma);
  });
  afterAll(async () => { await prisma?.$disconnect(); await pool?.end(); });

  it('commits a slow activation beyond 30 seconds and keeps subsequent retries idempotent', async () => {
    const admin = await prisma.utilisateur.create({ data: { nom: 'Slow retry test', telephone: randomUUID(), passwordHash: 'synthetic', role: Role.SUPER_ADMIN } });
    const site = await prisma.site.create({ data: { nom: 'Slow retry synthetic', ville: 'Test' } });
    const client = await prisma.client.create({ data: {
      nom: 'Synthetic', prenom: 'Slow retry', telephone: randomUUID(), statut: 'ACTIF', codeParrain: randomUUID(),
      siteInscriptionId: site.id, createdById: admin.id,
    } });
    const placement = new MlmPlacementService(prisma);
    const lock = placement.lock.bind(placement);
    jest.spyOn(placement, 'lock').mockImplementationOnce(async tx => {
      await lock(tx);
      // Reproduce the production timeout inside a real transaction, on the isolated database only.
      await tx.$executeRaw`SELECT pg_sleep(31)`;
    });
    const matrix = new MlmMatrixService(prisma, {} as never, placement);
    await matrix.onClientActivated(client.id);
    await matrix.onClientActivated(client.id);
    const member = await prisma.membre.findUniqueOrThrow({ where: { clientId: client.id } });
    expect(await prisma.membre.count({ where: { clientId: client.id } })).toBe(1);
    expect(await prisma.portefeuille.count({ where: { membreId: member.id } })).toBe(1);
    expect(await prisma.position.count({ where: { matrix: { membreId: member.id } } })).toBe(4);
  }, 100000);

  it('serializes concurrent retries without duplicating the member, wallet, sale or recruiter commission', async () => {
    const admin = await prisma.utilisateur.create({ data: { nom: 'Retry test', telephone: randomUUID(), passwordHash: 'synthetic', role: Role.SUPER_ADMIN } });
    const site = await prisma.site.create({ data: { nom: 'Retry synthetic', ville: 'Test' } });
    const placement = new MlmPlacementService(prisma);
    const matrix = new MlmMatrixService(prisma, {} as never, placement);
    const service = new ClientsService(prisma, {} as never, {} as never, matrix, {} as never, {} as never, {} as never, placement);
    const createClient = (parrainClientId?: string) => prisma.client.create({ data: {
      nom: 'Synthetic', prenom: 'Retry', telephone: randomUUID(), statut: 'ACTIF', codeParrain: randomUUID(),
      dateActivation: new Date('2026-11-01T10:00:00Z'), siteInscriptionId: site.id, createdById: admin.id, parrainClientId,
    } });
    const recruiter = await createClient();
    await matrix.onClientActivated(recruiter.id);
    const client = await createClient(recruiter.id);
    const sale = await prisma.vente.create({ data: { numeroVente: randomUUID(), clientId: client.id, siteId: site.id,
      agentId: admin.id, modePaiement: 'CASH', montantBrut: 40, montantNet: 40, pointsAttribues: 40 } });
    const actor = { id: admin.id, role: Role.SUPER_ADMIN };
    const results = await Promise.all([
      service.retryMlmActivation(client.id, actor),
      service.retryMlmActivation(client.id, actor),
    ]);
    const member = await prisma.membre.findUniqueOrThrow({ where: { clientId: client.id } });
    const parent = await prisma.membre.findUniqueOrThrow({ where: { clientId: recruiter.id } });
    expect(results.every(result => result.membre?.matricule === member.matricule)).toBe(true);
    expect(member.parrainId).toBe(parent.id);
    expect(await prisma.membre.count({ where: { clientId: client.id } })).toBe(1);
    expect(await prisma.portefeuille.count({ where: { membreId: member.id } })).toBe(1);
    expect(await prisma.position.count({ where: { filleulId: member.id } })).toBe(1);
    expect(await prisma.commission.count({ where: { membreId: parent.id } })).toBe(1);
    expect(await prisma.placementHistory.count({ where: { memberId: member.id, actorId: admin.id } })).toBe(1);
    const countersBefore = await prisma.matrix.findMany({ where: { membreId: parent.id }, orderBy: { mlmLevelId: 'asc' } });
    const positionsBefore = await prisma.position.findMany({ where: { matrix: { membreId: parent.id } }, orderBy: { id: 'asc' } });
    const affected = new Set<string>();
    await prisma.$transaction(tx => placement.recalculateAncestors(tx, [parent.id], member.id, undefined, affected));
    expect(affected.size).toBe(8);
    // Updating all eight counter rows must retain IDs and every frozen financial field.
    expect(await prisma.matrix.findMany({ where: { membreId: parent.id }, orderBy: { mlmLevelId: 'asc' } })).toEqual(countersBefore);
    expect(await prisma.position.findMany({ where: { matrix: { membreId: parent.id } }, orderBy: { id: 'asc' } })).toEqual(positionsBefore);
    await service.retryMlmActivation(client.id, actor);
    expect(await prisma.vente.findMany({ where: { clientId: client.id } })).toEqual([sale]);
    expect(await prisma.commission.count({ where: { membreId: parent.id } })).toBe(1);
    expect(await prisma.client.findUnique({ where: { id: client.id } })).toMatchObject({ codeParrain: client.codeParrain, dateActivation: client.dateActivation });
  }, 60000);
});
