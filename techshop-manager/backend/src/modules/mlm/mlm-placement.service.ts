import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { MlmLevel, Position, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { generationCapacity, generationProgress, MATRIX_GENERATIONS } from './mlm-generation';

export interface MovePlacement {
  memberId: string;
  newParentId: string;
  newPosition: number;
  expectedPositionId: string | null;
  operationId: string;
  reason: string;
}

export interface SwapPlacement {
  memberId: string;
  otherMemberId: string;
  expectedPositionId: string;
  otherExpectedPositionId: string;
  operationId: string;
  reason: string;
}

@Injectable()
export class MlmPlacementService {
  constructor(private readonly prisma: PrismaService) {}

  async lock(tx: Prisma.TransactionClient) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(604008)`;
  }

  async place(tx: Prisma.TransactionClient, memberId: string, recruiterId: string, actorId?: string) {
    await this.lock(tx);
    if (memberId === recruiterId) throw new BadRequestException('Auto-placement interdit');
    const existing = await tx.position.findUnique({ where: { filleulId: memberId } });
    if (existing) return existing;
    const member = await tx.membre.findUnique({ where: { id: memberId } });
    if (!member) throw new NotFoundException('Membre introuvable');
    await this.rejectCycle(tx, memberId, recruiterId);
    let position = await tx.position.findFirst({
      where: { filleulId: null, matrix: { membreId: recruiterId, level: { ordre: 1 }, membre: { statut: 'ACTIF' } } },
      orderBy: { numeroPosition: 'asc' }, include: { matrix: true },
    });
    if (!position) {
      const candidates = await tx.$queryRaw<Array<{ id: string }>>`
        WITH RECURSIVE network(id, depth, path) AS (
          SELECT ${recruiterId}::text, 0, ARRAY[]::integer[]
          UNION ALL
          SELECT position."filleulId", network.depth + 1, network.path || position."numeroPosition"
          FROM network JOIN matrices matrix ON matrix."membreId" = network.id
          JOIN mlm_levels level ON level.id = matrix."mlmLevelId" AND level.ordre = 1
          JOIN positions position ON position."matrixId" = matrix.id
          WHERE position."filleulId" IS NOT NULL
        )
        SELECT position.id FROM network JOIN membres member ON member.id = network.id AND member.statut = 'ACTIF'
        JOIN matrices matrix ON matrix."membreId" = network.id
        JOIN mlm_levels level ON level.id = matrix."mlmLevelId" AND level.ordre = 1
        JOIN positions position ON position."matrixId" = matrix.id AND position."filleulId" IS NULL
        ORDER BY network.depth, network.path, position."numeroPosition", position.id LIMIT 1
      `;
      if (candidates[0]) position = await tx.position.findUnique({ where: { id: candidates[0].id }, include: { matrix: true } });
    }
    if (!position) throw new ConflictException('Aucune position active disponible dans ce reseau');
    await this.claim(tx, position.id, memberId, member.statut === 'ACTIF');
    await tx.placementHistory.create({ data: {
      memberId, recruiterId: member.parrainId, newParentId: position.matrix.membreId,
      newPosition: position.numeroPosition, actorId, reason: 'Placement initial / spillover',
      operationType: 'PLACE', operationId: `placement:${memberId}`,
    } });
    await this.updateDescendantTotals(tx, memberId, null, position.matrix.membreId);
    await this.recalculateAncestors(tx, [position.matrix.membreId], memberId, position.id);
    await this.settleAscents(tx, [position.matrix.membreId, memberId], `placement:${memberId}`, memberId, actorId);
    return tx.position.findUniqueOrThrow({ where: { filleulId: memberId }, include: { matrix: true } });
  }

  private async claim(tx: Prisma.TransactionClient, positionId: string, memberId: string, valid: boolean, validatedAt: Date | null = new Date()) {
    const claimed = await tx.position.updateMany({
      where: { id: positionId, filleulId: null },
      data: { filleulId: memberId, estValide: valid, dateValidation: valid ? validatedAt : null },
    });
    if (claimed.count !== 1) throw new ConflictException('Position occupee, recharger la matrice');
  }

  private async exchangePositions(tx: Prisma.TransactionClient, first: Position, second: Position) {
    const released = await tx.position.updateMany({
      where: { OR: [{ id: first.id, filleulId: first.filleulId }, { id: second.id, filleulId: second.filleulId }] },
      data: { filleulId: null, estValide: false, dateValidation: null },
    });
    if (released.count !== 2) throw new ConflictException('Les placements ont change pendant l echange');
    await this.claim(tx, second.id, first.filleulId, first.estValide, first.dateValidation);
    await this.claim(tx, first.id, second.filleulId, second.estValide, second.dateValidation);
  }

  private async rejectCycle(tx: Prisma.TransactionClient, memberId: string, parentId: string) {
    if (memberId === parentId) throw new BadRequestException('Un membre ne peut pas etre son propre parent');
    const ancestors = await tx.$queryRaw<Array<{ id: string }>>`
      WITH RECURSIVE ancestors(id) AS (
        SELECT ${parentId}::text UNION
        SELECT matrix."membreId" FROM ancestors ancestor
        JOIN positions position ON position."filleulId" = ancestor.id
        JOIN matrices matrix ON matrix.id = position."matrixId"
      ) SELECT id FROM ancestors WHERE id = ${memberId}
    `;
    if (ancestors.length) throw new BadRequestException('Ce deplacement creerait un cycle');
  }

  private async replay(tx: Prisma.TransactionClient, operationId: string, memberId: string, actorId: string, reason: string, type: string) {
    const rows = await tx.placementHistory.findMany({ where: { operationId }, orderBy: { memberId: 'asc' } });
    if (!rows.length) return null;
    const row = rows.find(history => history.memberId === memberId);
    if (!row || row.actorId !== actorId || row.reason !== reason || row.operationType !== type) {
      throw new ConflictException('Cle d operation deja utilisee pour une autre demande');
    }
    return rows;
  }

  async move(input: MovePlacement, actorId: string) {
    return this.prisma.$transaction(async tx => {
      await this.lock(tx);
      const replay = await this.replay(tx, input.operationId, input.memberId, actorId, input.reason, 'MOVE');
      if (replay) {
        const previous = replay.find(row => row.memberId === input.memberId);
        if (previous.newParentId !== input.newParentId || previous.newPosition !== input.newPosition) throw new ConflictException('Cle d operation reutilisee');
        return replay;
      }
      const current = await tx.position.findUnique({ where: { filleulId: input.memberId }, include: { matrix: true } });
      if ((current?.id ?? null) !== input.expectedPositionId) throw new ConflictException('Le placement a change, recharger');
      await this.rejectCycle(tx, input.memberId, input.newParentId);
      const member = await tx.membre.findUnique({ where: { id: input.memberId } });
      if (!member) throw new NotFoundException('Membre introuvable');
      const destination = await tx.position.findFirst({
        where: { numeroPosition: input.newPosition, matrix: { membreId: input.newParentId, level: { ordre: 1 }, membre: { statut: 'ACTIF' } } },
      });
      if (!destination || destination.filleulId) throw new ConflictException('Position cible indisponible');
      if (current) await tx.position.update({ where: { id: current.id }, data: { filleulId: null, estValide: false, dateValidation: null } });
      await this.claim(tx, destination.id, member.id, member.statut === 'ACTIF');
      const history = await tx.placementHistory.create({ data: {
        memberId: member.id, recruiterId: member.parrainId, oldParentId: current?.matrix.membreId,
        newParentId: input.newParentId, oldPosition: current?.numeroPosition, newPosition: input.newPosition,
        actorId, reason: input.reason, operationId: input.operationId, operationType: 'MOVE',
      } });
      await this.updateDescendantTotals(tx, member.id, current?.matrix.membreId ?? null, input.newParentId);
      await this.recalculateAncestors(tx, [current?.matrix.membreId, input.newParentId].filter(Boolean), member.id, destination.id);
      await this.settleAscents(tx, [input.newParentId, current?.matrix.membreId, member.id].filter(Boolean), input.operationId, member.id, actorId);
      return [history];
    }, { timeout: 30000, maxWait: 10000 });
  }

  async swap(input: SwapPlacement, actorId: string) {
    return this.prisma.$transaction(async tx => {
      await this.lock(tx);
      const replay = await this.replay(tx, input.operationId, input.memberId, actorId, input.reason, 'SWAP');
      if (replay) {
        if (replay.length !== 2 || !replay.some(row => row.memberId === input.otherMemberId)) throw new ConflictException('Cle d operation reutilisee');
        return replay;
      }
      if (input.memberId === input.otherMemberId) throw new BadRequestException('Choisir deux membres distincts');
      const positions = await tx.position.findMany({
        where: { filleulId: { in: [input.memberId, input.otherMemberId] } }, include: { matrix: { include: { membre: true } }, filleul: true },
      });
      const first = positions.find(position => position.filleulId === input.memberId);
      const second = positions.find(position => position.filleulId === input.otherMemberId);
      if (!first || !second || first.id !== input.expectedPositionId || second.id !== input.otherExpectedPositionId) throw new ConflictException('Placements obsoletes ou racine sans position');
      if (first.matrix.membre.statut !== 'ACTIF' || second.matrix.membre.statut !== 'ACTIF') throw new BadRequestException('Parent cible inactif');
      await this.rejectCycle(tx, first.filleulId, second.matrix.membreId);
      await this.rejectCycle(tx, second.filleulId, first.matrix.membreId);
      await this.exchangePositions(tx,
        { ...first, estValide: first.filleul.statut === 'ACTIF', dateValidation: new Date() },
        { ...second, estValide: second.filleul.statut === 'ACTIF', dateValidation: new Date() });
      for (const [from, to] of [[first, second], [second, first]]) {
        await tx.placementHistory.create({ data: {
          memberId: from.filleulId, recruiterId: from.filleul.parrainId,
          oldParentId: from.matrix.membreId, newParentId: to.matrix.membreId,
          oldPosition: from.numeroPosition, newPosition: to.numeroPosition,
          actorId, reason: input.reason, operationId: input.operationId, operationType: 'SWAP',
        } });
      }
      await this.updateDescendantTotals(tx, first.filleulId, first.matrix.membreId, second.matrix.membreId);
      await this.updateDescendantTotals(tx, second.filleulId, second.matrix.membreId, first.matrix.membreId);
      await this.recalculateAncestors(tx, [first.matrix.membreId, second.matrix.membreId], input.memberId, second.id);
      await this.settleAscents(tx, [first.matrix.membreId, second.matrix.membreId, input.memberId, input.otherMemberId], input.operationId, input.memberId, actorId);
      return tx.placementHistory.findMany({ where: { operationId: input.operationId } });
    }, { timeout: 30000, maxWait: 10000 });
  }

  private async settleAscents(tx: Prisma.TransactionClient, affectedIds: string[], operationId: string, triggeringMemberId: string, actorId?: string) {
    const pending = new Set<string>();
    const enqueueNeighborhood = async (memberIds: string[]) => {
      let frontier = [...new Set(memberIds)];
      for (let depth = 0; depth <= 2 && frontier.length; depth++) {
        for (const memberId of frontier) pending.add(memberId);
        if (depth === 2) break;
        const children = await tx.position.findMany({
          where: { matrix: { membreId: { in: frontier }, level: { ordre: 1 } }, filleulId: { not: null } },
          select: { filleulId: true }, orderBy: [{ matrixId: 'asc' }, { numeroPosition: 'asc' }],
        });
        frontier = children.map(child => child.filleulId);
      }
    };
    await enqueueNeighborhood(affectedIds);
    while (pending.size) {
      const memberId = pending.values().next().value as string;
      pending.delete(memberId);
      const member = await tx.membre.findUnique({
        where: { id: memberId },
        include: {
          matrixPosition: { include: { matrix: { include: { membre: true, level: true } } } },
          matrices: { where: { level: { ordre: 1 } }, include: { positions: { include: { filleul: { select: { statut: true } } } } } },
        },
      });
      const current = member?.matrixPosition;
      const children = member?.matrices[0]?.positions ?? [];
      if (!current?.estValide || current.matrix.level.ordre !== 1 || member.statut !== 'ACTIF'
        || children.filter(child => child.estValide && child.filleul?.statut === 'ACTIF').length !== generationCapacity(1)) continue;
      const parent = current.matrix.membre;
      if (parent.statut !== 'ACTIF') continue;
      const occupied = await tx.position.count({ where: { matrixId: current.matrixId, filleulId: { not: null } } });
      if (occupied >= generationCapacity(1)) continue;
      const parentPosition = await tx.position.findUnique({
        where: { filleulId: parent.id },
        include: { matrix: { include: { membre: true, level: true, positions: { orderBy: { numeroPosition: 'asc' } } } } },
      });
      if (!parentPosition?.estValide || parentPosition.matrix.level.ordre !== 1 || parentPosition.matrix.membre.statut !== 'ACTIF') continue;
      let destination = parentPosition.matrix.positions.find(slot => !slot.filleulId);
      let displaced: { id: string; parrainId: string | null } | null = null;
      let displacedChildren = 0;
      if (!destination) {
        const siblings = parentPosition.matrix.positions.filter(slot => slot.filleulId && slot.filleulId !== parent.id);
        const branches = await tx.matrix.findMany({
          where: { membreId: { in: siblings.map(slot => slot.filleulId) }, level: { ordre: 1 } },
          select: { membreId: true, _count: { select: { positions: { where: { filleulId: { not: null } } } } } },
        });
        const counts = new Map(branches.map(branch => [branch.membreId, branch._count.positions]));
        destination = siblings.filter(slot => counts.has(slot.filleulId) && counts.get(slot.filleulId) < generationCapacity(1))
          .sort((first, second) => counts.get(first.filleulId) - counts.get(second.filleulId) || first.numeroPosition - second.numeroPosition)[0];
        if (destination) {
          displaced = await tx.membre.findUniqueOrThrow({ where: { id: destination.filleulId }, select: { id: true, parrainId: true } });
          displacedChildren = counts.get(displaced.id);
        }
      }
      if (!destination) continue;
      const newParentId = parentPosition.matrix.membreId;
      await this.rejectCycle(tx, member.id, newParentId);
      if (displaced) {
        await this.rejectCycle(tx, displaced.id, parent.id);
        await this.exchangePositions(tx, current, destination);
      } else {
        const released = await tx.position.updateMany({
          where: { id: current.id, filleulId: member.id }, data: { filleulId: null, estValide: false, dateValidation: null },
        });
        if (released.count !== 1) throw new ConflictException('Le placement a change pendant la remontee');
        await this.claim(tx, destination.id, member.id, current.estValide, current.dateValidation);
      }
      const ascentOperationId = `${operationId}:ascend:${member.id}:${current.id}:${destination.id}`;
      const exchangeReason = displaced ? ` Echange avec la branche ${displaced.id} (${displacedChildren}/4 places occupees), hors propre parent ; egalite departagee par position.` : '';
      await tx.placementHistory.create({ data: {
        memberId: member.id, recruiterId: member.parrainId, oldParentId: parent.id, newParentId,
        oldPosition: current.numeroPosition, newPosition: destination.numeroPosition, actorId,
        operationType: 'AUTO_ASCEND', operationId: ascentOperationId,
        reason: `Remontee automatique : 4/4 avant le parent matriciel (${occupied}/4).${exchangeReason} Evenement : ${operationId}. Membre declencheur : ${triggeringMemberId}`,
      } });
      if (displaced) await tx.placementHistory.create({ data: {
        memberId: displaced.id, recruiterId: displaced.parrainId, oldParentId: newParentId, newParentId: parent.id,
        oldPosition: destination.numeroPosition, newPosition: current.numeroPosition, actorId,
        operationType: 'AUTO_DESCEND', operationId: ascentOperationId,
        reason: `Descente apres echange avec ${member.id} (4/4).${exchangeReason} Evenement : ${operationId}. Membre declencheur : ${triggeringMemberId}`,
      } });
      await this.updateDescendantTotals(tx, member.id, parent.id, newParentId);
      if (displaced) await this.updateDescendantTotals(tx, displaced.id, newParentId, parent.id);
      await this.recalculateAncestors(tx, [parent.id, newParentId], triggeringMemberId, destination.id);
      await enqueueNeighborhood([member.id, parent.id, newParentId]);
    }
  }

  async reconcileAscents(memberId: string, input: { operationId: string; reason: string }, actorId: string) {
    return this.prisma.$transaction(async tx => {
      await this.lock(tx);
      const replay = await this.replay(tx, input.operationId, memberId, actorId, input.reason, 'RECONCILE');
      if (!replay) {
        const member = await tx.membre.findUnique({ where: { id: memberId }, include: { matrixPosition: { include: { matrix: true } } } });
        if (!member) throw new NotFoundException('Membre introuvable');
        const position = member.matrixPosition;
        await tx.placementHistory.create({ data: {
          memberId, recruiterId: member.parrainId, actorId, operationId: input.operationId,
          operationType: 'RECONCILE', reason: input.reason,
          oldParentId: position?.matrix.membreId, newParentId: position?.matrix.membreId,
          oldPosition: position?.numeroPosition, newPosition: position?.numeroPosition,
        } });
        await this.settleAscents(tx, [memberId, position?.matrix.membreId].filter(Boolean), input.operationId, memberId, actorId);
      }
      return tx.placementHistory.findMany({
        where: { OR: [{ operationId: input.operationId }, { operationId: { startsWith: `${input.operationId}:ascend:` } }] },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
    }, { timeout: 30000, maxWait: 10000 });
  }

  private async updateDescendantTotals(tx: Prisma.TransactionClient, memberId: string, oldParentId: string | null, newParentId: string) {
    if (oldParentId === newParentId) return;
    await tx.$executeRaw`
      WITH RECURSIVE ancestors(id, delta) AS (
        SELECT parent.id, parent.delta FROM (VALUES (${oldParentId}::text, -1), (${newParentId}::text, 1)) AS parent(id, delta)
        WHERE parent.id IS NOT NULL
        UNION ALL
        SELECT matrix."membreId", ancestor.delta FROM ancestors ancestor
        JOIN positions position ON position."filleulId" = ancestor.id
        JOIN matrices matrix ON matrix.id = position."matrixId"
        JOIN mlm_levels level ON level.id = matrix."mlmLevelId" AND level.ordre = 1
      ), deltas AS (
        SELECT id, SUM(delta)::integer AS delta FROM ancestors GROUP BY id HAVING SUM(delta) <> 0
      )
      UPDATE membres member SET "totalDescendants" = member."totalDescendants" + deltas.delta * subtree.size
      FROM deltas, (SELECT "totalDescendants" + 1 AS size FROM membres WHERE id = ${memberId}) subtree
      WHERE member.id = deltas.id
    `;
  }

  async recalculateAncestors(tx: Prisma.TransactionClient, memberIds: string[], triggeringMemberId: string, positionId?: string) {
    if (!memberIds.length) return;
    const ancestors = await tx.$queryRaw<Array<{ id: string; depth: number; parentId: string | null }>>`
      WITH RECURSIVE ancestors(id, depth) AS (
        SELECT member.id, 0 FROM membres member WHERE member.id IN (${Prisma.join(memberIds)})
        UNION ALL
        SELECT matrix."membreId", ancestor.depth + 1 FROM ancestors ancestor
        JOIN positions position ON position."filleulId" = ancestor.id
        JOIN matrices matrix ON matrix.id = position."matrixId"
        JOIN mlm_levels level ON level.id = matrix."mlmLevelId" AND level.ordre = 1
        WHERE ancestor.depth < ${MATRIX_GENERATIONS - 1}
      ), affected AS (
        SELECT id, MAX(depth)::integer AS depth FROM ancestors GROUP BY id
      ) SELECT affected.*, matrix."membreId" AS "parentId" FROM affected
        LEFT JOIN positions position ON position."filleulId" = affected.id
        LEFT JOIN matrices matrix ON matrix.id = position."matrixId"
    `;
    const pending = new Map(ancestors.map(ancestor => [ancestor.id, ancestor]));
    const ordered: typeof ancestors = [];
    while (pending.size) {
      const parents = new Set([...pending.values()].map(ancestor => ancestor.parentId));
      const ready = [...pending.values()].filter(ancestor => !parents.has(ancestor.id))
        .sort((first, second) => first.id.localeCompare(second.id));
      if (!ready.length) throw new ConflictException('Cycle dans les ancetres affectes');
      for (const ancestor of ready) {
        ordered.push(ancestor);
        pending.delete(ancestor.id);
      }
    }
    const levels = await tx.mlmLevel.findMany({ orderBy: { ordre: 'asc' } });
    if (levels.length !== MATRIX_GENERATIONS || levels.some((level, index) => level.ordre !== index + 1)) throw new BadRequestException('Les huit niveaux MLM doivent etre configures');
    for (const ancestor of ordered) {
      const member = await tx.membre.findUnique({ where: { id: ancestor.id } });
      const children = await tx.position.findMany({
        where: { matrix: { membreId: ancestor.id, level: { ordre: 1 } }, filleulId: { not: null } },
        include: { filleul: { include: { matrices: { include: { level: true } } } } },
      });
      const validChildren = member.statut === 'ACTIF' ? children.filter(child => child.estValide && child.filleul.statut === 'ACTIF') : [];
      const matrices = [];
      for (const level of levels) {
        const count = level.ordre === 1 ? validChildren.length : validChildren.reduce((sum, child) =>
          sum + (child.filleul.matrices.find(matrix => matrix.level.ordre === level.ordre - 1)?.filleulsValides ?? 0), 0);
        const occupiedCount = level.ordre === 1 ? children.length : children.reduce((sum, child) =>
          sum + (child.filleul.matrices.find(matrix => matrix.level.ordre === level.ordre - 1)?.occupiedPositions ?? 0), 0);
        const complete = count === generationCapacity(level.ordre);
        const matrix = await tx.matrix.upsert({
          where: { membreId_mlmLevelId: { membreId: member.id, mlmLevelId: level.id } },
          create: { membreId: member.id, mlmLevelId: level.id, filleulsValides: count, occupiedPositions: occupiedCount, estComplete: complete, dateComplete: complete ? new Date() : null },
          update: { filleulsValides: count, occupiedPositions: occupiedCount, estComplete: complete, dateComplete: complete ? new Date() : null },
        });
        matrices.push({ ordre: level.ordre, count, occupiedCount });
        if (complete && level.isActive) {
          const previousLevelId = levels.find(previous => previous.ordre === member.highestLevelAchieved)?.id ?? 0;
          await this.completeGeneration(tx, member, level, matrix.id, triggeringMemberId, previousLevelId, positionId);
        }
        if (complete) member.highestLevelAchieved = Math.max(member.highestLevelAchieved, level.ordre);
      }
      const progression = generationProgress(levels, matrices, member.highestLevelAchieved);
      await tx.membre.update({ where: { id: member.id }, data: {
        mlmLevelId: progression.currentLevel?.id ?? levels[0].id,
        highestLevelAchieved: Math.max(member.highestLevelAchieved, progression.currentLevel?.ordre ?? 0),
      } });
    }
  }

  private async completeGeneration(tx: Prisma.TransactionClient, member: { id: string; parrainId: string | null; highestLevelAchieved: number }, level: MlmLevel, matrixId: string, triggerId: string, previousLevelId: number, positionId?: string) {
    const referenceId = `generation:${member.id}:${level.id}`;
    if (await tx.commission.findUnique({ where: { referenceId } })) return;
    if (!level.commissionTotale.equals(level.commissionSysteme.plus(level.commissionRetour))) throw new BadRequestException('Montants du niveau incoherents');
    await tx.commission.create({ data: {
      membreId: member.id, filleulId: triggerId, mlmLevelId: level.id, matrixId, positionId,
      montant: level.commissionTotale, montantSysteme: level.commissionSysteme, montantRetour: level.commissionRetour,
      referenceId, description: `Generation ${level.ordre} complete — ${level.nom}`, statut: 'EN_ATTENTE',
    } });
    await tx.promotion.create({ data: {
      membreId: member.id, niveauAvantId: previousLevelId, niveauApresId: level.id,
      commissionVersee: 0, declencheParId: triggerId,
    } });
    if (level.bonusDescription) await tx.bonusAttribue.create({ data: { membreId: member.id, mlmLevelId: level.id, description: level.bonusDescription } });
    if (level.salaireActif && level.salaireMensuel.gt(0)) {
      const moisAnnee = new Date().toISOString().slice(0, 7);
      await tx.salaireVerse.upsert({
        where: { membreId_moisAnnee: { membreId: member.id, moisAnnee } }, update: {},
        create: { membreId: member.id, montant: level.salaireMensuel, moisAnnee, statut: 'EN_ATTENTE' },
      });
    }
    if (level.ordre === MATRIX_GENERATIONS && member.parrainId) await tx.bonusRetraite.upsert({
      where: { membreId_filleulCrownId: { membreId: member.parrainId, filleulCrownId: member.id } }, update: {},
      create: { membreId: member.parrainId, filleulCrownId: member.id, statut: 'EN_ATTENTE' },
    });
  }

  async history(memberId: string, page = 1, limit = 20) {
    page = Math.max(1, page); limit = Math.min(100, Math.max(1, limit));
    const [items, total] = await Promise.all([
      this.prisma.placementHistory.findMany({ where: { memberId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * limit, take: limit }),
      this.prisma.placementHistory.count({ where: { memberId } }),
    ]);
    return { items, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }
}
