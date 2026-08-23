export const DRC_KPAY_PROVIDERS = [
  'VODACOM_MPESA_COD',
  'AIRTEL_COD',
  'ORANGE_COD',
] as const;

export type KpayProvider = (typeof DRC_KPAY_PROVIDERS)[number];
export type KpayStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'REFUNDED';

export interface KpayDepositInput {
  amount: number;
  currency?: string;
  externalId: string;
  provider?: KpayProvider;
  phoneNumber?: string;
  description?: string;
  customerName?: string;
  customerEmail?: string;
  metadata?: Record<string, unknown>;
  returnUrl?: string;
  cancelUrl?: string;
}

export interface KpayPayoutInput {
  amount: number;
  externalId: string;
  provider: KpayProvider;
  phoneNumber: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface KpayPayment {
  id: string;
  reference: string;
  externalId: string;
  status: KpayStatus;
  amount: number;
  currency: string;
  provider?: KpayProvider | null;
  phoneNumber?: string | null;
  gatewayUrl?: string;
  failureReason?: string | null;
  completedAt?: string | null;
}

export interface KpayWebhookEvent {
  event: string;
  paymentId: string;
  reference: string;
  status: KpayStatus;
  amount: number;
  externalId: string;
  metadata?: Record<string, unknown>;
  completedAt?: string | null;
  failedAt?: string | null;
  failureReason?: string | null;
  timestamp: string;
}
