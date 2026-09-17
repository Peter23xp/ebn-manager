import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Download, ExternalLink, Network, UserRound, UserRoundPlus } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { MatrixTreeNode } from '@/types/mlm';
import { NetworkTree, TreeBranch } from './NetworkTree';
import { MlmLevelBadge } from './MlmLevelBadge';
import { GenerationProgress } from './GenerationProgress';

interface MatrixNetworkTreeProps {
  root: MatrixTreeNode;
  snapshot?: string;
  loadBranch?: (memberId: string) => Promise<MatrixTreeNode>;
  onSelect?: (node: MatrixTreeNode) => void;
  onExplore?: (node: MatrixTreeNode) => void;
  view?: 'tree' | 'list';
  scope?: string;
}

export function MatrixNetworkTree({ root, snapshot = root.id, loadBranch, onSelect, onExplore, view = 'tree', scope = 'admin' }: MatrixNetworkTreeProps) {
  const queryClient = useQueryClient();
  const [, setBranchVersion] = useState(0);
  const onBranchChange = useCallback(() => setBranchVersion(value => value + 1), []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const resolve = (node: MatrixTreeNode) => {
    const state = queryClient.getQueryState<MatrixTreeNode>(['mlm-tree-branch', node.id, snapshot, scope]);
    return state?.status === 'error' && accessDenied(state.error) ? null : state?.data ?? node;
  };
  const selected = selectedId ? findMember(root, selectedId, 0, resolve) : null;
  const select = (node: MatrixTreeNode) => { setSelectedId(node.id); onSelect?.(node); };
  return <div className="min-w-0 space-y-4">
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-text-muted" aria-label="Légende de l’arbre">
      <span>Lignes : parent matriciel → enfants</span>
      <span>4 positions par membre</span>
      <span>Pointillés : place libre</span>
    </div>
    <NetworkTree view={view}>
      <MatrixBranch key={snapshot} node={root} generation={0} snapshot={snapshot} loadBranch={loadBranch} onSelect={select} selectedId={selectedId ?? undefined} showProfile={!!onSelect} onExplore={onExplore} scope={scope} onBranchChange={onBranchChange} />
    </NetworkTree>
    {!onSelect && selected && <section aria-label={`Détails de ${selected.client.prenom} ${selected.client.nom}`} className="space-y-4 border-t border-border pt-4 text-sm text-text">
      <h3 className="font-semibold">{selected.client.prenom} {selected.client.nom} — détails matriciels</h3>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div><dt className="text-text-muted">ID / Matricule</dt><dd className="break-all">{selected.id} · {selected.matricule}</dd></div>
        <div><dt className="text-text-muted">Recruteur personnel</dt><dd>{selected.recruiter ? `${selected.recruiter.client.prenom} ${selected.recruiter.client.nom}` : 'Aucun'}</dd></div>
        <div><dt className="text-text-muted">Parent matriciel</dt><dd>{selected.matrixParent ? `${selected.matrixParent.client.prenom} ${selected.matrixParent.client.nom}` : 'Racine'}</dd></div>
        <div><dt className="text-text-muted">Génération / Position</dt><dd>{selected.generation} / {selected.position ?? 'Racine'}</dd></div>
        <div><dt className="text-text-muted">Enfants matriciels / recrutements personnels / descendants</dt><dd>{selected.directMatrixChildrenCount} / {selected.personalRecruitCount} / {selected.totalDescendants}</dd></div>
        <div><dt className="text-text-muted">Places libres</dt><dd>{selected.emptyPositions.join(', ') || 'Aucune'}</dd></div>
      </dl>
      <MlmLevelBadge level={selected.level?.ordre ?? null} name={selected.level?.nom} />
      <GenerationProgress progression={selected.progression} />
    </section>}
  </div>;
}

function accessDenied(error: unknown) {
  return [403, 404].includes((error as { response?: { status?: number } })?.response?.status ?? 0);
}

function findMember(node: MatrixTreeNode, memberId: string, generation = 0, resolve: (node: MatrixTreeNode) => MatrixTreeNode | null = node => node): MatrixTreeNode | null {
  const current = resolve(node);
  if (!current) return null;
  if (current.id === memberId) return { ...current, generation };
  for (const child of current.children) {
    const found = findMember(child, memberId, generation + 1, resolve);
    if (found) return found;
  }
  return null;
}

function MatrixBranch({ node, generation, snapshot, loadBranch, onSelect, selectedId, showProfile, onExplore, scope, onBranchChange }: {
  node: MatrixTreeNode;
  generation: number;
  snapshot: string;
  loadBranch?: MatrixNetworkTreeProps['loadBranch'];
  onSelect: (node: MatrixTreeNode) => void;
  selectedId?: string;
  showProfile: boolean;
  onExplore?: MatrixNetworkTreeProps['onExplore'];
  scope: string;
  onBranchChange: () => void;
}) {
  const [expanded, setExpanded] = useState(generation < 2);
  const [requested, setRequested] = useState(false);
  const branch = useQuery({
    queryKey: ['mlm-tree-branch', node.id, snapshot, scope],
    queryFn: () => loadBranch!(node.id),
    enabled: requested && !!loadBranch,
  });
  useEffect(() => { if (requested) onBranchChange(); }, [requested, branch.data, branch.error, onBranchChange]);
  const current = requested && branch.data ? branch.data : node;
  const name = `${current.client.prenom} ${current.client.nom}`;
  const status = ({ ACTIF: 'Actif', EN_ATTENTE: 'En attente', EN_COURS: 'En cours', SUSPENDU: 'Suspendu', ARCHIVE: 'Archivé' } as Record<string, string>)[current.statut] ?? current.statut;

  if (branch.isError && accessDenied(branch.error)) return <TreeBranch content={<div role="alert" className="network-slot px-3 text-center">
    <p>Accès à cette branche refusé.</p>
    <button type="button" className="network-tool" onClick={() => branch.refetch()}>Réessayer la branche</button>
  </div>} />;

  return <TreeBranch data-member-id={node.id} childrenLabel={`Positions de ${name}`} content={
    <div className="network-member" data-root={generation === 0} data-selected={selectedId === node.id}>
      <button type="button" className="network-member-main" aria-label={`Détails de ${name}`} aria-pressed={selectedId === node.id} onClick={() => onSelect({ ...current, generation })}>
        <span className="sr-only">Détails de {name}</span>
        <span className={`network-avatar flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${generation === 0 ? 'bg-primary-accent text-white' : 'bg-primary-light text-primary-accent'}`} aria-hidden="true"><UserRound size={24} /></span>
        <span className="network-member-name" title={name}>{name}</span>
        <span className="network-matricule max-w-full truncate font-mono text-xs text-text-muted">{current.matricule}</span>
        <MlmLevelBadge className="network-rank" level={current.level?.ordre ?? null} name={current.level?.nom} size="sm" />
        <span className={`network-status text-xs font-semibold ${current.statut === 'ACTIF' ? 'text-success' : current.statut === 'SUSPENDU' ? 'text-danger' : 'text-text-muted'}`}>{status}</span>
        <span className="network-generation text-xs text-text-muted"><span>Génération {generation}</span> · {generation === 0 ? 'Racine' : `Place ${current.position ?? '—'}`}</span>
        <span className="network-count text-xs text-text-muted">{current.directMatrixChildrenCount} enfants matriciels</span>
        <span className="network-empty text-xs text-text-muted">Places libres : {current.emptyPositions.join(', ') || 'Aucune'}</span>
      </button>
      <div className="network-member-actions">
        <button type="button" className="network-tool" aria-expanded={expanded} aria-label={`${expanded ? 'Masquer' : 'Afficher'} les branches de ${name}`} onClick={() => setExpanded(value => !value)}>
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />} {expanded ? 'Replier' : '4 positions'}
        </button>
        {current.hasMore && loadBranch && <button type="button" className="network-tool" aria-label={`Charger les enfants de ${name}`} disabled={branch.isFetching} onClick={() => { setExpanded(true); setRequested(true); if (requested) void branch.refetch(); }}><Download size={16} />{branch.isFetching ? 'Chargement…' : branch.isError ? 'Réessayer' : 'Charger'}</button>}
        {showProfile && <Link className="network-tool" to={`/mlm/members/${node.id}`} aria-label={`Fiche membre de ${name}`} title="Ouvrir la fiche membre"><ExternalLink size={16} /></Link>}
      </div>
      {onExplore && generation > 0 && <button type="button" className="network-tool w-full shrink-0 border-t border-border text-primary-accent" aria-label={`Voir l’arbre de ${name}`} onClick={() => onExplore(current)}><Network size={16} />Voir son arbre</button>}
    </div>
  }>
    {expanded ? [1, 2, 3, 4].map(position => {
      const child = current.children.find(member => member.position === position);
      if (child) return <MatrixBranch key={child.id} node={child} generation={generation + 1} snapshot={snapshot} loadBranch={loadBranch} onSelect={onSelect} selectedId={selectedId} showProfile={showProfile} onExplore={onExplore} scope={scope} onBranchChange={onBranchChange} />;
      const available = current.emptyPositions.includes(position);
      return <TreeBranch key={`slot-${position}`} data-slot={position} content={<div className="network-slot" data-available={available}>
        <span className="text-xs font-semibold">Place {position} · G{generation + 1}</span>
        {available ? <UserRoundPlus size={24} aria-hidden="true" /> : <UserRound size={24} aria-hidden="true" />}
        <span className="font-semibold">{available ? 'Place libre' : 'Non chargé'}</span>
        {!available && <span className="px-3 text-center text-xs">{branch.isError ? <span role="alert">Chargement impossible. Réessayez.</span> : loadBranch ? 'Utilisez « Charger » sur le parent.' : 'Suite du réseau non chargée dans cet aperçu limité.'}</span>}
      </div>} />;
    }) : null}
  </TreeBranch>;
}
