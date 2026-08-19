import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MlmService } from './mlm.service';

@Controller('mlm')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MlmController {
  constructor(private readonly mlm: MlmService) {}
  @Get('stats') @Roles(Role.GERANT) stats(@Query('siteId') siteId?: string) { return this.mlm.stats(siteId); }
  @Get('config/levels') @Roles(Role.SUPER_ADMIN) levels() { return this.mlm.levels(); }
  @Get('members/:id/progress') @Roles(Role.AGENT) progress(@Param('id') id: string) { return this.mlm.memberProgress(id); }
  @Get('members/:id/matrix') @Roles(Role.AGENT) matrix(@Param('id') id: string) { return this.mlm.memberProgress(id); }
  @Get('wallet') @Roles(Role.CLIENT) wallet(@CurrentUser() user: any) { return this.mlm.myWallet(user.clientId ?? user.id); }
  @Get('wallet/:id') @Roles(Role.AGENT) walletForMember(@Param('id') id: string) { return this.mlm.memberProgress(id); }
}
