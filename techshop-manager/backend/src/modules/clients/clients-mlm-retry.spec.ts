import { describe, expect, it, jest } from '@jest/globals';
import { Role } from '@prisma/client';
import { ClientsService } from './clients.service';

function fixture() {
  const client: any = { id: 'client', statut: 'ACTIF', parrainClientId: 'recruiter-client', membre: null };
  const prisma: any = { client: { findUnique: jest.fn<any>().mockResolvedValue(client) } };
  const mlm: any = { onClientActivated: jest.fn<any>().mockImplementation(async () => { client.membre = { id: 'member' }; }) };
  const service = new ClientsService(prisma, {} as never, {} as never, mlm, {} as never, {} as never, {} as never, {} as never);
  const detail = jest.spyOn(service, 'findOne').mockImplementation(async () => ({ ...client }) as any);
  const activation = jest.spyOn(service, 'onboardingActivate');
  const actor = { id: 'cashier', role: Role.CAISSIER, siteId: 'site-a' };
  return { service, client, prisma, mlm, detail, activation, actor };
}

describe('explicit retry of MLM activation', () => {
  it('initializes only MLM, keeps the recruiter and returns the updated client', async () => {
    const { service, actor, mlm, activation, prisma } = fixture();
    expect(await (service as any).retryMlmActivation('client', actor)).toMatchObject({ membre: { id: 'member' } });
    expect(mlm.onClientActivated).toHaveBeenCalledWith('client', 'recruiter-client', 'cashier');
    expect(prisma.client.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'client', siteInscriptionId: 'site-a' } }));
    expect(activation).not.toHaveBeenCalled();
  });

  it('does nothing on a repeated request after the member was created', async () => {
    const { service, actor, mlm } = fixture();
    await (service as any).retryMlmActivation('client', actor);
    await (service as any).retryMlmActivation('client', actor);
    expect(mlm.onClientActivated).toHaveBeenCalledTimes(1);
  });

  it.each(['EN_COURS', 'SUSPENDU', 'INACTIF'])('rejects a client in status %s', async statut => {
    const { service, actor, client, mlm } = fixture();
    client.statut = statut;
    await expect((service as any).retryMlmActivation('client', actor)).rejects.toThrow(/actif/i);
    expect(mlm.onClientActivated).not.toHaveBeenCalled();
  });

  it('rejects clients outside the scoped query before writing', async () => {
    const { service, actor, prisma, mlm } = fixture();
    prisma.client.findUnique.mockResolvedValue(null);
    await expect((service as any).retryMlmActivation('foreign', actor)).rejects.toThrow(/introuvable/i);
    expect(mlm.onClientActivated).not.toHaveBeenCalled();
  });

  it('rejects an insufficient role even when called without the controller', async () => {
    const { service, actor, mlm } = fixture();
    await expect((service as any).retryMlmActivation('client', { ...actor, role: Role.AGENT })).rejects.toThrow();
    expect(mlm.onClientActivated).not.toHaveBeenCalled();
  });

  it('surfaces a failed MLM transaction and allows a later retry', async () => {
    const { service, actor, mlm, detail } = fixture();
    mlm.onClientActivated.mockRejectedValueOnce(new Error('Placement indisponible'));
    await expect((service as any).retryMlmActivation('client', actor)).rejects.toThrow('Placement indisponible');
    expect(detail).not.toHaveBeenCalled();
    expect(await (service as any).retryMlmActivation('client', actor)).toMatchObject({ membre: { id: 'member' } });
  });
});
