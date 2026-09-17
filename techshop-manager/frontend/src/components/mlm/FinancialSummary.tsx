import type { FinancialSummary as Summary } from '@/types/mlm';
import { formatMlmMoney } from '@/lib/mlm-display';

export function FinancialSummary({ summary, available }: { summary?: Summary; available?: number | string }) {
  const amounts = [
    ['Total généré', summary?.generatedTotal],
    ['Total validé', summary?.validatedTotal],
    ['Immédiat crédité (historique)', summary?.immediateAmount],
    ['Disponible courant', available],
    ['Retenu non échu', summary?.heldAmount],
    ['Restituable', summary?.releasableAmount],
    ['Déjà restitué', summary?.releasedAmount],
  ] as const;
  return (
    <section aria-label="Synthèse financière" className="space-y-3">
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
        {amounts.map(([label, amount]) => <div key={label}><dt className="text-xs text-text-muted">{label}</dt><dd className="font-mono font-semibold text-text">{formatMlmMoney(amount)}</dd></div>)}
      </dl>
      <p className="text-xs text-text-muted">Source : serveur — montants en USD. La restitution transfère la retenue, sans nouveau gain.</p>
      {!summary && <p role="status" className="text-sm text-text-muted">Synthèse financière indisponible.</p>}
    </section>
  );
}
