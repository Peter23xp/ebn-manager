import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth.store';
import { MlmApi } from '@/lib/mlm.api';
import { invalidateMlm } from '@/lib/mlm-query';
import { formatMlmDate } from '@/lib/mlm-display';
import type { MatrixTreeNode, MoveMemberInput, SwapMembersInput } from '@/types/mlm';
import { GenerationProgress } from './GenerationProgress';
import { Pagination } from '@/components/ui/Pagination';

export function MatrixMemberDetails({ node: selectedNode }: { node: MatrixTreeNode }) {
  const details = useQuery({ queryKey: ['mlm-tree-detail', selectedNode.id], queryFn: () => MlmApi.getNetworkTree(selectedNode.id, 0) });
  const node = { ...(details.data ?? selectedNode), generation: selectedNode.generation };
  const role = useAuthStore(state => state.user?.role);
  const canEdit = role === 'SUPER_ADMIN' || role === 'DIRECTEUR_REGIONAL';
  const canReadHistory = canEdit || role === 'GERANT';
  const [page, setPage] = useState(1);
  const history = useQuery({ queryKey: ['mlm-history', node.id, page], queryFn: () => MlmApi.getPlacementHistory(node.id, page), enabled: canReadHistory });
  return <section aria-label={`Détails de ${node.client.prenom} ${node.client.nom}`} className="rounded-xl border border-border bg-bg-card p-5 space-y-4">
    <h2 className="text-section-title text-primary">{node.client.prenom} {node.client.nom} — détails matriciels</h2>
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-text">
      <div><dt>Recruteur personnel</dt><dd>{node.recruiter ? `${node.recruiter.client.prenom} ${node.recruiter.client.nom}` : 'Aucun'}</dd></div>
      <div><dt>Parent matriciel</dt><dd>{node.matrixParent ? `${node.matrixParent.client.prenom} ${node.matrixParent.client.nom}` : 'Racine'}</dd></div>
      <div><dt>Position</dt><dd>{node.position ?? 'Racine'} · {node.positionId ?? 'Sans position entrante'}</dd></div>
      <div><dt>Génération relative à la racine affichée</dt><dd>{node.generation}</dd></div>
      <div><dt>Enfants matriciels</dt><dd>{node.directMatrixChildrenCount}</dd></div>
      <div><dt>Recrutements personnels</dt><dd>{node.personalRecruitCount}</dd></div>
      <div><dt>Total descendants</dt><dd>{node.totalDescendants}</dd></div>
    </dl>
    <GenerationProgress progression={node.progression} />
    {details.isError && <p role="alert">Détails non actualisés. <button className="btn-secondary" onClick={() => details.refetch()}>Réessayer</button></p>}
    {canEdit && <PlacementForm node={node} />}
    {canReadHistory && <div className="space-y-3">
      <h3 className="font-semibold text-text">Historique des placements</h3>
      {history.isLoading ? <div className="skeleton h-20 rounded-lg" /> : history.isError ? <div role="alert">Historique indisponible. <button className="btn-secondary" onClick={() => history.refetch()}>Réessayer</button></div> : <>
        {history.data?.items.length === 0 && <p className="text-sm text-text-muted">Aucun placement enregistré.</p>}
        <ul className="divide-y divide-border text-sm text-text">{history.data?.items.map(item => <li key={item.id} className="py-3 space-y-1 break-words">
          <p className="font-semibold">{item.reason}</p>
          <p>{item.operationType} · {formatMlmDate(item.createdAt)}</p>
          <p>Parent : {item.oldParentId ?? 'Racine'} → {item.newParentId ?? 'Racine'} · Place : {item.oldPosition ?? '—'} → {item.newPosition ?? '—'}</p>
          <p className="text-xs text-text-muted">Recruteur : {item.recruiterId ?? 'Aucun'} · Acteur : {item.actorId ?? 'Système'} · Opération : {item.operationId}</p>
        </li>)}</ul>
        {history.data && <Pagination page={page} totalPages={history.data.meta.totalPages} total={history.data.meta.total} onPageChange={setPage} isLoading={history.isFetching} />}
      </>}
    </div>}
  </section>;
}

