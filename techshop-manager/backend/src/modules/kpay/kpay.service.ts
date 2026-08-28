import { BadRequestException, HttpException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { createHmac, timingSafeEqual } from 'crypto';
import {
  DRC_KPAY_PROVIDERS,
  KpayDepositInput,
  KpayPayment,
  KpayPayoutInput,
  KpayProvider,
} from './kpay.types';

const MAX_ATTEMPTS = 3;

@Injectable()
export class KpayService {
  private readonly http: AxiosInstance;
  constructor(private readonly config: ConfigService) {
    this.http = axios.create({
      baseURL: `${this.config.get<string>('KPAY_BASE_URL', 'https://admin.kpay.site')}/api/v1`,
      timeout: 15000,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  async initDeposit(input: KpayDepositInput): Promise<KpayPayment> {
    const payload = { currency: 'USD', ...input } as Record<string, unknown>;
    if (input.provider || input.phoneNumber) {
      if (!input.provider || !input.phoneNumber) {
        throw new BadRequestException('Le provider et le numéro Mobile Money sont obligatoires en mode USSD');
      }
      payload.provider = this.validateProvider(input.provider);
      payload.phoneNumber = this.normalizeDrcPhone(input.phoneNumber);
    } else if (!input.returnUrl) {
      throw new BadRequestException('returnUrl est obligatoire en mode passerelle');
    }
    return this.request<KpayPayment>({ method: 'post', url: '/payments/init', data: payload });
  }

  getDeposit(id: string) {
    return this.request<KpayPayment>({ method: 'get', url: `/payments/${encodeURIComponent(id)}` });
  }

  async initPayout(input: KpayPayoutInput): Promise<KpayPayment> {
    return this.request<KpayPayment>({
      method: 'post',
      url: '/payments/withdraw',
      data: {
        ...input,
        provider: this.validateProvider(input.provider),
        phoneNumber: this.normalizeDrcPhone(input.phoneNumber),
      },
    });
  }

  getPayout(id: string) {
    return this.request<KpayPayment>({ method: 'get', url: `/payments/withdraw/${encodeURIComponent(id)}` });
  }

  refundDeposit(paymentId: string, input: { externalId: string; reason: string }) {
    return this.request<KpayPayment>({
      method: 'post',
      url: `/payments/${encodeURIComponent(paymentId)}/refund`,
      data: input,
    });
  }

  verifyWebhook(rawBody: Buffer, signature?: string): void {
    if (!signature || !this.isSignatureValid(rawBody, signature, this.required('KPAY_WEBHOOK_SECRET'))) {
      throw new UnauthorizedException('Signature KPay invalide');
    }
  }

  verifyGatewayReturn(query: { status?: string; reference?: string; externalId?: string; ts?: string; sig?: string }): void {
    const { status, reference, externalId, ts, sig } = query;
    if (!status || !reference || !externalId || !ts || !sig) {
      throw new UnauthorizedException('Retour KPay incomplet');
    }
    const timestamp = Number(ts);
    if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > 10 * 60 * 1000) {
      throw new UnauthorizedException('Retour KPay expiré');
    }
    const payload = Buffer.from(`${status}|${reference}|${externalId}|${ts}`);
    if (!this.isSignatureValid(payload, sig, this.required('KPAY_GATEWAY_SECRET'))) {
      throw new UnauthorizedException('Signature de retour KPay invalide');
    }
  }

  normalizeDrcPhone(phoneNumber: string): string {
    let normalized = phoneNumber.replace(/[^\d]/g, '').replace(/^00/, '');
    if (normalized.startsWith('0')) normalized = `243${normalized.slice(1)}`;
    else if (/^\d{9}$/.test(normalized)) normalized = `243${normalized}`;
    if (!/^243\d{9}$/.test(normalized)) {
      throw new BadRequestException('Le numéro Mobile Money doit être un numéro RDC au format 243XXXXXXXXX');
    }
    return normalized;
  }

  private validateProvider(provider: string): KpayProvider {
    if (!(DRC_KPAY_PROVIDERS as readonly string[]).includes(provider)) {
      throw new BadRequestException('Provider Mobile Money RDC non supporté');
    }
    return provider as KpayProvider;
  }

  private required(key: string): string {
    const value = this.config.get<string>(key);
    if (!value) throw new ServiceUnavailableException(`Configuration KPay manquante: ${key}`);
    return value;
  }

  private isSignatureValid(payload: Buffer, received: string, secret: string): boolean {
    const expected = createHmac('sha256', secret).update(payload).digest('hex');
    const receivedBuffer = Buffer.from(received, 'hex');
    const expectedBuffer = Buffer.from(expected, 'hex');
    return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
  }

  private async request<T>(request: AxiosRequestConfig): Promise<T> {
    let lastError: unknown;
    const apiKey = this.config.get<string>('KPAY_API_KEY');
    const secretKey = this.config.get<string>('KPAY_SECRET_KEY');
    if (!apiKey || !/^kpay_(test|live)_/.test(apiKey) || !secretKey || !/^[0-9a-fA-F]{64}$/.test(secretKey)) {
      throw new ServiceUnavailableException('Configuration KPay invalide: renseignez une clé API kpay_test_/kpay_live_ et un secret hexadécimal de 64 caractères');
    }
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      try {
        return (await this.http.request<T>({
          ...request,
          headers: {
            ...request.headers,
            'X-API-Key': apiKey,
            'X-Secret-Key': secretKey,
          },
        })).data;
      } catch (error) {
        lastError = error;
        if (!this.isTransient(error) || attempt === MAX_ATTEMPTS - 1) break;
        await this.sleep(this.retryDelay(error, attempt));
      }
    }
    if (axios.isAxiosError(lastError) && lastError.response) {
      const body = lastError.response.data as { message?: string; error?: string } | undefined;
      throw new HttpException(
        { statusCode: lastError.response.status, message: body?.message ?? 'KPay a refusé la requête', error: body?.error ?? 'KPayError' },
        lastError.response.status,
      );
    }
    throw lastError;
  }

  private isTransient(error: unknown): boolean {
    if (!axios.isAxiosError(error)) return true;
    const status = error.response?.status;
    return !status || status === 429 || status >= 500;
  }

  private retryDelay(error: unknown, attempt: number): number {
    if (axios.isAxiosError(error)) {
      const retryAfter = Number(error.response?.headers?.['retry-after']);
      if (Number.isFinite(retryAfter) && retryAfter >= 0) return retryAfter * 1000;
    }
    return 1000 * 2 ** attempt;
  }

  private sleep(delay: number) {
    return new Promise((resolve) => setTimeout(resolve, delay));
  }
}
