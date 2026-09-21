import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { assertStaffSite, effectiveStaffSite, StaffActor } from './staff-access';
import { StaffScopeService } from './staff-scope.service';

describe('Staff site policy', () => {
  describe.each([Role.AGENT, Role.CAISSIER])('%s', role => {
    const actor: StaffActor = { id: 'staff', role, siteId: 'site-a' };

    it.each([undefined, null, ''])('defaults request %s to the assigned site', siteId => {
      expect(effectiveStaffSite(actor, siteId)).toBe('site-a');
    });

    it('accepts only the assigned object site', () => {
      expect(() => assertStaffSite(actor, 'site-a')).not.toThrow();
      expect(() => effectiveStaffSite(actor, 'site-b')).toThrow(ForbiddenException);
      expect(() => assertStaffSite(actor, 'site-b')).toThrow(ForbiddenException);
    });

    it.each([undefined, null, ''])('fails closed without an assigned site (%s)', siteId => {
      expect(() => effectiveStaffSite({ ...actor, siteId }, 'site-a')).toThrow(ForbiddenException);
    });
  });

  it.each([Role.GERANT, Role.DIRECTEUR_REGIONAL, Role.SUPER_ADMIN, Role.FORMATEUR])('preserves %s existing site behavior', role => {
    const actor: StaffActor = { id: 'staff', role };
    expect(effectiveStaffSite(actor)).toBeUndefined();
    expect(effectiveStaffSite(actor, 'site-b')).toBe('site-b');
    expect(() => assertStaffSite(actor, 'site-b')).not.toThrow();
  });
});

