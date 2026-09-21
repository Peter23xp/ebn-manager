import { useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, Download, ArrowLeft, ShoppingCart, Users, AlertTriangle, DollarSign } from 'lucide-react';
import toast from 'react-hot-toast';
import { useRegionalDashboard } from '@/hooks/useRegionalDashboard';
import { SitesComparisonTable } from '@/components/dashboard/SitesComparisonTable';
import { RevenueLineChart } from '@/components/dashboard/RevenueLineChart';
import { TopProductsList } from '@/components/dashboard/TopProductsList';
import { TopParrainsList } from '@/components/dashboard/TopParrainsList';
import { api } from '@/lib/api';
import { cn, formatUSD } from '@/lib/utils';
import { KpiCard } from '@/components/dashboard/KpiCard';
import './dashboard.css';

type Period = 'month' | 'quarter' | 'year';

const periodLabel: Record<Period, string> = {
  month: 'Ce mois',
  quarter: 'Ce trimestre',
  year: 'Cette année',
};

export default function DashboardRegionalPage() {
  const [period, setPeriod] = useState<Period>('month');
  const [isExporting, setIsExporting] = useState(false);

  const { comparison, revenueChart, topProducts, topParrains, isAnyLoading, refetchAll, error } =
    useRegionalDashboard(period);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const { data: job } = await api.post('/rapports/export', {
        type: 'DASHBOARD_REGIONAL',
        format: 'PDF',
        filtres: { period },
      });
      const jobId = job.id ?? job.jobId;

      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        if (attempts > 30) {
          clearInterval(poll);
          setIsExporting(false);
          toast.error('Erreur lors de la génération du rapport.');
          return;
        }
        try {
          const { data: status } = await api.get(`/rapports/export/${jobId}`);
          if (status.statut === 'READY' || status.status === 'READY') {
            clearInterval(poll);
            setIsExporting(false);
            window.open(status.downloadUrl, '_blank');
            toast.success('Rapport PDF téléchargé avec succès.');
          } else if (status.statut === 'ERROR' || status.status === 'ERROR') {
            clearInterval(poll);
            setIsExporting(false);
            toast.error('Erreur lors de la génération du rapport.');
          }
        } catch {
          clearInterval(poll);
          setIsExporting(false);
          toast.error('Erreur lors de la génération du rapport.');
        }
      }, 2000);
    } catch {
      setIsExporting(false);
      toast.error('Erreur lors de la génération du rapport.');
    }
  };

  const totals = comparison.data?.totaux;

  return (
    <div className="operations-dashboard">
      <header className="dashboard-header">
        <div>
          <Link to="/dashboard" className="dashboard-text-action -ml-2 mb-1"><ArrowLeft size={16} aria-hidden />Vue principale</Link>
          <h1 className="text-page-title text-primary">Vue régionale</h1>
          <p className="mt-1 text-sm text-text-muted">Comparez les sites et identifiez les points d’attention du réseau.</p>
        </div>
        <button type="button" onClick={handleExport} disabled={isExporting} className="btn-primary">
          {isExporting ? <RefreshCw size={16} className="animate-spin" aria-hidden /> : <Download size={16} aria-hidden />}
          {isExporting ? 'Génération…' : 'Export PDF'}
        </button>
      </header>

      <div className="dashboard-toolbar">
        <div className="min-w-0 max-w-full">
          <p className="mb-2 text-xs font-semibold text-text">Période de comparaison</p>
          <div className="dashboard-period" role="group" aria-label="Période régionale">
            {(['month', 'quarter', 'year'] as Period[]).map(option => (
              <button key={option} type="button" onClick={() => setPeriod(option)} aria-pressed={period === option}>{periodLabel[option]}</button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-text-muted">Tous les sites actifs</span>
          <button type="button" onClick={refetchAll} disabled={isAnyLoading} className="btn-secondary" aria-label="Actualiser les données">
            <RefreshCw size={16} className={cn(isAnyLoading && 'animate-spin')} aria-hidden />Actualiser
          </button>
        </div>
      </div>

      {error && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4" role="alert">
        <p className="text-sm text-red-700">{comparison.data ? 'L’actualisation a échoué. Les dernières données chargées restent affichées.' : 'Impossible de charger les données régionales.'}</p>
        <button type="button" onClick={refetchAll} className="btn-secondary"><RefreshCw size={16} aria-hidden />Réessayer</button>
      </div>}
      {(!error || comparison.data) && <>
        <section className="dashboard-metrics" aria-label="Indicateurs régionaux" aria-busy={isAnyLoading}>
          <KpiCard variant="summary" title="Chiffre d’affaires" value={totals ? formatUSD(totals.ca) : '—'} icon={DollarSign} isLoading={isAnyLoading} note="Sur la période sélectionnée" />
          <KpiCard variant="summary" title="Ventes validées" value={totals?.nbVentes.toLocaleString('fr') ?? '—'} icon={ShoppingCart} isLoading={isAnyLoading} note="Sur la période sélectionnée" />
          <KpiCard variant="summary" title="Clients actifs" value={totals?.nbClientsActifs.toLocaleString('fr') ?? '—'} icon={Users} isLoading={isAnyLoading} note="Situation actuelle" />
          <KpiCard variant="summary" title="Alertes stock" value={totals?.alertesStock.toLocaleString('fr') ?? '—'} icon={AlertTriangle} isLoading={isAnyLoading} note="Situation actuelle" />
        </section>
        <RevenueLineChart data={revenueChart.data} isLoading={revenueChart.isLoading} />
        <SitesComparisonTable data={comparison.data} isLoading={comparison.isLoading} />
        <div className="grid min-w-0 grid-cols-1 gap-5 xl:grid-cols-2">
          <TopProductsList data={topProducts.data} isLoading={topProducts.isLoading} />
          <TopParrainsList data={topParrains.data} isLoading={topParrains.isLoading} />
        </div>
      </>}
    </div>
  );
}
