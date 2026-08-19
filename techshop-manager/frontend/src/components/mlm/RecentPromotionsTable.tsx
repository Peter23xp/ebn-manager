import React from 'react';
import type { Promotion, Membre, Client } from '@/types';
import { formatRelative, formatUSD } from '@/lib/utils';
import { MlmLevelBadge } from './MlmLevelBadge';
import { Link } from 'react-router-dom';

interface RecentPromotionsTableProps {
  promotions?: any[];
  isLoading: boolean;
}

export const RecentPromotionsTable: React.FC<RecentPromotionsTableProps> = ({ promotions, isLoading }) => {
  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="skeleton h-16 rounded-lg" />
        ))}
      </div>
    );
  }

  if (!promotions || promotions.length === 0) {
    return (
      <div className="py-12 text-center text-text-muted">
        <p>Aucune promotion récente.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead className="text-xs text-text-muted uppercase bg-slate-50/50">
          <tr>
            <th className="px-4 py-3 font-medium rounded-tl-lg">Membre</th>
            <th className="px-4 py-3 font-medium">Progression</th>
            <th className="px-4 py-3 font-medium text-right">Commission Gérée</th>
            <th className="px-4 py-3 font-medium text-right rounded-tr-lg">Date</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {promotions.map((promo) => (
            <tr key={promo.id} className="hover:bg-blue-50/40 transition-colors">
              <td className="px-4 py-3">
                <Link 
                  to={`/mlm/members/${promo.membreId || promo.membre?.id}`}
                  className="font-medium text-text hover:text-primary-accent transition-colors"
                >
                  {promo.membre?.client?.prenom || (promo.membre as any)?.prenom} {promo.membre?.client?.nom || (promo.membre as any)?.nom}
                </Link>
                <div className="text-xs text-text-muted">{promo.membre?.matricule}</div>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <MlmLevelBadge level={promo.niveauAvantId} size="xs" showIcon={false} />
                  <span className="text-text-subtle">→</span>
                  <MlmLevelBadge level={promo.niveauApresId} size="sm" />
                </div>
              </td>
              <td className="px-4 py-3 text-right font-medium text-success">
                +{formatUSD(promo.commissionVersee)}
              </td>
              <td className="px-4 py-3 text-right text-text-muted whitespace-nowrap">
                {formatRelative(promo.datePromotion)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
