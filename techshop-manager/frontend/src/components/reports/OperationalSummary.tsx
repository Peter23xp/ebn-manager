import { formatUSD } from '@/lib/utils';
import type { ReportActivity } from '@/lib/report-overview';

const PAYMENT_LABELS: Record<string, string> = { CASH: 'Espèces', MPESA: 'M-Pesa', AIRTEL_MONEY: 'Airtel Money', VIREMENT: 'Virement' };
const STEP_LABELS: Record<string, string> = { RECIT: 'Récits', FICHE: 'Fiches', ACTIVATION: 'Activations' };
const STATUS_LABELS: Record<string, string> = { ACTIF: 'Actifs', EN_COURS: 'Dossiers en cours', SUSPENDU: 'Suspendus', ARCHIVE: 'Archivés' };
const number = (value: number) => value.toLocaleString('fr-CD');
const formatReportCDF = (value: number) => `${value.toLocaleString('fr-CD', { maximumFractionDigits: 2 })} CDF`;

function MetricRow({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
      <dt className="min-w-0 flex-1 basis-40 text-sm text-text">
        {label}
        {note && <span className="mt-1 block max-w-prose text-xs leading-relaxed text-text-muted">{note}</span>}
      </dt>
      <dd className="max-w-full break-words text-right text-sm font-semibold tabular-nums text-primary">{value}</dd>
    </div>
  );
}

export function OperationalSummary({ activity, isLoading }: { activity?: ReportActivity; isLoading: boolean }) {
  if (isLoading) return <div aria-label="Chargement de la synthèse" className="skeleton h-64 rounded-xl" />;
  if (!activity) return <p className="text-sm text-text-muted">La synthèse opérationnelle n’est pas disponible pour ce rapport.</p>;
  return (
    <div className="space-y-5">
      <section className="card" aria-labelledby="reports-cash-title">
        <div className="report-panel-heading">
          <h2 id="reports-cash-title">Encaissements et remboursements</h2>
          <p>Opérations de la période sélectionnée. Les devises restent séparées.</p>
        </div>
        <div className="report-cash-columns">
          <div>
            <h3 className="mb-1 text-sm font-semibold text-primary">Bilan des ventes · USD</h3>
            <dl className="divide-y divide-border">
            <MetricRow label="Ventes après remboursements" value={formatUSD(activity.netAfterRefunds)} note="Ventes réglées moins les remboursements effectués sur cette période." />
            <MetricRow label="Remboursements effectués" value={formatUSD(activity.refunds.amount)} note={`${number(activity.refunds.count)} retour(s) remboursé(s)`} />
            <MetricRow label="En attente de paiement" value={formatUSD(activity.pendingSales.amount)} note={`${number(activity.pendingSales.count)} vente(s), exclue(s) du chiffre d’affaires`} />
            <MetricRow label="Panier moyen" value={formatUSD(activity.averageBasket)} />
            <MetricRow label="Remises accordées" value={formatUSD(activity.discounts)} note="Déjà déduites du chiffre d’affaires affiché." />
            </dl>
          </div>
          <div className="space-y-5">
            <div>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold text-primary">Récits et fiches</h3>
                <span className="text-sm font-semibold tabular-nums text-primary">{formatReportCDF(activity.onboardingCDF)}</span>
              </div>
              <dl className="mt-2 divide-y divide-border">
                {activity.onboarding.length === 0 && <p className="py-3 text-sm text-text-muted">Aucun encaissement d’inscription sur cette période.</p>}
                {activity.onboarding.map(step => <MetricRow key={step.etape} label={`${STEP_LABELS[step.etape] ?? step.etape} (${number(step.count)})`} value={step.currency === 'CDF' ? formatReportCDF(step.amount) : formatUSD(step.amount)} />)}
              </dl>
              <p className="report-footnote">Les activations en USD sont déjà incluses dans les ventes. Elles ne sont pas ajoutées aux encaissements en CDF.</p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-primary">Ventes réglées par moyen de paiement</h3>
              <dl className="mt-2 divide-y divide-border">
                {activity.payments.length === 0 && <p className="py-3 text-sm text-text-muted">Aucune vente réglée sur cette période.</p>}
                {activity.payments.map(payment => <MetricRow key={payment.mode} label={`${PAYMENT_LABELS[payment.mode] ?? payment.mode} (${number(payment.count)})`} value={formatUSD(payment.amount)} />)}
              </dl>
            </div>
          </div>
        </div>
      </section>
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card" aria-labelledby="reports-clients-title">
          <div className="report-panel-heading">
            <h2 id="reports-clients-title">Situation des clients</h2>
            <p>{number(activity.clients.total)} clients au total sur le périmètre sélectionné, tous statuts confondus.</p>
          </div>
          <dl className="mt-2 divide-y divide-border">
            <MetricRow label="Activations sur la période" value={number(activity.clients.activated)} />
            {Object.entries(STATUS_LABELS).map(([status, label]) => <MetricRow key={status} label={label} value={number(activity.clients.byStatus[status] ?? 0)} />)}
          </dl>
          <p className="report-footnote">Les statuts correspondent à la situation actuelle, pas à un historique à la date de fin.</p>
        </section>
        <section className="card" aria-labelledby="reports-stock-title">
          <div className="report-panel-heading">
            <h2 id="reports-stock-title">État actuel du stock</h2>
            <p>Inventaire du périmètre sélectionné, indépendant du filtre de dates.</p>
          </div>
          <dl className="mt-2 divide-y divide-border">
            <MetricRow label="Unités disponibles" value={number(activity.stock.units)} />
            <MetricRow label="Références par site" value={number(activity.stock.references)} note="Un même produit est compté une fois par site." />
            <MetricRow label="Alertes de réapprovisionnement" value={number(activity.stock.alerts)} note="Quantité inférieure ou égale au seuil d’alerte." />
            <MetricRow label="Valorisation au prix d’achat" value={formatUSD(activity.stock.value)} />
          </dl>
        </section>
      </div>
    </div>
  );
}
