import React from 'react';
import { Users, UserPlus, DollarSign, TrendingUp } from 'lucide-react';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { formatUSDShort } from '@/lib/utils';

interface NetworkStatsCardsProps {
  stats?: {
    totalMembres?: number;
    membresActifs?: number;
    membresEnAttente?: number;
    commissionsGenerees?: number;
    totalCommissionsVerseesUSD?: number;
    soldeDisponibleTotalUSD?: number;
    promotionsMois?: number;
    promotionsDerniers30Jours?: number;
    trends?: {
      membresActifs?: number;
      commissions?: number;
    };
  };
  isLoading: boolean;
}

export const NetworkStatsCards: React.FC<NetworkStatsCardsProps> = ({ stats, isLoading }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <KpiCard
        accent="primary"
        title="Membres actifs"
        value={(stats?.membresActifs ?? 0).toLocaleString('fr-CD')}
        icon={Users}
        iconColor="bg-primary-light text-primary-accent"
        isLoading={isLoading}
        trend={stats?.trends?.membresActifs !== undefined ? {
          value: stats.trends.membresActifs,
          label: 'vs mois préc.',
        } : undefined}
      />

      <KpiCard
        accent="warning"
        title="En attente"
        value={(stats?.membresEnAttente ?? 0).toLocaleString('fr-CD')}
        icon={UserPlus}
        iconColor="bg-amber-100 text-warning"
        isLoading={isLoading}
      />

      <KpiCard
        accent="success"
        title="Commissions"
        value={formatUSDShort(stats?.commissionsGenerees ?? stats?.totalCommissionsVerseesUSD ?? 0)}
        icon={DollarSign}
        iconColor="bg-green-100 text-success"
        isLoading={isLoading}
        trend={stats?.trends?.commissions !== undefined ? {
          value: stats.trends.commissions,
          label: 'vs mois préc.',
        } : undefined}
      />

      <KpiCard
        accent="primary"
        title="Promotions (mois)"
        value={(stats?.promotionsMois ?? stats?.promotionsDerniers30Jours ?? 0).toLocaleString('fr-CD')}
        icon={TrendingUp}
        iconColor="bg-purple-100 text-platine"
        isLoading={isLoading}
      />
    </div>
  );
};