import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  BarChart2, AlertCircle, RefreshCw, Building2,
  TrendingUp, ShoppingCart, Users, ExternalLink, Download, Package,
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
import { useSites } from '@/hooks/useSites';
import { toISODate } from '@/lib/dateRange.utils';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

// ── Brand colours per site ────────────────────────────────────────────────────
const SITE_COLORS: Record<string, string> = {
  Goma: '#2E86C1',
  Bukavu: '#1A6B3A',
  Kinshasa: '#E65100',
};
const FALLBACK_COLORS = ['#2E86C1', '#1A6B3A', '#E65100', '#4A148C', '#B71C1C'];

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({
  icon, label, value, isLoading, color = '#2E86C1',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  isLoading: boolean;
  color?: string;
}) {
  return (
    <div className="stat-card">
      <div className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
          style={{ background: color + '18' }}
        >
          <span style={{ color }}>{icon}</span>
        </div>
        <div className="min-w-0">
          {isLoading ? (
            <>
              <div className="skeleton h-6 w-32 rounded mb-1" />
              <div className="skeleton h-3 w-20 rounded" />
            </>
          ) : (
            <>
              <p className="text-xl font-bold text-primary leading-tight">{value}</p>
              <p className="text-xs text-text-muted">{label}</p>
            </>
          )}
        </div>
      </div>
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
        className="flex items-center justify-center rounded-xl border border-border bg-bg-card"
        style={{ height: 280 }}
      >
        <div className="text-center text-text-muted">
          <TrendingUp size={32} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">Aucune vente sur la période</p>
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
      fill: true,
      tension: 0.4,
      pointRadius: labels.length <= 14 ? 4 : 2,
      pointHoverRadius: 6,
      borderWidth: 2,
    };
  });

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: { font: { size: 12 }, usePointStyle: true, pointStyleWidth: 10 },
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
        ticks: { font: { size: 11 }, maxRotation: 45 },
      },
      y: {
        grid: { color: '#f0f4f8' },
        ticks: {
          font: { size: 11 },
          callback: (v: number | string) => {
            const n = Number(v);
            if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + ' M';
            if (n >= 1_000) return (n / 1_000).toFixed(0) + ' k';
            return String(n);
          },
        },
      },
    },
  };

  return (
    <div style={{ height: 280 }}>
      <Line data={{ labels, datasets }} options={options} />
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RapportsDashboardPage() {
  const { user, hasRole } = useAuth();
  const navigate = useNavigate();

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
    <div className="min-w-0 space-y-6">

      {/* ── Header ── */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #1E3A5F 0%, #2E86C1 100%)' }}
          >
            <BarChart2 size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-page-title text-primary">Rapports</h1>
            <p className="text-xs text-text-muted">
              Vue d'ensemble des performances commerciales
              {isFetching && !isLoading && (
                <span className="ml-2 inline-flex items-center gap-1 text-primary-accent">
                  <RefreshCw size={10} className="animate-spin" />
                  Actualisation…
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex min-w-0 w-full max-w-full flex-wrap items-center gap-2 xl:w-auto">
          {isRegionalOrAbove && (
            <select aria-label="Site du rapport" value={siteId} onChange={event => setSiteId(event.target.value)} disabled={sitesLoading} className="input-field min-w-0 !w-full max-w-full min-h-11 sm:!w-auto sm:max-w-xs">
              <option value="">Tous les sites</option>
              {sites.map(site => <option key={site.id} value={site.id}>{site.nom}</option>)}
            </select>
          )}
          <PeriodSelector
            value={preset}
            onChange={handlePresetChange}
          />

          {preset === 'custom' && (
            <DateRangePicker
              value={dateRange}
              onChange={handleRangeChange}
              maxDate={new Date()}
            />
          )}

          {/* Regional view link */}
          {isRegionalOrAbove && (
            <button
              type="button"
              onClick={() => navigate('/dashboard/regional')}
              className="btn-secondary !min-h-0 h-9 text-xs flex items-center gap-1.5"
              aria-label="Vue régionale"
            >
              <Building2 size={13} />
              Vue régionale
              <ExternalLink size={11} />
            </button>
          )}
        </div>
      </div>

      <nav aria-label="Rapports disponibles" className="flex flex-wrap gap-2">
        {isRegionalOrAbove && <Link to={`/reports/sales?${reportParams}`} className="btn-secondary min-h-11 gap-2"><ShoppingCart size={16} />Ventes détaillées</Link>}
        {isRegionalOrAbove && <Link to={`/reports/stocks?${selectedSite ? new URLSearchParams({ siteId: selectedSite }) : ''}`} className="btn-secondary min-h-11 gap-2"><Package size={16} />Stocks et inventaire</Link>}
        <Link to={`/reports/export?type=VENTES&${reportParams}`} className="btn-primary min-h-11 gap-2"><Download size={16} />Exporter les données</Link>
        <Link to="/clients" className="btn-secondary min-h-11 gap-2"><Users size={16} />Liste des clients</Link>
      </nav>
      <p className="text-xs text-text-muted">Du {dateRange.from.toLocaleDateString('fr-CD')} au {dateRange.to.toLocaleDateString('fr-CD')} · Journées complètes en UTC · {isGerant ? user?.siteName ?? user?.site?.nom ?? 'Votre site' : sites.find(site => site.id === siteId)?.nom ?? 'Tous les sites'}</p>

      {/* ── KPI stat cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          icon={<TrendingUp size={20} />}
          label="Chiffre d'affaires total"
          value={formatUSD(data?.totalCA ?? 0)}
          isLoading={isLoading}
          color="#2E86C1"
        />
        <StatCard
          icon={<ShoppingCart size={20} />}
          label="Ventes validées"
          value={String(data?.nbVentes ?? 0)}
          isLoading={isLoading}
          color="#1A6B3A"
        />
        <StatCard
          icon={<Users size={20} />}
          label="Nouveaux clients"
          value={String((data?.parSite ?? []).reduce((s, r) => s + r.nbNouveauxClients, 0))}
          isLoading={isLoading}
          color="#E65100"
        />
      </div>

      <OperationalSummary activity={data?.activity} isLoading={isLoading} />

      {/* ── CA Evolution Line Chart ── */}
      <div className="card">
        <h2 className="text-sm font-bold text-primary mb-4">
          Évolution du CA — par site
        </h2>
        <CALineChart
          seriesCA={data?.seriesCA ?? []}
          isLoading={isLoading}
        />
      </div>

      {/* ── Doughnut + Summary Table ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Doughnut — hidden for GERANT (single site, no comparison) */}
        {!isGerant && (
          <DoughnutSiteChart
            data={doughnutData}
            totalCA={data?.totalCA ?? 0}
            isLoading={isLoading}
          />
        )}

        <div className={isGerant ? 'lg:col-span-2' : ''}>
          <div className="card h-full flex flex-col gap-4">
            <h2 className="text-sm font-bold text-primary">Résumé par site</h2>
            <SitesSummaryTable
              data={data?.parSite ?? []}
              isLoading={isLoading}
              hideTotalRow={isGerant}
            />
          </div>
        </div>
      </div>

      {/* ── Top 5 Products ── */}
      <TopProductsBarChart
        data={data?.topProduits ?? []}
        isLoading={isLoading}
      />

    </div>
  );
}
