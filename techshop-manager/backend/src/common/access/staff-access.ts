import { ForbiddenException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';

export type StaffActor = { id: string; role: Role; siteId?: string | null };

export const ROLE_LEVEL: Record<Role, number> = {
  SUPER_ADMIN: 7,
  DIRECTEUR_REGIONAL: 6,
  GERANT: 5,
  CAISSIER: 4,
  AGENT: 3,
  FORMATEUR: 2,
  CLIENT: 1,
};

export function hasMinimumRole(role: Role | undefined, minimum: Role): boolean {
  const level = role === undefined ? undefined : ROLE_LEVEL[role];
  const minimumLevel = ROLE_LEVEL[minimum];
  return typeof level === 'number' && typeof minimumLevel === 'number' && level >= minimumLevel;
}

export function isSiteScopedStaff(role: Role): boolean {
  return role === 'AGENT' || role === 'CAISSIER';
}

export function requiresAssignedSite(role: Role): boolean {
  return ['GERANT', 'CAISSIER', 'AGENT', 'FORMATEUR'].includes(role);
}

export function effectiveStaffSite(actor: StaffActor, requestedSiteId?: string | null): string | undefined {
  if (!isSiteScopedStaff(actor.role)) return requestedSiteId ?? undefined;
  if (!actor.siteId) {
    throw new ForbiddenException({ code: 'ERR_SITE_REQUIRED', message: 'Un site doit être attribué à votre compte.' });
  }
  if (requestedSiteId && requestedSiteId !== actor.siteId) {
    throw new ForbiddenException({ code: 'ERR_SITE_FORBIDDEN', message: 'Opération réservée à votre site.' });
  }
  return actor.siteId;
}

export function assertStaffSite(actor: StaffActor, objectSiteId: string): void {
  effectiveStaffSite(actor, objectSiteId);
}

export function staffSalesWhere(actor: StaffActor, requestedSiteId?: string): Prisma.VenteWhereInput {
  const siteId = effectiveStaffSite(actor, requestedSiteId);
  return {
    ...(siteId ? { siteId } : {}),
    ...(isSiteScopedStaff(actor.role)
      ? { OR: [{ clientId: null }, { client: { siteInscriptionId: siteId } }] }
      : {}),
  };
}
