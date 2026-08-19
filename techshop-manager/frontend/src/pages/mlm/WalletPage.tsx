import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Wallet,
  ArrowDownRight,
  ArrowUpRight,
  TrendingUp,
  DollarSign,
  Users,
  Filter,
  RefreshCw,
  ExternalLink,
  Award,
  Gift,
} from 'lucide-react';
import { useWalletTransactions, useMlmMembers } from '@/hooks/useMlm';
import { useQuery } from '@tanstack/react-query';
import { MlmApi } from '@/lib/mlm.api';
import { formatDate, formatUSD } from '@/lib/utils';
import { Pagination } from '@/components/ui/Pagination';

const TRANSACTION_TYPE_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode; positive: boolean }> = {
  COMMISSION: { label: 'Commission MLM', color: 'text-emerald-700 bg-emerald-50 border-emerald-200', icon: <DollarSign size={12} />, positive: true },
  PROMOTION: { label: 'Promotion de rang', color: 'text-blue-700 bg-blue-50 border-blue-200', icon: <TrendingUp size={12} />, positive: true },
  SALAIRE: { label: 'Salaire mensuel', color: 'text-indigo-700 bg-indigo-50 border-indigo-200', icon: <Award size={12} />, positive: true },
  BONUS_RETRAITE: { label: 'Bonus retraite', color: 'text-amber-700 bg-amber-50 border-amber-200', icon: <Gift size={12} />, positive: true },
  DEBIT: { label: 'Débit / retrait', color: 'text-red-700 bg-red-50 border-red-200', icon: <ArrowDownRight size={12} />, positive: false },
};

