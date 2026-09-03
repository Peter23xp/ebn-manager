import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { paginate } from '../../common/dto/pagination.dto';
import {
  UpdateClientDto,
  OnboardingFormationDto,
  OnboardingFicheDto,
  OnboardingActivateDto,
} from './dto/client.dto';
import { EtapeOnboarding, KpayOperationType, KpayTransactionStatus, ModePaiement, Role, StatutClient, StatutEtape, TypeMouvement } from '@prisma/client';
import { randomUUID } from 'crypto';
import { KpayService } from '../kpay/kpay.service';
import { KpayWebhookService } from '../kpay/kpay-webhook.service';
import { InitKpayOnboardingDto, InitKpayActivationDto } from './dto/client.dto';
import { PortalAuthService } from '../portal/portal-auth.service';
import { MailerService } from '../mailer/mailer.service';
import { MlmMatrixService } from '../mlm/mlm-matrix.service';

@Injectable()
export class ClientsService implements OnModuleInit {
  constructor(
    private prisma: PrismaService,
    private portalAuthService: PortalAuthService,
    private mailer: MailerService,
    private mlmMatrixService: MlmMatrixService,
    private readonly kpay: KpayService,
    private readonly kpayWebhooks: KpayWebhookService,
  ) {}

  onModuleInit() {
    this.kpayWebhooks.registerFinalizer(KpayOperationType.ONBOARDING_PAYMENT, async (transactionId, event) => {
      if (event.status === 'COMPLETED') {
        await this.finalizeKpayOnboarding(transactionId);
      } else {
        await this.markKpayOnboardingFailed(transactionId, event.failureReason ?? `Paiement ${event.status}`);
      }
    });

    // Auto-rattrapage automatique des clients ACTIF sans profil Membre MLM
    setTimeout(() => {
      this.healActiveClientsWithoutMembre().catch((err) => {
        console.error('[AUTO-HEAL MLM ERROR]:', err);
      });
    }, 3000);
  }

  /**
   * Rattrape automatiquement les clients actifs qui n'ont pas encore de profil Membre MLM
   * (par exemple suite à une coupure réseau ou un timeout antérieur).
   */
  async healActiveClientsWithoutMembre() {
    const clientsWithoutMembre = await this.prisma.client.findMany({
      where: {
        statut: StatutClient.ACTIF,
        membre: null,
      },
      select: { id: true, parrainClientId: true, prenom: true, nom: true },
      take: 50,
    });

    for (const c of clientsWithoutMembre) {
      try {
        console.log(`[AUTO-HEAL MLM] Initialisation MLM pour ${c.prenom} ${c.nom} (${c.id})...`);
        await this.mlmMatrixService.onClientActivated(c.id, c.parrainClientId ?? undefined);
      } catch (err) {
        console.error(`[AUTO-HEAL MLM] Échec pour ${c.id}:`, err);
      }
    }
  }

