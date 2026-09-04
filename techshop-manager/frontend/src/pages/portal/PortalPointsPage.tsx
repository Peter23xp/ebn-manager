import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, ArrowDownRight, ArrowUpRight, Wallet } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { PortalLayout } from '@/components/portal/PortalLayout';
import { usePortalWalletHistory, type WalletTxFilter } from '@/hooks/usePortalPoints';
import { usePortalMlm } from '@/hooks/usePortalMlm';
import { cn } from '@/lib/utils';
import type { PortalWalletTransaction } from '@/lib/portal.api';
import { portalApi } from '@/lib/portal.api';

// ── Transaction row ───────────────────────────────────────────────────────────

function TransactionRow({ tx }: { tx: PortalWalletTransaction }) {
  const isGain = tx.type === 'COMMISSION' || tx.type === 'BONUS' || tx.type === 'SALAIRE';
  const Icon = isGain ? ArrowDownRight : ArrowUpRight;

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span
        className={cn(
          'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full',
          isGain ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-[#2E86C1]',
        )}
      >
        <Icon size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-primary">{tx.type}</p>
        <p className="truncate text-xs text-text-subtle">
          {tx.description ?? 'Transaction MLM'}
        </p>
        <p className="text-[10px] text-text-subtle">
          {format(new Date(tx.createdAt), "d MMM yyyy · HH'h'mm", { locale: fr })}
        </p>
      </div>
      <p
        className={cn(
          'flex-shrink-0 text-sm font-bold tabular-nums',
          isGain ? 'text-emerald-600' : 'text-primary',
        )}
      >
        {isGain ? '+' : '-'}${tx.montant.toLocaleString('en-US', { minimumFractionDigits: 2 })}
      </p>
    </li>
  );
}

// ── Filter pills ──────────────────────────────────────────────────────────────

const FILTERS: { value: WalletTxFilter; label: string }[] = [
  { value: 'all',      label: 'Tout'     },
  { value: 'gains',    label: 'Gains'    },
  { value: 'retraits', label: 'Retraits' },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PortalPointsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { wallet } = usePortalMlm();
  const [amount, setAmount] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('243');
  const [provider, setProvider] = useState<'VODACOM_MPESA_COD' | 'AIRTEL_COD' | 'ORANGE_COD'>('VODACOM_MPESA_COD');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [payoutMessage, setPayoutMessage] = useState('');
  const {
    transactions, typeFilter, setTypeFilter,
    isLoading, fetchNextPage, hasNextPage, isFetchingNextPage,
  } = usePortalWalletHistory();

  const fmtUSD = (v: number) =>
    v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <PortalLayout title="Historique" showBackButton onBack={() => navigate('/portal/home')}>
      <div className="px-4 py-4">

        {/* Solde actuel */}
        <div
          className="relative mb-5 overflow-hidden rounded-2xl text-white"
          style={{ background: 'linear-gradient(150deg, #0A1628 0%, #13294b 55%, #1a3a5c 100%)' }}
        >
          <div
            aria-hidden
            className="absolute inset-0 opacity-[0.06]"
            style={{
              backgroundImage:
                'repeating-linear-gradient(115deg, transparent 0 9px, #ffffff 9px 10px)',
            }}
          />
          <div className="relative flex items-end justify-between p-5">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/60">
                Solde actuel
              </p>
              <p className="mt-1.5 font-mono text-[26px] font-bold leading-none tabular-nums">
                ${fmtUSD(wallet?.soldeDisponible ?? 0)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/50">
                Total gagné
              </p>
              <p className="mt-1 text-sm font-semibold tabular-nums text-white/90">
                ${fmtUSD(wallet?.totalGagne ?? 0)}
              </p>
            </div>
          </div>
        </div>

        {/* Retrait */}
        <div className="mb-5 rounded-2xl border border-border bg-bg-card p-4 shadow-card">
          <p className="text-sm font-bold text-primary">Retirer mes gains</p>
          <p className="mb-4 mt-0.5 text-xs text-text-muted">
            Le montant est en USD. KPay envoie les fonds sur votre Mobile Money.
          </p>
          <form className="space-y-3" onSubmit={async (event) => {
            event.preventDefault();
            setIsSubmitting(true); setPayoutMessage('');
            try {
              const result = await portalApi.initPayout({ amount: Number(amount), provider, phoneNumber });
              setPayoutMessage(`Retrait initié (${result.status ?? 'PENDING'}).`);
              setAmount('');
              await queryClient.invalidateQueries({ queryKey: ['portal', 'wallet'] });
            } catch (error: any) {
              setPayoutMessage(error?.response?.data?.message ?? 'Impossible d’initier le retrait.');
            } finally { setIsSubmitting(false); }
          }}>
            <div className="grid grid-cols-2 gap-2">
              <input aria-label="Montant en USD" type="number" min="1" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Montant USD" className="rounded-xl" />
              <select aria-label="Opérateur" value={provider} onChange={(e) => setProvider(e.target.value as typeof provider)} className="rounded-xl">
                <option value="VODACOM_MPESA_COD">M-Pesa</option><option value="AIRTEL_COD">Airtel Money</option><option value="ORANGE_COD">Orange Money</option>
              </select>
            </div>
            <input aria-label="Numéro Mobile Money" required pattern="^243[0-9]{9}$" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="243XXXXXXXXX" className="rounded-xl" />
            <button disabled={isSubmitting} className="flex h-11 w-full items-center justify-center rounded-xl bg-[#b45309] text-sm font-bold text-white transition-colors duration-150 hover:bg-[#92400e] disabled:opacity-50">
              {isSubmitting ? 'Envoi…' : 'Demander le retrait'}
            </button>
            {payoutMessage && <p className="text-xs text-text-muted animate-fade-in">{payoutMessage}</p>}
          </form>
        </div>

        {/* Historique */}
        <div>
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-text-subtle">
            Historique des transactions
          </p>

          <div className="mb-4 flex gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setTypeFilter(f.value)}
                className={cn(
                  'rounded-full px-4 py-1.5 text-xs font-semibold transition-colors duration-150',
                  typeFilter === f.value ? 'bg-[#0A1628] text-white' : 'bg-bg-inset text-text-muted hover:bg-border',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          {isLoading && (
            <div className="space-y-3">
              {[1, 2, 3, 4].map(i => <div key={i} className="skeleton h-16 rounded-2xl" />)}
            </div>
          )}

          {!isLoading && transactions.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border py-10 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-bg-inset">
                <Wallet size={20} className="text-text-subtle" />
              </div>
              <p className="mb-0.5 text-sm font-medium text-text">Aucune transaction</p>
              <p className="text-xs text-text-muted">
                Vous n'avez pas encore de {typeFilter === 'gains' ? 'gains' : typeFilter === 'retraits' ? 'retraits' : 'transactions'}.
              </p>
            </div>
          )}

          {!isLoading && transactions.length > 0 && (
            <div className="divide-y divide-border/70 overflow-hidden rounded-2xl border border-border bg-bg-card shadow-card">
              {transactions.map((tx) => (
                <TransactionRow key={tx.id} tx={tx} />
              ))}
            </div>
          )}

          {hasNextPage && (
            <button
              type="button"
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border text-sm font-semibold text-primary transition-colors duration-150 hover:bg-bg"
            >
              {isFetchingNextPage && <Loader2 size={14} className="animate-spin" />}
              Charger plus
            </button>
          )}
          {!hasNextPage && transactions.length > 0 && (
            <p className="py-4 text-center text-xs font-medium text-text-subtle">Fin de l'historique.</p>
          )}
        </div>

      </div>
    </PortalLayout>
  );
}
