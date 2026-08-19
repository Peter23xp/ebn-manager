import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateAmbassadeurApplicationDto {
  @IsNotEmpty() @IsString() @MaxLength(100)
  prenom: string;

  @IsNotEmpty() @IsString() @MaxLength(100)
  nom: string;

  @IsNotEmpty() @Matches(/^\+?[0-9\s-]{8,16}$/, {
    message: 'Numéro de téléphone invalide (format +243XXXXXXXXX attendu)',
  })
  telephone: string;

  @IsOptional() @IsEmail()
  email?: string;

  @IsNotEmpty() @IsString() @MaxLength(100)
  ville: string;

  @IsOptional() @IsString() @MaxLength(100)
  siteNom?: string;

  @IsOptional() @IsString() @Matches(/^[A-Za-z0-9-]+$/, {
    message: 'Code parrain invalide (ex : TSG-0001)',
  })
  codeParrain?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  motivation?: string;
}