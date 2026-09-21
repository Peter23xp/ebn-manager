import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ForbiddenException, HttpException, NotFoundException } from '@nestjs/common';
import { EtapeOnboarding, ModePaiement, Prisma, Role, StatutClient, StatutEtape } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { StaffActor } from '../../common/access/staff-access';
import { ParrainResolution } from '../mlm/mlm-claim.service';
import { ClientsService } from './clients.service';
import { CreateClientDraftDto } from './dto/client-draft.dto';

const draft: CreateClientDraftDto = {
  prenom: 'Client', nom: 'Test', telephone: '+243999000101', siteId: 'site-a',
};
const agent: StaffActor = { id: 'agent-a', role: Role.AGENT, siteId: 'site-a' };
const recruiter: ParrainResolution = {
  id: 'parent-1', prenom: 'Parent', nom: 'Test', telephone: '+243999000102', statut: StatutClient.EN_COURS,
};

function draftStorage() {
  const rows = { clients: [] as any[], steps: [] as any[], claims: [] as any[] };
  const writes = { clients: [] as any[], steps: [] as any[], claims: [] as any[] };
  const controls = { failWrite: '', failure: new Error('storage write failed') };
  const selectRow = (row: any, select: any) => row && select
    ? Object.fromEntries(Object.keys(select).map(key => [key, row[key]])) : row ?? null;
  const matches = (row: any, where: any): boolean => Object.entries(where).every(([key, value]) =>
    key === 'OR' ? (value as any[]).some(condition => matches(row, condition)) : row[key] === value);
  const hydrate = (row: any) => ({
    ...row,
    siteInscription: { id: row.siteInscriptionId, nom: row.siteInscriptionId },
    createdBy: { id: row.createdById, nom: row.createdById },
    onboardingEtapes: rows.steps.filter(step => step.clientId === row.id),
    membre: null, parrainClient: row.parrainClientId ? recruiter : null,
    filleulClaim: rows.claims.find(claim => claim.filleulClientId === row.id) ?? null,
    ventes: [],
  });
  const forbiddenWrite = jest.fn<any>(async () => { throw new Error('write outside draft transaction'); });
  const forbiddenEffect = jest.fn<any>(async () => { throw new Error('unexpected financial, stock or MLM effect'); });
  const prisma = {
    client: {
      findFirst: jest.fn<(query: any) => Promise<any>>(async ({ where, select, orderBy }) => {
        const candidates = rows.clients.filter(row => matches(row, where));
        if (orderBy?.id === 'asc') candidates.sort((first, second) => first.id.localeCompare(second.id));
        return selectRow(candidates[0], select);
      }),
      findUnique: jest.fn<any>(async ({ where, select, include }) => {
        const row = rows.clients.find(client => matches(client, where));
        return row && include ? hydrate(row) : selectRow(row, select);
      }),
      findMany: jest.fn<any>(async ({ where }) => rows.clients.filter(row => matches(row, where)).map(hydrate)),
      create: forbiddenWrite,
      update: forbiddenWrite,
    },
    site: { findUnique: jest.fn<any>(async ({ where }) => ({ id: where.id })) },
    onboardingEtape: {
      create: forbiddenWrite,
      upsert: jest.fn<any>(async ({ where, update }) => {
        const step = rows.steps.find(row => matches(row, where.clientId_etape));
        if (!step) throw new Error('resume requires the stored draft step');
        Object.assign(step, update);
        return step;
      }),
    },
    parrainClaim: { upsert: forbiddenWrite },
    kpayTransaction: { create: forbiddenEffect, update: forbiddenEffect },
    vente: { create: forbiddenEffect },
    stockSite: { update: forbiddenEffect },
    mouvementStock: { create: forbiddenEffect },
    membre: { create: forbiddenEffect },
    commission: { create: forbiddenEffect },
    $transaction: jest.fn<any>(async callback => {
      const pending = { clients: [] as any[], steps: [] as any[], claims: [] as any[] };
      const insert = (kind: keyof typeof pending, data: any, defaults: any) => {
        writes[kind].push(data);
        if (controls.failWrite === kind) throw controls.failure;
        const row = { ...defaults, ...Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)) };
        pending[kind].push(row);
        return row;
      };
      const result = await callback({
        ...prisma,
        client: {
          ...prisma.client,
          create: async ({ data }) => insert('clients', data, {
            id: 'draft-client', createdAt: new Date('2026-09-20T10:00:00.000Z'),
            updatedAt: new Date('2026-09-20T10:00:00.000Z'), email: null, matriculeExterne: null,
            codeParrain: null, parrainClientId: null, notes: null, dateActivation: null,
            pinHash: null, tentativesPin: 0, bloqueJusquA: null,
          }),
        },
        onboardingEtape: {
          create: async ({ data }) => insert('steps', data, {
            id: 'draft-step', completeeAt: null, montant: null, modePaiement: null,
            referenceTransaction: null, notes: null, createdAt: new Date('2026-09-20T10:00:00.000Z'),
          }),
        },
        parrainClaim: {
          upsert: async ({ where, create, update }) => {
            expect(where).toEqual({ filleulClientId: 'draft-client' });
            expect(update).toEqual({});
            return insert('claims', create, {
              id: 'draft-claim', factureReclamee: null, confirmedById: null,
              createdAt: new Date('2026-09-20T10:00:00.000Z'), confirmedAt: null,
            });
          },
        },
      });
      rows.clients.push(...pending.clients);
      rows.steps.push(...pending.steps);
      rows.claims.push(...pending.claims);
      return result;
    }),
  };
  return { prisma, rows, writes, controls, forbiddenEffect, forbiddenWrite };
}

