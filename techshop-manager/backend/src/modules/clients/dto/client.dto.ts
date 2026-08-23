import {
  IsString,
  IsOptional,
  IsEmail,
  IsEnum,
  IsNumber,
  IsPositive,
  IsInt,
  Min,
  IsDateString,
  Matches,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ModePaiement } from '@prisma/client';
import { PartialType } from '@nestjs/mapped-types';
import { KpayProvider } from '../../kpay/kpay.types';

export class CreateClientDto {
  @IsString()
  @IsNotEmpty()
  prenom: string;

  @IsString()
  @IsNotEmpty()
  nom: string;

  @IsString()
  @Matches(/^\+243[0-9]{9}$/, {
    message: 'Le téléphone doit être au format +243XXXXXXXXX',
  })
  telephone: string;

  @IsOptional()
  @IsEmail({}, { message: 'Email invalide' })
  email?: string;

  @IsString()
  @IsNotEmpty()
  siteId: string;

  @IsOptional()
  @IsString()
  codeParrain?: string;

  @IsOptional()
  @IsString()
  matriculeExterne?: string;

  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  montantRecit: number;

  @IsEnum(ModePaiement)
  modePaiement: ModePaiement;

  @IsOptional()
  @IsString()
  numeroRecu?: string;
}

export class UpdateClientDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  prenom?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  nom?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+243[0-9]{9}$/, {
    message: 'Le téléphone doit être au format +243XXXXXXXXX',
  })
  telephone?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Email invalide' })
  email?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class OnboardingFormationDto {
  @IsString()
  @IsNotEmpty()
  formateurId: string;

  @IsDateString()
  dateFormation: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  dureeMinutes?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class OnboardingFicheDto {
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  montantFiche: number;

  @IsEnum(ModePaiement)
  modePaiement: ModePaiement;

  @IsOptional()
  @IsString()
  numeroTransaction?: string;
}

export class InitKpayOnboardingDto {
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  amount: number;

  @IsString()
  @IsNotEmpty()
  provider: KpayProvider;

  @IsString()
  @IsNotEmpty()
  phoneNumber: string;
}

export class OnboardingActivateDto {
  @IsString()
  @IsNotEmpty()
  produitId: string;

  @IsEnum(ModePaiement)
  modePaiement: ModePaiement;

  @IsOptional()
  @IsString()
  referenceTransaction?: string;
}

export class InitKpayActivationDto {
  @IsString() @IsNotEmpty() produitId: string;
  @IsNumber() @IsPositive() @Type(() => Number) amount: number;
  @IsString() @IsNotEmpty() provider: string;
  @IsString() @IsNotEmpty() phoneNumber: string;
}
