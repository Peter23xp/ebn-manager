import {
  Controller,
  Get,
  Query,
  UseGuards,
  Request,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { RapportsService } from './rapports.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('rapports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RapportsController {
  constructor(private readonly rapportsService: RapportsService) {}

  // ── SCR-030 : Dashboard ────────────────────────────────────────────────────

  @Get('ventes/dashboard')
  @Roles(Role.GERANT)
  getVentesDashboard(
    @Request() req: any,
    @Query('siteId') siteId?: string,
    @Query('dateDebut') dateDebut?: string,
    @Query('dateFin') dateFin?: string,
    @Query('granularite') granularite?: 'day' | 'week' | 'month',
  ) {
    return this.rapportsService.getVentesDashboard({
      siteId,
      dateDebut: dateDebut ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(),
      dateFin: dateFin ?? new Date().toISOString(),
      granularite: granularite ?? 'day',
    }, req.user);
  }

  @Get('ventes')
  @Roles(Role.AGENT)
  getVentes(
    @Request() req: any,
    @Query('siteId') siteId?: string,
    @Query('dateDebut') dateDebut?: string,
    @Query('dateFin') dateFin?: string,
    @Query('granularite') granularite?: string,
  ) {
    return this.rapportsService.getVentes({
      siteId,
      dateDebut: dateDebut ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(),
      dateFin: dateFin ?? new Date().toISOString(),
      granularite,
    }, req.user);
  }

  // ── SCR-031 : Ventes détaillées ────────────────────────────────────────────

  @Get('ventes/detail')
  @Roles(Role.DIRECTEUR_REGIONAL)
  getVentesDetail(
    @Request() req: any,
    @Query('siteId') siteId?: string,
    @Query('dateDebut') dateDebut?: string,
    @Query('dateFin') dateFin?: string,
    @Query('agentId') agentId?: string,
    @Query('modePaiement') modePaiement?: string,
    @Query('categorie') categorie?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
    @Query('search') search?: string,
    @Query('sortDir') sortDir?: 'asc' | 'desc',
  ) {
    return this.rapportsService.getVentesDetail({
      siteId, dateDebut, dateFin, agentId, modePaiement, categorie, page, limit, search, sortDir,
    });
  }

  // ── SCR-032 : Stocks consolidés ────────────────────────────────────────────

  @Get('stocks')
  @Roles(Role.DIRECTEUR_REGIONAL)
  getStocksConsolide(
    @Query('siteId') siteId?: string,
    @Query('categorie') categorie?: string,
    @Query('search') search?: string,
  ) {
    return this.rapportsService.getStocksConsolide({ siteId, categorie, search });
  }



}
