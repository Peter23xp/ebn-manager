import { Module } from '@nestjs/common';
import { VentesController } from './ventes.controller';
import { VentesService } from './ventes.service';
import { KpayModule } from '../kpay/kpay.module';
import { StaffScopeService } from '../../common/access/staff-scope.service';

@Module({
  imports: [KpayModule],
  controllers: [VentesController],
  providers: [VentesService, StaffScopeService],
  exports: [VentesService],
})
export class VentesModule {}
