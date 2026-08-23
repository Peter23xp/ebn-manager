import { cn } from '@/lib/utils';
import type { StatutVente } from '@/types';

const CONFIG: Record<StatutVente, { label: string; className: string }> = {
  VALIDE: {
    label: '✓ Validée',
    className: 'bg-green-100 text-success',
  },
  RETOURNEE_PARTIELLE: {
    label: '↩ Partielle',
    className: 'bg-amber-100 text-warning',
  },
  RETOURNEE: {
    label: '↩ Retournée',
    className: 'bg-red-100 text-danger',
  },
  ANNULEE: {
    label: '✗ Annulée',
    className: 'bg-slate-100 text-text-muted',
  },
  EN_ATTENTE_PAIEMENT: {
    label: 'Paiement en attente',
    className: 'bg-amber-100 text-amber-700',
  },
};

export function SaleStatusBadge({ statut }: { statut: StatutVente }) {
  const config = CONFIG[statut] ?? {
    label: statut || 'Statut inconnu',
    className: 'bg-slate-100 text-text-muted',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold tracking-wide',
        config.className,
      )}
    >
      {config.label}
    </span>
  );
}
