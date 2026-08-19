import React, { useState } from 'react';
import { Wallet, ArrowDownRight, ArrowUpRight, Filter } from 'lucide-react';
import { useWalletTransactions } from '@/hooks/useMlm';
import { formatDate, formatUSD } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';

export default function WalletPage() {
  const { user } = useAuthStore();
  const [page, setPage] = useState(1);
  const [type, setType] = useState<string>('');

  const { data, isLoading } = useWalletTransactions({ page, limit: 20, type: type || undefined });

  const transactions = (data as any)?.transactions ?? (data as any)?.data ?? [];
  const meta = data?.meta;

  const TRANSACTION_TYPE_LABELS: Record<string, { label: string; color: string }> = {
    COMMISSION: { label: 'Commission', color: 'bg-green-100 text-green-800' },
    PROMOTION: { label: 'Promotion', color: 'bg-blue-100 text-blue-800' },
    SALAIRE: { label: 'Salaire Mensuel', color: 'bg-purple-100 text-purple-800' },
    BONUS_RETRAITE: { label: 'Bonus Retraite', color: 'bg-amber-100 text-amber-800' },
    DEBIT: { label: 'Débit / Retrait', color: 'bg-red-100 text-red-800' },
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Wallet size={24} className="text-blue-600" />
            Portefeuille MLM
          </h1>
          <p className="text-sm text-gray-500">Journal des transactions et commissions en USD</p>
        </div>

        {/* Filter by type */}
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-gray-400" />
          <select
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setPage(1);
            }}
            className="input text-sm py-1.5"
          >
            <option value="">Tous les types</option>
            <option value="COMMISSION">Commission</option>
            <option value="PROMOTION">Promotion</option>
            <option value="SALAIRE">Salaire</option>
            <option value="BONUS_RETRAITE">Bonus Retraite</option>
            <option value="DEBIT">Débit</option>
          </select>
        </div>
      </div>

      {/* Transactions table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">Historique des Transactions</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="px-6 py-3.5">Date</th>
                <th className="px-6 py-3.5">Membre</th>
                <th className="px-6 py-3.5">Type</th>
                <th className="px-6 py-3.5">Description</th>
                <th className="px-6 py-3.5 text-right">Montant (USD)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={5} className="px-6 py-4">
                      <div className="h-4 bg-gray-200 rounded w-full" />
                    </td>
                  </tr>
                ))
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                    Aucune transaction trouvée.
                  </td>
                </tr>
              ) : (
                transactions.map((t: any) => {
                  const badge = TRANSACTION_TYPE_LABELS[t.type] ?? {
                    label: t.type,
                    color: 'bg-gray-100 text-gray-800',
                  };
                  const isPositive = t.type !== 'DEBIT';

                  return (
                    <tr key={t.id} className="hover:bg-gray-50/80 transition-colors">
                      <td className="px-6 py-4 text-xs text-gray-500 whitespace-nowrap">
                        {formatDate(t.createdAt)}
                      </td>
                      <td className="px-6 py-4 font-semibold text-gray-900">
                        {t.membre ? `${t.membre.prenom} ${t.membre.nom}` : '—'}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${badge.color}`}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-700">{t.description}</td>
                      <td className="px-6 py-4 text-right font-mono font-bold whitespace-nowrap">
                        <span className={isPositive ? 'text-green-700' : 'text-red-700'}>
                          {isPositive ? '+' : '-'} {formatUSD(t.montant)}
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
          <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
            <span>
              Affichage page {meta.page} sur {meta.totalPages} ({meta.total} transactions)
            </span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="btn btn-outline btn-xs"
              >
                Précédent
              </button>
              <button
                disabled={page >= meta.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="btn btn-outline btn-xs"
              >
                Suivant
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
