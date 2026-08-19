import {
  Controller,
  Get,
  Post,
  Param,
  Body,
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
    const user = req.user;
    const isGerant = user?.role === 'GERANT';
    return this.rapportsService.getVentesDashboard({
      siteId: isGerant ? user.siteId : siteId,
      dateDebut: dateDebut ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(),
      dateFin: dateFin ?? new Date().toISOString(),
      granularite: granularite ?? 'day',
    });
  }

  @Get('ventes')
  @Roles(Role.AGENT)
  getVentes(
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
    });
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
  ) {
    return this.rapportsService.getVentesDetail({
      siteId, dateDebut, dateFin, agentId, modePaiement, categorie, page, limit,
    });
  }

  // ── SCR-032 : Stocks consolidés ────────────────────────────────────────────

  @Get('stocks')
  @Roles(Role.DIRECTEUR_REGIONAL)
  getStocksConsolide(
    @Query('siteId') siteId?: string,
    @Query('categorie') categorie?: string,
  ) {
    return this.rapportsService.getStocksConsolide({ siteId, categorie });
  }



  // ── SCR-034 : Export jobs ──────────────────────────────────────────────────

  @Get('export/estimate')
  @Roles(Role.GERANT)
  getExportEstimate(
    @Query('type') type: string,
    @Query('dateDebut') dateDebut?: string,
    @Query('dateFin') dateFin?: string,
    @Query('siteId') siteId?: string,
  ) {
    return this.rapportsService.getExportEstimate({ type, dateDebut, dateFin, siteId });
  }

  @Post('export')
  @Roles(Role.GERANT)
  createExport(
    @Request() req: any,
    @Body() body: { type: string; format: string; filtres?: Record<string, any> },
  ) {
    return this.rapportsService.createExport({ ...body, userId: req.user?.id });
  }

  @Get('export/:jobId')
  @Roles(Role.GERANT)
  getExportStatus(@Param('jobId') jobId: string) {
    return this.rapportsService.getExportStatus(jobId);
  }
}
