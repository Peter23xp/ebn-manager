import { Wallet, ArrowRight, ArrowDownRight } from 'lucide-react';
import type { ReinvestLot } from '@/lib/portal.api';
import type { FinancialSummary as Summary, ProgressiveCommissionSummary } from '@/types/mlm';
import { FinancialSummary } from '@/components/mlm/FinancialSummary';
import { ReinvestLots } from '@/components/mlm/ReinvestLots';
import { ProgressiveCommissions } from '@/components/mlm/ProgressiveCommissions';

interface WalletCardProps {
  solde: number; // soldeDisponibleRetrait
  gainsTotaux: number;
  soldeReinvesti: number;
  reserve?: number; // montant immobilisé par des demandes de retrait en attente
  lots: ReinvestLot[];
  financialSummary?: Summary;
  progressiveCommissions?: ProgressiveCommissionSummary[];
  available?: number | string;
  onWithdraw: () => void;
}

export function WalletCard({ solde, gainsTotaux, soldeReinvesti, reserve = 0, lots, financialSummary, progressiveCommissions, available, onWithdraw }: WalletCardProps) {
  const fmt = (v: number) =>
    Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="space-y-4"><div
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
          aria-label={`Solde disponible au retrait : ${fmt(solde)} dollars`}
        >
          {fmt(solde)}
        </p>
        <p className="mt-1.5 text-xs text-white/50">Disponible au retrait</p>

        <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-3.5">
          <div>
            <p className="text-[9px] uppercase tracking-[0.12em] text-white/40">Gains totaux</p>
            <p className="mt-0.5 text-sm font-semibold text-white/90 tabular-nums flex items-center gap-1">
              <ArrowDownRight size={12} className="text-emerald-400" />
              {fmt(gainsTotaux)}
            </p>
          </div>
          {solde > 0 ? (
            <button
              type="button"
              onClick={onWithdraw}
              className="flex items-center gap-1.5 rounded-lg bg-[#b45309] px-3.5 py-2 text-xs font-bold text-white transition-colors duration-150 hover:bg-[#92400e] active:scale-[0.98]"
            >
              Retirer <ArrowRight size={13} />
            </button>
          ) : (
            <span className="max-w-[140px] text-right text-[11px] leading-snug text-white/45">
              {reserve > 0
                ? <>{fmt(reserve)} $ réservés dans une demande en attente — consultez « Historique » pour annuler</>
                : 'Rien à retirer pour l\'instant'}
            </span>
          )}
        </div>
      </div>
    </div>
      <div className="rounded-xl border border-border bg-bg-card p-4 space-y-5">
        <FinancialSummary summary={financialSummary} available={available} />
        <ReinvestLots lots={lots} />
      </div>
      <ProgressiveCommissions summaries={progressiveCommissions} />
    </div>
  );
}
