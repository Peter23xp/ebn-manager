import React from 'react';
import { useMlmNetwork } from '@/hooks/useMlmNetwork';
import { NetworkStatsCards } from '@/components/mlm/NetworkStatsCards';
import { MembersByLevelChart } from '@/components/mlm/MembersByLevelChart';
import { RecentPromotionsTable } from '@/components/mlm/RecentPromotionsTable';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Settings,
  Users,
  Network,
  Award,
  DollarSign,
  Clock,
  ChevronRight,
} from 'lucide-react';
import { formatUSD } from '@/lib/utils';

export default function MlmDashboardPage() {
  const {
    stats,
    isLoadingStats,
    membersByLevel,
    isLoadingMembers,
    recentPromotions,
    isLoadingPromotions,
  } = useMlmNetwork();

  const commissionsEnAttente = (stats as any)?.commissionsEnAttente;

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-light" aria-hidden>
            <Network size={20} className="text-primary-accent" />
          </div>
          <div>
            <h1 className="text-page-title text-primary">Réseau MLM</h1>
            <p className="text-xs text-text-muted mt-0.5">
              Progression des membres, matrices et commissions (Plan 8 Niveaux)
            </p>
          </div>
        </div>

        {/* Quick action buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/mlm/levels"
            className="btn-secondary flex items-center gap-1.5 text-[13px]"
          >
            <Award size={15} className="text-warning" />
            8 Niveaux
          </Link>
          <Link
            to="/mlm/tree"
            className="btn-secondary flex items-center gap-1.5 text-[13px]"
          >
            <Network size={15} className="text-primary-accent" />
            Arbre MLM
          </Link>
          <Link
            to="/mlm/commissions"
            className="btn-secondary flex items-center gap-1.5 text-[13px]"
          >
            <DollarSign size={15} className="text-success" />
            Commissions
          </Link>
          <Link
            to="/mlm/members"
            className="btn-primary flex items-center gap-1.5 text-[13px]"
          >
            <Users size={15} />
            Tous les membres
          </Link>
          <Link
            to="/mlm/config"
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-white text-text-muted hover:border-primary-accent hover:text-primary-accent transition-colors duration-150"
            title="Configuration"
            aria-label="Configuration du plan"
          >
            <Settings size={18} />
          </Link>
        </div>
      </div>

      {/* Pending commissions notification */}
      {commissionsEnAttente && commissionsEnAttente.count > 0 && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-amber-100 text-warning">
              <Clock size={18} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text">
                {commissionsEnAttente.count} commission{commissionsEnAttente.count > 1 ? 's' : ''} en attente de validation ({formatUSD(commissionsEnAttente.montant)})
              </p>
              <p className="text-xs text-text-muted">
                Les commissions nécessitent une validation administrative avant d'être créditées.
              </p>
            </div>
          </div>
          <Link
            to="/mlm/commissions?statut=EN_ATTENTE"
            className="btn-primary flex flex-shrink-0 items-center gap-1 text-[13px]"
          >
            Examiner <ChevronRight size={14} />
          </Link>
        </div>
      )}

      {/* KPI Cards */}
      <NetworkStatsCards stats={stats} isLoading={isLoadingStats} />

      {/* Main Grids */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left Column: Chart */}
        <div className="lg:col-span-2">
          <div className="rounded-xl shadow-card border border-border bg-white p-5 h-full">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-section-title text-primary">Répartition par niveau</h2>
              <Link
                to="/mlm/levels"
                className="text-[13px] font-semibold text-primary-accent hover:text-blue-700 transition-colors flex items-center gap-1"
              >
                Détail du plan <ChevronRight size={12} />
              </Link>
            </div>
            <MembersByLevelChart data={membersByLevel} isLoading={isLoadingMembers} />
          </div>
        </div>

        {/* Right Column: Recent Activity */}
        <div className="rounded-xl shadow-card border border-border bg-white flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h2 className="text-section-title text-primary">Promotions récentes</h2>
          </div>
          <div className="p-5 flex-1">
            <RecentPromotionsTable
              promotions={recentPromotions}
              isLoading={isLoadingPromotions}
            />
          </div>
          <div className="px-5 py-3 border-t border-border">
            <Link
              to="/mlm/members"
              className="text-[13px] font-medium text-primary-accent hover:text-blue-700 transition-colors flex items-center justify-center gap-1"
            >
              Voir tous les membres
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}