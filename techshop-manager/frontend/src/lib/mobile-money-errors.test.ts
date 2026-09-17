import { describe, expect, it } from 'vitest';
import { AxiosError } from 'axios';
import { getErrorMessage } from './api';
import { withPaymentAvailability } from './mobile-money';

describe('Mobile Money error presentation', () => {
  it('retains the exact explanation for a locally blocked API callback', async () => {
    const error = await withPaymentAvailability('KPAY', async () => 'unexpected request').catch(error => error);
    expect(getErrorMessage(error)).toBe('Le paiement Mobile Money est en cours de développement. Veuillez utiliser le paiement en espèces.');
  });

  it('retains the server 503 explanation', () => {
    const error = new AxiosError('Request failed with status code 503');
    error.response = { status: 503, statusText: 'Service Unavailable', headers: {}, config: {} as never, data: { code: 'MOBILE_MONEY_UNAVAILABLE', message: 'Le paiement Mobile Money est en cours de développement. Veuillez utiliser le paiement en espèces.' } };
    expect(getErrorMessage(error)).toBe('Le paiement Mobile Money est en cours de développement. Veuillez utiliser le paiement en espèces.');
  });
});
