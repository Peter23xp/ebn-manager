import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
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

/** Vrai si le code saisi match la facture : suffixe (0047 / 47), forme complète
 * (GOM-202609-0047 / gom2026090047) ou les chiffres sans le préfixe de site (2026090047) */
export function matchesInvoiceCode(input: string, numeroVente: string): boolean {
  if (!input || !input.trim()) return false;
  const norm = normalizeInvoiceCode(input);
  const full = normalizeInvoiceCode(numeroVente);          // GOM2026090047
  const digitsOnly = full.replace(/^[A-Z]+/, '');          // 2026090047
  const seq = invoiceCodeSeq(numeroVente);                 // 0047
  if (norm === full || norm === digitsOnly || norm === seq) return true;
  // tolérance au zéro de tête sur le suffixe : '47' == '0047'
  const inputDigits = norm.replace(/\D/g, '');
  return !!inputDigits && inputDigits.length <= 4 && Number(inputDigits) === Number(seq);
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

  /** Les filleuls en attente rattachables à ce parrain */
  async pendingClaimsForParrain(parrainClientId: string) {
    return this.prisma.parrainClaim.findMany({
      where: { parrainClientId, statut: 'EN_ATTENTE' },
      include: {
        filleul: { select: { id: true, prenom: true, nom: true, telephone: true, statut: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Réclamation différée : le parrain est déjà ACTIF mais n'a pas présenté son
   * code à l'activation (voie Kpay/webhook, ou code manquant au guichet).
   * Le code est vérifié UNIQUEMENT contre la vente d'ACTIVATION du parrain
   * (son premier achat), pas une vente ultérieure.
   */
  async confirmClaims(parrainClientId: string, codeFacture: string, agentId?: string) {
    const parrain = await this.prisma.client.findUnique({
      where: { id: parrainClientId },
      select: { id: true, statut: true },
    });
    if (!parrain) {
      throw new NotFoundException({ code: 'ERR_NOT_FOUND', message: 'Parrain introuvable' });
    }
    if (parrain.statut !== 'ACTIF') {
      throw new BadRequestException({
        code: 'ERR_PARRAIN_NOT_ACTIVE',
        message: "Le parrain doit d'abord activer son compte (le code facture est demandé à l'activation)",
      });
    }

    const nbPending = await this.prisma.parrainClaim.count({
      where: { parrainClientId, statut: 'EN_ATTENTE' },
    });
    if (nbPending === 0) {
      throw new ConflictException({
        code: 'ERR_CLAIM_ALREADY_LIE',
        message: 'Aucun filleul en attente pour ce parrain (déjà liés ou réclamation inconnue)',
      });
    }

    // Vente d'activation = étape ACTIVATION complétée + premier achat du client
    const etapeActivation = await this.prisma.onboardingEtape.findFirst({
      where: { clientId: parrainClientId, etape: 'ACTIVATION', statut: 'COMPLETE' },
      select: { id: true },
    });
    const venteActivation = etapeActivation
      ? await this.prisma.vente.findFirst({
          where: { clientId: parrainClientId },
          orderBy: { createdAt: 'asc' },
          select: { numeroVente: true },
        })
      : null;
    if (!venteActivation) {
      throw new BadRequestException({
        code: 'ERR_ACTIVATION_SALE_NOT_FOUND',
        message: "Vente d'activation introuvable pour ce parrain",
      });
    }

    if (!matchesInvoiceCode(codeFacture, venteActivation.numeroVente)) {
      throw new BadRequestException({
        code: 'ERR_CLAIM_CODE_INVALID',
        message: 'Code de facture invalide',
      });
    }

    const { attachés, conflits } = await this.attachConfirmedClaims(
      parrainClientId, venteActivation.numeroVente, agentId,
    );
    return { attachés, conflits, facture: venteActivation.numeroVente };
  }

  /** File admin des réclamations en attente */
  async listPendingClaims(siteId?: string) {
    return this.prisma.parrainClaim.findMany({
      where: {
        statut: 'EN_ATTENTE',
        ...(siteId ? { parrain: { siteInscriptionId: siteId } } : {}),
      },
      include: {
        filleul: { select: { id: true, prenom: true, nom: true, telephone: true, statut: true } },
        parrain: { select: { id: true, prenom: true, nom: true, telephone: true, statut: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }
}
