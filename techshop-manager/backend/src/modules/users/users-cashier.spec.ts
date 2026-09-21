import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { validate } from 'class-validator';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';
import { UsersService } from './users.service';

jest.mock('bcrypt', () => ({ hash: jest.fn<() => Promise<string>>().mockResolvedValue('password-hash') }));

const assignedRoles: Role[] = ['CAISSIER' as Role, 'AGENT', 'GERANT', 'FORMATEUR'];

describe('UsersService staff site assignment', () => {
  let service: UsersService;
  let storedUser: { id: string; nom: string; telephone: string; email: string | null; role: Role; siteId: string | null };
  let prisma: {
    utilisateur: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
    site: { findUnique: jest.Mock };
  };

  beforeEach(() => {
    storedUser = {
      id: 'staff-1', nom: 'Staff', telephone: '+243812345678',
      email: null, role: 'AGENT', siteId: 'site-1',
    };
    prisma = {
      utilisateur: {
        findUnique: jest.fn(async ({ where }) => where.id === storedUser.id ? storedUser : null),
        create: jest.fn(async ({ data }) => ({ id: 'new-staff', ...data })),
        update: jest.fn(async ({ data }) => ({ ...storedUser, ...data })),
      },
      site: {
        findUnique: jest.fn(async ({ where }) => where.id === 'site-1' ? { id: 'site-1', nom: 'Site 1' } : null),
      },
    };
    service = new UsersService(prisma as never, {} as never);
  });

  function createDto(role: Role, siteId?: string): CreateUserDto {
    return { nom: 'New staff', telephone: '+243822345678', role, passwordTemp: 'temporary-password', ...(siteId !== undefined && { siteId }) };
  }

  describe.each(assignedRoles)('%s', (role) => {
    it.each([undefined, ''])('rejects creation with site %s before writing', async (siteId) => {
      await expect(service.createUser(createDto(role, siteId))).rejects.toThrow(BadRequestException);
      expect(prisma.utilisateur.create).not.toHaveBeenCalled();
    });

    it('rejects a nonexistent site before creating', async () => {
      await expect(service.createUser(createDto(role, 'missing-site'))).rejects.toThrow(NotFoundException);
      expect(prisma.utilisateur.create).not.toHaveBeenCalled();
    });

    it('creates a user with the requested role and valid site', async () => {
      const result = await service.createUser(createDto(role, 'site-1'));
      expect(result).toMatchObject({ id: 'new-staff', role, siteId: 'site-1' });
      expect(prisma.utilisateur.create).toHaveBeenCalledTimes(1);
    });

    it.each([undefined, '', null])('rejects promotion with final site %s before writing', async (siteId) => {
      storedUser.role = 'SUPER_ADMIN';
      storedUser.siteId = null;
      await expect(service.updateUser(storedUser.id, { role, ...(siteId !== undefined && { siteId }) })).rejects.toThrow(BadRequestException);
      expect(prisma.utilisateur.update).not.toHaveBeenCalled();
    });

    it.each(['', null])('rejects clearing the site to %s without changing the role', async (siteId) => {
      storedUser.role = role;
      await expect(service.updateUser(storedUser.id, { siteId })).rejects.toThrow(BadRequestException);
      expect(prisma.utilisateur.update).not.toHaveBeenCalled();
    });

    it('rejects unrelated edits when the existing account has no site', async () => {
      storedUser.role = role;
      storedUser.siteId = null;
      await expect(service.updateUser(storedUser.id, { nom: 'Renamed' })).rejects.toThrow(BadRequestException);
      expect(prisma.utilisateur.update).not.toHaveBeenCalled();
    });

    it('rejects a nonexistent replacement site before updating', async () => {
      await expect(service.updateUser(storedUser.id, { role, siteId: 'missing-site' })).rejects.toThrow(NotFoundException);
      expect(prisma.utilisateur.update).not.toHaveBeenCalled();
    });

    it('updates to the requested role and valid site', async () => {
      storedUser.siteId = null;
      const result = await service.updateUser(storedUser.id, { role, siteId: 'site-1' });
      expect(result).toMatchObject({ id: 'staff-1', role, siteId: 'site-1' });
    });

    it('keeps a valid assigned site when the role changes', async () => {
      const result = await service.updateUser(storedUser.id, { role });
      expect(result).toMatchObject({ id: 'staff-1', role, siteId: 'site-1' });
    });
  });

  it.each<Role>(['SUPER_ADMIN', 'DIRECTEUR_REGIONAL', 'CLIENT'])('keeps site optional for %s', async (role) => {
    expect(await service.createUser(createDto(role))).toMatchObject({ role, siteId: null });
    expect(await service.updateUser(storedUser.id, { role, siteId: null })).toMatchObject({ role, siteId: null });
  });

  it('accepts the cashier role in create and update DTOs', async () => {
    const create = Object.assign(new CreateUserDto(), createDto('CAISSIER' as Role, 'site-1'));
    const update = Object.assign(new UpdateUserDto(), { role: 'CAISSIER', siteId: 'site-1' });
    expect(await validate(create)).toEqual([]);
    expect(await validate(update)).toEqual([]);
  });
});