export default function WalletPage() {
  const [page, setPage] = useState(1);
  const [filterType, setFilterType] = useState<string>('');
  const [filterMember, setFilterMember] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'transactions' | 'wallets'>('transactions');

  // Transactions
  const { data: txData, isLoading: txLoading, refetch: refetchTx } = useWalletTransactions({
    page,
    limit: 20,
    type: filterType || undefined,
    memberId: filterMember || undefined,
  });
  const transactions = (txData as any)?.transactions ?? [];
  const meta = (txData as any)?.meta;

  // All members for wallet view
  const { data: membersData, isLoading: membersLoading } = useMlmMembers({ limit: 100 });
  const members = (membersData as any)?.membres ?? [];

  // Wallet details per member (only for wallets tab)
  const memberWalletQueries = useQuery({
    queryKey: ['mlm-all-wallets', members.map((m: any) => m.id)],
    queryFn: async () => {
      if (members.length === 0) return [];
      const results = await Promise.allSettled(
        members.map((m: any) => MlmApi.getWallet(m.id))
      );
      return results
        .map((r, i) => r.status === 'fulfilled' ? { ...r.value, memberId: members[i].id } : null)
        .filter(Boolean);
    },
    enabled: activeTab === 'wallets' && members.length > 0,
  });

  const wallets: any[] = (memberWalletQueries.data ?? []) as any[];

  // Summary stats from transactions
  const totalCredit = transactions
    .filter((t: any) => t.type !== 'DEBIT')
    .reduce((s: number, t: any) => s + (t.montant ?? 0), 0);
  const totalDebit = transactions
    .filter((t: any) => t.type === 'DEBIT')
    .reduce((s: number, t: any) => s + (t.montant ?? 0), 0);

  const totalWalletBalance = wallets.reduce((s: number, w: any) => s + (w?.soldeDisponible ?? 0), 0);
  const totalEarned = wallets.reduce((s: number, w: any) => s + (w?.totalGagne ?? 0), 0);

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Wallet size={24} className="text-blue-600" />
            Portefeuilles MLM
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Gestion des soldes et transactions des commissions MLM en USD
          </p>
        </div>

        <button
          onClick={() => refetchTx()}
          className="btn btn-outline btn-sm flex items-center gap-1.5"
        >
          <RefreshCw size={14} className={txLoading ? 'animate-spin' : ''} />
          Actualiser
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {
            label: 'Solde total réseau',
            value: formatUSD(totalWalletBalance),
            icon: <Wallet size={20} className="text-blue-600" />,
            color: 'bg-blue-50 border-blue-200',
          },
          {
            label: 'Total gagné (réseau)',
            value: formatUSD(totalEarned),
            icon: <TrendingUp size={20} className="text-emerald-600" />,
            color: 'bg-emerald-50 border-emerald-200',
          },
          {
            label: 'Crédits (page)',
            value: formatUSD(totalCredit),
            icon: <ArrowUpRight size={20} className="text-indigo-600" />,
            color: 'bg-indigo-50 border-indigo-200',
          },
          {
            label: 'Membres actifs',
            value: String(members.length),
            icon: <Users size={20} className="text-amber-600" />,
            color: 'bg-amber-50 border-amber-200',
          },
        ].map((card) => (
          <div key={card.label} className={`rounded-2xl border p-4 ${card.color}`}>
            <div className="flex items-center gap-2 mb-1">
              {card.icon}
              <span className="text-xs font-bold text-gray-600 uppercase tracking-wide">{card.label}</span>
            </div>
            <p className="text-2xl font-extrabold text-gray-900">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {(['transactions', 'wallets'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              activeTab === tab
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            {tab === 'transactions' ? '📋 Transactions' : '💰 Soldes membres'}
          </button>
        ))}
      </div>

      {/* Transactions Tab */}
      {activeTab === 'transactions' && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Filters */}
          <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center gap-3">
            <Filter size={16} className="text-gray-400" />
            <select
              value={filterType}
              onChange={(e) => { setFilterType(e.target.value); setPage(1); }}
              className="input text-sm min-w-44"
            >
              <option value="">Tous les types</option>
              {Object.entries(TRANSACTION_TYPE_CONFIG).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>

            <select
              value={filterMember}
              onChange={(e) => { setFilterMember(e.target.value); setPage(1); }}
              className="input text-sm min-w-56"
            >
              <option value="">Tous les membres</option>
              {members.map((m: any) => (
                <option key={m.id} value={m.id}>
                  {m.client?.prenom} {m.client?.nom} ({m.matricule})
                </option>
              ))}
            </select>

            {(filterType || filterMember) && (
              <button
                onClick={() => { setFilterType(''); setFilterMember(''); setPage(1); }}
                className="text-xs text-red-500 hover:text-red-700 font-bold"
              >
                ✕ Effacer filtres
              </button>
            )}

            <span className="ml-auto text-xs text-gray-400 font-medium">
              {meta?.total ?? 0} transactions
            </span>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs font-bold text-gray-500 uppercase tracking-wide">
                <tr>
                  <th className="px-5 py-3.5 text-left">Date</th>
                  <th className="px-5 py-3.5 text-left">Membre</th>
                  <th className="px-5 py-3.5 text-left">Type</th>
                  <th className="px-5 py-3.5 text-left">Description</th>
                  <th className="px-5 py-3.5 text-right">Montant (USD)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {txLoading ? (
                  [...Array(6)].map((_, i) => (
                    <tr key={i}>
                      <td colSpan={5} className="px-5 py-3">
                        <div className="skeleton h-5 rounded w-full" />
                      </td>
                    </tr>
                  ))
                ) : transactions.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-16 text-center text-gray-400">
                      <Wallet size={36} className="mx-auto mb-2 opacity-30" />
                      <p className="font-medium">Aucune transaction trouvée.</p>
                      <p className="text-xs mt-1">Les transactions apparaissent lors des validations de commissions.</p>
                    </td>
                  </tr>
                ) : (
                  transactions.map((t: any) => {
                    const config = TRANSACTION_TYPE_CONFIG[t.type] ?? {
                      label: t.type,
                      color: 'text-gray-600 bg-gray-100 border-gray-200',
                      icon: null,
                      positive: true,
                    };
                    return (
                      <tr key={t.id} className="hover:bg-blue-50/30 transition-colors">
                        <td className="px-5 py-3.5 text-xs text-gray-500 whitespace-nowrap">
                          {formatDate(t.createdAt)}
                        </td>
                        <td className="px-5 py-3.5 font-semibold text-gray-900">
                          {t.membre ? `${t.membre.prenom} ${t.membre.nom}` : '—'}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full border ${config.color}`}>
                            {config.icon} {config.label}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-gray-600 text-xs max-w-64 truncate">
                          {t.description || '—'}
                        </td>
                        <td className="px-5 py-3.5 text-right font-mono font-bold whitespace-nowrap">
                          <span className={config.positive ? 'text-emerald-600' : 'text-red-600'}>
                            {config.positive ? '+' : '-'} {formatUSD(t.montant)}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {meta && meta.totalPages > 1 && (
            <div className="px-5 py-3 border-t border-gray-100">
              <Pagination
                page={page}
                totalPages={meta.totalPages}
                total={meta.total}
                onPageChange={setPage}
                isLoading={txLoading}
              />
            </div>
          )}
        </div>
      )}

      {/* Wallets Tab — Soldes par membre */}
      {activeTab === 'wallets' && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-bold text-gray-900">Soldes des portefeuilles par membre</h2>
          </div>

          {membersLoading || memberWalletQueries.isLoading ? (
            <div className="p-8 space-y-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="skeleton h-14 rounded-xl w-full" />
              ))}
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {wallets
                .sort((a: any, b: any) => (b.soldeDisponible ?? 0) - (a.soldeDisponible ?? 0))
                .map((w: any) => {
                  const member = members.find((m: any) => m.id === w.membreId);
                  return (
                    <div key={w.id} className="px-5 py-4 flex flex-wrap items-center gap-4 hover:bg-gray-50 transition-colors">
                      {/* Avatar */}
                      <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm flex-shrink-0">
                        {w.membre?.client?.prenom?.[0]}{w.membre?.client?.nom?.[0]}
                      </div>

                      {/* Member info */}
                      <div className="min-w-0 flex-1">
                        <Link
                          to={`/mlm/members/${w.membreId}`}
                          className="font-bold text-gray-900 hover:text-blue-600 transition-colors flex items-center gap-1 text-sm"
                        >
                          {w.membre?.client?.prenom} {w.membre?.client?.nom}
                          <ExternalLink size={12} className="opacity-40" />
                        </Link>
                        <p className="text-xs text-gray-400 font-mono">
                          {member?.matricule} • {w.membre?.level?.nom ?? '—'}
                        </p>
                      </div>

                      {/* Balances */}
                      <div className="flex items-center gap-6 flex-shrink-0">
                        <div className="text-right">
                          <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wide">Solde disponible</p>
                          <p className="text-lg font-extrabold text-emerald-700">
                            {formatUSD(w.soldeDisponible ?? 0)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wide">Total gagné</p>
                          <p className="text-sm font-bold text-gray-700">
                            {formatUSD(w.totalGagne ?? 0)}
                          </p>
                        </div>
                        <button
                          onClick={() => { setFilterMember(w.membreId); setActiveTab('transactions'); }}
                          className="btn btn-outline btn-sm text-xs"
                        >
                          Transactions
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}