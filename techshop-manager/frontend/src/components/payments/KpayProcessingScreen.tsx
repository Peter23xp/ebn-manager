import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, ShieldCheck, Smartphone, X } from 'lucide-react';

type KpayProcessingScreenProps = {
  amount: number;
  currency: 'CDF' | 'USD';
  waiting?: boolean;
};

/**
 * Statut du paiement KPay : carte flottante en bas à droite, non bloquante —
 * la page (sidebar, header, caisse) reste visible et utilisable pendant
 * l'attente de confirmation. Réductible volontairement par l'agent ; le
 * statut final reste confirmé par le polling / le webhook.
 * Portal sur <body> : les ancêtres `animate-fade-up` (transform fill-both)
 * captureraient le `position: fixed` et déformeraient la carte.
 */
export function KpayProcessingScreen({ amount, currency, waiting = false }: KpayProcessingScreenProps) {
  const [minimized, setMinimized] = useState(false);

  if (minimized) {
    return createPortal(
      <button
        type="button"
        onClick={() => setMinimized(false)}
        className="fixed bottom-20 right-4 z-[70] md:bottom-6 flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-white shadow-2xl hover:bg-[#13294b]"
      >
        <Loader2 size={14} className="animate-spin" aria-hidden />
        <span className="text-xs font-semibold">
          Paiement {currency} — {amount.toLocaleString('fr-FR')}
        </span>
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-300" aria-hidden />
      </button>,
      document.body,
    );
  }

  return createPortal(
    <div
      className="fixed bottom-20 right-4 z-[70] w-[min(92vw,380px)] md:bottom-6"
      role="status"
      aria-live="polite"
    >
      <div className="overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
        <div className="h-1.5 bg-primary-accent" />
        <div className="relative p-4">
          <button
            type="button"
            onClick={() => setMinimized(true)}
            className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Réduire le suivi du paiement"
          >
            <X size={15} />
          </button>

          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-primary-light text-primary-accent">
              {waiting ? <Smartphone size={20} aria-hidden /> : <Loader2 size={20} className="animate-spin" aria-hidden />}
            </div>
            <div className="min-w-0 pr-6">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-primary-accent">KPay · Mobile Money</p>
              <h2 className="mt-0.5 text-sm font-extrabold text-primary">
                {waiting ? 'Confirmez sur le téléphone du client' : 'Paiement en cours…'}
              </h2>
              <p className="mt-1 text-xs leading-5 text-text-muted">
                {waiting
                  ? 'Une demande a été envoyée. Gardez cette page ouverte.'
                  : 'Transmission à KPay, mise à jour automatique.'}
              </p>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
            <p className="text-[10px] font-semibold text-text-muted">Montant</p>
            <p className="text-base font-black tabular-nums text-primary">
              {amount.toLocaleString('fr-FR')} <span className="text-[11px] font-bold text-primary-accent">{currency}</span>
            </p>
          </div>

          <div className="mt-2.5 flex items-center gap-2 text-[10px] text-text-subtle">
            <ShieldCheck size={12} className="flex-shrink-0 text-primary-accent" aria-hidden />
            <span>Ne relancez pas la transaction — </span>
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary-accent" aria-hidden />
              vérification automatique
            </span>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
