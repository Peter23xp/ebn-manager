import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  ValidateNested,
  IsInt,
  IsPositive,
  IsBoolean,
  IsNumber,
  Min,
  ArrayMinSize,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ModePaiement } from '@prisma/client';
import { KpayProvider } from '../../kpay/kpay.types';

export class LigneVenteDto {
  @IsString()
  @IsNotEmpty()
  produitId: string;

  @IsInt()
  @IsPositive()
  @Type(() => Number)
  quantite: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  prixUnitaire?: number;
}

export class CreateVenteDto {
  @IsOptional()
  @IsString()
  clientId?: string;

  @IsString()
  @IsNotEmpty()
  siteId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LigneVenteDto)
  lignes: LigneVenteDto[];

  @IsEnum(ModePaiement)
  modePaiement: ModePaiement;

  @IsOptional()
  @IsBoolean()
  appliquerRemiseFidelite?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  montantRecu?: number;
}

export class InitKpayVenteDto extends CreateVenteDto {
  @IsString()
  @IsNotEmpty()
  provider: KpayProvider;

  @IsString()
  @IsNotEmpty()
  phoneNumber: string;
}

export class LigneRetourDto {
  @IsString()
  @IsNotEmpty()
  produitId: string;

  @IsInt()
  @IsPositive()
  @Type(() => Number)
  quantite: number;
}

export class RetourDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LigneRetourDto)
  lignes: LigneRetourDto[];

  @IsString()
  @IsNotEmpty()
  motif: string;

  @IsOptional()
  @IsString()
  motifDescription?: string;

  @IsString()
  @IsNotEmpty()
  modeRemboursement: string;

  @IsOptional()
  @IsString()
  referenceTransaction?: string;
}
