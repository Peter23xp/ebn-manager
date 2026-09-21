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
import { ClientParrainService } from './client-parrain.service';
import { AssignParrainDto } from './dto/assign-parrain.dto';
import { CreateClientDraftDto } from './dto/client-draft.dto';
import { UpdateClientDto, OnboardingFormationDto, OnboardingFicheDto, OnboardingActivateDto, InitKpayOnboardingDto, InitKpayActivationDto } from './dto/client.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import { CheckMobileMoney } from '../../common/payments/mobile-money.guard';
import { effectiveStaffSite, StaffActor } from '../../common/access/staff-access';
import { StaffScopeService } from '../../common/access/staff-scope.service';

@Controller('clients')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.AGENT)
export class ClientsController {
  constructor(
    private readonly clientsService: ClientsService,
    private readonly clientParrain: ClientParrainService,
    private readonly staffScope: StaffScopeService,
  ) {}

  @Post(':id/parrain')
  @Roles(Role.GERANT)
  assignParrain(@Param('id') id: string, @Body() dto: AssignParrainDto, @CurrentUser() user: any) {
    return this.clientParrain.assign(id, dto, user);
  }

  @Get(':id/parrain/attribution')
  @Roles(Role.GERANT)
  getParrainAttribution(@Param('id') id: string, @CurrentUser() user: any) {
    return this.clientParrain.getAttribution(id, user);
  }

