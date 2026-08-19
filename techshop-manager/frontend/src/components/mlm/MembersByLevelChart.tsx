import React from 'react';
import { MLM_LEVELS_REF } from '@/types';
import { 
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

interface MembersByLevelChartProps {
  data?: {
    levelId?: number;
    ordre?: number;
    count?: number;
    membresActifs?: number;
    nom?: string;
    couleur?: string;
  }[];
  isLoading: boolean;
}

export const MembersByLevelChart: React.FC<MembersByLevelChartProps> = ({ data, isLoading }) => {
  if (isLoading) {
    return <div className="w-full h-[300px] skeleton rounded-xl" />;
  }

  const chartData = {
    labels: MLM_LEVELS_REF.map(l => l.nom),
    datasets: [
      {
        label: 'Membres',
        data: MLM_LEVELS_REF.map(l => {
          const found = data?.find((d: any) => (d.levelId === l.ordre || d.ordre === l.ordre));
          return found ? (found.count ?? found.membresActifs ?? 0) : 0;
        }),
        backgroundColor: MLM_LEVELS_REF.map(l => l.couleur),
        borderRadius: 4,
      }
    ]
  };

  const options = {
    indexAxis: 'y' as const,
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        callbacks: {
          label: (context: any) => `${context.raw} membres`,
        },
      },
    },
    scales: {
      x: {
        beginAtZero: true,
        grid: {
          display: true,
          color: '#f3f4f6',
        },
      },
      y: {
        grid: {
          display: false,
        },
      },
    },
  };

  return (
    <div className="w-full h-[300px]">
      <Bar data={chartData} options={options} />
    </div>
  );
};
