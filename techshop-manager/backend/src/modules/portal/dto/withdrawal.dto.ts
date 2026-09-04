import {
  IsString,
  IsNumber,
  IsArray,
  IsEnum,
  IsOptional,
  IsNotEmpty,
  Min,
  Matches,
  MaxLength,
} from 'class-validator';

export enum WithdrawalRequestTypeDto {
  MOBILE_MONEY = 'MOBILE_MONEY',
  CASH = 'CASH',
}

export class CreateWithdrawalRequestDto {
  @IsNumber()
  @Min(1, { message: 'Le montant doit être supérieur à 0' })
  montant: number;

  @IsEnum(WithdrawalRequestTypeDto, { message: 'Type de retrait invalide' })
  type: WithdrawalRequestTypeDto;

  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(\+?243|0)?\d{9}$/, { message: 'Format téléphone invalide (+243XXXXXXXXX)' })
  phoneNumber?: string;

  @IsArray()
  @IsString({ each: true })
  commissionIds: string[];

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ApproveWithdrawalRequestDto {
  @IsString()
  @IsNotEmpty({ message: 'approvedById est requis' })
  approvedById: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class RejectWithdrawalRequestDto {
  @IsString()
  @IsNotEmpty({ message: 'Le motif de rejet est requis' })
  @MaxLength(500, { message: 'Le motif de rejet ne doit pas dépasser 500 caractères' })
  rejectReason: string;
}
