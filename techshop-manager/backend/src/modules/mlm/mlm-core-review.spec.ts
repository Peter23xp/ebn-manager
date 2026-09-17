import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import * as crypto from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import * as ts from 'typescript';
import { MovePlacementDto, SwapPlacementDto } from './dto/matrix-placement.dto';
import { MlmMatrixService } from './mlm-matrix.service';
import { MlmService } from './mlm.service';

describe('core review boundary regressions', () => {
  afterEach(() => jest.restoreAllMocks());

  const operationId = 'dd669fac-51ef-4b6b-ae07-bef24ddfb066';
  const positionId = '2161689e-a728-488a-9ec9-d842a7aa5a41';

  it('accepts and trims legacy move member IDs and the reason', async () => {
    const input = plainToInstance(MovePlacementDto, {
      memberId: ' mem-cli-001 ', newParentId: ' mem-cli-002 ', newPosition: 1,
      expectedPositionId: null, operationId, reason: '  Reequilibrage  ',
    });
    expect(await validate(input)).toEqual([]);
    expect(input).toMatchObject({ memberId: 'mem-cli-001', newParentId: 'mem-cli-002', reason: 'Reequilibrage' });
  });

  it('accepts and trims legacy swap member IDs but keeps UUID operation keys', async () => {
    const input = plainToInstance(SwapPlacementDto, {
      memberId: ' mem-cli-001 ', otherMemberId: ' mem-cli-002 ',
      expectedPositionId: positionId, otherExpectedPositionId: positionId, operationId, reason: '  Echange demande  ',
    });
    expect(await validate(input)).toEqual([]);
    expect(input).toMatchObject({ memberId: 'mem-cli-001', otherMemberId: 'mem-cli-002', reason: 'Echange demande' });
    input.operationId = 'legacy-operation';
    expect((await validate(input)).map(error => error.property)).toEqual(['operationId']);
  });

  it.each([MovePlacementDto, SwapPlacementDto])('rejects blank member references and whitespace-only reasons in %p', async Dto => {
    const input = plainToInstance(Dto as typeof MovePlacementDto, {
      memberId: '   ', newParentId: '   ', otherMemberId: '   ', newPosition: 1,
      expectedPositionId: positionId, otherExpectedPositionId: positionId, operationId, reason: '       ',
    });
    expect((await validate(input)).map(error => error.property)).toEqual(expect.arrayContaining(['memberId', 'reason']));
  });

  it('returns only explicit public client fields for matrix occupants', async () => {
    const client = { id: 'client', nom: 'Public', prenom: 'Profile', telephone: '000', pinHash: 'SYNTHETIC-HASH', pinFailedAttempts: 2 };
    const prisma: any = { matrix: { findUnique: jest.fn<any>(async query => {
      const projection = query.include.positions.include.filleul.include.client;
      const selected = projection === true ? client : Object.fromEntries(Object.keys(projection.select).filter(key => projection.select[key]).map(key => [key, client[key]]));
      return { id: 'matrix', level: { ordre: 1 }, filleulsValides: 1, positions: [{ filleul: { client: selected } }] };
    }) } };
    const result = await new MlmMatrixService(prisma, {} as never).getMemberMatrix('root', 101);
    expect(result.positions[0].filleul.client).toEqual({ id: 'client', nom: 'Public', prenom: 'Profile', telephone: '000' });
  });

  it.each([0, -1, 9, 1.5, NaN])('rejects generation %p with HTTP 400 before database access', async generation => {
    await expect(new MlmMatrixService({} as never, {} as never).getNetworkGeneration('root', generation)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('applies the acquired rank condition to both paginated results and totals', async () => {
    const prisma: any = {
      membre: { findMany: jest.fn<any>().mockResolvedValue([]), count: jest.fn<any>().mockResolvedValue(0) },
      mlmLevel: { findMany: jest.fn<any>().mockResolvedValue([]) },
    };
    prisma.$transaction = jest.fn<any>(async callback => callback(prisma));
    await new MlmService(prisma, {} as never).listMembers({ levelId: 101 });
    const where = { mlmLevelId: 101, matrices: { some: { mlmLevelId: 101, estComplete: true } } };
    expect(prisma.membre.findMany).toHaveBeenCalledWith(expect.objectContaining({ where }));
    expect(prisma.membre.count).toHaveBeenCalledWith({ where });
  });

  function allocationFixture(freeSuffix?: number) {
    const now = new Date();
    const prefix = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const occupied = Array.from({ length: 10000 }, (_, suffix) => suffix).filter(suffix => suffix !== freeSuffix)
      .map(suffix => ({ matricule: prefix + String(suffix).padStart(4, '0') }));
    let locked = false;
    const prisma: any = {
      client: { findUnique: jest.fn<any>().mockResolvedValue({ id: 'client', statut: 'ACTIF' }) },
      mlmLevel: { findFirst: jest.fn<any>().mockResolvedValue({ id: 101 }) },
      membre: {
        findUnique: jest.fn<any>().mockResolvedValue(null),
        findMany: jest.fn<any>(async () => { expect(locked).toBe(true); return occupied; }),
        create: jest.fn<any>(async ({ data }) => {
          if (occupied.some(member => member.matricule === data.matricule)) throw { code: 'P2002', meta: { target: ['matricule'] } };
          return { id: 'member', ...data };
        }),
      },
      portefeuille: { create: jest.fn<any>() }, matrix: { create: jest.fn<any>() },
    };
    prisma.$transaction = jest.fn<any>(async callback => callback(prisma));
    const placement: any = { lock: jest.fn<any>(async () => { locked = true; }) };
    jest.spyOn(crypto, 'randomInt').mockImplementation(() => 0);
    return { prisma, prefix, service: new MlmMatrixService(prisma, {} as never, placement) };
  }

  it('allocates the last free daily matricule under the placement lock without blind retries', async () => {
    const { service, prisma, prefix } = allocationFixture(17);
    await expect(service.onClientActivated('client')).resolves.toBeUndefined();
    expect(prisma.membre.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ matricule: `${prefix}0017` }) }));
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.membre.findMany).toHaveBeenCalledWith({ where: { matricule: { startsWith: prefix } }, select: { matricule: true } });
  });

  it('reports daily matricule exhaustion explicitly without attempting an insert', async () => {
    const { service, prisma } = allocationFixture();
    await expect(service.onClientActivated('client')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.membre.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('initializes DEMO ranks only on creation (AST guard; never executes seed)', () => {
    const source = ts.createSourceFile('seed.ts', readFileSync(join(process.cwd(), 'prisma/seed.ts'), 'utf8'), ts.ScriptTarget.Latest, true);
    const upserts: ts.ObjectLiteralExpression[] = [];
    function visit(node: ts.Node) {
      if (ts.isCallExpression(node) && node.expression.getText(source) === 'prisma.membre.upsert') upserts.push(node.arguments[0] as ts.ObjectLiteralExpression);
      ts.forEachChild(node, visit);
    }
    visit(source);
    expect(upserts.length).toBeGreaterThan(0);
    for (const upsert of upserts) {
      const fields = (branch: string) => ((upsert.properties.find(property => property.name?.getText(source) === branch) as ts.PropertyAssignment).initializer as ts.ObjectLiteralExpression).properties.map(property => property.name?.getText(source));
      expect(fields('create')).toContain('mlmLevelId');
      expect(fields('update')).not.toContain('mlmLevelId');
      expect(fields('update')).not.toContain('highestLevelAchieved');
    }
  });

  it('core round2 preserves historical progress without a wallet and propagates unrelated failures', async () => {
    const prisma: any = {
      membre: { findUnique: jest.fn<any>().mockResolvedValue({
        id: 'historic', level: { id: 101, ordre: 1 }, highestLevelAchieved: 0,
        matrices: [], filleuls: [], commissionsRecues: [], bonusAttribues: [], bonusRetraites: [], salairesVerses: [], promotions: [],
        _count: { filleuls: 0 },
      }) },
      mlmLevel: { findMany: jest.fn<any>().mockResolvedValue([{ id: 101, ordre: 1, nom: 'Builder' }]) },
    };
    const wallet: any = { getWallet: jest.fn<any>().mockRejectedValue(new NotFoundException('Portefeuille introuvable')) };
    const service = new MlmService(prisma, wallet);
    const result = await service.getMemberProgress('historic');
    expect(result.portefeuille).toBeNull();
    expect(result.progression.currentLevel).toBeNull();
    expect(result.financialSummary).toBeUndefined();
    expect(result.reinvestLots).toEqual([]);
    wallet.getWallet.mockRejectedValueOnce(new Error('Database unavailable'));
    await expect(service.getMemberProgress('historic')).rejects.toThrow('Database unavailable');
    prisma.membre.findUnique.mockResolvedValueOnce(null);
    await expect(service.getMemberProgress('missing')).rejects.toBeInstanceOf(NotFoundException);
    expect(wallet.getWallet).toHaveBeenCalledTimes(2);
  });

  it('uses one wallet snapshot for progress balances, summary and lots', async () => {
    const snapshot = {
      soldeDisponible: 40, totalGagne: 40,
      financialSummary: { releasedAmount: '16.00', heldAmount: '0.00' },
      reinvestLots: [{ id: 'released-lot', status: 'RELEASED', amount: '16.00' }],
    };
    const prisma: any = {
      membre: { findUnique: jest.fn<any>().mockResolvedValue({
        id: 'member', level: { id: 101, ordre: 1 }, highestLevelAchieved: 0,
        matrices: [], filleuls: [], commissionsRecues: [], bonusAttribues: [], bonusRetraites: [], salairesVerses: [], promotions: [],
        _count: { filleuls: 0 }, portefeuille: { soldeDisponible: 24, totalGagne: 40 },
      }) },
      mlmLevel: { findMany: jest.fn<any>().mockResolvedValue([{ id: 101, ordre: 1, nom: 'Builder' }]) },
      reinvestLote: { findMany: jest.fn<any>().mockResolvedValue([{ id: 'stale-lot', status: 'HOLD_PERIOD' }]) },
    };
    const wallet: any = {
      getWallet: jest.fn<any>().mockResolvedValue(snapshot),
      getFinancialSummary: jest.fn<any>().mockResolvedValue({ releasedAmount: '0.00', heldAmount: '16.00' }),
    };
    const result = await new MlmService(prisma, wallet).getMemberProgress('member');
    expect(result.portefeuille).toEqual({ soldeDisponible: 40, totalGagne: 40 });
    expect(result.financialSummary).toEqual(snapshot.financialSummary);
    expect(result.reinvestLots).toEqual(snapshot.reinvestLots);
    expect(wallet.getWallet).toHaveBeenCalledTimes(1);
    expect(wallet.getWallet).toHaveBeenCalledWith('member');
    expect(wallet.getFinancialSummary).not.toHaveBeenCalled();
    expect(prisma.reinvestLote.findMany).not.toHaveBeenCalled();
  });
});
