import { Controller, Post, Body, Param, UseGuards } from '@nestjs/common';
import { PortalAuthService } from './portal-auth.service';
import { PortalLoginDto, SetPinDto } from './dto/portal-auth.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { StaffActor } from '../../common/access/staff-access';
import { StaffScopeService } from '../../common/access/staff-scope.service';

@Controller('portal/auth')
export class PortalAuthController {
  constructor(
    private readonly portalAuthService: PortalAuthService,
    private readonly staffScope: StaffScopeService,
  ) {}

  @Post('login')
  login(@Body() dto: PortalLoginDto) {
    return this.portalAuthService.login(dto);
  }

  @Post('clients/:id/set-pin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('AGENT', 'GERANT', 'SUPER_ADMIN')
  async setPin(@Param('id') clientId: string, @Body() dto: SetPinDto, @CurrentUser() actor: StaffActor) {
    await this.staffScope.requireClient(actor, clientId);
    return this.portalAuthService.setPin(clientId, dto);
  }
}
