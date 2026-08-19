import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAmbassadeurApplicationDto } from './dto/ambassadeur-application.dto';

@Injectable()
export class PublicService {
  constructor(private readonly prisma: PrismaService) {}

  async createAmbassadeurApplication(dto: CreateAmbassadeurApplicationDto) {
    const application = await this.prisma.ambassadeurApplication.create({
      data: {
        prenom:      dto.prenom,
        nom:         dto.nom,
        telephone:   dto.telephone,
        email:       dto.email,
        ville:       dto.ville,
        siteNom:     dto.siteNom,
        codeParrain: dto.codeParrain,
        motivation:  dto.motivation,
      },
    });

    return {
      id:      application.id,
      message: 'Candidature reçue. Un conseiller TechShop vous contactera sous 24h.',
    };
  }
}