import { useNavigate } from 'react-router-dom';
import { Loader2, ArrowUpRight, ArrowDownRight, Wallet } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { PortalLayout } from '@/components/portal/PortalLayout';
import { usePortalWalletHistory, type WalletTxFilter } from '@/hooks/usePortalPoints';
import { usePortalMlm } from '@/hooks/usePortalMlm';
import { cn } from '@/lib/utils';
import type { PortalWalletTransaction } from '@/lib/portal.api';

// ── Transaction Card ──────────────────────────────────────────────────────────

function TransactionCard({ tx }: { tx: PortalWalletTransaction }) {
  const isGain = tx.type === 'COMMISSION' || tx.type === 'BONUS' || tx.type === 'SALAIRE';
  const Icon = isGain ? ArrowDownRight : ArrowUpRight;
  const colorClass = isGain ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50';
  const sign = isGain ? '+' : '-';

  return (
    <div className="bg-white border border-neutral-100 rounded-xl p-4 mb-3 shadow-sm flex items-center gap-3">
      <div className={cn('w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0', colorClass)}>
        <Icon size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <p className="text-sm font-semibold text-[#0A1628] truncate">
            {tx.type}
          </p>
          <p className={cn('text-sm font-bold', isGain ? 'text-green-600' : 'text-[#0A1628]')}>
            {sign}${tx.montant.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </p>
        </div>
        <p className="text-xs text-neutral-500 truncate mb-1">
          {tx.description ?? 'Transaction MLM'}
        </p>
        <p className="text-[10px] text-neutral-400">
          {format(new Date(tx.createdAt), 'd MMM yyyy à HH:mm', { locale: fr })}
        </p>
      </div>
    </div>
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
  const { wallet } = usePortalMlm();
  const {
    transactions, typeFilter, setTypeFilter,
    isLoading, fetchNextPage, hasNextPage, isFetchingNextPage,
  } = usePortalWalletHistory();

  return (
    <PortalLayout title="Historique" showBackButton onBack={() => navigate('/portal/home')}>
      <div className="px-4 py-4 space-y-5">

        {/* En-tête du solde actuel */}
        <div 
          className="rounded-2xl p-5 text-white shadow-lg relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #0A1628 0%, #1a3260 100%)' }}
        >
          <div className="absolute -top-12 -right-12 w-32 h-32 bg-white/5 rounded-full blur-2xl" />
          <div className="relative z-10 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <Wallet size={14} className="text-[#b45309]" />
                <p className="text-[10px] font-semibold uppercase tracking-widest text-white/70">
                  Solde actuel
                </p>
              </div>
              <p className="text-2xl font-bold font-mono">
                ${(wallet?.soldeDisponible ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-white/50 mb-1">
                Total gagné
              </p>
              <p className="text-sm font-semibold text-white/90">
                ${(wallet?.totalGagne ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </div>

        {/* Transactions list */}
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-neutral-400 mb-3">
            Historique des transactions
          </p>

          <div className="flex gap-2 mb-4">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setTypeFilter(f.value)}
                className={cn(
                  'rounded-full px-4 py-1.5 text-xs font-semibold transition-colors',
                  typeFilter === f.value ? 'bg-[#0A1628] text-white' : 'bg-neutral-100 text-neutral-600',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          {isLoading && (
            <div className="space-y-3">
              {[1, 2, 3, 4].map(i => <div key={i} className="h-20 rounded-xl animate-pulse bg-neutral-200" />)}
            </div>
          )}

          {!isLoading && transactions.length === 0 && (
            <div className="py-12 text-center">
              <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-3">
                <Wallet size={20} className="text-neutral-400" />
              </div>
              <p className="text-sm font-medium text-neutral-600 mb-1">Aucune transaction</p>
              <p className="text-xs text-neutral-500">
                Vous n'avez pas encore de {typeFilter === 'gains' ? 'gains' : typeFilter === 'retraits' ? 'retraits' : 'transactions'}.
              </p>
            </div>
          )}

          {transactions.map((tx) => (
            <TransactionCard key={tx.id} tx={tx} />
          ))}

          {hasNextPage && (
            <button
              type="button"
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              className="w-full h-11 mt-2 rounded-xl border-2 border-neutral-100 text-sm font-semibold text-[#0A1628] flex items-center justify-center gap-2 hover:bg-neutral-50 transition-colors"
            >
              {isFetchingNextPage && <Loader2 size={14} className="animate-spin" />}
              Charger plus
            </button>
          )}
          {!hasNextPage && transactions.length > 0 && (
            <p className="text-center text-xs font-medium text-neutral-400 py-4">Fin de l'historique.</p>
          )}
        </div>

      </div>
    </PortalLayout>
  );
}
