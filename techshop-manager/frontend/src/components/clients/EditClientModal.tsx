import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { X, Save, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ClientDetail } from '@/lib/clients.api';
import type { UpdateClientDto } from '@/lib/clients.api';

// getErrorMessage est dans utils.ts — on l'importe depuis api si absent dans utils
// fallback inline si non exporté
function extractApiError(err: unknown): string {
  if (!err) return '';
  if (err instanceof Error) return err.message;
  return 'Une erreur est survenue.';
}

interface EditClientModalProps {
  client: ClientDetail;
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: UpdateClientDto) => void;
  isLoading: boolean;
  error: unknown;
}

interface FormValues {
  prenom: string;
  nom: string;
  telephone: string;
  email: string;
  notes: string;
}

export function EditClientModal({
  client,
  isOpen,
  onClose,
  onSave,
  isLoading,
  error,
}: EditClientModalProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {
      prenom:    client.prenom,
      nom:       client.nom,
      telephone: client.telephone,
      email:     client.email ?? '',
      notes:     client.notes ?? '',
    },
  });

  // Réinitialise le formulaire à chaque ouverture
  useEffect(() => {
    if (isOpen) {
      reset({
        prenom:    client.prenom,
        nom:       client.nom,
        telephone: client.telephone,
        email:     client.email ?? '',
        notes:     client.notes ?? '',
      });
    }
  }, [isOpen, client, reset]);

  if (!isOpen) return null;

  const phoneDisabled = client.hasTransactions;

  const onSubmit = (values: FormValues) => {
    const payload: UpdateClientDto = {
      prenom:    values.prenom.trim(),
      nom:       values.nom.trim(),
      email:     values.email.trim() || undefined,
      notes:     values.notes.trim() || undefined,
    };
    if (!phoneDisabled) {
      payload.telephone = values.telephone.trim();
    }
    onSave(payload);
  };

  const apiError = extractApiError(error);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      aria-hidden="false"
    >
      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-modal-title"
        className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-2xl bg-white shadow-2xl border border-border"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <h2 id="edit-modal-title" className="text-[15px] font-bold text-primary">
            Modifier le client
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:text-text hover:bg-bg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-accent"
            aria-label="Fermer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col flex-1 min-h-0">
          <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">

            {/* Erreur API globale */}
            {apiError && (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3" role="alert">
                <AlertCircle size={15} className="text-danger flex-shrink-0 mt-0.5" aria-hidden />
                <p className="text-[12px] text-danger">{apiError}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              {/* Prénom */}
              <div className="form-group">
                <label htmlFor="edit-prenom" className="form-label">Prénom *</label>
                <input
                  id="edit-prenom"
                  type="text"
                  autoComplete="given-name"
                  className={cn(errors.prenom && 'border-danger focus:ring-danger/30 focus:border-danger')}
                  {...register('prenom', {
                    required: 'Le prénom est requis.',
                    minLength: { value: 2, message: 'Minimum 2 caractères.' },
                  })}
                />
                {errors.prenom && <p className="form-error">{errors.prenom.message}</p>}
              </div>

              {/* Nom */}
              <div className="form-group">
                <label htmlFor="edit-nom" className="form-label">Nom *</label>
                <input
                  id="edit-nom"
                  type="text"
                  autoComplete="family-name"
                  className={cn(errors.nom && 'border-danger focus:ring-danger/30 focus:border-danger')}
                  {...register('nom', {
                    required: 'Le nom est requis.',
                    minLength: { value: 2, message: 'Minimum 2 caractères.' },
                  })}
                />
                {errors.nom && <p className="form-error">{errors.nom.message}</p>}
              </div>
            </div>

            {/* Téléphone */}
            <div className="form-group">
              <label htmlFor="edit-telephone" className="form-label">Téléphone</label>
              <div className="relative">
                <input
                  id="edit-telephone"
                  type="tel"
                  disabled={phoneDisabled}
                  className={cn(
                    phoneDisabled && 'opacity-50 cursor-not-allowed bg-bg',
                    errors.telephone && 'border-danger',
                  )}
                  {...register('telephone', {
                    validate: (v) =>
                      phoneDisabled ||
                      /^\+243[0-9]{9}$/.test(v) ||
                      'Format attendu : +243XXXXXXXXX',
                  })}
                />
                {phoneDisabled && (
                  <p className="text-[11px] text-text-muted mt-1">
                    Le téléphone ne peut pas être modifié car des transactions y sont associées.
                  </p>
                )}
              </div>
              {errors.telephone && <p className="form-error">{errors.telephone.message}</p>}
            </div>

            {/* Email */}
            <div className="form-group">
              <label htmlFor="edit-email" className="form-label">Email</label>
              <input
                id="edit-email"
                type="email"
                autoComplete="email"
                placeholder="optionnel"
                className={cn(errors.email && 'border-danger')}
                {...register('email', {
                  validate: (v) =>
                    !v ||
                    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ||
                    'Adresse email invalide.',
                })}
              />
              {errors.email && <p className="form-error">{errors.email.message}</p>}
            </div>

            {/* Notes */}
            <div className="form-group">
              <label htmlFor="edit-notes" className="form-label">Notes</label>
              <textarea
                id="edit-notes"
                rows={3}
                maxLength={500}
                placeholder="Remarques internes…"
                className="resize-none min-h-[unset]"
                {...register('notes')}
              />
            </div>

            {/* Champs en lecture seule */}
            <div className="rounded-lg bg-bg border border-border px-4 py-3 space-y-1.5">
              <p className="text-[11px] font-bold uppercase tracking-wide text-text-muted mb-2">
                Champs non modifiables
              </p>
              {(client.matricule || client.codeParrain) && (
                <div className="flex justify-between text-[12px]">
                  <span className="text-text-muted">Matricule membre</span>
                  <span className="font-mono font-semibold text-primary">{client.matricule || client.codeParrain}</span>
                </div>
              )}
              <div className="flex justify-between text-[12px]">
                <span className="text-text-muted">Site d'inscription</span>
                <span className="font-semibold text-text">{client.site?.nom ?? '—'}</span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="btn-secondary text-[13px]"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary text-[13px] flex items-center gap-1.5"
            >
              {isLoading ? (
                <>
                  <span className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden />
                  Enregistrement…
                </>
              ) : (
                <>
                  <Save size={13} aria-hidden />
                  Enregistrer
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