  async initKpayFiche(clientId: string, dto: InitKpayOnboardingDto, agentId: string) {
    await this.requireConfiguredAdminPhone(dto.provider);
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      include: { onboardingEtapes: true },
    });
    if (!client) throw new NotFoundException({ code: 'ERR_NOT_FOUND', message: 'Client introuvable' });
    if (!client.onboardingEtapes.some((step) => step.etape === EtapeOnboarding.RECIT && step.statut === StatutEtape.COMPLETE)) {
      throw new BadRequestException({ code: 'ERR_BAD_REQUEST', message: "L'étape RECIT doit être complétée avant la fiche" });
    }
    const existing = client.onboardingEtapes.find((step) => step.etape === EtapeOnboarding.FICHE);
    if (existing?.statut === StatutEtape.COMPLETE) throw new ConflictException({ code: 'ERR_CONFLICT', message: 'La fiche a déjà été complétée' });
    if (existing) {
      const activePayment = await this.prisma.kpayTransaction.findFirst({
        where: { onboardingEtapeId: existing.id, status: { in: [KpayTransactionStatus.PENDING, KpayTransactionStatus.PROCESSING] } },
        select: { id: true, status: true, kpayReference: true },
      });
      if (activePayment) return { transactionId: activePayment.id, status: activePayment.status, reference: activePayment.kpayReference };
    }
    const externalId = `ONB-FICHE-${randomUUID()}`;
    const step = existing ?? await this.prisma.onboardingEtape.create({
      data: { etape: EtapeOnboarding.FICHE, statut: StatutEtape.EN_COURS, montant: dto.amount, modePaiement: ModePaiement.MPESA, clientId, agentId, siteId: client.siteInscriptionId },
    });
    const transaction = await this.prisma.kpayTransaction.create({
      data: { operationType: KpayOperationType.ONBOARDING_PAYMENT, status: KpayTransactionStatus.PENDING, amount: dto.amount, currency: 'CDF', externalId, provider: dto.provider, phoneNumber: dto.phoneNumber, onboardingEtapeId: step.id, metadata: { clientId, etape: EtapeOnboarding.FICHE } },
    });
    const payment = await this.kpay.initDeposit({ amount: dto.amount, currency: 'CDF', provider: dto.provider, phoneNumber: dto.phoneNumber, externalId, description: `Fiche onboarding ${client.prenom} ${client.nom}`, metadata: { clientId, onboardingEtapeId: step.id } });
    await this.prisma.kpayTransaction.update({ where: { id: transaction.id }, data: { kpayPaymentId: payment.id, kpayReference: payment.reference, status: payment.status as KpayTransactionStatus } });
    return { transactionId: transaction.id, status: payment.status, reference: payment.reference };
  }

  async initKpayActivation(clientId: string, dto: InitKpayActivationDto, agentId: string) {
    await this.requireConfiguredAdminPhone(dto.provider);
    const client = await this.prisma.client.findUnique({ where: { id: clientId }, include: { onboardingEtapes: true } });
    if (!client) throw new NotFoundException('Client introuvable');
    if (!client.onboardingEtapes.some((s) => s.etape === EtapeOnboarding.FICHE && s.statut === StatutEtape.COMPLETE)) throw new BadRequestException("La fiche doit être complétée avant l'activation");
    const product = await this.prisma.produit.findUnique({ where: { id: dto.produitId, actif: true } });
    if (!product) throw new NotFoundException('Produit introuvable ou inactif');
    const externalId = `ONB-ACT-${randomUUID()}`;
    const transaction = await this.prisma.kpayTransaction.create({ data: { operationType: KpayOperationType.ONBOARDING_PAYMENT, status: KpayTransactionStatus.PENDING, amount: dto.amount, currency: 'USD', externalId, provider: dto.provider, phoneNumber: dto.phoneNumber, metadata: { activation: true, clientId, agentId, produitId: dto.produitId } } });
    const payment = await this.kpay.initDeposit({ amount: dto.amount, currency: 'USD', provider: dto.provider as any, phoneNumber: dto.phoneNumber, externalId, description: `Activation ${client.prenom} ${client.nom}` });
    await this.prisma.kpayTransaction.update({ where: { id: transaction.id }, data: { kpayPaymentId: payment.id, kpayReference: payment.reference, status: payment.status as KpayTransactionStatus } });
    return { transactionId: transaction.id, status: payment.status, reference: payment.reference };
  }

  private async finalizeKpayOnboarding(transactionId: string) {
    const transaction = await this.prisma.kpayTransaction.findUnique({ where: { id: transactionId }, select: { onboardingEtapeId: true, metadata: true } });
    const metadata = (transaction?.metadata ?? {}) as Record<string, unknown>;
    if (metadata.activation && metadata.clientId && metadata.produitId && metadata.agentId) {
      await this.onboardingActivate(String(metadata.clientId), { produitId: String(metadata.produitId), modePaiement: ModePaiement.MPESA, referenceTransaction: transactionId }, String(metadata.agentId));
      await this.initiateConfiguredAutoPayout(transactionId);
      return;
    }
    if (transaction?.onboardingEtapeId) {
      await this.prisma.onboardingEtape.updateMany({
        where: { id: transaction.onboardingEtapeId, statut: { not: StatutEtape.COMPLETE } },
        data: { statut: StatutEtape.COMPLETE, completeeAt: new Date() },
      });
    }
    await this.initiateConfiguredAutoPayout(transactionId);
  }

  private async markKpayOnboardingFailed(transactionId: string, reason: string) {
    const transaction = await this.prisma.kpayTransaction.findUnique({
      where: { id: transactionId },
      select: { onboardingEtapeId: true },
    });
    if (!transaction?.onboardingEtapeId) return;

    await this.prisma.onboardingEtape.updateMany({
      where: { id: transaction.onboardingEtapeId, statut: { not: StatutEtape.COMPLETE } },
      data: {
        statut: StatutEtape.EN_COURS,
        notes: `Paiement Mobile Money échoué : ${reason}. Nouvelle tentative possible.`,
      },
    });
  }

  private async initiateConfiguredAutoPayout(sourceTransactionId: string) {
    const config = await this.prisma.configGenerale.findFirst();
    if (!config) return;
    const source = await this.prisma.kpayTransaction.findUnique({ where: { id: sourceTransactionId } });
    if (!source || source.status !== KpayTransactionStatus.COMPLETED) return;
    const provider = source.provider as string | null;
    const phoneByProvider: Record<string, string | null | undefined> = {
      VODACOM_MPESA_COD: config.kpayAdminMpesaPhone,
      AIRTEL_COD: config.kpayAdminAirtelPhone,
      ORANGE_COD: config.kpayAdminOrangePhone,
    };
    const phoneNumber = provider ? phoneByProvider[provider] : null;
    if (!provider || !phoneNumber) return;
    const externalId = `AUTO-PAYOUT-${source.externalId}`;
    const existing = await this.prisma.kpayTransaction.findUnique({ where: { externalId }, select: { id: true } });
    if (existing) return;
    const payout = await this.prisma.kpayTransaction.create({
      data: {
        operationType: KpayOperationType.AUTO_PAYOUT,
        status: KpayTransactionStatus.PENDING,
        amount: source.amount,
        currency: source.currency,
        externalId,
        provider,
        phoneNumber,
        metadata: { sourceTransactionId, clientId: (source.metadata as any)?.clientId, purpose: 'ADMIN_AUTO_PAYOUT' },
      },
    });
    try {
      const remote = await this.kpay.initPayout({ amount: Number(source.amount), provider: provider as any, phoneNumber, externalId, description: `Transfert automatique onboarding ${source.externalId}` });
      await this.prisma.kpayTransaction.update({ where: { id: payout.id }, data: { kpayPaymentId: remote.id, kpayReference: remote.reference, status: remote.status as KpayTransactionStatus } });
    } catch (error) {
      await this.prisma.kpayTransaction.update({ where: { id: payout.id }, data: { status: KpayTransactionStatus.FAILED, failureReason: error instanceof Error ? error.message : 'Payout automatique échoué' } });
    }
  }

  private async requireConfiguredAdminPhone(provider: string): Promise<string> {
    const config = await this.prisma.configGenerale.findFirst();
    if (!config) throw new BadRequestException('Configurez les numéros administrateur KPay dans Paramètres > Opérations avant un paiement Mobile Money.');
    const destinations: Record<string, { label: string; phone?: string | null }> = {
      VODACOM_MPESA_COD: { label: 'M-Pesa', phone: config.kpayAdminMpesaPhone },
      AIRTEL_COD: { label: 'Airtel Money', phone: config.kpayAdminAirtelPhone },
      ORANGE_COD: { label: 'Orange Money', phone: config.kpayAdminOrangePhone },
    };
    const destination = destinations[provider];
    if (!destination?.phone) {
      throw new BadRequestException(`Le numéro administrateur ${destination?.label ?? provider} n'est pas configuré dans Paramètres > Opérations.`);
    }
    return destination.phone;
  }

  async findAll(
    query: {
      siteId?: string;
      statut?: string;
      search?: string;
      page?: number;
      limit?: number;
    },
    user: { id: string; role: Role; siteId?: string },
  ) {
    const { statut, search, page = 1, limit = 50 } = query;

    // AGENT voit uniquement les clients de son site
    const effectiveSiteId =
      user.role === Role.AGENT ? user.siteId : query.siteId;

    const where: any = {};

    if (effectiveSiteId) {
      where.siteInscriptionId = effectiveSiteId;
    }
    if (statut) {
      where.statut = statut;
    }
    if (search) {
      where.OR = [
        { prenom: { contains: search, mode: 'insensitive' } },
        { nom: { contains: search, mode: 'insensitive' } },
        { telephone: { contains: search } },
        { codeParrain: { contains: search, mode: 'insensitive' } },
        { membre: { matricule: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.client.findMany({
        where,
        ...paginate(page, limit),
        orderBy: { createdAt: 'desc' },
        include: {
          siteInscription: { select: { id: true, nom: true } },
          membre: {
            select: {
              id: true,
              matricule: true,
              mlmLevelId: true,
              level: { select: { nom: true, ordre: true, couleur: true } },
            },
          },
          onboardingEtapes: { select: { etape: true, statut: true, completeeAt: true } },
        },
      }),
      this.prisma.client.count({ where }),
    ]);

    const mappedData = data.map(({ siteInscription, membre, ...rest }) => ({
      ...rest,
      matricule: membre?.matricule ?? rest.codeParrain,
      membre,
      site: siteInscription,
    }));

    return {
      data: mappedData,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const client = await this.prisma.client.findUnique({
      where: { id },
      include: {
        siteInscription: { select: { id: true, nom: true } },
        parrainClient: {
          select: {
            id: true,
            prenom: true,
            nom: true,
            telephone: true,
            codeParrain: true,
            membre: { select: { matricule: true } },
          },
        },
        membre: {
          include: {
            level: { select: { id: true, nom: true, ordre: true, couleur: true, icone: true } },
            parrain: {
              include: {
                client: { select: { id: true, prenom: true, nom: true, telephone: true } },
              },
            },
          },
        },
        onboardingEtapes: {
          include: {
            agent: { select: { id: true, nom: true } },
          },
          orderBy: { createdAt: 'asc' },
        },

        ventes: {
          select: { id: true, numeroVente: true, montantNet: true, pointsAttribues: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });

    if (!client) {
      throw new NotFoundException({ code: 'ERR_NOT_FOUND', message: 'Client introuvable' });
    }

    let currentClient = client;
    if (client.statut === StatutClient.ACTIF && !client.membre) {
      try {
        await this.mlmMatrixService.onClientActivated(client.id, client.parrainClientId ?? undefined);
        const reloaded = await this.prisma.client.findUnique({
          where: { id },
          include: {
            siteInscription: { select: { id: true, nom: true } },
            parrainClient: {
              select: {
                id: true,
                prenom: true,
                nom: true,
                telephone: true,
                codeParrain: true,
                membre: { select: { matricule: true } },
              },
            },
            membre: {
              include: {
                level: { select: { id: true, nom: true, ordre: true, couleur: true, icone: true } },
                parrain: {
                  include: {
                    client: { select: { id: true, prenom: true, nom: true, telephone: true } },
                  },
                },
              },
            },
            onboardingEtapes: {
              include: {
                agent: { select: { id: true, nom: true } },
              },
              orderBy: { createdAt: 'asc' },
            },
            ventes: {
              select: { id: true, numeroVente: true, montantNet: true, pointsAttribues: true, createdAt: true },
              orderBy: { createdAt: 'desc' },
              take: 20,
            },
          },
        });
        if (reloaded) currentClient = reloaded;
      } catch (err) {
        console.error(`[AUTO-HEAL MLM] Erreur findOne pour ${client.id}:`, err);
      }
    }

    const { siteInscription, membre, parrainClient, ...rest } = currentClient;
    const parrain = membre?.parrain?.client
      ? {
          id: membre.parrain.client.id,
          prenom: membre.parrain.client.prenom,
          nom: membre.parrain.client.nom,
          telephone: membre.parrain.client.telephone,
          matricule: membre.parrain.matricule,
          codeParrain: membre.parrain.matricule,
        }
      : parrainClient
      ? {
          id: parrainClient.id,
          prenom: parrainClient.prenom,
          nom: parrainClient.nom,
          telephone: parrainClient.telephone,
          matricule: parrainClient.membre?.matricule ?? parrainClient.codeParrain,
          codeParrain: parrainClient.membre?.matricule ?? parrainClient.codeParrain,
        }
      : null;

    return {
      ...rest,
      matricule: membre?.matricule ?? currentClient.codeParrain,
      site: siteInscription,
      membre,
      parrain,
    };
  }

  async update(
    id: string,
    dto: UpdateClientDto,
    user: { id: string; role: Role },
  ) {
    const client = await this.prisma.client.findUnique({ where: { id } });
    if (!client) {
      throw new NotFoundException({ code: 'ERR_NOT_FOUND', message: 'Client introuvable' });
    }

    if (dto.telephone && dto.telephone !== client.telephone) {
      const exists = await this.prisma.client.findUnique({
        where: { telephone: dto.telephone },
      });
      if (exists) {
        throw new ConflictException({
          code: 'ERR_CONFLICT',
          message: 'Ce numéro de téléphone est déjà utilisé',
        });
      }
    }

    return this.prisma.client.update({
      where: { id },
      data: {
        ...(dto.prenom && { prenom: dto.prenom }),
        ...(dto.nom && { nom: dto.nom }),
        ...(dto.telephone && { telephone: dto.telephone }),
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
      include: {
        siteInscription: { select: { id: true, nom: true } },
      },
    });
  }

  async checkPhone(phone: string) {
    const client = await this.prisma.client.findUnique({
      where: { telephone: phone },
      select: { id: true, prenom: true, nom: true, statut: true, telephone: true },
    });

    return {
      exists: !!client,
      clientId: client?.id ?? undefined,
      client: client ?? null,
    };
  }

  /**
   * Recherche un parrain actif par matricule (codeParrain) OU par prénom/nom.
   * Utilisé par le formulaire d'inscription pour la saisie assistée.
   */
  async searchParrain(q: string) {
    if (!q || q.trim().length < 2) return { results: [] };

    const term = q.trim();
    const clients = await this.prisma.client.findMany({
      where: {
        statut: StatutClient.ACTIF,
        OR: [
          { membre:      { matricule: { contains: term, mode: 'insensitive' } } },
          { codeParrain: { contains: term, mode: 'insensitive' } },
          { prenom:      { contains: term, mode: 'insensitive' } },
          { nom:         { contains: term, mode: 'insensitive' } },
        ],
      },
      take: 8,
      orderBy: { nom: 'asc' },
      select: {
        id: true,
        prenom: true,
        nom: true,
        codeParrain: true,
        telephone: true,
        membre: { select: { matricule: true } },
      },
    });

    return {
      results: clients.map((c) => ({
        id: c.id,
        nom: `${c.prenom} ${c.nom}`,
        codeParrain: c.membre?.matricule ?? c.codeParrain,
        matricule: c.membre?.matricule ?? c.codeParrain,
        telephone: c.telephone,
      })),
    };
  }

  async search(q: string, statut?: string) {
    const where: any = {};
    if (statut) where.statut = statut;
    if (q) {
      where.OR = [
        { prenom: { contains: q, mode: 'insensitive' } },
        { nom: { contains: q, mode: 'insensitive' } },
        { telephone: { contains: q } },
        { codeParrain: { contains: q, mode: 'insensitive' } },
      ];
    }

    const clients = await this.prisma.client.findMany({
      where,
      take: 20,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        prenom: true,
        nom: true,
        telephone: true,
        codeParrain: true,
              statut: true,

      },
    });

    return { clients };
  }

  /**
   * Reprend le RÉCIT d'un client identifié par son ID (bouton « Compléter le récit » de la file).
   * Aucun risque de doublon car on identifie le client par son ID, pas par son téléphone.
   */
  async resumeOnboardingRecit(clientId: string, dto: {
    montantRecit: number;
    modePaiement: ModePaiement;
    numeroRecu?: string;
    agentId: string;
  }) {
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      include: { onboardingEtapes: true },
    });
    if (!client) throw new NotFoundException({ code: 'ERR_NOT_FOUND', message: 'Client introuvable' });
    if (client.statut !== StatutClient.EN_COURS) {
      throw new ConflictException({ code: 'ERR_CONFLICT', message: "Ce client n'est plus en cours d'onboarding" });
    }

    const recitStep = client.onboardingEtapes.find((s) => s.etape === EtapeOnboarding.RECIT);

    // Ancien incident : COMPLETE + transaction FAILED → remettre EN_COURS
    if (recitStep?.statut === StatutEtape.COMPLETE) {
      const failedPayment = await this.prisma.kpayTransaction.findFirst({
        where: {
          onboardingEtapeId: recitStep.id,
          OR: [
            { status: { in: [KpayTransactionStatus.FAILED, KpayTransactionStatus.CANCELLED] } },
            { status: KpayTransactionStatus.PENDING, kpayPaymentId: null },
          ],
        },
        select: { id: true },
      });
      if (failedPayment) {
        await this.prisma.onboardingEtape.update({
          where: { id: recitStep.id },
          data: { statut: StatutEtape.EN_COURS, completeeAt: null, notes: 'Paiement précédent échoué. Reprise autorisée.' },
        });
        recitStep.statut = StatutEtape.EN_COURS;
      } else {
        throw new ConflictException({ code: 'ERR_CONFLICT', message: 'Le récit de ce client est déjà complété et payé' });
      }
    }

    const completedStep = await this.prisma.onboardingEtape.upsert({
      where: { clientId_etape: { clientId, etape: EtapeOnboarding.RECIT } },
      create: {
        etape: EtapeOnboarding.RECIT,
        statut: StatutEtape.COMPLETE,
        completeeAt: new Date(),
        montant: dto.montantRecit,
        modePaiement: dto.modePaiement,
        referenceTransaction: dto.numeroRecu,
        clientId,
        agentId: dto.agentId,
        siteId: client.siteInscriptionId,
      },
      update: {
        statut: StatutEtape.COMPLETE,
        completeeAt: new Date(),
        montant: dto.montantRecit,
        modePaiement: dto.modePaiement,
        referenceTransaction: dto.numeroRecu,
        agentId: dto.agentId,
        notes: null,
      },
    });
    return { client: await this.findOne(clientId), etapeId: completedStep.id };
  }

  /**
   * Reprend le RÉCIT KPay d'un client identifié par son ID.
   * Lance un nouveau paiement Mobile Money sans créer de doublon client.
   */
  async resumeInitKpayRecit(clientId: string, dto: {
    montantRecit: number;
    provider: string;
    phoneNumber: string;
    agentId: string;
  }) {
    await this.requireConfiguredAdminPhone(dto.provider);
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      include: { onboardingEtapes: true },
    });
    if (!client) throw new NotFoundException({ code: 'ERR_NOT_FOUND', message: 'Client introuvable' });
    if (client.statut !== StatutClient.EN_COURS) {
      throw new ConflictException({ code: 'ERR_CONFLICT', message: "Ce client n'est plus en cours d'onboarding" });
    }

    const recitStep = client.onboardingEtapes.find((s) => s.etape === EtapeOnboarding.RECIT);

    // Ancien incident : COMPLETE + transaction FAILED → remettre EN_COURS
    if (recitStep?.statut === StatutEtape.COMPLETE) {
      const failedPayment = await this.prisma.kpayTransaction.findFirst({
        where: {
          onboardingEtapeId: recitStep.id,
          OR: [
            { status: { in: [KpayTransactionStatus.FAILED, KpayTransactionStatus.CANCELLED] } },
            { status: KpayTransactionStatus.PENDING, kpayPaymentId: null },
          ],
        },
        select: { id: true },
      });
      if (!failedPayment) {
        throw new ConflictException({ code: 'ERR_CONFLICT', message: 'Le récit de ce client est déjà complété et payé' });
      }
      await this.prisma.onboardingEtape.update({
        where: { id: recitStep.id },
        data: { statut: StatutEtape.EN_COURS, completeeAt: null, notes: 'Paiement précédent échoué. Reprise KPay autorisée.' },
      });
      recitStep.statut = StatutEtape.EN_COURS;
    }

    // Si un paiement actif (PENDING/PROCESSING avec kpayPaymentId) → le retourner
    if (recitStep) {
      const activePayment = await this.prisma.kpayTransaction.findFirst({
        where: {
          onboardingEtapeId: recitStep.id,
          status: { in: [KpayTransactionStatus.PENDING, KpayTransactionStatus.PROCESSING] },
          kpayPaymentId: { not: null },
        },
        select: { id: true, status: true, kpayReference: true },
      });
      if (activePayment) return { client, transactionId: activePayment.id, status: activePayment.status, reference: activePayment.kpayReference };
    }

    const externalId = `ONB-RECIT-RESUME-${randomUUID()}`;
    const pending = await this.prisma.$transaction(async (tx) => {
      const etape = await tx.onboardingEtape.upsert({
        where: { clientId_etape: { clientId, etape: EtapeOnboarding.RECIT } },
        create: {
          etape: EtapeOnboarding.RECIT,
          statut: StatutEtape.EN_COURS,
          montant: dto.montantRecit,
          modePaiement: ModePaiement.MPESA,
          clientId,
          agentId: dto.agentId,
          siteId: client.siteInscriptionId,
        },
        update: {
          statut: StatutEtape.EN_COURS,
          montant: dto.montantRecit,
          modePaiement: ModePaiement.MPESA,
          agentId: dto.agentId,
          notes: null,
        },
      });
      const transaction = await tx.kpayTransaction.create({
        data: {
          operationType: KpayOperationType.ONBOARDING_PAYMENT,
          status: KpayTransactionStatus.PENDING,
          amount: dto.montantRecit,
          currency: 'CDF',
          externalId,
          provider: dto.provider,
          phoneNumber: dto.phoneNumber,
          onboardingEtapeId: etape.id,
          metadata: { recit: true, clientId, onboardingEtapeId: etape.id },
        },
      });
      return { transaction };
    });

    let payment;
    try {
      payment = await this.kpay.initDeposit({
        amount: dto.montantRecit,
        currency: 'CDF',
        provider: dto.provider as any,
        phoneNumber: dto.phoneNumber,
        externalId,
        description: `Récit onboarding reprise ${client.prenom} ${client.nom}`,
      });
    } catch (error) {
      await this.prisma.kpayTransaction.update({
        where: { id: pending.transaction.id },
        data: {
          status: KpayTransactionStatus.FAILED,
          failureReason: error instanceof Error ? error.message : 'Initialisation KPay échouée',
        },
      });
      throw error;
    }
    await this.prisma.kpayTransaction.update({
      where: { id: pending.transaction.id },
      data: { kpayPaymentId: payment.id, kpayReference: payment.reference, status: payment.status as KpayTransactionStatus },
    });
    return { client, transactionId: pending.transaction.id, status: payment.status, reference: payment.reference };
  }

  /**
   * Crée un nouveau client + étape RÉCIT (Cash).
   * Si un client EN_COURS existe déjà avec ce numéro et que son RÉCIT n'est pas
   * encore COMPLETE (ou COMPLETE avec une transaction FAILED/orpheline), on reprend
   * le dossier existant sans créer de doublon.
   */
  async onboardingRecit(dto: {
    prenom: string;
    nom: string;
    telephone: string;
    email?: string;
    siteId: string;
    codeParrain?: string;
    matriculeExterne?: string;
    montantRecit: number;
    modePaiement: ModePaiement;
    numeroRecu?: string;
    agentId: string;
  }) {
    // Chercher un client existant par téléphone
    const existingClient = await this.prisma.client.findUnique({
      where: { telephone: dto.telephone },
      include: { onboardingEtapes: true },
    });

    if (existingClient) {
      const recitStep = existingClient.onboardingEtapes.find(
        (step) => step.etape === EtapeOnboarding.RECIT,
      );

      // Ancien incident : RÉCIT COMPLETE mais transaction FAILED/CANCELLED ou PENDING orpheline
      // → remettre EN_COURS pour autoriser la reprise
      if (recitStep?.statut === StatutEtape.COMPLETE) {
        const failedPayment = await this.prisma.kpayTransaction.findFirst({
          where: {
            onboardingEtapeId: recitStep.id,
            OR: [
              { status: { in: [KpayTransactionStatus.FAILED, KpayTransactionStatus.CANCELLED] } },
              { status: KpayTransactionStatus.PENDING, kpayPaymentId: null },
            ],
          },
          select: { id: true },
        });
        if (failedPayment) {
          await this.prisma.onboardingEtape.update({
            where: { id: recitStep.id },
            data: {
              statut: StatutEtape.EN_COURS,
              completeeAt: null,
              notes: 'Paiement précédent échoué. Reprise autorisée.',
            },
          });
          recitStep.statut = StatutEtape.EN_COURS;
        }
      }

      // Client EN_COURS + RÉCIT pas encore COMPLETE → reprendre le dossier
      if (
        existingClient.statut === StatutClient.EN_COURS &&
        (!recitStep || recitStep.statut !== StatutEtape.COMPLETE)
      ) {
        const resumedStep = await this.prisma.onboardingEtape.upsert({
          where: { clientId_etape: { clientId: existingClient.id, etape: EtapeOnboarding.RECIT } },
          create: {
            etape: EtapeOnboarding.RECIT,
            statut: StatutEtape.COMPLETE,
            completeeAt: new Date(),
            montant: dto.montantRecit,
            modePaiement: dto.modePaiement,
            referenceTransaction: dto.numeroRecu,
            clientId: existingClient.id,
            agentId: dto.agentId,
            siteId: existingClient.siteInscriptionId,
          },
          update: {
            statut: StatutEtape.COMPLETE,
            completeeAt: new Date(),
            montant: dto.montantRecit,
            modePaiement: dto.modePaiement,
            referenceTransaction: dto.numeroRecu,
            agentId: dto.agentId,
            notes: null,
          },
        });
        return { client: await this.findOne(existingClient.id), etapeId: resumedStep.id };
      }

      // Sinon : RÉCIT déjà COMPLETE avec paiement valide → doublon
      throw new ConflictException({
        code: 'ERR_CONFLICT',
        message: 'Un client avec ce numéro existe déjà et son récit est déjà complété',
      });
    }

    // Aucun client existant — vérifier les autres contraintes d'unicité

    // Vérifier matricule externe si fourni
    if (dto.matriculeExterne) {
      const existingMatricule = await this.prisma.client.findUnique({
        where: { matriculeExterne: dto.matriculeExterne },
      });
      if (existingMatricule) {
        throw new ConflictException({
          code: 'ERR_CONFLICT',
          message: 'Ce matricule externe est déjà utilisé',
        });
      }
    }

    // Vérifier doublon email si fourni
    if (dto.email) {
      const existingEmail = await this.prisma.client.findUnique({
        where: { email: dto.email },
      });
      if (existingEmail) {
        throw new ConflictException({
          code: 'ERR_CONFLICT',
          message: 'Un client avec cet email existe déjà',
        });
      }
    }

    // Résoudre le parrain par code
    let parrainId: string | undefined;
    if (dto.codeParrain) {
      const parrain = await this.prisma.client.findFirst({
        where: {
          OR: [
            { codeParrain: dto.codeParrain },
            { membre: { matricule: dto.codeParrain } },
          ],
        },
      });
      if (!parrain) {
        throw new BadRequestException({
          code: 'ERR_BAD_REQUEST',
          message: 'Parrain introuvable ou matricule invalide',
        });
      }
      if (parrain.statut !== StatutClient.ACTIF) {
        throw new BadRequestException({
          code: 'ERR_BAD_REQUEST',
          message: 'Le parrain doit être un membre actif',
        });
      }
      parrainId = parrain.id;
    }

    // Vérifier que le site existe
    const site = await this.prisma.site.findUnique({ where: { id: dto.siteId } });
    if (!site) {
      throw new NotFoundException({ code: 'ERR_NOT_FOUND', message: 'Site introuvable' });
    }

    // Créer le client et l'étape RECIT dans une transaction
    const { newClient, etape } = await this.prisma.$transaction(async (tx) => {
      const newClient = await tx.client.create({
        data: {
          prenom: dto.prenom,
          nom: dto.nom,
          telephone: dto.telephone,
          email: dto.email,
          matriculeExterne: dto.matriculeExterne,
          parrainClientId: parrainId,
          siteInscriptionId: dto.siteId,
          createdById: dto.agentId,

          statut: StatutClient.EN_COURS,
        },
      });

      const etape = await tx.onboardingEtape.create({
        data: {
          etape: EtapeOnboarding.RECIT,
          statut: StatutEtape.COMPLETE,
          completeeAt: new Date(),
          montant: dto.montantRecit,
          modePaiement: dto.modePaiement,
          referenceTransaction: dto.numeroRecu,
          clientId: newClient.id,
          agentId: dto.agentId,
          siteId: dto.siteId,
        },
      });

      return { newClient, etape };
    });

    const client = await this.findOne(newClient.id);
    return { client, etapeId: etape.id };
  }

  async initKpayRecit(dto: {
    prenom: string; nom: string; telephone: string; email?: string; siteId: string;
    codeParrain?: string; montantRecit: number; provider: string; phoneNumber: string; agentId: string;
  }) {
    await this.requireConfiguredAdminPhone(dto.provider);
    const existingClient = await this.prisma.client.findUnique({ where: { telephone: dto.telephone }, include: { onboardingEtapes: true } });
    const existingStep = existingClient?.onboardingEtapes.find((step) => step.etape === EtapeOnboarding.RECIT);
    if (existingClient && existingStep?.statut === StatutEtape.COMPLETE) {
      const failedPayment = await this.prisma.kpayTransaction.findFirst({
        where: {
          onboardingEtapeId: existingStep.id,
          OR: [
            { status: { in: [KpayTransactionStatus.FAILED, KpayTransactionStatus.CANCELLED] } },
            { status: KpayTransactionStatus.PENDING, kpayPaymentId: null },
          ],
        },
        select: { id: true },
      });
      if (failedPayment) {
        await this.prisma.onboardingEtape.update({ where: { id: existingStep.id }, data: { statut: StatutEtape.EN_COURS, completeeAt: null, notes: 'Paiement précédent échoué. Reprise autorisée.' } });
        existingStep.statut = StatutEtape.EN_COURS;
      }
    }
    if (existingClient && existingStep?.statut === StatutEtape.COMPLETE) throw new ConflictException({ code: 'ERR_CONFLICT', message: 'Un client avec ce numéro existe déjà et son récit est déjà payé' });
    if (existingClient && existingStep) {
      const activePayment = await this.prisma.kpayTransaction.findFirst({
        where: { onboardingEtapeId: existingStep.id, status: { in: [KpayTransactionStatus.PENDING, KpayTransactionStatus.PROCESSING] }, kpayPaymentId: { not: null } },
        select: { id: true, status: true, kpayReference: true },
      });
      if (activePayment) return { client: existingClient, transactionId: activePayment.id, status: activePayment.status, reference: activePayment.kpayReference };
      const retryablePayment = await this.prisma.kpayTransaction.findFirst({
        where: {
          onboardingEtapeId: existingStep.id,
          OR: [
            { status: { in: [KpayTransactionStatus.FAILED, KpayTransactionStatus.CANCELLED] } },
            { status: KpayTransactionStatus.PENDING, kpayPaymentId: null },
          ],
        },
        select: { id: true },
      });
      if (!retryablePayment) throw new ConflictException({ code: 'ERR_CONFLICT', message: 'Le paiement précédent est encore en cours de vérification.' });
    } else if (existingClient) {
      throw new ConflictException({ code: 'ERR_CONFLICT', message: 'Un client avec ce numéro existe déjà' });
    }
    const site = await this.prisma.site.findUnique({ where: { id: dto.siteId }, select: { id: true } });
    if (!site) throw new NotFoundException({ code: 'ERR_NOT_FOUND', message: 'Site introuvable' });
    if (dto.codeParrain) {
      const parrain = await this.prisma.client.findFirst({ where: { OR: [{ codeParrain: dto.codeParrain }, { membre: { matricule: dto.codeParrain } }] }, select: { id: true, statut: true } });
      if (!parrain || parrain.statut !== StatutClient.ACTIF) throw new BadRequestException({ code: 'ERR_BAD_REQUEST', message: 'Parrain introuvable ou inactif' });
    }
    const externalId = `ONB-RECIT-${randomUUID()}`;
    const pending = await this.prisma.$transaction(async (tx) => {
      const client = existingClient ?? await tx.client.create({ data: { prenom: dto.prenom, nom: dto.nom, telephone: dto.telephone, email: dto.email, parrainClientId: dto.codeParrain ? (await tx.client.findFirst({ where: { OR: [{ codeParrain: dto.codeParrain }, { membre: { matricule: dto.codeParrain } }] }, select: { id: true } }))?.id : null, siteInscriptionId: dto.siteId, createdById: dto.agentId, statut: StatutClient.EN_COURS } });
      const etape = await tx.onboardingEtape.upsert({ where: { clientId_etape: { clientId: client.id, etape: EtapeOnboarding.RECIT } }, create: { etape: EtapeOnboarding.RECIT, statut: StatutEtape.EN_COURS, montant: dto.montantRecit, modePaiement: ModePaiement.MPESA, clientId: client.id, agentId: dto.agentId, siteId: dto.siteId }, update: { statut: StatutEtape.EN_COURS, montant: dto.montantRecit, modePaiement: ModePaiement.MPESA, agentId: dto.agentId, notes: null } });
      const transaction = await tx.kpayTransaction.create({ data: { operationType: KpayOperationType.ONBOARDING_PAYMENT, status: KpayTransactionStatus.PENDING, amount: dto.montantRecit, currency: 'CDF', externalId, provider: dto.provider, phoneNumber: dto.phoneNumber, onboardingEtapeId: etape.id, metadata: { recit: true, clientId: client.id, onboardingEtapeId: etape.id } } });
      return { client, transaction };
    });
    let payment;
    try {
      payment = await this.kpay.initDeposit({ amount: dto.montantRecit, currency: 'CDF', provider: dto.provider as any, phoneNumber: dto.phoneNumber, externalId, description: `Récit onboarding ${dto.prenom} ${dto.nom}` });
    } catch (error) {
      await this.prisma.kpayTransaction.update({ where: { id: pending.transaction.id }, data: { status: KpayTransactionStatus.FAILED, failureReason: error instanceof Error ? error.message : 'Initialisation KPay échouée' } });
      throw error;
    }
    await this.prisma.kpayTransaction.update({ where: { id: pending.transaction.id }, data: { kpayPaymentId: payment.id, kpayReference: payment.reference, status: payment.status as KpayTransactionStatus } });
    return { client: pending.client, transactionId: pending.transaction.id, status: payment.status, reference: payment.reference };
  }

  async onboardingFormation(
    clientId: string,
    dto: OnboardingFormationDto,
    agentId: string,
  ) {
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      include: { onboardingEtapes: true },
    });
    if (!client) {
      throw new NotFoundException({ code: 'ERR_NOT_FOUND', message: 'Client introuvable' });
    }

    const recitEtape = client.onboardingEtapes.find(
      (e) => e.etape === EtapeOnboarding.RECIT,
    );
    if (!recitEtape || recitEtape.statut !== StatutEtape.COMPLETE) {
      throw new BadRequestException({
        code: 'ERR_BAD_REQUEST',
        message: "L'étape RECIT doit être complétée avant la formation",
      });
    }

    const existingFormation = client.onboardingEtapes.find(
      (e) => e.etape === EtapeOnboarding.FORMATION,
    );
    if (existingFormation && existingFormation.statut === StatutEtape.COMPLETE) {
      throw new ConflictException({
        code: 'ERR_CONFLICT',
        message: 'La formation a déjà été complétée',
      });
    }

    // Vérifier que le formateur existe
    const formateur = await this.prisma.utilisateur.findUnique({
      where: { id: dto.formateurId },
    });
    if (!formateur) {
      throw new NotFoundException({ code: 'ERR_NOT_FOUND', message: 'Formateur introuvable' });
    }

    const notes = dto.dureeMinutes
      ? `Durée: ${dto.dureeMinutes} min${dto.notes ? '. ' + dto.notes : ''}`
      : dto.notes;

    if (existingFormation) {
      return this.prisma.onboardingEtape.update({
        where: { id: existingFormation.id },
        data: {
          statut: StatutEtape.COMPLETE,
          completeeAt: new Date(dto.dateFormation),
          notes: notes,
          agentId: dto.formateurId,
        },
      });
    }

    return this.prisma.onboardingEtape.create({
      data: {
        etape: EtapeOnboarding.FORMATION,
        statut: StatutEtape.COMPLETE,
        completeeAt: new Date(dto.dateFormation),
        notes: notes,
        clientId,
        agentId: dto.formateurId,
        siteId: client.siteInscriptionId,
      },
    });
  }

  async onboardingFiche(
    clientId: string,
    dto: OnboardingFicheDto,
    agentId: string,
  ) {
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      include: { onboardingEtapes: true },
    });
    if (!client) {
      throw new NotFoundException({ code: 'ERR_NOT_FOUND', message: 'Client introuvable' });
    }

    const recitEtape = client.onboardingEtapes.find(
      (e) => e.etape === EtapeOnboarding.RECIT,
    );
    if (!recitEtape || recitEtape.statut !== StatutEtape.COMPLETE) {
      throw new BadRequestException({
        code: 'ERR_BAD_REQUEST',
        message: "L'étape RECIT doit être complétée avant la fiche",
      });
    }

    const existingFiche = client.onboardingEtapes.find(
      (e) => e.etape === EtapeOnboarding.FICHE,
    );
    if (existingFiche && existingFiche.statut === StatutEtape.COMPLETE) {
      throw new ConflictException({
        code: 'ERR_CONFLICT',
        message: 'La fiche a déjà été complétée',
      });
    }

    if (existingFiche) {
      return this.prisma.onboardingEtape.update({
        where: { id: existingFiche.id },
        data: {
          statut: StatutEtape.COMPLETE,
          completeeAt: new Date(),
          montant: dto.montantFiche,
          modePaiement: dto.modePaiement,
          referenceTransaction: dto.numeroTransaction,
          agentId,
        },
      });
    }

    return this.prisma.onboardingEtape.create({
      data: {
        etape: EtapeOnboarding.FICHE,
        statut: StatutEtape.COMPLETE,
        completeeAt: new Date(),
        montant: dto.montantFiche,
        modePaiement: dto.modePaiement,
        referenceTransaction: dto.numeroTransaction,
        clientId,
        agentId,
        siteId: client.siteInscriptionId,
      },
    });
  }

  async onboardingActivate(clientId: string, dto: OnboardingActivateDto, agentId: string) {
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      include: { onboardingEtapes: true },
    });
    if (!client) {
      throw new NotFoundException({ code: 'ERR_NOT_FOUND', message: 'Client introuvable' });
    }

    if (client.statut === StatutClient.ACTIF) {
      throw new ConflictException({
        code: 'ERR_CONFLICT',
        message: 'Ce client est déjà actif',
      });
    }

    const ficheEtape = client.onboardingEtapes.find(
      (e) => e.etape === EtapeOnboarding.FICHE,
    );
    if (!ficheEtape || ficheEtape.statut !== StatutEtape.COMPLETE) {
      throw new BadRequestException({
        code: 'ERR_BAD_REQUEST',
        message: "Toutes les étapes d'onboarding doivent être complétées",
      });
    }

    // Vérifier que le produit existe
    const produit = await this.prisma.produit.findUnique({
      where: { id: dto.produitId, actif: true },
    });
    if (!produit) {
      throw new NotFoundException({ code: 'ERR_NOT_FOUND', message: 'Produit introuvable ou inactif' });
    }

    // Vérifier le stock disponible sur le site du client
    const stockSite = await this.prisma.stockSite.findUnique({
      where: { produitId_siteId: { produitId: dto.produitId, siteId: client.siteInscriptionId } },
    });
    if (!stockSite || stockSite.quantite < 1) {
      throw new ConflictException({
        code: 'ERR_STOCK_INSUFFISANT',
        message: `Stock insuffisant pour ${produit.nom}. Disponible: ${stockSite?.quantite ?? 0}`,
      });
    }

    // Générer un code parrain unique format TSG-XXXX
    const codeParrain = await this.generateUniqueCodeParrain();

    // Générer le numéro de vente
    const siteCodeRaw = (await this.prisma.site.findUnique({
      where: { id: client.siteInscriptionId },
      select: { nom: true },
    }))?.nom ?? 'SITE';
    const siteCode = siteCodeRaw.substring(0, 3).toUpperCase();
    const now = new Date();
    const prefix = `${siteCode}-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-`;
    const lastVente = await this.prisma.vente.findFirst({
      where: { numeroVente: { startsWith: prefix } },
      orderBy: { createdAt: 'desc' },
      select: { numeroVente: true },
    });
    const seq = lastVente?.numeroVente
      ? (parseInt(lastVente.numeroVente.split('-').pop() ?? '0', 10) || 0) + 1
      : 1;
    const numeroVente = `${prefix}${String(seq).padStart(4, '0')}`;

    const prixVente = Number(produit.prixVente);

    const activatedClient = await this.prisma.$transaction(async (tx) => {
      // Activer le client
      const updated = await tx.client.update({
        where: { id: clientId },
        data: {
          statut: StatutClient.ACTIF,
          codeParrain,
          dateActivation: new Date(),
        },
      });

      // Créer l'étape ACTIVATION
      await tx.onboardingEtape.upsert({
        where: { clientId_etape: { clientId, etape: EtapeOnboarding.ACTIVATION } },
        create: {
          etape: EtapeOnboarding.ACTIVATION,
          statut: StatutEtape.COMPLETE,
          completeeAt: new Date(),
          montant: prixVente,
          modePaiement: dto.modePaiement,
          referenceTransaction: dto.referenceTransaction,
          clientId,
          agentId,
          siteId: client.siteInscriptionId,
        },
        update: {
          statut: StatutEtape.COMPLETE,
          completeeAt: new Date(),
          montant: prixVente,
          modePaiement: dto.modePaiement,
          referenceTransaction: dto.referenceTransaction,
          agentId,
        },
      });

      // Créer la vente pour le produit d'activation (40 points fixes à l'activation)
      const POINTS_ACTIVATION = 40;
      const newVente = await tx.vente.create({
        data: {
          numeroVente,
          siteId: client.siteInscriptionId,
          agentId,
          clientId,
          modePaiement: dto.modePaiement,
          referenceTransaction: dto.referenceTransaction,
          montantBrut: prixVente,
          remiseFidelite: 0,
          montantNet: prixVente,
          pointsAttribues: POINTS_ACTIVATION,
          lignes: {
            create: [{
              produitId: dto.produitId,
              quantite: 1,
              prixUnitaire: prixVente,
              sousTotal: prixVente,
            }],
          },
        },
      });



      // Décrémenter le stock
      const quantiteApres = stockSite.quantite - 1;
      await tx.stockSite.update({
        where: { produitId_siteId: { produitId: dto.produitId, siteId: client.siteInscriptionId } },
        data: { quantite: quantiteApres },
      });

      // Créer le mouvement stock
      await tx.mouvementStock.create({
        data: {
          type: TypeMouvement.SORTIE_VENTE,
          quantite: 1,
          quantiteAvant: stockSite.quantite,
          quantiteApres,
          reference: numeroVente,
          produitId: dto.produitId,
          siteId: client.siteInscriptionId,
          agentId,
        },
      });



      return updated;
    });

    // Définir le PIN par défaut = 4 derniers chiffres du téléphone
    const defaultPin = await this.portalAuthService.initDefaultPin(
      activatedClient.id,
      activatedClient.telephone,
    );

    if (process.env.NODE_ENV !== 'production') {
      console.log(`[PORTAL PIN] Client ${activatedClient.telephone} → PIN par défaut: ${defaultPin}`);
    }

    if (activatedClient.email) {
      await this.mailer.sendActivationBienvenue(
        activatedClient.email,
        `${activatedClient.prenom} ${activatedClient.nom}`,
        codeParrain,
        siteCodeRaw,
      );
    }

    // Activer le profil Membre MLM et initialiser matrice / portefeuille (avec retry automatique)
    let mlmSuccess = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await this.mlmMatrixService.onClientActivated(activatedClient.id, client.parrainClientId ?? undefined);
        mlmSuccess = true;
        break;
      } catch (err) {
        console.error(`[MLM ACTIVATION ATTEMPT ${attempt}/3 FAILED] Client ${activatedClient.id}:`, err);
        if (attempt < 3) {
          await new Promise((res) => setTimeout(res, 500 * attempt));
        }
      }
    }

    return this.findOne(activatedClient.id);
  }

  async getOnboardingQueue(siteId?: string) {
    const where: any = { statut: 'EN_COURS' };
    if (siteId) where.siteInscriptionId = siteId;

    const clients = await this.prisma.client.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: {
        siteInscription: { select: { id: true, nom: true } },
        createdBy: { select: { id: true, nom: true } },
        onboardingEtapes: {
          select: { etape: true, statut: true, completeeAt: true, agentId: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    const queue = clients.map((c) => {
      const etapesMap = Object.fromEntries(c.onboardingEtapes.map((e) => [e.etape, e]));
      const recitDone = etapesMap['RECIT']?.statut === 'COMPLETE';
      const ficheDone = etapesMap['FICHE']?.statut === 'COMPLETE';

      let etapeActuelle: string;
      let prochainRoute: string;
      if (!recitDone) {
        etapeActuelle = 'RECIT';
        prochainRoute = `/clients/${c.id}/recit`;
      } else if (!ficheDone) {
        etapeActuelle = 'FICHE';
        prochainRoute = `/clients/${c.id}/fiche`;
      } else {
        etapeActuelle = 'ACTIVATION';
        prochainRoute = `/clients/${c.id}/activate`;
      }

      return {
        id: c.id,
        prenom: c.prenom,
        nom: c.nom,
        telephone: c.telephone,
        site: c.siteInscription,
        createdBy: c.createdBy,
        createdAt: c.createdAt,
        etapeActuelle,
        prochainRoute,
        etapes: {
          recit:      etapesMap['RECIT']     ?? null,
          fiche:      etapesMap['FICHE']     ?? null,
          activation: etapesMap['ACTIVATION'] ?? null,
        },
      };
    });

    const stats = {
      ficheEnAttente:      queue.filter((c) => c.etapeActuelle === 'FICHE').length,
      activationEnAttente: queue.filter((c) => c.etapeActuelle === 'ACTIVATION').length,
      total:               queue.length,
    };

    return { queue, stats };
  }

  async getPaiementsOnboarding(query: {
    siteId?: string;
    dateDebut?: string;
    dateFin?: string;
    agentId?: string;
    page?: number;
    limit?: number;
  }) {
    const { siteId, dateDebut, dateFin, agentId, page = 1, limit = 50 } = query;

    const where: any = {
      etape: { in: ['RECIT', 'FICHE'] },
      statut: 'COMPLETE',
      montant: { not: null },
    };

    if (siteId) where.siteId = siteId;
    if (agentId) where.agentId = agentId;
    if (dateDebut || dateFin) {
      where.completeeAt = {};
      if (dateDebut) where.completeeAt.gte = new Date(dateDebut);
      if (dateFin)   where.completeeAt.lte = new Date(dateFin);
    }

    const [data, total, agg] = await Promise.all([
      this.prisma.onboardingEtape.findMany({
        where,
        ...paginate(page, limit),
        orderBy: { completeeAt: 'desc' },
        include: {
          client: { select: { id: true, prenom: true, nom: true, telephone: true } },
          agent:  { select: { id: true, nom: true } },
          site:   { select: { id: true, nom: true } },
        },
      }),
      this.prisma.onboardingEtape.count({ where }),
      this.prisma.onboardingEtape.aggregate({
        where,
        _sum: { montant: true },
        _count: { id: true },
      }),
    ]);

    // KPIs du jour
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [aggJour, aggRecit, aggFiche] = await Promise.all([
      this.prisma.onboardingEtape.aggregate({
        where: { ...where, completeeAt: { gte: today } },
        _sum: { montant: true },
        _count: { id: true },
      }),
      this.prisma.onboardingEtape.aggregate({
        where: { ...where, etape: 'RECIT', completeeAt: { gte: today } },
        _sum: { montant: true },
        _count: { id: true },
      }),
      this.prisma.onboardingEtape.aggregate({
        where: { ...where, etape: 'FICHE', completeeAt: { gte: today } },
        _sum: { montant: true },
        _count: { id: true },
      }),
    ]);

    const paiements = data.map((e) => ({
      id: e.id,
      etape: e.etape,
      montant: Number(e.montant ?? 0),
      modePaiement: e.modePaiement,
      referenceTransaction: e.referenceTransaction,
      completeeAt: e.completeeAt,
      client: e.client,
      agent: e.agent,
      site: e.site,
    }));

    return {
      paiements,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      kpis: {
        totalEncaisse:    Number(agg._sum.montant ?? 0),
        totalEncaisseJour: Number(aggJour._sum.montant ?? 0),
        nbRecitJour:       aggRecit._count.id,
        nbFicheJour:       aggFiche._count.id,
        montantRecitJour:  Number(aggRecit._sum.montant ?? 0),
        montantFicheJour:  Number(aggFiche._sum.montant ?? 0),
      },
    };
  }

  async getNextCode(): Promise<{ nextCode: string }> {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const prefix = `${yyyy}${mm}${dd}`;

    const countToday = await this.prisma.client.count({
      where: {
        OR: [
          { codeParrain: { startsWith: prefix } },
          { membre: { matricule: { startsWith: prefix } } },
        ],
      },
    });

    let seq = countToday + 1;
    let code: string;
    let attempts = 0;
    do {
      code = `${prefix}${String(seq + attempts).padStart(4, '0')}`;
      const exists = await this.prisma.client.findFirst({
        where: {
          OR: [
            { codeParrain: code },
            { membre: { matricule: code } },
          ],
        },
      });
      if (!exists) break;
      attempts++;
    } while (attempts < 100);

    return { nextCode: code };
  }

  private async generateUniqueCodeParrain(): Promise<string> {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const prefix = `${yyyy}${mm}${dd}`;

    const countToday = await this.prisma.client.count({
      where: {
        OR: [
          { codeParrain: { startsWith: prefix } },
          { membre: { matricule: { startsWith: prefix } } },
        ],
      },
    });

    let seq = countToday + 1;
    let code: string;
    let attempts = 0;
    do {
      code = `${prefix}${String(seq + attempts).padStart(4, '0')}`;
      const exists = await this.prisma.client.findFirst({
        where: {
          OR: [
            { codeParrain: code },
            { membre: { matricule: code } },
          ],
        },
      });
      if (!exists) break;
      attempts++;
    } while (attempts < 100);

    return code;
  }

  async importPreview(file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException({ code: 'ERR_BAD_REQUEST', message: 'Fichier requis' });
    }

    const content = file.buffer.toString('utf-8');
    const lines = content.split('\n').filter((l) => l.trim());

    if (lines.length < 2) {
      throw new BadRequestException({
        code: 'ERR_BAD_REQUEST',
        message: 'Le fichier doit contenir au moins un en-tête et une ligne de données',
      });
    }

    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const requiredHeaders = ['prenom', 'nom', 'telephone'];
    const missingHeaders = requiredHeaders.filter((h) => !headers.includes(h));

    if (missingHeaders.length > 0) {
      throw new BadRequestException({
        code: 'ERR_BAD_REQUEST',
        message: `Colonnes manquantes: ${missingHeaders.join(', ')}`,
      });
    }

    const rows: Array<{
      ligne: number;
      nom: string;
      telephone: string;
      matricule: string;
      statut: 'OK' | 'DOUBLON' | 'ERREUR';
      message?: string;
    }> = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map((v) => v.trim());
      const row: any = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx] ?? '';
      });

      const nom = `${row.prenom ?? ''} ${row.nom ?? ''}`.trim();
      const telephone = row.telephone ?? '';
      const matricule = row.matricule ?? row.matriculeexterne ?? '';

      const rowErrors: string[] = [];
      if (!row.prenom) rowErrors.push('Prénom requis');
      if (!row.nom) rowErrors.push('Nom requis');
      if (!telephone) rowErrors.push('Téléphone requis');
      else if (!/^\+243[0-9]{9}$/.test(telephone)) {
        rowErrors.push('Format téléphone invalide (+243XXXXXXXXX)');
      }

      if (rowErrors.length > 0) {
        rows.push({ ligne: i + 1, nom, telephone, matricule, statut: 'ERREUR', message: rowErrors.join(', ') });
        continue;
      }

      const exists = await this.prisma.client.findUnique({ where: { telephone } });
      if (exists) {
        rows.push({ ligne: i + 1, nom, telephone, matricule, statut: 'DOUBLON', message: 'Numéro déjà enregistré' });
        continue;
      }

      rows.push({ ligne: i + 1, nom, telephone, matricule, statut: 'OK' });
    }

    const ok = rows.filter((r) => r.statut === 'OK').length;
    const doublons = rows.filter((r) => r.statut === 'DOUBLON').length;
    const erreurs = rows.filter((r) => r.statut === 'ERREUR').length;

    return {
      total: rows.length,
      ok,
      doublons,
      erreurs,
      lignes: rows,
    };
  }

  async importExecute(file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException({ code: 'ERR_BAD_REQUEST', message: 'Fichier requis' });
    }

    const content = file.buffer.toString('utf-8');
    const lines = content.split('\n').filter((l) => l.trim());

    if (lines.length < 2) {
      throw new BadRequestException({
        code: 'ERR_BAD_REQUEST',
        message: 'Le fichier est vide',
      });
    }

    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const results = { success: 0, doublons: 0, errors: 0, details: [] as { ligne: number; message: string }[] };

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map((v) => v.trim());
      const row: any = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx] ?? '';
      });

      try {
        if (!row.telephone || !/^\+243[0-9]{9}$/.test(row.telephone)) {
          results.errors++;
          results.details.push({ ligne: i + 1, message: 'Téléphone invalide ou manquant' });
          continue;
        }

        const exists = await this.prisma.client.findUnique({
          where: { telephone: row.telephone },
        });

        if (exists) {
          results.doublons++;
          continue;
        }

        if (!row.siteid) {
          results.errors++;
          results.details.push({ ligne: i + 1, message: 'siteId requis' });
          continue;
        }

        const site = await this.prisma.site.findUnique({ where: { id: row.siteid } });
        if (!site) {
          results.errors++;
          results.details.push({ ligne: i + 1, message: `Site introuvable: ${row.siteid}` });
          continue;
        }

        const agent = await this.prisma.utilisateur.findFirst({
          where: { siteId: row.siteid, actif: true },
        });
        if (!agent) {
          results.errors++;
          results.details.push({ ligne: i + 1, message: 'Aucun agent actif pour ce site' });
          continue;
        }

        await this.prisma.client.create({
          data: {
            prenom: row.prenom,
            nom: row.nom,
            telephone: row.telephone,
            email: row.email || undefined,
            matriculeExterne: row.matriculeexterne || undefined,
            siteInscriptionId: row.siteid,
            createdById: agent.id,
            statut: StatutClient.EN_COURS,
          },
        });

        results.success++;
      } catch (err) {
        results.errors++;
        results.details.push({ ligne: i + 1, message: err.message || 'Erreur inattendue' });
      }
    }

    return results;
  }
}
