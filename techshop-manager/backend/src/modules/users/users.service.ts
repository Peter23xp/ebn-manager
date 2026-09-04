import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MailerService } from '../mailer/mailer.service';
import * as bcrypt from 'bcrypt';
import { Role } from '@prisma/client';
import { CreateUserDto, UpdateProfileDto, ChangePasswordDto, UpdateUserDto } from './dto/user.dto';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private mailer: MailerService,
  ) {}

  async findAll(query: {
    role?: string;
    siteId?: string;
    actif?: boolean | string;
  }) {
    const { role, siteId, actif } = query;

    const where: any = {};
    if (role) where.role = role;
    if (siteId) where.siteId = siteId;
    if (actif !== undefined) {
      where.actif = actif === 'true' || actif === true;
    }

    const users = await this.prisma.utilisateur.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        nom: true,
        telephone: true,
        email: true,
        role: true,
        actif: true,
        langue: true,
        derniereConnexion: true,
        createdAt: true,
        siteId: true,
        site: { select: { id: true, nom: true, ville: true } },
      },
    });

    return { data: users, total: users.length };
  }

  async createUser(dto: CreateUserDto) {
    // Vérifier doublon téléphone
    const existingPhone = await this.prisma.utilisateur.findUnique({
      where: { telephone: dto.telephone },
    });
    if (existingPhone) {
      throw new ConflictException({
        code: 'ERR_CONFLICT',
        message: 'Ce numéro de téléphone est déjà utilisé',
      });
    }

    // Validation : siteId obligatoire pour GERANT, AGENT et FORMATEUR
    const rolesRequiringSite = [Role.GERANT, Role.AGENT, Role.FORMATEUR] as const;
    if (rolesRequiringSite.some(r => r === dto.role) && !dto.siteId) {
      throw new BadRequestException({
        code: 'ERR_VALIDATION',
        message: 'Le site est obligatoire pour les rôles GERANT, AGENT et FORMATEUR',
      });
    }

    // Vérifier que le site existe si fourni
    if (dto.siteId) {
      const site = await this.prisma.site.findUnique({ where: { id: dto.siteId } });
      if (!site) {
        throw new NotFoundException({ code: 'ERR_NOT_FOUND', message: 'Site introuvable' });
      }
    }

    const passwordHash = await bcrypt.hash(dto.passwordTemp, 10);

    const user = await this.prisma.utilisateur.create({
      data: {
        nom: dto.nom,
        telephone: dto.telephone,
        role: dto.role,
        siteId: dto.siteId || null,
        passwordHash,
      },
      select: {
        id: true,
        nom: true,
        telephone: true,
        role: true,
        actif: true,
        siteId: true,
        site: { select: { id: true, nom: true } },
        createdAt: true,
      },
    });

    return user;
  }

  async findById(id: string) {
    const user = await this.prisma.utilisateur.findUnique({
      where: { id },
      select: {
        id: true,
        nom: true,
        telephone: true,
        email: true,
        role: true,
        actif: true,
        langue: true,
        siteId: true,
        site: { select: { id: true, nom: true } },
        derniereConnexion: true,
      },
    });
    if (!user) {
      throw new NotFoundException({ code: 'ERR_NOT_FOUND', message: 'Utilisateur introuvable' });
    }
    return user;
  }

  async updateUser(id: string, dto: UpdateUserDto) {
    const user = await this.prisma.utilisateur.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException({ code: 'ERR_NOT_FOUND', message: 'Utilisateur introuvable' });
    }

    if (dto.email && dto.email !== user.email) {
      const existing = await this.prisma.utilisateur.findUnique({ where: { email: dto.email } });
      if (existing) {
        throw new ConflictException({ code: 'ERR_CONFLICT', message: 'Cet email est déjà utilisé' });
      }
    }

    // Validation : si on change le rôle vers GERANT/AGENT/FORMATEUR, siteId doit être fourni
    const finalRole = dto.role ?? user.role;
    const finalSiteId = dto.siteId !== undefined ? dto.siteId : user.siteId;
    const rolesRequiringSite = [Role.GERANT, Role.AGENT, Role.FORMATEUR] as const;
    if (rolesRequiringSite.some(r => r === finalRole) && !finalSiteId) {
      throw new BadRequestException({
        code: 'ERR_VALIDATION',
        message: 'Le site est obligatoire pour les rôles GERANT, AGENT et FORMATEUR',
      });
    }

    if (dto.siteId) {
      const site = await this.prisma.site.findUnique({ where: { id: dto.siteId } });
      if (!site) {
        throw new NotFoundException({ code: 'ERR_NOT_FOUND', message: 'Site introuvable' });
      }
    }

    return this.prisma.utilisateur.update({
      where: { id },
      data: {
        ...(dto.nom !== undefined && { nom: dto.nom }),
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.role !== undefined && { role: dto.role }),
        ...(dto.siteId !== undefined && { siteId: dto.siteId || null }),
      },
      select: {
        id: true,
        nom: true,
        telephone: true,
        email: true,
        role: true,
        actif: true,
        langue: true,
        siteId: true,
        site: { select: { id: true, nom: true } },
        derniereConnexion: true,
      },
    });
  }

  async reactiverUser(id: string) {
    const user = await this.prisma.utilisateur.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException({ code: 'ERR_NOT_FOUND', message: 'Utilisateur introuvable' });
    }

    return this.prisma.utilisateur.update({
      where: { id },
      data: { actif: true },
      select: {
        id: true,
        nom: true,
        telephone: true,
        role: true,
        actif: true,
      },
    });
  }

  async desactiverUser(id: string) {
    const user = await this.prisma.utilisateur.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException({ code: 'ERR_NOT_FOUND', message: 'Utilisateur introuvable' });
    }

    return this.prisma.utilisateur.update({
      where: { id },
      data: { actif: false },
      select: {
        id: true,
        nom: true,
        telephone: true,
        role: true,
        actif: true,
      },
    });
  }

  async resetPassword(id: string) {
    const user = await this.prisma.utilisateur.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException({ code: 'ERR_NOT_FOUND', message: 'Utilisateur introuvable' });
    }

    const tempPassword = Math.random().toString(36).slice(-8) + 'A1!';
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    await this.prisma.utilisateur.update({
      where: { id },
      data: { passwordHash, tentativesConnexion: 0, bloqueJusquA: null },
    });

    if (user.email) {
      await this.mailer.sendTempPassword(user.email, user.nom, user.telephone, tempPassword);
    } else {
      console.log(`[RESET PASSWORD — pas d'email] ${user.telephone}: ${tempPassword}`);
    }

    return {
      success: true,
      message: user.email
        ? 'Mot de passe temporaire envoyé par email'
        : 'Mot de passe temporaire généré (utilisateur sans email — voir logs)',
      ...(process.env.NODE_ENV !== 'production' && { tempPassword }),
    };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.utilisateur.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException({ code: 'ERR_NOT_FOUND', message: 'Utilisateur introuvable' });
    }

    // Vérifier doublon email si changé
    if (dto.email && dto.email !== user.email) {
      const existingEmail = await this.prisma.utilisateur.findUnique({
        where: { email: dto.email },
      });
      if (existingEmail) {
        throw new ConflictException({
          code: 'ERR_CONFLICT',
          message: 'Cet email est déjà utilisé',
        });
      }
    }

    return this.prisma.utilisateur.update({
      where: { id: userId },
      data: {
        ...(dto.nom !== undefined && { nom: dto.nom }),
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.langue !== undefined && { langue: dto.langue }),
      },
      select: {
        id: true,
        nom: true,
        telephone: true,
        email: true,
        role: true,
        langue: true,
        siteId: true,
        site: { select: { id: true, nom: true } },
      },
    });
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.utilisateur.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException({ code: 'ERR_NOT_FOUND', message: 'Utilisateur introuvable' });
    }

    const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!valid) {
      throw new BadRequestException({
        code: 'ERR_VALIDATION',
        message: 'Mot de passe actuel incorrect',
      });
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.utilisateur.update({
      where: { id: userId },
      data: { passwordHash },
    });

    return { success: true, message: 'Mot de passe modifié avec succès' };
  }
}
