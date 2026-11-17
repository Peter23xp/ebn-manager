import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { StocksService } from './stocks.service';
import {
  EntreeStockDto,
  TransfertDto,
  ReceptionTransfertDto,
  UpdateSeuilDto,
  InventaireDto,
  CreateProduitDto,
  CreateCategorieDto,
} from './dto/stock.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import { RequireFeature } from '../../common/decorators/feature.decorator';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.AGENT)
export class StocksController {
  constructor(private readonly stocksService: StocksService) {}

  @Get('stocks')
  getInventaire(
    @Query('siteId') siteId?: string,
    @Query('produitId') produitId?: string,
    @Query('categorie') categorie?: string,
    @Query('search') search?: string,
    @Query('statut') statut?: string,
    @Query('alerteOnly') alerteOnly?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortOrder') sortOrder?: 'asc' | 'desc',
  ) {
    return this.stocksService.getInventaire({
      siteId,
      produitId,
      categorie,
      search,
      statut,
      alerteOnly: alerteOnly === 'true',
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
      sortBy,
      sortOrder,
    });
  }

  @Get('produits/:id/stocks')
  @RequireFeature('stocks')
  getProduitStocks(@Param('id') produitId: string) {
    return this.stocksService.getProduitStocks(produitId);
  }

  @Get('stocks/:produitId/movements')
  @RequireFeature('stocks')
  getMovements(
    @Param('produitId') produitId: string,
    @Query('type') type?: string,
    @Query('siteId') siteId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.stocksService.getMovements(produitId, {
      type,
      siteId,
      dateFrom,
      dateTo,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 10,
    });
  }

  @Post('stocks/entree')
  @RequireFeature('stocks')
  entreeStock(@Body() dto: EntreeStockDto, @CurrentUser() user: any) {
    return this.stocksService.entreeStock(dto, user.id);
  }

  @Post('stocks/transfert')
  @RequireFeature('stocks')
  transfert(@Body() dto: TransfertDto, @CurrentUser() user: any) {
    return this.stocksService.transfert(dto, user.id);
  }

  @Patch('stocks/transfert/:id/recevoir')
  @RequireFeature('stocks')
  recevoirTransfert(
    @Param('id') transfertId: string,
    @Body() dto: ReceptionTransfertDto,
    @CurrentUser() user: any,
  ) {
    return this.stocksService.recevoirTransfert(transfertId, dto, user.id);
  }

  @Get('stocks/alertes')
  @RequireFeature('stocks')
  getAlertes(
    @Query('siteId') siteId?: string,
    @Query('type') type?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.stocksService.getAlertes({
      siteId,
      type,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
    });
  }

  @Patch('stocks/:siteId/:produitId/seuil')
  @RequireFeature('stocks')
  @Roles(Role.GERANT)
  updateSeuil(
    @Param('siteId') siteId: string,
    @Param('produitId') produitId: string,
    @Body() dto: UpdateSeuilDto,
  ) {
    return this.stocksService.updateSeuil(siteId, produitId, dto);
  }

  @Post('stocks/inventaire')
  @RequireFeature('stocks')
  @Roles(Role.GERANT)
  inventairePhysique(@Body() dto: InventaireDto, @CurrentUser() user: any) {
    return this.stocksService.inventairePhysique(dto, user.id);
  }

  // ── Produits ──────────────────────────────────────────────────────────────────

  @Get('produits/search')
  searchProduits(
    @Query('q') q?: string,
    @Query('siteId') siteId?: string,
    @Query('categorie') categorie?: string,
    @Query('stockOnly') stockOnly?: string,
    @Query('limit') limit?: string,
  ) {
    return this.stocksService.searchProduits(
      q,
      siteId ?? '',
      limit ? parseInt(limit, 10) : 50,
      stockOnly === 'true',
    );
  }

  @Get('produits/categories')
  getCategories() {
    return this.stocksService.getCategories().then((categories) => ({ categories }));
  }

  @Post('produits/categories')
  @RequireFeature('stocks')
  @Roles(Role.GERANT)
  addCategorie(@Body() dto: CreateCategorieDto) {
    return this.stocksService.addCategorie(dto.nom);
  }

  @Delete('produits/categories/:nom')
  @RequireFeature('stocks')
  @Roles(Role.GERANT)
  deleteCategorie(@Param('nom') nom: string) {
    return this.stocksService.deleteCategorie(nom);
  }

  @Get('produits/sku-preview')
  @RequireFeature('stocks')
  @Roles(Role.GERANT)
  skuPreview(@Query('categorie') categorie: string) {
    if (!categorie) return { sku: '—' };
    return this.stocksService.generateSkuPreview(categorie);
  }

  @Post('produits')
  @RequireFeature('stocks')
  @Roles(Role.GERANT)
  createProduit(@Body() dto: CreateProduitDto, @CurrentUser() user: any) {
    return this.stocksService.createProduit(dto, user);
  }
}
