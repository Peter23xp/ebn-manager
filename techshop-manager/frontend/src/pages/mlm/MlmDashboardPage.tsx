import React from 'react';
import { useMlmNetwork } from '@/hooks/useMlmNetwork';
import { NetworkStatsCards } from '@/components/mlm/NetworkStatsCards';
import { MembersByLevelChart } from '@/components/mlm/MembersByLevelChart';
import { RecentPromotionsTable } from '@/components/mlm/RecentPromotionsTable';
import { Link } from 'react-router-dom';
import { ArrowRight, Settings, Users } from 'lucide-react';

export default function MlmDashboardPage() {
  const { 
    stats, isLoadingStats, 
    membersByLevel, isLoadingMembers,
    recentPromotions, isLoadingPromotions 
  } = useMlmNetwork();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Réseau MLM</h1>
          <p className="text-gray-500 mt-1">Vue d'ensemble de la progression des membres et commissions</p>
        </div>
        
        <div className="flex items-center gap-3">
          <Link 
            to="/mlm/members" 
            className="btn btn-secondary flex items-center gap-2"
          >
            <Users size={18} />
            Tous les membres
          </Link>
          <Link 
            to="/mlm/config" 
            className="btn btn-outline flex items-center gap-2"
          >
            <Settings size={18} />
            Configuration
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <NetworkStatsCards stats={stats} isLoading={isLoadingStats} />

      {/* Main Grids */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Chart */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
              <h2 className="text-lg font-semibold text-gray-900">Répartition par Niveau</h2>
            </div>
            <div className="p-6">
              <MembersByLevelChart data={membersByLevel} isLoading={isLoadingMembers} />
            </div>
          </div>
        </div>

        {/* Right Column: Recent Activity */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-full">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
              <h2 className="text-lg font-semibold text-gray-900">Promotions Récentes</h2>
            </div>
            <div className="p-6 flex-1">
              <RecentPromotionsTable 
                promotions={recentPromotions} 
                isLoading={isLoadingPromotions} 
              />
            </div>
            <div className="px-6 py-3 border-t border-gray-50 bg-gray-50/50">
              <Link 
                to="/mlm/promotions" 
                className="text-sm font-medium text-blue-600 hover:text-blue-700 flex items-center justify-center gap-1"
              >
                Voir l'historique complet
                <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
