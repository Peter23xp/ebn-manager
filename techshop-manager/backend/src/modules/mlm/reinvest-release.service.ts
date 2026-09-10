import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

/**
 * Libère les lots de réinvestissement (40 %) arrivés à échéance J+30 :
 * bascule amount de soldeReinvesti → soldeDisponible.
 * Idempotent via le filtre `released: false` + update conditionné.
 */
@Injectable()
export class ReinvestReleaseService {
  private readonly logger = new Logger(ReinvestReleaseService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleCron() {
    const count = await this.releaseDueLots();
    if (count > 0) this.logger.log(`${count} lot(s) de réinvestissement libéré(s)`);
  }

  async releaseDueLots(now: Date = new Date()): Promise<number> {
    const lots = await this.prisma.reinvestLote.findMany({
      where: { released: false, releasedAt: { lte: now } },
      select: { id: true, membreId: true, amount: true },
    });
    let released = 0;
    for (const lot of lots) {
      try {
        await this.prisma.$transaction(async (tx) => {
          const pf = await tx.portefeuille.findUnique({
            where: { membreId: lot.membreId },
            select: { id: true },
          });
          if (!pf) throw new Error(`Portefeuille introuvable pour ${lot.membreId}`);
          const amount = new Prisma.Decimal(lot.amount);
          await tx.portefeuille.update({
            where: { id: pf.id },
            data: { soldeDisponible: { increment: amount }, soldeReinvesti: { decrement: amount } },
          });
          await tx.reinvestLote.update({ where: { id: lot.id }, data: { released: true } });
        });
        released++;
      } catch (err) {
        this.logger.error(`Libération lot ${lot.id} échouée: ${err instanceof Error ? err.message : err}`);
      }
    }
    return released;
  }
}
