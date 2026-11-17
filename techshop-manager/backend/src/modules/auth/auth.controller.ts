import { Controller, Post, Body, HttpCode, Res, Req, Get, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Response, Request } from 'express';
import { AuthService } from './auth.service';
import { MailerService } from '../mailer/mailer.service';
import { LoginDto, ForgotPasswordDto, VerifyOtpDto, ResetPasswordDto } from './dto/login.dto';

const REFRESH_COOKIE = 'refreshToken';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private mailer: MailerService,
  ) {}

  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.login(dto);
    res.cookie(REFRESH_COOKIE, result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: dto.rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000,
      path: '/',
    });
    const { refreshToken: _rt, ...safeResult } = result;
    return safeResult;
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = req.cookies?.[REFRESH_COOKIE];
    const result = await this.authService.refreshToken(token);
    if (result.newRefreshToken) {
      res.cookie(REFRESH_COOKIE, result.newRefreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/',
      });
    }
    return { accessToken: result.accessToken };
  }

  @Post('logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(REFRESH_COOKIE, { path: '/' });
    return { success: true };
  }

  // Diagnostic d'envoi d'email : réservé au super admin (sinon n'importe qui
  // peut faire envoyer des emails depuis le domaine EBN vers n'importe quelle adresse).
  @Get('test-smtp')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  async testSmtp(@Query('to') to: string) {
    if (!to) return { error: 'Paramètre ?to=email requis' };
    return this.mailer.testSmtp(to);
  }

  @Post('forgot-password')
  @HttpCode(200)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('verify-otp')
  @HttpCode(200)
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto);
  }

  @Post('reset-password')
  @HttpCode(200)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }
}
