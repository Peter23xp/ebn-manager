import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import type { UseFormRegister, FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { isAxiosError } from 'axios';
import { z } from 'zod';
import { KeyRound, CheckCircle, AlertCircle, X, Save, Eye, EyeOff } from 'lucide-react';
import { usersApi } from '@/lib/settings.api';
import { useAuthStore } from '@/store/auth.store';
import { SettingsPageLayout } from '@/components/settings/SettingsPageLayout';
import { UserRoleBadge } from '@/components/settings/UserRoleBadge';
import type { AuthUser, Utilisateur } from '@/types';
import { cn, formatDate, formatRelative } from '@/lib/utils';
import { getErrorMessage } from '@/lib/api';
import './settings-profile.css';

const profileSchema = z.object({
  nom: z.string().min(2, 'Nom trop court'),
  email: z.string().email('Email invalide').or(z.literal('')),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Requis'),
  newPassword: z.string()
    .min(8, 'Minimum 8 caractères')
    .regex(/^(?=.*[A-Z])(?=.*\d)/, 'Au moins une majuscule et un chiffre'),
  confirmPassword: z.string().min(1, 'Requis'),
}).refine(data => data.newPassword === data.confirmPassword, {
  message: 'Les mots de passe ne correspondent pas',
  path: ['confirmPassword'],
});

type ProfileForm = z.infer<typeof profileSchema>;
type PasswordForm = z.infer<typeof passwordSchema>;
type Feedback = { msg: string; ok: boolean };

function InlineAlert({ msg, ok, onDismiss }: Feedback & { onDismiss: () => void }) {
  return (
    <div role={ok ? 'status' : 'alert'} className={cn('profile-feedback', ok ? 'profile-feedback-success' : 'profile-feedback-error')}>
      {ok ? <CheckCircle size={18} aria-hidden="true" /> : <AlertCircle size={18} aria-hidden="true" />}
      <span>{msg}</span>
      <button type="button" onClick={onDismiss} aria-label="Fermer le message" className="profile-icon-button">
        <X size={18} aria-hidden="true" />
      </button>
    </div>
  );
}

function IdentitySummary({ user, me }: { user: AuthUser; me: Utilisateur & { createdAt?: string } }) {
  const siteName = me.site?.nom ?? user.siteName;
  return (
    <section className="settings-panel profile-identity" aria-labelledby="profile-identity-title">
      <div className="profile-identity-heading">
        <h2 id="profile-identity-title" className="settings-section-title">Votre compte</h2>
        <p className="profile-identity-name">{me.nom}</p>
        <UserRoleBadge role={user.role} />
      </div>
      <dl className="profile-identity-details">
        <div>
          <dt>Téléphone</dt>
          <dd>{me.telephone || 'Non renseigné'}</dd>
        </div>
        {siteName && <div><dt>Site de rattachement</dt><dd>{siteName}</dd></div>}
        {me.derniereConnexion && (
          <div><dt>Dernière connexion</dt><dd>{formatRelative(me.derniereConnexion)}</dd></div>
        )}
        {me.createdAt && <div><dt>Membre depuis</dt><dd>{formatDate(me.createdAt)}</dd></div>}
      </dl>
    </section>
  );
}

function ProfileInfoForm({ me }: { me: Utilisateur }) {
  const queryClient = useQueryClient();
  const { user: authUser, setAuth, accessToken } = useAuthStore();
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const { register, handleSubmit, reset, formState: { errors, isDirty } } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    values: { nom: me.nom, email: me.email ?? '' },
  });

  const mutation = useMutation({
    mutationFn: (data: ProfileForm) => usersApi.updateProfile({ ...data, email: data.email || undefined }),
    onSuccess: updated => {
      queryClient.invalidateQueries({ queryKey: ['users', 'me'] });
      if (authUser && accessToken) setAuth({ ...authUser, name: updated.nom }, accessToken);
      reset({ nom: updated.nom, email: updated.email ?? '' });
      setFeedback({ msg: 'Profil mis à jour avec succès', ok: true });
    },
    onError: error => setFeedback({ msg: getErrorMessage(error), ok: false }),
  });

  return (
    <form
      noValidate
      aria-labelledby="profile-info-title"
      aria-busy={mutation.isPending}
      className="profile-form"
      onSubmit={handleSubmit(data => { setFeedback(null); mutation.mutate(data); })}
    >
      <fieldset className="settings-form-grid" disabled={mutation.isPending}>
        <div className="form-group">
          <label className="form-label" htmlFor="pf-nom">Nom complet</label>
          <input
            id="pf-nom"
            autoComplete="name"
            {...register('nom')}
            aria-invalid={!!errors.nom}
            aria-describedby={errors.nom ? 'pf-nom-error' : undefined}
          />
          {errors.nom && <p id="pf-nom-error" className="form-error">{errors.nom.message}</p>}
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="pf-email">Email <span className="profile-optional">(optionnel)</span></label>
          <input
            id="pf-email"
            type="email"
            autoComplete="email"
            {...register('email')}
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? 'pf-email-error' : undefined}
          />
          {errors.email && <p id="pf-email-error" className="form-error">{errors.email.message}</p>}
        </div>
      </fieldset>
      <p className="settings-description">Le téléphone et le rôle sont gérés par votre administrateur.</p>
      {feedback && <InlineAlert {...feedback} onDismiss={() => setFeedback(null)} />}
      <div className="settings-form-actions">
        <button type="submit" className="btn-primary" disabled={mutation.isPending || !isDirty}>
          <Save size={16} aria-hidden="true" />
          {mutation.isPending ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        {isDirty && !mutation.isPending && <span className="settings-description">Modifications non sauvegardées</span>}
      </div>
    </form>
  );
}

