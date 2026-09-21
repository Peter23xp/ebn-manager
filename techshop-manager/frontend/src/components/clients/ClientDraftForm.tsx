import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowLeft, ChevronRight, Clock, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { getErrorMessage } from '@/lib/api';
import { clientDraftSchema, createClientDraft, type ClientDraftResult, type ClientDraftValues } from '@/lib/client-draft';
import { cn } from '@/lib/utils';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { CodeParrainInput } from './CodeParrainInput';

export function ClientDraftForm() {
  const user = useAuthStore(state => state.user);
  const queryClient = useQueryClient();
  const [sessionClients, setSessionClients] = useState<ClientDraftResult['client'][]>([]);
  const [failure, setFailure] = useState<{ message: string; clientId?: string } | null>(null);
  const { register, control, handleSubmit, watch, reset, formState: { errors } } = useForm<ClientDraftValues>({
    resolver: zodResolver(clientDraftSchema),
    defaultValues: { siteId: user?.siteId ?? '', prenom: '', nom: '', telephone: '', email: '', codeParrain: '' },
  });
  const telephone = watch('telephone');
  const mutation = useMutation({
    mutationFn: createClientDraft,
    onMutate: () => setFailure(null),
    onSuccess: ({ client }) => {
      setSessionClients(previous => [client, ...previous]);
      reset({ siteId: user?.siteId ?? '', prenom: '', nom: '', telephone: '', email: '', codeParrain: '' });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['onboarding-queue'] });
    },
    onError: (error: unknown) => {
      const data = (error as { response?: { data?: { code?: string; message?: string; clientId?: string } } })?.response?.data;
      const duplicate = data?.code === 'ERR_DUPLICATE_CLIENT';
      setFailure({
        message: `${duplicate ? data.message : getErrorMessage(error)} Vos données sont conservées, réessayez.`,
        clientId: duplicate ? data.clientId : undefined,
      });
    },
  });
  const disabled = mutation.isPending;
  const fieldClass = (invalid: boolean) => cn(
    'w-full min-h-11 px-3 py-2.5 rounded-lg border border-border text-[13px] text-text bg-white',
    'focus:outline-none focus:ring-2 focus:ring-primary-accent/30 focus:border-primary-accent transition-colors',
    invalid && 'border-danger focus:ring-danger/30 focus:border-danger',
  );

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Link to="/clients" className="btn-secondary min-h-11 min-w-11 flex items-center justify-center" aria-label="Retour à la liste des clients">
          <ArrowLeft size={17} aria-hidden />
        </Link>
        <div>
          <h1 className="text-[18px] font-extrabold text-primary leading-tight">Nouveau dossier client</h1>
          <p className="text-[13px] text-text-muted">Préparez le dossier. Le règlement se fera en caisse.</p>
        </div>
      </div>
      <div className="min-w-0 rounded-xl border border-border bg-white p-6">
        <h2 className="text-[15px] font-bold text-primary mb-5">Informations personnelles &amp; Parrainage</h2>
        <form onSubmit={handleSubmit(values => mutation.mutate({ ...values, siteId: user?.siteId ?? '' }))} noValidate className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="form-group">
              <label htmlFor="prenom" className="form-label">Prénom *</label>
              <input id="prenom" autoComplete="given-name" disabled={disabled} className={fieldClass(!!errors.prenom)} {...register('prenom')} />
              {errors.prenom && <p className="form-error">{errors.prenom.message}</p>}
            </div>
            <div className="form-group">
              <label htmlFor="nom" className="form-label">Nom *</label>
              <input id="nom" autoComplete="family-name" disabled={disabled} className={fieldClass(!!errors.nom)} {...register('nom')} />
              {errors.nom && <p className="form-error">{errors.nom.message}</p>}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="form-group">
              <label className="form-label">Téléphone *</label>
              <Controller name="telephone" control={control} render={({ field }) => <PhoneInput value={field.value ?? ''} onChange={field.onChange} disabled={disabled} error={errors.telephone?.message} />} />
              {errors.telephone && <p className="form-error">{errors.telephone.message}</p>}
            </div>
            <div className="form-group">
              <label htmlFor="email" className="form-label">Email</label>
              <input id="email" type="email" autoComplete="email" disabled={disabled} className={fieldClass(!!errors.email)} {...register('email')} />
              {errors.email && <p className="form-error">{errors.email.message}</p>}
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="siteId" className="form-label">Site *</label>
            <input id="siteId" value={user?.site?.nom ?? user?.siteName ?? user?.siteId ?? ''} disabled readOnly className={cn(fieldClass(false), 'bg-slate-50')} />
            <input type="hidden" {...register('siteId')} value={user?.siteId ?? ''} />
            {errors.siteId && <p className="form-error">{errors.siteId.message}</p>}
          </div>
          <div className="form-group">
            <label className="form-label">Parrain <span className="text-text-muted font-normal">(optionnel — matricule ou nom)</span></label>
            <Controller name="codeParrain" control={control} render={({ field }) => <CodeParrainInput value={field.value ?? ''} onChange={field.onChange} currentClientPhone={telephone} disabled={disabled} error={errors.codeParrain?.message} />} />
          </div>
          {failure && (
            <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-[13px] text-danger">
              <p>{failure.message}</p>
              {failure.clientId && <Link to={`/clients/${failure.clientId}`} className="inline-flex min-h-11 items-center font-semibold underline">Ouvrir le dossier</Link>}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border">
            <Link to="/clients" className="btn-secondary min-h-11 text-[13px]">Annuler</Link>
            <button type="submit" disabled={disabled || !user?.siteId} className="btn-primary min-h-11 text-[13px] flex items-center gap-2">
              {disabled && <Loader2 size={14} className="animate-spin" aria-hidden />}
              {disabled ? 'Enregistrement…' : 'Enregistrer le dossier'}
            </button>
          </div>
        </form>
      </div>
      {sessionClients.length > 0 && (
        <section className="rounded-xl border border-border bg-white p-4 space-y-3" aria-label="Dossiers enregistrés">
          <h2 className="text-[14px] font-bold text-primary">{sessionClients.length} dossier{sessionClients.length > 1 ? 's' : ''} enregistré{sessionClients.length > 1 ? 's' : ''}</h2>
          <p role="status" className="flex items-center gap-2 text-[13px] text-amber-800"><Clock size={14} aria-hidden />En attente de passage en caisse</p>
          <ul className="divide-y divide-border">
            {sessionClients.map(client => (
              <li key={client.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                <div><p className="text-[13px] font-semibold text-text">{client.prenom} {client.nom}</p><p className="text-[12px] text-text-muted">{client.telephone}</p></div>
                <Link to={`/clients/${client.id}`} className="inline-flex min-h-11 items-center gap-1 text-[13px] font-semibold text-primary-accent hover:underline">Ouvrir le dossier <ChevronRight size={13} aria-hidden /></Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
