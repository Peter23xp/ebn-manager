import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Users, ShoppingCart, AlertTriangle, GitBranch, RefreshCw, WifiOff, ArrowUpRight } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useUIStore } from '@/store/ui.store';
import { useDashboard } from '@/hooks/useDashboard';
import { usePolling } from '@/hooks/usePolling';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { SalesChart } from '@/components/dashboard/SalesChart';
import { RecentTransactions } from '@/components/dashboard/RecentTransactions';
import { StockAlerts } from '@/components/dashboard/StockAlerts';
import { formatUSD, formatRelative, cn } from '@/lib/utils';
import { hasMinimumRole, isSiteScopedStaff } from '@/lib/roles';
import './dashboard.css';

type Period = 'today' | 'week' | 'month';
const periodNames: Record<Period, string> = { today: 'Aujourd’hui', week: 'Semaine', month: 'Mois' };

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user, canAccess } = useAuth();
  const { selectedSiteId } = useUIStore();
  const [period, setPeriod] = useState<Period>('today');
  const isAgent = user?.role === 'AGENT';
  const canCollect = hasMinimumRole(user?.role, 'CAISSIER');
  const canManage = hasMinimumRole(user?.role, 'GERANT');
  const canSeeRegionalLink = canAccess(['SUPER_ADMIN', 'DIRECTEUR_REGIONAL']);
  const effectiveSiteId = (user && isSiteScopedStaff(user.role)) || user?.role === 'GERANT' ? (user?.siteId ?? null) : selectedSiteId;
  const { stats, salesChart, recentTransactions, stockAlerts, isAnyLoading, refetchAll, isOfflineData } = useDashboard(effectiveSiteId, period);
  const { isPolling } = usePolling(refetchAll, 5 * 60 * 1000, { enabled: navigator.onLine });
  const lastRefresh = stats.dataUpdatedAt ? new Date(stats.dataUpdatedAt) : null;
  const ventesLabel = period === 'today' ? "Ventes aujourd'hui" : period === 'week' ? 'Ventes cette semaine' : 'Ventes ce mois';
  const comparisonLabel = period === 'today' ? 'vs hier' : 'vs période précédente';
  const hasError = !isOfflineData && stats.isError && salesChart.isError && recentTransactions.isError && stockAlerts.isError;

  return (
    <div className="operations-dashboard">
      <header className="dashboard-header">
        <div>
          <h1 className="text-page-title text-primary">Tableau de bord</h1>
          <p className="mt-1 text-sm text-text-muted">L’activité commerciale, les clients et les stocks en un coup d’œil.</p>
        </div>
        {canSeeRegionalLink && <Link className="btn-secondary" to="/dashboard/regional">Vue régionale <ArrowUpRight size={16} aria-hidden /></Link>}
      </header>

      <div className="dashboard-toolbar">
        {!isAgent && <div className="min-w-0 max-w-full">
          <p className="mb-2 text-xs font-semibold text-text">Période des ventes</p>
          <div className="dashboard-period" role="group" aria-label="Période des indicateurs">
            {(['today', 'week', 'month'] as Period[]).map(option => (
              <button key={option} onClick={() => setPeriod(option)} type="button" aria-pressed={period === option}>{periodNames[option]}</button>
            ))}
          </div>
        </div>}
        <div className="flex min-w-0 flex-wrap items-center gap-3 sm:ml-auto">
          <div className="text-xs leading-relaxed text-text-muted sm:text-right" role="status">
            {isOfflineData ? <span className="dashboard-badge bg-amber-100 text-amber-800"><WifiOff size={14} aria-hidden />Données en cache · hors ligne</span>
              : isPolling ? <p>Actualisation automatique · 5 min</p> : null}
            {lastRefresh && !isAnyLoading && <p>Mis à jour {formatRelative(lastRefresh)}</p>}
          </div>
          <button onClick={refetchAll} disabled={isAnyLoading} type="button" className="btn-secondary">
            <RefreshCw size={16} className={cn(isAnyLoading && 'animate-spin')} aria-hidden />Actualiser
          </button>
        </div>
      </div>

      {hasError ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
        <p className="text-sm text-red-700">Impossible de charger les données du tableau de bord.</p>
        <button onClick={refetchAll} type="button" className="btn-secondary"><RefreshCw size={16} aria-hidden />Réessayer</button>
      </div> : <>
        <section className={cn('dashboard-metrics', isAgent && 'dashboard-metrics-agent')} aria-label="Indicateurs du tableau de bord" aria-busy={stats.isLoading}>
          <KpiCard variant="summary" title={ventesLabel} value={stats.data?.ventesJour !== undefined ? formatUSD(stats.data.ventesJour) : '—'} icon={ShoppingCart} isLoading={stats.isLoading}
            trend={stats.data?.trends?.ventesJour !== undefined ? { value: stats.data.trends.ventesJour, label: comparisonLabel } : undefined} onClick={canCollect ? () => navigate('/sales') : undefined} />
          <KpiCard variant="summary" title="Clients actifs" value={stats.data?.clientsActifs?.toLocaleString('fr') ?? '—'} icon={Users} isLoading={stats.isLoading}
            trend={stats.data?.trends?.clientsActifs !== undefined ? { value: stats.data.trends.clientsActifs, label: 'vs mois précédent' } : undefined} onClick={() => navigate('/clients?statut=ACTIF')} />
          {!isAgent && <KpiCard variant="summary" title="Alertes stock" value={stats.data?.alertesStock ?? '—'} icon={AlertTriangle} isLoading={stats.isLoading}
            badge={(stats.data?.rupturesStock ?? 0) > 0 ? `${stats.data!.rupturesStock} en rupture` : undefined} badgeVariant="danger" note="Situation actuelle" onClick={canManage ? () => navigate('/stocks/alerts') : undefined} />}
          <KpiCard variant="summary" title="Nouveaux filleuls" value={stats.data?.nouveauxFilleuls ?? '—'} icon={GitBranch} isLoading={stats.isLoading}
            trend={stats.data?.trends?.nouveauxFilleuls !== undefined ? { value: stats.data.trends.nouveauxFilleuls, label: 'vs mois précédent' } : undefined} onClick={canManage ? () => navigate('/mlm/members') : undefined} />
        </section>
        {!isAgent && <SalesChart data={salesChart.data} isLoading={salesChart.isLoading} error={salesChart.isError && !salesChart.data} selectedSiteId={effectiveSiteId} />}
        <div className="grid min-w-0 grid-cols-1 items-stretch gap-5 xl:grid-cols-5">
          <div className="min-w-0 xl:col-span-3"><RecentTransactions data={recentTransactions.data} isLoading={recentTransactions.isLoading} error={recentTransactions.isError && !recentTransactions.data} canNavigate={canCollect} /></div>
          <div className="min-w-0 xl:col-span-2"><StockAlerts data={stockAlerts.data} isLoading={stockAlerts.isLoading} error={stockAlerts.isError && !stockAlerts.data} canManage={canManage} /></div>
        </div>
      </>}
    </div>
  );
}
