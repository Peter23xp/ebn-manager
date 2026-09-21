import { describe, expect, it } from '@jest/globals';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { RolesGuard } from '../guards/roles.guard';
import { hasMinimumRole, isSiteScopedStaff, requiresAssignedSite } from './staff-access';

function guardAllows(role: Role | undefined, minimum: Role): boolean {
  const reflector = { getAllAndOverride: () => [minimum] } as unknown as Reflector;
  const context = {
    getHandler: () => guardAllows,
    getClass: () => RolesGuard,
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
  } as unknown as ExecutionContext;
  try {
    return new RolesGuard(reflector).canActivate(context);
  } catch (error) {
    if (error instanceof ForbiddenException) return false;
    throw error;
  }
}

describe('staff role hierarchy', () => {
  it.each<[Role | undefined, Role, boolean]>([
    ['CAISSIER' as Role, 'AGENT', true],
    ['CAISSIER' as Role, 'CAISSIER' as Role, true],
    ['CAISSIER' as Role, 'GERANT', false],
    ['CAISSIER' as Role, 'SUPER_ADMIN', false],
    ['AGENT', 'CAISSIER' as Role, false],
    ['GERANT', 'CAISSIER' as Role, true],
    ['DIRECTEUR_REGIONAL', 'CAISSIER' as Role, true],
    ['SUPER_ADMIN', 'CAISSIER' as Role, true],
    ['FORMATEUR', 'AGENT', false],
    ['CLIENT', 'AGENT', false],
    [undefined, 'AGENT', false],
    ['UNKNOWN' as Role, 'AGENT', false],
    ['SUPER_ADMIN', 'UNKNOWN' as Role, false],
    ['UNKNOWN' as Role, 'UNKNOWN' as Role, false],
    ['__proto__' as Role, '__proto__' as Role, false],
    ['constructor' as Role, 'constructor' as Role, false],
    ['toString' as Role, 'toString' as Role, false],
  ])('%s requiring %s is allowed: %s', (role, minimum, allowed) => {
    expect(guardAllows(role, minimum)).toBe(allowed);
    expect(hasMinimumRole(role, minimum)).toBe(allowed);
  });

  it.each<[Role, boolean, boolean]>([
    ['SUPER_ADMIN', false, false],
    ['DIRECTEUR_REGIONAL', false, false],
    ['GERANT', false, true],
    ['CAISSIER', true, true],
    ['AGENT', true, true],
    ['FORMATEUR', false, true],
    ['CLIENT', false, false],
  ])('distinguishes site scope and assignment for %s', (role, scoped, assigned) => {
    expect(isSiteScopedStaff(role)).toBe(scoped);
    expect(requiresAssignedSite(role)).toBe(assigned);
  });
});
