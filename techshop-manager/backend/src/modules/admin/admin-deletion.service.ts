import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role, StatutClient } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export const DELETABLE_ENTITIES = ['site', 'utilisateur', 'client', 'produit'] as const;
export type DeletableEntity = (typeof DELETABLE_ENTITIES)[number];

export interface DeletionBlocker {
  key: string;
  label: string;
  count: number;
}

export interface DeletionImpact {
  entity: DeletableEntity;
  id: string;
  label: string;
  /** true : aucune donnée liée, la suppression définitive est possible. */
  canDelete: boolean;
  /** Données qui empêchent la suppression (compta, stock, réseau MLM…). */
  blockers: DeletionBlocker[];
  /** Règle qui interdit toute action (ex. supprimer son propre compte). */
  forbiddenReason: string | null;
  /** Action proposée à la place quand la suppression est bloquée. */
  fallback: 'DESACTIVER' | 'ARCHIVER';
  /** Déjà désactivé / archivé : la solution de repli n'a plus d'effet. */
  alreadyInactive: boolean;
}

interface Actor {
  id: string;
}

type Tx = Prisma.TransactionClient;

/**
 * Suppression « sûre », réservée au super admin.
 *
 * Un élément n'est supprimé définitivement que s'il n'a aucun historique
 * (ventes, mouvements de stock, réseau MLM…). Sinon la suppression est refusée
 * avec le détail de ce qui le relie, et l'interface propose de le désactiver :
 * la comptabilité, le stock et l'arbre MLM restent cohérents.
 *
 * Les ventes, retours et transferts ne sont pas supprimables : ce sont des
 * pièces comptables qui ont modifié le stock.
 */
@Injectable()
export class AdminDeletionService {
  private readonly logger = new Logger(AdminDeletionService.name);

  constructor(private readonly prisma: PrismaService) {}

  parseEntity(value: string): DeletableEntity {
    if ((DELETABLE_ENTITIES as readonly string[]).includes(value)) return value as DeletableEntity;
    throw new BadRequestException(`Type d'élément non supprimable : ${value}`);
  }

  async impact(entity: DeletableEntity, id: string, actor: Actor, db: Tx | PrismaService = this.prisma): Promise<DeletionImpact> {
    switch (entity) {
      case 'site': return this.siteImpact(id, db);
      case 'utilisateur': return this.userImpact(id, actor, db);
      case 'client': return this.clientImpact(id, db);
      case 'produit': return this.produitImpact(id, db);
    }
  }

