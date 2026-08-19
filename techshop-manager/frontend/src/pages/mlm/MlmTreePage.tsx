import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Network,
  ChevronDown,
  ChevronRight,
  Users,
  User,
  ExternalLink,
  Award,
  RefreshCw,
} from 'lucide-react';
import { useMlmMembers } from '@/hooks/useMlm';
import { useQuery } from '@tanstack/react-query';
import { MlmApi } from '@/lib/mlm.api';
import { formatDate, cn } from '@/lib/utils';
import { MlmLevelBadge } from '@/components/mlm/MlmLevelBadge';

export default function MlmTreePage() {
  const navigate = useNavigate();
  const [selectedMemberId, setSelectedMemberId] = useState<string>('');
  const [depth, setDepth] = useState<number>(3);
  const [searchMember, setSearchMember] = useState<string>('');

  const { data: membersData, isLoading: isLoadingMembers, refetch: refetchMembers } = useMlmMembers({ limit: 100 });

  const membersList = membersData?.membres ?? [];

  // Auto-select first member when data arrives if none selected
  useEffect(() => {
    if (!selectedMemberId && membersList.length > 0) {
      setSelectedMemberId(membersList[0].id);
    }
  }, [membersList, selectedMemberId]);

  const {
    data: tree,
    isLoading: isLoadingTree,
    error: treeError,
    refetch: refetchTree,
  } = useQuery({
    queryKey: ['mlm-tree', selectedMemberId, depth],
    queryFn: () => MlmApi.getNetworkTree(selectedMemberId, depth),
    enabled: !!selectedMemberId,
  });

  const filteredMembers = membersList.filter((m: any) => {
    if (!searchMember) return true;
    const term = searchMember.toLowerCase();
    const fullName = `${m.client?.prenom ?? ''} ${m.client?.nom ?? ''}`.toLowerCase();
    const matricule = (m.matricule ?? '').toLowerCase();
    return fullName.includes(term) || matricule.includes(term);
  });

  const selectedMember = membersList.find((m: any) => m.id === selectedMemberId);

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/mlm')}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-white text-text-muted hover:border-primary-accent hover:text-primary-accent transition-colors duration-150"
            aria-label="Retour"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-page-title text-primary">Arbre MLM & parrainage</h1>
            <p className="text-xs text-text-muted mt-0.5">
              Visualisation hiérarchique de l'arbre généalogique et de la progression des filleuls
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/mlm/levels"
            className="btn-secondary flex items-center gap-1.5 text-[13px]"
          >
            <Award size={14} className="text-warning" /> 8 Niveaux
          </Link>
          <Link
            to="/mlm/members"
            className="btn-secondary flex items-center gap-1.5 text-[13px]"
          >
            <Users size={14} /> Liste membres
          </Link>
        </div>
      </div>

      {/* Selector & Filter Card */}
      <div className="rounded-xl border border-border bg-bg-card shadow-card p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          {/* Member Dropdown */}
          <div className="md:col-span-2 space-y-1.5">
            <label className="form-label">Sélectionner le membre racine</label>
            <div className="flex gap-2">
              <select
                value={selectedMemberId}
                onChange={(e) => setSelectedMemberId(e.target.value)}
                disabled={isLoadingMembers}
              >
                <option value="">— Choisir un membre ({membersList.length} disponibles) —</option>
                {filteredMembers.map((m: any) => (
                  <option key={m.id} value={m.id}>
                    {m.client?.prenom} {m.client?.nom} — {m.matricule} ({m.level?.nom} • Niv {m.level?.ordre})
                  </option>
                ))}
              </select>

              <button
                onClick={() => { refetchMembers(); refetchTree(); }}
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-border bg-white text-text-muted hover:border-primary-accent hover:text-primary-accent transition-colors duration-150"
                title="Actualiser"
                aria-label="Actualiser"
              >
                <RefreshCw size={16} className={isLoadingTree ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          {/* Depth Selector */}
          <div className="space-y-1.5">
            <label className="form-label">Profondeur de l'arbre</label>
            <div className="period-toggle" role="group" aria-label="Profondeur">
              {[1, 2, 3, 4, 5].map((d) => (
                <button
                  key={d}
                  onClick={() => setDepth(d)}
                  className={`period-btn ${depth === d ? 'active' : ''}`}
                >
                  {d} niv
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Quick select chips for root/leaders */}
        {membersList.length > 0 && (
          <div className="pt-3 border-t border-border flex flex-wrap items-center gap-2">
            <span className="text-xs text-text-muted font-semibold">Accès direct :</span>
            {membersList.slice(0, 5).map((m: any) => (
              <button
                key={m.id}
                onClick={() => setSelectedMemberId(m.id)}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors duration-150 flex items-center gap-1.5 ${
                  selectedMemberId === m.id
                    ? 'bg-primary-light text-primary-accent ring-2 ring-primary-accent/40'
                    : 'bg-bg text-text-muted hover:bg-bg-inset'
                }`}
              >
                <span>{m.client?.prenom} {m.client?.nom}</span>
                <span className="text-[10px] opacity-70">({m.level?.nom})</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Selected Member Hero Card */}
      {selectedMember && (
        <div className="rounded-xl border border-border bg-bg-card shadow-card p-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-light text-primary-accent font-bold text-lg">
              {selectedMember.client?.prenom?.[0]}{selectedMember.client?.nom?.[0]}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold text-text">
                  {selectedMember.client?.prenom} {selectedMember.client?.nom}
                </h3>
                <MlmLevelBadge level={selectedMember.level?.ordre ?? 1} size="sm" />
              </div>
              <p className="text-xs text-text-muted font-mono mt-0.5">
                Matricule : <strong className="text-text">{selectedMember.matricule}</strong> • Statut : {selectedMember.statut}
              </p>
            </div>
          </div>

          <Link
            to={`/mlm/members/${selectedMember.id}`}
            className="btn-secondary flex items-center gap-1.5 text-[13px]"
          >
            Voir la progression <ExternalLink size={13} />
          </Link>
        </div>
      )}

      {/* Tree Visualization Container */}
      <div className="rounded-xl border border-border bg-bg-card shadow-card p-6 overflow-x-auto min-h-96">
        {!selectedMemberId ? (
          <div className="text-center py-20 text-text-muted">
            <Users size={48} className="mx-auto mb-3 opacity-30" />
            <p className="font-semibold text-base">Sélectionnez un membre pour afficher son arbre de parrainage</p>
            <p className="text-xs text-text-subtle mt-1">Utilisez le sélecteur ci-dessus ou les accès directs.</p>
          </div>
        ) : isLoadingTree ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="skeleton w-64 h-40 rounded-xl" />
            <p className="text-sm font-semibold text-text-muted">Chargement de la hiérarchie MLM...</p>
          </div>
        ) : treeError ? (
          <div className="text-center py-16 text-danger space-y-3">
            <p className="font-semibold">Erreur lors de la récupération de l'arbre MLM.</p>
            <button onClick={() => refetchTree()} className="btn-secondary btn text-[13px]">
              Réessayer
            </button>
          </div>
        ) : tree ? (
          <div className="min-w-max pb-4">
            <TreeNode node={tree} isRoot depthLevel={0} />
          </div>
        ) : (
          <div className="text-center py-20 text-text-muted">
            <p>Aucune donnée disponible pour ce membre.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tree Node Component (Recursive) ──────────────────────────────────────────

function TreeNode({
  node,
  isRoot = false,
  depthLevel = 0,
}: {
  node: any;
  isRoot?: boolean;
  depthLevel?: number;
}) {
  const [expanded, setExpanded] = useState<boolean>(true);
  const children = node.children ?? [];
  const hasChildren = children.length > 0;
  const levelOrdre = node.level?.ordre ?? 1;

  return (
    <div className="relative">
      <div className={`flex flex-col ${isRoot ? '' : 'ml-8 mt-3'}`}>
        {/* Node Card */}
        <div
          className={cn(
            'inline-flex flex-col rounded-xl border p-4 min-w-64 max-w-72 bg-bg-card transition-shadow duration-150 hover:shadow-card',
            isRoot ? 'border-primary-accent ring-2 ring-primary-light' : 'border-border shadow-card'
          )}
        >
          {/* Header with Level Badge & Root Indicator */}
          <div className="flex items-center justify-between mb-2">
            <MlmLevelBadge level={levelOrdre} size="xs" />
            {isRoot ? (
              <span className="text-[11px] bg-primary-accent text-white px-2 py-0.5 rounded-full font-bold">
                Racine
              </span>
            ) : (
              <span className="text-[11px] text-text-muted font-bold">
                Niveau {levelOrdre}
              </span>
            )}
          </div>

          {/* Member Name */}
          <Link
            to={`/mlm/members/${node.id}`}
            className="font-bold text-text text-sm hover:text-primary-accent transition-colors flex items-center justify-between group"
          >
            <span className="truncate">{node.client?.prenom} {node.client?.nom}</span>
            <ChevronRight size={14} className="text-text-subtle group-hover:text-primary-accent flex-shrink-0 ml-1" />
          </Link>
          <span className="text-xs text-text-muted font-mono mt-0.5">{node.matricule}</span>

          {/* Filleuls Progress Gauge (4 positions per level) */}
          {node.progression && (
            <div className="mt-2.5 rounded-lg px-3 py-2 border border-border bg-bg">
              <div className="flex justify-between text-[11px] font-bold text-text-muted mb-1">
                <span>Matrice 4 positions</span>
                <span className="text-primary-accent font-extrabold">
                  {node.progression.filleulsValides} / {node.progression.filleulsRequis ?? 4}
                </span>
              </div>
              <div className="w-full bg-bg-inset rounded-full h-1.5">
                <div
                  className="bg-primary-accent h-1.5 rounded-full transition-all duration-300 ease-out-quart"
                  style={{
                    width: `${Math.min(100, (node.progression.filleulsValides / (node.progression.filleulsRequis ?? 4)) * 100)}%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* Card Footer: Status & Direct Filleuls Count */}
          <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-border text-xs">
            <span className={`font-bold ${node.statut === 'ACTIF' ? 'text-success' : 'text-text-subtle'}`}>
              ● {node.statut}
            </span>
            <span className="text-text-muted font-medium">
              {children.length} filleul{children.length > 1 ? 's' : ''} direct{children.length > 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* Expandable Children Tree */}
        {hasChildren && (
          <div className="relative mt-1">
            {/* Vertical connector line */}
            <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-bg-inset" />

            {/* Toggle button */}
            <button
              onClick={() => setExpanded((v) => !v)}
              className="ml-2 my-1.5 inline-flex items-center gap-1 text-xs font-bold text-primary-accent hover:text-blue-700 bg-primary-light/40 hover:bg-primary-light px-2.5 py-1 rounded-lg transition-colors duration-150"
            >
              {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              {expanded ? 'Masquer' : 'Afficher'} {children.length} branche{children.length > 1 ? 's' : ''}
            </button>

            {expanded && (
              <div className="border-l border-border ml-4 pl-3 space-y-2">
                {children.map((child: any) => (
                  <TreeNode
                    key={child.id}
                    node={child}
                    depthLevel={depthLevel + 1}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* No children indicator for non-root */}
        {!hasChildren && !isRoot && (
          <div className="ml-8 mt-1.5 flex items-center gap-1.5 text-xs text-text-subtle italic">
            <User size={12} />
            Aucun filleul sous ce membre
          </div>
        )}
      </div>
    </div>
  );
}