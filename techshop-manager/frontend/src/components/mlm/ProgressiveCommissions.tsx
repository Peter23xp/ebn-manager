import type { ProgressiveCommissionSummary } from '@/types/mlm';
import { formatMlmMoney } from '@/lib/mlm-display';

interface ProgressiveCommissionsProps {
  summaries?: ProgressiveCommissionSummary[];
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
}

export function ProgressiveCommissions({ summaries, isLoading, isError, onRetry }: ProgressiveCommissionsProps) {
  return (
    <section aria-label="Progression financière par génération" className="min-w-0 rounded-xl border border-border bg-bg-card p-4 sm:p-5 space-y-4 text-sm text-text">
      <div className="space-y-2 max-w-prose">
        <h2 className="text-section-title text-primary">Progression financière par génération</h2>
        <p>Les huit générations rapportent indépendamment, sans attendre la complétion de la précédente. Le rang et les bonus restent liés aux générations complètes.</p>
        <p className="text-slate-600">Le total comptabilisé ne constitue pas le solde retirable : seul le portefeuille indique le disponible courant, après validation et retraits.</p>
      </div>
      {isLoading ? (
        <div role="status" aria-label="Chargement de la progression financière" className="space-y-3">
          <span className="sr-only">Chargement de la progression financière…</span>
          <div className="skeleton h-20" /><div className="skeleton h-20" />
        </div>
      ) : isError ? (
        <div role="alert" className="space-y-3">
          <p>Progression financière indisponible. Aucun montant ne peut être confirmé.</p>
          {onRetry && <button type="button" className="btn-secondary" onClick={onRetry}>Réessayer la progression financière</button>}
        </div>
      ) : !summaries ? (
        <p role="status">Progression financière non fournie par le serveur. Les soldes du portefeuille restent la référence.</p>
      ) : summaries.length === 0 ? (
        <p role="status">Aucune progression financière à afficher. Les générations apparaîtront lorsque leurs informations seront disponibles.</p>
      ) : (
        <div className="divide-y divide-border">
          {summaries.map(summary => (
            <details key={summary.generation} aria-label={`Génération ${summary.generation} — ${summary.levelName}`} className="py-3">
              <summary className="min-h-touch cursor-pointer rounded-lg py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-accent">
                <span className="font-semibold break-words">Génération {summary.generation} — {summary.levelName}</span>
                <span className="ml-2 text-slate-600 tabular-nums">{summary.accountedPositions == null ? 'Comptabilisation : Indisponible' : `${summary.accountedPositions} / ${summary.capacity} comptabilisées`}</span>
                <span className="block mt-1 text-slate-600">Généré : <span className="font-mono text-text tabular-nums">{formatMlmMoney(summary.generatedTotal)}</span></span>
                {summary.suspendedReason && <span className="block mt-2 rounded-lg bg-amber-50 p-3 text-amber-900 break-words">Comptabilisation suspendue : {summary.suspendedReason}</span>}
              </summary>
              <div className="space-y-4 pt-3">
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                  <div><dt className="text-slate-600">Positions valides actuelles</dt><dd className="font-mono font-semibold">{summary.currentValidPositions} / {summary.capacity}</dd></div>
                  <div><dt className="text-slate-600">Positions déjà comptabilisées</dt><dd className="font-mono font-semibold">{summary.accountedPositions == null ? 'Indisponible' : `${summary.accountedPositions} / ${summary.capacity}`}</dd></div>
                </dl>
                <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3 border-t border-border pt-4">
                  {([
                    ['Budget total', summary.budgetTotal],
                    ['Budget immédiat', summary.budgetImmediate],
                    ['Budget retenu', summary.budgetHeld],
                    ['Total généré', summary.generatedTotal],
                    ['En attente de validation', summary.pendingTotal],
                    ['Commissions validées', summary.validatedTotal],
                    ['Annulées (droits consommés)', summary.cancelledTotal],
                    ['Immédiat crédité (historique)', summary.immediateCredited],
                    ['Retenues en cours', summary.heldAmount],
                    ['Restituable', summary.releasableAmount],
                    ['Déjà restitué', summary.releasedAmount],
                    ['Reste à comptabiliser', summary.remainingTotal],
                  ] as const).map(([label, amount]) => (
                    <div key={label} className="min-w-0"><dt className="text-slate-600">{label}</dt><dd className="font-mono font-semibold tabular-nums break-words">{amount == null ? 'Indisponible' : formatMlmMoney(amount)}</dd></div>
                  ))}
                </dl>
              </div>
            </details>
          ))}
        </div>
      )}
      <p className="max-w-prose text-slate-600">Source : serveur, montants en USD. Une annulation ne rend pas les positions à nouveau rémunérables. Les retenues deviennent restituables 30 jours ouvrables après validation, du lundi au samedi, hors jours fériés RDC.</p>
    </section>
  );
}
