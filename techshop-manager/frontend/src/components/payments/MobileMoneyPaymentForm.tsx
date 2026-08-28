import { useState } from 'react';
import { Loader2, Smartphone } from 'lucide-react';
import type { KpayProvider } from '@/lib/kpay.api';
import { KpayProcessingScreen } from './KpayProcessingScreen';

const providers: Array<{ value: KpayProvider; label: string }> = [
  { value: 'VODACOM_MPESA_COD', label: 'M-Pesa' },
  { value: 'AIRTEL_COD', label: 'Airtel Money' },
  { value: 'ORANGE_COD', label: 'Orange Money' },
];

export function MobileMoneyPaymentForm({ amount, currency = 'USD', submitting = false, processing = false, onSubmit }: { amount: number; currency?: 'CDF' | 'USD'; submitting?: boolean; processing?: boolean; onSubmit: (input: { provider: KpayProvider; phoneNumber: string }) => void }) {
  const [provider, setProvider] = useState<KpayProvider>('VODACOM_MPESA_COD');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [error, setError] = useState('');
  const submit = () => {
    let normalized = phoneNumber.replace(/\D/g, '');
    if (normalized.startsWith('00')) normalized = normalized.slice(2);
    if (normalized.startsWith('0')) normalized = `243${normalized.slice(1)}`;
    else if (/^\d{9}$/.test(normalized)) normalized = `243${normalized}`;
    if (!/^243\d{9}$/.test(normalized)) {
      setError('Saisissez un numéro RDC au format +243XXXXXXXXX.');
      return;
    }
    setError('');
    onSubmit({ provider, phoneNumber: normalized });
  };
  return (
    <>
      {(submitting || processing) && <KpayProcessingScreen amount={amount} currency={currency} waiting={processing} />}
      <section className="w-full min-w-0 rounded-xl border border-border bg-white p-4" aria-labelledby="mobile-money-title">
      <div className="mb-3 flex items-center gap-2"><Smartphone size={18} className="text-primary-accent" /><h3 id="mobile-money-title" className="font-semibold text-primary">Paiement Mobile Money</h3></div>
      <p className="mb-3 text-xs text-text-muted">Montant à confirmer : <strong>{amount.toLocaleString('fr-FR')} {currency}</strong></p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="form-group"><span className="form-label">Opérateur</span><select value={provider} onChange={(e) => setProvider(e.target.value as KpayProvider)}>{providers.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <label className="form-group"><span className="form-label">Numéro Mobile Money</span><input value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="+243 8XX XXX XXX" inputMode="tel" aria-invalid={!!error} /></label>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button type="button" className="btn-primary mt-4 w-full" onClick={submit} disabled={submitting}>{submitting && <Loader2 size={16} className="animate-spin" />} {submitting ? 'Initialisation…' : 'Payer par Mobile Money'}</button>
      </section>
    </>
  );
}
