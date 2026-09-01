import { useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Clock, User } from 'lucide-react';
import toast from 'react-hot-toast';
import { api, getErrorMessage } from '@/lib/api';
import { kpayApi } from '@/lib/kpay.api';
import { useAuthStore } from '@/store/auth.store';
import { cn } from '@/lib/utils';
import { OnboardingStepper } from '@/components/clients/OnboardingStepper';
import { MobileMoneyPaymentForm } from '@/components/payments/MobileMoneyPaymentForm';

// ── Schéma ────────────────────────────────────────────────────────────────────

const schema = z.object({
  montantRecit: z.number({ invalid_type_error: 'Montant requis' }).positive('Montant requis'),
  modePaiement: z.enum(['CASH', 'KPAY']),
  numeroRecu: z.string().optional(),
}).refine(
  (d) => d.modePaiement === 'CASH' || d.modePaiement === 'KPAY' || !!d.numeroRecu,
  { message: 'Numéro de transaction requis', path: ['numeroRecu'] },
);

type FormValues = z.infer<typeof schema>;

// ── Page ──────────────────────────────────────────────────────────────────────

export default function OnboardingRecitResumePage() {
  const { id: clientId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [kpaySubmitting, setKpaySubmitting] = useState(false);

  // Charger les infos du client
  const { data: clientData, isLoading } = useQuery<any>({
    queryKey: ['client', clientId],
    queryFn: () => api.get(`/clients/${clientId}`).then((r) => r.data),
    enabled: !!clientId,
  });

  // Charger la config (montant récit)
  const { data: config } = useQuery<{ montantRecit: number }>({
    queryKey: ['config'],
    queryFn: () => api.get('/config').then((r) => r.data),
  });

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      modePaiement: 'CASH',
      montantRecit: config?.montantRecit ?? undefined,
    },
  });

  // Pré-remplir montant dès que la config est disponible
  useState(() => {
    if (config?.montantRecit) setValue('montantRecit', config.montantRecit);
  });

  const modePaiement = watch('modePaiement');

  // Mutation Cash
  const mutation = useMutation({
    mutationFn: (data: FormValues) =>
      kpayApi.resumeRecit(clientId!, {
        montantRecit: data.montantRecit,
        modePaiement: data.modePaiement,
        numeroRecu: data.numeroRecu || undefined,
      }),
    onSuccess: (res: any) => {
      const c = res.client ?? clientData;
      toast.success(`Récit complété pour ${c?.prenom ?? ''} ${c?.nom ?? ''}. Passez à la fiche.`);
      navigate(`/clients/${clientId}/fiche`);
    },
    onError: (error: any) => {
      const msg = getErrorMessage(error) || 'Erreur lors de la reprise du récit.';
      toast.error(msg);
    },
  });

  // Soumission KPay
  const handleKpaySubmit = (payment: { provider: string; phoneNumber: string }) => {
    handleSubmit(async (data) => {
      setKpaySubmitting(true);
      try {
        await kpayApi.resumeRecitKpay(clientId!, {
          montantRecit: data.montantRecit,
          provider: payment.provider as any,
          phoneNumber: payment.phoneNumber,
        });
        toast.success('Paiement Mobile Money initié. Le récit sera validé à la réception.');
        navigate(`/clients/queue`);
      } catch (error) {
        toast.error(`${getErrorMessage(error)} Réessayez.`);
      } finally {
        setKpaySubmitting(false);
      }
    })();
  };

  const fieldCls = (hasErr: boolean) => cn(
    'w-full px-3 py-2.5 rounded-lg border border-border text-[13px] text-text bg-white',
    'focus:outline-none focus:ring-2 focus:ring-primary-accent/30 focus:border-primary-accent transition-colors',
    hasErr && 'border-danger focus:ring-danger/30 focus:border-danger',
  );

  const disabled = isSubmitting || mutation.isPending || kpaySubmitting;

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto space-y-5">
        <div className="skeleton h-10 rounded-lg" />
        <div className="skeleton h-64 rounded-xl" />
      </div>
    );
  }

  if (!clientData) {
    return (
      <div className="max-w-2xl mx-auto text-center py-16">
        <p className="text-[14px] text-text-muted">Client introuvable.</p>
        <Link to="/clients/queue" className="btn-primary mt-4 text-[13px]">
          Retour à la file
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/clients/queue')}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-border text-text-muted hover:border-border-strong hover:text-text transition-colors"
          aria-label="Retour à la file d'attente"
        >
          <ArrowLeft size={17} aria-hidden />
        </button>
        <div>
          <h1 className="text-[18px] font-extrabold text-primary leading-tight">
            Compléter le récit
          </h1>
          <p className="text-[12px] text-text-muted">Reprise du dossier existant</p>
        </div>
      </div>

      {/* Stepper */}
      <OnboardingStepper currentStep={1} />

      {/* Infos client (lecture seule) */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-[13px] font-bold text-amber-700 flex-shrink-0">
          {clientData.prenom?.[0]}{clientData.nom?.[0]}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <User size={13} className="text-amber-600" />
            <p className="text-[14px] font-bold text-amber-900">
              {clientData.prenom} {clientData.nom}
            </p>
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full">
              <Clock size={10} /> Récit manquant
            </span>
          </div>
          <p className="text-[12px] text-amber-700 mt-0.5">{clientData.telephone}</p>
          <p className="text-[11px] text-amber-600 mt-0.5">Site : {clientData.site?.nom ?? '—'}</p>
        </div>
      </div>

      {/* Formulaire de paiement */}
      <div className="min-w-0 rounded-xl border border-border bg-white shadow-sm p-6">
        <h2 className="text-[15px] font-bold text-primary mb-5">
          Achat du Récit
        </h2>

        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} noValidate className="space-y-5">

          {/* Montant */}
          <div className="form-group">
            <label htmlFor="montantRecit" className="form-label">Montant payé * (CDF)</label>
            <input
              id="montantRecit"
              type="number"
              min={1}
              placeholder="ex: 5 000"
              disabled={disabled}
              className={fieldCls(!!errors.montantRecit)}
              {...register('montantRecit', { valueAsNumber: true })}
            />
            {errors.montantRecit && <p className="form-error">{errors.montantRecit.message}</p>}
          </div>

          {/* Mode paiement */}
          <div className="form-group">
            <p className="form-label">Mode de paiement *</p>
            <div className="grid grid-cols-2 gap-2">
              {([{ value: 'CASH', label: 'Cash' }, { value: 'KPAY', label: 'Paiement mobile' }] as const).map((m) => (
                <label
                  key={m.value}
                  className={cn(
                    'flex min-h-11 items-center justify-center px-3 py-2 border-2 rounded-lg cursor-pointer text-[12px] font-semibold text-center transition-colors',
                    'has-[:checked]:border-primary-accent has-[:checked]:bg-primary-light/40 has-[:checked]:text-primary-accent',
                    'border-border text-text-muted hover:border-border-strong',
                  )}
                >
                  <input
                    type="radio"
                    value={m.value}
                    className="sr-only"
                    disabled={disabled}
                    {...register('modePaiement')}
                  />
                  {m.label}
                </label>
              ))}
            </div>
          </div>

          {/* Mobile Money */}
          {modePaiement === 'KPAY' && (
            <MobileMoneyPaymentForm
              amount={Number(watch('montantRecit') || 0)}
              currency="CDF"
              submitting={kpaySubmitting}
              onSubmit={handleKpaySubmit}
            />
          )}

          {/* Actions */}
          <div className="flex items-center justify-between gap-3 pt-2 border-t border-border">
            <Link to="/clients/queue" className="btn-secondary text-[13px]" tabIndex={disabled ? -1 : undefined}>
              Annuler
            </Link>
            {modePaiement !== 'KPAY' && (
              <button
                type="submit"
                disabled={disabled}
                className="btn-primary text-[13px] flex items-center gap-2"
              >
                {disabled && <Loader2 size={14} className="animate-spin" aria-hidden />}
                {disabled ? 'Enregistrement…' : 'Compléter le récit'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
