import { describe, expect, it, jest } from '@jest/globals';
import { Prisma } from '@prisma/client';
import { MlmService } from './mlm.service';

const parent = { id: 'matrix-parent', matricule: 'EBN-P', client: { id: 'parent-client', prenom: 'Paul', nom: 'Parent' } };
const recruiter = { id: 'recruiter', matricule: 'EBN-R', client: { id: 'recruiter-client', prenom: 'Alice', nom: 'Recruteur' } };

function fixture() {
  const member = {
    id: 'member', matricule: 'EBN-1', client: { id: 'client', prenom: 'Serge', nom: 'Mutombo' },
    parrain: recruiter, matrixPosition: { id: 'position', numeroPosition: 2, matrix: { membreId: parent.id, membre: parent } },
    matrices: [], highestLevelAchieved: 0, totalDescendants: 0, _count: { filleuls: 0 },
    portefeuille: { totalGagne: new Prisma.Decimal(0), soldeDisponible: new Prisma.Decimal(0), soldeReserve: new Prisma.Decimal(0) },
  };
  const prisma: any = {
    membre: { findMany: jest.fn<any>().mockResolvedValue([member]), count: jest.fn<any>().mockResolvedValue(1) },
    mlmLevel: { findMany: jest.fn<any>().mockResolvedValue([]) },
    commission: { groupBy: jest.fn<any>().mockResolvedValue([
      { membreId: 'member', statut: 'EN_ATTENTE', _sum: { montant: new Prisma.Decimal('83.33') } },
    ]) },
  };
  prisma.$transaction = jest.fn<any>(async callback => callback(prisma));
  return { member, prisma, service: new MlmService(prisma, {} as never) };
}

describe('MLM members list display contract', () => {
  it('returns a named matrix parent independently of the recruiter', async () => {
    const { service, prisma } = fixture();
    const result = await service.listMembers({});
    expect(result.membres[0]).toMatchObject({ matrixParentId: 'matrix-parent', matrixParent: parent, parrain: recruiter });
    expect(prisma.membre.findMany).toHaveBeenCalledWith(expect.objectContaining({ include: expect.objectContaining({
      matrixPosition: { include: { matrix: { select: { membreId: true, membre: { select: {
        id: true, matricule: true, client: { select: { id: true, prenom: true, nom: true } },
      } } } } } },
    }) }));
  });

  it('exposes pending commissions even before the wallet is credited', async () => {
    const { service } = fixture();
    const result = await service.listMembers({});
    expect(result.membres[0]).toMatchObject({
      commissionSummary: { generatedTotal: '83.33', pendingTotal: '83.33', validatedTotal: '0.00' },
      portefeuille: { totalGagne: 0, soldeDisponible: 0 },
    });
  });

  it('aggregates statuses with decimal precision and excludes cancelled commissions in one page-scoped query', async () => {
    const { service, prisma, member } = fixture();
    prisma.commission.groupBy.mockResolvedValue([
      { membreId: 'member', statut: 'EN_ATTENTE', _sum: { montant: new Prisma.Decimal('83.33') } },
      { membreId: 'member', statut: 'VALIDEE', _sum: { montant: new Prisma.Decimal('40') } },
      { membreId: 'member', statut: 'PAYEE', _sum: { montant: new Prisma.Decimal('133.33') } },
    ]);
    member.portefeuille.totalGagne = new Prisma.Decimal('173.33');
    member.portefeuille.soldeDisponible = new Prisma.Decimal('9');
    const result = await service.listMembers({ page: 2, limit: 20 });
    expect(result.membres[0]).toMatchObject({
      commissionSummary: { generatedTotal: '256.66', pendingTotal: '83.33', validatedTotal: '173.33' },
      portefeuille: { totalGagne: 173.33, soldeDisponible: 9 },
    });
    expect(prisma.commission.groupBy).toHaveBeenCalledTimes(1);
    expect(prisma.commission.groupBy).toHaveBeenCalledWith({
      by: ['membreId', 'statut'],
      where: { membreId: { in: ['member'] }, statut: { not: 'ANNULEE' } },
      _sum: { montant: true },
    });
  });

  it('returns explicit zero totals and a root when no commissions or placement exist', async () => {
    const { service, prisma, member } = fixture();
    member.matrixPosition = null;
    prisma.commission.groupBy.mockResolvedValue([]);
    const result = await service.listMembers({});
    expect(result.membres[0]).toMatchObject({
      matrixParent: null, matrixParentId: null,
      commissionSummary: { generatedTotal: '0.00', pendingTotal: '0.00', validatedTotal: '0.00' },
    });
  });

  it('does not read commissions from outside an empty page', async () => {
    const { service, prisma } = fixture();
    prisma.membre.findMany.mockResolvedValue([]);
    expect((await service.listMembers({})).membres).toEqual([]);
    expect(prisma.commission.groupBy).not.toHaveBeenCalled();
  });

  it('deducts reserved withdrawals from the available amount without changing credited gains', async () => {
    const { service, member } = fixture();
    member.portefeuille.soldeDisponible = new Prisma.Decimal('100');
    member.portefeuille.soldeReserve = new Prisma.Decimal('80');
    member.portefeuille.totalGagne = new Prisma.Decimal('150');
    expect((await service.listMembers({})).membres[0].portefeuille).toMatchObject({
      soldeDisponible: 100, soldeDisponibleRetrait: 20, totalGagne: 150,
    });
  });

  it('reads members, wallet amounts and commission groups through one repeatable-read transaction', async () => {
    const { prisma } = fixture();
    const connection: any = { $transaction: jest.fn<any>(async callback => callback(prisma)) };
    const service = new MlmService(connection, {} as never);
    const result = await service.listMembers({});
    expect(result.membres[0]).toMatchObject({
      commissionSummary: { pendingTotal: '83.33' }, portefeuille: { totalGagne: 0 },
    });
    expect(connection.$transaction).toHaveBeenCalledTimes(1);
    expect(connection.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  });
});
