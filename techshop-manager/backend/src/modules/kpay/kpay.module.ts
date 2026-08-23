import { Module } from '@nestjs/common';
import { KpayService } from './kpay.service';
import { KpayWebhookController } from './kpay-webhook.controller';
import { KpayWebhookService } from './kpay-webhook.service';

@Module({
  controllers: [KpayWebhookController],
  providers: [KpayService, KpayWebhookService],
  exports: [KpayService, KpayWebhookService],
})
export class KpayModule {}
