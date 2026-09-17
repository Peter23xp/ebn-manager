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
import { useDebounce } from '@/hooks/useDebounce';
import { Pagination } from '@/components/ui/Pagination';
import { useQuery } from '@tanstack/react-query';
import { MlmApi } from '@/lib/mlm.api';
import { formatDate, cn } from '@/lib/utils';
import { MlmLevelBadge } from '@/components/mlm/MlmLevelBadge';
import { GenerationProgress } from '@/components/mlm/GenerationProgress';
import { MatrixMemberDetails } from '@/components/mlm/MatrixMemberDetails';
import type { MatrixTreeNode } from '@/types/mlm';

type RootMember = Pick<MatrixTreeNode, 'id' | 'client' | 'matricule' | 'statut'>;

export default function MlmTreePage() {
  const navigate = useNavigate();
  const [selectedMember, setSelectedMember] = useState<RootMember | null>(null);
  const selectedMemberId = selectedMember?.id ?? '';
  const [depth, setDepth] = useState<number>(3);
  const [searchMember, setSearchMember] = useState<string>('');
  const search = useDebounce(searchMember.trim());
  const [pagination, setPagination] = useState({ search: '', page: 1 });
  const page = pagination.search === search ? pagination.page : 1;
  useEffect(() => { setPagination({ search, page: 1 }); }, [search]);
  const [detailNode, setDetailNode] = useState<MatrixTreeNode | null>(null);

  const { data: membersData, isFetching: isFetchingMembers, isError: membersError, refetch: refetchMembers } = useMlmMembers({ search, page, limit: 20 });

  const membersList: RootMember[] = membersData?.membres ?? [];
  const searching = isFetchingMembers || search !== searchMember.trim();
  const rootOptions = selectedMember && !membersList.some(member => member.id === selectedMemberId)
    ? [selectedMember, ...membersList] : membersList;
  const selectMember = (member: RootMember | null) => { setSelectedMember(member); setDetailNode(null); };

  // Auto-select first member when data arrives if none selected
  useEffect(() => {
    if (!selectedMemberId && membersList.length > 0) {
      setSelectedMember(membersList[0]);
    }
  }, [membersList, selectedMemberId]);

  const {
    data: tree,
    isLoading: isLoadingTree,
    error: treeError,
    refetch: refetchTree,
    dataUpdatedAt,
  } = useQuery({
    queryKey: ['mlm-tree', selectedMemberId, depth],
    queryFn: () => MlmApi.getNetworkTree(selectedMemberId, depth),
    enabled: !!selectedMemberId,
  });

  const snapshot = `${selectedMemberId}-${depth}-${dataUpdatedAt}`;

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
              Placements matriciels, générations et recruteurs personnels distincts
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
        <label className="form-label" htmlFor="mlm-root-search">Rechercher un membre par nom ou matricule</label>
        <input id="mlm-root-search" type="search" value={searchMember} onChange={event => setSearchMember(event.target.value)} placeholder="Nom ou matricule" />
        {searching && <p role="status" className="text-sm text-text-muted">Recherche des membres…</p>}
        {membersError && <p role="alert" className="text-sm text-danger">Recherche des membres indisponible. <button className="btn-secondary" onClick={() => refetchMembers()}>Réessayer la recherche</button></p>}
        {!searching && !membersError && membersList.length === 0 && <p role="status" className="text-sm text-text-muted">Aucun membre ne correspond à cette recherche.</p>}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          {/* Member Dropdown */}
          <div className="md:col-span-2 space-y-1.5">
            <label className="form-label" htmlFor="mlm-tree-root">Sélectionner le membre racine</label>
            <div className="flex gap-2">
              <select
                id="mlm-tree-root"
                value={selectedMemberId}
                onChange={event => selectMember(rootOptions.find(member => member.id === event.target.value) ?? null)}
                disabled={searching}
              >
                <option value="">— Choisir un membre ({membersList.length} disponibles) —</option>
                {rootOptions.map(member => (
                  <option key={member.id} value={member.id}>
                    {member.client?.prenom} {member.client?.nom} — {member.matricule}
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
              {[1, 2, 3].map((d) => (
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
        {membersData?.meta && <Pagination page={membersData.meta.page} totalPages={membersData.meta.totalPages} total={membersData.meta.total} onPageChange={nextPage => setPagination({ search, page: nextPage })} isLoading={searching} />}

        {/* Quick select chips for root/leaders */}
        {membersList.length > 0 && (
          <div className="pt-3 border-t border-border flex flex-wrap items-center gap-2">
            <span className="text-xs text-text-muted font-semibold">Accès direct :</span>
            {membersList.slice(0, 5).map((m: any) => (
              <button
                key={m.id}
                onClick={() => selectMember(m)}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors duration-150 flex items-center gap-1.5 ${
                  selectedMemberId === m.id
                    ? 'bg-primary-light text-primary-accent ring-2 ring-primary-accent/40'
                    : 'bg-bg text-text-muted hover:bg-bg-inset'
                }`}
              >
                <span>{m.client?.prenom} {m.client?.nom}</span>
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
                {tree && <MlmLevelBadge level={tree.level?.ordre ?? null} name={tree.level?.nom} size="sm" />}
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
            <TreeNode key={snapshot} snapshot={snapshot} node={tree} isRoot depthLevel={0} onDetails={setDetailNode} />
          </div>
        ) : (
          <div className="text-center py-20 text-text-muted">
            <p>Aucune donnée disponible pour ce membre.</p>
          </div>
        )}
      </div>
      {detailNode && <MatrixMemberDetails key={detailNode.id} node={detailNode} />}
    </div>
  );
}

// ── Tree Node Component (Recursive) ──────────────────────────────────────────

function TreeNode({
  node,
  isRoot = false,
  depthLevel = 0,
  onDetails,
  snapshot,
}: {
  node: MatrixTreeNode;
  isRoot?: boolean;
  depthLevel?: number;
  onDetails: (node: MatrixTreeNode) => void;
  snapshot: string;
}) {
  const [expanded, setExpanded] = useState<boolean>(true);
  const [loadChildren, setLoadChildren] = useState(false);
  const branch = useQuery({ queryKey: ['mlm-tree-branch', node.id, snapshot], queryFn: () => MlmApi.getNetworkTree(node.id, 1), enabled: loadChildren });
  const current = (loadChildren && branch.data) || node;
  const children = current.children ?? [];
  const hasChildren = children.length > 0;
  const levelOrdre = current.level?.ordre ?? null;

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
                Génération {depthLevel}
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
          {current.progression && (
            <div className="mt-2.5 rounded-lg px-3 py-2 border border-border bg-bg">
              <GenerationProgress progression={current.progression} />
            </div>
          )}

          {/* Card Footer: Status & Direct Filleuls Count */}
          <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-border text-xs">
            <span className={`font-bold ${node.statut === 'ACTIF' ? 'text-success' : 'text-text-subtle'}`}>
              ● {node.statut}
            </span>
            <span className="text-text-muted font-medium">
              {current.directMatrixChildrenCount} enfants matriciels
            </span>
          </div>
          {isRoot && <p className="text-xs text-text-muted">Génération 0</p>}
          <p className="text-xs text-text-muted mt-2">Places libres : {current.emptyPositions.join(', ') || 'Aucune'}</p>
          <button className="btn-secondary mt-3" onClick={() => onDetails({ ...current, generation: depthLevel })}>Détails de {current.client.prenom} {current.client.nom}</button>
          {current.hasMore && <button className="btn-secondary mt-2" disabled={branch.isFetching} onClick={() => { setLoadChildren(true); setExpanded(true); if (loadChildren) void branch.refetch(); }}>Charger les enfants de {current.client.prenom} {current.client.nom}</button>}
          {branch.isError && <p role="alert" className="text-sm text-danger">Chargement impossible. Réessayez avec le bouton de chargement.</p>}
        </div>

        {/* Expandable Children Tree */}
        {hasChildren && (
          <div className="relative mt-1">
            {/* Vertical connector line */}
            <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-bg-inset" />

            {/* Toggle button */}
            <button
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="ml-2 my-1.5 inline-flex items-center gap-1 text-xs font-bold text-primary-accent hover:text-blue-700 bg-primary-light/40 hover:bg-primary-light px-2.5 py-1 rounded-lg transition-colors duration-150"
            >
              {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              {expanded ? 'Masquer' : 'Afficher'} {children.length} branche{children.length > 1 ? 's' : ''}
            </button>

            {expanded && (
              <div className="border-l border-border ml-4 pl-3 space-y-2">
                {children.map((child) => (
                  <TreeNode
                    key={child.id}
                    node={child}
                    snapshot={snapshot}
                    depthLevel={depthLevel + 1}
                    onDetails={onDetails}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* No children indicator for non-root */}
        {!hasChildren && !current.hasMore && !isRoot && (
          <div className="ml-8 mt-1.5 flex items-center gap-1.5 text-xs text-text-subtle italic">
            <User size={12} />
            Aucun enfant matriciel
          </div>
        )}
      </div>
    </div>
  );
}
