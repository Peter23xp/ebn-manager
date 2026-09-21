import { useState } from 'react';
import { Line } from 'react-chartjs-2';
import { TrendingUp } from 'lucide-react';
import { formatUSD } from '@/lib/utils';
import type { RevenueChartData } from '@/hooks/useRegionalDashboard';
import { DashboardPanel } from './DashboardPanel';

interface RevenueLineChartProps {
  data: RevenueChartData | undefined;
  isLoading: boolean;
}

export function RevenueLineChart({ data, isLoading }: RevenueLineChartProps) {
  const [hiddenSites, setHiddenSites] = useState<string[]>([]);
  const datasets = (data?.datasets ?? []).map(site => ({
    label: site.site,
    data: site.data,
    borderColor: site.color,
    backgroundColor: site.color,
    tension: 0.25,
    fill: false,
    pointRadius: 2,
    pointHoverRadius: 5,
    borderWidth: 2,
    hidden: hiddenSites.includes(site.siteId),
  }));
  const isEmpty = datasets.length === 0 || datasets.every(series => series.data.every(value => value === 0));

  return (
    <DashboardPanel title="Évolution du chiffre d’affaires" description="Montants en USD · Comparaison des sites sur la période sélectionnée." isLoading={isLoading}>
      {isEmpty ? <div className="dashboard-empty" role="status"><TrendingUp size={24} aria-hidden /><p>Aucune vente sur cette période</p></div> : <>
        <ul className="dashboard-legend dashboard-legend-interactive" aria-label="Sites comparés">
          {data?.datasets.map(site => <li key={site.siteId}>
            <button type="button" aria-pressed={!hiddenSites.includes(site.siteId)} onClick={() => setHiddenSites(current => current.includes(site.siteId) ? current.filter(siteId => siteId !== site.siteId) : [...current, site.siteId])}>
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: site.color }} aria-hidden />{site.site}
            </button>
          </li>)}
        </ul>
        <div className="dashboard-chart">
          <Line role="img" aria-label="Évolution du chiffre d’affaires par site, en USD" data={{ labels: data?.labels ?? [], datasets }} options={{
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
              legend: { display: false },
              tooltip: { padding: 12, cornerRadius: 8, callbacks: { label: context => ` ${context.dataset.label}: ${formatUSD(context.parsed.y ?? 0)}` } },
            },
            scales: {
              x: { grid: { display: false }, border: { display: false }, ticks: { color: '#64748b', font: { size: 11 }, maxRotation: 0, maxTicksLimit: 8 } },
              y: { beginAtZero: true, border: { display: false }, grid: { color: '#f1f5f9' }, ticks: {
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
