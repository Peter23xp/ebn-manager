import type { CommissionProgressMetadata } from '@/types/mlm';

export function CommissionProgress({ commission }: { commission: CommissionProgressMetadata }) {
  const hasRange = commission.progressFrom != null && commission.progressTo != null;
  return (
    <div className="space-y-1 text-sm text-text">
      {commission.origin === 'CATCH_UP' ? <p className="font-semibold">Rattrapage de génération</p> : <>
        {commission.origin === 'PROGRESSIVE' && <p className="font-semibold">Progression de génération</p>}
        <p>{commission.filleul ? `${commission.filleul.client.prenom} ${commission.filleul.client.nom}` : 'Déclencheur non renseigné'}</p>
      </>}
      {hasRange ? <p className="tabular-nums">Progression : {commission.progressFrom} → {commission.progressTo} positions <span className="text-slate-600">(borne initiale exclue)</span></p> : <p className="text-slate-600">{commission.origin ? 'Plage non fournie' : 'Historique sans plage'}</p>}
      {commission.calculationVersion && <p className="text-slate-600 break-words">Calcul : {commission.calculationVersion}</p>}
    </div>
  );
}
