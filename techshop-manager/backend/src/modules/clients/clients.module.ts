import { Module } from '@nestjs/common';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';
import { PortalModule } from '../portal/portal.module';
import { MailerModule } from '../mailer/mailer.module';
import { MlmModule } from '../mlm/mlm.module';
import { KpayModule } from '../kpay/kpay.module';

@Module({
  imports: [PortalModule, MailerModule, MlmModule, KpayModule],
  controllers: [ClientsController],
  providers: [ClientsService],
  exports: [ClientsService],
})
export class ClientsModule {}
