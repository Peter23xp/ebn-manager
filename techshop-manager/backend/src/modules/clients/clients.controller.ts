import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ClientsService } from './clients.service';
import { UpdateClientDto, OnboardingFormationDto, OnboardingFicheDto, OnboardingActivateDto, InitKpayOnboardingDto, InitKpayActivationDto } from './dto/client.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@Controller('clients')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get()
  @Roles(Role.AGENT)
  findAll(
    @Query('siteId') siteId?: string,
    @Query('statut') statut?: string,
    @Query('niveau') niveau?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @CurrentUser() user?: any,
  ) {
    return this.clientsService.findAll(
      {
        siteId,
        statut,
        niveau,
        search,
        page: page ? parseInt(page, 10) : 1,
        limit: limit ? parseInt(limit, 10) : 50,
      },
      user,
    );
  }

  @Get('search')
  @Roles(Role.AGENT)
  search(
    @Query('q') q?: string,
    @Query('statut') statut?: string,
  ) {
    return this.clientsService.search(q ?? '', statut);
  }

  @Get('search-parrain')
  @Roles(Role.AGENT)
  searchParrain(@Query('q') q?: string) {
    return this.clientsService.searchParrain(q ?? '');
  }

  @Get('next-code')
  @Roles(Role.AGENT)
  getNextCode() {
    return this.clientsService.getNextCode();
  }

  @Get('onboarding-queue')
  @Roles(Role.AGENT)
  getOnboardingQueue(
    @Query('siteId') siteId?: string,
    @CurrentUser() user?: any,
  ) {
    const effectiveSiteId = user?.role === Role.AGENT ? user.siteId : siteId;
    return this.clientsService.getOnboardingQueue(effectiveSiteId);
  }

  @Get('paiements-onboarding')
  @Roles(Role.AGENT)
  getPaiementsOnboarding(
    @Query('siteId') siteId?: string,
    @Query('dateDebut') dateDebut?: string,
    @Query('dateFin') dateFin?: string,
    @Query('agentId') agentId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @CurrentUser() user?: any,
  ) {
    const effectiveSiteId = user?.role === Role.AGENT ? user.siteId : siteId;
    return this.clientsService.getPaiementsOnboarding({
      siteId: effectiveSiteId,
      dateDebut,
      dateFin,
      agentId,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
    });
  }

  @Get('check-phone/:phone')
  checkPhone(@Param('phone') phone: string) {
    return this.clientsService.checkPhone(phone);
  }

  @Post('onboarding/recit')
  onboardingRecit(@Body() body: any, @CurrentUser() user: any) {
    return this.clientsService.onboardingRecit({ ...body, agentId: user.id });
  }

  @Post('import/preview')
  @UseInterceptors(FileInterceptor('file'))
  importPreview(
    @UploadedFile(
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 })],
        fileIsRequired: true,
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.clientsService.importPreview(file);
  }

  @Post('import/execute')
  @UseInterceptors(FileInterceptor('file'))
  importExecute(
    @UploadedFile(
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 })],
        fileIsRequired: true,
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.clientsService.importExecute(file);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.clientsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateClientDto,
    @CurrentUser() user: any,
  ) {
    return this.clientsService.update(id, dto, user);
  }

  @Post(':id/onboarding/formation')
  onboardingFormation(
    @Param('id') clientId: string,
    @Body() dto: OnboardingFormationDto,
    @CurrentUser() user: any,
  ) {
    return this.clientsService.onboardingFormation(clientId, dto, user.id);
  }

  @Post(':id/onboarding/fiche')
  onboardingFiche(
    @Param('id') clientId: string,
    @Body() dto: OnboardingFicheDto,
    @CurrentUser() user: any,
  ) {
    return this.clientsService.onboardingFiche(clientId, dto, user.id);
  }

  @Post('onboarding/recit/kpay/init')
  onboardingRecitKpay(@Body() body: any, @CurrentUser() user: any) {
    return this.clientsService.initKpayRecit({ ...body, agentId: user.id });
  }

  @Post(':id/onboarding/fiche/kpay/init')
  onboardingFicheKpay(
    @Param('id') clientId: string,
    @Body() dto: InitKpayOnboardingDto,
    @CurrentUser() user: any,
  ) {
    return this.clientsService.initKpayFiche(clientId, dto, user.id);
  }

  @Post(':id/onboarding/activate')
  onboardingActivate(
    @Param('id') clientId: string,
    @Body() dto: OnboardingActivateDto,
    @CurrentUser() user: any,
  ) {
    return this.clientsService.onboardingActivate(clientId, dto, user.id);
  }

  @Post(':id/onboarding/activate/kpay/init')
  onboardingActivateKpay(@Param('id') clientId: string, @Body() dto: InitKpayActivationDto, @CurrentUser() user: any) { return this.clientsService.initKpayActivation(clientId, dto, user.id); }
}
