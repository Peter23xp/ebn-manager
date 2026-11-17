import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: { sub: string; role: string; siteId?: string }) {
    // Token CLIENT → vérifier dans la table clients
    if (payload.role === 'CLIENT') {
      const client = await this.prisma.client.findUnique({
        where: { id: payload.sub },
        select: { id: true, prenom: true, nom: true, statut: true },
      });
      if (!client || client.statut !== 'ACTIF') {
        throw new UnauthorizedException({ code: 'ERR_UNAUTHORIZED', message: 'Compte inactif ou introuvable' });
      }
      return { id: client.id, nom: `${client.prenom} ${client.nom}`, role: 'CLIENT', siteId: null, actif: true };
    }

    // Token staff → vérifier dans utilisateurs
    const user = await this.prisma.utilisateur.findUnique({
      where: { id: payload.sub },
      select: { id: true, nom: true, role: true, siteId: true, actif: true, fonctionnalitesRetirees: true },
    });

    if (!user || !user.actif) {
      throw new UnauthorizedException({ code: 'ERR_UNAUTHORIZED', message: 'Compte inactif ou introuvable' });
    }

    return user;
  }
}