  @Get()
  @Roles(Role.AGENT)
  findAll(
    @Query('siteId') siteId?: string,
    @Query('statut') statut?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @CurrentUser() user?: StaffActor,
  ) {
    return this.clientsService.findAll(
      {
        siteId: effectiveStaffSite(user, siteId),
        statut,
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
    @Query('siteId') siteId?: string,
    @CurrentUser() user?: StaffActor,
  ) {
    return this.clientsService.search(q ?? '', statut, effectiveStaffSite(user, siteId));
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
    @CurrentUser() user?: StaffActor,
  ) {
    const effectiveSiteId = effectiveStaffSite(user, siteId);
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
    @CurrentUser() user?: StaffActor,
  ) {
    const effectiveSiteId = effectiveStaffSite(user, siteId);
    return this.clientsService.getPaiementsOnboarding({
      siteId: effectiveSiteId,
      dateDebut,
      dateFin,
      agentId,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
    }, user);
  }

  @Get('check-phone/:phone')
  async checkPhone(@Param('phone') phone: string, @CurrentUser() user: StaffActor) {
    await this.staffScope.requireExistingPhone(user, phone);
    return this.clientsService.checkPhone(phone);
  }

  @Post('onboarding/draft')
  @Roles(Role.AGENT)
  createDraft(@Body() dto: CreateClientDraftDto, @CurrentUser() actor: StaffActor) {
    return this.clientsService.createDraft(dto, actor);
  }

  /** Création d'un nouveau client + RÉCIT (Cash) */
  @Post('onboarding/recit')
  @Roles(Role.CAISSIER)
  @CheckMobileMoney('modePaiement')
  async onboardingRecit(@Body() body: any, @CurrentUser() user: StaffActor) {
    const siteId = effectiveStaffSite(user, body.siteId);
    await this.staffScope.requireExistingPhone(user, body.telephone, Role.CAISSIER);
    return this.clientsService.onboardingRecit({ ...body, siteId, agentId: user.id }, user);
  }

  /** Reprise du RÉCIT d'un client existant — Cash (depuis la file d'attente) */
  @Post(':id/onboarding/recit')
  @Roles(Role.CAISSIER)
  @CheckMobileMoney('modePaiement')
  async resumeOnboardingRecit(@Param('id') clientId: string, @Body() body: any, @CurrentUser() user: StaffActor) {
    effectiveStaffSite(user, body.siteId);
    await this.staffScope.requireClient(user, clientId, Role.CAISSIER);
    return this.clientsService.resumeOnboardingRecit(clientId, { ...body, agentId: user.id }, user);
  }

  /** Reprise du RÉCIT d'un client existant — Mobile Money KPay */
  @Post(':id/onboarding/recit/kpay/init')
  @Roles(Role.CAISSIER)
  @CheckMobileMoney()
  async resumeOnboardingRecitKpay(@Param('id') clientId: string, @Body() body: any, @CurrentUser() user: StaffActor) {
    effectiveStaffSite(user, body.siteId);
    await this.staffScope.requireClient(user, clientId, Role.CAISSIER);
    return this.clientsService.resumeInitKpayRecit(clientId, { ...body, agentId: user.id });
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
    @CurrentUser() user: StaffActor,
  ) {
    effectiveStaffSite(user);
    return this.clientsService.importPreview(file, user);
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
    @CurrentUser() user: StaffActor,
  ) {
    effectiveStaffSite(user);
    return this.clientsService.importExecute(file, user);
  }

  @Get(':id')
  @Roles(Role.FORMATEUR)
  async findOne(@Param('id') id: string, @CurrentUser() user: StaffActor) {
    await this.staffScope.requireClient(user, id, Role.FORMATEUR);
    return this.clientsService.findOne(id, user);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateClientDto,
    @CurrentUser() user: StaffActor,
  ) {
    await this.staffScope.requireClient(user, id, Role.AGENT);
    return this.clientsService.update(id, dto, user);
  }

  @Post(':id/onboarding/formation')
  @Roles(Role.FORMATEUR)
  async onboardingFormation(
    @Param('id') clientId: string,
    @Body() dto: OnboardingFormationDto,
    @CurrentUser() user: StaffActor,
  ) {
    await this.staffScope.requireClient(user, clientId, Role.FORMATEUR);
    return this.clientsService.onboardingFormation(clientId, dto, user.id);
  }

  @Post(':id/onboarding/fiche')
  @Roles(Role.CAISSIER)
  @CheckMobileMoney('modePaiement')
  async onboardingFiche(
    @Param('id') clientId: string,
    @Body() dto: OnboardingFicheDto,
    @CurrentUser() user: StaffActor,
  ) {
    await this.staffScope.requireClient(user, clientId, Role.CAISSIER);
    return this.clientsService.onboardingFiche(clientId, dto, user.id);
  }

  @Post('onboarding/recit/kpay/init')
  @Roles(Role.CAISSIER)
  @CheckMobileMoney()
  async onboardingRecitKpay(@Body() body: any, @CurrentUser() user: StaffActor) {
    const siteId = effectiveStaffSite(user, body.siteId);
    await this.staffScope.requireExistingPhone(user, body.telephone, Role.CAISSIER);
    return this.clientsService.initKpayRecit({ ...body, siteId, agentId: user.id });
  }

  @Post(':id/onboarding/fiche/kpay/init')
  @Roles(Role.CAISSIER)
  @CheckMobileMoney()
  async onboardingFicheKpay(
    @Param('id') clientId: string,
    @Body() dto: InitKpayOnboardingDto,
    @CurrentUser() user: StaffActor,
  ) {
    await this.staffScope.requireClient(user, clientId, Role.CAISSIER);
    return this.clientsService.initKpayFiche(clientId, dto, user.id);
  }

  @Post(':id/onboarding/activate')
  @Roles(Role.CAISSIER)
  @CheckMobileMoney('modePaiement')
  async onboardingActivate(
    @Param('id') clientId: string,
    @Body() dto: OnboardingActivateDto,
    @CurrentUser() user: StaffActor,
  ) {
    await this.staffScope.requireClient(user, clientId, Role.CAISSIER);
    return this.clientsService.onboardingActivate(clientId, dto, user.id, { responseActor: user });
  }

  @Post(':id/onboarding/activate/kpay/init')
  @Roles(Role.CAISSIER)
  @CheckMobileMoney()
  async onboardingActivateKpay(@Param('id') clientId: string, @Body() dto: InitKpayActivationDto, @CurrentUser() user: StaffActor) {
    await this.staffScope.requireClient(user, clientId, Role.CAISSIER);
    return this.clientsService.initKpayActivation(clientId, dto, user.id);
  }
}
