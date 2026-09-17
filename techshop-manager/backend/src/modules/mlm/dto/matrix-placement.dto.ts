import { ArrayMaxSize, IsArray, IsInt, IsNotEmpty, IsString, IsUUID, Length, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { Transform } from 'class-transformer';

const trimString = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;

export class MovePlacementDto {
  @Transform(trimString) @IsString() @IsNotEmpty() memberId: string;
  @Transform(trimString) @IsString() @IsNotEmpty() newParentId: string;
  @IsInt() @Min(1) @Max(4) newPosition: number;
  @ValidateIf((_object, value) => value !== null) @IsUUID() expectedPositionId: string | null;
  @IsUUID() operationId: string;
  @Transform(trimString) @IsString() @Length(5, 500) reason: string;
}

export class SwapPlacementDto {
  @Transform(trimString) @IsString() @IsNotEmpty() memberId: string;
  @Transform(trimString) @IsString() @IsNotEmpty() otherMemberId: string;
  @IsUUID() expectedPositionId: string;
  @IsUUID() otherExpectedPositionId: string;
  @IsUUID() operationId: string;
  @Transform(trimString) @IsString() @Length(5, 500) reason: string;
}

export class MlmCalendarYearDto {
  @IsArray() @ArrayMaxSize(366) @IsString({ each: true }) holidays: string[];
  @IsString() @IsNotEmpty() @MaxLength(100) version: string;
  @IsString() @IsNotEmpty() @MaxLength(2000) source: string;
  @IsString() @IsNotEmpty() timezone: string;
}
