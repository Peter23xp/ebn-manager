import React from 'react';
import { Users, UserPlus, DollarSign, TrendingUp } from 'lucide-react';
import { formatUSDShort } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface NetworkStatsCardsProps {
  stats?: {
    membresActifs: number;
    membresEnAttente: number;
    commissionsGenerees: number;
    promotionsMois: number;
    trends: {
      membresActifs: number;
      commissions: number;
    };
  };
  isLoading: boolean;
}

export const NetworkStatsCards: React.FC<NetworkStatsCardsProps> = ({ stats, isLoading }) => {
  const cards = [
    {
      title: 'Membres Actifs',
      value: stats?.membresActifs ?? 0,
      icon: Users,
      trend: stats?.trends.membresActifs ?? 0,
      color: 'blue',
      format: (val: number) => val.toLocaleString('fr-CD'),
    },
    {
      title: 'En Attente',
      value: stats?.membresEnAttente ?? 0,
      icon: UserPlus,
      trend: null,
      color: 'amber',
      format: (val: number) => val.toLocaleString('fr-CD'),
    },
    {
      title: 'Commissions',
      value: stats?.commissionsGenerees ?? 0,
      icon: DollarSign,
      trend: stats?.trends.commissions ?? 0,
      color: 'green',
      format: (val: number) => formatUSDShort(val),
    },
    {
      title: 'Promotions (Mois)',
      value: stats?.promotionsMois ?? 0,
      icon: TrendingUp,
      trend: null,
      color: 'purple',
      format: (val: number) => val.toLocaleString('fr-CD'),
    },
  ];

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm animate-pulse h-32" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card, index) => {
        const Icon = card.icon;
        const colorStyles = {
          blue: 'bg-blue-50 text-blue-600',
          amber: 'bg-amber-50 text-amber-600',
          green: 'bg-green-50 text-green-600',
          purple: 'bg-purple-50 text-purple-600',
        }[card.color];

        const isPositive = card.trend && card.trend > 0;
        const isNegative = card.trend && card.trend < 0;

        return (
          <div key={index} className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-gray-500 mb-1">{card.title}</p>
                <h3 className="text-3xl font-bold text-gray-900">{card.format(card.value)}</h3>
              </div>
              <div className={cn('p-3 rounded-xl', colorStyles)}>
                <Icon size={24} strokeWidth={2} />
              </div>
            </div>
            
            {card.trend !== null && (
              <div className="mt-4 flex items-center text-sm">
                <span className={cn(
                  'font-medium mr-2',
                  isPositive ? 'text-green-600' : isNegative ? 'text-red-600' : 'text-gray-500'
                )}>
                  {isPositive ? '+' : ''}{card.trend}%
                </span>
                <span className="text-gray-400">vs mois dernier</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