describe('CreateClientDraftDto', () => {
  it('rejects financial fields in a draft', async () => {
    const dto = plainToInstance(CreateClientDraftDto, { ...draft, montantRecit: 10, modePaiement: 'CASH', statut: 'ACTIF' });
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    expect(errors.map(error => error.property)).toEqual(expect.arrayContaining(['montantRecit', 'modePaiement', 'statut']));
  });

  it('accepts identity without inherited financial requirements', async () => {
    const errors = await validate(plainToInstance(CreateClientDraftDto, draft), { whitelist: true, forbidNonWhitelisted: true });
    expect(errors).toEqual([]);
  });

  it.each(['prenom', 'nom', 'telephone', 'siteId'])('requires %s', async property => {
    const input = { ...draft };
    delete input[property];
    const errors = await validate(plainToInstance(CreateClientDraftDto, input));
    expect(errors.map(error => error.property)).toContain(property);
  });
});

describe('ClientsService unpaid drafts', () => {
  let storage: ReturnType<typeof draftStorage>;
  let service: ClientsService;
  let resolveParrain: ReturnType<typeof jest.fn<(identifier: string) => Promise<ParrainResolution | null>>>;

  beforeEach(() => {
    storage = draftStorage();
    resolveParrain = jest.fn<(identifier: string) => Promise<ParrainResolution | null>>().mockResolvedValue(recruiter);
    service = new ClientsService(
      storage.prisma as never,
      { generatePin: storage.forbiddenEffect } as never,
      { sendMail: storage.forbiddenEffect } as never,
      { onClientActivated: storage.forbiddenEffect } as never,
      { initDeposit: storage.forbiddenEffect, initPayout: storage.forbiddenEffect } as never,
      { registerFinalizer: storage.forbiddenEffect } as never,
      { resolveParrain, attachConfirmedClaims: storage.forbiddenEffect } as never,
      { lock: storage.forbiddenEffect } as never,
    );
  });

  async function createDraft(dto = draft, actor = agent) {
    return service.createDraft(dto, actor);
  }

  async function conflict(dto = draft, actor = agent) {
    const error = await createDraft(dto, actor).catch(caught => caught);
    expect(error).toBeInstanceOf(HttpException);
    expect(error.getStatus()).toBe(409);
    expect(error.getResponse()).toMatchObject({ code: 'ERR_DUPLICATE_CLIENT' });
    return error.getResponse();
  }

  function expectNoEffects() {
    expect(storage.forbiddenEffect).not.toHaveBeenCalled();
    expect(storage.forbiddenWrite).not.toHaveBeenCalled();
  }

  it.each([Role.AGENT, Role.CAISSIER])('creates an unpaid record with the authenticated %s', async role => {
    const result = await createDraft(draft, { ...agent, role });
    expect(result).toEqual({
      client: { id: 'draft-client', prenom: 'Client', nom: 'Test', telephone: '+243999000101', statut: 'EN_COURS', createdById: 'agent-a' },
      etapeId: 'draft-step',
    });
    expect(storage.writes.clients).toEqual([{
      prenom: 'Client', nom: 'Test', telephone: '+243999000101', email: undefined,
      matriculeExterne: undefined, siteInscriptionId: 'site-a', createdById: 'agent-a',
      parrainClientId: undefined, statut: StatutClient.EN_COURS,
    }]);
    expect(storage.writes.steps).toEqual([{
      clientId: 'draft-client', agentId: 'agent-a', siteId: 'site-a',
      etape: EtapeOnboarding.RECIT, statut: StatutEtape.EN_ATTENTE,
    }]);
    expect(storage.rows.steps).toEqual([expect.objectContaining({
      completeeAt: null, montant: null, modePaiement: null, referenceTransaction: null,
    })]);
    expect(storage.rows.claims).toEqual([]);
    expect(storage.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(storage.prisma.client.findUnique).not.toHaveBeenCalled();
    expect(storage.prisma.client.findMany).not.toHaveBeenCalled();
    expect(resolveParrain).not.toHaveBeenCalled();
    expectNoEffects();
  });

  it('persists optional identity without spreading injected state or actor fields', async () => {
    await createDraft({ ...draft, email: 'client@example.com', matriculeExterne: 'EXT-1',
      statut: 'ACTIF', createdById: 'forged', agentId: 'forged', parrainClientId: 'forged',
      montantRecit: 100, montant: 100, modePaiement: 'CASH', completeeAt: new Date(),
      referenceTransaction: 'forged', onboardingEtapes: [{ statut: 'COMPLETE' }],
    } as CreateClientDraftDto);
    expect(storage.writes.clients).toEqual([{
      prenom: 'Client', nom: 'Test', telephone: '+243999000101', email: 'client@example.com',
      matriculeExterne: 'EXT-1', siteInscriptionId: 'site-a', createdById: 'agent-a',
      parrainClientId: undefined, statut: StatutClient.EN_COURS,
    }]);
    expect(storage.rows.steps[0]).toMatchObject({ statut: 'EN_ATTENTE', montant: null, completeeAt: null, modePaiement: null, referenceTransaction: null });
    expectNoEffects();
  });

  it('omits empty optional unique values', async () => {
    await createDraft({ ...draft, email: '', matriculeExterne: '' });
    expect(storage.rows.clients[0]).toMatchObject({ email: null, matriculeExterne: null });
  });

  it.each([Role.GERANT, Role.DIRECTEUR_REGIONAL, Role.SUPER_ADMIN])('preserves %s selected-site preparation', async role => {
    await createDraft({ ...draft, siteId: 'site-b' }, { ...agent, role });
    expect(storage.rows.clients[0].siteInscriptionId).toBe('site-b');
    expect(storage.rows.steps[0].siteId).toBe('site-b');
  });

  it.each([Role.FORMATEUR, Role.CLIENT, 'INVALID' as Role, undefined])('rejects insufficient or unknown role %s before reads', async role => {
    await expect(createDraft(draft, { ...agent, role })).rejects.toThrow(ForbiddenException);
    expect(storage.prisma.client.findFirst).not.toHaveBeenCalled();
    expect(storage.prisma.client.findUnique).not.toHaveBeenCalled();
    expect(storage.prisma.site.findUnique).not.toHaveBeenCalled();
    expect(storage.prisma.$transaction).not.toHaveBeenCalled();
    expect(resolveParrain).not.toHaveBeenCalled();
    expectNoEffects();
  });

  describe.each([Role.AGENT, Role.CAISSIER])('%s site boundaries', role => {
    it.each([null, undefined, ''])('rejects missing assigned site %s before reads', async siteId => {
      await expect(createDraft(draft, { ...agent, role, siteId })).rejects.toThrow(ForbiddenException);
      expect(storage.prisma.site.findUnique).not.toHaveBeenCalled();
      expect(storage.prisma.client.findFirst).not.toHaveBeenCalled();
      expect(storage.prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects a forged target site before reads', async () => {
      await expect(createDraft({ ...draft, siteId: 'site-b' }, { ...agent, role })).rejects.toThrow(ForbiddenException);
      expect(storage.prisma.site.findUnique).not.toHaveBeenCalled();
      expect(storage.prisma.client.findFirst).not.toHaveBeenCalled();
      expect(storage.prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  it('rejects a nonexistent site before preparing a record', async () => {
    storage.prisma.site.findUnique.mockResolvedValue(null);
    await expect(createDraft()).rejects.toThrow(NotFoundException);
    expect(storage.prisma.site.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'site-a' } }));
    expect(storage.prisma.$transaction).not.toHaveBeenCalled();
    expectNoEffects();
  });

  it.each([StatutClient.ACTIF, StatutClient.EN_COURS])('preserves a %s recruiter and only the necessary pending claim', async statut => {
    resolveParrain.mockResolvedValue({ ...recruiter, statut });
    await createDraft({ ...draft, codeParrain: 'PARENT-CODE' });
    expect(resolveParrain).toHaveBeenCalledWith('PARENT-CODE');
    expect(storage.rows.clients[0]).toMatchObject({ parrainClientId: 'parent-1', createdById: 'agent-a', statut: 'EN_COURS' });
    expect(storage.writes.claims).toEqual(statut === StatutClient.ACTIF ? [] : [{
      filleulClientId: 'draft-client', parrainClientId: 'parent-1', statut: 'EN_ATTENTE', telephoneParrainSaisi: 'PARENT-CODE',
    }]);
    if (statut !== StatutClient.ACTIF) {
      expect(storage.rows.claims[0]).toMatchObject({ confirmedAt: null, confirmedById: null, factureReclamee: null });
    }
    expectNoEffects();
  });

  it('rejects an unknown recruiter before writing', async () => {
    resolveParrain.mockResolvedValue(null);
    await expect(createDraft({ ...draft, codeParrain: 'UNKNOWN' })).rejects.toMatchObject({
      response: { code: 'ERR_PARRAIN_NOT_FOUND' }, status: 400,
    });
    expect(storage.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects self-recruitment even when supplied as a code', async () => {
    resolveParrain.mockResolvedValue({ ...recruiter, telephone: draft.telephone });
    await expect(createDraft({ ...draft, codeParrain: 'SELF-CODE' })).rejects.toMatchObject({
      response: { code: 'ERR_BAD_REQUEST' }, status: 400,
    });
    expect(storage.prisma.$transaction).not.toHaveBeenCalled();
  });

  describe.each(['telephone', 'email', 'matriculeExterne'])('%s uniqueness', field => {
    const input = { ...draft, email: 'client@example.com', matriculeExterne: 'EXT-1' };

    it.each(['site-a', 'site-b'])('returns only a scoped conflict link for a duplicate in %s', async siteInscriptionId => {
      const existing = { id: 'existing-client', [field]: input[field], siteInscriptionId, statut: 'ACTIF', createdById: 'original', parrainClientId: 'original-parent' };
      storage.rows.clients.push(existing);
      const original = structuredClone(existing);
      const body = await conflict(input);
      if (siteInscriptionId === 'site-a') expect(body.clientId).toBe('existing-client');
      else {
        expect(body).not.toHaveProperty('clientId');
        expect(JSON.stringify(body)).not.toMatch(/existing-client|original|site-b/);
      }
      expect(storage.rows.clients).toEqual([original]);
      expect(storage.prisma.$transaction).not.toHaveBeenCalled();
      expectNoEffects();
    });

    it.each(['site-a', 'site-b'])('translates a P2002 race in %s using minimal rereads', async siteInscriptionId => {
      storage.prisma.$transaction.mockImplementationOnce(async () => {
        storage.rows.clients.push({ id: 'race-client', [field]: input[field], siteInscriptionId });
        throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: '5.22.0', meta: { target: [field] } });
      });
      const body = await conflict(input);
      if (siteInscriptionId === 'site-a') expect(body.clientId).toBe('race-client');
      else expect(body).not.toHaveProperty('clientId');
      expect(storage.prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(storage.writes).toEqual({ clients: [], steps: [], claims: [] });
      expect(storage.prisma.client.findFirst).toHaveBeenCalledTimes(siteInscriptionId === 'site-a' ? 2 : 3);
      for (const [query] of storage.prisma.client.findFirst.mock.calls) {
        expect(query.select).toEqual({ id: true, siteInscriptionId: true });
        expect(query).not.toHaveProperty('include');
      }
      expectNoEffects();
    });
  });

  describe.each([Role.AGENT, Role.CAISSIER])('%s mixed-site identity matches', role => {
    const input = { ...draft, email: 'client@example.com', matriculeExterne: 'EXT-1' };

    describe.each(['telephone', 'email', 'matriculeExterne'])('accessible %s', ownField => {
      it.each([
        { foreignFirst: true, raced: false }, { foreignFirst: false, raced: false },
        { foreignFirst: true, raced: true }, { foreignFirst: false, raced: true },
      ])('returns only the accessible link with order/race %j without overwrites', async ({ foreignFirst, raced }) => {
        const own = { id: 'own-client', [ownField]: input[ownField], siteInscriptionId: 'site-a', createdById: 'original', parrainClientId: 'original-parent' };
        const foreign = ['telephone', 'email', 'matriculeExterne'].filter(field => field !== ownField).map(field => ({
          id: `foreign-${field}`, [field]: input[field], siteInscriptionId: 'site-b', createdById: 'foreign-creator',
        }));
        const collisions = foreignFirst ? [...foreign, own] : [own, ...foreign];
        const original = structuredClone(collisions);
        if (raced) {
          storage.prisma.$transaction.mockImplementationOnce(async () => {
            storage.rows.clients.push(...collisions);
            throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
              code: 'P2002', clientVersion: '5.22.0', meta: { target: [ownField] },
            });
          });
        } else storage.rows.clients.push(...collisions);

        const body = await conflict(input, { ...agent, role });
        expect(body.clientId).toBe('own-client');
        expect(JSON.stringify(body)).not.toMatch(/foreign-|site-b/);
        expect(storage.rows).toEqual({ clients: original, steps: [], claims: [] });
        expect(storage.writes).toEqual({ clients: [], steps: [], claims: [] });
        expect(storage.prisma.$transaction).toHaveBeenCalledTimes(raced ? 1 : 0);
        for (const [query] of storage.prisma.client.findFirst.mock.calls) {
          expect(query.select).toEqual({ id: true, siteInscriptionId: true });
          expect(query).not.toHaveProperty('include');
        }
        expectNoEffects();
      });
    });

    it.each([
      { reverse: false, raced: false }, { reverse: true, raced: false },
      { reverse: false, raced: true }, { reverse: true, raced: true },
    ])('selects a stable accessible link among multiple own-site matches %j', async ({ reverse, raced }) => {
      const collisions = [
        { id: 'foreign-client', telephone: input.telephone, siteInscriptionId: 'site-b' },
        { id: 'own-z', email: input.email, siteInscriptionId: 'site-a' },
        { id: 'own-a', matriculeExterne: input.matriculeExterne, siteInscriptionId: 'site-a' },
      ];
      if (reverse) collisions.reverse();
      const original = structuredClone(collisions);
      if (raced) {
        storage.prisma.$transaction.mockImplementationOnce(async () => {
          storage.rows.clients.push(...collisions);
          throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: '5.22.0' });
        });
      } else storage.rows.clients.push(...collisions);
      expect((await conflict(input, { ...agent, role })).clientId).toBe('own-a');
      expect(storage.rows).toEqual({ clients: original, steps: [], claims: [] });
      expect(storage.writes).toEqual({ clients: [], steps: [], claims: [] });
      expectNoEffects();
    });
  });

  it('does not resume or rewrite an existing unpaid draft on retry', async () => {
    await createDraft({ ...draft, codeParrain: 'PARENT-CODE' });
    const original = structuredClone(storage.rows);
    const body = await conflict({ ...draft, prenom: 'Replacement', codeParrain: 'OTHER' });
    expect(body.clientId).toBe('draft-client');
    expect(storage.rows).toEqual(original);
    expect(storage.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(storage.prisma.onboardingEtape.upsert).not.toHaveBeenCalled();
    expectNoEffects();
  });

  it.each([Role.GERANT, Role.DIRECTEUR_REGIONAL, Role.SUPER_ADMIN])('links a cross-site duplicate accessible to %s', async role => {
    storage.rows.clients.push({ id: 'foreign-client', telephone: draft.telephone, siteInscriptionId: 'site-b' });
    expect((await conflict(draft, { ...agent, role })).clientId).toBe('foreign-client');
  });

  it('returns a generic P2002 conflict when the conflicting record is no longer readable', async () => {
    storage.prisma.$transaction.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: '5.22.0' }));
    expect(await conflict()).not.toHaveProperty('clientId');
    expectNoEffects();
  });

  it.each(['clients', 'steps', 'claims'])('propagates a failed %s write without publishing a partial fake transaction', async kind => {
    storage.controls.failWrite = kind;
    await expect(createDraft({ ...draft, codeParrain: 'PARENT-CODE' })).rejects.toBe(storage.controls.failure);
    expect(storage.writes[kind]).toHaveLength(1);
    expect(storage.rows).toEqual({ clients: [], steps: [], claims: [] });
    expect(storage.prisma.$transaction).toHaveBeenCalledTimes(1);
    expectNoEffects();
  });

  it('appears in the existing site queue as RECIT to collect', async () => {
    await createDraft();
    const result = await service.getOnboardingQueue('site-a');
    expect(result.queue).toEqual([expect.objectContaining({
      id: 'draft-client', createdBy: { id: 'agent-a', nom: 'agent-a' },
      etapeActuelle: 'RECIT', prochainRoute: '/clients/draft-client/recit',
      etapes: { recit: expect.objectContaining({ statut: 'EN_ATTENTE', completeeAt: null }), fiche: null, activation: null },
    })]);
    expect((await service.getOnboardingQueue('site-b')).queue).toEqual([]);
    expectNoEffects();
  });

  it('preserves the draft creator, recruiter and claim during real cashier receipt resumption', async () => {
    await createDraft({ ...draft, codeParrain: 'PARENT-CODE' });
    const originalClaims = structuredClone(storage.rows.claims);
    const result = await service.resumeOnboardingRecit('draft-client', {
      montantRecit: 10, modePaiement: ModePaiement.CASH, numeroRecu: 'RECEIPT-1', agentId: 'cashier-a',
    });
    expect(result.client).toMatchObject({ createdById: 'agent-a', parrainClientId: 'parent-1', statut: 'EN_COURS' });
    expect(storage.rows.clients).toHaveLength(1);
    expect(storage.rows.steps).toEqual([expect.objectContaining({
      id: 'draft-step', statut: 'COMPLETE', montant: 10, modePaiement: 'CASH',
      referenceTransaction: 'RECEIPT-1', agentId: 'cashier-a', completeeAt: expect.any(Date),
    })]);
    expect(storage.rows.claims).toEqual(originalClaims);
    expectNoEffects();
  });
});
