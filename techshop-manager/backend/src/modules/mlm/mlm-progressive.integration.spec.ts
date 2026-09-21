import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { randomUUID } from 'crypto';
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { initializeMlmLevels } from '../../../prisma/mlm-levels';
import { PrismaService } from '../../prisma/prisma.service';
import { MlmMatrixService } from './mlm-matrix.service';
import { MlmPlacementService } from './mlm-placement.service';
import { MlmProgressiveService } from './mlm-progressive.service';
import { readProgressiveSummaries } from './mlm-progressive-summary';

const integration = process.env.MLM_TEST_DATABASE_URL ? describe : describe.skip;

integration('progressive commissions on isolated PostgreSQL', () => {
  let prisma: PrismaService;
  let pool: Pool;
  let matrix: MlmMatrixService;
  let placement: MlmPlacementService;
  let adminId: string;
  let siteId: string;
  beforeAll(async () => {
    const url = 'postgresql://postgres@127.0.0.1:55432/mlm_integration';
    if (process.env.MLM_TEST_DATABASE_URL !== url) throw new Error('Only the isolated synthetic database is allowed');
    pool = new Pool({ connectionString: url });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) }) as PrismaService;
    await initializeMlmLevels(prisma);
    adminId = (await prisma.utilisateur.create({ data: { nom: 'Progressive test', telephone: randomUUID(), passwordHash: 'synthetic', role: 'SUPER_ADMIN' } })).id;
    siteId = (await prisma.site.create({ data: { nom: 'Progressive synthetic', ville: 'Test' } })).id;
    placement = new MlmPlacementService(prisma);
    matrix = new MlmMatrixService(prisma, {} as never, placement);
  }, 60000);
  afterAll(async () => { await prisma?.$disconnect(); await pool?.end(); });

  async function activate(parent?: string) {
    const client = await prisma.client.create({ data: { nom: 'Synthetic', prenom: 'Progressive', telephone: randomUUID(), statut: 'ACTIF', siteInscriptionId: siteId, createdById: adminId } });
    await matrix.onClientActivated(client.id, parent);
    return prisma.membre.findUniqueOrThrow({ where: { clientId: client.id } });
  }

  it('earns all four Builder tranches, not a second full completion payment', async () => {
    const root = await activate();
    for (let position = 1; position <= 4; position++) {
      await activate(root.id);
      const commissions = await prisma.commission.findMany({ where: { membreId: root.id, level: { ordre: 1 } }, orderBy: { progressTo: 'asc' } });
      expect(commissions).toHaveLength(position);
      expect(commissions.every(row => row.montant.eq(10) && row.montantSysteme.eq(6) && row.montantRetour.eq(4))).toBe(true);
    }
    expect(await prisma.promotion.count({ where: { membreId: root.id } })).toBe(1);
    expect((await prisma.portefeuille.findUniqueOrThrow({ where: { membreId: root.id } })).totalGagne.toFixed(2)).toBe('0.00');
  }, 60000);

  it('earns generation two while the first is incomplete and keeps the recruiter', async () => {
    const root = await activate();
    const child = await activate(root.id);
    await activate(child.id);
    expect(await prisma.commission.count({ where: { membreId: root.id, level: { ordre: 2 } } })).toBe(1);
    expect(await prisma.promotion.count({ where: { membreId: root.id } })).toBe(0);
    expect((await prisma.membre.findUniqueOrThrow({ where: { id: child.id } })).parrainId).toBe(root.id);
  }, 30000);

  it('does not reward transient generation counts before an automatic ascent', async () => {
    const grandparent = await activate();
    const parent = await activate(grandparent.id);
    const fast = await activate(parent.id);
    for (let position = 0; position < 3; position++) await activate(fast.id);
    const before = await prisma.commission.aggregate({ where: { membreId: parent.id, level: { ordre: 2 } }, _sum: { montant: true } });
    await activate(fast.id);
    const after = await prisma.commission.aggregate({ where: { membreId: parent.id, level: { ordre: 2 } }, _sum: { montant: true } });
    expect(before._sum.montant?.gt(0)).toBe(true);
    expect(after._sum.montant?.toFixed(2)).toBe(before._sum.montant?.toFixed(2));
    const final = await prisma.membre.findUniqueOrThrow({ where: { id: fast.id }, include: { matrixPosition: { include: { matrix: true } } } });
    expect(final.matrixPosition.matrix.membreId).toBe(grandparent.id);
    expect(final.parrainId).toBe(parent.id);
  }, 60000);

  it('serializes concurrent replayed accounting and preserves pending cancellation rights', async () => {
    const root = await activate();
    await activate(root.id);
    const builder = await prisma.matrix.findFirstOrThrow({ where: { membreId: root.id, level: { ordre: 1 } } });
    const service = new MlmProgressiveService();
    await prisma.commission.updateMany({ where: { matrixId: builder.id }, data: { statut: 'ANNULEE' } });
    await Promise.all(Array.from({ length: 3 }, () => prisma.$transaction(tx => service.account(tx, builder.id, { id: 'replayed', origin: 'CATCH_UP' }))));
    expect(await prisma.commission.count({ where: { matrixId: builder.id } })).toBe(1);
    expect((await prisma.matrix.findUniqueOrThrow({ where: { id: builder.id } })).commissionAccountedPositions).toBe(1);
  }, 30000);

  it('reports an early corrupted tranche and leaves valid wallet data readable', async () => {
    const root = await activate();
    await activate(root.id);
    await activate(root.id);
    const rows = await prisma.commission.findMany({ where: { membreId: root.id }, orderBy: { progressTo: 'asc' } });
    await prisma.commission.update({ where: { id: rows[0].id }, data: { montant: 20, montantSysteme: 12, montantRetour: 8 } });
    try {
      const summaries = await prisma.$transaction(tx => readProgressiveSummaries(tx, root.id));
      expect(summaries[0]).toMatchObject({ accountedPositions: null, remainingTotal: null, suspendedReason: expect.any(String), generatedTotal: '30.00' });
      expect(summaries[1]).toMatchObject({ remainingTotal: '83.33', suspendedReason: null });
      await expect(prisma.$transaction(tx => new MlmProgressiveService().account(tx, rows[0].matrixId, { id: 'bad-replay', origin: 'CATCH_UP' }))).rejects.toThrow();
    } finally {
      await prisma.commission.update({ where: { id: rows[0].id }, data: { montant: rows[0].montant, montantSysteme: rows[0].montantSysteme, montantRetour: rows[0].montantRetour } });
    }
  }, 30000);

  it('recognizes full legacy budgets beyond one hundred unrelated old commissions', async () => {
    const root = await activate();
    const levels = await prisma.mlmLevel.findMany({ orderBy: { ordre: 'asc' } });
    const builder = await prisma.matrix.findFirstOrThrow({ where: { membreId: root.id, mlmLevelId: levels[0].id } });
    await prisma.commission.createMany({ data: Array.from({ length: 101 }, (_, index) => ({
      membreId: root.id, filleulId: root.id, mlmLevelId: levels[1].id,
      montant: 1, montantSysteme: 1, montantRetour: 0, referenceId: `old:${root.id}:${index}`, description: 'Synthetic legacy anomaly',
    })) });
    const legacy = await prisma.commission.create({ data: { membreId: root.id, filleulId: root.id, mlmLevelId: levels[0].id, matrixId: builder.id,
      montant: 40, montantSysteme: 24, montantRetour: 16, referenceId: `generation:${root.id}:${levels[0].id}`, description: 'Synthetic legacy full' } });
    await prisma.promotion.create({ data: { membreId: root.id, niveauAvantId: 0, niveauApresId: levels[0].id, commissionVersee: 0, declencheParId: root.id } });
    if (levels[0].bonusDescription) await prisma.bonusAttribue.create({ data: { membreId: root.id, mlmLevelId: levels[0].id, description: levels[0].bonusDescription } });
    const summaries = await prisma.$transaction(tx => readProgressiveSummaries(tx, root.id));
    expect(summaries[0]).toMatchObject({ accountedPositions: 4, budgetTotal: '40.00', remainingTotal: '0.00', suspendedReason: null });
    expect(summaries[1]).toMatchObject({ remainingTotal: null, suspendedReason: expect.any(String) });
    await prisma.commission.update({ where: { id: legacy.id }, data: { matrixId: null, montantRetour: 15 } });
    const malformed = await prisma.$transaction(tx => readProgressiveSummaries(tx, root.id));
    expect(malformed[0]).toMatchObject({ budgetTotal: null, remainingTotal: null, suspendedReason: expect.any(String) });
  }, 30000);
});
