import { useEffect } from 'react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowLeft, CheckCircle2, Loader2, AlertTriangle, Clock } from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import { cn, formatDate, initials } from '@/lib/utils';
import { OnboardingStepper } from '@/components/clients/OnboardingStepper';
import { ClientStatusBadge } from '@/components/clients/ClientStatusBadge';
import { MobileMoneyPaymentForm } from '@/components/payments/MobileMoneyPaymentForm';
import { kpayApi } from '@/lib/kpay.api';

// ── Schema Zod ────────────────────────────────────────────────────────────────

const schema = z
  .object({
    montantFiche:      z.number({ invalid_type_error: 'Montant requis' }).positive('Montant requis'),
    modePaiement:      z.enum(['CASH', 'KPAY']),
    numeroTransaction: z.string().optional(),
  })
  .refine(
    (d) => d.modePaiement === 'CASH' || !!d.numeroTransaction,
    { message: 'Numéro de transaction requis pour ce mode', path: ['numeroTransaction'] },
  );

type FormValues = z.infer<typeof schema>;

// ── Types ─────────────────────────────────────────────────────────────────────

interface ClientForFiche {
  id: string;
  prenom: string;
  nom: string;
  telephone: string;
  statut: string;
  site: { nom: string };
  onboardingEtapes: Array<{ etape: string; statut: string; completeeAt?: string | null; montant?: number | null }>;
}

const MODES = [
  { value: 'CASH',         label: 'Cash' },
  { value: 'KPAY',         label: 'Paiement mobile' },
] as const;

// ── Page ──────────────────────────────────────────────────────────────────────

