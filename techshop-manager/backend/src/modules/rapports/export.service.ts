import {
  BadRequestException, ConflictException, ForbiddenException, GoneException,
  HttpException, HttpStatus, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma, Role } from '@prisma/client';
import { StaffActor } from '../../common/access/staff-access';
import { PrismaService } from '../../prisma/prisma.service';
import { countExportRows, readExportData } from './export.data';
import {
  assertExportRowLimit, buildExportFile, EXPORT_FILE_TTL_MS, EXPORT_PENDING_TTL_MS,
  ExportRequest, ExportScope, MAX_EXPORT_ROWS, normalizeExport, resolveExportScope,
} from './export.helpers';

const expiredMessage = 'Cet export a expiré. Veuillez en créer un nouveau.';
const metadataSelect = {
  id: true, type: true, format: true, filtres: true, statut: true, errorMsg: true,
  ownerId: true, scopeRole: true, scopeActorSiteId: true, scopeSiteId: true,
  fileName: true, mimeType: true, fileSize: true, rowCount: true,
  expiresAt: true, createdAt: true, updatedAt: true,
} satisfies Prisma.ExportJobSelect;
type ExportMetadata = Prisma.ExportJobGetPayload<{ select: typeof metadataSelect }>;

@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getExportEstimate(query: unknown, actor: StaffActor) {
    if (!query || typeof query !== 'object' || Array.isArray(query)) throw new BadRequestException('Paramètres d’estimation invalides.');
    const { type, format = 'CSV', ...filtres } = query as Record<string, unknown>;
    const request = normalizeExport({ type, format, filtres });
    const scope = resolveExportScope(actor, request.filtres.siteId);
    const estimatedRows = await countExportRows(this.prisma, request, scope);
    return { estimatedRows, maxRows: MAX_EXPORT_ROWS };
  }

  async createExport(body: unknown, actor: StaffActor) {
    const request = normalizeExport(body);
    const scope = resolveExportScope(actor, request.filtres.siteId);
    assertExportRowLimit(await countExportRows(this.prisma, request, scope));
    await this.cleanupExpiredExports();
    const job = await this.admitJob(request, scope);
    void this.generate(job.id, request, scope, job.expiresAt).catch(() => {
      this.logger.error('Impossible d’enregistrer le résultat d’un export ; il expirera automatiquement.');
    });
    return { jobId: job.id, statut: 'PENDING' as const };
  }

  private async admitJob(request: ExportRequest, scope: ExportScope) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(async transaction => {
          const now = new Date();
          const live: Prisma.ExportJobWhereInput = { ownerId: { not: null }, expiresAt: { gt: now } };
          const [globalCount, ownerCount, globalPending, ownerPending] = await Promise.all([
            transaction.exportJob.count({ where: live }),
            transaction.exportJob.count({ where: { ...live, ownerId: scope.ownerId } }),
            transaction.exportJob.count({ where: { ...live, statut: 'PENDING' } }),
            transaction.exportJob.count({ where: { ...live, ownerId: scope.ownerId, statut: 'PENDING' } }),
          ]);
          if (globalCount >= 20 || ownerCount >= 5 || globalPending >= 4 || ownerPending >= 2) {
            throw new HttpException('Trop d’exports temporaires ou en cours. Veuillez réessayer plus tard.', HttpStatus.TOO_MANY_REQUESTS);
          }
          return transaction.exportJob.create({
            data: {
              type: request.type, format: request.format,
              filtres: { ...request.filtres, ...(scope.scopeSiteId ? { siteId: scope.scopeSiteId } : {}) },
              ...scope, statut: 'PENDING', expiresAt: new Date(now.getTime() + EXPORT_PENDING_TTL_MS),
            },
            select: { id: true, expiresAt: true },
          });
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if (error?.code !== 'P2034') throw error;
      }
    }
    throw new HttpException('Le service d’export est occupé. Veuillez réessayer.', HttpStatus.TOO_MANY_REQUESTS);
  }

  private async generate(jobId: string, request: ExportRequest, scope: ExportScope, deadline: Date) {
    try {
      const data = await this.prisma.$transaction(
        transaction => readExportData(transaction, request, scope, deadline),
        { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 60000, maxWait: 5000 },
      );
      const bytes = await buildExportFile(request.format, data.headers, data.rows);
      const now = new Date();
      await this.prisma.exportJob.updateMany({
        where: { id: jobId, ownerId: scope.ownerId, statut: 'PENDING', expiresAt: { gt: now } },
        data: {
          statut: 'READY', fileBytes: bytes, fileName: `${request.type.toLowerCase()}-${jobId}.${request.format.toLowerCase()}`,
          mimeType: request.format === 'CSV' ? 'text/csv; charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          fileSize: bytes.length, rowCount: data.rows.length, downloadUrl: null, errorMsg: null,
          expiresAt: new Date(now.getTime() + EXPORT_FILE_TTL_MS),
        },
      });
    } catch (error) {
      await this.prisma.exportJob.updateMany({
        where: { id: jobId, ownerId: scope.ownerId, statut: 'PENDING' },
        data: {
          statut: 'ERROR', fileBytes: null, downloadUrl: null,
          errorMsg: error instanceof BadRequestException ? error.message : 'La génération de l’export a échoué. Veuillez réessayer.',
        },
      });
    }
  }

  private async ownedJob(jobId: string, actor: StaffActor): Promise<ExportMetadata> {
    const scope = resolveExportScope(actor);
    const job = await this.prisma.exportJob.findUnique({ where: { id: jobId }, select: metadataSelect });
    if (!job) throw new NotFoundException('Export introuvable.');
    if (!job.ownerId || job.ownerId !== actor.id || job.scopeRole !== actor.role ||
      job.scopeActorSiteId !== scope.scopeActorSiteId ||
      (actor.role === Role.GERANT && job.scopeSiteId !== actor.siteId)) {
      throw new ForbiddenException('Cet export ne vous appartient pas ou votre périmètre d’accès a changé.');
    }
    return job;
  }

  private expired(job: ExportMetadata): boolean {
    return !job.expiresAt || job.expiresAt.getTime() <= Date.now() ||
      (job.statut === 'PENDING' && job.createdAt.getTime() + EXPORT_PENDING_TTL_MS <= Date.now());
  }

  async getExportStatus(jobId: string, actor: StaffActor) {
    const job = await this.ownedJob(jobId, actor);
    const expired = this.expired(job);
    const ready = !expired && job.statut === 'READY';
    return {
      jobId: job.id, type: job.type, format: job.format, filtres: job.filtres,
      statut: expired ? 'ERROR' : job.statut, errorMsg: expired ? expiredMessage : job.errorMsg,
      fileName: job.fileName, mimeType: job.mimeType, fileSize: job.fileSize, rowCount: job.rowCount,
      expiresAt: job.expiresAt, createdAt: job.createdAt, updatedAt: job.updatedAt,
      downloadUrl: ready ? `/rapports/export/${job.id}/download` : null,
    };
  }

  async downloadExport(jobId: string, actor: StaffActor) {
    const job = await this.ownedJob(jobId, actor);
    if (this.expired(job)) throw new GoneException(expiredMessage);
    if (job.statut !== 'READY') throw new ConflictException('Le fichier n’est pas prêt à être téléchargé.');
    const file = await this.prisma.exportJob.findUnique({ where: { id: jobId }, select: { fileBytes: true } });
    if (!file?.fileBytes || !job.fileName || !job.mimeType || this.expired(job)) throw new GoneException(expiredMessage);
    return { bytes: Buffer.from(file.fileBytes), fileName: job.fileName, mimeType: job.mimeType };
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async cleanupExpiredExports(): Promise<void> {
    const now = new Date();
    await this.prisma.exportJob.updateMany({
      where: {
        ownerId: { not: null },
        AND: [
          { OR: [{ expiresAt: { lte: now } }, { statut: 'PENDING', createdAt: { lte: new Date(now.getTime() - EXPORT_PENDING_TTL_MS) } }] },
          { OR: [{ fileBytes: { not: null } }, { statut: { in: ['PENDING', 'READY'] } }] },
        ],
      },
      data: { statut: 'ERROR', fileBytes: null, downloadUrl: null, errorMsg: expiredMessage, expiresAt: now },
    });
  }
}
