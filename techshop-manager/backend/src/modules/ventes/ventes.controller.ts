import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { VentesService } from './ventes.service';
import { CreateVenteDto, InitKpayVenteDto, RetourDto } from './dto/vente.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { KpayOperationType, Role } from '@prisma/client';
import { CheckMobileMoney } from '../../common/payments/mobile-money.guard';
import { effectiveStaffSite, StaffActor } from '../../common/access/staff-access';
import { StaffScopeService } from '../../common/access/staff-scope.service';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('ventes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.AGENT)
export class VentesController {
  constructor(
    private readonly ventesService: VentesService,
    private readonly staffScope: StaffScopeService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  @Roles(Role.CAISSIER)
  @CheckMobileMoney('modePaiement')
  async createVente(@Body() dto: CreateVenteDto, @CurrentUser() user: StaffActor) {
    const siteId = effectiveStaffSite(user, dto.siteId);
    if (dto.clientId) await this.staffScope.requireClient(user, dto.clientId, Role.CAISSIER);
    return this.ventesService.createVente({ ...dto, siteId }, user.id);
  }

  @Post('kpay/init')
  @Roles(Role.CAISSIER)
  @CheckMobileMoney()
  async initKpayVente(@Body() dto: InitKpayVenteDto, @CurrentUser() user: StaffActor) {
    const siteId = effectiveStaffSite(user, dto.siteId);
    if (dto.clientId) await this.staffScope.requireClient(user, dto.clientId, Role.CAISSIER);
    return this.ventesService.initKpayVente({ ...dto, siteId }, user.id);
  }

  @Get('kpay/:transactionId')
  async getKpayVenteStatus(@Param('transactionId') transactionId: string, @CurrentUser() user: StaffActor) {
    effectiveStaffSite(user);
    const transaction = await this.prisma.kpayTransaction.findFirst({
      where: { id: transactionId, operationType: KpayOperationType.SALE_PAYMENT },
      select: { venteId: true },
    });
    if (!transaction?.venteId) throw new NotFoundException('Transaction KPay introuvable');
    await this.staffScope.requireSale(user, transaction.venteId, Role.AGENT);
    return this.ventesService.getKpayVenteStatus(transactionId);
  }

  @Get()
  findAll(
    @Query('siteId') siteId?: string,
    @Query('dateDebut') dateDebut?: string,
    @Query('dateFin') dateFin?: string,
    @Query('modePaiement') modePaiement?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @CurrentUser() user?: StaffActor,
  ) {
    return this.ventesService.findAll({
      siteId: effectiveStaffSite(user, siteId),
      dateDebut,
      dateFin,
      modePaiement,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
    }, user);
  }

  // ── Routes statiques AVANT :id ────────────────────────────────────────────

  @Get('journal-retours')
  @Roles(Role.GERANT)
  getJournalRetours(
    @Query('siteId') siteId?: string,
    @Query('dateDebut') dateDebut?: string,
    @Query('dateFin') dateFin?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.ventesService.getJournalRetours({
      siteId,
      dateDebut,
      dateFin,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
    });
  }

  @Get('retours/:retourId/avoir')
  async getAvoir(@Param('retourId') retourId: string, @CurrentUser() user: StaffActor) {
    effectiveStaffSite(user);
    const retour = await this.prisma.retour.findUnique({ where: { id: retourId }, select: { venteId: true } });
    if (!retour) throw new NotFoundException('Avoir introuvable');
    await this.staffScope.requireSale(user, retour.venteId, Role.AGENT);
    return this.ventesService.getAvoir(retourId);
  }

  @Get('retours/:retourId/ecritures-ohada')
  @Roles(Role.GERANT)
  getEcrituresOhada(@Param('retourId') retourId: string) {
    return this.ventesService.getEcrituresOhada(retourId);
  }

  // ── Routes avec :id ───────────────────────────────────────────────────────

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: StaffActor) {
    await this.staffScope.requireSale(user, id, Role.AGENT);
    return this.ventesService.findOne(id);
  }

  @Get(':id/receipt')
  async getReceipt(@Param('id') id: string, @CurrentUser() user: StaffActor) {
    await this.staffScope.requireSale(user, id, Role.AGENT);
    return this.ventesService.getReceipt(id);
  }

  @Post(':id/sms-recu')
  async sendSmsRecu(
    @Param('id') id: string,
    @Body('telephone') telephone: string,
    @CurrentUser() user: StaffActor,
  ) {
    await this.staffScope.requireSale(user, id, Role.AGENT);
    return this.ventesService.sendSmsRecu(id, telephone);
  }

  @Post(':id/retour')
  @Roles(Role.GERANT)
  @CheckMobileMoney('modeRemboursement')
  async createRetour(
    @Param('id') venteId: string,
    @Body() dto: RetourDto,
    @CurrentUser() user: StaffActor,
  ) {
    await this.staffScope.requireSale(user, venteId, Role.GERANT);
    return this.ventesService.createRetour(venteId, dto, user.id);
  }

  @Post(':id/retour/kpay-refund')
  @Roles(Role.GERANT)
  @CheckMobileMoney()
  async initKpayRefund(
    @Param('id') venteId: string,
    @Body() dto: RetourDto,
    @CurrentUser() user: StaffActor,
  ) {
    await this.staffScope.requireSale(user, venteId, Role.GERANT);
    return this.ventesService.initKpayRefund(venteId, dto, user.id);
  }
}
