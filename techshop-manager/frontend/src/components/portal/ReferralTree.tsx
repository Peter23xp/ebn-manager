import { useState } from 'react';
import { ChevronDown, ChevronUp, Network, UserRound } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { portalApi, type PortalFilleul } from '@/lib/portal.api';
import { useAuthStore } from '@/store/auth.store';
import type { MatrixTreeNode } from '@/types/mlm';
import { MatrixNetworkExplorer } from '@/components/mlm/MatrixNetworkExplorer';
import { NetworkNavigation, type NetworkTarget, type NetworkView } from '@/components/mlm/NetworkNavigation';
import { NetworkTree, TreeBranch } from '@/components/mlm/NetworkTree';

interface TreeNode {
  filleul: PortalFilleul;
  children: TreeNode[];
}

/**
 * Attache chaque filleul sous son parrain. Les membres dont le parrain est le
 * client lui-même (parrainId hors liste) deviennent racines de l'arbre.
 */
function buildForest(list: PortalFilleul[]): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  for (const f of list) byId.set(f.id, { filleul: f, children: [] });

  const roots: TreeNode[] = [];
  for (const node of byId.values()) {
    const parent = node.filleul.parrainId ? byId.get(node.filleul.parrainId) : undefined;
    if (parent && parent !== node) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

function countSubtree(node: TreeNode, seen = new Set<string>()): number {
  if (seen.has(node.filleul.id)) return 0;
  seen.add(node.filleul.id);
  let n = 0;
  for (const c of node.children) n += 1 + countSubtree(c, seen);
  return n;
}

function treeDepth(list: TreeNode[]): number {
  let max = 0;
  for (const t of list) max = Math.max(max, 1 + treeDepth(t.children));
  return max;
}


function Branch({ node, depth, onSelect, onExplore, focused = false, relative = false }: { node: TreeNode; depth: number; onSelect: (node: TreeNode, generation: number) => void; onExplore: (node: TreeNode) => void; focused?: boolean; relative?: boolean }) {
  const { filleul, children } = node;
  const [open, setOpen] = useState(depth < 2);
  const name = `${filleul.prenom} ${filleul.nom}`;
  const generation = relative ? depth : filleul.generation ?? depth + 1;
  return <TreeBranch data-testid={`tree-node-${filleul.id}`} data-parent={filleul.parrainId ?? ''} data-depth={depth}
    childrenLabel={`Recrutements de ${name}`} content={
      <div className="network-member">
        <button type="button" className="network-member-main" aria-label={`Détails de ${name}`} onClick={() => onSelect(node, generation)}>
          <span aria-hidden="true" className="network-avatar flex h-10 w-10 items-center justify-center rounded-full bg-primary-light text-primary-accent"><UserRound size={24} /></span>
          <p className="network-member-name" title={name}>{name}</p>
          <span className={`text-xs font-semibold ${filleul.statut === 'ACTIF' ? 'text-success' : filleul.statut === 'SUSPENDU' ? 'text-danger' : 'text-text-muted'}`}>{filleul.statut === 'ACTIF' ? 'Actif' : filleul.statut === 'EN_COURS' ? 'En cours' : 'Suspendu'}</span>
          <p className="text-xs text-text-muted">Génération {generation}</p>
          <p className="text-xs text-text-muted">Inscrit le {format(new Date(filleul.dateInscription), 'd MMM yyyy', { locale: fr })}</p>
          {children.length > 0 && <p className="text-xs text-text-muted"><span>{countSubtree(node)}</span> descendants</p>}
        </button>
        {children.length > 0 && <div className="network-member-actions">
          <button type="button" className="network-tool" aria-expanded={open} aria-label={`${open ? 'Replier' : 'Déplier'} la branche de ${name}`} onClick={() => setOpen(value => !value)}>
            {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}{children.length} filleuls
          </button>
        </div>}
        {!focused && <button type="button" className="network-tool w-full shrink-0 border-t border-border text-primary-accent" aria-label={`Voir l’arbre de ${name}`} onClick={() => onExplore(node)}><Network size={16} />Voir son arbre</button>}
      </div>
    }>
    {open ? children.map(child => <Branch key={child.filleul.id} node={child} depth={depth + 1} onSelect={onSelect} onExplore={onExplore} relative={relative} />) : null}
  </TreeBranch>;
}

interface ReferralTreeProps {
  matrixTree?: MatrixTreeNode | null;
  nodes: PortalFilleul[];
  total: number;
  isLoading: boolean;
  codeParrain?: string;
  snapshot?: string;
  initialMember?: NetworkTarget;
}

export function ReferralTree({ nodes, matrixTree, total, isLoading, codeParrain, snapshot, initialMember }: ReferralTreeProps) {
  const clientId = useAuthStore(state => state.user?.id);
  const [path, setPath] = useState<NetworkTarget[]>(initialMember ? [initialMember] : []);
  const [view, setView] = useState<NetworkView>('tree');
  const [selection, setSelection] = useState<{ id: string; generation: number } | null>(null);
  const selected = nodes.find(node => node.id === selection?.id);
  const recruiter = nodes.find(node => node.id === selected?.parrainId);
  if (isLoading) return <div className="space-y-3 p-4" role="status" aria-label="Chargement de l’arbre">
    {[1, 2, 3].map(index => <div key={index} className="h-10 animate-pulse motion-reduce:animate-none rounded-lg bg-bg-inset" />)}
  </div>;

  if (matrixTree) return <section className="min-w-0 space-y-3">
    <h2 className="text-section-title text-primary">Réseau matriciel</h2>
    <p className="text-sm text-text-muted">Le recruteur personnel peut différer du parent matriciel. Générations relatives à votre racine.</p>
    <MatrixNetworkExplorer key={`${clientId}-${matrixTree.id}-${initialMember?.id ?? ''}`} root={matrixTree} snapshot={snapshot} scope={`portal-${clientId}`} loadTree={portalApi.getNetworkTree} initialMember={initialMember} />
  </section>;

  if (nodes.length === 0) return <div className="rounded-xl border border-dashed border-border py-8 text-center">
    <p className="text-sm font-semibold text-text">Réseau de recrutement personnel</p>
    <p className="text-sm text-text-muted">Les placements matriciels ne sont pas fournis pour cette vue.</p>
    <p className="my-2 text-sm text-text-muted">Personne n'est encore inscrit avec votre matricule.</p>
    {codeParrain && <p className="text-sm font-semibold text-primary-accent">Partagez votre code {codeParrain} pour démarrer votre réseau !</p>}
  </div>;

  const roots = buildForest(nodes);
  const findNode = (branches: TreeNode[], id: string): TreeNode | undefined => {
    for (const node of branches) {
      if (node.filleul.id === id) return node;
      const found = findNode(node.children, id);
      if (found) return found;
    }
  };
  const focused = path.length ? findNode(roots, path[path.length - 1].id) : undefined;
  const explore = (node: TreeNode) => { setSelection(null); setPath(previous => [...previous, { id: node.filleul.id, name: `${node.filleul.prenom} ${node.filleul.nom}` }]); };
  const select = (node: TreeNode, generation: number) => setSelection({ id: node.filleul.id, generation });
  const maxDepth = treeDepth(roots);
  return <section className="min-w-0 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-section-title text-primary">Réseau de recrutement personnel</h2>
      <span className="text-xs text-text-muted">{nodes.length} membre{nodes.length > 1 ? 's' : ''} · {maxDepth} niveau{maxDepth > 1 ? 'x' : ''}</span>
    </div>
    <p className="text-sm text-text-muted">Les placements matriciels ne sont pas fournis pour cette vue.</p>
    <NetworkNavigation root={{ id: 'personal-root', name: 'mon réseau personnel' }} path={path} view={view} onView={setView} onBack={index => { setSelection(null); setPath(path.slice(0, index + 1)); }} />
    {path.length > 0 && !focused ? <p role="alert" className="text-sm text-text-muted">Ce membre n’est pas disponible dans cet aperçu. Revenez à votre arbre.</p> : <NetworkTree view={view} key={focused?.filleul.id ?? 'root'}>
      {focused ? <Branch node={focused} depth={0} focused relative onSelect={select} onExplore={explore} /> : <TreeBranch content={<div className="network-member" data-root="true">
        <div className="network-member-main">
          <span aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-accent text-white"><UserRound size={24} /></span>
          <p className="network-member-name">Vous</p>
          {codeParrain && <p className="text-xs text-text-muted">{codeParrain}</p>}
          <p className="text-xs text-text-muted">Racine du réseau personnel</p>
        </div>
      </div>} childrenLabel="Votre réseau de recrutement">
        {roots.map(root => <Branch key={root.filleul.id} node={root} depth={0} onSelect={select} onExplore={explore} />)}
      </TreeBranch>}
    </NetworkTree>}
    {selected && <section aria-label={`Détails de ${selected.prenom} ${selected.nom}`} className="space-y-3 border-t border-border pt-4 text-sm text-text">
      <h3 className="font-semibold">{selected.prenom} {selected.nom}</h3>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div><dt className="text-text-muted">ID</dt><dd className="break-all">{selected.id}</dd></div>
        <div><dt className="text-text-muted">Recruteur personnel</dt><dd>{recruiter ? `${recruiter.prenom} ${recruiter.nom}` : selected.parrainId ?? 'Vous'}</dd></div>
        <div><dt className="text-text-muted">Parent matriciel</dt><dd>Placement matriciel non fourni</dd></div>
        <div><dt className="text-text-muted">Génération</dt><dd>{selection?.generation}</dd></div>
        <div><dt className="text-text-muted">Statut</dt><dd>{selected.statut === 'ACTIF' ? 'Actif' : selected.statut === 'EN_COURS' ? 'En cours' : 'Suspendu'}</dd></div>
        <div><dt className="text-text-muted">Inscription</dt><dd>{format(new Date(selected.dateInscription), 'd MMM yyyy', { locale: fr })}</dd></div>
      </dl>
    </section>}
    {total > nodes.length && <p className="text-sm text-text-muted">Réseau volumineux : seuls les {nodes.length} premiers membres sont affichés dans l'arbre.</p>}
  </section>;
}
