import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { BadRequestException, INestApplication } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { MlmClaimService } from '../mlm/mlm-claim.service';
import { PortalController } from './portal.controller';
import { PortalService } from './portal.service';

const request = require('supertest');

describe('Portal network tree route', () => {
  let app: INestApplication;
  const jwt = new JwtService({ secret: 'portal-tree-test-only' });
  const tree = { id: 'requested-member', children: [], hasMore: false };
  const getNetworkTree = jest.fn<any>().mockResolvedValue(tree);

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [PortalController],
      providers: [
        JwtStrategy,
        RolesGuard,
        { provide: ConfigService, useValue: { get: (key: string) => key === 'JWT_SECRET' ? 'portal-tree-test-only' : undefined } },
        { provide: PrismaService, useValue: {
          client: { findUnique: async ({ where }) => ({ id: where.id, prenom: 'Test', nom: 'Client', statut: 'ACTIF' }) },
          utilisateur: { findUnique: async ({ where }) => ({ id: where.id, role: where.id, actif: true }) },
        } },
        { provide: PortalService, useValue: { getNetworkTree } },
        { provide: MlmClaimService, useValue: {} },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => { await app?.close(); });

  it('registers JWT and role guards with CLIENT metadata only on the new route', () => {
    const handler = PortalController.prototype.getNetworkTree;
    expect(handler).toEqual(expect.any(Function));
    expect(Reflect.getMetadata(GUARDS_METADATA, PortalController)).toContain(JwtAuthGuard);
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toContain(RolesGuard);
    expect(Reflect.getMetadata('roles', handler)).toEqual(['CLIENT']);
    expect(Reflect.getMetadata('roles', PortalController)).toBeUndefined();
  });

  it.each([undefined, 'invalid', jwt.sign({ sub: 'client', role: 'CLIENT' }, { expiresIn: -1 })])(
    'rejects an absent, invalid or expired JWT (%s)', async token => {
      const call = request(app.getHttpServer()).get('/api/v1/portal/network/requested-member/tree');
      if (token) call.set('Authorization', `Bearer ${token}`);
      await call.expect(401);
    },
  );

  it.each(Object.values(Role).filter(role => role !== 'CLIENT'))('rejects the non-client role %s', async role => {
    await request(app.getHttpServer()).get('/api/v1/portal/network/requested-member/tree')
      .set('Authorization', `Bearer ${jwt.sign({ sub: role, role })}`).expect(403);
  });

  it.each([undefined, '0', '1', '2'])('uses only JWT user.id and parses depth %s', async depth => {
    getNetworkTree.mockClear();
    const response = await request(app.getHttpServer()).get('/api/v1/portal/network/requested-member/tree')
      .query({ clientId: 'forged-client', userId: 'forged-user', ...(depth === undefined ? {} : { depth }) })
      .set('Authorization', `Bearer ${jwt.sign({ sub: 'authenticated-client', role: 'CLIENT' })}`).expect(200);
    expect(response.body).toEqual(tree);
    expect(getNetworkTree).toHaveBeenCalledWith('authenticated-client', 'requested-member', depth === undefined ? 2 : Number(depth));
  });

  it.each(['1.5', 'NaN', 'Infinity', 'abc', '', '2junk', ['1', '2']])('rejects malformed depth %j before calling the service', async depth => {
    getNetworkTree.mockClear();
    await request(app.getHttpServer()).get('/api/v1/portal/network/requested-member/tree')
      .query({ depth }).set('Authorization', `Bearer ${jwt.sign({ sub: 'client', role: 'CLIENT' })}`).expect(400);
    expect(getNetworkTree).not.toHaveBeenCalled();
  });
});

describe('Portal network tree depth validation', () => {
  it.each([-1, 3, 20, 1.5, NaN, Infinity, -Infinity, null, '2'])('rejects depth %s without reading or creating data', async depth => {
    const prisma = { $transaction: jest.fn<any>() };
    const service = new PortalService(prisma as never, {} as never, {} as never);
    await expect(service.getNetworkTree('client', 'member', depth as number)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
