import { Module } from '@nestjs/common';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';
import { ClientParrainService } from './client-parrain.service';
import { PortalModule } from '../portal/portal.module';
import { MailerModule } from '../mailer/mailer.module';
import { MlmModule } from '../mlm/mlm.module';
import { KpayModule } from '../kpay/kpay.module';
import { StaffScopeService } from '../../common/access/staff-scope.service';

@Module({
  imports: [PortalModule, MailerModule, MlmModule, KpayModule],
  controllers: [ClientsController],
  providers: [ClientsService, ClientParrainService, StaffScopeService],
  exports: [ClientsService],
})
export class ClientsModule {}
