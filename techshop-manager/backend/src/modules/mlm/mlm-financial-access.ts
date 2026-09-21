import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { assertStaffSite, effectiveStaffSite, hasMinimumRole, StaffActor } from '../../common/access/staff-access';

export async function requireFinancialMemberAccess(tx: Prisma.TransactionClient, memberId: string, actor: StaffActor) {
  if (!hasMinimumRole(actor.role, Role.AGENT)) throw new ForbiddenException('Rôle insuffisant');
  effectiveStaffSite(actor);
  const member = await tx.membre.findUnique({ where: { id: memberId }, select: { client: { select: { siteInscriptionId: true } } } });
  if (!member) throw new NotFoundException('Membre introuvable');
  assertStaffSite(actor, member.client.siteInscriptionId);
}
