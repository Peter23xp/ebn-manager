import { Wallet, ArrowRight, ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { useState } from 'react';

interface WalletCardProps {
  solde: number;
  gainsTotaux: number;
}

export function WalletCard({ solde, gainsTotaux }: WalletCardProps) {
  const [showWithdraw, setShowWithdraw] = useState(false);

  const fmt = (v: number) =>
    v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <>
      <div
        className="rounded-2xl text-white relative overflow-hidden"
        style={{ background: 'linear-gradient(150deg, #0A1628 0%, #13294b 55%, #1a3a5c 100%)' }}
      >
        {/* Trame gravée : rappelle la guilloche des cartes bancaires */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              'repeating-linear-gradient(115deg, transparent 0 9px, #ffffff 9px 10px)',
          }}
        />
        <div
          aria-hidden
          className="absolute -top-20 -right-14 w-52 h-52 rounded-full border border-white/10"
        />
        <div
          aria-hidden
          className="absolute -top-10 -right-4 w-32 h-32 rounded-full border border-white/10"
        />

        <div className="relative p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wallet size={15} className="text-[#e8a33d]" strokeWidth={2.2} />
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/60">
                Portefeuille partenaire
              </p>
            </div>
            <p className="font-mono text-[10px] text-white/35 tracking-wider">USD</p>
          </div>

          <p
            className="mt-3 text-[34px] leading-none font-bold font-mono tabular-nums tracking-tight"
            aria-label={`Solde disponible : ${fmt(solde)} dollars`}
          >
            {fmt(solde)}
          </p>
          <p className="mt-1.5 text-xs text-white/50">Disponible au retrait</p>

          <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-3.5">
            <div className="flex items-center gap-5">
              <div>
                <p className="text-[9px] uppercase tracking-[0.12em] text-white/40">
                  Gains totaux
                </p>
                <p className="mt-0.5 text-sm font-semibold text-white/90 tabular-nums flex items-center gap-1">
                  <ArrowDownRight size={12} className="text-emerald-400" />
                  {fmt(gainsTotaux)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowWithdraw(true)}
                className="flex items-center gap-1.5 rounded-lg bg-[#b45309] px-3.5 py-2 text-xs font-bold text-white transition-colors duration-150 hover:bg-[#92400e] active:scale-[0.98]"
              >
                Retirer <ArrowRight size={13} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {showWithdraw && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0A1628]/60"
          onClick={() => setShowWithdraw(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Demande de retrait"
        >
          <div
            className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-primary mb-1">Demande de retrait</h3>
            <p className="text-sm text-text-muted">
              Solde actuel : <strong className="text-primary tabular-nums">${fmt(solde)}</strong>
            </p>
            <p className="mt-3 text-sm text-text-muted leading-relaxed">
              Pour effectuer un retrait (Mobile Money, espèces en boutique ou virement),
              contactez l'administration via WhatsApp ou rendez-vous dans l'une de nos boutiques.
            </p>

            <a
              href="https://wa.me/243974752784?text=Bonjour,%20je%20souhaite%20faire%20un%20retrait%20sur%20mon%20portefeuille%20partenaire."
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 flex h-12 items-center justify-center gap-2 rounded-xl bg-[#128C4A] text-sm font-bold text-white transition-colors hover:bg-[#0e7038]"
            >
              Contactez-nous sur WhatsApp
            </a>

            <button
              type="button"
              onClick={() => setShowWithdraw(false)}
              className="mt-2.5 h-11 w-full rounded-xl bg-bg font-semibold text-text-muted transition-colors hover:bg-bg-inset"
            >
              Fermer
            </button>
          </div>
        </div>
      )}
    </>
  );
}
