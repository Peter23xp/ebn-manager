import {
  Injectable,
  Logger,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../prisma/prisma.service";
import { MailerService } from "../mailer/mailer.service";
import * as bcrypt from "bcrypt";
import * as crypto from "crypto";
import {
  LoginDto,
  ForgotPasswordDto,
  VerifyOtpDto,
  ResetPasswordDto,
} from "./dto/login.dto";

const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
    private mailer: MailerService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.utilisateur.findFirst({
      where: { OR: [{ telephone: dto.identifier }, { email: dto.identifier }] },
      include: { site: { select: { id: true, nom: true } } },
    });

    if (!user) {
      throw new UnauthorizedException({
        error: {
          code: "INVALID_CREDENTIALS",
          message: "Téléphone ou mot de passe incorrect",
        },
      });
    }

    if (user.bloqueJusquA && user.bloqueJusquA > new Date()) {
      throw new UnauthorizedException({
        error: {
          code: "ACCOUNT_LOCKED",
          message: "Compte bloqué",
          unlocksAt: user.bloqueJusquA.toISOString(),
        },
      });
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);

    if (!valid) {
      const attempts = user.tentativesConnexion + 1;
      const bloqueJusquA =
        attempts >= MAX_ATTEMPTS
          ? new Date(Date.now() + LOCKOUT_MINUTES * 60000)
          : null;
      await this.prisma.utilisateur.update({
        where: { id: user.id },
        data: { tentativesConnexion: attempts, bloqueJusquA },
      });
      throw new UnauthorizedException({
        error: {
          code: "INVALID_CREDENTIALS",
          message: "Téléphone ou mot de passe incorrect",
          attemptsLeft: MAX_ATTEMPTS - attempts,
        },
      });
    }

    // Validation : GERANT, AGENT et FORMATEUR doivent avoir un site attribué
    if (
      (user.role === "GERANT" || user.role === "AGENT" || user.role === "FORMATEUR") &&
      !user.siteId
    ) {
      throw new UnauthorizedException({
        error: {
          code: "SITE_REQUIRED",
          message: "Votre compte doit être rattaché à un site. Contactez votre administrateur.",
        },
      });
    }

    await this.prisma.utilisateur.update({
      where: { id: user.id },
      data: {
        tentativesConnexion: 0,
        bloqueJusquA: null,
        derniereConnexion: new Date(),
      },
    });

    const payload = { sub: user.id, role: user.role, siteId: user.siteId };
    const accessToken = this.jwt.sign(payload, {
      expiresIn: this.config.get("JWT_EXPIRES_IN", "8h"),
    });
    const refreshToken = this.jwt.sign(payload, {
      secret: this.config.get("JWT_REFRESH_SECRET"),
      expiresIn: dto.rememberMe ? "30d" : "7d",
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        role: user.role,
        name: user.nom,
        siteId: user.siteId ?? null,
        siteName: user.site?.nom ?? null,
      },
    };
  }

  async refreshToken(token: string | undefined) {
    if (!token) {
      throw new UnauthorizedException({
        error: {
          code: "REFRESH_TOKEN_INVALID",
          message: "Refresh token manquant",
        },
      });
    }
    try {
      const payload = this.jwt.verify(token, {
        secret: this.config.get("JWT_REFRESH_SECRET"),
      }) as { sub: string; role: string; siteId?: string };

      const accessToken = this.jwt.sign(
        { sub: payload.sub, role: payload.role, siteId: payload.siteId },
        { expiresIn: this.config.get("JWT_EXPIRES_IN", "8h") },
      );
      return { accessToken, newRefreshToken: null };
    } catch {
      throw new UnauthorizedException({
        error: {
          code: "REFRESH_TOKEN_INVALID",
          message: "Refresh token invalide ou expiré",
        },
      });
    }
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.utilisateur.findFirst({
      where: { telephone: dto.phone },
    });
    if (!user) {
      throw new NotFoundException({
        error: {
          code: "PHONE_NOT_FOUND",
          message: "Aucun compte trouvé pour ce numéro",
        },
      });
    }

    if (!user.email) {
      throw new BadRequestException({
        error: {
          code: "NO_EMAIL",
          message:
            "Aucun email associé à ce compte. Contactez votre administrateur pour en ajouter un.",
        },
      });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + 10 * 60000);

    await this.prisma.passwordResetToken.deleteMany({
      where: { identifier: dto.phone },
    });
    await this.prisma.passwordResetToken.create({
      data: { identifier: dto.phone, otpHash, attempts: 0, expiresAt },
    });

    const maskedPhone = dto.phone.slice(0, 7) + " *** " + dto.phone.slice(-4);
    const maskedEmail = user.email.replace(/(.{2}).+(@.+)/, "$1***$2");

    await this.mailer.sendOtpResetPassword(
      user.email,
      user.nom,
      otp,
      maskedPhone,
    );

    return {
      success: true,
      maskedPhone,
      maskedEmail,
      expiresIn: 600,
      retryAfter: 120,
    };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const entry = await this.prisma.passwordResetToken.findFirst({
      where: { identifier: dto.phone, consumedAt: null },
      orderBy: { createdAt: "desc" },
    });

    if (!entry || entry.expiresAt < new Date()) {
      await this.prisma.passwordResetToken.deleteMany({
        where: { identifier: dto.phone },
      });
      throw new BadRequestException({
        error: {
          code: "OTP_EXPIRED",
          message: "Code OTP expiré. Demandez un nouveau code.",
        },
      });
    }

    if (entry.attempts >= 3) {
      await this.prisma.passwordResetToken.deleteMany({
        where: { identifier: dto.phone },
      });
      throw new BadRequestException({
        error: {
          code: "TOO_MANY_OTP_ATTEMPTS",
          message: "Trop de tentatives invalides. Recommencez.",
        },
      });
    }

    const valid = await bcrypt.compare(dto.otp, entry.otpHash);
    if (!valid) {
      await this.prisma.passwordResetToken.update({
        where: { id: entry.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException({
        error: {
          code: "INVALID_OTP",
          message: "Code incorrect.",
          attemptsLeft: 3 - (entry.attempts + 1),
        },
      });
    }

    // Consommer l'OTP et délivrer le resetToken (15 min) — garde anti-course (usage unique)
    const resetToken = crypto.randomUUID();
    const consumed = await this.prisma.passwordResetToken.updateMany({
      where: { id: entry.id, consumedAt: null },
      data: {
        consumedAt: new Date(),
        attempts: { increment: 1 },
        resetToken,
        expiresAt: new Date(Date.now() + 15 * 60000),
      },
    });
    if (consumed.count === 0) {
      throw new BadRequestException({
        error: {
          code: "OTP_EXPIRED",
          message: "Code OTP expiré. Demandez un nouveau code.",
        },
      });
    }

    return { success: true, resetToken };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const entry = await this.prisma.passwordResetToken.findUnique({
      where: { resetToken: dto.resetToken },
    });

    if (!entry || entry.consumedAt || entry.expiresAt < new Date()) {
      throw new BadRequestException({
        error: {
          code: "RESET_TOKEN_EXPIRED",
          message: "Session expirée. Recommencez la réinitialisation.",
        },
      });
    }

    const user = await this.prisma.utilisateur.findFirst({
      where: { telephone: entry.identifier },
    });
    if (!user) {
      throw new NotFoundException({
        error: { code: "ERR_NOT_FOUND", message: "Utilisateur introuvable" },
      });
    }

    const sameAsOld = await bcrypt.compare(dto.newPassword, user.passwordHash);
    if (sameAsOld) {
      throw new BadRequestException({
        error: {
          code: "PASSWORD_ALREADY_USED",
          message:
            "Ce mot de passe a déjà été utilisé. Choisissez-en un nouveau.",
        },
      });
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);

    // Update utilisateur + consommation du token en une transaction (usage unique garanti)
    await this.prisma.$transaction(async (tx) => {
      await tx.utilisateur.update({
        where: { id: user.id },
        data: { passwordHash, tentativesConnexion: 0, bloqueJusquA: null },
      });

      const consumed = await tx.passwordResetToken.updateMany({
        where: { id: entry.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      if (consumed.count === 0) {
        throw new BadRequestException({
          error: {
            code: "RESET_TOKEN_EXPIRED",
            message: "Session expirée. Recommencez la réinitialisation.",
          },
        });
      }
    });

    return { success: true, message: "Mot de passe mis à jour avec succès." };
  }

  /** Purge quotidienne des tokens de reset expirés depuis plus de 24h */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeExpiredResetTokens() {
    const cutoff = new Date(Date.now() - 24 * 3600 * 1000);
    const res = await this.prisma.passwordResetToken.deleteMany({
      where: { expiresAt: { lt: cutoff } },
    });
    if (res.count > 0) {
      this.logger.log(`Purged ${res.count} expired password reset tokens`);
    }
  }
}
