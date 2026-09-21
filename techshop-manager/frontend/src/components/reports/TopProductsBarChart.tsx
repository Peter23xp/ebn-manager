import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import { formatUSD, truncate } from '@/lib/utils';
import type { TopProduit } from '@/lib/reports.api';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

interface TopProductsBarChartProps {
  data: TopProduit[];
  isLoading: boolean;
}

export function TopProductsBarChart({ data, isLoading }: TopProductsBarChartProps) {
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="card min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="skeleton h-5 w-48 max-w-full rounded" />
          <div className="skeleton h-4 w-28 max-w-full rounded" />
        </div>
        <div className="skeleton rounded" style={{ height: 220 }} />
      </div>
    );
  }

  const isEmpty = !data || data.length === 0;

  const chartData = {
    labels: (data ?? []).map((p) => truncate(p.nom, 25)),
    datasets: [
      {
        label: 'Quantité vendue',
        data: (data ?? []).map((p) => p.quantite),
        backgroundColor: '#2563eb',
        borderColor: '#2563eb',
        borderWidth: 1,
        borderRadius: 4,
        hoverBackgroundColor: '#1d4ed8',
        maxBarThickness: 24,
      },
    ],
  };

  const options = {
    indexAxis: 'y' as const,
    animation: false as const,
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: import('chart.js').TooltipItem<'bar'>) => {
            const idx = ctx.dataIndex;
            const produit = data?.[idx];
            if (!produit) return '';
            return [
              ` ${produit.quantite} unités vendues`,
              ` CA : ${formatUSD(produit.ca)}`,
            ];
          },
        },
      },
    },
    scales: {
      x: {
        border: { display: false },
        grid: { color: '#e2e8f0' },
        ticks: {
          color: '#64748b',
          font: { size: 12 },
          callback: (v: number | string) => String(Math.round(Number(v))),
        },
        title: {
          display: true,
          text: 'Quantité vendue',
          font: { size: 12 },
          color: '#64748b',
        },
      },
      y: {
        grid: { display: false },
        border: { display: false },
        ticks: { color: '#64748b', font: { size: 12, family: '"Plus Jakarta Sans", sans-serif' } },
      },
    },
  };

  return (
    <section className="card min-w-0" aria-labelledby="reports-products-title">
      <div className="report-panel-heading flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <h2 id="reports-products-title">
          Top 5 produits — par quantité vendue
        </h2>
        <button
          type="button"
          onClick={() => navigate('/reports/sales')}
          className="flex min-h-11 shrink-0 items-center gap-1 text-sm text-primary-accent font-semibold
                     hover:underline focus:outline-none focus:ring-2 focus:ring-primary-accent/30 rounded"
        >
          Rapport détaillé
          <ArrowRight size={12} />
        </button>
      </div>

      {isEmpty ? (
        <div className="flex items-center justify-center text-sm text-text-muted" style={{ height: 220 }}>
          Aucune vente sur la période
        </div>
      ) : (
        <div style={{ height: 220 }}>
          <Bar data={chartData} options={options} role="img" aria-label={`Produits les plus vendus : ${data.map(product => `${product.nom}, ${product.quantite} unités`).join(' ; ')}`} />
        </div>
      )}
    </section>
  );
}
