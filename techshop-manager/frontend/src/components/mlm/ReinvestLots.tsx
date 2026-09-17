import type { ReinvestLot } from '@/types/mlm';
import { formatMlmDate, formatMlmMoney } from '@/lib/mlm-display';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth.store';
import { MlmApi } from '@/lib/mlm.api';
import { invalidateMlm } from '@/lib/mlm-query';

const labels: Record<ReinvestLot['status'], string> = {
  HOLD_PERIOD: 'Retenue en cours',
  RELEASABLE: 'Restituable — validation administrative requise',
  RELEASED: 'Restitué',
  CANCELLED: 'Annulé',
};

export function ReinvestLots({ lots = [] }: { lots?: ReinvestLot[] }) {
  const role = useAuthStore(state => state.user?.role);
  const canRelease = role === 'SUPER_ADMIN' || role === 'DIRECTEUR_REGIONAL';
  return (
    <section aria-label="Lots de retenue" className="space-y-3">
      <h3 className="text-sm font-semibold text-text">Retenues et restitutions</h3>
      <p className="text-xs text-text-muted">Aperçu des lots renvoyés par le serveur (jusqu'à 100 lots sur les portefeuilles).</p>
      <p className="text-xs text-text-muted">30 jours ouvrables après validation : lundi à samedi, hors dimanches et jours fériés RDC. Échéances fournies par le serveur.</p>
      {lots.length === 0 ? <p className="text-sm text-text-muted">Aucun lot de retenue.</p> : <ul className="divide-y divide-border">
        {lots.map(lot => <li key={lot.id} className="py-3 space-y-1 text-sm text-text break-words">
          <p className="font-mono font-semibold">{formatMlmMoney(lot.amount)}</p>
          <p>{labels[lot.status] ?? 'Statut indisponible'}</p>
          <p>Échéance : {formatMlmDate(lot.releaseDate, lot.timezone)}</p>
          {lot.releasedAt && <p>Restitué le : {formatMlmDate(lot.releasedAt, lot.timezone)}</p>}
          <p className="text-xs text-text-muted">{lot.timezone} · Calendrier : {lot.calendarVersion} · Commission : {lot.commissionId}</p>
          {canRelease && lot.status === 'RELEASABLE' && <ReleaseLot lot={lot} />}
        </li>)}
      </ul>}
    </section>
  );
}

function ReleaseLot({ lot }: { lot: ReinvestLot }) {
  const [confirming, setConfirming] = useState(false);
  const queryClient = useQueryClient();
  const mutation = useMutation({ mutationFn: () => MlmApi.releaseReinvestLot(lot.id), onSuccess: () => { setConfirming(false); void invalidateMlm(queryClient); }, onError: () => { void invalidateMlm(queryClient); } });
  if (mutation.isSuccess) return <p role="status">Restitution enregistrée.</p>;
  return <div className="space-y-2">
    {confirming ? <>
      <p>Transférer {formatMlmMoney(lot.amount)} vers le disponible ? Aucun paiement externe ne sera lancé.</p>
      <button className="btn-primary" disabled={mutation.isPending} onClick={() => mutation.mutate()}>Confirmer la restitution</button>
      <button className="btn-secondary ml-2" disabled={mutation.isPending} onClick={() => setConfirming(false)}>Annuler</button>
    </> : <button className="btn-secondary" onClick={() => setConfirming(true)}>Restituer la retenue</button>}
    {mutation.isError && <p role="alert">{(mutation.error as any)?.response?.data?.message ?? 'Restitution non confirmée. Réessayez.'}</p>}
  </div>;
}
