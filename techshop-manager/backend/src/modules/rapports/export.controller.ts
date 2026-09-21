import {
  Body, Controller, Get, Header, Param, Post, Query, Res, StreamableFile, UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Response } from 'express';
import { StaffActor } from '../../common/access/staff-access';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ExportService } from './export.service';

@Controller('rapports/export')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.GERANT)
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Post()
  @Header('Cache-Control', 'private, no-store')
  createExport(@Body() body: unknown, @CurrentUser() actor: StaffActor) {
    return this.exportService.createExport(body, actor);
  }

  @Get('estimate')
  @Header('Cache-Control', 'private, no-store')
  getExportEstimate(@Query() query: Record<string, unknown>, @CurrentUser() actor: StaffActor) {
    return this.exportService.getExportEstimate(query, actor);
  }

  @Get(':jobId')
  @Header('Cache-Control', 'private, no-store')
  getExportStatus(@Param('jobId') jobId: string, @CurrentUser() actor: StaffActor) {
    return this.exportService.getExportStatus(jobId, actor);
  }

  @Get(':jobId/download')
  async downloadExport(
    @Param('jobId') jobId: string,
    @CurrentUser() actor: StaffActor,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.exportService.downloadExport(jobId, actor);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(file.bytes, {
      type: file.mimeType,
      disposition: `attachment; filename="${file.fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}"`,
      length: file.bytes.length,
    });
  }
}
