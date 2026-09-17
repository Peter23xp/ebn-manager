import { describe, expect, it, jest } from '@jest/globals';
import { ClientsService } from './clients.service';

describe('Client detail registration date', () => {
  const createdAt = new Date('2026-09-01T10:00:00.000Z');
  const dateActivation = new Date('2026-09-15T10:00:00.000Z');

  function fixture(statut: 'ACTIF' | 'EN_COURS', missingMember = false) {
    const member = { matricule: '202609150001', dateInscription: dateActivation, parrain: null };
    const client = {
      id: 'client-date', statut, createdAt, dateActivation: statut === 'ACTIF' ? dateActivation : null,
      siteInscription: { id: 'site', nom: 'Site Test' }, parrainClient: null, filleulClaim: null,
      membre: statut === 'ACTIF' && !missingMember ? member : null,
      onboardingEtapes: [], ventes: [],
    };
    const prisma: any = { client: { findUnique: jest.fn<any>().mockResolvedValue(client) } };
    if (missingMember) prisma.client.findUnique.mockResolvedValueOnce(client).mockResolvedValue({ ...client, membre: member });
    const matrix: any = { onClientActivated: jest.fn<any>().mockResolvedValue(undefined) };
    const service = new ClientsService(prisma, {} as never, {} as never, matrix, {} as never, {} as never, {} as never, {} as never);
    return service;
  }

  it.each(['ACTIF', 'EN_COURS'] as const)('exposes the client creation date as dateInscription for %s', async statut => {
    const detail = JSON.parse(JSON.stringify(await fixture(statut).findOne('client-date')));
    expect(detail.dateInscription).toBe('2026-09-01T10:00:00.000Z');
    expect(detail.createdAt).toBe('2026-09-01T10:00:00.000Z');
    expect(detail.dateActivation).toBe(statut === 'ACTIF' ? '2026-09-15T10:00:00.000Z' : null);
  });

  it('preserves the original client registration date after recovering a missing MLM member', async () => {
    const detail = JSON.parse(JSON.stringify(await fixture('ACTIF', true).findOne('client-date')));
    expect(detail.dateInscription).toBe('2026-09-01T10:00:00.000Z');
    expect(detail.membre.dateInscription).toBe('2026-09-15T10:00:00.000Z');
  });
});
