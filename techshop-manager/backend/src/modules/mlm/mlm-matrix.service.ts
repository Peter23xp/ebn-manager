import { randomInt } from 'crypto';
import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { MlmWalletService } from './mlm-wallet.service';
import { MlmPlacementService } from './mlm-placement.service';
import { money } from './mlm-progressive';
import { generationCapacity, generationProgress, MATRIX_GENERATIONS } from './mlm-generation';

@Injectable()
export class MlmMatrixService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly walletService: MlmWalletService,
    private readonly placementService: MlmPlacementService = new MlmPlacementService(prisma),
  ) {}

  async onClientActivated(clientId: string, parrainCode?: string): Promise<void> {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await this.prisma.$transaction(
          tx => this.onClientActivatedInTx(tx, clientId, parrainCode),
          { timeout: 30000, maxWait: 10000 },
        );
        return;
      } catch (error) {
        if (attempt < 4 && (error?.code === 'P2034' || (error?.code === 'P2002' && String(error?.meta?.target).includes('matricule')))) continue;
        throw error;
      }
    }
  }

  async onClientActivatedInTx(tx: Prisma.TransactionClient, clientId: string, parrainCode?: string, actorId?: string): Promise<void> {
    await this.placementService.lock(tx);
    const client = await tx.client.findUnique({ where: { id: clientId } });
    if (!client) throw new NotFoundException('Client introuvable');
    if (client.statut !== 'ACTIF') throw new BadRequestException('Le client doit etre actif avant placement');
    const identifier = parrainCode || client.parrainClientId;
    const recruiter = identifier ? await tx.membre.findFirst({
      where: { OR: [
        { id: identifier }, { clientId: identifier }, { matricule: identifier },
        { client: { id: identifier } }, { client: { codeParrain: identifier } },
        { client: { matriculeExterne: identifier } },
      ] },
    }) : null;
    let member = await tx.membre.findUnique({ where: { clientId } });
    if (recruiter?.clientId === clientId) throw new BadRequestException('Auto-parrainage interdit');
    if (member?.parrainId && recruiter && member.parrainId !== recruiter.id) throw new BadRequestException('Le recruteur original ne peut pas etre remplace');
    const level = await tx.mlmLevel.findFirst({ where: { ordre: 1 } });
    if (!level) throw new BadRequestException('Configurer les huit niveaux MLM avant activation');
    if (!member) {
      const now = new Date();
      const prefix = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
      const occupied = new Set((await tx.membre.findMany({
        where: { matricule: { startsWith: prefix } }, select: { matricule: true },
      })).map(existing => existing.matricule));
      const available = Array.from({ length: 10000 }, (_, suffix) => prefix + String(suffix).padStart(4, '0'))
        .filter(candidate => !occupied.has(candidate));
      if (!available.length) throw new ConflictException('Tous les matricules du jour sont attribues');
      const matricule = available[randomInt(available.length)];
      member = await tx.membre.create({ data: {
        clientId, matricule, parrainId: recruiter?.id, mlmLevelId: level.id, statut: 'ACTIF',
      } });
      await tx.portefeuille.create({ data: { membreId: member.id } });
      await tx.matrix.create({ data: {
        membreId: member.id, mlmLevelId: level.id,
        positions: { createMany: { data: [1, 2, 3, 4].map(numeroPosition => ({ numeroPosition })) } },
      } });
    } else if (!member.parrainId && recruiter) {
      member = await tx.membre.update({ where: { id: member.id }, data: { parrainId: recruiter.id } });
    }
    if (!client.parrainClientId && recruiter) {
      await tx.client.update({ where: { id: clientId }, data: { parrainClientId: recruiter.clientId } });
    }
    if (member.parrainId) {
      if (actorId) await this.placementService.place(tx, member.id, member.parrainId, actorId);
      else await this.placementService.place(tx, member.id, member.parrainId);
    }
  }

  async getMemberMatrix(memberId: string, levelId: number) {
    const matrix = await this.prisma.matrix.findUnique({
      where: { membreId_mlmLevelId: { membreId: memberId, mlmLevelId: levelId } },
      include: { positions: { orderBy: { numeroPosition: 'asc' }, include: { filleul: { include: { client: { select: { id: true, nom: true, prenom: true, telephone: true } } } } } }, level: true },
    });
    if (!matrix) throw new NotFoundException('Matrice introuvable');
    return { ...matrix, requiredPositions: generationCapacity(matrix.level.ordre), remainingPositions: generationCapacity(matrix.level.ordre) - matrix.filleulsValides };
  }

  async getNetworkTree(memberId: string, depth = 3, tx: Prisma.TransactionClient = this.prisma) {
    if (!Number.isInteger(depth) || depth < 0 || depth > 3) throw new BadRequestException('Profondeur autorisee : 0 a 3');
    const levels = await tx.mlmLevel.findMany({ orderBy: { ordre: 'asc' } });
    const nodes = new Map<string, any>();
    let frontier = [memberId];
    for (let generation = 0; generation <= depth && frontier.length; generation++) {
      const members = await tx.membre.findMany({
        where: { id: { in: frontier } },
        include: {
          client: { select: { id: true, prenom: true, nom: true } },
          parrain: { select: { id: true, matricule: true, client: { select: { nom: true, prenom: true } } } },
          matrixPosition: { include: { matrix: { select: { membre: { select: { id: true, matricule: true, client: { select: { nom: true, prenom: true } } } } } } } },
          matrices: { include: { level: true, positions: { orderBy: { numeroPosition: 'asc' } } } },
          _count: { select: { filleuls: true } },
        },
      });
      frontier = [];
      for (const member of members) {
        const slots = member.matrices.find(matrix => matrix.level.ordre === 1)?.positions ?? [];
        const progression = generationProgress(levels, member.matrices.map(matrix => ({ ordre: matrix.level.ordre, count: matrix.filleulsValides })), member.highestLevelAchieved);
        nodes.set(member.id, {
          id: member.id, matricule: member.matricule, client: member.client, statut: member.statut,
          dateActivation: member.dateActivation, dateInscription: member.dateInscription,
          level: progression.currentLevel, recruiter: member.parrain, matrixParent: member.matrixPosition?.matrix.membre ?? null,
          generation, position: member.matrixPosition?.numeroPosition ?? null, positionId: member.matrixPosition?.id ?? null,
          progression: { ...progression, filleulsValides: progression.completedPositions, filleulsRequis: progression.requiredPositions },
          directMatrixChildrenCount: slots.filter(slot => slot.filleulId).length,
          personalRecruitCount: member._count.filleuls, totalDescendants: member.totalDescendants,
          emptyPositions: slots.filter(slot => !slot.filleulId).map(slot => slot.numeroPosition),
          childIds: slots.flatMap(slot => slot.filleulId ? [slot.filleulId] : []), children: [],
        });
        frontier.push(...slots.flatMap(slot => slot.filleulId ? [slot.filleulId] : []));
      }
    }
    const root = nodes.get(memberId);
    if (!root) throw new NotFoundException('Membre introuvable');
    for (const node of nodes.values()) {
      node.children = node.childIds.map(id => nodes.get(id)).filter(Boolean);
      node.hasMore = node.childIds.length > node.children.length;
      delete node.childIds;
    }
    return root;
  }

  async getNetworkGeneration(memberId: string, generation: number, page = 1, limit = 20) {
    if (!Number.isInteger(generation) || generation < 1 || generation > MATRIX_GENERATIONS) throw new BadRequestException('Generation autorisee : 1 a 8');
    page = Math.max(1, page); limit = Math.min(100, Math.max(1, limit));
    const rows = await this.prisma.$queryRaw<Array<{ id: string; parentId: string; position: number }>>`
      WITH RECURSIVE network(id, depth, path, parent_id, slot) AS (
        SELECT ${memberId}::text, 0, ARRAY[]::integer[], NULL::text, 0
        UNION ALL
        SELECT position."filleulId", network.depth + 1, network.path || position."numeroPosition", network.id, position."numeroPosition"
        FROM network JOIN matrices matrix ON matrix."membreId" = network.id
        JOIN mlm_levels level ON level.id = matrix."mlmLevelId" AND level.ordre = 1
        JOIN positions position ON position."matrixId" = matrix.id
        WHERE position."filleulId" IS NOT NULL AND network.depth < ${generation}
      )
      SELECT id, parent_id AS "parentId", slot AS position FROM network WHERE depth = ${generation}
      ORDER BY path LIMIT ${limit} OFFSET ${(page - 1) * limit}
    `;
    const members = await this.prisma.membre.findMany({
      where: { id: { in: rows.map(row => row.id) } },
      select: { id: true, matricule: true, statut: true, parrainId: true, client: { select: { nom: true, prenom: true } } },
    });
    const matrix = await this.prisma.matrix.findFirst({ where: { membreId: memberId, level: { ordre: generation } } });
    return {
      items: rows.map(row => ({ ...members.find(member => member.id === row.id), parentId: row.parentId, position: row.position, generation })),
      meta: { page, limit, total: matrix?.occupiedPositions ?? 0 },
    };
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
    const limit = Math.min(100, Math.max(1, params.limit ?? 20));
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
          reinvestLot: true,
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
        montant: c.montant.toFixed(2),
        montantSysteme: c.montantSysteme.toFixed(2),
        montantRetour: c.montantRetour.toFixed(2),
      })),
      summary,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async validateCommission(commissionId: string, actorId?: string): Promise<any> {
    const initial = await this.prisma.commission.findUnique({ where: { id: commissionId } });
    if (!initial) throw new NotFoundException('Commission introuvable');
    return this.prisma.$transaction(async tx => {
      const wallet = await tx.portefeuille.findUnique({ where: { membreId: initial.membreId }, select: { id: true } });
      if (!wallet) throw new NotFoundException('Portefeuille introuvable');
      await tx.$queryRaw`SELECT id FROM portefeuilles WHERE id = ${wallet.id} FOR UPDATE`;
      const commission = await tx.commission.findUnique({ where: { id: commissionId } });
      if (commission.statut === 'VALIDEE' || commission.statut === 'PAYEE') return commission;
      if (commission.statut !== 'EN_ATTENTE') throw new BadRequestException('Commission annulee');
      money(commission.montant);
      money(commission.montantSysteme);
      money(commission.montantRetour);
      if (!commission.montant.equals(commission.montantSysteme.plus(commission.montantRetour))) throw new BadRequestException('Montants de commission incoherents');
      const validatedAt = new Date();
      const transition = await tx.commission.updateMany({
        where: { id: commissionId, statut: 'EN_ATTENTE' },
        data: { statut: 'VALIDEE', valideeAt: validatedAt, validatedById: actorId },
      });
      if (transition.count !== 1) throw new BadRequestException('Commission deja traitee');
      const level = await tx.mlmLevel.findUnique({ where: { id: commission.mlmLevelId } });
      if (commission.montantSysteme.gt(0)) await this.walletService.creditWalletInTx(tx, commission.membreId, commission.montantSysteme, 'COMMISSION', commission.description, commission.referenceId);
      if (commission.montantRetour.gt(0)) await this.walletService.creditReinvestInTx(tx, commission.membreId, commission.montantRetour, commission.id, level.nom, validatedAt);
      return tx.commission.findUnique({ where: { id: commissionId }, include: { reinvestLot: true } });
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

  async cancelCommission(commissionId: string, notes?: string): Promise<any> {
    const initial = await this.prisma.commission.findUnique({ where: { id: commissionId } });
    if (!initial) throw new NotFoundException('Commission introuvable');
    return this.prisma.$transaction(async tx => {
      const wallet = await tx.portefeuille.findUnique({ where: { membreId: initial.membreId }, select: { id: true } });
      const locked = wallet ? await tx.$queryRaw<Array<{ soldeDisponible: Prisma.Decimal; soldeReserve: Prisma.Decimal; soldeReinvesti: Prisma.Decimal }>>`
        SELECT "soldeDisponible", "soldeReserve", "soldeReinvesti" FROM portefeuilles WHERE id = ${wallet.id} FOR UPDATE
      ` : [];
      const commission = await tx.commission.findUnique({ where: { id: commissionId } });
      if (commission.statut === 'ANNULEE') return commission;
      if (commission.statut === 'PAYEE') throw new BadRequestException('Impossible d annuler une commission payee');
      const transition = await tx.commission.updateMany({
        where: { id: commissionId, statut: commission.statut }, data: { statut: 'ANNULEE', notes },
      });
      if (transition.count !== 1) throw new BadRequestException('Commission deja traitee');
      if (commission.statut === 'VALIDEE') {
        if (!locked.length) throw new BadRequestException('Portefeuille introuvable');
        const credits = await tx.transactionPortefeuille.findMany({
          where: { referenceId: commission.referenceId, type: 'COMMISSION', portefeuilleId: wallet.id }, select: { montant: true },
        });
        const immediate = credits.reduce((sum, credit) => sum.plus(credit.montant), new Prisma.Decimal(0));
        const lots = await tx.reinvestLote.findMany({ where: { commissionId, status: { not: 'CANCELLED' } } });
        const held = lots.filter(lot => lot.status !== 'RELEASED').reduce((sum, lot) => sum.plus(lot.amount), new Prisma.Decimal(0));
        const released = lots.filter(lot => lot.status === 'RELEASED').reduce((sum, lot) => sum.plus(lot.amount), new Prisma.Decimal(0));
        const availableDebit = immediate.plus(released);
        const total = availableDebit.plus(held);
        const balance = locked[0];
        if (new Prisma.Decimal(balance.soldeDisponible).minus(availableDebit).lt(balance.soldeReserve) || new Prisma.Decimal(balance.soldeReinvesti).lt(held)) {
          throw new BadRequestException('Solde insuffisant ou engage dans un retrait');
        }
        await tx.portefeuille.update({ where: { id: wallet.id }, data: {
          soldeDisponible: { decrement: availableDebit }, soldeReinvesti: { decrement: held }, totalGagne: { decrement: total },
        } });
        await tx.reinvestLote.updateMany({ where: { commissionId, status: { not: 'CANCELLED' } }, data: { status: 'CANCELLED' } });
        await tx.transactionPortefeuille.create({ data: {
          portefeuilleId: wallet.id, type: 'DEBIT', montant: total,
          description: `Annulation commission — ${commission.description}`, referenceId: `cancel:${commissionId}`,
        } });
      }
      return tx.commission.findUnique({ where: { id: commissionId }, include: { reinvestLot: true } });
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
