import { useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, RefreshCw } from 'lucide-react';
import { clientsApi, type ClientDetail } from '@/lib/clients.api';
import { getErrorMessage } from '@/lib/api';
import { invalidateMlm } from '@/lib/mlm-query';
import { usePrivateQueryScope } from '@/hooks/usePrivateQueryScope';

export function MlmActivationRetry({ client }: { client: ClientDetail }) {
  const scope = usePrivateQueryScope('CAISSIER');
  if (!scope.enabled || client.statut !== 'ACTIF' || client.membre
    || (scope.siteId && scope.siteId !== (client.site?.id ?? client.siteInscriptionId))) return null;
  return <RetryAction key={`${client.id}:${scope.key}`} clientId={client.id} />;
}

function RetryAction({ clientId }: { clientId: string }) {
  const scope = usePrivateQueryScope('CAISSIER');
  const queryClient = useQueryClient();
  const submitting = useRef(false);
  const mutation = useMutation({
    retry: false,
    networkMode: 'always',
    mutationFn: async () => {
      if (!scope.isCurrent()) throw new Error('Session terminée.');
      const detail = await clientsApi.retryMlmActivation(clientId);
      if (!detail.membre) throw new Error('La création du membre MLM n’a pas été confirmée. Réessayez.');
      return detail;
    },
    onSuccess: detail => {
      if (!scope.isCurrent()) return;
      queryClient.setQueryData(['client', clientId, scope.key], detail);
      void queryClient.invalidateQueries({ queryKey: ['client', clientId] });
      void queryClient.invalidateQueries({ queryKey: ['clients'] });
      void invalidateMlm(queryClient);
    },
    onSettled: () => { submitting.current = false; },
  });

  if (mutation.isSuccess) return <span role="status" className="text-xs font-semibold text-success">MLM activé</span>;
  return (
    <div className="min-w-0 max-w-full space-y-1">
      <button
        type="button"
        disabled={mutation.isPending}
        onClick={() => {
          if (submitting.current || !scope.isCurrent()) return;
          submitting.current = true;
          mutation.mutate();
        }}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-primary-accent/30 px-2.5 py-1.5 text-xs font-semibold text-primary-accent hover:bg-primary-light/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-accent disabled:cursor-wait disabled:opacity-60"
      >
        {mutation.isPending ? <Loader2 size={14} aria-hidden className="shrink-0 animate-spin motion-reduce:animate-none" /> : <RefreshCw size={14} aria-hidden className="shrink-0" />}
        {mutation.isPending ? 'Relance en cours…' : 'Relancer le MLM'}
      </button>
      {mutation.isError && <p role="alert" className="max-w-sm break-words text-xs text-danger">
        La relance n’a pas été confirmée. {getErrorMessage(mutation.error)}
      </p>}
    </div>
  );
}
