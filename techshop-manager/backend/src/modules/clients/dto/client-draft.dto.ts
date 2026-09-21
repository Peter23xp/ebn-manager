import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class CreateClientDraftDto {
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

  @IsString()
  @IsNotEmpty()
  siteId: string;

  @IsOptional()
  @IsEmail({}, { message: 'Email invalide' })
  email?: string;

  @IsOptional()
  @IsString()
  codeParrain?: string;

  @IsOptional()
  @IsString()
  matriculeExterne?: string;
}
