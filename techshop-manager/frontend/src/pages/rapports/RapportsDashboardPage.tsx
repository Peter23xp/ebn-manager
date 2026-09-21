import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle, RefreshCw, TrendingUp, ShoppingCart, Users, Download,
} from 'lucide-react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, Filler, Tooltip, Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { formatUSD } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import {
  type PeriodPreset,
  type DateRange,
  getDateRangeFromPreset,
} from '@/lib/dateRange.utils';
import { useReportsDashboard } from '@/hooks/useReportsDashboard';
import { PeriodSelector } from '@/components/reports/PeriodSelector';
import { DateRangePicker } from '@/components/reports/DateRangePicker';
import { DoughnutSiteChart } from '@/components/reports/DoughnutSiteChart';
import { SitesSummaryTable } from '@/components/reports/SitesSummaryTable';
import { TopProductsBarChart } from '@/components/reports/TopProductsBarChart';
import { OperationalSummary } from '@/components/reports/OperationalSummary';
import { ReportNavigation } from '@/components/reports/ReportNavigation';
import { useSites } from '@/hooks/useSites';
import { toISODate } from '@/lib/dateRange.utils';
import './reports-dashboard.css';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

// ── Brand colours per site ────────────────────────────────────────────────────
const SITE_COLORS: Record<string, string> = {
  Goma: '#2563eb',
  Bukavu: '#15803d',
  Kinshasa: '#b45309',
};
const FALLBACK_COLORS = ['#2563eb', '#15803d', '#b45309', '#7c3aed', '#dc2626'];

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({
  icon, label, value, isLoading,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  isLoading: boolean;
}) {
  return (
    <div className="report-metric">
      <dt className="flex items-center gap-2 text-sm text-text-muted">
        <span className="shrink-0" aria-hidden="true">{icon}</span>
        {label}
      </dt>
      <dd className="mt-2 text-xl font-bold leading-tight tabular-nums text-primary sm:text-2xl">
        {isLoading ? <div className="skeleton h-7 w-28 max-w-full rounded" aria-hidden="true" /> : value}
      </dd>
    </div>
  );
}

