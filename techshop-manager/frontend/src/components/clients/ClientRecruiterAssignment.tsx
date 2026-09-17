import { useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CodeParrainInput } from '@/components/clients/CodeParrainInput';
import { ClientStatusBadge } from '@/components/clients/ClientStatusBadge';
import { getErrorMessage } from '@/lib/api';
import { clientsApi, type AssignClientParrainDto, type ClientDetail } from '@/lib/clients.api';
import { formatDateTime } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';

const RECRUITER_STATUSES = ['ACTIF', 'EN_COURS'];
const NETWORK_QUERY_KEYS = [
  'mlm-members', 'mlm-tree', 'mlm-tree-focus', 'mlm-tree-branch', 'mlm-tree-detail',
  'mlm-matrix', 'mlm-progress', 'mlm-stats', 'mlm-members-by-level',
  'mlm-claims-pending', 'mlm-notifications-counts',
];

export function ClientRecruiterAssignment({ client }: { client: ClientDetail }) {
  const user = useAuthStore(state => state.user);
  const allowed = user?.role === 'SUPER_ADMIN' || (
    user?.role === 'GERANT' && !!user.siteId &&
    user.siteId === (client.site?.id ?? client.siteInscriptionId)
  );

  if (!allowed || !user) return null;

  return <RecruiterAssignment key={`${client.id}:${user.id}`} client={client} actorId={user.id} />;
}