describe('StaffScopeService read-only authorization', () => {
  let service: StaffScopeService;
  let actor: StaffActor;
  const prisma = {
    client: { findUnique: jest.fn<any>() },
    vente: { findUnique: jest.fn<any>() },
  };

  beforeEach(() => {
    jest.resetAllMocks();
    actor = { id: 'cashier', role: Role.CAISSIER, siteId: 'site-a' };
    service = new StaffScopeService(prisma as never);
    prisma.client.findUnique.mockResolvedValue({ id: 'client', siteInscriptionId: 'site-a' });
    prisma.vente.findUnique.mockResolvedValue({ siteId: 'site-a', client: { siteInscriptionId: 'site-a' } });
  });

  it('reads only client identity and site before authorizing', async () => {
    await expect(service.requireClient(actor, 'client')).resolves.toBeUndefined();
    expect(prisma.client.findUnique).toHaveBeenCalledWith({ where: { id: 'client' }, select: { id: true, siteInscriptionId: true } });
  });

  it('reads the sale and linked client sites, not the private dossier', async () => {
    await expect(service.requireSale(actor, 'sale')).resolves.toBeUndefined();
    expect(prisma.vente.findUnique).toHaveBeenCalledWith({ where: { id: 'sale' }, select: { siteId: true, client: { select: { siteInscriptionId: true } } } });
  });

  it.each(['requireClient', 'requireSale'] as const)('rejects insufficient role before %s reads', async method => {
    actor.role = Role.FORMATEUR;
    await expect(service[method](actor, 'object')).rejects.toThrow(ForbiddenException);
    expect(prisma.client.findUnique).not.toHaveBeenCalled();
    expect(prisma.vente.findUnique).not.toHaveBeenCalled();
  });

  it.each(['requireClient', 'requireSale', 'requireExistingPhone'] as const)('requires a site before %s reads', async method => {
    actor.siteId = null;
    await expect(service[method](actor, 'object')).rejects.toThrow(ForbiddenException);
    expect(prisma.client.findUnique).not.toHaveBeenCalled();
    expect(prisma.vente.findUnique).not.toHaveBeenCalled();
  });

  it('allows the explicit trainer minimum without changing ordinary client authorization', async () => {
    actor.role = Role.FORMATEUR;
    prisma.client.findUnique.mockResolvedValue({ id: 'client', siteInscriptionId: 'site-b' });
    await expect(service.requireClient(actor, 'client', Role.FORMATEUR)).resolves.toBeUndefined();
    await expect(service.requireClient(actor, 'client')).rejects.toThrow(ForbiddenException);
    expect(prisma.client.findUnique).toHaveBeenCalledTimes(1);
  });

  it('supports a stricter explicit sale minimum without upgrading cashier rights', async () => {
    await expect(service.requireSale(actor, 'sale', Role.GERANT)).rejects.toThrow(ForbiddenException);
    expect(prisma.vente.findUnique).not.toHaveBeenCalled();
  });

  it('rejects a foreign client without invoking any private read or write adapter', async () => {
    prisma.client.findUnique.mockResolvedValue({ id: 'client', siteInscriptionId: 'site-b' });
    await expect(service.requireClient(actor, 'client')).rejects.toThrow(ForbiddenException);
  });

  it.each([
    { siteId: 'site-b', client: null },
    { siteId: 'site-a', client: { siteInscriptionId: 'site-b' } },
  ])('rejects an unauthorized sale or linked client %j', async sale => {
    prisma.vente.findUnique.mockResolvedValue(sale);
    await expect(service.requireSale(actor, 'sale')).rejects.toThrow(ForbiddenException);
  });

  it('allows an anonymous sale on the assigned site', async () => {
    prisma.vente.findUnique.mockResolvedValue({ siteId: 'site-a', client: null });
    await expect(service.requireSale(actor, 'sale')).resolves.toBeUndefined();
  });

  it('returns not found for missing objects', async () => {
    prisma.client.findUnique.mockResolvedValue(null);
    prisma.vente.findUnique.mockResolvedValue(null);
    await expect(service.requireClient(actor, 'missing')).rejects.toThrow(NotFoundException);
    await expect(service.requireSale(actor, 'missing')).rejects.toThrow(NotFoundException);
  });

  it('returns only a generic conflict for an existing foreign phone', async () => {
    prisma.client.findUnique.mockResolvedValue({ id: 'private-client', siteInscriptionId: 'site-b' });
    await expect(service.requireExistingPhone(actor, '+243822222222')).rejects.toThrow(ConflictException);
    expect(prisma.client.findUnique).toHaveBeenCalledWith({ where: { telephone: '+243822222222' }, select: { id: true, siteInscriptionId: true } });
    try {
      await service.requireExistingPhone(actor, '+243822222222');
    } catch (error) {
      expect(JSON.stringify(error.getResponse())).not.toMatch(/private-client|site-b/);
    }
  });

  it('does not grant phone lookup to a trainer', async () => {
    actor.role = Role.FORMATEUR;
    await expect(service.requireExistingPhone(actor, '+243811111111')).rejects.toThrow(ForbiddenException);
    expect(prisma.client.findUnique).not.toHaveBeenCalled();
  });

  it('rejects an agent at the explicit cashier phone minimum before reading', async () => {
    actor.role = Role.AGENT;
    await expect(service.requireExistingPhone(actor, '+243811111111', Role.CAISSIER))
      .rejects.toThrow(ForbiddenException);
    expect(prisma.client.findUnique).not.toHaveBeenCalled();
  });

  it('preserves agent phone lookup at its default minimum', async () => {
    actor.role = Role.AGENT;
    await expect(service.requireExistingPhone(actor, '+243811111111')).resolves.toBeUndefined();
    expect(prisma.client.findUnique).toHaveBeenCalledWith({ where: { telephone: '+243811111111' }, select: { id: true, siteInscriptionId: true } });
  });

  it('allows an own-site phone or a new phone without writing', async () => {
    await expect(service.requireExistingPhone(actor, '+243811111111')).resolves.toBeUndefined();
    prisma.client.findUnique.mockResolvedValue(null);
    await expect(service.requireExistingPhone(actor, '+243833333333')).resolves.toBeUndefined();
  });

  it.each([Role.GERANT, Role.DIRECTEUR_REGIONAL, Role.SUPER_ADMIN])('retains %s cross-site client, sale and phone access', async role => {
    actor = { id: 'manager', role };
    prisma.client.findUnique.mockResolvedValue({ id: 'client', siteInscriptionId: 'site-b' });
    prisma.vente.findUnique.mockResolvedValue({ siteId: 'site-b', client: { siteInscriptionId: 'site-c' } });
    await expect(service.requireClient(actor, 'client')).resolves.toBeUndefined();
    await expect(service.requireSale(actor, 'sale')).resolves.toBeUndefined();
    await expect(service.requireExistingPhone(actor, '+243822222222')).resolves.toBeUndefined();
  });
});