// ── CA Line chart ─────────────────────────────────────────────────────────────
function CALineChart({
  seriesCA, isLoading,
}: {
  seriesCA: Array<{ label: string; values: Record<string, number> }>;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div
        data-testid="ca-chart-skeleton"
        className="skeleton rounded-xl"
        style={{ height: 280 }}
      />
    );
  }

  if (!seriesCA || !seriesCA.some(point => Object.values(point.values).some(value => value !== 0))) {
    return (
      <div
        data-testid="ca-chart-empty"
        className="flex items-center justify-center"
        style={{ height: 280 }}
      >
        <div className="text-center text-text-muted">
          <TrendingUp size={28} className="mx-auto mb-3" aria-hidden="true" />
          <p className="text-sm">Aucune vente sur la période</p>
          <p className="mt-1 text-xs">Essayez une autre période ou un autre site.</p>
        </div>
      </div>
    );
  }

  // Build datasets — one per site (keys inside seriesCA[0].values)
  const siteNames = [...new Set(seriesCA.flatMap(point => Object.keys(point.values)))];
  const labels = seriesCA.map((p) => p.label);

  const datasets = siteNames.map((site, i) => {
    const color = SITE_COLORS[site] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length];
    return {
      label: site,
      data: seriesCA.map((p) => p.values[site] ?? 0),
      borderColor: color,
      backgroundColor: color + '18',
      fill: false,
      tension: 0.25,
      pointRadius: labels.length <= 14 ? 3 : 0,
      pointHoverRadius: 6,
      borderWidth: 2,
    };
  });

  const options = {
    animation: false as const,
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: { color: '#64748b', font: { size: 12, family: '"Plus Jakarta Sans", sans-serif' }, usePointStyle: true, pointStyleWidth: 8, boxHeight: 6, padding: 16 },
      },
      tooltip: {
        callbacks: {
          label: (ctx: import('chart.js').TooltipItem<'line'>) => {
            const value = typeof ctx.raw === 'number' ? ctx.raw : 0;
            return ` ${ctx.dataset.label} : ${formatUSD(value)}`;
          },
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: '#64748b', font: { size: 12 }, maxRotation: 0, maxTicksLimit: 6 },
      },
      y: {
        border: { display: false },
        grid: { color: '#e2e8f0' },
        ticks: {
          color: '#64748b',
          font: { size: 12 },
          callback: (value: number | string) => Number(value).toLocaleString('fr-CD', { notation: 'compact', maximumFractionDigits: 1 }),
        },
      },
    },
  };

  return (
    <div style={{ height: 280 }}>
      <Line data={{ labels, datasets }} options={options} role="img" aria-label="Évolution du chiffre d’affaires en USD par site sur la période sélectionnée" />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RapportsDashboardPage() {
  const { user, hasRole } = useAuth();

  const isGerant          = hasRole('GERANT') && !hasRole('DIRECTEUR_REGIONAL');
  const isRegionalOrAbove = hasRole('DIRECTEUR_REGIONAL');
  const { sites, isLoading: sitesLoading } = useSites();
  const [siteId, setSiteId] = useState('');

  // ── Period state ──────────────────────────────────────────────────────────
  const [preset, setPreset] = useState<PeriodPreset>('this_month');
  const [dateRange, setDateRange] = useState<DateRange>(getDateRangeFromPreset('this_month'));

  const handlePresetChange = (p: PeriodPreset, range: DateRange) => {
    setPreset(p);
    if (p !== 'custom') setDateRange(range);
  };

  const handleRangeChange = (range: DateRange) => {
    setDateRange(range);
    setPreset('custom');
  };

  // ── Query ─────────────────────────────────────────────────────────────────
  const { data, isLoading, isFetching, error, refetch } = useReportsDashboard({
    siteId: isGerant ? (user?.siteId ?? undefined) : siteId || undefined,
    dateRange,
  });

  // ── Derived doughnut data ─────────────────────────────────────────────────
  const doughnutData = useMemo(
    () => (data?.parSite ?? []).map((s) => ({
      siteNom: s.siteNom,
      ca: s.ca,
      pourcentage: s.pourcentageCA,
    })),
    [data],
  );
  const reportParams = new URLSearchParams({ dateDebut: toISODate(dateRange.from), dateFin: toISODate(dateRange.to) });
  const selectedSite = isGerant ? user?.siteId : siteId;
  if (selectedSite) reportParams.set('siteId', selectedSite);

  if (!hasRole('GERANT') || (isGerant && !user?.siteId)) {
    return <div className="card text-sm text-text-muted" role="alert">Un accès aux rapports et un site attribué sont nécessaires. Contactez votre responsable.</div>;
  }

  // ── Error state ───────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="p-6 flex flex-col items-center justify-center gap-4 min-h-[60vh]">
        <AlertCircle size={40} className="text-danger" />
        <p className="text-base font-semibold text-primary">
          Impossible de charger les données du rapport.
        </p>
        <p className="text-sm text-text-muted">
          Vérifiez votre connexion et réessayez. Si le problème persiste, contactez votre responsable.
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          className="btn-primary flex items-center gap-2"
        >
          <RefreshCw size={14} />
          Réessayer
        </button>
      </div>
    );
  }

  return (
    <div className="reports-dashboard min-w-0 space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-page-title text-primary">Rapports</h1>
          <p className="mt-1 text-sm text-text-muted">Vue d'ensemble des performances commerciales</p>
        </div>
        <Link to={`/reports/export?type=VENTES&${reportParams}`} className="btn-primary gap-2">
          <Download size={16} aria-hidden="true" />Exporter les données
        </Link>
      </header>

      <ReportNavigation active="overview" overviewUrl={`/reports?${reportParams}`} salesUrl={`/reports/sales?${reportParams}`} stocksUrl={`/reports/stocks?${selectedSite ? new URLSearchParams({ siteId: selectedSite }) : ''}`} exportUrl={`/reports/export?type=VENTES&${reportParams}`} />

      <div className="report-filters" role="group" aria-label="Filtres du rapport">
        <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:flex xl:flex-wrap xl:items-end">
          {isRegionalOrAbove && (
            <label className="report-filter-field xl:w-64">
              <span>Site du rapport</span>
              <select aria-label="Site du rapport" value={siteId} onChange={event => setSiteId(event.target.value)} disabled={sitesLoading} className="min-w-0 w-full max-w-full">
                <option value="">Tous les sites</option>
                {sites.map(site => <option key={site.id} value={site.id}>{site.nom}</option>)}
              </select>
            </label>
          )}
          <div className="report-filter-field xl:w-48">
            <label htmlFor="period-selector">Période</label>
            <PeriodSelector value={preset} onChange={handlePresetChange} />
          </div>
          {preset === 'custom' && (
            <div className="report-filter-field report-custom-range sm:col-span-2">
              <label htmlFor="date-range-picker-trigger">Dates personnalisées</label>
              <DateRangePicker value={dateRange} onChange={handleRangeChange} maxDate={new Date()} />
            </div>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border pt-3 text-xs text-text-muted">
          <p>Du {dateRange.from.toLocaleDateString('fr-CD')} au {dateRange.to.toLocaleDateString('fr-CD')} · Journées complètes en UTC</p>
          <p className="min-w-0 break-words">{isGerant ? user?.siteName ?? user?.site?.nom ?? 'Votre site' : sites.find(site => site.id === siteId)?.nom ?? 'Tous les sites'}</p>
          {isFetching && !isLoading && <span role="status" className="inline-flex items-center gap-1.5"><RefreshCw size={12} className="motion-safe:animate-spin" aria-hidden="true" />Actualisation…</span>}
        </div>
      </div>

      <section aria-label="Indicateurs de la période" aria-busy={isLoading}>
        <dl className="report-metrics">
        <StatCard
          icon={<TrendingUp size={16} />}
          label="Chiffre d’affaires total"
          value={formatUSD(data?.totalCA ?? 0)}
          isLoading={isLoading}
        />
        <StatCard
          icon={<ShoppingCart size={16} />}
          label="Ventes validées"
          value={(data?.nbVentes ?? 0).toLocaleString('fr-CD')}
          isLoading={isLoading}
        />
        <StatCard
          icon={<Users size={16} />}
          label="Nouveaux clients"
          value={(data?.parSite ?? []).reduce((total, site) => total + site.nbNouveauxClients, 0).toLocaleString('fr-CD')}
          isLoading={isLoading}
        />
        </dl>
      </section>

      <div className={`grid min-w-0 gap-5 ${!isGerant ? 'xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]' : ''}`}>
        <section className="card min-w-0" aria-labelledby="reports-evolution-title">
          <div className="report-panel-heading">
            <h2 id="reports-evolution-title">Évolution du CA — par site</h2>
            <p>Chiffre d’affaires en USD sur la période sélectionnée</p>
          </div>
          <CALineChart seriesCA={data?.seriesCA ?? []} isLoading={isLoading} />
        </section>
        {!isGerant && (
          <DoughnutSiteChart data={doughnutData} totalCA={data?.totalCA ?? 0} isLoading={isLoading} />
        )}
      </div>

      <div className="grid min-w-0 gap-5 2xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <section className="card min-w-0" aria-labelledby="reports-sites-title">
          <div className="report-panel-heading">
            <h2 id="reports-sites-title">Résumé par site</h2>
            <p>Ventes et nouveaux clients sur la période · Alertes de stock actuelles</p>
          </div>
          <SitesSummaryTable data={data?.parSite ?? []} isLoading={isLoading} hideTotalRow={isGerant} />
        </section>
        <TopProductsBarChart data={data?.topProduits ?? []} isLoading={isLoading} />
      </div>
      <OperationalSummary activity={data?.activity} isLoading={isLoading} />
    </div>
  );
}
