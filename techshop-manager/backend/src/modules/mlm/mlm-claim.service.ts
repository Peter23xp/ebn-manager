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

  /**
   * Confirme les claims EN_ATTENTE d'un parrain qui vient d'activer son compte
   * (code facture validé par l'appelant). Rattache les filleuls déjà actifs via
   * la voie idempotente MlmMatrixService.onClientActivated.
   * Filleul encore EN_COURS : rien à faire — son activation propre utilisera
   * client.parrainClientId déjà posé.
   * Filleul déjà rattaché à un AUTRE parrain : conflit, claim laissé EN_ATTENTE.
   * @param factureNumero numeroVente de la vente d'activation du parrain (ex: GOM-202609-0047)
   */
  async attachConfirmedClaims(
    parrainClientId: string,
    factureNumero: string,
    agentId?: string,
  ): Promise<{ attachés: number; conflits: number }> {
    const claims = await this.prisma.parrainClaim.findMany({
      where: { parrainClientId, statut: 'EN_ATTENTE' },
    });
    if (claims.length === 0) return { attachés: 0, conflits: 0 };

    const parrainMembre = await this.prisma.membre.findUnique({
      where: { clientId: parrainClientId },
      select: { id: true, matricule: true },
    });
    if (!parrainMembre) {
      console.error(`[CLAIM ATTACH] Parrain ${parrainClientId} sans profil Membre — claims non traités`);
      return { attachés: 0, conflits: claims.length };
    }

    let attachés = 0;
    let conflits = 0;
    for (const claim of claims) {
      const filleulMembre = await this.prisma.membre.findUnique({
        where: { clientId: claim.filleulClientId },
        select: { parrainId: true },
      });
      if (filleulMembre?.parrainId && filleulMembre.parrainId !== parrainMembre.id) {
        // déjà rattaché ailleurs — l'admin tranchera, on n'écrase jamais
        conflits += 1;
        continue;
      }
      try {
        // Idempotent et transactionnel en interne (voir MlmMatrixService.onClientActivated)
        await this.matrixService.onClientActivated(claim.filleulClientId, parrainMembre.matricule);
        await this.prisma.parrainClaim.update({
          where: { id: claim.id },
          data: {
            statut: 'LIE',
            factureReclamee: factureNumero,
            confirmedAt: new Date(),
            confirmedById: agentId ?? null,
          },
        });
        attachés += 1;
      } catch (err) {
        // Un échec sur un filleul ne bloque pas les autres (pattern healActiveClientsWithoutMembre)
        console.error(`[CLAIM ATTACH] échec claim ${claim.id} (filleul ${claim.filleulClientId}):`, err);
      }
    }
    return { attachés, conflits };
  }
}
