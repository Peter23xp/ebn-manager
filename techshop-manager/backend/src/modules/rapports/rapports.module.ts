import { Module } from '@nestjs/common';
import { RapportsController } from './rapports.controller';
import { RapportsService } from './rapports.service';
import { ExportController } from './export.controller';
import { ExportService } from './export.service';

@Module({
  imports: [],
  controllers: [RapportsController, ExportController],
  providers: [RapportsService, ExportService],
  exports: [RapportsService],
})
export class RapportsModule {}
