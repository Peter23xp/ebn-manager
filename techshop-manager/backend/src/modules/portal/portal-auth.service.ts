import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { PortalLoginDto, SetPinDto } from './dto/portal-auth.dto';

const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

@Injectable()
export class PortalAuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  // ── POST /portal/auth/login ───────────────────────────────────────
  async login(dto: PortalLoginDto) {
    const client = await this.prisma.client.findUnique({
      where: { telephone: dto.telephone },
    });

    if (!client) {
      throw new UnauthorizedException({
        error: { code: 'INVALID_CREDENTIALS', message: 'Numéro ou PIN incorrect' },
      });
    }

    if (client.statut !== 'ACTIF') {
      throw new UnauthorizedException({
        error: {
          code: 'CLIENT_NOT_ACTIVE',
          message: "Votre compte n'est pas encore activé. Contactez votre agent EBN Network.",
        },
      });
    }

    if (client.bloqueJusquA && client.bloqueJusquA > new Date()) {
      throw new UnauthorizedException({
        error: {
          code: 'ACCOUNT_LOCKED',
          message: 'Compte bloqué suite à trop de tentatives.',
          unlocksAt: client.bloqueJusquA.toISOString(),
        },
      });
    }

    if (!client.pinHash) {
      throw new UnauthorizedException({
        error: {
          code: 'PIN_NOT_SET',
          message: 'Aucun PIN configuré. Contactez votre agent EBN Network.',
        },
      });
    }

    const valid = await bcrypt.compare(dto.pin, client.pinHash);

    if (!valid) {
      const attempts = client.tentativesPin + 1;
      const bloqueJusquA =
        attempts >= MAX_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MINUTES * 60000) : null;
      await this.prisma.client.update({
        where: { id: client.id },
        data: { tentativesPin: attempts, bloqueJusquA },
      });
      throw new UnauthorizedException({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Numéro ou PIN incorrect',
          attemptsLeft: MAX_ATTEMPTS - attempts,
        },
      });
    }

    // Connexion OK — reset tentatives
    await this.prisma.client.update({
      where: { id: client.id },
      data: { tentativesPin: 0, bloqueJusquA: null },
    });

    const accessToken = this.jwt.sign(
      { sub: client.id, role: 'CLIENT' },
      {
        secret: this.config.get<string>('JWT_SECRET'),
        expiresIn: '24h',
      },
    );

    return {
      accessToken,
      client: {
        id: client.id,
        prenom: client.prenom,
        nom: client.nom,
        telephone: client.telephone,
        codeParrain: client.codeParrain,
      },
    };
  }

  // ── POST /portal/auth/set-pin (appelé par l'agent à l'activation) ─
  async setPin(clientId: string, dto: SetPinDto) {
    if (dto.pin !== dto.confirmPin) {
      throw new BadRequestException({
        error: { code: 'PIN_MISMATCH', message: 'Les PIN ne correspondent pas' },
      });
    }

    const client = await this.prisma.client.findUnique({ where: { id: clientId } });
    if (!client) throw new NotFoundException({ code: 'ERR_NOT_FOUND' });

    const pinHash = await bcrypt.hash(dto.pin, 10);
    await this.prisma.client.update({
      where: { id: clientId },
      data: { pinHash, tentativesPin: 0, bloqueJusquA: null },
    });

    return { success: true, message: 'PIN défini avec succès' };
  }

  // ── Appelé depuis clients.service lors de l'activation ───────────
  async initDefaultPin(clientId: string, telephone: string) {
    const defaultPin = telephone.slice(-4); // 4 derniers chiffres
    const pinHash = await bcrypt.hash(defaultPin, 10);
    await this.prisma.client.update({
      where: { id: clientId },
      data: { pinHash, tentativesPin: 0, bloqueJusquA: null },
    });
    return defaultPin;
  }
}
