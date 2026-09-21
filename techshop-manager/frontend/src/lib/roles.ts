import type { Role } from '@/types';

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
