import {
  Controller, Get, Param, Query, UseGuards,
  ParseIntPipe, DefaultValuePipe, Post, Body, Patch,
} from '@nestjs/common';
import { PortalService } from './portal.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { KpayProvider } from '../kpay/kpay.types';
import { CreateWithdrawalRequestDto } from './dto/withdrawal.dto';

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

  @Post('wallet/payouts')
  initPayout(@CurrentUser() user: any, @Body() body: { amount: number; provider: KpayProvider; phoneNumber: string }) {
    return this.portalService.initPayout(user.id, body);
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

  @Get('commissions/validated')
  getValidatedCommissions(@CurrentUser() user: any) {
    return this.portalService.getValidatedCommissions(user.id);
  }

  @Post('withdrawal-requests')
  createWithdrawalRequest(
    @CurrentUser() user: any,
    @Body() dto: CreateWithdrawalRequestDto,
  ) {
    return this.portalService.createWithdrawalRequest(user.id, dto);
  }

  @Get('withdrawal-requests')
  getWithdrawalRequests(
    @CurrentUser() user: any,
    @Query('statut') statut?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
  ) {
    return this.portalService.getWithdrawalRequests(user.id, { statut, page, limit });
  }

  @Patch('withdrawal-requests/:requestId/cancel')
  cancelWithdrawalRequest(
    @CurrentUser() user: any,
    @Param('requestId') requestId: string,
  ) {
    return this.portalService.cancelWithdrawalRequest(user.id, requestId);
  }
}