  async remove(entity: DeletableEntity, id: string, actor: Actor): Promise<{ deleted: true; label: string }> {
    try {
      const label = await this.prisma.$transaction(async (tx) => {
        // Re-vérifier dans la transaction : une vente a pu être créée entre-temps.
        const impact = await this.impact(entity, id, actor, tx);
        if (impact.forbiddenReason) throw new ForbiddenException(impact.forbiddenReason);
        if (!impact.canDelete) {
          throw new ConflictException({
            code: 'ERR_DELETE_BLOCKED',
            message: `Impossible de supprimer « ${impact.label} » : ${describe(impact.blockers)}.`,
            blockers: impact.blockers,
          });
        }
        await this.deleteOwned(entity, id, tx);
        return impact.label;
      });
      this.logger.warn(`Suppression définitive ${entity} ${id} (« ${label} ») par ${actor.id}`);
      return { deleted: true, label };
    } catch (error) {
      // Filet de sécurité : une donnée liée non recensée ci-dessus.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new ConflictException({
          code: 'ERR_DELETE_BLOCKED',
          message: 'Cet élément est encore utilisé ailleurs dans l’application. Désactivez-le plutôt.',
          blockers: [],
        });
      }
      throw error;
    }
  }

  async deactivate(entity: DeletableEntity, id: string, actor: Actor): Promise<{ deactivated: true; label: string }> {
    const impact = await this.impact(entity, id, actor);
    if (impact.forbiddenReason) throw new ForbiddenException(impact.forbiddenReason);
    switch (entity) {
      case 'site': await this.prisma.site.update({ where: { id }, data: { actif: false } }); break;
      case 'utilisateur': await this.prisma.utilisateur.update({ where: { id }, data: { actif: false } }); break;
      case 'client': await this.prisma.client.update({ where: { id }, data: { statut: StatutClient.ARCHIVE } }); break;
      case 'produit': await this.prisma.produit.update({ where: { id }, data: { actif: false } }); break;
    }
    this.logger.warn(`Désactivation ${entity} ${id} (« ${impact.label} ») par ${actor.id}`);
    return { deactivated: true, label: impact.label };
  }

  // ── Impacts ─────────────────────────────────────────────────────

  private async siteImpact(id: string, db: Tx | PrismaService): Promise<DeletionImpact> {
    const site = await db.site.findUnique({ where: { id }, select: { nom: true, ville: true, actif: true } });
    if (!site) throw new NotFoundException('Site introuvable');
    const [utilisateurs, clients, ventes, mouvements, transferts, etapes, stock] = await Promise.all([
      db.utilisateur.count({ where: { siteId: id } }),
      db.client.count({ where: { siteInscriptionId: id } }),
      db.vente.count({ where: { siteId: id } }),
      db.mouvementStock.count({ where: { siteId: id } }),
      db.transfertStock.count({ where: { OR: [{ siteSourceId: id }, { siteDestinationId: id }] } }),
      db.onboardingEtape.count({ where: { siteId: id } }),
      db.stockSite.count({ where: { siteId: id, quantite: { not: 0 } } }),
    ]);
    return build('site', id, `${site.nom} (${site.ville})`, 'DESACTIVER', !site.actif, null, [
      ['utilisateurs', 'utilisateur(s) rattaché(s)', utilisateurs],
      ['clients', 'client(s) inscrit(s)', clients],
      ['ventes', 'vente(s)', ventes],
      ['mouvements', 'mouvement(s) de stock', mouvements],
      ['transferts', 'transfert(s) de stock', transferts],
      ['etapes', "étape(s) d'enregistrement de clients", etapes],
      ['stock', 'produit(s) encore en stock', stock],
    ]);
  }

  private async userImpact(id: string, actor: Actor, db: Tx | PrismaService): Promise<DeletionImpact> {
    const user = await db.utilisateur.findUnique({ where: { id }, select: { nom: true, role: true, actif: true } });
    if (!user) throw new NotFoundException('Utilisateur introuvable');

    let forbiddenReason: string | null = null;
    if (id === actor.id) {
      forbiddenReason = 'Vous ne pouvez pas supprimer ni désactiver votre propre compte.';
    } else if (user.role === Role.SUPER_ADMIN && user.actif) {
      const autresAdmins = await db.utilisateur.count({ where: { role: Role.SUPER_ADMIN, actif: true, id: { not: id } } });
      if (autresAdmins === 0) forbiddenReason = 'C’est le dernier super administrateur actif : il doit en rester au moins un.';
    }

    const [ventes, clients, etapes, mouvements, transferts, attributions, retours, retraits, placements] = await Promise.all([
      db.vente.count({ where: { agentId: id } }),
      db.client.count({ where: { createdById: id } }),
      db.onboardingEtape.count({ where: { agentId: id } }),
      db.mouvementStock.count({ where: { agentId: id } }),
      db.transfertStock.count({ where: { initiateurId: id } }),
      db.clientParrainAttribution.count({ where: { actorId: id } }),
      db.retour.count({ where: { agentId: id } }),
      db.withdrawalRequest.count({ where: { approvedById: id } }),
      db.placementHistory.count({ where: { actorId: id } }),
    ]);
    return build('utilisateur', id, user.nom, 'DESACTIVER', !user.actif, forbiddenReason, [
      ['ventes', 'vente(s) enregistrée(s)', ventes],
      ['clients', 'client(s) créé(s)', clients],
      ['etapes', "étape(s) d'enregistrement validée(s)", etapes],
      ['mouvements', 'mouvement(s) de stock', mouvements],
      ['transferts', 'transfert(s) de stock lancé(s)', transferts],
      ['attributions', 'attribution(s) de parrain', attributions],
      ['retours', 'retour(s) traité(s)', retours],
      ['retraits', 'demande(s) de retrait approuvée(s)', retraits],
      ['placements', 'placement(s) dans le réseau', placements],
    ]);
  }

  private async clientImpact(id: string, db: Tx | PrismaService): Promise<DeletionImpact> {
    const client = await db.client.findUnique({ where: { id }, select: { prenom: true, nom: true, statut: true } });
    if (!client) throw new NotFoundException('Client introuvable');
    const [ventes, membre, filleuls, claims, attributions, paiements] = await Promise.all([
      db.vente.count({ where: { clientId: id } }),
      db.membre.count({ where: { clientId: id } }),
      db.client.count({ where: { parrainClientId: id } }),
      db.parrainClaim.count({ where: { parrainClientId: id } }),
      db.clientParrainAttribution.count({ where: { parrainClientId: id } }),
      db.onboardingEtape.count({
        where: { clientId: id, OR: [{ montant: { not: null } }, { kpayTransactions: { some: {} } }] },
      }),
    ]);
    return build('client', id, `${client.prenom} ${client.nom}`.trim(), 'ARCHIVER', client.statut === StatutClient.ARCHIVE, null, [
      ['ventes', 'vente(s)', ventes],
      ['membre', 'compte dans le réseau MLM (commissions, portefeuille)', membre],
      ['filleuls', 'filleul(s)', filleuls],
      ['claims', 'demande(s) de parrainage reçue(s)', claims + attributions],
      ['paiements', "paiement(s) d'adhésion enregistré(s)", paiements],
    ]);
  }

  private async produitImpact(id: string, db: Tx | PrismaService): Promise<DeletionImpact> {
    const produit = await db.produit.findUnique({ where: { id }, select: { nom: true, sku: true, actif: true } });
    if (!produit) throw new NotFoundException('Produit introuvable');
    const [ventes, retours, mouvements, transferts, stock] = await Promise.all([
      db.ligneVente.count({ where: { produitId: id } }),
      db.ligneRetour.count({ where: { produitId: id } }),
      db.mouvementStock.count({ where: { produitId: id } }),
      db.transfertStock.count({ where: { produitId: id } }),
      db.stockSite.count({ where: { produitId: id, quantite: { not: 0 } } }),
    ]);
    return build('produit', id, `${produit.nom} (${produit.sku})`, 'DESACTIVER', !produit.actif, null, [
      ['ventes', 'vente(s)', ventes],
      ['retours', 'retour(s)', retours],
      ['mouvements', 'mouvement(s) de stock', mouvements],
      ['transferts', 'transfert(s)', transferts],
      ['stock', 'site(s) où il reste du stock', stock],
    ]);
  }

  // ── Suppression : l'élément et ce qui n'appartient qu'à lui ─────────

  private async deleteOwned(entity: DeletableEntity, id: string, tx: Tx) {
    switch (entity) {
      case 'site':
        await tx.stockSite.deleteMany({ where: { siteId: id } }); // lignes de stock à zéro
        await tx.site.delete({ where: { id } });
        return;
      case 'utilisateur':
        await tx.exportJob.deleteMany({ where: { ownerId: id } });
        await tx.utilisateur.delete({ where: { id } });
        return;
      case 'client':
        await tx.onboardingEtape.deleteMany({ where: { clientId: id } }); // étapes non payées
        await tx.parrainClaim.deleteMany({ where: { filleulClientId: id } });
        await tx.clientParrainAttribution.deleteMany({ where: { clientId: id } });
        await tx.client.delete({ where: { id } });
        return;
      case 'produit':
        await tx.stockSite.deleteMany({ where: { produitId: id } }); // lignes de stock à zéro
        await tx.produit.delete({ where: { id } });
        return;
    }
  }
}

function build(
  entity: DeletableEntity,
  id: string,
  label: string,
  fallback: DeletionImpact['fallback'],
  alreadyInactive: boolean,
  forbiddenReason: string | null,
  rows: Array<[string, string, number]>,
): DeletionImpact {
  const blockers = rows.filter(([, , count]) => count > 0).map(([key, l, count]) => ({ key, label: l, count }));
  return { entity, id, label, canDelete: !forbiddenReason && blockers.length === 0, blockers, forbiddenReason, fallback, alreadyInactive };
}

function describe(blockers: DeletionBlocker[]): string {
  return blockers.map((b) => `${b.count} ${b.label}`).join(', ');
}
