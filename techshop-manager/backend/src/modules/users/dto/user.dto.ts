import {
  IsString,
  IsEnum,
  IsOptional,
  IsEmail,
  MinLength,
  IsBoolean,
  ValidateIf,
  IsArray,
  IsIn,
} from 'class-validator';
import { FEATURES } from '../../../common/access/features';
import { Role } from '@prisma/client';
import { requiresAssignedSite } from '../../../common/access/staff-access';

export class CreateUserDto {
  @IsString()
  nom: string;

  @IsString()
  telephone: string;

  @IsEnum(Role)
  role: Role;

  @ValidateIf((user) => requiresAssignedSite(user.role))
  @IsString({ message: 'Le site est obligatoire pour les rôles GERANT, CAISSIER, AGENT et FORMATEUR' })
  @IsOptional()
  siteId?: string;

  @IsString()
  @MinLength(6)
  passwordTemp: string;

  /** Fonctionnalités retirées à cet utilisateur (ignoré pour SUPER_ADMIN). */
  @IsOptional()
  @IsArray()
  @IsIn(FEATURES as unknown as string[], { each: true, message: 'Fonctionnalité inconnue' })
  fonctionnalitesRetirees?: string[];
}

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  nom?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  langue?: string;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  nom?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsString()
  siteId?: string | null;

  /** Fonctionnalités retirées à cet utilisateur (ignoré pour SUPER_ADMIN). */
  @IsOptional()
  @IsArray()
  @IsIn(FEATURES as unknown as string[], { each: true, message: 'Fonctionnalité inconnue' })
  fonctionnalitesRetirees?: string[];
}

export class ChangePasswordDto {
  @IsString()
  currentPassword: string;

  @IsString()
  @MinLength(6)
  newPassword: string;
}