export default function OnboardingFichePage() {
  const { id }   = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [kpaySubmitting, setKpaySubmitting] = useState(false);

  const { data: client, isLoading } = useQuery<ClientForFiche>({
    queryKey: ['client-basic', id],
    queryFn: () => api.get(`/clients/${id}`).then(r => r.data),
    enabled: !!id,
  });

  const { data: config } = useQuery<{ montantFiche: number }>({
    queryKey: ['config'],
    queryFn: () => api.get('/config').then(r => r.data),
  });

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { modePaiement: 'CASH' },
  });

  useEffect(() => {
    if (config?.montantFiche) {
      setValue('montantFiche', config.montantFiche, { shouldValidate: false });
    }
  }, [config, setValue]);

  const recitEtape  = client?.onboardingEtapes.find(e => e.etape === 'RECIT');
  const ficheEtape  = client?.onboardingEtapes.find(e => e.etape === 'FICHE');
  const recitDone   = recitEtape?.statut === 'COMPLETE';
  const ficheDone   = ficheEtape?.statut === 'COMPLETE';
  const canSubmit   = recitDone && !ficheDone;

  const mutation = useMutation({
    mutationFn: (data: FormValues) =>
      api.post(`/clients/${id}/onboarding/fiche`, {
        montantFiche:      data.montantFiche,
        modePaiement:      data.modePaiement,
        numeroTransaction: data.numeroTransaction || undefined,
      }),
    onSuccess: () => {
      toast.success('Fiche client enregistrée.');
      navigate(`/clients/${id}/activate`);
    },
    onError: (error: any) => {
      toast.error(getErrorMessage(error) || "Erreur lors de l'enregistrement.");
    },
  });

  const fieldCls = (hasErr: boolean) => cn(
    'w-full px-3 py-2.5 rounded-lg border border-border text-[13px] text-text bg-white',
    'focus:outline-none focus:ring-2 focus:ring-primary-accent/30 focus:border-primary-accent transition-colors',
    hasErr && 'border-danger focus:ring-danger/30 focus:border-danger',
  );

  const modePaiement = watch('modePaiement');
  const needsRef     = modePaiement !== 'CASH' && modePaiement !== 'KPAY';
  const disabled     = isSubmitting || mutation.isPending || kpaySubmitting;

  const handleKpaySubmit = async (payment: { provider: string; phoneNumber: string }) => {
    if (!id) return;
    setKpaySubmitting(true);
    try {
      const result = await kpayApi.initFiche(id, {
        amount: Number(watch('montantFiche') || 0),
        provider: payment.provider as any,
        phoneNumber: payment.phoneNumber,
      });
      toast.success(`Paiement mobile initié. Référence : ${result.reference ?? 'en attente'}`);
    } catch (error) {
      toast.error(getErrorMessage(error) || 'Impossible d’initier le paiement mobile.');
    } finally {
      setKpaySubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto space-y-5 animate-pulse">
        <div className="skeleton h-9 w-48 rounded-lg" />
        <div className="skeleton h-12 w-full rounded-xl" />
        <div className="skeleton h-36 w-full rounded-xl" />
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
          <h1 className="text-[18px] font-extrabold text-primary leading-tight">Fiche client</h1>
          <p className="text-[12px] text-text-muted">Étape 2 sur 3 — Achat de la fiche</p>
        </div>
      </div>

      {/* Stepper */}
      <OnboardingStepper currentStep={2} clientId={id} />

      {/* Carte client */}
      {client && (
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
                <span className="text-[11px] text-text-muted">{client.telephone} · {client.site?.nom}</span>
              </div>
            </div>
          </div>
          {/* Statut récit */}
          <div className="flex items-center gap-1.5 mt-3 text-[11px]">
            {recitDone
              ? <CheckCircle2 size={12} className="text-success" aria-hidden />
              : <Clock size={12} className="text-warning" aria-hidden />}
            <span className={recitDone ? 'text-success font-medium' : 'text-warning'}>
              Récit {recitDone && recitEtape?.completeeAt ? `acheté le ${formatDate(recitEtape.completeeAt)}` : 'non complété'}
            </span>
          </div>
        </div>
      )}

      {/* Bannière — récit manquant */}
      {!recitDone && client && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3" role="alert">
          <AlertTriangle size={15} className="text-warning flex-shrink-0 mt-0.5" aria-hidden />
          <div>
            <p className="text-[13px] text-warning font-medium">
              L'étape Récit doit être complétée avant la fiche.
            </p>
            <button
              type="button"
              onClick={() => navigate('/clients/new/recit')}
              className="text-[12px] font-semibold text-warning hover:underline mt-1"
            >
              ← Reprendre depuis le Récit
            </button>
          </div>
        </div>
      )}

      {/* Bannière — fiche déjà faite */}
      {ficheDone && client && (
        <div className="flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3" role="alert">
          <CheckCircle2 size={15} className="text-success flex-shrink-0 mt-0.5" aria-hidden />
          <div>
            <p className="text-[13px] text-success font-medium">
              La fiche a déjà été enregistrée pour ce client.
            </p>
            <button
              type="button"
              onClick={() => navigate(`/clients/${id}/activate`)}
              className="text-[12px] font-semibold text-success hover:underline mt-1"
            >
              Passer à l'activation →
            </button>
          </div>
        </div>
      )}

      {/* Formulaire */}
      <div className="rounded-xl border border-border bg-white shadow-sm p-6">
        <h2 className="text-[15px] font-bold text-primary mb-5">Paiement de la fiche client</h2>

        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} noValidate className="space-y-5">

          {/* Montant */}
          <div className="form-group">
            <label htmlFor="montantFiche" className="form-label">Montant payé * (CDF)</label>
            <input
              id="montantFiche"
              type="number"
              min={1}
              placeholder="ex: 10 000"
              disabled={disabled || !canSubmit}
              className={fieldCls(!!errors.montantFiche)}
              {...register('montantFiche', { valueAsNumber: true })}
            />
            {errors.montantFiche && <p className="form-error">{errors.montantFiche.message}</p>}
          </div>

          {/* Mode paiement */}
          <div className="form-group">
            <p className="form-label">Mode de paiement *</p>
            <div className="grid grid-cols-2 gap-2 sm:max-w-sm">
              {MODES.map((m) => (
                <label
                  key={m.value}
                  className={cn(
                    'flex items-center justify-center px-3 py-2.5 border-2 rounded-lg cursor-pointer text-[12px] font-semibold transition-colors',
                    'has-[:checked]:border-primary-accent has-[:checked]:bg-primary-light/40 has-[:checked]:text-primary-accent',
                    'border-border text-text-muted hover:border-border-strong',
                    (disabled || !canSubmit) && 'opacity-50 cursor-not-allowed',
                  )}
                >
                  <input
                    type="radio"
                    value={m.value}
                    className="sr-only"
                    disabled={disabled || !canSubmit}
                    {...register('modePaiement')}
                  />
                  {m.label}
                </label>
              ))}
            </div>
          </div>

          {/* Numéro transaction */}
          {needsRef && (
            <div className="form-group">
              <label htmlFor="numeroTransaction" className="form-label">Numéro de transaction *</label>
              <input
                id="numeroTransaction"
                placeholder="ex: ATM-789012"
                disabled={disabled || !canSubmit}
                className={fieldCls(!!errors.numeroTransaction)}
                {...register('numeroTransaction')}
              />
              {errors.numeroTransaction && <p className="form-error">{errors.numeroTransaction.message}</p>}
            </div>
          )}

          {modePaiement === 'KPAY' && (
            <MobileMoneyPaymentForm
              amount={Number(watch('montantFiche') || 0)}
              currency="CDF"
              submitting={kpaySubmitting}
              onSubmit={handleKpaySubmit}
            />
          )}

          {/* Actions */}
          <div className="flex items-center justify-between gap-3 pt-2 border-t border-border">
            <button
              type="button"
              onClick={() => navigate('/clients')}
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
              {disabled ? 'Enregistrement…' : '✓ Valider l\'achat de la Fiche →'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
