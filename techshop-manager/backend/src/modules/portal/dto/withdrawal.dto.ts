import { IsString, IsNumber, IsArray, IsEnum, IsOptional, Min, Matches } from 'class-validator';

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
  @IsOptional()
  @IsString()
  notes?: string;
}

export class RejectWithdrawalRequestDto {
  @IsString()
  rejectReason: string;
}
