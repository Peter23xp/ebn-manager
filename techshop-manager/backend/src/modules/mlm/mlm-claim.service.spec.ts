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
