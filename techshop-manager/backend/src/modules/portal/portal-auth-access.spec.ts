import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { StaffActor } from '../../common/access/staff-access';
import { StaffScopeService } from '../../common/access/staff-scope.service';
import { PortalAuthController } from './portal-auth.controller';
import { PortalAuthService } from './portal-auth.service';

describe('Staff PIN credential boundary', () => {
  let persisted: { id: string; siteInscriptionId: string; pinHash: string; tentativesPin: number; bloqueJusquA: Date | null };
  let controller: PortalAuthController;
  const dto = { pin: '5678', confirmPin: '5678' };

  beforeEach(() => {
    persisted = { id: 'client', siteInscriptionId: 'site-a', pinHash: 'unchanged-secret', tentativesPin: 4, bloqueJusquA: new Date('2026-09-21') };
    const prisma = { client: {
      findUnique: async () => ({ ...persisted }),
      update: async ({ data }) => { persisted = { ...persisted, ...data }; return persisted; },
    } };
    jest.spyOn(bcrypt, 'hash');
    controller = new PortalAuthController(
      new PortalAuthService(prisma as never, new JwtService(), new ConfigService()),
      new StaffScopeService(prisma as never),
    );
  });
  afterEach(() => jest.restoreAllMocks());

  it.each<StaffActor>([
    { id: 'agent', role: 'AGENT', siteId: 'site-b' },
    { id: 'cashier', role: 'CAISSIER', siteId: 'site-b' },
    { id: 'agent', role: 'AGENT', siteId: null },
    { id: 'cashier', role: 'CAISSIER', siteId: null },
    { id: 'trainer', role: 'FORMATEUR', siteId: 'site-a' },
  ])('refuses $role at $siteId before hashing or updating persisted credentials', async actor => {
    const before = { ...persisted };
    await expect(controller.setPin('client', dto, actor)).rejects.toMatchObject({ status: 403 });
    expect(bcrypt.hash).not.toHaveBeenCalled();
    expect(persisted).toEqual(before);
  });

  it.each<StaffActor>([
    { id: 'agent', role: 'AGENT', siteId: 'site-a' },
    { id: 'cashier', role: 'CAISSIER', siteId: 'site-a' },
    { id: 'manager', role: 'GERANT', siteId: 'site-b' },
    { id: 'director', role: 'DIRECTEUR_REGIONAL' },
    { id: 'admin', role: 'SUPER_ADMIN' },
  ])('preserves authorized $role credential support', async actor => {
    await expect(controller.setPin('client', dto, actor)).resolves.toMatchObject({ success: true });
    expect(await bcrypt.compare(dto.pin, persisted.pinHash)).toBe(true);
    expect(persisted.tentativesPin).toBe(0);
    expect(persisted.bloqueJusquA).toBeNull();
  });
});
