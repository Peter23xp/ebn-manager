import 'reflect-metadata';
import { describe, expect, it, jest } from '@jest/globals';
import { RequestMethod, StreamableFile } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Role } from '@prisma/client';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ExportController } from './export.controller';
import { ExportService } from './export.service';
import { exportActor, exportPrismaFixture, jobFixture } from './export.test-fixtures';

describe('Authenticated export controller contract', () => {
  it('guards every export route with authentication and minimum GERANT role', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, ExportController)).toEqual([JwtAuthGuard, RolesGuard]);
    expect(Reflect.getMetadata(ROLES_KEY, ExportController)).toEqual([Role.GERANT]);
    expect(Reflect.getMetadata(PATH_METADATA, ExportController)).toBe('rapports/export');
  });

  it.each([
    ['createExport', '/', RequestMethod.POST],
    ['getExportEstimate', 'estimate', RequestMethod.GET],
    ['getExportStatus', ':jobId', RequestMethod.GET],
    ['downloadExport', ':jobId/download', RequestMethod.GET],
  ])('registers %s at the compatible route', (method, path, verb) => {
    expect(Reflect.getMetadata(PATH_METADATA, ExportController.prototype[method])).toBe(path);
    expect(Reflect.getMetadata(METHOD_METADATA, ExportController.prototype[method])).toBe(verb);
  });

  it('preserves flattened estimate filters and takes identity from the authenticated actor', async () => {
    const fixture = exportPrismaFixture();
    const controller = new ExportController(new ExportService(fixture.prisma as never));
    expect(await controller.getExportEstimate({ type: 'STOCKS', format: 'CSV', search: 'missing' }, exportActor)).toMatchObject({ estimatedRows: 0 });
    await expect(controller.createExport({ type: 'CLIENTS', format: 'CSV', ownerId: 'forged' }, exportActor)).rejects.toMatchObject({ status: 400 });
  });

  it('returns real bytes as a private attachment, not JSON or a public redirect', async () => {
    const fixture = exportPrismaFixture();
    fixture.jobs.push(jobFixture());
    const controller = new ExportController(new ExportService(fixture.prisma as never));
    const response = { setHeader: jest.fn<any>() };
    const file = await controller.downloadExport('job-existing', exportActor, response as never);
    expect(file).toBeInstanceOf(StreamableFile);
    expect(file.getHeaders()).toEqual({ type: 'text/csv; charset=utf-8', disposition: 'attachment; filename="ventes.csv"', length: 7 });
    const chunks: Buffer[] = [];
    for await (const chunk of file.getStream()) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks).toString()).toBe('private');
    expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
    expect(response.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
  });
});
