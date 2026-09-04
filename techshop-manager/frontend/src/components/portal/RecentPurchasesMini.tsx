import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { formatUSD } from '@/lib/utils';

interface RecentPurchasesMiniProps {
  achats: Array<{
    id: string;
    date: string;
    produitPrincipal: string;
    montantTotal: number;
    nbArticles: number;
  }>;
  onViewAll: () => void;
}

export function RecentPurchasesMini({ achats, onViewAll }: RecentPurchasesMiniProps) {
  return (
    <div className="rounded-2xl border border-border bg-bg-card p-4 shadow-card">
      {achats.length === 0 ? (
        <p className="py-2 text-sm text-text-muted">
          Aucun achat enregistré pour l'instant.
        </p>
      ) : (
        <ul className="divide-y divide-border/70">
          {achats.map((a) => {
            const extra = a.nbArticles - 1;
            const nom = a.produitPrincipal.length > 25
              ? a.produitPrincipal.slice(0, 25) + '…'
              : a.produitPrincipal;
            return (
              <li key={a.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <span className="w-11 flex-shrink-0 text-center">
                  <span className="block text-sm font-bold leading-tight text-primary">
                    {format(new Date(a.date), 'd', { locale: fr })}
                  </span>
                  <span className="block text-[10px] uppercase tracking-wide text-text-subtle">
                    {format(new Date(a.date), 'MMM', { locale: fr })}
                  </span>
                </span>
                <span className="min-w-0 flex-1 border-l border-border pl-3">
                  <span className="block truncate text-sm font-medium text-text">{nom}</span>
                  {extra > 0 && (
                    <span className="block text-xs text-text-subtle">
                      +{extra} article{extra !== 1 ? 's' : ''}
                    </span>
                  )}
                </span>
                <span className="ml-2 whitespace-nowrap text-sm font-semibold tabular-nums text-primary">
                  {formatUSD(a.montantTotal)}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <button
        type="button"
        onClick={onViewAll}
        className="mt-3 text-sm font-semibold text-[#2E86C1] transition-colors hover:text-[#1E3A5F]"
        aria-label="Voir tous mes achats"
      >
        Voir tous mes achats →
      </button>
    </div>
  );
}
