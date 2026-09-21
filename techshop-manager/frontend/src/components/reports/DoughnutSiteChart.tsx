import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import { formatUSD } from '@/lib/utils';

ChartJS.register(ArcElement, Tooltip, Legend);

const SITE_COLORS: Record<string, string> = {
  Goma: '#2563eb',
  Bukavu: '#15803d',
  Kinshasa: '#b45309',
};
const FALLBACK_COLORS = ['#2563eb', '#15803d', '#b45309', '#7c3aed', '#dc2626'];

interface DoughnutSiteChartProps {
  data: Array<{ siteNom: string; ca: number; pourcentage: number }>;
  totalCA: number;
  isLoading: boolean;
}

export function DoughnutSiteChart({ data, totalCA, isLoading }: DoughnutSiteChartProps) {
  const chartData = {
    labels: data.map(site => site.siteNom),
    datasets: [{
      data: data.map(site => site.ca),
      backgroundColor: data.map((site, index) => SITE_COLORS[site.siteNom] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length]),
      borderColor: '#ffffff',
      borderWidth: 3,
      hoverOffset: 4,
    }],
  };

  const options = {
    animation: false as const,
    responsive: true,
    maintainAspectRatio: false,
    cutout: '72%',
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          color: '#64748b',
          font: { size: 12, family: '"Plus Jakarta Sans", sans-serif' },
          padding: 16,
          usePointStyle: true,
          pointStyleWidth: 8,
          boxHeight: 6,
        },
      },
      tooltip: {
        callbacks: {
          label: (context: import('chart.js').TooltipItem<'doughnut'>) => {
            const value = typeof context.raw === 'number' ? context.raw : 0;
            const percentage = data[context.dataIndex]?.pourcentage?.toFixed(1) ?? '0';
            return ` ${context.label} — ${formatUSD(value)} (${percentage}%)`;
          },
        },
      },
    },
  };

  return (
    <section className="card min-w-0" aria-labelledby="reports-distribution-title" aria-busy={isLoading}>
      <div className="report-panel-heading">
        <h2 id="reports-distribution-title">Répartition par site</h2>
        <p>Contribution au chiffre d’affaires de la période</p>
      </div>
      {isLoading ? (
        <div className="flex h-[280px] flex-col items-center justify-center gap-4" aria-hidden="true">
          <div className="skeleton h-40 w-40 rounded-full" />
          <div className="skeleton h-5 w-32 rounded" />
        </div>
      ) : data.length === 0 ? (
        <div className="flex h-[280px] items-center justify-center text-center text-sm text-text-muted">
          Aucune vente sur la période
        </div>
      ) : (
        <div className="flex h-[280px] min-w-0 flex-col gap-3">
          <p className="text-center text-sm text-text-muted">Total <strong className="ml-1 font-semibold tabular-nums text-primary">{formatUSD(totalCA)}</strong></p>
          <div className="relative min-h-0 flex-1">
            <Doughnut data={chartData} options={options} role="img" aria-label={`Répartition des ventes : ${data.map(site => `${site.siteNom}, ${site.pourcentage.toLocaleString('fr-CD', { maximumFractionDigits: 1 })} %`).join(' ; ')}`} />
          </div>
        </div>
      )}
    </section>
  );
}
