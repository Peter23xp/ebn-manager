import {
  Controller, Get, Param, Query, UseGuards,
  ParseIntPipe, DefaultValuePipe,
} from '@nestjs/common';
import { PortalService } from './portal.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('portal')
@UseGuards(JwtAuthGuard)
export class PortalController {
  constructor(private readonly portalService: PortalService) {}

  @Get('me')
  getPortalData(@CurrentUser() user: any) {
    return this.portalService.getPortalData(user.id);
  }

  @Get('wallet')
  getWallet(@CurrentUser() user: any) {
    return this.portalService.getWallet(user.id);
  }

  @Get('purchases')
  getPurchases(
    @CurrentUser() user: any,
    @Query('period') period?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.portalService.getPurchases(user.id, { period, page, limit });
  }

  @Get('purchases/:venteId')
  getPurchaseDetail(
    @CurrentUser() user: any,
    @Param('venteId') venteId: string,
  ) {
    return this.portalService.getPurchaseDetail(user.id, venteId);
  }

  @Get('wallet/transactions')
  getWalletTransactions(
    @CurrentUser() user: any,
    @Query('typeFilter') typeFilter?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.portalService.getWalletTransactions(user.id, { page, limit, typeFilter });
  }

  @Get('referrals')
  getReferrals(
    @CurrentUser() user: any,
    @Query('filter') filter?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.portalService.getReferrals(user.id, { filter, page, limit });
  }

  @Get('filleuls')
  getFilleuls(@CurrentUser() user: any) {
    return this.portalService.getReferrals(user.id, {});
  }
}
