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
    // Check if already a member
    const existing = await this.prisma.membre.findUnique({ where: { clientId } });
    if (existing) return;

    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true, matriculeExterne: true, codeParrain: true },
    });
    if (!client) throw new NotFoundException(`Client ${clientId} introuvable`);

    // Resolve parrain
    let parrainId: string | null = null;
    if (parrainCode) {
      const parrainClient = await this.prisma.client.findUnique({
        where: { codeParrain: parrainCode },
        include: { membre: true },
      });
      if (parrainClient?.membre) {
        parrainId = parrainClient.membre.id;
      }
    }

    // Get level 1
    const level1 = await this.prisma.mlmLevel.findFirst({ where: { ordre: 1 } });
    if (!level1) throw new BadRequestException('MlmLevel niveau 1 introuvable — seed la DB d\'abord');

    // Generate matricule
    const count = await this.prisma.membre.count();
    const matricule = `EBN-${String(count + 1).padStart(5, '0')}`;

    // Create member + wallet + matrix in a transaction
    await this.prisma.$transaction(async (tx) => {
      const membre = await tx.membre.create({
        data: {
          clientId,
          matricule,
          parrainId,
          mlmLevelId: level1.id,
          statut: 'ACTIF',
        },
      });

      // Create wallet
      await tx.portefeuille.create({ data: { membreId: membre.id } });

      // Create level-1 matrix
      const matrix = await tx.matrix.create({
        data: {
          membreId: membre.id,
          mlmLevelId: level1.id,
        },
      });

      // Create 4 empty positions
      await tx.position.createMany({
        data: [1, 2, 3, 4].map((n) => ({
          matrixId: matrix.id,
          numeroPosition: n,
        })),
      });

      // Fill parrain's matrix if exists
      if (parrainId) {
        await this._fillParrainPosition(tx, parrainId, membre.id, level1.id);
      }
    });
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

    const emptyPosition = matrix.positions.find((p) => !p.estValide);
    if (!emptyPosition) return;

    await tx.position.update({
      where: { id: emptyPosition.id },
      data: {
        filleulId,
        estValide: true,
        dateValidation: new Date(),
      },
    });

    const newFilleulsValides = matrix.filleulsValides + 1;
    const isNowComplete = newFilleulsValides >= 4;

    await tx.matrix.update({
      where: { id: matrix.id },
      data: {
        filleulsValides: { increment: 1 },
        estComplete: isNowComplete,
        dateComplete: isNowComplete ? new Date() : undefined,
      },
    });

    if (isNowComplete) {
      await this._triggerPromotion(tx, parrainId, mlmLevelId);
    }
  }

  /**
   * Promote the member to the next level, credit their wallet, create next level matrix.
   */
  private async _triggerPromotion(
    tx: Prisma.TransactionClient,
    membreId: string,
    completedLevelId: number,
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

    // Promote
    if (nextLevel) {
      await tx.membre.update({
        where: { id: membreId },
        data: { mlmLevelId: nextLevel.id },
      });

      // Record promotion
      await tx.promotion.create({
        data: {
          membreId,
          niveauAvantId: completedLevel.id,
          niveauApresId: nextLevel.id,
          commissionVersee: completedLevel.commissionTotale,
          declencheParId: membreId,
        },
      });

      // Credit commission to wallet
      await this.walletService.creditWalletInTx(
        tx,
        membreId,
        Number(completedLevel.commissionTotale),
        'COMMISSION',
        `Commission niveau ${completedLevel.nom} (promotion)`,
        `promotion-${membreId}-${completedLevel.id}`,
      );

      // Credit bonus to BonusAttribue
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

      // Handle salary if level has one
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
            },
          });
          await this.walletService.creditWalletInTx(
            tx,
            membreId,
            Number(nextLevel.salaireMensuel),
            'SALAIRE',
            `Salaire ${nextLevel.nom} — ${moisAnnee}`,
            `salaire-${membreId}-${moisAnnee}`,
          );
        }
      }

      // Handle Crown Ambassador retirement bonus (level 8)
      if (nextLevel.ordre === 8 && membre.parrainId) {
        const existing = await tx.bonusRetraite.findUnique({
          where: { membreId_filleulCrownId: { membreId: membre.parrainId, filleulCrownId: membreId } },
        });
        if (!existing) {
          await tx.bonusRetraite.create({
            data: { membreId: membre.parrainId, filleulCrownId: membreId },
          });
          await this.walletService.creditWalletInTx(
            tx,
            membre.parrainId,
            50000,
            'BONUS_RETRAITE',
            `Bonus retraite — filleul Crown Ambassadeur`,
            `bonus-retraite-${membre.parrainId}-${membreId}`,
          );
        }
      }

      // Now fill parrain's next-level matrix
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
          filleuls: {
            include: {
              client: { select: { id: true, prenom: true, nom: true } },
              level: { select: { id: true, ordre: true, nom: true, couleur: true } },
            },
          },
        },
      });
      if (!m) return null;

      const children = await Promise.all(
        m.filleuls.map((f) => buildTree(f.id, currentDepth - 1)),
      );

      return {
        id: m.id,
        matricule: m.matricule,
        client: m.client,
        level: m.level,
        statut: m.statut,
        children: children.filter(Boolean),
      };
    };

    return buildTree(memberId, depth);
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
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
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
}
