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

  it('matchesInvoiceCode accepte suffixe, forme complète, sans préfixe site et zéros omis', () => {
    expect(matchesInvoiceCode('0047', 'GOM-202609-0047')).toBe(true);
    expect(matchesInvoiceCode('47', 'GOM-202609-0047')).toBe(true);   // zéros de tête omis
    expect(matchesInvoiceCode('0047', 'EBN-202609-0047')).toBe(true); // autre code de site
    expect(matchesInvoiceCode('GOM-202609-0047', 'GOM-202609-0047')).toBe(true);
    expect(matchesInvoiceCode('gom2026090047', 'GOM-202609-0047')).toBe(true);
    expect(matchesInvoiceCode('202609-0047', 'GOM-202609-0047')).toBe(true); // sans préfixe site
    expect(matchesInvoiceCode(' 0047 ', 'GOM-202609-0047')).toBe(true);      // espaces
    expect(matchesInvoiceCode('0048', 'GOM-202609-0047')).toBe(false);
    expect(matchesInvoiceCode('123456', 'GOM-202609-0047')).toBe(false);
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

describe('confirmClaims — réclamation différée', () => {
  let prisma: any;
  let svc: MlmClaimService;

  beforeEach(() => {
    prisma = {
      client: { findUnique: jest.fn<any>() },
      parrainClaim: { count: jest.fn<any>() },
      onboardingEtape: { findFirst: jest.fn<any>() },
      vente: { findFirst: jest.fn<any>() },
    };
    svc = new MlmClaimService(prisma as any, { onClientActivated: jest.fn<any>() } as any);
    jest.spyOn(svc, 'attachConfirmedClaims').mockResolvedValue({ attachés: 1, conflits: 0 });
  });

  it('parrain encore EN_COURS → 400 ERR_PARRAIN_NOT_ACTIVE', async () => {
    prisma.client.findUnique.mockResolvedValue({ id: 'p1', statut: 'EN_COURS' });
    await expect(svc.confirmClaims('p1', '0047')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ERR_PARRAIN_NOT_ACTIVE' }),
    });
  });

  it('parrain introuvable → 404', async () => {
    prisma.client.findUnique.mockResolvedValue(null);
    await expect(svc.confirmClaims('p1', '0047')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ERR_NOT_FOUND' }),
    });
  });

  it('pas de vente d\'activation → 400 ERR_ACTIVATION_SALE_NOT_FOUND', async () => {
    prisma.client.findUnique.mockResolvedValue({ id: 'p1', statut: 'ACTIF' });
    prisma.parrainClaim.count.mockResolvedValue(1);
    prisma.onboardingEtape.findFirst.mockResolvedValue(null);
    prisma.vente.findFirst.mockResolvedValue(null);
    await expect(svc.confirmClaims('p1', '0047')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ERR_ACTIVATION_SALE_NOT_FOUND' }),
    });
  });

  it('code facture qui ne match pas la VENTE D\'ACTIVATION → 400 ERR_CLAIM_CODE_INVALID', async () => {
    prisma.client.findUnique.mockResolvedValue({ id: 'p1', statut: 'ACTIF' });
    prisma.parrainClaim.count.mockResolvedValue(1);
    prisma.onboardingEtape.findFirst.mockResolvedValue({ id: 'etape-1', referenceTransaction: 'ref-act-1' });
    prisma.vente.findFirst.mockResolvedValue({ numeroVente: 'GOM-202609-0047' });
    await expect(svc.confirmClaims('p1', '0048')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ERR_CLAIM_CODE_INVALID' }),
    });
  });

  it('aucun claim en attente → 409 ERR_CLAIM_ALREADY_LIE', async () => {
    prisma.client.findUnique.mockResolvedValue({ id: 'p1', statut: 'ACTIF' });
    prisma.parrainClaim.count.mockResolvedValue(0);
    await expect(svc.confirmClaims('p1', '0047')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ERR_CLAIM_ALREADY_LIE' }),
    });
  });

  it('happy path → attachConfirmedClaims appelé avec la facture d\'activation', async () => {
    prisma.client.findUnique.mockResolvedValue({ id: 'p1', statut: 'ACTIF' });
    prisma.parrainClaim.count.mockResolvedValue(1);
    prisma.onboardingEtape.findFirst.mockResolvedValue({ id: 'etape-1', referenceTransaction: 'ref-act-1' });
    prisma.vente.findFirst.mockResolvedValue({ numeroVente: 'GOM-202609-0047' });
    const res = await svc.confirmClaims('p1', 'GOM-202609-0047', 'agent-1');
    expect(svc.attachConfirmedClaims).toHaveBeenCalledWith('p1', 'GOM-202609-0047', 'agent-1');
    expect(res).toEqual({ attachés: 1, conflits: 0, facture: 'GOM-202609-0047' });
  });
});
