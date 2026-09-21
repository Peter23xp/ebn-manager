import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { KpayOperationType, KpayTransactionStatus, MlmPayoutStatus, Prisma, TransactionType } from '@prisma/client';
import { KpayProvider } from '../kpay/kpay.types';
import { KpayService } from '../kpay/kpay.service';
import { KpayWebhookService } from '../kpay/kpay-webhook.service';
import { MlmCalendarService } from './mlm-calendar.service';
import { assertMobileMoneyAvailable, isMobileMoneyMethod } from '../../common/payments/mobile-money.policy';
import { excludeHeldReleaseTransfers, walletJournalKind } from './mlm-wallet-journal';
import { readProgressiveSummaries } from './mlm-progressive-summary';
import { StaffActor } from '../../common/access/staff-access';
import { requireFinancialMemberAccess } from './mlm-financial-access';

@Injectable()
export class MlmWalletService implements OnModuleInit {
  private readonly logger = new Logger(MlmWalletService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly kpay: KpayService,
    private readonly webhooks: KpayWebhookService,
    private readonly calendar: MlmCalendarService,
  ) {}

  onModuleInit() {
    this.webhooks.registerFinalizer(KpayOperationType.MLM_PAYOUT, async (transactionId, event) => {
      await this.finalizePayout(transactionId, event.status);
    });
  }

  // ── Get wallet ──────────────────────────────────────────────────────────────

