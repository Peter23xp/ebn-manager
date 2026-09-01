import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  ShoppingCart,
  AlertTriangle,
  GitBranch,
  RefreshCw,
  WifiOff,
  Radio,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useUIStore } from '@/store/ui.store';
import { useDashboard } from '@/hooks/useDashboard';
import { usePolling } from '@/hooks/usePolling';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { SalesChart } from '@/components/dashboard/SalesChart';
import { RecentTransactions } from '@/components/dashboard/RecentTransactions';
import { StockAlerts } from '@/components/dashboard/StockAlerts';
import { formatUSD, formatRelative } from '@/lib/utils';
import { cn } from '@/lib/utils';

type Period = 'today' | 'week' | 'month';

const trendDir = (v: number): 'up' | 'down' | 'neutral' =>
  v > 0 ? 'up' : v < 0 ? 'down' : 'neutral';

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user, hasRole, canAccess } = useAuth();
  const { selectedSiteId } = useUIStore();
  const [period, setPeriod] = useState<Period>('today');

  const isAgent  = user?.role === 'AGENT';
  const isGerant = user?.role === 'GERANT';

  const canSeePeriod      = !isAgent;
  const canSeeChart       = !isAgent;
  const canSeeAlertesKpi  = !isAgent;
  const canSeeRegionalLink = canAccess(['SUPER_ADMIN', 'DIRECTEUR_REGIONAL']);

  // AGENT / GERANT forcés sur leur site
  const effectiveSiteId = isAgent || isGerant ? (user?.siteId ?? null) : selectedSiteId;

  const { stats, salesChart, recentTransactions, stockAlerts, isAnyLoading, refetchAll, isOfflineData } =
    useDashboard(effectiveSiteId, period);

  const { isPolling } = usePolling(refetchAll, 5 * 60 * 1000, { enabled: navigator.onLine });

  const lastRefresh = stats.dataUpdatedAt ? new Date(stats.dataUpdatedAt) : null;

  const ventesLabel =
    period === 'today' ? "Ventes aujourd'hui"
    : period === 'week'  ? 'Ventes cette semaine'
    : 'Ventes ce mois';

  const hasError =
    !isOfflineData &&
    stats.isError && salesChart.isError && recentTransactions.isError && stockAlerts.isError;

  return (
    <div className="space-y-6">
      {/* ── En-tête ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-page-title text-primary">Tableau de bord</h1>
          <div className="mt-1.5 flex items-center gap-2 flex-wrap">
            {isOfflineData && (
              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold bg-amber-100 text-warning">
                <WifiOff size={11} aria-hidden />
                Données en cache
              </span>
            )}
            {!isOfflineData && isPolling && (
              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold bg-green-100 text-success">
                <Radio size={11} className="animate-pulse-dot" aria-hidden />
                En direct
              </span>
            )}
            {lastRefresh && !isAnyLoading && (
              <span className="text-xs text-text-muted">
                Mis à jour {formatRelative(lastRefresh)}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {canSeeRegionalLink && (
            <button
              className="text-sm font-medium text-primary-accent hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-accent rounded whitespace-nowrap"
              onClick={() => navigate('/dashboard/regional')}
            >
              Vue régionale →
            </button>
          )}

          {canSeePeriod && (
            <div className="period-toggle" role="group" aria-label="Période">
              {(['today', 'week', 'month'] as Period[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  type="button"
                  className={cn('period-btn', period === p && 'active')}
                >
                  {p === 'today' ? "Auj." : p === 'week' ? 'Semaine' : 'Mois'}
                </button>
              ))}
            </div>
          )}

          <button
            onClick={refetchAll}
            disabled={isAnyLoading}
            type="button"
            aria-label="Actualiser"
            className={cn(
              'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-border bg-white text-text-muted',
              'hover:border-primary-accent hover:text-primary-accent hover:bg-blue-50 transition-colors duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-accent',
              'disabled:opacity-40 disabled:cursor-not-allowed',
            )}
          >
            <RefreshCw size={15} className={cn(isAnyLoading && 'animate-spin')} aria-hidden />
          </button>
        </div>
      </div>

      {/* ── Erreur réseau ───────────────────────────────────── */}
      {hasError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-4 rounded-xl border border-red-200 bg-red-50 px-5 py-4"
        >
          <p className="text-sm text-danger">Impossible de charger les données du tableau de bord.</p>
          <button
            onClick={refetchAll}
            type="button"
            className="flex items-center gap-1.5 text-sm font-medium text-danger hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger rounded"
          >
            <RefreshCw size={13} aria-hidden />
            Réessayer
          </button>
        </div>
      )}

      {/* ── KPIs ────────────────────────────────────────────── */}
      <div className={cn('grid gap-4', canSeeAlertesKpi ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 sm:grid-cols-2')}>
        <KpiCard
          accent="primary"
          title="Clients actifs"
          value={stats.data?.clientsActifs?.toLocaleString('fr') ?? '—'}
          icon={Users}
          iconColor="bg-primary-light text-primary-accent"
          isLoading={stats.isLoading}
          trend={stats.data?.trends?.clientsActifs !== undefined ? {
            value: stats.data.trends.clientsActifs,
            label: 'vs mois préc.',
          } : undefined}
          onClick={() => navigate('/clients?statut=ACTIF')}
        />

        <KpiCard
          accent="success"
          title={ventesLabel}
          value={stats.data?.ventesJour !== undefined ? formatUSD(stats.data.ventesJour) : '—'}
          icon={ShoppingCart}
          iconColor="bg-green-100 text-success"
          isLoading={stats.isLoading}
          trend={stats.data?.trends?.ventesJour !== undefined ? {
            value: stats.data.trends.ventesJour,
            label: 'vs hier',
          } : undefined}
          onClick={() => navigate('/sales')}
        />

        {canSeeAlertesKpi && (
          <KpiCard
            accent={(stats.data?.alertesStock ?? 0) > 5 ? 'danger' : 'warning'}
            title="Alertes stock"
            value={stats.data?.alertesStock ?? '—'}
            icon={AlertTriangle}
            iconColor={
              (stats.data?.alertesStock ?? 0) > 5
                ? 'bg-red-100 text-danger'
                : 'bg-orange-100 text-warning'
            }
            isLoading={stats.isLoading}
            badge={
              (stats.data?.rupturesStock ?? 0) > 0
                ? `${stats.data!.rupturesStock} en rupture`
                : undefined
            }
            badgeVariant="danger"
            onClick={() => navigate('/stocks/alerts')}
          />
        )}

        <KpiCard
          accent="primary"
          title="Nouveaux filleuls"
          value={stats.data?.nouveauxFilleuls ?? '—'}
          icon={GitBranch}
          iconColor="bg-purple-100 text-platine"
          isLoading={stats.isLoading}
          trend={stats.data?.trends?.nouveauxFilleuls !== undefined ? {
            value: stats.data.trends.nouveauxFilleuls,
            label: 'vs mois préc.',
          } : undefined}
          onClick={() => navigate('/mlm/members')}
        />
      </div>

      {/* ── Graphique ventes ────────────────────────────────── */}
      {canSeeChart && (
        <SalesChart
          data={salesChart.data}
          isLoading={salesChart.isLoading}
          selectedSiteId={effectiveSiteId}
        />
      )}

      {/* ── Transactions + Alertes ───────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3">
          <RecentTransactions data={recentTransactions.data} isLoading={recentTransactions.isLoading} />
        </div>
        <div className="lg:col-span-2">
          <StockAlerts
            data={stockAlerts.data}
            isLoading={stockAlerts.isLoading}
            canManage={!isAgent}
          />
        </div>
      </div>
    </div>
  );
}