function RecruiterAssignment({ client, actorId }: { client: ClientDetail; actorId: string }) {
  const queryClient = useQueryClient();
  const reasonId = useId();
  const headingId = useId();
  const confirmationId = useId();
  const [codeParrain, setCodeParrain] = useState('');
  const [reason, setReason] = useState('');
  const [confirmedBody, setConfirmedBody] = useState<AssignClientParrainDto | null>(null);
  const submitting = useRef(false);
  const attributionKey = ['client-parrain-attribution', client.id, actorId];
  const history = useQuery({
    queryKey: attributionKey,
    queryFn: () => clientsApi.getParrainAttribution(client.id),
    retry: false,
  });
  const mutation = useMutation({
    mutationFn: (body: AssignClientParrainDto) => clientsApi.assignParrain(client.id, body),
    retry: false,
    networkMode: 'always',
    onSettled: () => { submitting.current = false; },
    onSuccess: attribution => {
      queryClient.setQueryData(attributionKey, attribution);
      const keys = [
        ['client', client.id], ['clients'], ['client-basic', client.id], ['client-activation', client.id],
        ...NETWORK_QUERY_KEYS.map(key => [key]),
        ['portal', 'referrals'], ['portal', 'referrals-tree'], ['portal-claims-pending'],
      ];
      keys.forEach(queryKey => { void queryClient.invalidateQueries({ queryKey }); });
    },
  });
  const attribution = mutation.data ?? history.data;
  const existingRecruiter = !!(client.parrain || client.parrainClientId || client.membre?.parrainId || client.parrainClaim);
  const trimmedReason = reason.trim();
  const valid = !!codeParrain && trimmedReason.length >= 3 && trimmedReason.length <= 500;
  const canAssign = history.isSuccess && !existingRecruiter && !attribution;

  function review(event: React.FormEvent) {
    event.preventDefault();
    if (canAssign && valid && !confirmedBody) {
      setConfirmedBody({ codeParrain, reason: trimmedReason });
    }
  }

  function submit() {
    if (!canAssign || !confirmedBody || submitting.current) return;
    submitting.current = true;
    mutation.mutate(confirmedBody);
  }

  return (
    <section aria-labelledby={headingId} className="rounded-xl bg-bg border border-border px-4 py-4 space-y-3">
      <h2 id={headingId} className="text-[14px] font-semibold text-text">Attribution du recruteur</h2>
      {attribution ? (
        <div className="space-y-2 text-[13px]" role="status">
          <p className="font-semibold">Attribution enregistrée — le recruteur ne peut plus être remplacé.</p>
          <div className="flex flex-wrap items-center gap-2">
            <Link to={`/clients/${attribution.parrain.id}`} className="font-semibold text-primary-accent hover:underline">
              {attribution.parrain.prenom} {attribution.parrain.nom}
            </Link>
            <ClientStatusBadge statut={attribution.parrain.statut} />
          </div>
          <dl className="space-y-2">
            <div><dt className="text-text-muted">Attribué par</dt><dd>{attribution.actor.nom}</dd></div>
            <div><dt className="text-text-muted">Date</dt><dd><time dateTime={attribution.createdAt}>{formatDateTime(attribution.createdAt)}</time></dd></div>
            <div><dt className="text-text-muted">Motif</dt><dd className="whitespace-pre-wrap break-words">{attribution.reason}</dd></div>
          </dl>
        </div>
      ) : (
        <>
          {existingRecruiter && (
            <p className="text-[13px] text-text">Ce client a déjà un recruteur ou une demande de parrainage. Aucun remplacement n’est autorisé.</p>
          )}
          {history.isPending && <p role="status" className="text-[13px] text-text-muted">Chargement de l’attribution…</p>}
          {history.isError && (
            <div role="alert" className="space-y-2 text-[13px]">
              <p>Impossible de vérifier l’attribution. Aucune nouvelle attribution n’est possible sans cette vérification.</p>
              <button type="button" className="btn-secondary" disabled={history.isFetching} onClick={() => { void history.refetch(); }}>
                Réessayer le chargement
              </button>
            </div>
          )}
          {canAssign && (
            <form onSubmit={review} className="space-y-3">
              <p className="text-[13px] text-text">Le recruteur choisi est définitif, avant ou après activation : il ne pourra jamais être remplacé.</p>
              <p className="text-[13px] text-text">La position actuelle dans la matrice et le sous-arbre sont conservés.</p>
              <p className="text-[13px] text-text">Si le recruteur est en cours d’adhésion, son activation utilise le circuit des demandes de parrainage existantes.</p>
              <CodeParrainInput value={codeParrain} onChange={setCodeParrain} currentClientPhone={client.telephone}
                allowedStatuses={RECRUITER_STATUSES} disabled={!!confirmedBody} />
              <div className="space-y-1">
                <label htmlFor={reasonId} className="text-[13px] font-semibold">Motif de l’attribution</label>
                <textarea id={reasonId} value={reason} onChange={event => setReason(event.target.value)}
                  disabled={!!confirmedBody} rows={3} required aria-describedby={`${reasonId}-help`}
                  className="w-full rounded-lg border border-border bg-white px-3 py-2 text-[13px] disabled:opacity-60" />
                <p id={`${reasonId}-help`} className="text-[12px] text-text-muted">3 à 500 caractères, hors espaces en début et fin ({trimmedReason.length}/500).</p>
              </div>
              {confirmedBody ? (
                <section aria-labelledby={confirmationId} className="border-t border-border pt-3 space-y-3">
                  <h3 id={confirmationId} className="text-[14px] font-semibold">Confirmer l’attribution</h3>
                  <p className="text-[13px]">Attribuer le recruteur <strong>{confirmedBody.codeParrain}</strong> à {client.prenom} {client.nom} ?</p>
                  <p className="text-[13px] whitespace-pre-wrap break-words">Motif : {confirmedBody.reason}</p>
                  {mutation.isError && (
                    <div role="alert" className="text-[13px] text-danger space-y-1">
                      <p>{getErrorMessage(mutation.error)}</p>
                      <p>Résultat non confirmé : aucun nouvel envoi automatique. Vous pouvez réessayer uniquement la même attribution.</p>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {!mutation.isError && (
                      <button type="button" className="btn-secondary" disabled={mutation.isPending} onClick={() => {
                        if (!submitting.current) setConfirmedBody(null);
                      }}>
                        Modifier la sélection
                      </button>
                    )}
                    <button type="button" className="btn-primary disabled:opacity-50" disabled={mutation.isPending} onClick={submit}>
                      {mutation.isPending ? 'Enregistrement…' : mutation.isError ? 'Réessayer la même attribution' : 'Confirmer l’attribution'}
                    </button>
                  </div>
                </section>
              ) : (
                <button type="submit" className="btn-primary disabled:opacity-50" disabled={!valid}>Vérifier l’attribution</button>
              )}
            </form>
          )}
        </>
      )}
    </section>
  );
}