  async getWallet(memberId: string, params: { page?: number; limit?: number } = {}, actor?: StaffActor) {
    if (actor) await requireFinancialMemberAccess(this.prisma, memberId, actor);
    const page = params.page ?? 1;
    const requestedLimit = params.limit ?? 100;
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(requestedLimit) || requestedLimit < 1) {
      throw new BadRequestException('Pagination des retenues invalide');
    }
    const limit = Math.min(requestedLimit, 100);
    const skip = (page - 1) * limit;
    if (!Number.isSafeInteger(skip)) throw new BadRequestException('Pagination des retenues invalide');
    return this.prisma.$transaction(async (tx) => {
      const wallet = await tx.portefeuille.findUnique({
        where: { membreId: memberId },
        include: {
          membre: {
            include: {
              client: { select: { id: true, prenom: true, nom: true } },
              level: { select: { id: true, ordre: true, nom: true, couleur: true } },
            },
          },
        },
      });
      if (!wallet) throw new NotFoundException(`Portefeuille introuvable pour membre ${memberId}`);

      const [financialSummary, lots, total, progressiveCommissions] = await Promise.all([
        this.getFinancialSummary(memberId, tx),
        tx.reinvestLote.findMany({
          where: { membreId: memberId },
          select: {
            id: true, amount: true, releaseDate: true, releasedAt: true, status: true,
            commissionId: true, calendarVersion: true, timezone: true,
          },
          orderBy: [{ releaseDate: 'asc' }, { id: 'asc' }],
          skip,
          take: limit,
        }),
        tx.reinvestLote.count({ where: { membreId: memberId } }),
        readProgressiveSummaries(tx, memberId),
      ]);

      return {
        id: wallet.id,
        membreId: wallet.membreId,
        soldeDisponible: Number(wallet.soldeDisponible),
        soldeReserve: Number(wallet.soldeReserve),
        soldeReinvesti: Number(wallet.soldeReinvesti),
        soldeDisponibleRetrait: new Prisma.Decimal(wallet.soldeDisponible).minus(wallet.soldeReserve).toNumber(),
        totalGagne: Number(wallet.totalGagne),
        membre: wallet.membre,
        updatedAt: wallet.updatedAt,
        financialSummary,
        progressiveCommissions,
        reinvestLots: lots.map((lot) => ({
          ...lot,
          amount: lot.amount.toFixed(2),
          releaseDate: lot.releaseDate.toISOString(),
          releasedAt: lot.releasedAt?.toISOString() ?? null,
        })),
        reinvestLotsMeta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  async getFinancialSummary(memberId: string, tx?: Prisma.TransactionClient) {
    if (tx) return this.readFinancialSummary(memberId, tx);
    return this.prisma.$transaction(
      (snapshot) => this.readFinancialSummary(memberId, snapshot),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  private async readFinancialSummary(memberId: string, tx: Prisma.TransactionClient) {
    const [generated, validated, holds] = await Promise.all([
      tx.commission.aggregate({
        where: { membreId: memberId, statut: { not: 'ANNULEE' } },
        _sum: { montant: true },
      }),
      tx.commission.aggregate({
        where: { membreId: memberId, statut: { in: ['VALIDEE', 'PAYEE'] } },
        _sum: { montant: true, montantSysteme: true },
      }),
      tx.reinvestLote.groupBy({
        by: ['status'],
        where: { membreId: memberId, status: { in: ['HOLD_PERIOD', 'RELEASABLE', 'RELEASED'] } },
        _sum: { amount: true },
      }),
    ]);
    const amounts = new Map(holds.map((hold) => [hold.status, hold._sum.amount]));
    return {
      generatedTotal: new Prisma.Decimal(generated._sum.montant ?? 0).toFixed(2),
      validatedTotal: new Prisma.Decimal(validated._sum.montant ?? 0).toFixed(2),
      immediateAmount: new Prisma.Decimal(validated._sum.montantSysteme ?? 0).toFixed(2),
      heldAmount: new Prisma.Decimal(amounts.get('HOLD_PERIOD') ?? 0).toFixed(2),
      releasableAmount: new Prisma.Decimal(amounts.get('RELEASABLE') ?? 0).toFixed(2),
      releasedAmount: new Prisma.Decimal(amounts.get('RELEASED') ?? 0).toFixed(2),
    };
  }

  async initPayout(memberId: string, input: { amount: number; provider: KpayProvider; phoneNumber: string }) {
    if (!Number.isFinite(input.amount) || input.amount <= 0) throw new BadRequestException('Montant de retrait invalide');
    const payout = await this.prisma.$transaction(async (tx) => {
      const wallet = await tx.portefeuille.findUnique({ where: { membreId: memberId } });
      if (!wallet) throw new NotFoundException('Portefeuille introuvable');
      if (Number(wallet.soldeDisponible) - Number(wallet.soldeReserve) < input.amount) {
        throw new BadRequestException('Solde disponible insuffisant');
      }
      const payout = await tx.mlmPayout.create({ data: { membreId: memberId, montant: input.amount, provider: input.provider, phoneNumber: input.phoneNumber, statut: MlmPayoutStatus.PENDING } });
      await tx.portefeuille.update({ where: { id: wallet.id }, data: { soldeReserve: { increment: input.amount } } });
      return payout;
    });
    return { payoutId: payout.id, status: payout.statut, message: 'Retrait envoyé pour validation administrative' };
  }

  async listPayouts(params: { page?: number; limit?: number; statut?: MlmPayoutStatus }) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const where = params.statut ? { statut: params.statut } : {};
    let [payouts, total] = await Promise.all([
      this.prisma.mlmPayout.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          membre: { include: { client: { select: { id: true, prenom: true, nom: true } } } },
          kpayTransaction: { select: { id: true, status: true, kpayPaymentId: true } },
        },
      }),
      this.prisma.mlmPayout.count({ where }),
    ]);

    const processingTransactions = payouts
      .map((p) => p.kpayTransaction)
      .filter((transaction): transaction is NonNullable<typeof transaction> => Boolean(transaction?.kpayPaymentId && ['PENDING', 'PROCESSING'].includes(transaction.status)));
    if (processingTransactions.length > 0) {
      await Promise.all(processingTransactions.map((transaction) => this.syncPayoutStatus(transaction)));
      // Return the reconciled status immediately to the dashboard.
      [payouts] = await Promise.all([
        this.prisma.mlmPayout.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            membre: { include: { client: { select: { id: true, prenom: true, nom: true } } } },
            kpayTransaction: { select: { id: true, status: true, kpayPaymentId: true } },
          },
        }),
      ]);
    }
    return {
      payouts: payouts.map((p) => ({
        id: p.id,
        montant: Number(p.montant),
        provider: p.provider,
        phoneNumber: p.phoneNumber,
        statut: p.statut,
        failureReason: p.failureReason,
        completedAt: p.completedAt,
        createdAt: p.createdAt,
        membre: p.membre,
      })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async approvePayout(payoutId: string) {
    const externalId = `MLM-PAYOUT-${payoutId}`;
    const approved = await this.prisma.$transaction(async (tx) => {
      const pending = await tx.mlmPayout.findUnique({ where: { id: payoutId } });
      if (!pending) throw new NotFoundException('Demande de retrait introuvable');
      if (pending.statut !== MlmPayoutStatus.PENDING && pending.statut !== MlmPayoutStatus.PROCESSING) throw new BadRequestException('Cette demande a déjà été traitée');
      const existing = await tx.kpayTransaction.findUnique({ where: { payoutId: pending.id } });
      if (pending.statut === MlmPayoutStatus.PROCESSING && existing) return { payout: pending, externalId: existing.externalId, paymentId: existing.kpayPaymentId, paymentStatus: existing.status, reference: existing.kpayReference };
      const wallet = await tx.portefeuille.findUnique({ where: { membreId: pending.membreId } });
      if (!wallet || Number(wallet.soldeDisponible) < Number(pending.montant)) {
        throw new BadRequestException('Solde disponible insuffisant pour valider ce retrait');
      }
      await tx.portefeuille.update({ where: { id: wallet.id }, data: { soldeDisponible: { decrement: pending.montant }, soldeReserve: { decrement: pending.montant } } });
      await tx.transactionPortefeuille.create({ data: { portefeuilleId: wallet.id, type: TransactionType.DEBIT, montant: pending.montant, description: 'Retrait MLM validé — paiement en cours', referenceId: pending.id } });
      await tx.mlmPayout.update({ where: { id: pending.id }, data: { statut: MlmPayoutStatus.PROCESSING } });
      const transactionExternalId = existing?.externalId ?? externalId;
      if (!existing) {
        await tx.kpayTransaction.create({ data: { operationType: KpayOperationType.MLM_PAYOUT, status: KpayTransactionStatus.PENDING, amount: pending.montant, currency: 'USD', externalId: transactionExternalId, provider: pending.provider, phoneNumber: pending.phoneNumber, payoutId: pending.id } });
      }
      return { payout: pending, externalId: transactionExternalId, paymentId: existing?.kpayPaymentId, paymentStatus: existing?.status, reference: existing?.kpayReference };
    });

    try {
      if (approved.paymentId) return { payoutId: approved.payout.id, status: approved.paymentStatus, reference: approved.reference };
      const payment = await this.kpay.initPayout({ amount: Number(approved.payout.montant), provider: approved.payout.provider as KpayProvider, phoneNumber: approved.payout.phoneNumber, externalId: approved.externalId, description: `Retrait MLM ${approved.payout.membreId}` });
      await this.prisma.kpayTransaction.update({ where: { externalId: approved.externalId }, data: { kpayPaymentId: payment.id, kpayReference: payment.reference, status: payment.status as KpayTransactionStatus } });
      return { payoutId: approved.payout.id, status: payment.status, reference: payment.reference };
    } catch (error: any) {
      await this.prisma.$transaction(async (tx) => {
        const wallet = await tx.portefeuille.findUnique({ where: { membreId: approved.payout.membreId } });
        if (wallet) {
          await tx.portefeuille.update({ where: { id: wallet.id }, data: { soldeDisponible: { increment: approved.payout.montant } } });
          await tx.transactionPortefeuille.create({ data: { portefeuilleId: wallet.id, type: TransactionType.COMMISSION, montant: approved.payout.montant, description: 'Rétablissement après échec d’initiation du retrait', referenceId: approved.payout.id } });
        }
        await tx.mlmPayout.update({ where: { id: approved.payout.id }, data: { statut: MlmPayoutStatus.FAILED, failureReason: error?.message ?? 'Échec de communication KPay' } });
        await tx.kpayTransaction.update({ where: { externalId: approved.externalId }, data: { status: KpayTransactionStatus.FAILED, failureReason: error?.message ?? 'Échec de communication KPay' } });
      });
      throw error;
    }
  }

  async cancelPayout(payoutId: string) {
    const payout = await this.prisma.mlmPayout.findUnique({ where: { id: payoutId } });
    if (!payout) throw new NotFoundException('Demande de retrait introuvable');
    if (payout.statut !== MlmPayoutStatus.PENDING) throw new BadRequestException('Cette demande ne peut plus être annulée');
    await this.prisma.$transaction(async (tx) => {
      // Transition atomique PENDING → CANCELLED : sans verrou, une annulation
      // simultanée à une approbation décrémenterait la réserve deux fois.
      const transition = await tx.mlmPayout.updateMany({
        where: { id: payoutId, statut: MlmPayoutStatus.PENDING },
        data: { statut: MlmPayoutStatus.CANCELLED },
      });
      if (transition.count === 0) throw new BadRequestException('Cette demande ne peut plus être annulée');
      await tx.portefeuille.update({ where: { membreId: payout.membreId }, data: { soldeReserve: { decrement: payout.montant } } });
    });
    return this.prisma.mlmPayout.findUnique({ where: { id: payoutId } }) as any;
  }

  private async finalizePayout(transactionId: string, status: KpayTransactionStatus) {
    const transaction = await this.prisma.kpayTransaction.findUnique({ where: { id: transactionId }, include: { payout: true } });
    if (!transaction?.payout || !['PENDING', 'PROCESSING'].includes(transaction.payout.statut)) return;
    await this.prisma.$transaction(async (tx) => {
      // Transition atomique (PENDING|PROCESSING) → statut terminal : un webhook
      // relu et une réconciliation simultanés ne doivent pas rembourser deux fois.
      const transition = await tx.mlmPayout.updateMany({
        where: { id: transaction.payout!.id, statut: { in: [MlmPayoutStatus.PENDING, MlmPayoutStatus.PROCESSING] } },
        data: { statut: status as MlmPayoutStatus, completedAt: status === 'COMPLETED' ? new Date() : null, failureReason: status === 'COMPLETED' ? null : transaction.failureReason },
      });
      if (transition.count === 0) return;
      const wallet = await tx.portefeuille.findUnique({ where: { membreId: transaction.payout!.membreId } });
      if (!wallet) throw new NotFoundException('Portefeuille introuvable');
      if (status !== 'COMPLETED') {
        await tx.portefeuille.update({ where: { id: wallet.id }, data: { soldeDisponible: { increment: transaction.payout!.montant } } });
        await tx.transactionPortefeuille.create({ data: { portefeuilleId: wallet.id, type: TransactionType.COMMISSION, montant: transaction.payout!.montant, description: 'Rétablissement après échec du retrait KPay', referenceId: transaction.id } });
      }
    });
  }

  /**
   * Webhooks are authoritative, but a missed callback must not leave a payout
   * stuck in PROCESSING forever. Reconcile it from KPay when the admin list is
   * opened/refreshed; failures are deliberately non-blocking for the page.
   */
  private async syncPayoutStatus(transaction: { id: string; status: KpayTransactionStatus; kpayPaymentId: string | null }) {
    if (!transaction.kpayPaymentId || !['PENDING', 'PROCESSING'].includes(transaction.status)) return;
    try {
      const remote = await this.kpay.getPayout(transaction.kpayPaymentId);
      const status = remote.status as KpayTransactionStatus;
      await this.prisma.kpayTransaction.update({
        where: { id: transaction.id },
        data: {
          status,
          kpayReference: remote.reference,
          failureReason: remote.failureReason ?? null,
          completedAt: remote.completedAt ? new Date(remote.completedAt) : null,
          terminalEventProcessedAt: ['COMPLETED', 'FAILED', 'CANCELLED', 'REFUNDED'].includes(status) ? new Date() : null,
        },
      });
      if (['COMPLETED', 'FAILED', 'CANCELLED', 'REFUNDED'].includes(status)) {
        await this.finalizePayout(transaction.id, status);
      }
    } catch (error) {
      this.logger.warn(`Réconciliation KPay impossible pour ${transaction.id}: ${error instanceof Error ? error.message : 'erreur inconnue'}`);
    }
  }

  // ── Get transactions ────────────────────────────────────────────────────────

  async getTransactions(params: {
    memberId?: string;
    page?: number;
    limit?: number;
    type?: string;
  }) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const skip = (page - 1) * limit;

    // Resolve portefeuille id if memberId provided
    let portefeuilleId: string | undefined;
    if (params.memberId) {
      const pf = await this.prisma.portefeuille.findUnique({
        where: { membreId: params.memberId },
        select: { id: true },
      });
      if (!pf) throw new NotFoundException(`Portefeuille introuvable`);
      portefeuilleId = pf.id;
    }

    const where: Prisma.TransactionPortefeuilleWhereInput = {};
    if (portefeuilleId) where.portefeuilleId = portefeuilleId;
    if (params.type) where.type = params.type as TransactionType;

    const [transactions, total] = await Promise.all([
      this.prisma.transactionPortefeuille.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          portefeuille: {
            include: {
              membre: {
                include: {
                  client: { select: { id: true, prenom: true, nom: true } },
                },
              },
            },
          },
        },
      }),
      this.prisma.transactionPortefeuille.count({ where }),
    ]);

    return {
      transactions: transactions.map((t) => ({
        id: t.id,
        type: t.type,
        kind: walletJournalKind(t),
        montant: Number(t.montant),
        description: t.description,
        referenceId: t.referenceId,
        createdAt: t.createdAt,
        membre: {
          id: t.portefeuille.membre.id,
          prenom: t.portefeuille.membre.client.prenom,
          nom: t.portefeuille.membre.client.nom,
        },
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ── Earnings by level ───────────────────────────────────────────────────────

  async getEarningsByLevel(memberId: string) {
    const pf = await this.prisma.portefeuille.findUnique({
      where: { membreId: memberId },
      select: { id: true },
    });
    if (!pf) throw new NotFoundException(`Portefeuille introuvable`);

    const transactions = await this.prisma.transactionPortefeuille.groupBy({
      by: ['type'],
      where: { portefeuilleId: pf.id, ...excludeHeldReleaseTransfers },
      _sum: { montant: true },
      _count: { id: true },
    });

    return transactions.map((t) => ({
      type: t.type,
      total: Number(t._sum.montant ?? 0),
      count: t._count.id,
    }));
  }

  // ── Credit wallet (standalone) ──────────────────────────────────────────────

  async creditWallet(
    memberId: string,
    montant: Prisma.Decimal.Value,
    type: TransactionType,
    description: string,
    referenceId?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      return this.creditWalletInTx(tx, memberId, montant, type, description, referenceId);
    });
  }

  // ── Credit wallet inside an existing transaction (used by matrix service) ───

  async creditWalletInTx(
    tx: Prisma.TransactionClient,
    memberId: string,
    montant: Prisma.Decimal.Value,
    type: TransactionType,
    description: string,
    referenceId?: string,
  ) {
    const pf = await tx.portefeuille.findUnique({
      where: { membreId: memberId },
      select: { id: true },
    });
    if (!pf) throw new NotFoundException(`Portefeuille introuvable pour membre ${memberId}`);

    const montantDecimal = new Prisma.Decimal(montant);

    await tx.portefeuille.update({
      where: { id: pf.id },
      data: {
        soldeDisponible: { increment: montantDecimal },
        totalGagne: { increment: montantDecimal },
      },
    });

    await tx.transactionPortefeuille.create({
      data: {
        portefeuilleId: pf.id,
        type,
        montant: montantDecimal,
        description,
        referenceId,
      },
    });
  }

  async creditReinvestInTx(
    tx: Prisma.TransactionClient,
    memberId: string,
    montant: Prisma.Decimal.Value,
    commissionId: string,
    levelNom: string,
    now: Date = new Date(),
  ) {
    if (!commissionId) throw new BadRequestException('Une commission est requise pour constituer une retenue');
    const pf = await tx.portefeuille.findUnique({ where: { membreId: memberId }, select: { id: true } });
    if (!pf) throw new NotFoundException(`Portefeuille introuvable pour membre ${memberId}`);
    const existing = await tx.reinvestLote.findUnique({ where: { commissionId } });
    if (existing) return existing;
    const schedule = await this.calendar.getReleaseSchedule(now, tx);
    const montantDecimal = new Prisma.Decimal(montant);
    const lot = await tx.reinvestLote.create({
      data: {
        membreId: memberId,
        amount: montantDecimal,
        ...schedule,
        releasedAt: null,
        released: false,
        status: 'HOLD_PERIOD',
        commissionId,
      },
    });
    await tx.portefeuille.update({
      where: { id: pf.id },
      data: { soldeReinvesti: { increment: montantDecimal }, totalGagne: { increment: montantDecimal } },
    });
    await tx.transactionPortefeuille.create({
      data: {
        portefeuilleId: pf.id,
        type: 'REINVESTISSEMENT',
        montant: montantDecimal,
        description: `Retenue niveau ${levelNom} — ${montantDecimal.toFixed(2)} USD bloqués 30 jours ouvrables`,
        referenceId: commissionId,
      },
    });
    return lot;
  }

  async releaseHeldLot(lotId: string, actorId: string) {
    if (!actorId?.trim()) throw new BadRequestException('Un acteur est requis pour restituer une retenue');
    return this.prisma.$transaction(async (tx) => {
      const initial = await tx.reinvestLote.findUnique({ where: { id: lotId } });
      if (!initial) throw new NotFoundException('Retenue introuvable');
      const wallet = await tx.portefeuille.findUnique({
        where: { membreId: initial.membreId }, select: { id: true },
      });
      if (!wallet) throw new NotFoundException('Portefeuille introuvable');
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM portefeuilles WHERE id = ${wallet.id} FOR UPDATE
      `;
      if (!locked.length) throw new NotFoundException('Portefeuille introuvable');
      const lot = await tx.reinvestLote.findUnique({ where: { id: lotId } });
      if (!lot) throw new NotFoundException('Retenue introuvable');
      if (lot.status === 'RELEASED') return lot;
      const now = new Date();
      if (lot.status !== 'RELEASABLE' || lot.released || lot.releaseDate > now) {
        throw new BadRequestException('Cette retenue ne peut pas encore être restituée ou a été annulée');
      }
      const claim = await tx.reinvestLote.updateMany({
        where: { id: lotId, status: 'RELEASABLE', released: false, releaseDate: { lte: now } },
        data: { status: 'RELEASED', released: true, releasedAt: now, releasedById: actorId },
      });
      if (claim.count !== 1) {
        const current = await tx.reinvestLote.findUnique({ where: { id: lotId } });
        if (current?.status === 'RELEASED') return current;
        throw new BadRequestException('Cette retenue a déjà été traitée');
      }
      const amount = new Prisma.Decimal(lot.amount);
      const moved = await tx.portefeuille.updateMany({
        where: { id: wallet.id, soldeReinvesti: { gte: amount } },
        data: { soldeReinvesti: { decrement: amount }, soldeDisponible: { increment: amount } },
      });
      if (moved.count !== 1) throw new BadRequestException('Solde retenu insuffisant pour restituer ce lot');
      await tx.transactionPortefeuille.create({
        data: {
          portefeuilleId: wallet.id,
          type: 'REINVESTISSEMENT',
          montant: amount,
          description: `Restitution de la retenue ${lotId}`,
          referenceId: `release:${lotId}`,
        },
      });
      return tx.reinvestLote.findUnique({ where: { id: lotId } });
    }, { timeout: 30000, maxWait: 10000 });
  }

  // ── Withdrawal Requests Management (Admin) ──────────────────────────────────

  async listWithdrawalRequests(params: {
    page?: number;
    limit?: number;
    statut?: string;
    membreId?: string;
  }) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.WithdrawalRequestWhereInput = {};
    if (params.statut && params.statut !== 'all') where.statut = params.statut as any;
    if (params.membreId) where.membreId = params.membreId;

    const [requests, total] = await Promise.all([
      this.prisma.withdrawalRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          membre: {
            include: {
              client: { select: { id: true, prenom: true, nom: true, telephone: true } },
              level: { select: { id: true, ordre: true, nom: true, couleur: true } },
            },
          },
        },
      }),
      this.prisma.withdrawalRequest.count({ where }),
    ]);

    // Résumé GLOBAL par statut (indépendant du filtre/pagination affichés)
    const groups = await this.prisma.withdrawalRequest.groupBy({
      by: ['statut'],
      _count: { id: true },
      _sum: { montant: true },
    });
    const summary: Record<string, { count: number; montant: number }> = {};
    for (const g of groups) {
      summary[g.statut] = { count: g._count.id, montant: Number(g._sum.montant ?? 0) };
    }

    return {
      requests: requests.map((r) => ({
        id: r.id,
        montant: Number(r.montant),
        type: r.type,
        provider: r.provider,
        phoneNumber: r.phoneNumber,
        statut: r.statut,
        commissionIds: (r.commissionIds as string[]) ?? [],
        notes: r.notes,
        rejectReason: r.rejectReason,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        approvedAt: r.approvedAt,
        paidAt: r.paidAt,
        membre: {
          id: r.membre.id,
          matricule: r.membre.matricule,
          client: r.membre.client,
          level: r.membre.level,
        },
      })),
      summary,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async approveWithdrawalRequest(withdrawalRequestId: string, approvedById: string, notes?: string) {
    const request = await this.prisma.withdrawalRequest.findUnique({
      where: { id: withdrawalRequestId },
      include: { membre: true },
    });

    if (!request) {
      throw new NotFoundException(`Demande de retrait ${withdrawalRequestId} introuvable`);
    }

    if (isMobileMoneyMethod(request.type)) assertMobileMoneyAvailable();

    if (request.statut !== 'EN_ATTENTE') {
      throw new BadRequestException(
        `Cette demande a déjà été traitée (statut: ${request.statut})`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // Transition atomique EN_ATTENTE → PAYE : l'approbation d'un retrait le
      // marque PAYÉ dans la foulée (règle métier : débiter = payer). Le guard
      // de statut est DANS la transaction (sinon deux admins / double-clic
      // débitent deux fois).
      const transition = await tx.withdrawalRequest.updateMany({
        where: { id: withdrawalRequestId, statut: 'EN_ATTENTE' },
        data: {
          statut: 'PAYE',
          approvedAt: new Date(),
          approvedById,
          paidAt: new Date(),
          notes: notes || request.notes,
        },
      });
      if (transition.count === 0) {
        throw new BadRequestException(`Cette demande a déjà été traitée (course: ${withdrawalRequestId})`);
      }

      const montant = new Prisma.Decimal(Number(request.montant));

      const portefeuille = await tx.portefeuille.findUnique({
        where: { membreId: request.membreId },
        select: { id: true, soldeDisponible: true },
      });

      if (!portefeuille) {
        throw new NotFoundException(`Portefeuille introuvable pour le membre ${request.membreId}`);
      }

      // Débiter la poche dispo ET consommer la réserve prise à la création —
      // en une SEULE transition conditionnelle : le verrou est sur la ligne
      // portefeuille (pas seulement sur la ligne demande), donc deux demandes
      // DIFFÉRENTES du même membre approuvées simultanément ne peuvent pas
      // toutes deux passer sur le même solde (le second updateMany attend le
      // lock, ré-évalue le WHERE, count=0 → échec propre).
      const debit = await tx.portefeuille.updateMany({
        where: {
          id: portefeuille.id,
          soldeDisponible: { gte: montant },
          soldeReserve: { gte: montant },
        },
        data: { soldeDisponible: { decrement: montant }, soldeReserve: { decrement: montant } },
      });
      if (debit.count === 0) {
        throw new BadRequestException('Solde disponible insuffisant pour valider ce retrait');
      }

      await tx.transactionPortefeuille.create({
        data: {
          portefeuilleId: portefeuille.id,
          type: 'DEBIT',
          montant,
          description: 'Retrait approuvé',
          referenceId: withdrawalRequestId,
        },
      });

      // Statut PAYE posé par la transition verrouillée ci-dessus ; relire la
      // ligne complète pour la réponse.
      const approved = await tx.withdrawalRequest.findUnique({
        where: { id: withdrawalRequestId },
        include: {
          membre: {
            include: {
              client: { select: { id: true, prenom: true, nom: true, telephone: true } },
            },
          },
        },
      }) as any;

      return approved;
    });
  }

  async rejectWithdrawalRequest(withdrawalRequestId: string, rejectReason: string) {
    const request = await this.prisma.withdrawalRequest.findUnique({
      where: { id: withdrawalRequestId },
    });

    if (!request) {
      throw new NotFoundException(`Demande de retrait ${withdrawalRequestId} introuvable`);
    }

    if (request.statut !== 'EN_ATTENTE') {
      throw new BadRequestException(
        `Cette demande a déjà été traitée (statut: ${request.statut})`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // Transition atomique EN_ATTENTE → REJETE (empêche rejet+approbation simultanés)
      const rejected = await tx.withdrawalRequest.updateMany({
        where: { id: withdrawalRequestId, statut: 'EN_ATTENTE' },
        data: { statut: 'REJETE', rejectReason, updatedAt: new Date() },
      });
      if (rejected.count === 0) {
        throw new BadRequestException(`Cette demande a déjà été traitée (course: ${withdrawalRequestId})`);
      }

      // Restituer la réserve : l'argent redevient retirable
      const pf = await tx.portefeuille.findUnique({ where: { membreId: request.membreId }, select: { id: true } });
      if (pf) {
        await tx.portefeuille.update({
          where: { id: pf.id },
          data: { soldeReserve: { decrement: new Prisma.Decimal(Number(request.montant)) } },
        });
      }
      // Statut REJETE déjà posé par la transition verrouillée : relire la ligne.
      return tx.withdrawalRequest.findUnique({ where: { id: withdrawalRequestId } });
    });
  }

  async markWithdrawalAsPaid(withdrawalRequestId: string) {
    const request = await this.prisma.withdrawalRequest.findUnique({
      where: { id: withdrawalRequestId },
    });

    if (!request) {
      throw new NotFoundException(`Demande de retrait ${withdrawalRequestId} introuvable`);
    }

    if (request.statut !== 'APPROUVE') {
      throw new BadRequestException(
        `Seules les demandes approuvées peuvent être marquées comme payées`,
      );
    }

    return this.prisma.withdrawalRequest.update({
      where: { id: withdrawalRequestId },
      data: {
        statut: 'PAYE',
        paidAt: new Date(),
      },
    });
  }
}
