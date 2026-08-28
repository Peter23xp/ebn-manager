import { Loader2, ShieldCheck, Smartphone } from 'lucide-react';

type KpayProcessingScreenProps = {
  amount: number;
  currency: 'CDF' | 'USD';
  waiting?: boolean;
};

export function KpayProcessingScreen({ amount, currency, waiting = false }: KpayProcessingScreenProps) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-slate-950/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="kpay-processing-title"
      aria-describedby="kpay-processing-description"
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="h-1.5 bg-primary-accent" />
        <div className="p-6 sm:p-8">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary-light text-primary-accent">
            {waiting ? <Smartphone size={28} aria-hidden /> : <Loader2 size={28} className="animate-spin" aria-hidden />}
          </div>

          <div className="mt-5 text-center">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-primary-accent">KPay · Mobile Money</p>
            <h2 id="kpay-processing-title" className="mt-2 text-xl font-extrabold text-primary">
              {waiting ? 'Confirmez le paiement' : 'Paiement en cours'}
            </h2>
            <p id="kpay-processing-description" className="mx-auto mt-2 max-w-xs text-sm leading-6 text-text-muted">
              {waiting
                ? 'Une demande a été envoyée sur le téléphone du client. Gardez cette page ouverte pendant la confirmation.'
                : 'Nous transmettons la demande à KPay. Cette fenêtre se mettra à jour automatiquement.'}
            </p>
          </div>

          <div className="mt-6 rounded-xl bg-slate-50 px-4 py-4 text-center">
            <p className="text-[11px] font-semibold text-text-muted">Montant de la transaction</p>
            <p className="mt-1 text-2xl font-black tracking-tight text-primary">
              {amount.toLocaleString('fr-FR')} <span className="text-base font-bold text-primary-accent">{currency}</span>
            </p>
          </div>

          <div className="mt-5 flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-left">
            <ShieldCheck size={18} className="mt-0.5 flex-shrink-0 text-primary-accent" aria-hidden />
            <p className="text-xs leading-5 text-primary">
              Ne fermez pas la page et ne relancez pas la transaction. Le statut final sera confirmé par KPay.
            </p>
          </div>

          <div className="mt-5 flex items-center justify-center gap-2 text-xs text-text-subtle" aria-live="polite">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary-accent" />
            Vérification automatique du statut
          </div>
        </div>
      </div>
    </div>
  );
}
