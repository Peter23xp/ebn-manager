import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, ArrowLeft, Eye, Network, Award } from 'lucide-react';
import { useMlmMembers, useMlmConfig } from '@/hooks/useMlm';
import { MlmLevelBadge } from '@/components/mlm/MlmLevelBadge';
import { Pagination } from '@/components/ui/Pagination';
import { formatDate, formatUSD } from '@/lib/utils';

export default function MlmMembersPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [levelId, setLevelId] = useState<number | undefined>(undefined);

  const { data, isLoading } = useMlmMembers({ page, limit: 20, search, levelId });
  const { data: configLevels } = useMlmConfig();

  const members = data?.membres ?? [];
  const meta = data?.meta;

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/mlm')}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-white text-text-muted hover:border-primary-accent hover:text-primary-accent transition-colors duration-150"
            aria-label="Retour au réseau"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-page-title text-primary">Membres MLM</h1>
            <p className="text-xs text-text-muted mt-0.5">Liste de tous les membres et leur niveau de carrière</p>
          </div>
        </div>

        {/* Quick action buttons */}
        <div className="flex items-center gap-2">
          <Link
            to="/mlm/levels"
            className="btn-secondary flex items-center gap-1.5 text-[13px]"
          >
            <Award size={14} className="text-warning" /> 8 Niveaux
          </Link>
          <Link
            to="/mlm/tree"
            className="btn-secondary flex items-center gap-1.5 text-[13px]"
          >
            <Network size={14} className="text-primary-accent" /> Arbre MLM
          </Link>
        </div>
      </div>

      {/* Filters bar */}
      <div className="rounded-xl border border-border bg-bg-card shadow-card p-4 flex flex-wrap gap-4 items-center justify-between">
        {/* Search */}
        <div className="relative flex-1 min-w-64 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle" />
          <input
            type="text"
            placeholder="Rechercher par nom, téléphone, matricule..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-9"
          />
        </div>

        {/* Level filter */}
        <div className="flex items-center gap-2">
          <select
            value={levelId ?? 0}
            onChange={(e) => {
              const val = Number(e.target.value);
              setLevelId(val === 0 ? undefined : val);
              setPage(1);
            }}
            className="min-w-48"
            aria-label="Filtrer par niveau"
          >
            <option value={0}>Tous les niveaux</option>
            {configLevels?.map((l: any) => (
              <option key={l.id} value={l.id}>
                {l.ordre}. {l.nom}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-bg-card shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="px-6 py-3.5">Membre</th>
                <th className="px-6 py-3.5">Matricule</th>
                <th className="px-6 py-3.5">Parrain</th>
                <th className="px-6 py-3.5">Niveau</th>
                <th className="px-6 py-3.5">Filleuls</th>
                <th className="px-6 py-3.5">Gains USD</th>
                <th className="px-6 py-3.5">Activation</th>
                <th className="px-6 py-3.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [...Array(6)].map((_, i) => (
                  <tr key={i}>
                    <td colSpan={8} className="px-6 py-4">
                      <div className="skeleton h-6 rounded w-full" />
                    </td>
                  </tr>
                ))
              ) : members.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-text-muted">
                    Aucun membre trouvé.
                  </td>
                </tr>
              ) : (
                members.map((m: any) => (
                  <tr key={m.id} className="hover:bg-blue-50/40 transition-colors">
                    <td className="px-6 py-4">
                      <Link
                        to={`/clients/${m.client.id}`}
                        className="font-semibold text-primary-accent hover:underline"
                      >
                        {m.client.prenom} {m.client.nom}
                      </Link>
                      <p className="text-xs text-text-muted font-mono mt-0.5">{m.client.telephone}</p>
                    </td>
                    <td className="px-6 py-4 font-mono text-xs font-semibold text-text">
                      {m.matricule}
                    </td>
                    <td className="px-6 py-4">
                      {m.parrain ? (
                        <div>
                          <p className="text-xs font-semibold text-text">
                            {m.parrain.client?.prenom} {m.parrain.client?.nom}
                          </p>
                          <p className="text-[11px] text-text-muted font-mono">{m.parrain.matricule}</p>
                        </div>
                      ) : (
                        <span className="text-xs text-text-subtle italic">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <MlmLevelBadge
                        level={m.level.ordre}
                        size="sm"
                      />
                    </td>
                    <td className="px-6 py-4 font-semibold text-text">
                      {m.nbFilleuls}
                    </td>
                    <td className="px-6 py-4 font-mono text-xs font-bold text-success">
                      {m.portefeuille ? formatUSD(m.portefeuille.totalGagne) : '—'}
                    </td>
                    <td className="px-6 py-4 text-xs text-text-muted">
                      {formatDate(m.dateActivation)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link
                        to={`/mlm/members/${m.id}`}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-primary-accent hover:text-blue-700"
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
          <div className="px-6 py-3 border-t border-border">
            <Pagination
              page={page}
              totalPages={meta.totalPages}
              total={meta.total}
              onPageChange={setPage}
              isLoading={isLoading}
            />
          </div>
        )}
      </div>
    </div>
  );
}