function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  const checks = [
    { label: '8 caractères minimum', ok: password.length >= 8 },
    { label: 'Une majuscule', ok: /[A-Z]/.test(password) },
    { label: 'Un chiffre', ok: /\d/.test(password) },
    { label: 'Un caractère spécial (facultatif)', ok: /[^A-Za-z0-9]/.test(password) },
  ];
  const score = checks.filter(check => check.ok).length;
  const labels = ['Très faible', 'Faible', 'Moyen', 'Bon', 'Fort'];
  return (
    <div className="profile-password-strength">
      <p>Robustesse indicative : <strong>{labels[score]}</strong></p>
      <ul>
        {checks.map(check => (
          <li key={check.label} className={check.ok ? 'profile-rule-met' : undefined}>
            <span aria-hidden="true">{check.ok ? '✓' : '○'}</span>
            <span className="sr-only">{check.ok ? 'Respecté : ' : 'Non rempli : '}</span>
            {check.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PasswordField({
  id, label, toggleLabel, field, show, onToggle, autoComplete, hint, register, errors,
}: {
  id: string;
  label: string;
  toggleLabel: string;
  field: keyof PasswordForm;
  show: boolean;
  onToggle: () => void;
  autoComplete: string;
  hint?: ReactNode;
  register: UseFormRegister<PasswordForm>;
  errors: FieldErrors<PasswordForm>;
}) {
  const description = [errors[field] && `${id}-error`, hint && `${id}-hint`].filter(Boolean).join(' ') || undefined;
  return (
    <div className="form-group">
      <label className="form-label" htmlFor={id}>{label}</label>
      <div className="profile-password-control">
        <input
          id={id}
          type={show ? 'text' : 'password'}
          {...register(field)}
          autoComplete={autoComplete}
          aria-invalid={!!errors[field]}
          aria-describedby={description}
        />
        <button
          type="button"
          onClick={onToggle}
          aria-label={`${show ? 'Masquer' : 'Afficher'} ${toggleLabel}`}
          aria-controls={id}
          className="profile-icon-button"
        >
          {show ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
        </button>
      </div>
      {errors[field] && <p id={`${id}-error`} className="form-error">{errors[field]?.message}</p>}
      {hint && <div id={`${id}-hint`}>{hint}</div>}
    </div>
  );
}

function ChangePasswordForm() {
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });
  const newPassword = watch('newPassword', '');

  const mutation = useMutation({
    mutationFn: (data: PasswordForm) => usersApi.changePassword({ currentPassword: data.currentPassword, newPassword: data.newPassword }),
    onSuccess: () => {
      reset();
      setShowCurrent(false);
      setShowNew(false);
      setShowConfirm(false);
      setFeedback({ msg: 'Mot de passe modifié avec succès', ok: true });
    },
    onError: error => setFeedback({ msg: getErrorMessage(error), ok: false }),
  });

  return (
    <form
      noValidate
      aria-labelledby="profile-security-title"
      aria-busy={mutation.isPending}
      className="profile-form"
      onSubmit={handleSubmit(data => { setFeedback(null); mutation.mutate(data); })}
    >
      <fieldset className="profile-password-fields" disabled={mutation.isPending}>
        <PasswordField
          id="cp-current" label="Mot de passe actuel" toggleLabel="le mot de passe actuel"
          field="currentPassword" show={showCurrent} onToggle={() => setShowCurrent(value => !value)}
          autoComplete="current-password" register={register} errors={errors}
        />
        <PasswordField
          id="cp-new" label="Nouveau mot de passe" toggleLabel="le nouveau mot de passe"
          field="newPassword" show={showNew} onToggle={() => setShowNew(value => !value)}
          autoComplete="new-password" register={register} errors={errors}
          hint={(
            <>
              <p className="settings-description">Au moins 8 caractères, une majuscule et un chiffre.</p>
              <PasswordStrength password={newPassword} />
            </>
          )}
        />
        <PasswordField
          id="cp-confirm" label="Confirmer le nouveau mot de passe" toggleLabel="la confirmation du mot de passe"
          field="confirmPassword" show={showConfirm} onToggle={() => setShowConfirm(value => !value)}
          autoComplete="new-password" register={register} errors={errors}
        />
      </fieldset>
      {feedback && <InlineAlert {...feedback} onDismiss={() => setFeedback(null)} />}
      <div className="settings-form-actions">
        <button type="submit" className="btn-primary" disabled={mutation.isPending}>
          <KeyRound size={16} aria-hidden="true" />
          {mutation.isPending ? 'Modification…' : 'Changer le mot de passe'}
        </button>
      </div>
    </form>
  );
}

export default function ProfilPage() {
  const { user: authUser } = useAuthStore();
  const [activeSection, setActiveSection] = useState<'info' | 'securite'>('info');
  const [blocked, setBlocked] = useState(false);
  const { data: me, isLoading, isError, isSuccess, error, isFetching, refetch } = useQuery({
    queryKey: ['users', 'me'],
    queryFn: () => usersApi.me(),
    enabled: !!authUser,
  });
  const responseDenied = isAxiosError(error) && error.response?.status === 403;
  useEffect(() => {
    if (responseDenied) setBlocked(true);
    else if (isSuccess) setBlocked(false);
  }, [responseDenied, isSuccess]);
  const accessDenied = responseDenied || blocked;
  if (!authUser) return null;

  return (
    <SettingsPageLayout active="profile" title="Mon profil" description="Gérez vos informations personnelles et le mot de passe de votre compte.">
      <div className="settings-profile">
        {isLoading ? (
          <div className="settings-panel profile-loading" role="status">
            <p className="settings-description">Chargement du profil…</p>
            <div className="profile-loading-lines" aria-hidden="true"><span /><span /><span /></div>
          </div>
        ) : accessDenied || !me ? (
          <div className="settings-notice profile-load-error" role="alert" aria-busy={isFetching}>
            <h2 className="settings-section-title">{accessDenied ? 'Accès au profil refusé' : 'Impossible de charger votre profil'}</h2>
            <p className="settings-description">
              {accessDenied ? 'Vous n’avez pas accès à ces informations. Contactez votre administrateur.' : 'Vos informations ne sont pas disponibles. Réessayez avant de les modifier.'}
            </p>
            <button type="button" className="btn-secondary" onClick={() => void refetch()} disabled={isFetching}>
              {isFetching ? 'Chargement…' : 'Réessayer'}
            </button>
          </div>
        ) : (
          <>
            {isError && (
              <div className="settings-notice profile-load-error" role="alert" aria-busy={isFetching}>
                <p>Impossible d’actualiser le profil. Vos modifications en cours sont conservées.</p>
                <button type="button" className="btn-secondary" onClick={() => void refetch()} disabled={isFetching}>Réessayer</button>
              </div>
            )}
            <IdentitySummary user={authUser} me={me} />
            <div className="settings-tabs" role="group" aria-label="Sections du profil">
              <button type="button" aria-pressed={activeSection === 'info'} aria-controls="profile-section" onClick={() => setActiveSection('info')}>Informations</button>
              <button type="button" aria-pressed={activeSection === 'securite'} aria-controls="profile-section" onClick={() => setActiveSection('securite')}>Sécurité</button>
            </div>
            <section id="profile-section" className="settings-panel" aria-labelledby={activeSection === 'info' ? 'profile-info-title' : 'profile-security-title'}>
              {activeSection === 'info' ? (
                <>
                  <header className="profile-section-heading">
                    <h2 id="profile-info-title" className="settings-section-title">Informations personnelles</h2>
                    <p className="settings-description">Mettez à jour votre nom et votre adresse email.</p>
                  </header>
                  <ProfileInfoForm me={me} />
                </>
              ) : (
                <>
                  <header className="profile-section-heading">
                    <h2 id="profile-security-title" className="settings-section-title">Sécurité du compte</h2>
                    <p className="settings-description">Choisissez un mot de passe unique que vous n’utilisez pas ailleurs.</p>
                  </header>
                  <ChangePasswordForm />
                </>
              )}
            </section>
          </>
        )}
      </div>
    </SettingsPageLayout>
  );
}
