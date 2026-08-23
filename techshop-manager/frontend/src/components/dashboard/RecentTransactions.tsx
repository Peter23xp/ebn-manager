import { useNavigate } from 'react-router-dom';
import { ShoppingCart } from 'lucide-react';
import { formatUSD, formatRelative } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { Transaction } from '@/hooks/useDashboard';

interface RecentTransactionsProps {
  data: Transaction[] | undefined;
  isLoading: boolean;
}

const statutStyle: Record<string, { cls: string; label: string }> = {
  VALIDE:              { cls: 'bg-green-100 text-success',   label: 'Validée' },
  RETOURNEE_PARTIELLE: { cls: 'bg-orange-100 text-warning',  label: 'Ret. partiel' },
  RETOURNEE:           { cls: 'bg-red-100 text-danger',      label: 'Retournée' },
  ANNULEE:             { cls: 'bg-gray-100 text-text-muted', label: 'Annulée' },
};

function ClientAvatar({ name }: { name: string }) {
  const parts = name.trim().split(' ');
  const ini =
    parts.length >= 2
      ? (parts[0][0] + parts[1][0]).toUpperCase()
      : name.slice(0, 2).toUpperCase();
  return (
    <span
      className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-[12px] font-bold bg-primary-light text-primary-accent select-none"
      aria-hidden
    >
      {ini}
    </span>
  );
}

export function RecentTransactions({ data, isLoading }: RecentTransactionsProps) {
  const navigate = useNavigate();

  return (
    <div className="rounded-xl shadow-card border border-border bg-white p-5 h-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-section-title text-primary">Transactions récentes</h2>
        <button
          type="button"
          className="text-[13px] font-semibold text-primary-accent hover:text-blue-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-accent rounded"
          onClick={() => navigate('/sales')}
        >
          Voir tout →
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="skeleton w-9 h-9 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <div className="skeleton h-3.5 w-40 rounded-full" />
                <div className="skeleton h-3 w-24 rounded-full" />
              </div>
              <div className="skeleton h-4 w-20 rounded-full" />
            </div>
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center py-10 text-text-muted"
          role="status"
          aria-live="polite"
        >
          <ShoppingCart size={28} className="mb-2 opacity-30" aria-hidden />
          <p className="text-sm">Aucune transaction aujourd'hui</p>
        </div>
      ) : (
        <ol className="space-y-0.5">
          {data.slice(0, 5).map((tx) => {
            const { cls, label } = statutStyle[tx.statut] ?? {
              cls: 'bg-gray-100 text-text-muted',
              label: tx.statut === 'EN_ATTENTE_PAIEMENT' ? 'Paiement en attente' : (tx.statut || 'Statut inconnu'),
            };
            return (
              <li key={tx.id}>
                <button
                  type="button"
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left',
                    'hover:bg-blue-50/60 transition-colors duration-100',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-accent',
                  )}
                  onClick={() => navigate(`/sales/${tx.id}`)}
                >
                  <ClientAvatar name={tx.clientNom} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text truncate">{tx.clientNom}</p>
                    <p className="text-xs text-text-muted font-mono truncate">
                      {tx.numeroVente} · {formatRelative(tx.createdAt)}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className="text-sm font-bold text-text font-mono whitespace-nowrap">
                      {formatUSD(tx.montant)}
                    </span>
                    <span className={cn('text-xs font-medium px-1.5 py-0.5 rounded-full', cls)}>
                      {label}
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
