import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowLeft, CheckCircle2, Clock, Loader2, AlertTriangle } from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { cn, initials, formatDate } from '@/lib/utils';
import { OnboardingStepper } from '@/components/clients/OnboardingStepper';
import { ClientStatusBadge } from '@/components/clients/ClientStatusBadge';
import { hasMinimumRole } from '@/lib/roles';
import { usePrivateQueryScope } from '@/hooks/usePrivateQueryScope';

// ── Schema Zod ────────────────────────────────────────────────────────────────

const today = new Date();
const thirtyDaysAgo = new Date(Date.now() - 30 * 86400 * 1000);

const schema = z.object({
  formateurId:   z.string().min(1),
  dateFormation: z
    .string()
    .min(1, 'Date requise')
    .refine((d) => new Date(d) <= today, { message: 'Date future interdite' })
    .refine((d) => new Date(d) >= thirtyDaysAgo, { message: 'Date trop ancienne (max 30 jours)' }),
  dureeMinutes: z.number().min(1).max(480).optional().or(z.literal(NaN)).transform((v) =>
    Number.isNaN(v) ? undefined : v,
  ),
  notes:     z.string().max(300).optional(),
  confirmed: z.literal(true, { errorMap: () => ({ message: 'Certification requise' }) }),
});

type FormValues = z.infer<typeof schema>;

// ── Types ─────────────────────────────────────────────────────────────────────

interface ClientForFormation {
  id: string;
  prenom: string;
  nom: string;
  telephone: string;
  statut: string;
  site: { nom: string };
  onboardingEtapes: Array<{ etape: string; statut: string; completeeAt?: string | null }>;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function OnboardingFormationPage() {
  const scope = usePrivateQueryScope('FORMATEUR');
  const { id }   = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, hasRole } = useAuthStore();
  const canCollect = hasMinimumRole(user?.role, 'CAISSIER');
  const nextRoute = canCollect ? `/clients/${id}/fiche` : `/clients/${id}`;

  const todayStr = new Date().toISOString().split('T')[0];

  // Bloquer l'accès AGENT
  const canAccess = hasRole('FORMATEUR');

  const { data, isLoading } = useQuery<ClientForFormation>({
    queryKey: ['client-basic', id, scope.key],
    queryFn: () => api.get(`/clients/${id}`).then(r => r.data),
    enabled: !!id && canAccess && scope.enabled,
  });
  const client = scope.enabled ? data : undefined;

