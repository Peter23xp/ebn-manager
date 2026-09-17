export const MOBILE_MONEY_AVAILABLE: boolean = false;

export const MOBILE_MONEY_UNAVAILABLE_MESSAGE = 'Le paiement Mobile Money est en cours de développement. Veuillez utiliser le paiement en espèces.';

export function isMobileMoneyBlocked(mode: string | null | undefined): boolean {
  return !MOBILE_MONEY_AVAILABLE && ['KPAY', 'MOBILE_MONEY', 'MPESA', 'AIRTEL_MONEY', 'ORANGE_MONEY'].includes(mode ?? '');
}

export async function withPaymentAvailability<Result>(mode: string | null | undefined, initiate: () => Promise<Result>): Promise<Result> {
  if (isMobileMoneyBlocked(mode)) {
    throw Object.assign(new Error(MOBILE_MONEY_UNAVAILABLE_MESSAGE), {
      code: 'MOBILE_MONEY_UNAVAILABLE',
      response: { status: 503, data: { code: 'MOBILE_MONEY_UNAVAILABLE', message: MOBILE_MONEY_UNAVAILABLE_MESSAGE } },
    });
  }
  return initiate();
}
