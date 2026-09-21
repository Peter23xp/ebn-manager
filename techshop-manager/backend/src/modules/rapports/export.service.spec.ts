import { describe, expect, it } from '@jest/globals';
import { BadRequestException, ConflictException, ForbiddenException, GoneException } from '@nestjs/common';
import { Role } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { ExportService } from './export.service';
import { exportActor, exportPrismaFixture, jobFixture, saleFixture } from './export.test-fixtures';

const period = { dateDebut: '2026-09-21', dateFin: '2026-09-21' };
function setup() {
  const fixture = exportPrismaFixture();
  return { ...fixture, service: new ExportService(fixture.prisma as never) };
}

describe('Private export datasets and metadata', () => {
  it('exports and searches the application matricule instead of the optional external identifier', async () => {
    const { service, clients, settled } = setup();
    clients[0].membre = { matricule: '202609176426' };
    clients[0].codeParrain = 'EBN-LEGACY';
    const query = { type: 'CLIENTS', search: '202609176426' };
    expect(await service.getExportEstimate(query, exportActor)).toMatchObject({ estimatedRows: 1 });
    const job = await settled((await service.createExport({ type: 'CLIENTS', format: 'CSV', filtres: { search: query.search } }, exportActor)).jobId);
    expect(job.fileBytes.toString()).toContain('202609176426');
    expect(job.fileBytes.toString()).not.toContain('MAT-1');
  });

  it('uses the referral code as matricule before a member is activated', async () => {
    const { service, clients, settled } = setup();
    clients[0].membre = null;
    clients[0].codeParrain = 'EBN-LEGACY';
    const job = await settled((await service.createExport({ type: 'CLIENTS', format: 'CSV', filtres: { search: 'EBN-LEGACY' } }, exportActor)).jobId);
    expect(job.fileBytes.toString()).toContain('EBN-LEGACY');
    expect(job.rowCount).toBe(1);
  });
  it.each(['VENTES', 'VENTES_DETAIL', 'STOCKS', 'CLIENTS'])('produces CSV and XLSX for %s, durable across service instances', async type => {
    for (const format of ['CSV', 'XLSX']) {
      const { service, prisma, settled } = setup();
      const jobId = (await service.createExport({ type, format }, exportActor)).jobId;
      const job = await settled(jobId);
      expect(job.statut).toBe('READY');
      const bytes = (await new ExportService(prisma as never).downloadExport(jobId, exportActor)).bytes;
      if (format === 'XLSX') {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(bytes as never);
        expect(workbook.worksheets[0].rowCount).toBe(job.rowCount + 1);
      } else {
        expect(bytes.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
      }
    }
  });

  it('honors stock search consistently for estimate and file', async () => {
    const { service, settled } = setup();
    expect(await service.getExportEstimate({ type: 'STOCKS', format: 'XLSX', search: 'sku-1' }, exportActor)).toMatchObject({ estimatedRows: 1 });
    const job = await settled((await service.createExport({ type: 'STOCKS', format: 'CSV', filtres: { search: 'missing' } }, exportActor)).jobId);
    expect(job.rowCount).toBe(0);
  });

  it('preserves requested chronological sort across pages without duplicates', async () => {
    const { service, sales, settled, prisma } = setup();
    sales.splice(0, sales.length, ...Array.from({ length: 501 }, (_, index) => saleFixture(`sale-${String(index).padStart(4, '0')}`, {
      createdAt: new Date(Date.UTC(2026, 8, 1) + index * 1000),
    })));
    const job = await settled((await service.createExport({ type: 'VENTES', format: 'CSV', filtres: { sortDir: 'desc' } }, exportActor)).jobId);
    expect(job.rowCount).toBe(501);
    const rows = job.fileBytes.toString().trim().split('\r\n').slice(1);
    expect(rows[0]).toContain('sale-0500');
    expect(rows[500]).toContain('sale-0000');
    expect(new Set(rows).size).toBe(501);
    expect(prisma.vente.findMany.mock.calls[1][0].skip).toBe(500);
  });

  it('records the actual enforced site in filter metadata', async () => {
    const { service, settled } = setup();
    const jobId = (await service.createExport({ type: 'CLIENTS', format: 'CSV' }, exportActor)).jobId;
    await settled(jobId);
    expect((await service.getExportStatus(jobId, exportActor)).filtres).toMatchObject({ siteId: 'site-a' });
  });

  it('uses identical paid-sale/site/client/date scope for estimate and file, with truthful metadata', async () => {
    const { service, prisma, settled } = setup();
    expect(await service.getExportEstimate({ type: 'VENTES', ...period }, exportActor)).toMatchObject({ estimatedRows: 2, maxRows: 10000 });
    const { jobId } = await service.createExport({ type: 'VENTES', format: 'CSV', filtres: period }, exportActor);
    const job = await settled(jobId);
    expect(job.statut).toBe('READY');
    expect(job.fileBytes.toString()).toContain('sale-a');
    expect(job.fileBytes.toString()).toContain('anonymous');
    for (const secret of ['foreign-client', 'foreign-sale', 'unpaid', 'cancelled', 'next-day']) expect(job.fileBytes.toString()).not.toContain(secret);
    expect(job.fileBytes.toString()).toContain('"12.5"');
    expect(job).toMatchObject({ ownerId: 'owner', scopeRole: 'GERANT', scopeActorSiteId: 'site-a', scopeSiteId: 'site-a', rowCount: 2 });
    const status = await service.getExportStatus(jobId, exportActor);
    expect(status).toMatchObject({ jobId, statut: 'READY', fileSize: job.fileBytes.length, rowCount: 2, mimeType: 'text/csv; charset=utf-8', downloadUrl: `/rapports/export/${jobId}/download` });
    expect(status).not.toHaveProperty('fileBytes');
    expect(status).not.toHaveProperty('ownerId');
    expect(prisma.exportJob.findUnique.mock.calls.slice(-1)[0][0].select).not.toHaveProperty('fileBytes');
    const download = await service.downloadExport(jobId, exportActor);
    expect(download.bytes).toEqual(job.fileBytes);
  });

  it('counts detail lines, filters their category, and exports line amounts without duplicating sale totals', async () => {
    const { service, settled } = setup();
    const filtres = { ...period, categorie: 'Téléphones', agentId: 'agent-a', modePaiement: 'CASH', search: 'sale-a' };
    expect(await service.getExportEstimate({ type: 'VENTES_DETAIL', ...filtres }, exportActor)).toMatchObject({ estimatedRows: 1 });
    const job = await settled((await service.createExport({ type: 'VENTES_DETAIL', format: 'CSV', filtres }, exportActor)).jobId);
    expect(job.rowCount).toBe(1);
    expect(job.fileBytes.toString()).toContain('SKU-1');
    expect(job.fileBytes.toString()).not.toContain('SKU-2');
    expect(job.fileBytes.toString()).toContain('"15.5"');
    expect(job.fileBytes.toString()).not.toContain('Montant net');
  });

  it('applies sales agent/payment/search filters to both estimate and file', async () => {
    const { service, settled } = setup();
    for (const filtres of [{ agentId: 'other' }, { modePaiement: 'VIREMENT' }, { search: 'missing' }]) {
      expect(await service.getExportEstimate({ type: 'VENTES', ...filtres }, exportActor)).toMatchObject({ estimatedRows: 0 });
      const job = await settled((await service.createExport({ type: 'VENTES', format: 'CSV', filtres }, exportActor)).jobId);
      expect(job.rowCount).toBe(0);
    }
  });

  it('exports client site/date/status/search scope without credentials or foreign clients', async () => {
    const { service, settled, prisma } = setup();
    const filtres = { ...period, statut: 'ACTIF', search: 'Anne' };
    expect(await service.getExportEstimate({ type: 'CLIENTS', ...filtres }, exportActor)).toMatchObject({ estimatedRows: 1 });
    const job = await settled((await service.createExport({ type: 'CLIENTS', format: 'XLSX', filtres }, exportActor)).jobId);
    expect(job.statut).toBe('READY');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(job.fileBytes);
    expect(JSON.stringify(workbook.worksheets[0].getSheetValues())).toContain('MAT-1');
    expect(JSON.stringify(workbook.worksheets[0].getSheetValues())).not.toContain('Confidentiel');
    expect(prisma.client.findMany.mock.calls[0][0].select).not.toHaveProperty('pinHash');
    expect(job.rowCount).toBe(1);
  });

  it('exports current site stocks and truthful quantities', async () => {
    const { service, settled } = setup();
    expect(await service.getExportEstimate({ type: 'STOCKS', categorie: 'Téléphones' }, exportActor)).toMatchObject({ estimatedRows: 1 });
    const job = await settled((await service.createExport({ type: 'STOCKS', format: 'CSV', filtres: { categorie: 'Téléphones' } }, exportActor)).jobId);
    expect(job.fileBytes.toString()).toContain('Lubumbashi');
    expect(job.fileBytes.toString()).not.toContain('Kinshasa');
    expect(job.fileBytes.toString()).toContain('"3";"5"');
  });

  it.each([Role.DIRECTEUR_REGIONAL, Role.SUPER_ADMIN])('allows %s to choose cross-site scope', async role => {
    const { service, settled } = setup();
    const actor = { ...exportActor, role };
    expect(await service.getExportEstimate({ type: 'CLIENTS' }, actor)).toMatchObject({ estimatedRows: 2 });
    const job = await settled((await service.createExport({ type: 'CLIENTS', format: 'CSV', filtres: { siteId: 'site-b' } }, actor)).jobId);
    expect(job.fileBytes.toString()).toContain('Confidentiel');
    expect(job.fileBytes.toString()).not.toContain('Client local');
  });

  it('paginates datasets rather than reading all rows in one query', async () => {
    const { service, sales, settled, prisma } = setup();
    sales.splice(0, sales.length, ...Array.from({ length: 1001 }, (_, index) => saleFixture(`sale-${String(index).padStart(4, '0')}`)));
    const job = await settled((await service.createExport({ type: 'VENTES', format: 'CSV' }, exportActor)).jobId);
    expect(job.rowCount).toBe(1001);
    expect(prisma.vente.findMany).toHaveBeenCalledTimes(3);
    expect(prisma.vente.findMany.mock.calls.every(([query]) => query.take <= 500 && query.orderBy.id === 'asc')).toBe(true);
    expect(prisma.vente.findMany.mock.calls[1][0].where.id).toEqual({ gt: 'sale-0499' });
  });

  it('accepts exactly 10000 rows without truncation', async () => {
    const { service, clients, settled } = setup();
    const client = clients[0];
    clients.splice(0, clients.length, ...Array.from({ length: 10000 }, (_, index) => ({ ...client, id: `client-${String(index).padStart(5, '0')}` })));
    const job = await settled((await service.createExport({ type: 'CLIENTS', format: 'CSV' }, exportActor)).jobId);
    expect(job.statut).toBe('READY');
    expect(job.rowCount).toBe(10000);
    expect(job.fileBytes.toString().trim().split('\r\n')).toHaveLength(10001);
  });
});

describe('Export rejection and lifecycle', () => {
  it('rejects missing GERANT site or forged site before touching the database', async () => {
    const { service, prisma } = setup();
    await expect(service.createExport({ type: 'CLIENTS', format: 'CSV' }, { ...exportActor, siteId: null })).rejects.toThrow(ForbiddenException);
    await expect(service.getExportEstimate({ type: 'CLIENTS', siteId: 'site-b' }, exportActor)).rejects.toThrow(ForbiddenException);
    expect(prisma.client.count).not.toHaveBeenCalled();
    expect(prisma.exportJob.create).not.toHaveBeenCalled();
  });

  it('estimates oversized results but refuses creation without truncation', async () => {
    const { service, prisma } = setup();
    prisma.client.count.mockResolvedValue(10001);
    expect(await service.getExportEstimate({ type: 'CLIENTS' }, exportActor)).toMatchObject({ estimatedRows: 10001, maxRows: 10000 });
    await expect(service.createExport({ type: 'CLIENTS', format: 'CSV' }, exportActor)).rejects.toThrow(BadRequestException);
    expect(prisma.exportJob.create).not.toHaveBeenCalled();
  });

  it('marks errors truthfully when the dataset grows beyond the limit after admission', async () => {
    const { service, prisma, settled } = setup();
    prisma.client.count.mockResolvedValueOnce(1).mockResolvedValue(10001);
    const job = await settled((await service.createExport({ type: 'CLIENTS', format: 'CSV' }, exportActor)).jobId);
    expect(job.statut).toBe('ERROR');
    expect(job.fileBytes).toBeNull();
    expect(job.errorMsg).toContain('10 000');
  });

  it('never exposes raw database failures or fake download links', async () => {
    const { service, prisma, settled } = setup();
    prisma.vente.findMany.mockRejectedValue(new Error('postgres://secret-password@production'));
    const jobId = (await service.createExport({ type: 'VENTES', format: 'CSV' }, exportActor)).jobId;
    await settled(jobId);
    const status = await service.getExportStatus(jobId, exportActor);
    expect(status.statut).toBe('ERROR');
    expect(status.errorMsg).not.toContain('secret');
    expect(status.downloadUrl).toBeNull();
    await expect(service.downloadExport(jobId, exportActor)).rejects.toThrow(ConflictException);
  });

  it.each([
    { ownerId: 'another' }, { ownerId: null }, { scopeRole: null },
    { scopeRole: Role.SUPER_ADMIN }, { scopeActorSiteId: 'site-b' }, { scopeSiteId: 'site-b' },
  ])('denies status and bytes for foreign, legacy, or changed scopes %j', async overrides => {
    const { service, jobs } = setup();
    jobs.push(jobFixture(overrides));
    await expect(service.getExportStatus('job-existing', exportActor)).rejects.toThrow(ForbiddenException);
    await expect(service.downloadExport('job-existing', exportActor)).rejects.toThrow(ForbiddenException);
  });

  it('denies an old job after a role or site change even for elevated roles', async () => {
    const { service, jobs } = setup();
    jobs.push(jobFixture({ scopeRole: Role.DIRECTEUR_REGIONAL, scopeSiteId: null }));
    await expect(service.getExportStatus('job-existing', { ...exportActor, role: Role.SUPER_ADMIN })).rejects.toThrow(ForbiddenException);
    await expect(service.downloadExport('job-existing', { ...exportActor, role: Role.DIRECTEUR_REGIONAL, siteId: 'site-b' })).rejects.toThrow(ForbiddenException);
  });

  it('reports expiry and refuses download immediately, even before cleanup runs', async () => {
    const { service, jobs } = setup();
    jobs.push(jobFixture({ expiresAt: new Date(Date.now() - 1) }));
    expect(await service.getExportStatus('job-existing', exportActor)).toMatchObject({ statut: 'ERROR', downloadUrl: null });
    await expect(service.downloadExport('job-existing', exportActor)).rejects.toThrow(GoneException);
  });

  it('cleans expired file bytes and stuck pending jobs without deleting historical records', async () => {
    const { service, jobs } = setup();
    jobs.push(jobFixture({ expiresAt: new Date(Date.now() - 1) }), jobFixture({ id: 'stuck', statut: 'PENDING', createdAt: new Date(Date.now() - 660000), expiresAt: new Date(Date.now() + 1000) }), jobFixture({ id: 'live' }), jobFixture({ id: 'legacy', ownerId: null, expiresAt: null }));
    await service.cleanupExpiredExports();
    expect(jobs).toHaveLength(4);
    expect(jobs[0]).toMatchObject({ statut: 'ERROR', fileBytes: null, downloadUrl: null });
    expect(jobs[1]).toMatchObject({ statut: 'ERROR', fileBytes: null });
    expect(jobs[2].fileBytes).toEqual(Buffer.from('private'));
    expect(jobs[3].ownerId).toBeNull();
  });

  it('caps pending exports atomically before creating another job', async () => {
    const { service, jobs, prisma } = setup();
    jobs.push(jobFixture({ id: 'pending-a', statut: 'PENDING' }), jobFixture({ id: 'pending-b', statut: 'PENDING' }));
    await expect(service.createExport({ type: 'CLIENTS', format: 'CSV' }, exportActor)).rejects.toMatchObject({ status: 429 });
    expect(prisma.exportJob.create).not.toHaveBeenCalled();
    expect(prisma.$transaction.mock.calls.some(([, options]) => options?.isolationLevel === 'Serializable')).toBe(true);
  });

  it('caps simultaneous generation globally, across different owners', async () => {
    const { service, jobs } = setup();
    jobs.push(...Array.from({ length: 4 }, (_, index) => jobFixture({ id: `pending-${index}`, ownerId: `other-${index}`, statut: 'PENDING' })));
    await expect(service.createExport({ type: 'CLIENTS', format: 'CSV' }, exportActor)).rejects.toMatchObject({ status: 429 });
  });

  it('retries serialization conflicts without creating duplicate jobs', async () => {
    const { service, prisma, jobs, settled } = setup();
    prisma.$transaction.mockRejectedValueOnce({ code: 'P2034' });
    const job = await settled((await service.createExport({ type: 'CLIENTS', format: 'CSV' }, exportActor)).jobId);
    expect(job.statut).toBe('READY');
    expect(jobs).toHaveLength(1);
  });

  it('bounds repeated serialization conflicts', async () => {
    const { service, prisma } = setup();
    prisma.$transaction.mockRejectedValue({ code: 'P2034' });
    await expect(service.createExport({ type: 'CLIENTS', format: 'CSV' }, exportActor)).rejects.toMatchObject({ status: 429 });
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
  });

  it('rejects pending downloads without fetching file bytes', async () => {
    const { service, jobs, prisma } = setup();
    jobs.push(jobFixture({ statut: 'PENDING', fileBytes: null }));
    await expect(service.downloadExport('job-existing', exportActor)).rejects.toThrow(ConflictException);
    expect(prisma.exportJob.findUnique).toHaveBeenCalledTimes(1);
  });

  it('caps retained jobs globally so database file storage is bounded', async () => {
    const { service, jobs } = setup();
    jobs.push(...Array.from({ length: 20 }, (_, index) => jobFixture({ id: `other-${index}`, ownerId: `owner-${index}` })));
    await expect(service.createExport({ type: 'CLIENTS', format: 'CSV' }, exportActor)).rejects.toMatchObject({ status: 429 });
  });

  it('does not resurrect a pending job that expired during generation', async () => {
    const { service, jobs, prisma, settled } = setup();
    prisma.vente.findMany.mockImplementationOnce(async () => {
      jobs[0].expiresAt = new Date(Date.now() - 1);
      await service.cleanupExpiredExports();
      return [];
    });
    const job = await settled((await service.createExport({ type: 'VENTES', format: 'CSV' }, exportActor)).jobId);
    expect(job.statut).toBe('ERROR');
    expect(job.fileBytes).toBeNull();
  });
});
