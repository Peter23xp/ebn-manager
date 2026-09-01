import {
  Controller,
  Get,
  Put,
  Patch,
  Post,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
  DefaultValuePipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { MlmService, UpdateMlmConfigDto } from './mlm.service';
import { MlmMatrixService } from './mlm-matrix.service';
import { MlmWalletService } from './mlm-wallet.service';
import { KpayProvider } from '../kpay/kpay.types';
import {
  ApproveWithdrawalRequestDto,
  RejectWithdrawalRequestDto,
} from '../portal/dto/withdrawal.dto';
import { MlmPayoutStatus } from '@prisma/client';

@Controller('mlm')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MlmController {
  constructor(
    private readonly mlmService: MlmService,
    private readonly matrixService: MlmMatrixService,
    private readonly walletService: MlmWalletService,
  ) {}

  // ── Dashboard ────────────────────────────────────────────────────────────────

  @Get('stats')
  @Roles('SUPER_ADMIN', 'DIRECTEUR_REGIONAL', 'GERANT')
  getStats() {
    return this.mlmService.getNetworkStats();
  }

  @Get('members-by-level')
  @Roles('SUPER_ADMIN', 'DIRECTEUR_REGIONAL', 'GERANT')
  getMembersByLevel() {
    return this.mlmService.getMembersByLevel();
  }

  @Get('promotions/recent')
  @Roles('SUPER_ADMIN', 'DIRECTEUR_REGIONAL', 'GERANT')
  getRecentPromotions(@Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number) {
    return this.mlmService.getRecentPromotions(limit);
  }

  // ── Members ──────────────────────────────────────────────────────────────────

  @Get('members')
  @Roles('SUPER_ADMIN', 'DIRECTEUR_REGIONAL', 'GERANT')
  listMembers(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('statut') statut?: string,
    @Query('levelId', new DefaultValuePipe(0), ParseIntPipe) levelId?: number,
    @Query('parrainId') parrainId?: string,
    @Query('search') search?: string,
  ) {
    return this.mlmService.listMembers({
      page,
      limit,
      statut,
      levelId: levelId || undefined,
      parrainId,
      search,
    });
  }

  @Get('members/:memberId/progress')
  @Roles('SUPER_ADMIN', 'DIRECTEUR_REGIONAL', 'GERANT', 'AGENT')
  getMemberProgress(@Param('memberId') memberId: string) {
    return this.mlmService.getMemberProgress(memberId);
  }

  @Get('members/:memberId/filleuls')
  @Roles('SUPER_ADMIN', 'DIRECTEUR_REGIONAL', 'GERANT', 'AGENT')
  getMemberFilleuls(@Param('memberId') memberId: string) {
    return this.mlmService.getMemberFilleuls(memberId);
  }

  @Get('members/:memberId/promotions')
  @Roles('SUPER_ADMIN', 'DIRECTEUR_REGIONAL', 'GERANT')
  getPromotionHistory(@Param('memberId') memberId: string) {
    return this.mlmService.getPromotionHistory(memberId);
  }

  // ── Matrix ───────────────────────────────────────────────────────────────────

  // ⚠️ IMPORTANT: /tree must come BEFORE /:levelId to avoid NestJS ParseIntPipe
  // trying to parse the literal string "tree" as an integer (→ 400 Bad Request)
  @Get('matrix/:memberId/tree')
  @Roles('SUPER_ADMIN', 'DIRECTEUR_REGIONAL', 'GERANT', 'AGENT')
  getNetworkTree(
    @Param('memberId') memberId: string,
    @Query('depth', new DefaultValuePipe(3), ParseIntPipe) depth: number,
  ) {
    return this.matrixService.getNetworkTree(memberId, depth);
  }

  @Get('matrix/:memberId/:levelId')
  @Roles('SUPER_ADMIN', 'DIRECTEUR_REGIONAL', 'GERANT', 'AGENT')
  getMemberMatrix(
    @Param('memberId') memberId: string,
    @Param('levelId', ParseIntPipe) levelId: number,
  ) {
    return this.matrixService.getMemberMatrix(memberId, levelId);
  }

  // ── Commissions (Option B — admin validation required) ────────────────────────

  @Get('commissions')
  @Roles('SUPER_ADMIN', 'DIRECTEUR_REGIONAL', 'GERANT')
  listCommissions(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('statut') statut?: string,
    @Query('membreId') membreId?: string,
    @Query('levelId', new DefaultValuePipe(0), ParseIntPipe) levelId?: number,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.matrixService.listCommissions({
      page,
      limit,
      statut,
      membreId,
      levelId: levelId || undefined,
      dateFrom,
      dateTo,
    });
  }

  @Put('commissions/:commissionId/validate')
  @Roles('SUPER_ADMIN', 'DIRECTEUR_REGIONAL')
  @HttpCode(HttpStatus.OK)
  validateCommission(@Param('commissionId') commissionId: string) {
    return this.matrixService.validateCommission(commissionId);
  }

  @Put('commissions/:commissionId/pay')
  @Roles('SUPER_ADMIN', 'DIRECTEUR_REGIONAL')
  @HttpCode(HttpStatus.OK)
  payCommission(@Param('commissionId') commissionId: string) {
    return this.matrixService.payCommission(commissionId);
  }

  @Patch('commissions/:commissionId/cancel')
  @Roles('SUPER_ADMIN', 'DIRECTEUR_REGIONAL')
  @HttpCode(HttpStatus.OK)
  cancelCommission(
    @Param('commissionId') commissionId: string,
    @Body('notes') notes?: string,
  ) {
    return this.matrixService.cancelCommission(commissionId, notes);
  }

  // ── Wallet ───────────────────────────────────────────────────────────────────
  // ⚠️ Literal routes MUST come before parameterized ones to avoid NestJS matching
  // "transactions" as a :memberId param (→ NotFoundException or wrong handler)

  @Get('wallet/transactions')
  @Roles('SUPER_ADMIN', 'DIRECTEUR_REGIONAL', 'GERANT')
  getTransactions(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('memberId') memberId?: string,
    @Query('type') type?: string,
  ) {
    return this.walletService.getTransactions({ page, limit, memberId, type });
  }

  @Get('wallet/:memberId/earnings-by-level')
  @Roles('SUPER_ADMIN', 'DIRECTEUR_REGIONAL', 'GERANT')
  getEarningsByLevel(@Param('memberId') memberId: string) {
    return this.walletService.getEarningsByLevel(memberId);
  }

  @Get('wallet/:memberId')
  @Roles('SUPER_ADMIN', 'DIRECTEUR_REGIONAL', 'GERANT', 'AGENT')
  getWallet(@Param('memberId') memberId: string) {
    return this.walletService.getWallet(memberId);
  }

  @Post('wallet/:memberId/payouts')
  @Roles('SUPER_ADMIN', 'DIRECTEUR_REGIONAL', 'GERANT')
  initPayout(@Param('memberId') memberId: string, @Body() body: { amount: number; provider: KpayProvider; phoneNumber: string }) {
    return this.walletService.initPayout(memberId, body);
  }

  @Get('payouts')
  @Roles('SUPER_ADMIN', 'DIRECTEUR_REGIONAL', 'GERANT')
  listPayouts(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('statut') statut?: MlmPayoutStatus,
  ) {
    return this.walletService.listPayouts({ page, limit, statut });
  }

  @Put('payouts/:payoutId/approve')
  @Roles('SUPER_ADMIN', 'DIRECTEUR_REGIONAL')
  @HttpCode(HttpStatus.OK)
  approvePayout(@Param('payoutId') payoutId: string) {
    return this.walletService.approvePayout(payoutId);
  }

  @Patch('payouts/:payoutId/cancel')
  @Roles('SUPER_ADMIN', 'DIRECTEUR_REGIONAL')
  @HttpCode(HttpStatus.OK)
  cancelPayout(@Param('payoutId') payoutId: string) {
    return this.walletService.cancelPayout(payoutId);
  }

  @Get('wallet')
  @Roles('SUPER_ADMIN', 'DIRECTEUR_REGIONAL', 'GERANT')
  getWalletGlobal(@Query('memberId') memberId?: string) {
    if (!memberId) {
      return { error: 'Paramètre memberId requis pour admin' };
    }
    return this.walletService.getWallet(memberId);
  }

  // ── Withdrawal Requests (Admin) ──────────────────────────────────────────────

  @Get('withdrawal-requests')
  @Roles('SUPER_ADMIN', 'DIRECTEUR_REGIONAL', 'GERANT')
  listWithdrawalRequests(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('statut') statut?: string,
    @Query('membreId') membreId?: string,
  ) {
    return this.walletService.listWithdrawalRequests({ page, limit, statut, membreId });
  }

  @Put('withdrawal-requests/:requestId/approve')
  @Roles('SUPER_ADMIN', 'DIRECTEUR_REGIONAL')
  @HttpCode(HttpStatus.OK)
  approveWithdrawalRequest(
    @Param('requestId') requestId: string,
    @Body() dto: ApproveWithdrawalRequestDto,
  ) {
    return this.walletService.approveWithdrawalRequest(requestId, dto.approvedById, dto.notes);
  }

  @Patch('withdrawal-requests/:requestId/reject')
  @Roles('SUPER_ADMIN', 'DIRECTEUR_REGIONAL')
  @HttpCode(HttpStatus.OK)
  rejectWithdrawalRequest(
    @Param('requestId') requestId: string,
    @Body() dto: RejectWithdrawalRequestDto,
  ) {
    return this.walletService.rejectWithdrawalRequest(requestId, dto.rejectReason);
  }

  @Put('withdrawal-requests/:requestId/mark-paid')
  @Roles('SUPER_ADMIN', 'DIRECTEUR_REGIONAL')
  @HttpCode(HttpStatus.OK)
  markWithdrawalAsPaid(@Param('requestId') requestId: string) {
    return this.walletService.markWithdrawalAsPaid(requestId);
  }

  // ── Config ───────────────────────────────────────────────────────────────────

  @Get('config')
  @Roles('SUPER_ADMIN', 'DIRECTEUR_REGIONAL', 'GERANT')
  getConfig() {
    return this.mlmService.getConfig();
  }

  @Put('config')
  @Roles('SUPER_ADMIN')
  updateConfig(@Body() dto: UpdateMlmConfigDto) {
    return this.mlmService.updateConfig(dto);
  }

  // ── Bonuses ──────────────────────────────────────────────────────────────────

  @Get('bonuses/pending')
  @Roles('SUPER_ADMIN', 'DIRECTEUR_REGIONAL', 'GERANT')
  getPendingBonuses(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.matrixService.getPendingBonuses({ page, limit });
  }

  @Put('bonuses/:bonusId/deliver')
  @Roles('SUPER_ADMIN', 'DIRECTEUR_REGIONAL')
  deliverBonus(@Param('bonusId') bonusId: string) {
    return this.matrixService.deliverBonus(bonusId);
  }

  // ── Salaries ──────────────────────────────────────────────────────────────────

  @Get('salaries/member/:memberId')
  @Roles('SUPER_ADMIN', 'DIRECTEUR_REGIONAL', 'GERANT')
  getMemberSalaries(@Param('memberId') memberId: string) {
    return this.matrixService.getMemberSalaries(memberId);
  }

  @Get('salaries')
  @Roles('SUPER_ADMIN', 'DIRECTEUR_REGIONAL')
  getAllSalaries(@Query('period') period: string) {
    return this.matrixService.getAllSalariesForPeriod(period);
  }

  // ── Retirement ────────────────────────────────────────────────────────────────

  @Get('retirement/:memberId')
  @Roles('SUPER_ADMIN', 'DIRECTEUR_REGIONAL', 'GERANT')
  getMemberRetirement(@Param('memberId') memberId: string) {
    return this.matrixService.getMemberRetirement(memberId);
  }

  @Put('retirement/:bonusId/validate')
  @Roles('SUPER_ADMIN', 'DIRECTEUR_REGIONAL')
  @HttpCode(HttpStatus.OK)
  validateRetirement(@Param('bonusId') bonusId: string) {
    return this.matrixService.validateRetirement(bonusId);
  }

  // ── Internal: activate member (called from clients module) ────────────────────

  @Post('internal/activate-member')
  @Roles('SUPER_ADMIN', 'DIRECTEUR_REGIONAL', 'GERANT', 'AGENT')
  @HttpCode(HttpStatus.OK)
  activateMember(@Body() body: { clientId: string; parrainCode?: string }) {
    return this.matrixService.onClientActivated(body.clientId, body.parrainCode);
  }
}
