import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ReinvestReleaseService {
  private readonly logger = new Logger(ReinvestReleaseService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleCron() {
    const count = await this.releaseDueLots();
    if (count > 0) this.logger.log(`${count} lot(s) de réinvestissement restituable(s)`);
  }

  async releaseDueLots(now: Date = new Date()): Promise<number> {
    let eligible = 0;
    let lastId: string | undefined;
    while (true) {
      const lots = await this.prisma.reinvestLote.findMany({
        where: {
          status: 'HOLD_PERIOD',
          releaseDate: { lte: now },
          ...(lastId ? { id: { gt: lastId } } : {}),
        },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: 200,
      });
      if (lots.length === 0) break;
      const updated = await this.prisma.reinvestLote.updateMany({
        where: {
          id: { in: lots.map((lot) => lot.id) },
          status: 'HOLD_PERIOD',
          releaseDate: { lte: now },
        },
        data: { status: 'RELEASABLE' },
      });
      eligible += updated.count;
      if (lots.length < 200) break;
      lastId = lots[lots.length - 1].id;
    }
    return eligible;
  }
}
