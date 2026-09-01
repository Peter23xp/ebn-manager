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
          const level1 = await tx.mlmLevel.findFirst({ where: { ordre: 1 } });
          if (level1) {
            await this._fillParrainPosition(tx, parrainId!, existing.id, level1.id);
          }
        }, { timeout: 30000, maxWait: 10000 });
      }
      return;
    }

    // Get level 1
    const level1 = await this.prisma.mlmLevel.findFirst({ where: { ordre: 1 } });
    if (!level1) throw new BadRequestException('MlmLevel niveau 1 introuvable — seed la DB d\'abord');

    // Generate matricule in AAAAMMJJXXXX format
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const prefix = `${yyyy}${mm}${dd}`;
    const countToday = await this.prisma.membre.count({
      where: { matricule: { startsWith: prefix } },
    });
    const matricule = `${prefix}${String(countToday + 1).padStart(4, '0')}`;

    // Create member + wallet + matrix in a transaction
    await this.prisma.$transaction(async (tx) => {
      // If client didn't have parrainClientId set but we resolved it from parrainCode, persist it on Client
      if (!client.parrainClientId && parrainMembreClientId) {
        await tx.client.update({
          where: { id: clientId },
          data: { parrainClientId: parrainMembreClientId },
        });
      }

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

      // Fill parrain's matrix if exists
      if (parrainId) {
        await this._fillParrainPosition(tx, parrainId, membre.id, level1.id);
      }
    }, { timeout: 30000, maxWait: 10000 });
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
      await this._triggerPromotion(tx, parrainId, mlmLevelId, filleulId);
    }
  }

  /**
   * OPTION B: Promote the member to the next level.
   * Creates a Commission record with EN_ATTENTE status (NO automatic wallet credit).
   * Wallet is only credited when admin validates the commission.
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

      // OPTION B: Create Commission EN_ATTENTE (no automatic wallet credit)
      const commissionRef = `commission-${membreId}-level${completedLevel.ordre}-${triggerFilleulId}`;
      const existingCommission = await tx.commission.findUnique({
        where: { referenceId: commissionRef },
      });
      if (!existingCommission) {
        await tx.commission.create({
          data: {
            membreId,
            filleulId: triggerFilleulId,
            mlmLevelId: completedLevelId,
            montant: completedLevel.commissionTotale,
            statut: 'EN_ATTENTE',
            referenceId: commissionRef,
            description: `Commission niveau ${completedLevel.nom} — 4 filleuls complétés`,
          },
        });
      }

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

    return {
      commissions: commissions.map((c) => ({
        ...c,
        montant: Number(c.montant),
      })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async validateCommission(commissionId: string): Promise<any> {
    const commission = await this.prisma.commission.findUnique({ where: { id: commissionId } });
    if (!commission) throw new NotFoundException(`Commission ${commissionId} introuvable`);
    if (commission.statut !== 'EN_ATTENTE')
      throw new BadRequestException(`Commission déjà traitée (statut: ${commission.statut})`);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.commission.update({
        where: { id: commissionId },
        data: { statut: 'VALIDEE', valideeAt: new Date() },
      });

      // Credit wallet now that it's validated
      await this.walletService.creditWalletInTx(
        tx,
        commission.membreId,
        Number(commission.montant),
        'COMMISSION',
        commission.description,
        commission.referenceId,
      );

      return { ...updated, montant: Number(updated.montant) };
    }, { timeout: 30000, maxWait: 10000 });
  }

  async payCommission(commissionId: string): Promise<any> {
    const commission = await this.prisma.commission.findUnique({ where: { id: commissionId } });
    if (!commission) throw new NotFoundException(`Commission ${commissionId} introuvable`);
    if (commission.statut !== 'VALIDEE')
      throw new BadRequestException(`La commission doit être validée avant d'être marquée comme payée`);

    const updated = await this.prisma.commission.update({
      where: { id: commissionId },
      data: { statut: 'PAYEE', payeeAt: new Date() },
    });
    return { ...updated, montant: Number(updated.montant) };
  }

  async cancelCommission(commissionId: string, notes?: string): Promise<any> {
    const commission = await this.prisma.commission.findUnique({ where: { id: commissionId } });
    if (!commission) throw new NotFoundException(`Commission ${commissionId} introuvable`);
    if (commission.statut === 'PAYEE')
      throw new BadRequestException(`Impossible d'annuler une commission déjà payée`);

    const updated = await this.prisma.commission.update({
      where: { id: commissionId },
      data: { statut: 'ANNULEE', notes },
    });
    return { ...updated, montant: Number(updated.montant) };
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
