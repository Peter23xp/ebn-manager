import { describe, expect, it } from '@jest/globals';
import { Controller, ExecutionContext, ForbiddenException, Get } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { RolesGuard } from './roles.guard';
import { Roles } from '../decorators/roles.decorator';
import { RequireFeature } from '../decorators/feature.decorator';

@RequireFeature('rapports')
@Controller('test')
class RapportsLike {
  @Get() @Roles(Role.GERANT) list() { return []; }
}

@Controller('test2')
class Mixed {
  @Get() @Roles(Role.AGENT) open() { return []; }
  @Get('x') @Roles(Role.AGENT) @RequireFeature('stocks') stock() { return []; }
}

function ctx(handler: (...args: unknown[]) => unknown, cls: object, user: unknown): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => cls,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

const guard = new RolesGuard(new Reflector());
const gerant = (retirees: string[] = []) => ({ id: 'g', role: Role.GERANT, fonctionnalitesRetirees: retirees });

describe('RolesGuard — fonctionnalités retirées', () => {
  it('laisse passer un gérant qui a la fonctionnalité', () => {
    expect(guard.canActivate(ctx(RapportsLike.prototype.list, RapportsLike, gerant()))).toBe(true);
  });

  it('bloque un gérant à qui le super admin a retiré les rapports (décorateur de classe)', () => {
    expect(() => guard.canActivate(ctx(RapportsLike.prototype.list, RapportsLike, gerant(['rapports']))))
      .toThrow(ForbiddenException);
  });

  it('ne bloque que la route marquée (décorateur de méthode)', () => {
    const u = gerant(['stocks']);
    expect(guard.canActivate(ctx(Mixed.prototype.open, Mixed, u))).toBe(true);
    expect(() => guard.canActivate(ctx(Mixed.prototype.stock, Mixed, u))).toThrow(ForbiddenException);
  });

  it('ne restreint jamais le super admin', () => {
    const admin = { id: 'a', role: Role.SUPER_ADMIN, fonctionnalitesRetirees: ['rapports'] };
    expect(guard.canActivate(ctx(RapportsLike.prototype.list, RapportsLike, admin))).toBe(true);
  });
});
