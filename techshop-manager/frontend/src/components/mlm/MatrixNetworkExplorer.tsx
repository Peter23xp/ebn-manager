import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { MatrixTreeNode } from '@/types/mlm';
import { MatrixNetworkTree } from './MatrixNetworkTree';
import { NetworkNavigation, type NetworkTarget, type NetworkView } from './NetworkNavigation';

export function MatrixNetworkExplorer({ root, snapshot = root.id, scope, loadTree, onSelect, onNavigate, initialMember, depth = 2 }: {
  root: MatrixTreeNode;
  snapshot?: string;
  scope: string;
  loadTree: (memberId: string, depth: number) => Promise<MatrixTreeNode>;
  onSelect?: (node: MatrixTreeNode) => void;
  onNavigate?: () => void;
  initialMember?: NetworkTarget;
  depth?: number;
}) {
  const [path, setPath] = useState<NetworkTarget[]>(initialMember && initialMember.id !== root.id ? [initialMember] : []);
  const [view, setView] = useState<NetworkView>('tree');
  const hasSelection = useRef(false);
  const select = (node: MatrixTreeNode) => { hasSelection.current = true; onSelect?.(node); };
  const clearSelection = useCallback(() => {
    if (!hasSelection.current) return;
    hasSelection.current = false;
    onNavigate?.();
  }, [onNavigate]);
  const target = path[path.length - 1];
  const query = useQuery({
    queryKey: ['mlm-tree-focus', scope, root.id, target?.id, snapshot, depth],
    queryFn: () => loadTree(target!.id, depth),
    enabled: !!target,
    retry: false,
    staleTime: 0,
    placeholderData: (previousData, previousQuery) => previousQuery?.queryKey[1] === scope && previousQuery.queryKey[2] === root.id && previousQuery.queryKey[3] === target?.id ? previousData : undefined,
  });
  useEffect(() => { if (target && query.isError) clearSelection(); }, [target, query.isError, clearSelection]);
  const displayed = target ? query.data : root;
  const changePath = (next: NetworkTarget[]) => { hasSelection.current = false; setPath(next); onNavigate?.(); };
  const explore = (node: MatrixTreeNode) => {
    if (node.id === displayed?.id) return;
    const previous = path.findIndex(item => item.id === node.id);
    changePath(node.id === root.id ? [] : previous >= 0 ? path.slice(0, previous + 1) : [...path, { id: node.id, name: `${node.client.prenom} ${node.client.nom}` }]);
  };
  const denied = [403, 404].includes((query.error as any)?.response?.status);
  return <div className="min-w-0 space-y-4">
    <NetworkNavigation root={{ id: root.id, name: `${root.client.prenom} ${root.client.nom}` }} path={path} view={view} onView={setView} onBack={index => changePath(path.slice(0, index + 1))} />
    {target && query.isError ? <div role="alert" className="rounded-lg border border-border bg-bg-card p-4 text-sm text-text">
      <p>{denied ? 'Ce réseau n’est pas accessible avec votre compte.' : 'Impossible de charger ce réseau. Vérifiez votre connexion.'}</p>
      <button type="button" className="btn-secondary mt-3 min-h-touch" onClick={() => query.refetch()}>Réessayer le réseau</button>
    </div> : target && query.isPending ? <div role="status" className="p-4 text-sm text-text-muted">Chargement du réseau de {target.name}…</div> : displayed && <MatrixNetworkTree
      key={displayed.id} root={displayed} view={view} scope={scope} onExplore={explore}
      snapshot={`${snapshot}-${displayed.id}-${target ? query.dataUpdatedAt : 'root'}`}
      loadBranch={memberId => loadTree(memberId, 1)} onSelect={onSelect ? select : undefined} onSelectionLost={clearSelection}
    />}
  </div>;
}
