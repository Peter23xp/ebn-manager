import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { VentesService } from './ventes.service';
import { CreateVenteDto, InitKpayVenteDto, RetourDto } from './dto/vente.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@Controller('ventes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.AGENT)
export class VentesController {
  constructor(private readonly ventesService: VentesService) {}

  @Post()
  createVente(@Body() dto: CreateVenteDto, @CurrentUser() user: any) {
    return this.ventesService.createVente(dto, user.id);
  }

  @Post('kpay/init')
  initKpayVente(@Body() dto: InitKpayVenteDto, @CurrentUser() user: any) {
    return this.ventesService.initKpayVente(dto, user.id);
  }

  @Get('kpay/:transactionId')
  getKpayVenteStatus(@Param('transactionId') transactionId: string) {
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
  ) {
    return this.ventesService.findAll({
      siteId,
      dateDebut,
      dateFin,
      modePaiement,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
    });
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
  getAvoir(@Param('retourId') retourId: string) {
    return this.ventesService.getAvoir(retourId);
  }

  @Get('retours/:retourId/ecritures-ohada')
  @Roles(Role.GERANT)
  getEcrituresOhada(@Param('retourId') retourId: string) {
    return this.ventesService.getEcrituresOhada(retourId);
  }

  // ── Routes avec :id ───────────────────────────────────────────────────────

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.ventesService.findOne(id);
  }

  @Get(':id/receipt')
  getReceipt(@Param('id') id: string) {
    return this.ventesService.getReceipt(id);
  }

  @Post(':id/sms-recu')
  sendSmsRecu(
    @Param('id') id: string,
    @Body('telephone') telephone: string,
  ) {
    return this.ventesService.sendSmsRecu(id, telephone);
  }

  @Post(':id/retour')
  createRetour(
    @Param('id') venteId: string,
    @Body() dto: RetourDto,
    @CurrentUser() user: any,
  ) {
    return this.ventesService.createRetour(venteId, dto, user.id);
  }

  @Post(':id/retour/kpay-refund')
  initKpayRefund(
    @Param('id') venteId: string,
    @Body() dto: RetourDto,
    @CurrentUser() user: any,
  ) {
    return this.ventesService.initKpayRefund(venteId, dto, user.id);
  }
}
