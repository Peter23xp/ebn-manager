import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { MlmWalletService } from './mlm-wallet.service';

@Injectable()
export class MlmMatrixService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly walletService: MlmWalletService,
  ) {}

  /**
   * Called when a client is activated (statut ACTIF).
   * Creates the Membre record, Portefeuille, and level-1 Matrix.
   * Fills the parrain's matrix position and triggers promotion if matrix is complete.
   */
  async onClientActivated(clientId: string, parrainCode?: string): Promise<void> {
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true, matriculeExterne: true, codeParrain: true, parrainClientId: true },
    });
    if (!client) throw new NotFoundException(`Client ${clientId} introuvable`);

    const targetParrainIdentifier = parrainCode || client.parrainClientId;

    // Resolve parrain by Membre.id, Membre.clientId, Membre.matricule, Client.id, Client.codeParrain, Client.matriculeExterne
    let parrainId: string | null = null;
    let parrainMembreClientId: string | null = null;

    if (targetParrainIdentifier) {
      const parrainMembre = await this.prisma.membre.findFirst({
        where: {
          OR: [
            { id: targetParrainIdentifier },
            { clientId: targetParrainIdentifier },
            { matricule: targetParrainIdentifier },
            { client: { id: targetParrainIdentifier } },
            { client: { codeParrain: targetParrainIdentifier } },
            { client: { matriculeExterne: targetParrainIdentifier } },
          ],
        },
        select: { id: true, clientId: true },
      });
      if (parrainMembre) {
        parrainId = parrainMembre.id;
        parrainMembreClientId = parrainMembre.clientId;
      }
    }

    // Check if already a member
    const existing = await this.prisma.membre.findUnique({ where: { clientId } });
    if (existing) {
      // If member already exists but has no parrainId and we resolved a parrainId, attach it and fill matrix position
      if (!existing.parrainId && parrainId && parrainId !== existing.id) {
        await this.prisma.$transaction(async (tx) => {
          await tx.membre.update({
            where: { id: existing.id },
            data: { parrainId },
          });
          if (!client.parrainClientId && parrainMembreClientId) {
            await tx.client.update({
              where: { id: clientId },
              data: { parrainClientId: parrainMembreClientId },
            });
          }
          const parrainMembre = await tx.membre.findUnique({
            where: { id: parrainId! },
            select: { mlmLevelId: true },
          });
          if (parrainMembre) {
            await this._fillParrainPosition(tx, parrainId!, existing.id, parrainMembre.mlmLevelId);
          }
        }, { timeout: 30000, maxWait: 10000 });
      }
      return;
    }

    // Get level 1
    const level1 = await this.prisma.mlmLevel.findFirst({ where: { ordre: 1 } });
    if (!level1) throw new BadRequestException('MlmLevel niveau 1 introuvable — seed la DB d\'abord');

    // Prefixe du matricule AAAAMMJJXXXX
    const now = new Date();
    const prefix = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;

    // Deux activations simultanées le même jour peuvent calculer le même
    // matricule (count + 1 non atomique) → collision P2002. Postgres avorte la
    // transaction au premier échec : on rejoue donc la transaction ENTIÈRE
    // (le corps est idempotent grâce aux guards findUnique/existing).
    const run = () => this.prisma.$transaction(async (tx) => {
      // If client didn't have parrainClientId set but we resolved it from parrainCode, persist it on Client
      if (!client.parrainClientId && parrainMembreClientId) {
        await tx.client.update({
          where: { id: clientId },
          data: { parrainClientId: parrainMembreClientId },
        });
      }

      const countToday = await tx.membre.count({
        where: { matricule: { startsWith: prefix } },
      });
      // CLAUDE.md : matricule = AAAAMMJJ#### — refuse au-delà de 9 999 le
      // même jour plutôt que d'émettre un suffixe de 5 chiffres silencieux.
      if (countToday + 1 > 9999) {
        throw new BadRequestException(`Quota de 9 999 activations atteint pour le ${prefix} — séquence matricule saturée.`);
      }
      const membre = await tx.membre.create({
        data: {
          clientId,
          matricule: `${prefix}${String(countToday + 1).padStart(4, '0')}`,
          parrainId,
          mlmLevelId: level1.id,
          statut: 'ACTIF',
        },
      });

      // Create wallet
      await tx.portefeuille.create({ data: { membreId: membre.id } });

      // Create level-1 matrix with 4 empty positions in a single query
      await tx.matrix.create({
        data: {
          membreId: membre.id,
          mlmLevelId: level1.id,
          positions: {
            createMany: {
              data: [1, 2, 3, 4].map((n) => ({ numeroPosition: n })),
            },
          },
        },
      });

      // Fill parrain's matrix if exists — à son NIVEAU COURANT (un parrain
      // promu doit être rémunéré sur le taux de son niveau, pas bloqué au
      // niveau 1 complet).
      if (parrainId) {
        const parrainMembre = await tx.membre.findUnique({
          where: { id: parrainId },
          select: { mlmLevelId: true },
        });
        await this._fillParrainPosition(tx, parrainId, membre.id, parrainMembre?.mlmLevelId ?? level1.id);
      }
    }, { timeout: 30000, maxWait: 10000 });

    for (let attempt = 0; ; attempt++) {
      try {
        await run();
        break;
      } catch (err: any) {
        const target = String(err?.meta?.target ?? '');
        if (err?.code === 'P2002') {
          // Deux activations concurrentes du MÊME client : la perdue doit
          // recevoir un 4xx propre, pas un 500 brut.
          if (target.includes('clientId')) {
            throw new BadRequestException('Ce client est déjà membre du réseau (activation concurrente).');
          }
          if (target.includes('matricule') && attempt < 4) continue;
        }
        throw err;
      }
    }
  }

  /**
   * Fill the next available position in the parrain's level matrix.
   * Triggers promotion check when matrix is complete (4/4 filled).
   */
  private async _fillParrainPosition(
    tx: Prisma.TransactionClient,
    parrainId: string,
    filleulId: string,
    mlmLevelId: number,
  ): Promise<void> {
    // Find or create parrain's matrix for this level
    let matrix = await tx.matrix.findUnique({
      where: { membreId_mlmLevelId: { membreId: parrainId, mlmLevelId } },
      include: { positions: { orderBy: { numeroPosition: 'asc' } } },
    });

    if (!matrix) {
      matrix = await tx.matrix.create({
        data: {
          membreId: parrainId,
          mlmLevelId,
          positions: {
            createMany: {
              data: [1, 2, 3, 4].map((n) => ({ numeroPosition: n })),
            },
          },
        },
        include: { positions: { orderBy: { numeroPosition: 'asc' } } },
      });
    }

    if (matrix.estComplete) return;

    // Idempotence : le même filleul ne doit jamais occuper deux positions.
    if (matrix.positions.some((p) => p.estValide && p.filleulId === filleulId)) return;

    // Réclamation atomique d'une position vide : updateMany avec le filtre
    // estValide:false sérialise deux activations concurrentes sous le même
    // parrain. Si la position visée a été prise entre-temps, on reprend une
    // autre candidate (sinon on sort — matrice pleine pour cette transaction).
    let claimedPosition = false;
    for (let attempt = 0; attempt < matrix.positions.length + 1 && !claimedPosition; attempt++) {
      const candidates = await tx.position.findMany({
        where: { matrixId: matrix.id, estValide: false },
        orderBy: { numeroPosition: 'asc' },
      });
      if (candidates.length === 0) return;
      const claim = await tx.position.updateMany({
        where: { id: candidates[0].id, estValide: false },
        data: { filleulId, estValide: true, dateValidation: new Date() },
      });
      claimedPosition = claim.count === 1;
    }
    if (!claimedPosition) return;

    // ── Rémunération À CHAQUE filleul validé (règle « X USD / filleul ») ──
    // Le parrain n'attend pas 4/4 : chaque filleul qui occupe une position
    // génère sa propre commission, avec le split 60/40 du niveau.
    await this._creditFilleulCommission(tx, parrainId, filleulId, mlmLevelId);

    // L'update de la matrice SERIALISE la logique de complétion : une
    // transaction concurrente est bloquée ici jusqu'au commit de l'autre.
    await tx.matrix.update({
      where: { id: matrix.id },
      data: { filleulsValides: { increment: 1 } },
    });

    // Autorité = positions réellement validées (le compteur lu hors verrou
    // était périmé sous concurrence). updateMany estComplete false→true :
    // une seule des transactions concurrentes gagne et déclenche la promo.
    const valides = await tx.position.count({
      where: { matrixId: matrix.id, estValide: true },
    });
    let promoted = false;
    if (valides >= 4) {
      const flip = await tx.matrix.updateMany({
        where: { id: matrix.id, estComplete: false },
        data: { estComplete: true, dateComplete: new Date() },
      });
      promoted = flip.count === 1;
    }

    if (promoted) {
      await this._triggerPromotion(tx, parrainId, mlmLevelId, filleulId);
    }
  }

  /**
   * Rémunération à CHAQUE filleul validé : crée une Commission VALIDEE de
   * `commissionParFilleul` et crédite IMMÉDIATEMENT 100 % du portefeuille :
   * - 60 % (montantSysteme) → soldeDisponible (retirable de suite)
   * - 40 % (montantRetour)  → soldeReinvesti, bloqué J+30 (creditReinvestInTx)
   * La validation admin ne porte plus sur la commission, uniquement sur les
   * demandes de retrait. Idempotent via referenceId (parrain+filleul+niveau).
   */
  private async _creditFilleulCommission(
    tx: Prisma.TransactionClient,
    parrainId: string,
    filleulId: string,
    mlmLevelId: number,
  ): Promise<void> {
    const level = await tx.mlmLevel.findUnique({ where: { id: mlmLevelId } });
    if (!level) return;

    const commissionRef = `commission-${parrainId}-level${level.ordre}-${filleulId}`;
    const existing = await tx.commission.findUnique({ where: { referenceId: commissionRef } });
    if (existing) return;

    const montantParFilleul = Number(level.commissionParFilleul);
    const montantSysteme = Number(level.commissionSysteme);
    const montantRetour = Number(level.commissionRetour);
    // Repli pour un niveau sans split configuré : tout va dans la poche dispo.
    const dispo = montantSysteme + montantRetour > 0 ? montantSysteme : montantParFilleul;
    const retourn = montantSysteme + montantRetour > 0 ? montantRetour : 0;

    const commission = await tx.commission.create({
      data: {
        membreId: parrainId,
        filleulId,
        mlmLevelId,
        montant: montantParFilleul,
        montantSysteme,
        montantRetour,
        statut: 'VALIDEE',
        valideeAt: new Date(),
        referenceId: commissionRef,
        description: `Commission niveau ${level.nom} — filleul validé (${montantParFilleul} USD/filleul, split 60/40)`,
      },
    });

    // Garantir l'existence du portefeuille avant les deux crédits
    let portefeuille = await tx.portefeuille.findUnique({
      where: { membreId: parrainId },
      select: { id: true },
    });
    if (!portefeuille) {
      await tx.portefeuille.create({
        data: { membreId: parrainId, soldeDisponible: 0, totalGagne: 0 },
      });
    }

    // 60 % → soldeDisponible, retirable immédiatement
    if (dispo > 0) {
      await this.walletService.creditWalletInTx(
        tx,
        parrainId,
        dispo,
        'COMMISSION',
        commission.description,
        commissionRef,
      );
    }

    // 40 % → poche réinvestissement bloquée J+30
    if (retourn > 0) {
      await this.walletService.creditReinvestInTx(tx, parrainId, retourn, commission.id, level.nom);
    }
  }

  /**
   * Promotion au niveau suivant quand la matrice est complète (4/4).
   * Ne crée AUCUNE commission : la rémunération est déjà versée à chaque
   * filleul validé (voir _creditFilleulCommission), crédit immediate 100 %.
   */
  private async _triggerPromotion(
    tx: Prisma.TransactionClient,
    membreId: string,
    completedLevelId: number,
    triggerFilleulId: string,
  ): Promise<void> {
    const [completedLevel, membre] = await Promise.all([
      tx.mlmLevel.findUnique({ where: { id: completedLevelId } }),
      tx.membre.findUnique({
        where: { id: membreId },
        include: { level: true, parrain: true },
      }),
    ]);

    if (!completedLevel || !membre) return;

    // Find next level
    const nextLevel = await tx.mlmLevel.findFirst({
      where: { ordre: { gt: completedLevel.ordre }, isActive: true },
      orderBy: { ordre: 'asc' },
    });

    if (nextLevel) {
      // Promote member
      await tx.membre.update({
        where: { id: membreId },
        data: { mlmLevelId: nextLevel.id },
      });

      // Record promotion history
      await tx.promotion.create({
        data: {
          membreId,
          niveauAvantId: completedLevel.id,
          niveauApresId: nextLevel.id,
          commissionVersee: completedLevel.commissionTotale,
          declencheParId: triggerFilleulId,
        },
      });

      // NOTE : la rémunération est versée À CHAQUE FILLEUL validé (voir
      // _creditFilleulPosition → _creditFilleulCommission), pas à la complétion.
      // Les 4 filleuls du niveau ont donc déjà généré 4 × montantParFilleul
      // (= commissionTotale), split 60/40. Ne PAS re-créditer ici.

      // Create BonusAttribue (physical bonus — also EN_ATTENTE by default)
      await tx.bonusAttribue.create({
        data: {
          membreId,
          mlmLevelId: nextLevel.id,
          description: nextLevel.bonusDescription,
          statut: 'EN_ATTENTE',
        },
      });

      // Create matrix for next level
      const existingMatrix = await tx.matrix.findUnique({
        where: { membreId_mlmLevelId: { membreId, mlmLevelId: nextLevel.id } },
      });
      if (!existingMatrix) {
        await tx.matrix.create({
          data: {
            membreId,
            mlmLevelId: nextLevel.id,
            positions: {
              createMany: {
                data: [1, 2, 3, 4].map((n) => ({ numeroPosition: n })),
              },
            },
          },
        });
      }

      // Salary: only applicable for eligible levels — create EN_ATTENTE record
      // (salary credit also requires admin validation; stored via SalaireVerse with statut PENDING)
      if (nextLevel.salaireActif && Number(nextLevel.salaireMensuel) > 0) {
        const moisAnnee = new Date().toISOString().slice(0, 7);
        const exists = await tx.salaireVerse.findUnique({
          where: { membreId_moisAnnee: { membreId, moisAnnee } },
        });
        if (!exists) {
          await tx.salaireVerse.create({
            data: {
              membreId,
              montant: nextLevel.salaireMensuel,
              moisAnnee,
              statut: 'EN_ATTENTE',
            },
          });
        }
      }

      // Handle Crown Ambassador retirement bonus (level 8)
      if (nextLevel.ordre === 8 && membre.parrainId) {
        const existing = await tx.bonusRetraite.findUnique({
          where: { membreId_filleulCrownId: { membreId: membre.parrainId, filleulCrownId: membreId } },
        });
        if (!existing) {
          // Create retirement bonus EN_ATTENTE — no automatic wallet credit
          await tx.bonusRetraite.create({
            data: { membreId: membre.parrainId, filleulCrownId: membreId, statut: 'EN_ATTENTE' },
          });
        }
      }

      // Fill parrain's next-level matrix
      if (membre.parrainId && nextLevel) {
        await this._fillParrainPosition(tx, membre.parrainId, membreId, nextLevel.id);
      }
    }
  }

  // ── Get member matrix ───────────────────────────────────────────────────────

  async getMemberMatrix(memberId: string, levelId: number) {
    const matrix = await this.prisma.matrix.findUnique({
      where: { membreId_mlmLevelId: { membreId: memberId, mlmLevelId: levelId } },
      include: {
        positions: { orderBy: { numeroPosition: 'asc' } },
        level: true,
      },
    });
    if (!matrix) throw new NotFoundException(`Matrix non trouvée pour membre ${memberId} niveau ${levelId}`);
    return matrix;
  }

  // ── Get network tree ────────────────────────────────────────────────────────

  async getNetworkTree(memberId: string, depth = 3) {
    const membre = await this.prisma.membre.findUnique({
      where: { id: memberId },
      include: {
        client: { select: { id: true, prenom: true, nom: true } },
        level: { select: { id: true, ordre: true, nom: true, couleur: true } },
      },
    });
    if (!membre) throw new NotFoundException(`Membre ${memberId} introuvable`);

    const buildTree = async (mId: string, currentDepth: number): Promise<any> => {
      if (currentDepth <= 0) return null;
      const m = await this.prisma.membre.findUnique({
        where: { id: mId },
        include: {
          client: { select: { id: true, prenom: true, nom: true } },
          level: { select: { id: true, ordre: true, nom: true, couleur: true } },
          matrices: {
            where: { estComplete: false },
            select: { mlmLevelId: true, filleulsValides: true },
            orderBy: { level: { ordre: 'desc' } },
            take: 1,
          },
          filleuls: {
            include: {
              client: { select: { id: true, prenom: true, nom: true } },
              level: { select: { id: true, ordre: true, nom: true, couleur: true } },
            },
          },
        },
      });
      if (!m) return null;

      const currentMatrix = m.matrices[0];
      const children = await Promise.all(
        m.filleuls.map((f) => buildTree(f.id, currentDepth - 1)),
      );

      return {
        id: m.id,
        matricule: m.matricule,
        client: m.client,
        level: m.level,
        statut: m.statut,
        dateInscription: m.dateInscription,
        dateActivation: m.dateActivation,
        progression: currentMatrix
          ? { filleulsValides: currentMatrix.filleulsValides, filleulsRequis: 4 }
          : null,
        children: children.filter(Boolean),
      };
    };

    return buildTree(memberId, depth);
  }

  // ── Commission management ───────────────────────────────────────────────────

  async listCommissions(params: {
    page?: number;
    limit?: number;
    statut?: string;
    membreId?: string;
    levelId?: number;
    dateFrom?: string;
    dateTo?: string;
  }) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.CommissionWhereInput = {};
    if (params.statut) where.statut = params.statut as any;
    if (params.membreId) where.membreId = params.membreId;
    if (params.levelId) where.mlmLevelId = params.levelId;
    if (params.dateFrom || params.dateTo) {
      where.createdAt = {};
      if (params.dateFrom) (where.createdAt as any).gte = new Date(params.dateFrom);
      if (params.dateTo) (where.createdAt as any).lte = new Date(params.dateTo);
    }

    const [commissions, total] = await Promise.all([
      this.prisma.commission.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          membre: {
            include: { client: { select: { id: true, prenom: true, nom: true, telephone: true } } },
          },
          filleul: {
            include: { client: { select: { id: true, prenom: true, nom: true } } },
          },
          level: { select: { id: true, ordre: true, nom: true, couleur: true } },
        },
      }),
      this.prisma.commission.count({ where }),
    ]);

    // Résumé GLOBAL par statut (indépendant du filtre/pagination de la page)
    const groups = await this.prisma.commission.groupBy({
      by: ['statut'],
      _count: { id: true },
      _sum: { montant: true },
    });
    const summary: Record<string, { count: number; montant: number }> = {};
    for (const g of groups) {
      summary[g.statut] = { count: g._count.id, montant: Number(g._sum.montant ?? 0) };
    }

    return {
      commissions: commissions.map((c) => ({
        ...c,
        montant: Number(c.montant),
      })),
      summary,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async validateCommission(commissionId: string): Promise<any> {
    const commission = await this.prisma.commission.findUnique({ where: { id: commissionId } });
    if (!commission) throw new NotFoundException(`Commission ${commissionId} introuvable`);
    if (commission.statut !== 'EN_ATTENTE')
      throw new BadRequestException(`Commission déjà traitée (statut: ${commission.statut})`);

    return this.prisma.$transaction(async (tx) => {
      // Transition atomique EN_ATTENTE → VALIDEE : sans ce verrou, deux clics
      // simultanés créditent deux fois le portefeuille.
      const transition = await tx.commission.updateMany({
        where: { id: commissionId, statut: 'EN_ATTENTE' },
        data: { statut: 'VALIDEE', valideeAt: new Date() },
      });
      if (transition.count === 0) {
        throw new BadRequestException('Commission déjà traitée (course)');
      }
      const updated = await tx.commission.findUnique({ where: { id: commissionId } }) as any;

      // Credit wallet with montantSysteme only: montantRetour was already auto-credited
      // at commission creation (réinvestissement automatique).
      const montantACrediter = Number(commission.montantSysteme) > 0
        ? Number(commission.montantSysteme)
        : Number(commission.montant); // fallback pour commissions antérieures sans split

      await this.walletService.creditWalletInTx(
        tx,
        commission.membreId,
        montantACrediter,
        'COMMISSION',
        commission.description,
        commission.referenceId,
      );

      return { ...updated, montant: Number(updated.montant) };
    }, { timeout: 30000, maxWait: 10000 });
  }

  /**
   * Simple marquage comptable : sous le modèle « crédit 100 % immédiat »,
   * l'argent est déjà dans le portefeuille et le débit réel intervient à
   * l'approbation du retrait (voir approveWithdrawalRequest). Ne PAS débiter
   * ici — sinon double débit.
   */
  async payCommission(commissionId: string): Promise<any> {
    const commission = await this.prisma.commission.findUnique({ where: { id: commissionId } });
    if (!commission) throw new NotFoundException(`Commission ${commissionId} introuvable`);
    if (commission.statut !== 'VALIDEE')
      throw new BadRequestException(`La commission doit être validée avant d'être marquée comme payée`);

    // Transition atomique VALIDEE → PAYEE : sans ce verrou, un « Marquer
    // payée » concurrent à une annulation (crédit déjà restitué) pourrait
    // écraser ANNULEE en PAYEE et rendre la ligne incancellable.
    const updated = await this.prisma.commission.updateMany({
      where: { id: commissionId, statut: 'VALIDEE' },
      data: { statut: 'PAYEE', payeeAt: new Date() },
    });
    if (updated.count === 0) {
      throw new BadRequestException('Commission déjà traitée (course)');
    }
    const row = await this.prisma.commission.findUnique({ where: { id: commissionId } }) as any;
    return { ...row, montant: Number(row.montant) };
  }

  /**
   * Annulation comptable : comme le crédit est immédiat (modèle « 100 % au
   * portefeuille »), annuler une commission RESTITUE l'argent au système.
   * - 60 % non retirés → débit de soldeDisponible.
   * - 40 % : lot J+30 encore bloqué → débit de soldeReinvesti + lot supprimé ;
   *   lot déjà libéré → débit de soldeDisponible.
   * Refusé si le membre a déjà retiré l'argent (solde insuffisant).
   */
  async cancelCommission(commissionId: string, notes?: string): Promise<any> {
    const commission = await this.prisma.commission.findUnique({ where: { id: commissionId } });
    if (!commission) throw new NotFoundException(`Commission ${commissionId} introuvable`);
    if (commission.statut === 'PAYEE')
      throw new BadRequestException(`Impossible d'annuler une commission déjà payée`);
    if (commission.statut === 'ANNULEE') return { ...commission, montant: Number(commission.montant) };

    return this.prisma.$transaction(async (tx) => {
      // Transition atomique (EN_ATTENTE|VALIDEE) → ANNULEE : deux annulations
      // simultanées ne doivent pas débiter deux fois.
      const transition = await tx.commission.updateMany({
        where: { id: commissionId, statut: { in: ['EN_ATTENTE', 'VALIDEE'] } },
        data: { statut: 'ANNULEE', notes },
      });
      if (transition.count === 0) {
        const already = await tx.commission.findUnique({ where: { id: commissionId } }) as any;
        return { ...already, montant: Number(already.montant) };
      }

      const pfRow = await tx.portefeuille.findUnique({
        where: { membreId: commission.membreId },
        select: { id: true },
      });
      if (pfRow) {
        // Même ordre de verrous que le cron de libération (portefeuille →
        // lots) pour éviter l'interblocage ; le lock rend les lectures qui
        // suivent stables (check-then-decrement non verrouillé impossible).
        const locked = await tx.$queryRaw<Array<{ solde_disponible: Prisma.Decimal; solde_reserve: Prisma.Decimal; solde_reinvesti: Prisma.Decimal }>>`
          SELECT solde_disponible, solde_reserve, solde_reinvesti FROM portefeuilles WHERE id = ${pfRow.id} FOR UPDATE
        `;
        if (!locked.length) throw new BadRequestException('Portefeuille introuvable (course)');
        const [pf] = locked;

        // Restituer UNIQUEMENT ce qui a réellement été crédité (via le journal
        // et les lots), sinon une commission jamais créditée (legacy EN_ATTENTE)
        // creuserait un solde négatif.
        const credits = await tx.transactionPortefeuille.findMany({
          where: { referenceId: commission.referenceId, type: 'COMMISSION' },
          select: { montant: true },
        });
        const dispoCredite = credits.reduce((s, c) => s.plus(new Prisma.Decimal(Number(c.montant))), new Prisma.Decimal(0));
        const lots = await tx.reinvestLote.findMany({ where: { commissionId: commission.id } });
        const bloques = lots.filter((l) => !l.released).reduce((s, l) => s.plus(new Prisma.Decimal(Number(l.amount))), new Prisma.Decimal(0));
        const lotsCredites = lots.reduce((s, l) => s.plus(new Prisma.Decimal(Number(l.amount))), new Prisma.Decimal(0));
        const liberes = lotsCredites.minus(bloques); // part 40 % déjà basculée en dispo
        const aDebiterDispo = dispoCredite.plus(liberes);
        const totalRestitue = dispoCredite.plus(lotsCredites);

        // Solvabilité : le débit doit laisser soldeDisponible >= soldeReserve
        // (l'argent engagé dans une demande de retrait en attente n'est pas
        // réstituable — sinon l'approbation future serait insolvable).
        const soldeDispo = Number(pf.solde_disponible);
        const soldeReserve = Number(pf.solde_reserve);
        const soldeReinvesti = Number(pf.solde_reinvesti);
        const apresDebit = soldeDispo - Number(aDebiterDispo);
        if (apresDebit < soldeReserve || soldeReinvesti < Number(bloques)) {
          throw new BadRequestException(
            soldeReserve > 0
              ? 'Annulation impossible : une partie du solde est engagée dans une demande de retrait en attente.'
              : 'Solde insuffisant pour annuler : le membre a déjà retiré une partie de cette commission.',
          );
        }
        if (aDebiterDispo.gt(0) || bloques.gt(0)) {
          await tx.portefeuille.update({
            where: { id: pfRow.id },
            data: {
              soldeDisponible: { decrement: aDebiterDispo },
              soldeReinvesti: { decrement: bloques },
              totalGagne: { decrement: totalRestitue },
            },
          });
          await tx.reinvestLote.deleteMany({ where: { commissionId: commission.id, released: false } });
          await tx.transactionPortefeuille.create({
            data: {
              portefeuilleId: pfRow.id,
              type: 'DEBIT',
              montant: totalRestitue,
              description: `Annulation commission — ${commission.description}`,
              referenceId: commission.id,
            },
          });
        }
      }
      const updated = await tx.commission.findUnique({ where: { id: commissionId } }) as any;
      return { ...updated, montant: Number(updated.montant) };
    }, { timeout: 30000, maxWait: 10000 });
  }

  // ── Pending bonuses ─────────────────────────────────────────────────────────

  async getPendingBonuses(params: { page?: number; limit?: number }) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const skip = (page - 1) * limit;

    const [bonuses, total] = await Promise.all([
      this.prisma.bonusAttribue.findMany({
        where: { statut: 'EN_ATTENTE' },
        skip,
        take: limit,
        orderBy: { dateAttribution: 'desc' },
        include: {
          membre: {
            include: {
              client: { select: { id: true, prenom: true, nom: true, telephone: true } },
            },
          },
          level: { select: { id: true, ordre: true, nom: true } },
        },
      }),
      this.prisma.bonusAttribue.count({ where: { statut: 'EN_ATTENTE' } }),
    ]);

    return {
      bonuses,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async deliverBonus(bonusId: string) {
    const bonus = await this.prisma.bonusAttribue.findUnique({ where: { id: bonusId } });
    if (!bonus) throw new NotFoundException(`Bonus ${bonusId} introuvable`);
    if (bonus.statut !== 'EN_ATTENTE')
      throw new BadRequestException(`Bonus déjà traité (statut: ${bonus.statut})`);

    return this.prisma.bonusAttribue.update({
      where: { id: bonusId },
      data: { statut: 'LIVRE', dateLivraison: new Date() },
    });
  }

  // ── Salaries ────────────────────────────────────────────────────────────────

  async getMemberSalaries(memberId: string) {
    return this.prisma.salaireVerse.findMany({
      where: { membreId: memberId },
      orderBy: { moisAnnee: 'desc' },
    });
  }

  async getAllSalariesForPeriod(period: string) {
    return this.prisma.salaireVerse.findMany({
      where: { moisAnnee: period },
      include: {
        membre: {
          include: {
            client: { select: { id: true, prenom: true, nom: true } },
            level: { select: { id: true, ordre: true, nom: true } },
          },
        },
      },
    });
  }

  // ── Retirement bonuses ──────────────────────────────────────────────────────

  async getMemberRetirement(memberId: string) {
    return this.prisma.bonusRetraite.findMany({
      where: { membreId: memberId },
      include: {
        filleulCrown: {
          include: { client: { select: { id: true, prenom: true, nom: true } } },
        },
      },
      orderBy: { dateVersement: 'desc' },
    });
  }

  async validateRetirement(bonusId: string): Promise<any> {
    const bonus = await this.prisma.bonusRetraite.findUnique({ where: { id: bonusId } });
    if (!bonus) throw new NotFoundException(`Bonus retraite ${bonusId} introuvable`);
    if (bonus.statut !== 'EN_ATTENTE')
      throw new BadRequestException(`Bonus retraite déjà traité`);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.bonusRetraite.update({
        where: { id: bonusId },
        data: { statut: 'PAYE' },
      });

      // Credit wallet for retirement bonus upon admin validation
      await this.walletService.creditWalletInTx(
        tx,
        bonus.membreId,
        Number(bonus.montant),
        'BONUS_RETRAITE',
        `Bonus retraite — filleul Crown Ambassadeur (validé)`,
        `bonus-retraite-${bonus.membreId}-${bonus.filleulCrownId}`,
      );

      return updated;
    }, { timeout: 30000, maxWait: 10000 });
  }
}
