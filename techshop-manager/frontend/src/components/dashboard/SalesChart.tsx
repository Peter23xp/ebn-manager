import { Bar } from 'react-chartjs-2';
import { ShoppingCart } from 'lucide-react';
import { formatUSD } from '@/lib/utils';
import type { SalesChartData } from '@/hooks/useDashboard';
import { DashboardPanel } from './DashboardPanel';

interface SalesChartProps {
  data: SalesChartData | undefined;
  isLoading: boolean;
  selectedSiteId: string | null;
  error?: boolean;
}

export function SalesChart({ data, isLoading, selectedSiteId, error }: SalesChartProps) {
  const visibleSites = (data?.datasets ?? []).filter(site => !selectedSiteId || site.siteId === selectedSiteId);
  const datasets = visibleSites.map(site => ({
    label: site.site,
    data: site.data,
    backgroundColor: site.color,
    borderRadius: 4,
    maxBarThickness: 36,
    borderSkipped: false as const,
  }));
  const isEmpty = datasets.length === 0 || datasets.every(series => series.data.every(value => value === 0));
  const stacked = selectedSiteId === null && datasets.length > 1;

  return (
    <DashboardPanel title="Ventes — 7 derniers jours" description="Montants en USD · Période fixe, indépendante du filtre des ventes." isLoading={isLoading} error={error}>
      {isEmpty ? <div className="dashboard-empty" role="status"><ShoppingCart size={24} aria-hidden /><p>Aucune vente sur cette période</p><p className="text-xs">Les ventes apparaîtront ici une fois validées.</p></div> : <>
        <ul className="dashboard-legend" aria-label="Sites affichés">
          {visibleSites.map(site => <li key={site.siteId}><span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: site.color }} aria-hidden />{site.site}</li>)}
        </ul>
        <div className="dashboard-chart">
          <Bar role="img" aria-label="Ventes quotidiennes par site, en USD" data={{ labels: data?.labels ?? [], datasets }} options={{
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            plugins: {
              legend: { display: false },
              tooltip: { padding: 12, cornerRadius: 8, callbacks: { label: context => ` ${context.dataset.label}: ${formatUSD(context.parsed.y ?? 0)}` } },
            },
            scales: {
              x: { stacked, grid: { display: false }, border: { display: false }, ticks: { color: '#64748b', font: { size: 11 }, maxRotation: 0 } },
              y: { stacked, beginAtZero: true, border: { display: false }, grid: { color: '#f1f5f9' }, ticks: {
                color: '#64748b', font: { size: 11 }, maxTicksLimit: 5,
                callback: value => new Intl.NumberFormat('fr', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value)),
              } },
            },
          }} />
        </div>
      </>}
    </DashboardPanel>
  );
}
