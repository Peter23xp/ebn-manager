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

@Controller('api/v1/mlm')
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
    @Query('search') search?: string,
  ) {
    return this.mlmService.listMembers({ page, limit, statut, levelId: levelId || undefined, search });
  }

  @Get('members/:memberId/progress')
  @Roles('SUPER_ADMIN', 'DIRECTEUR_REGIONAL', 'GERANT', 'AGENT')
  getMemberProgress(@Param('memberId') memberId: string) {
    return this.mlmService.getMemberProgress(memberId);
  }

  @Get('members/:memberId/promotions')
  @Roles('SUPER_ADMIN', 'DIRECTEUR_REGIONAL', 'GERANT')
  getPromotionHistory(@Param('memberId') memberId: string) {
    return this.mlmService.getPromotionHistory(memberId);
  }

  // ── Matrix ───────────────────────────────────────────────────────────────────

  @Get('matrix/:memberId/:levelId')
  @Roles('SUPER_ADMIN', 'DIRECTEUR_REGIONAL', 'GERANT', 'AGENT')
  getMemberMatrix(
    @Param('memberId') memberId: string,
    @Param('levelId', ParseIntPipe) levelId: number,
  ) {
    return this.matrixService.getMemberMatrix(memberId, levelId);
  }

  @Get('matrix/:memberId/tree')
  @Roles('SUPER_ADMIN', 'DIRECTEUR_REGIONAL', 'GERANT')
  getNetworkTree(
    @Param('memberId') memberId: string,
    @Query('depth', new DefaultValuePipe(3), ParseIntPipe) depth: number,
  ) {
    return this.matrixService.getNetworkTree(memberId, depth);
  }

  // ── Wallet ───────────────────────────────────────────────────────────────────

  @Get('wallet')
  @Roles('SUPER_ADMIN', 'DIRECTEUR_REGIONAL', 'GERANT')
  getWalletGlobal(@Query('memberId') memberId?: string) {
    if (!memberId) {
      return { error: 'Paramètre memberId requis pour admin' };
    }
    return this.walletService.getWallet(memberId);
  }

  @Get('wallet/:memberId')
  @Roles('SUPER_ADMIN', 'DIRECTEUR_REGIONAL', 'GERANT', 'AGENT')
  getWallet(@Param('memberId') memberId: string) {
    return this.walletService.getWallet(memberId);
  }

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

  // ── Internal: activate member (called from clients module) ────────────────────

  @Post('internal/activate-member')
  @Roles('SUPER_ADMIN', 'DIRECTEUR_REGIONAL', 'GERANT', 'AGENT')
  @HttpCode(HttpStatus.OK)
  activateMember(@Body() body: { clientId: string; parrainCode?: string }) {
    return this.matrixService.onClientActivated(body.clientId, body.parrainCode);
  }
}
