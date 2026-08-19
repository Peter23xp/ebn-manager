import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, ArrowLeft, Eye, ChevronRight } from 'lucide-react';
import { useMlmMembers } from '@/hooks/useMlm';
import { MlmLevelBadge } from '@/components/mlm/MlmLevelBadge';
import { formatDate, formatUSD } from '@/lib/utils';

export default function MlmMembersPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [levelId, setLevelId] = useState<number | undefined>(undefined);

  const { data, isLoading } = useMlmMembers({ page, limit: 20, search, levelId });

  const members = data?.membres ?? [];
  const meta = data?.meta;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/mlm')}
            className="btn btn-ghost p-2 text-gray-500 hover:text-gray-900"
            aria-label="Retour au réseau"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Membres MLM</h1>
            <p className="text-sm text-gray-500">Liste de tous les membres et leur niveau de carrière</p>
          </div>
        </div>

        {/* Search */}
        <div className="relative w-72">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Rechercher par nom, téléphone..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="input pl-9 w-full text-sm"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="px-6 py-3.5">Membre</th>
                <th className="px-6 py-3.5">Matricule</th>
                <th className="px-6 py-3.5">Niveau de Carrière</th>
                <th className="px-6 py-3.5">Filleuls</th>
                <th className="px-6 py-3.5">Gains USD</th>
                <th className="px-6 py-3.5">Activation</th>
                <th className="px-6 py-3.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                [...Array(6)].map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={7} className="px-6 py-4">
                      <div className="h-4 bg-gray-200 rounded w-full" />
                    </td>
                  </tr>
                ))
              ) : members.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                    Aucun membre trouvé.
                  </td>
                </tr>
              ) : (
                members.map((m: any) => (
                  <tr key={m.id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="px-6 py-4">
                      <Link
                        to={`/clients/${m.client.id}`}
                        className="font-semibold text-blue-600 hover:underline"
                      >
                        {m.client.prenom} {m.client.nom}
                      </Link>
                      <p className="text-xs text-gray-400 font-mono mt-0.5">{m.client.telephone}</p>
                    </td>
                    <td className="px-6 py-4 font-mono text-xs font-semibold text-gray-700">
                      {m.matricule}
                    </td>
                    <td className="px-6 py-4">
                      <MlmLevelBadge
                        level={m.level.ordre}
                        size="sm"
                      />
                    </td>
                    <td className="px-6 py-4 font-semibold text-gray-900">
                      {m.nbFilleuls}
                    </td>
                    <td className="px-6 py-4 font-mono text-xs font-bold text-green-700">
                      {m.portefeuille ? formatUSD(m.portefeuille.totalGagne) : '—'}
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-500">
                      {formatDate(m.dateActivation)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link
                        to={`/mlm/members/${m.id}`}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800"
                      >
                        <Eye size={14} />
                        Progression
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {meta && meta.totalPages > 1 && (
          <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
            <span>
              Affichage page {meta.page} sur {meta.totalPages} ({meta.total} membres)
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
