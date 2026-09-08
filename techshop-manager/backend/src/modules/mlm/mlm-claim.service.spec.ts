import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import {
  normalizeInvoiceCode,
  invoiceCodeSeq,
  matchesInvoiceCode,
  MlmClaimService,
} from './mlm-claim.service';

describe('code facture helpers', () => {
  it('normalizeInvoiceCode retire tirets/espaces et met en majuscules', () => {
    expect(normalizeInvoiceCode(' gom-202609-0047 ')).toBe('GOM2026090047');
  });

  it('invoiceCodeSeq extrait le suffixe de séquence', () => {
    expect(invoiceCodeSeq('GOM-202609-0047')).toBe('0047');
    expect(invoiceCodeSeq('GOM-202609-4')).toBe('0004');
    expect(invoiceCodeSeq('sans-tirets')).toBe('0000');
  });

  it('matchesInvoiceCode accepte le suffixe (0047) et la forme complète', () => {
    expect(matchesInvoiceCode('0047', 'GOM-202609-0047')).toBe(true);
    expect(matchesInvoiceCode('GOM-202609-0047', 'GOM-202609-0047')).toBe(true);
    expect(matchesInvoiceCode('gom2026090047', 'GOM-202609-0047')).toBe(true);
    expect(matchesInvoiceCode('0048', 'GOM-202609-0047')).toBe(false);
    expect(matchesInvoiceCode('202609-0047', 'GOM-202609-0047')).toBe(false);
    expect(matchesInvoiceCode('', 'GOM-202609-0047')).toBe(false);
  });
});

describe('resolveParrain', () => {
  let prisma: any;
  let svc: MlmClaimService;

  beforeEach(() => {
    prisma = {
      client: { findFirst: jest.fn<any>() },
    };
    svc = new MlmClaimService(prisma, { onClientActivated: jest.fn<any>() } as any);
  });

  it('retourne null pour une entrée vide', async () => {
    expect(await svc.resolveParrain('   ')).toBeNull();
    expect(prisma.client.findFirst).not.toHaveBeenCalled();
  });

  it('cherche par codeParrain, matricule membre OU téléphone', async () => {
    prisma.client.findFirst.mockResolvedValue({
      id: 'p1', telephone: '+243900000001', prenom: 'Jean', nom: 'K', statut: 'EN_COURS',
    });
    const res = await svc.resolveParrain(' +243900000001 ');
    expect(prisma.client.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { codeParrain: '+243900000001' },
            { membre: { matricule: '+243900000001' } },
            { telephone: '+243900000001' },
          ],
        },
      }),
    );
    expect(res?.id).toBe('p1');
  });
});

describe('attachConfirmedClaims', () => {
  let prisma: any;
  let matrix: any;
  let svc: MlmClaimService;

  beforeEach(() => {
    prisma = {
      parrainClaim: {
        findMany: jest.fn<any>(),
        update: jest.fn<any>().mockResolvedValue({}),
      },
      membre: {
        findUnique: jest.fn<any>().mockImplementation((args: any) =>
          Promise.resolve(
            args?.where?.clientId === 'parrain-1'
              ? { id: 'parrain-membre-1', matricule: '202609010001' }
              : null, // filleuls sans membre → EN_COURS, rien à faire maintenant
          ),
        ),
      },
    };
    matrix = { onClientActivated: jest.fn<any>().mockResolvedValue(undefined) };
    svc = new MlmClaimService(prisma as any, matrix as any);
  });

  it('attache les filleuls via onClientActivated et marque LIE', async () => {
    prisma.parrainClaim.findMany.mockResolvedValue([
      { id: 'c1', filleulClientId: 'f1', statut: 'EN_ATTENTE' },
      { id: 'c2', filleulClientId: 'f2', statut: 'EN_ATTENTE' },
    ]);
    const res = await svc.attachConfirmedClaims('parrain-1', 'GOM-202609-0047', 'agent-1');
    expect(res).toEqual({ attachés: 2, conflits: 0 });
    expect(matrix.onClientActivated).toHaveBeenCalledWith('f1', '202609010001');
    expect(matrix.onClientActivated).toHaveBeenCalledWith('f2', '202609010001');
    expect(prisma.parrainClaim.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'c1' },
        data: expect.objectContaining({
          statut: 'LIE', factureReclamee: 'GOM-202609-0047', confirmedById: 'agent-1',
        }),
      }),
    );
  });

  it('laisse EN_ATTENTE un filleul déjà rattaché à un autre parrain', async () => {
    prisma.parrainClaim.findMany.mockResolvedValue([
      { id: 'c1', filleulClientId: 'f1', statut: 'EN_ATTENTE' },
    ]);
    prisma.membre.findUnique = jest.fn<any>().mockImplementation((args: any) =>
      Promise.resolve(
        args?.where?.clientId === 'f1'
          ? { parrainId: 'autre-parrain-membre-id' }
          : { id: 'parrain-membre-1', matricule: '202609010001' },
      ),
    );
    const res = await svc.attachConfirmedClaims('parrain-1', 'GOM-202609-0047');
    expect(res).toEqual({ attachés: 0, conflits: 1 });
    expect(matrix.onClientActivated).not.toHaveBeenCalled();
    expect(prisma.parrainClaim.update).not.toHaveBeenCalled();
  });

  it('rattache un filleul membre SANS parrain (parrainId null) — cas de heal', async () => {
    prisma.parrainClaim.findMany.mockResolvedValue([
      { id: 'c1', filleulClientId: 'f1', statut: 'EN_ATTENTE' },
    ]);
    prisma.membre.findUnique = jest.fn<any>().mockImplementation((args: any) =>
      Promise.resolve(
        args?.where?.clientId === 'f1'
          ? { parrainId: null }
          : { id: 'parrain-membre-1', matricule: '202609010001' },
      ),
    );
    const res = await svc.attachConfirmedClaims('parrain-1', 'GOM-202609-0047');
    expect(res).toEqual({ attachés: 1, conflits: 0 });
    expect(matrix.onClientActivated).toHaveBeenCalledWith('f1', '202609010001');
  });

  it('retourne 0/0 sans claim et ne touche pas au service matrice', async () => {
    prisma.parrainClaim.findMany.mockResolvedValue([]);
    const res = await svc.attachConfirmedClaims('parrain-1', 'GOM-202609-0047');
    expect(res).toEqual({ attachés: 0, conflits: 0 });
    expect(matrix.onClientActivated).not.toHaveBeenCalled();
  });

  it('ne crashe pas si un attach échoue (idempotence + log)', async () => {
    prisma.parrainClaim.findMany.mockResolvedValue([
      { id: 'c1', filleulClientId: 'f1', statut: 'EN_ATTENTE' },
      { id: 'c2', filleulClientId: 'f2', statut: 'EN_ATTENTE' },
    ]);
    matrix.onClientActivated
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValueOnce(undefined);
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await svc.attachConfirmedClaims('parrain-1', 'GOM-202609-0047');
    expect(res).toEqual({ attachés: 1, conflits: 0 });
    // c1 a échoué → reste EN_ATTENTE ; c2 passé LIE
    expect(prisma.parrainClaim.update).toHaveBeenCalledTimes(1);
    expect(prisma.parrainClaim.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'c2' } }));
    errSpy.mockRestore();
  });
});