function PlacementForm({ node }: { node: MatrixTreeNode }) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'move' | 'swap'>('move');
  const [targetId, setTargetId] = useState('');
  const [target, setTarget] = useState<MatrixTreeNode | null>(null);
  const [expectedNode, setExpectedNode] = useState(node);
  const [position, setPosition] = useState('');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [conflict, setConflict] = useState(false);
  const pendingOperation = useRef<{ fingerprint: string; id: string } | null>(null);
  const loadTarget = useMutation({ mutationFn: async () => {
    const [current, destination] = await Promise.all([MlmApi.getNetworkTree(node.id, 0), MlmApi.getNetworkTree(targetId.trim(), 0)]);
    setExpectedNode(current); setTarget(destination); setPosition(''); setConflict(false); setMessage('');
    pendingOperation.current = null;
  } });
  const mutation = useMutation({
    mutationFn: async (input: MoveMemberInput | SwapMembersInput) => 'newParentId' in input ? MlmApi.moveMember(input) : MlmApi.swapMembers(input),
    onSuccess: () => { setMessage('Placement enregistré.'); setTarget(null); pendingOperation.current = null; void invalidateMlm(queryClient); },
    onError: (error: any) => { setMessage(error?.response?.data?.message ?? 'Placement non confirmé. Réessayez la même opération en cas de coupure réseau.'); setConflict(error?.response?.status === 409 || error?.response?.status === 400); },
  });
  const valid = !!target && target.id !== node.id && !!reason.trim() && !conflict && (mode === 'swap' ? !!target.positionId && !!expectedNode.positionId : target.emptyPositions.includes(Number(position)));
  return <form className="space-y-3 border-t border-border pt-4" onSubmit={event => {
    event.preventDefault();
    if (!valid || !target || mutation.isPending) return;
    const payload = mode === 'move' ? { memberId: node.id, newParentId: target.id, newPosition: Number(position), expectedPositionId: expectedNode.positionId, reason: reason.trim() } : { memberId: node.id, otherMemberId: target.id, expectedPositionId: expectedNode.positionId, otherExpectedPositionId: target.positionId, reason: reason.trim() };
    const fingerprint = JSON.stringify(payload);
    if (pendingOperation.current?.fingerprint !== fingerprint) pendingOperation.current = { fingerprint, id: crypto.randomUUID() };
    mutation.mutate({ ...payload, operationId: pendingOperation.current.id });
  }}>
    <h3 className="font-semibold text-text">Modifier le placement</h3>
    <p className="text-sm text-text-muted">Le sous-arbre est conservé. Vérifiez la cible et confirmez explicitement ; le serveur contrôle les cycles et les conflits.</p>
    <fieldset disabled={mutation.isPending || loadTarget.isPending} className="space-y-3">
      <label className="form-label">Opération<select value={mode} onChange={event => setMode(event.target.value as 'move' | 'swap')}><option value="move">Déplacement</option><option value="swap">Échange</option></select></label>
      <label className="form-label">Identifiant du membre cible<input value={targetId} onChange={event => { setTargetId(event.target.value); setTarget(null); setMessage(''); }} required /></label>
      <button type="button" className="btn-secondary" disabled={!targetId.trim() || targetId.trim() === node.id} onClick={() => loadTarget.mutate()}>{loadTarget.isPending ? 'Chargement…' : 'Charger la cible'}</button>
      {loadTarget.isError && <p role="alert">{(loadTarget.error as any)?.response?.data?.message ?? 'Cible indisponible. Réessayez.'}</p>}
      {target && <p className="text-sm font-semibold text-text">{target.client.prenom} {target.client.nom}</p>}
      {mode === 'move' && <label className="form-label">Nouvelle position<select value={position} onChange={event => setPosition(event.target.value)} required><option value="">Choisir une place libre</option>{target?.emptyPositions.map(slot => <option key={slot} value={slot}>Place {slot}</option>)}</select></label>}
      <label className="form-label">Motif du placement<textarea value={reason} onChange={event => setReason(event.target.value)} required rows={2} /></label>
      <button type="submit" className="btn-primary" disabled={!valid}>{mutation.isPending ? 'Enregistrement…' : mode === 'move' ? 'Confirmer le déplacement' : 'Confirmer l’échange'}</button>
    </fieldset>
    {message && <p role={mutation.isError ? 'alert' : 'status'} className="text-sm text-text">{message}{conflict && ' Rechargez la cible pour vérifier les placements actuels.'}</p>}
  </form>;
}
