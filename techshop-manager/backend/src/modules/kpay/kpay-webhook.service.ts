import { Injectable, Logger } from '@nestjs/common';
import { KpayOperationType, KpayTransactionStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { KpayWebhookEvent } from './kpay.types';

type Finalizer = (transactionId: string, event: KpayWebhookEvent) => Promise<void>;
const TERMINAL_STATUSES = new Set<KpayTransactionStatus>(['COMPLETED', 'FAILED', 'CANCELLED', 'REFUNDED']);

@Injectable()
export class KpayWebhookService {
  private readonly logger = new Logger(KpayWebhookService.name);
  private readonly finalizers = new Map<KpayOperationType, Finalizer>();

  constructor(private readonly prisma: PrismaService) {}

  registerFinalizer(operationType: KpayOperationType, finalizer: Finalizer) {
    this.finalizers.set(operationType, finalizer);
  }

  async process(event: KpayWebhookEvent): Promise<void> {
    const transaction = await this.prisma.kpayTransaction.findFirst({
      where: { OR: [{ kpayPaymentId: event.paymentId }, { externalId: event.externalId }] },
      select: { id: true, operationType: true, terminalEventProcessedAt: true },
    });
    if (!transaction) {
      this.logger.warn(`Webhook KPay inconnu: ${event.paymentId}`);
      return;
    }

    const status = event.status as KpayTransactionStatus;
    if (transaction.terminalEventProcessedAt && TERMINAL_STATUSES.has(status)) return;

    await this.prisma.kpayTransaction.update({
      where: { id: transaction.id },
      data: {
        status,
        kpayPaymentId: event.paymentId,
        kpayReference: event.reference,
        failureReason: event.failureReason ?? null,
        completedAt: event.completedAt ? new Date(event.completedAt) : null,
        terminalEventProcessedAt: TERMINAL_STATUSES.has(status) ? new Date() : null,
      },
    });

    if (!TERMINAL_STATUSES.has(status)) return;
    const finalizer = this.finalizers.get(transaction.operationType);
    if (finalizer) await finalizer(transaction.id, event);
  }
}
