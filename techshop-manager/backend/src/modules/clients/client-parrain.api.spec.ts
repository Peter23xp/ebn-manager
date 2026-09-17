import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';
import { ClientParrainService } from './client-parrain.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';

const request = require('supertest');

describe('Client recruiter attribution HTTP boundaries', () => {
  let app: INestApplication;
  const jwt = new JwtService({ secret: 'assignment-test-only' });
  const child = { id: 'client', statut: 'EN_COURS', siteInscriptionId: 'site', parrainClientId: null, membre: null, filleulClaim: null };
  const create = jest.fn<any>(async ({ data }) => ({ id: 'history', ...data }));
  const tx: any = {
    client: { findUnique: async () => child, updateMany: async () => ({ count: 1 }) },
    clientParrainAttribution: { findUnique: async () => null, create },
    membre: { findUnique: async () => ({ statut: 'ACTIF' }) },
    $queryRaw: async () => [],
  };
  const prisma: any = {
    $transaction: async callback => callback(tx),
    client: { findUnique: async () => ({ id: 'client-user', statut: 'ACTIF', prenom: 'Client', nom: 'Test' }) },
    utilisateur: { findUnique: async ({ where }) => ({ id: where.id, nom: 'Staff', role: where.id === 'foreign-manager' ? 'GERANT' : where.id, siteId: where.id === 'foreign-manager' ? 'foreign' : 'site', actif: true }) },
  };
  const claims: any = { resolveParrain: async () => ({ id: 'parent', statut: 'ACTIF' }) };
  const placement: any = { lock: async () => {} };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ClientsController],
      providers: [JwtStrategy, RolesGuard,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: () => 'assignment-test-only' } },
        { provide: ClientsService, useValue: {} },
        { provide: ClientParrainService, useValue: new ClientParrainService(prisma, {} as never, claims, placement) },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
  });
  beforeEach(() => { create.mockClear(); });
  afterAll(async () => { await app?.close(); });

  const body = { codeParrain: 'PARENT', reason: 'Correction du dossier' };
  const token = (role: string) => jwt.sign({ sub: role, role });

  it.each([undefined, 'invalid', jwt.sign({ sub: 'SUPER_ADMIN' }, { expiresIn: -1 })])('requires a valid JWT (%s)', async accessToken => {
    const call = request(app.getHttpServer()).post('/clients/client/parrain').send(body);
    if (accessToken) call.set('Authorization', `Bearer ${accessToken}`);
    await call.expect(401);
    expect(create).not.toHaveBeenCalled();
  });

  it.each(Object.values(Role).filter(role => !['GERANT', 'SUPER_ADMIN'].includes(role)))('denies attribution and history to %s', async role => {
    await request(app.getHttpServer()).post('/clients/client/parrain').set('Authorization', `Bearer ${token(role)}`).send(body).expect(403);
    await request(app.getHttpServer()).get('/clients/client/parrain/attribution').set('Authorization', `Bearer ${token(role)}`).expect(403);
    expect(create).not.toHaveBeenCalled();
  });

  it('denies a manager outside their site even if the token forges a site and role', async () => {
    const forged = jwt.sign({ sub: 'foreign-manager', role: 'SUPER_ADMIN', siteId: 'site' });
    await request(app.getHttpServer()).post('/clients/client/parrain').set('Authorization', `Bearer ${forged}`).send(body).expect(403);
    await request(app.getHttpServer()).get('/clients/client/parrain/attribution').set('Authorization', `Bearer ${forged}`).expect(403);
  });

  it.each(['GERANT', 'SUPER_ADMIN'])('uses authenticated actor %s and trims input', async role => {
    const response = await request(app.getHttpServer()).post('/clients/client/parrain').set('Authorization', `Bearer ${token(role)}`)
      .send({ codeParrain: ' PARENT ', reason: ' Correction du dossier ' }).expect(201);
    expect(response.body).toMatchObject({ actorId: role, clientId: 'client', parrainClientId: 'parent', reason: 'Correction du dossier' });
  });

  it.each([{}, { ...body, actorId: 'forged' }, { ...body, codeParrain: '  ' }, { ...body, codeParrain: 123 },
    { ...body, reason: ' ' }, { ...body, reason: 'x'.repeat(501) }, { ...body, clientId: 'elsewhere' },
  ])('rejects malformed or forged input %j', async input => {
    await request(app.getHttpServer()).post('/clients/client/parrain').set('Authorization', `Bearer ${token('SUPER_ADMIN')}`).send(input).expect(400);
    expect(create).not.toHaveBeenCalled();
  });

  it('returns no attribution before an assignment', async () => {
    const response = await request(app.getHttpServer()).get('/clients/client/parrain/attribution').set('Authorization', `Bearer ${token('SUPER_ADMIN')}`).expect(200);
    expect(response.text).toBe('');
  });
});
