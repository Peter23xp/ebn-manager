import { Controller, Headers, HttpCode, Post, Req, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { KpayService } from './kpay.service';
import { KpayWebhookService } from './kpay-webhook.service';
import { KpayWebhookEvent } from './kpay.types';

@Controller('kpay')
export class KpayWebhookController {
  constructor(
    private readonly kpay: KpayService,
    private readonly webhooks: KpayWebhookService,
  ) {}

  @Post('webhooks')
  @HttpCode(200)
  async receive(
    @Req() request: Request & { rawBody?: Buffer },
    @Headers('x-kpay-signature') signature?: string,
  ) {
    const rawBody = request.rawBody;
    if (!rawBody) throw new UnauthorizedException('Corps brut KPay manquant');
    this.kpay.verifyWebhook(rawBody, signature);
    await this.webhooks.process(JSON.parse(rawBody.toString('utf8')) as KpayWebhookEvent);
    return { received: true };
  }
}
