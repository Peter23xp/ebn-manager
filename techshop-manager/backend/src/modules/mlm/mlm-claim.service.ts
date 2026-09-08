import { Injectable } from '@nestjs/common';
import { StatutClient } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MlmMatrixService } from './mlm-matrix.service';

/** 'GOM-202609-0047 ' → 'GOM2026090047' (insensible casse, tirets/espaces retirés) */
export function normalizeInvoiceCode(code: string): string {
  return code.trim().toUpperCase().replace(/[-\s]/g, '');
}

/** 'GOM-202609-0047' → '0047' ; séquence complète sur 4 chiffres, '0000' si illisible */
export function invoiceCodeSeq(numeroVente: string): string {
  const seq = parseInt(numeroVente.split('-').pop() ?? '0', 10) || 0;
  return String(seq).padStart(4, '0');
}

/** Vrai si le code saisi match la facture, en suffixe (0047) ou forme complète (GOM-202609-0047) */
export function matchesInvoiceCode(input: string, numeroVente: string): boolean {
  if (!input || !input.trim()) return false;
  const norm = normalizeInvoiceCode(input);
  return norm === normalizeInvoiceCode(numeroVente) || norm === invoiceCodeSeq(numeroVente);
}

export interface ParrainResolution {
  id: string;
  telephone: string;
  prenom: string;
  nom: string;
  statut: StatutClient;
}

@Injectable()
export class MlmClaimService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly matrixService: MlmMatrixService,
  ) {}

  /**
   * Résout un parrain par codeParrain, matricule Membre, ou téléphone
   * (l'agent peut saisir le téléphone d'un parrain non encore activé).
   */
  async resolveParrain(identifier: string): Promise<ParrainResolution | null> {
    const term = identifier.trim();
    if (!term) return null;
    const parrain = await this.prisma.client.findFirst({
      where: {
        OR: [
          { codeParrain: term },
          { membre: { matricule: term } },
          { telephone: term },
        ],
      },
      select: { id: true, telephone: true, prenom: true, nom: true, statut: true },
    });
    return parrain ?? null;
  }
}