  const recitEtape = client?.onboardingEtapes?.find((e) => e.etape === 'RECIT');
  const recitDone  = recitEtape?.statut === 'COMPLETE';
  const canSubmit  = canAccess && recitDone && client?.statut === 'EN_COURS';

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      formateurId:   user?.id ?? '',
      dateFormation: todayStr,
      confirmed: undefined as unknown as true,
    },
  });

  const mutation = useMutation({
    mutationFn: (data: FormValues) =>
      api.post(`/clients/${id}/onboarding/formation`, {
        formateurId:   data.formateurId,
        dateFormation: data.dateFormation,
        dureeMinutes:  data.dureeMinutes,
        notes:         data.notes,
      }),
    onSuccess: () => {
      toast.success('Formation validée.');
      navigate(nextRoute);
    },
    onError: (error: any) => {
      const status = error?.response?.status;
      if (status === 409) {
        toast('Formation déjà validée, passage à l\'étape suivante.', { icon: 'ℹ️' });
        navigate(nextRoute);
        return;
      }
      const msg = getErrorMessage(error) || 'Erreur lors de l\'enregistrement.';
      toast.error(msg);
    },
  });

  const fieldCls = (hasErr: boolean) => cn(
    'w-full px-3 py-2.5 rounded-lg border border-border text-[13px] text-text bg-white',
    'focus:outline-none focus:ring-2 focus:ring-primary-accent/30 focus:border-primary-accent transition-colors',
    hasErr && 'border-danger focus:ring-danger/30 focus:border-danger',
  );

  const disabled = isSubmitting || mutation.isPending;

  // ── Accès refusé ─────────────────────────────────────────────────
  if (!canAccess) {
    return (
      <div className="max-w-lg mx-auto py-20 text-center space-y-3">
        <AlertTriangle size={36} className="text-warning mx-auto opacity-60" aria-hidden />
        <h2 className="text-[16px] font-bold text-primary">Accès refusé</h2>
        <p className="text-[13px] text-text-muted">
          Cette page est réservée aux Formateurs, Gérants et Super-Admins.
        </p>
        <Link to="/clients" className="text-[13px] text-primary-accent hover:underline">
          ← Retour à la liste
        </Link>
      </div>
    );
  }

  // ── Chargement ───────────────────────────────────────────────────
  if (isLoading || !client) {
    return (
      <div className="max-w-2xl mx-auto space-y-5 animate-pulse">
        <div className="skeleton h-9 w-48 rounded-lg" />
        <div className="skeleton h-12 w-full rounded-xl" />
        <div className="skeleton h-40 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(`/clients/${id}`)}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-border text-text-muted hover:border-border-strong hover:text-text transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-accent"
          aria-label="Retour à la fiche client"
        >
          <ArrowLeft size={17} aria-hidden />
        </button>
        <div>
          <h1 className="text-[18px] font-extrabold text-primary leading-tight">Formation</h1>
          <p className="text-[12px] text-text-muted">Étape 2 sur 4 — Validation de la formation</p>
        </div>
      </div>

      {/* Stepper */}
      <OnboardingStepper currentStep={2} clientId={id} completedSteps={recitDone ? [1] : []} canNavigate={canCollect} />

      {/* Carte client (lecture seule) */}
      <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-4">
        <div className="flex items-center gap-3">
          <span
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-[13px] font-bold bg-primary-accent text-white select-none"
            aria-hidden
          >
            {initials(client.nom, client.prenom)}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-bold text-primary truncate">
              {client.prenom} {client.nom}
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-0.5">
              <ClientStatusBadge statut={client.statut as any} size="sm" />
              <span className="text-[11px] text-text-muted">{client.telephone}</span>
              <span className="text-[11px] text-text-muted">· {client.site?.nom}</span>
            </div>
          </div>
        </div>
        {/* Confirmation récit */}
        {recitDone && recitEtape?.completeeAt ? (
          <div className="flex items-center gap-1.5 mt-3 text-[11px] text-success font-medium">
            <CheckCircle2 size={12} aria-hidden />
            Récit acheté le {formatDate(recitEtape.completeeAt)}
          </div>
        ) : (
          <div className="flex items-center gap-1.5 mt-3 text-[11px] text-warning font-medium">
            <Clock size={12} aria-hidden />
            Récit non complété
          </div>
        )}
      </div>

      {/* Bannière protection — récit non complété */}
      {!canSubmit && (
        <div
          className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3"
          role="alert"
        >
          <AlertTriangle size={15} className="text-warning flex-shrink-0 mt-0.5" aria-hidden />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] text-warning font-medium">
              L'étape Récit doit être complétée avant de valider la formation.
            </p>
            <Link
              to={canCollect ? `/clients/${id}/recit` : `/clients/${id}`}
              className="text-[12px] font-semibold text-warning hover:underline mt-1 inline-block"
            >
              {canCollect ? '← Reprendre depuis le Récit' : 'Ouvrir le dossier'}
            </Link>
          </div>
        </div>
      )}

      {/* Formulaire */}
      <div className="rounded-xl border border-border bg-white shadow-sm p-6">
        <h2 className="text-[15px] font-bold text-primary mb-5">Validation de la formation</h2>

        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} noValidate className="space-y-5">

          {/* Formateur — pré-rempli non éditable */}
          <div className="form-group">
            <label className="form-label">Formateur *</label>
            <input
              value={[user?.prenom, user?.nom].filter(Boolean).join(' ') || user?.name || ''}
              disabled
              className={cn(fieldCls(false), 'opacity-60 cursor-not-allowed bg-slate-50')}
              readOnly
            />
            <input type="hidden" {...register('formateurId')} />
          </div>

          {/* Date + Durée */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="form-group">
              <label htmlFor="dateFormation" className="form-label">Date de formation *</label>
              <input
                id="dateFormation"
                type="date"
                max={todayStr}
                min={new Date(Date.now() - 30 * 86400 * 1000).toISOString().split('T')[0]}
                disabled={disabled || !canSubmit}
                className={fieldCls(!!errors.dateFormation)}
                {...register('dateFormation')}
              />
              {errors.dateFormation && <p className="form-error">{errors.dateFormation.message}</p>}
            </div>
            <div className="form-group">
              <label htmlFor="dureeMinutes" className="form-label">
                Durée <span className="text-text-muted font-normal">(minutes, optionnel)</span>
              </label>
              <input
                id="dureeMinutes"
                type="number"
                min={1}
                max={480}
                placeholder="ex: 45"
                disabled={disabled || !canSubmit}
                className={fieldCls(false)}
                {...register('dureeMinutes', { valueAsNumber: true })}
              />
            </div>
          </div>

          {/* Notes */}
          <div className="form-group">
            <label htmlFor="notes" className="form-label">
              Notes <span className="text-text-muted font-normal">(optionnel, max 300 caractères)</span>
            </label>
            <textarea
              id="notes"
              rows={3}
              maxLength={300}
              placeholder="Observations, compétences évaluées…"
              disabled={disabled || !canSubmit}
              className={cn(fieldCls(false), 'resize-none')}
              {...register('notes')}
            />
          </div>

          {/* Checkbox certification */}
          <label className={cn(
            'flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-colors',
            'border-border bg-slate-50 hover:bg-primary-light/20',
            !canSubmit && 'opacity-50 cursor-not-allowed',
          )}>
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-border text-primary-accent focus:ring-2 focus:ring-primary-accent"
              disabled={disabled || !canSubmit}
              {...register('confirmed')}
            />
            <div>
              <p className="text-[13px] font-semibold text-text">
                Je certifie que ce client a bien suivi la formation *
              </p>
              <p className="text-[11px] text-text-muted mt-0.5">
                Cette confirmation est requise pour passer à l'étape suivante.
              </p>
            </div>
          </label>
          {errors.confirmed && (
            <p className="form-error -mt-3">{errors.confirmed.message}</p>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between gap-3 pt-2 border-t border-border">
            <button
              type="button"
              onClick={() => navigate(`/clients/${id}`)}
              className="btn-secondary text-[13px]"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={disabled || !canSubmit}
              className="btn-primary text-[13px] flex items-center gap-2"
            >
              {disabled && <Loader2 size={14} className="animate-spin" aria-hidden />}
              {disabled ? 'Validation…' : '✓ Valider la Formation →'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
