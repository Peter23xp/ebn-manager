import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { hasMinimumRole } from '../access/staff-access';
import { FEATURE_KEY } from '../decorators/feature.decorator';
import type { Feature } from '../access/features';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const { user } = context.switchToHttp().getRequest();
    this.assertFeatureAllowed(context, user);

    if (!requiredRoles || requiredRoles.length === 0) return true;

    if (!user) throw new ForbiddenException({ code: 'ERR_FORBIDDEN', message: 'Rôle insuffisant' });

    const hasRole = requiredRoles.some((minimum) => hasMinimumRole(user.role, minimum));

    if (!hasRole) {
      throw new ForbiddenException({ code: 'ERR_FORBIDDEN', message: 'Rôle insuffisant' });
    }

    return true;
  }

  /** Fonctionnalité retirée à cet utilisateur par le super admin → 403. */
  private assertFeatureAllowed(context: ExecutionContext, user: { role?: string; fonctionnalitesRetirees?: string[] } | undefined) {
    const feature = this.reflector.getAllAndOverride<Feature | undefined>(FEATURE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!feature || !user || user.role === Role.SUPER_ADMIN) return;
    if (user.fonctionnalitesRetirees?.includes(feature)) {
      throw new ForbiddenException({
        code: 'ERR_FEATURE_DISABLED',
        message: "Cette fonctionnalité a été désactivée pour votre compte par l'administrateur.",
      });
    }
  }
}
