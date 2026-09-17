import { describe, expect, it, jest } from '@jest/globals';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ClientsService } from './clients.service';
import { MlmPlacementService } from '../mlm/mlm-placement.service';

const input = {
  prenom: 'Marie', nom: 'Test', telephone: '+243900000002', siteId: 'site',
  codeParrain: '+243900000001', montantRecit: 10000, provider: 'VODACOM_MPESA_COD',
  phoneNumber: '+243900000002', agentId: 'agent',
};

function fixture() {
  const initial = {
    id: 'child', telephone: input.telephone, statut: 'EN_COURS', parrainClientId: null,
    membre: null, filleulClaim: null,
    onboardingEtapes: [{ id: 'step', etape: 'RECIT', statut: 'EN_COURS' }],
  };
  const state: { client: any; claim: any } = { client: { ...initial }, claim: null };
  const events: string[] = [];
  const tx: any = {
    $executeRaw: jest.fn<any>(async (sql: TemplateStringsArray) => {
      events.push(sql.join(''));
    }),
    client: {
      findUnique: jest.fn<any>(async () => {
        events.push('read-client');
        return state.client && { ...state.client, filleulClaim: state.claim };
      }),
      create: jest.fn<any>(async ({ data }) => {
        events.push('create-client');
        state.client = { ...initial, ...data };
        return state.client;
      }),
    },
    parrainClaim: {
      upsert: jest.fn<any>(async ({ create }) => {
        events.push('write-claim');
        state.claim ??= { id: 'claim', ...create };
        return state.claim;
      }),
    },
    onboardingEtape: { upsert: jest.fn<any>().mockResolvedValue({ id: 'step' }) },
    kpayTransaction: { create: jest.fn<any>().mockResolvedValue({ id: 'payment' }) },
  };
  const prisma: any = {
    configGenerale: { findFirst: async () => ({ kpayAdminMpesaPhone: '+243900000099' }) },
    client: { findUnique: jest.fn<any>().mockResolvedValue(initial) },
    site: { findUnique: async () => ({ id: 'site' }) },
    kpayTransaction: {
      findFirst: jest.fn<any>().mockResolvedValueOnce(null).mockResolvedValue({ id: 'failed' }),
      update: jest.fn<any>(),
    },
    $transaction: jest.fn<any>(async callback => callback(tx)),
  };
  const claims: any = {
    resolveParrain: jest.fn<any>().mockResolvedValue({ id: 'requested', telephone: input.codeParrain, statut: 'EN_COURS' }),
  };
  const kpay: any = {
    initDeposit: jest.fn<any>().mockResolvedValue({ id: 'remote-payment', reference: 'reference', status: 'PENDING' }),
  };
  const service = new ClientsService(prisma, {} as never, {} as never, {} as never, kpay, {} as never, claims, new MlmPlacementService(prisma));
  return { service, state, events, tx, prisma, claims, kpay };
}

describe('initKpayRecit recruiter concurrency', () => {
  it.each(['client', 'member', 'claim'])('rejects a conflicting %s recruiter committed after the initial read', async source => {
    const { service, state, tx, kpay } = fixture();
    if (source === 'client') state.client.parrainClientId = 'assigned';
    if (source === 'member') state.client.membre = { parrain: { clientId: 'assigned' } };
    if (source === 'claim') state.claim = { id: 'existing', parrainClientId: 'assigned', statut: 'EN_ATTENTE' };
    const before = structuredClone(state);

    await expect(service.initKpayRecit(input)).rejects.toBeInstanceOf(ConflictException);

    expect(state).toEqual(before);
    expect(tx.parrainClaim.upsert).not.toHaveBeenCalled();
    expect(tx.onboardingEtape.upsert).not.toHaveBeenCalled();
    expect(tx.kpayTransaction.create).not.toHaveBeenCalled();
    expect(kpay.initDeposit).not.toHaveBeenCalled();
  });

  it('locks the shared placement key before rereading and creating a compatible claim', async () => {
    const { service, state, events } = fixture();
    state.client.parrainClientId = 'requested';

    const result = await service.initKpayRecit(input);

    expect(events).toEqual(['SELECT pg_advisory_xact_lock(604008)', 'read-client', 'write-claim']);
    expect(state.claim).toMatchObject({ filleulClientId: 'child', parrainClientId: 'requested', statut: 'EN_ATTENTE' });
    expect(result.client.parrainClientId).toBe('requested');
    expect(result.warning).toBe('PARRAIN_NON_ACTIVE');
  });

  it('waits for the placement lock and rejects an attribution committed while waiting', async () => {
    const { service, state, tx, kpay } = fixture();
    let releaseLock: () => void;
    let enteredLock: () => void;
    const lock = new Promise<void>(resolve => { releaseLock = resolve; });
    const entered = new Promise<void>(resolve => { enteredLock = resolve; });
    tx.$executeRaw.mockImplementationOnce(async () => {
      enteredLock();
      await lock;
    });
    const outcome = service.initKpayRecit(input).then(
      result => ({ result, error: null }),
      error => ({ result: null, error }),
    );

    try {
      expect(await Promise.race([entered.then(() => 'waiting'), outcome.then(() => 'finished')])).toBe('waiting');
      expect(tx.client.findUnique).not.toHaveBeenCalled();
      expect(tx.parrainClaim.upsert).not.toHaveBeenCalled();
      state.client.parrainClientId = 'assigned';
    } finally {
      releaseLock();
    }

    expect((await outcome).error).toBeInstanceOf(ConflictException);
    expect(state.claim).toBeNull();
    expect(kpay.initDeposit).not.toHaveBeenCalled();
  });

  it.each(['EN_ATTENTE', 'LIE'])('preserves a compatible existing %s claim on retry', async statut => {
    const { service, state } = fixture();
    state.client.parrainClientId = 'requested';
    state.claim = { id: 'existing', parrainClientId: 'requested', statut, telephoneParrainSaisi: 'original' };
    const before = structuredClone(state.claim);

    const result = await service.initKpayRecit(input);

    expect(state.claim).toEqual(before);
    expect(result.transactionId).toBe('payment');
  });

  it('preserves a concurrently assigned recruiter when no code is supplied', async () => {
    const { service, state } = fixture();
    state.client.parrainClientId = 'assigned';

    const result = await service.initKpayRecit({ ...input, codeParrain: undefined });

    expect(result.client.parrainClientId).toBe('assigned');
    expect(state.claim).toBeNull();
  });

  it('rejects a client removed after the initial read without starting payment', async () => {
    const { service, state, kpay } = fixture();
    state.client = null;

    await expect(service.initKpayRecit(input)).rejects.toBeInstanceOf(NotFoundException);
    expect(kpay.initDeposit).not.toHaveBeenCalled();
  });

  it('locks new client creation and retains the pending recruiter workflow', async () => {
    const { service, state, prisma, events } = fixture();
    prisma.client.findUnique.mockResolvedValue(null);

    await service.initKpayRecit(input);

    expect(events).toEqual(['SELECT pg_advisory_xact_lock(604008)', 'create-client', 'write-claim']);
    expect(state.client.parrainClientId).toBe('requested');
    expect(state.claim).toMatchObject({ parrainClientId: 'requested', statut: 'EN_ATTENTE' });
  });
});
