import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MobileMoneyPaymentForm } from './MobileMoneyPaymentForm';

describe('Mobile Money availability', () => {
  it('blocks every provider without calling the payment callback', () => {
    const onSubmit = vi.fn();
    render(<MobileMoneyPaymentForm amount={25} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText('Numéro Mobile Money'), { target: { value: '243900000001' } });
    for (const provider of ['VODACOM_MPESA_COD', 'AIRTEL_COD', 'ORANGE_COD']) {
      fireEvent.change(screen.getByLabelText('Opérateur'), { target: { value: provider } });
      fireEvent.click(screen.getByRole('button', { name: 'Payer par Mobile Money' }));
    }
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Le paiement Mobile Money est en cours de développement. Veuillez utiliser le paiement en espèces.');
    expect(screen.getByRole('button', { name: 'Payer par Mobile Money' })).toBeDisabled();
  });

  it('keeps the processing screen for an already pending payment', () => {
    render(<MobileMoneyPaymentForm amount={25} processing onSubmit={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'En attente de confirmation…' })).toBeDisabled();
    expect(screen.getByText('Confirmez sur le téléphone du client')).toBeInTheDocument();
  });
});
