import { ServiceUnavailableException } from '@nestjs/common';

export const MOBILE_MONEY_ENABLED = false;
export const MOBILE_MONEY_UNAVAILABLE_MESSAGE = 'Le paiement Mobile Money est en cours de développement. Veuillez utiliser le paiement en espèces.';

export function assertMobileMoneyAvailable() {
  if (!MOBILE_MONEY_ENABLED) {
    throw new ServiceUnavailableException({ code: 'MOBILE_MONEY_UNAVAILABLE', message: MOBILE_MONEY_UNAVAILABLE_MESSAGE });
  }
}

export function isMobileMoneyMethod(value: unknown): boolean {
  return typeof value === 'string' && ['MPESA', 'AIRTEL_MONEY', 'ORANGE_MONEY', 'MOBILE_MONEY', 'KPAY'].includes(value.trim().toUpperCase());
}
