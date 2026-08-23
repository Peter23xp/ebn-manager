import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { KpayOperationType, KpayTransactionStatus, MlmPayoutStatus, Prisma, TransactionType } from '@prisma/client';
import { KpayProvider } from '../kpay/kpay.types';
import { KpayService } from '../kpay/kpay.service';
import { KpayWebhookService } from '../kpay/kpay-webhook.service';

@Injectable()
export class MlmWalletService implements OnModuleInit {
  private readonly logger = new Logger(MlmWalletService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly kpay: KpayService,
    private readonly webhooks: KpayWebhookService,
  ) {}

  onModuleInit() {
    this.webhooks.registerFinalizer(KpayOperationType.MLM_PAYOUT, async (transactionId, event) => {
      await this.finalizePayout(transactionId, event.status);
    });
  }

  // ── Get wallet ──────────────────────────────────────────────────────────────

  async getWallet(memberId: string) {
    const wallet = await this.prisma.portefeuille.findUnique({
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

    return {
      id: wallet.id,
      membreId: wallet.membreId,
      soldeDisponible: Number(wallet.soldeDisponible),
      soldeReserve: Number(wallet.soldeReserve),
      soldeDisponibleRetrait: Number(wallet.soldeDisponible) - Number(wallet.soldeReserve),
      totalGagne: Number(wallet.totalGagne),
      membre: wallet.membre,
      updatedAt: wallet.updatedAt,
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
    await this.prisma.portefeuille.update({ where: { membreId: payout.membreId }, data: { soldeReserve: { decrement: payout.montant } } });
    return this.prisma.mlmPayout.update({ where: { id: payoutId }, data: { statut: MlmPayoutStatus.CANCELLED } });
  }

  private async finalizePayout(transactionId: string, status: KpayTransactionStatus) {
    const transaction = await this.prisma.kpayTransaction.findUnique({ where: { id: transactionId }, include: { payout: true } });
    if (!transaction?.payout || !['PENDING', 'PROCESSING'].includes(transaction.payout.statut)) return;
    await this.prisma.$transaction(async (tx) => {
      const wallet = await tx.portefeuille.findUnique({ where: { membreId: transaction.payout!.membreId } });
      if (!wallet) throw new NotFoundException('Portefeuille introuvable');
      if (status !== 'COMPLETED') {
        await tx.portefeuille.update({ where: { id: wallet.id }, data: { soldeDisponible: { increment: transaction.payout!.montant } } });
        await tx.transactionPortefeuille.create({ data: { portefeuilleId: wallet.id, type: TransactionType.COMMISSION, montant: transaction.payout!.montant, description: 'Rétablissement après échec du retrait KPay', referenceId: transaction.id } });
      }
      await tx.mlmPayout.update({ where: { id: transaction.payout!.id }, data: { statut: status as MlmPayoutStatus, completedAt: status === 'COMPLETED' ? new Date() : null, failureReason: status === 'COMPLETED' ? null : transaction.failureReason } });
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
      where: { portefeuilleId: pf.id },
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
    montant: number,
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
    montant: number,
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
}
