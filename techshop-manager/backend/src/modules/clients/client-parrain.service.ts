import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MlmMatrixService } from '../mlm/mlm-matrix.service';
import { MlmClaimService } from '../mlm/mlm-claim.service';
import { MlmPlacementService } from '../mlm/mlm-placement.service';
import { AssignParrainDto } from './dto/assign-parrain.dto';

type AttributionActor = { id: string; role: Role; siteId?: string | null };

const attributionInclude = {
  actor: { select: { id: true, nom: true } },
  parrain: { select: { id: true, prenom: true, nom: true, statut: true } },
} satisfies Prisma.ClientParrainAttributionInclude;

@Injectable()
export class ClientParrainService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly matrix: MlmMatrixService,
    private readonly claims: MlmClaimService,
    private readonly placement: MlmPlacementService,
  ) {}

  private authorize(actor: AttributionActor, siteId?: string) {
    if (!actor?.id || !['GERANT', 'SUPER_ADMIN'].includes(actor.role)) {
      throw new ForbiddenException('Attribution réservée au gérant et au super administrateur');
    }
    if (siteId && actor.role === 'GERANT' && actor.siteId !== siteId) {
      throw new ForbiddenException('Ce client ne dépend pas de votre site');
    }
  }

  async getAttribution(clientId: string, actor: AttributionActor) {
    this.authorize(actor);
    return this.prisma.$transaction(async tx => {
      const client = await tx.client.findUnique({ where: { id: clientId }, select: { siteInscriptionId: true } });
      if (!client) throw new NotFoundException('Client introuvable');
      this.authorize(actor, client.siteInscriptionId);
      return tx.clientParrainAttribution.findUnique({ where: { clientId }, include: attributionInclude });
    });
  }

  async assign(clientId: string, input: AssignParrainDto, actor: AttributionActor) {
    this.authorize(actor);
    const codeParrain = input.codeParrain?.trim();
    const reason = input.reason?.trim();
    if (!codeParrain || codeParrain.length > 100 || !reason || reason.length < 3 || reason.length > 500) {
      throw new BadRequestException('Sélectionner un parrain et renseigner un motif de 3 à 500 caractères');
    }
    return this.prisma.$transaction(async tx => {
      await this.placement.lock(tx);
      const client = await tx.client.findUnique({
        where: { id: clientId }, include: { membre: true, filleulClaim: true },
      });
      if (!client) throw new NotFoundException('Client introuvable');
      this.authorize(actor, client.siteInscriptionId);
      const parrain = await this.claims.resolveParrain(codeParrain, tx);
      if (!parrain) throw new NotFoundException('Parrain introuvable');
      const previous = await tx.clientParrainAttribution.findUnique({ where: { clientId }, include: attributionInclude });
      if (previous) {
        if (previous.parrainClientId === parrain.id && previous.actorId === actor.id && previous.reason === reason && client.parrainClientId === parrain.id) return previous;
        throw new ConflictException('Une attribution a déjà été enregistrée pour ce client');
      }
      if (client.parrainClientId || client.membre?.parrainId || client.filleulClaim) {
        throw new ConflictException('Ce client possède déjà un parrain ou une réclamation de parrainage');
      }
      if (!['ACTIF', 'EN_COURS'].includes(client.statut) || !['ACTIF', 'EN_COURS'].includes(parrain.statut)) {
        throw new BadRequestException('Un client suspendu ou archivé ne peut pas participer à cette attribution');
      }
      if (client.membre && client.membre.statut !== 'ACTIF') throw new BadRequestException('Le membre MLM est inactif');
      if (clientId === parrain.id) throw new BadRequestException('Auto-parrainage interdit');
      const recruiterMember = parrain.statut === 'ACTIF'
        ? await tx.membre.findUnique({ where: { clientId: parrain.id }, select: { statut: true } }) : null;
      if (recruiterMember && recruiterMember.statut !== 'ACTIF') throw new BadRequestException('Le parrain MLM est inactif');
      const cycle = await tx.$queryRaw<Array<{ id: string }>>`
        WITH RECURSIVE ancestors(id) AS (
          SELECT ${parrain.id}::text
          UNION
          SELECT links.id FROM ancestors ancestor
          CROSS JOIN LATERAL (
            SELECT client."parrainClientId" AS id FROM clients client WHERE client.id = ancestor.id
            UNION
            SELECT recruiter."clientId" FROM membres member JOIN membres recruiter ON recruiter.id = member."parrainId"
              WHERE member."clientId" = ancestor.id
            UNION
            SELECT parent."clientId" FROM membres member
              JOIN positions position ON position."filleulId" = member.id
              JOIN matrices matrix ON matrix.id = position."matrixId"
              JOIN mlm_levels level ON level.id = matrix."mlmLevelId" AND level.ordre = 1
              JOIN membres parent ON parent.id = matrix."membreId" WHERE member."clientId" = ancestor.id
            UNION
            SELECT claim."parrainClientId" FROM parrain_claims claim WHERE claim."filleulClientId" = ancestor.id
          ) links WHERE links.id IS NOT NULL
        ) SELECT id FROM ancestors WHERE id = ${clientId}
      `;
      if (cycle.length) throw new BadRequestException('Ce parrainage créerait un cycle dans le réseau');
      const assigned = await tx.client.updateMany({
        where: { id: clientId, parrainClientId: null }, data: { parrainClientId: parrain.id },
      });
      if (assigned.count !== 1) throw new ConflictException('Le parrain a changé, rechargez la fiche');
      if (parrain.statut === 'EN_COURS') {
        await tx.parrainClaim.create({ data: {
          filleulClientId: clientId, parrainClientId: parrain.id, telephoneParrainSaisi: codeParrain, statut: 'EN_ATTENTE',
        } });
      } else {
        if (!recruiterMember) await this.matrix.onClientActivatedInTx(tx, parrain.id, undefined, actor.id);
        if (client.statut === 'ACTIF') await this.matrix.onClientActivatedInTx(tx, clientId, parrain.id, actor.id);
      }
      return tx.clientParrainAttribution.create({
        data: { clientId, parrainClientId: parrain.id, actorId: actor.id, reason }, include: attributionInclude,
      });
    }, { timeout: 30000, maxWait: 10000 });
  }
}
