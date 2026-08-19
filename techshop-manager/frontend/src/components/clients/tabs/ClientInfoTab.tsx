import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, KeyRound, Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { cn, formatDate, initials } from '@/lib/utils';
import { ClientStatusBadge } from '@/components/clients/ClientStatusBadge';
import { api } from '@/lib/api';
import type { ClientDetail } from '@/lib/clients.api';

interface ClientInfoTabProps {
  client: ClientDetail;
}

function Field({
  label,
  value,
  mono = false,
  faded = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  faded?: boolean;
}) {
  return (
    <div className="rounded-xl bg-bg border border-border px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted mb-1">{label}</p>
      <p className={cn('text-[13px] font-semibold', mono && 'font-mono', faded && 'text-text-muted italic')}>
        {value ?? <span className="text-text-muted italic font-normal">Non renseigné</span>}
      </p>
    </div>
  );
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {});
}

// ── Bloc réinitialisation PIN ─────────────────────────────────────────────────

function PinResetBlock({ clientId }: { clientId: string }) {
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/portal/auth/clients/${clientId}/set-pin`, { pin, confirmPin }),
    onSuccess: () => {
      toast.success('PIN modifié avec succès.');
      setOpen(false);
      setPin('');
      setConfirmPin('');
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error?.message ?? err?.response?.data?.message;
      toast.error(msg ?? 'Erreur lors de la modification du PIN.');
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      toast.error('Le PIN doit être 4 chiffres.');
      return;
    }
    if (pin !== confirmPin) {
      toast.error('Les PIN ne correspondent pas.');
      return;
    }
    mutation.mutate();
  }

  function handleCancel() {
    setOpen(false);
    setPin('');
    setConfirmPin('');
    mutation.reset();
  }

  return (
    <div className="rounded-xl bg-bg border border-border px-4 py-3 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted mb-0.5">
            Portail client — PIN
          </p>
          <p className="text-[12px] text-text-muted">
            {open ? 'Définir un nouveau PIN à 4 chiffres' : "PIN d'accès au portail client"}
          </p>
        </div>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-[12px] font-semibold text-text-muted hover:border-primary-accent hover:text-primary-accent transition-colors"
          >
            <KeyRound size={13} aria-hidden />
            Modifier le PIN
          </button>
        )}
      </div>

      {open && (
        <form onSubmit={handleSubmit} className="space-y-3 pt-1 border-t border-border">
          {/* Nouveau PIN */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-text-muted uppercase tracking-wide">
              Nouveau PIN
            </label>
            <div className="relative">
              <input
                type={showPin ? 'text' : 'password'}
                inputMode="numeric"
                maxLength={4}
                placeholder="••••"
                value={pin}
                onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                className="w-full pr-10 font-mono tracking-widest text-center text-[18px]"
                autoFocus
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPin(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text transition-colors"
              >
                {showPin ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          {/* Confirmation */}
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-text-muted uppercase tracking-wide">
              Confirmer le PIN
            </label>
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                inputMode="numeric"
                maxLength={4}
                placeholder="••••"
                value={confirmPin}
                onChange={e => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                className={cn(
                  'w-full pr-10 font-mono tracking-widest text-center text-[18px]',
                  confirmPin.length === 4 && confirmPin !== pin && 'border-danger',
                  confirmPin.length === 4 && confirmPin === pin && 'border-success',
                )}
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowConfirm(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text transition-colors"
              >
                {showConfirm ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            {confirmPin.length === 4 && confirmPin !== pin && (
              <p className="text-[11px] text-danger">Les PIN ne correspondent pas.</p>
            )}
            {confirmPin.length === 4 && confirmPin === pin && (
              <p className="text-[11px] text-success flex items-center gap-1">
                <ShieldCheck size={11} /> PIN correspondant
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleCancel}
              disabled={mutation.isPending}
              className="btn-secondary text-[12px] flex-1"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={mutation.isPending || pin.length !== 4 || pin !== confirmPin}
              className="btn-primary text-[12px] flex-1 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {mutation.isPending
                ? <><Loader2 size={13} className="animate-spin" /> Enregistrement…</>
                : <><KeyRound size={13} /> Confirmer</>
              }
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

// ── Tab principal ─────────────────────────────────────────────────────────────

export function ClientInfoTab({ client }: ClientInfoTabProps) {
  return (
    <div className="space-y-6">
      {/* Deux colonnes desktop */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

        {/* Colonne gauche — Infos personnelles */}
        <div className="space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-widest text-text-muted px-1">
            Informations personnelles
          </p>
          <Field label="Prénom"           value={client.prenom} />
          <Field label="Nom"              value={client.nom} />
          <Field label="Téléphone"        value={client.telephone} mono />
          <Field label="Email"            value={client.email || undefined} />
          <Field label="Site d'inscription" value={client.site?.nom} />
          <Field label="Date d'inscription" value={formatDate(client.dateInscription)} />
        </div>

        {/* Colonne droite — Infos commerciales */}
        <div className="space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-widest text-text-muted px-1">
            Informations commerciales
          </p>

          {/* Matricule + copier */}
          <div className="rounded-xl bg-bg border border-border px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted mb-1">Matricule membre</p>
            {client.matricule || client.codeParrain ? (
              <div className="flex items-center justify-between gap-2">
                <p className="text-[13px] font-semibold font-mono text-primary-accent">{client.matricule || client.codeParrain}</p>
                <button
                  type="button"
                  onClick={() => copyToClipboard(client.matricule || client.codeParrain!)}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:text-primary-accent hover:bg-primary-light transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-accent"
                  aria-label="Copier le matricule"
                  title="Copier"
                >
                  <Copy size={13} aria-hidden />
                </button>
              </div>
            ) : (
              <p className="text-[13px] text-text-muted italic font-normal">Non généré (en cours d'adhésion)</p>
            )}
          </div>

          {/* Statut */}
          <div className="rounded-xl bg-bg border border-border px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted mb-1.5">Statut du compte</p>
            <ClientStatusBadge statut={client.statut} />
          </div>

          <Field
            label="Date d'activation"
            value={client.dateActivation ? formatDate(client.dateActivation) : undefined}
          />

          {/* Parrain — lien cliquable */}
          <div className="rounded-xl bg-bg border border-border px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted mb-1">Parrain</p>
            {client.parrain ? (
              <Link
                to={`/clients/${client.parrain.id}`}
                className="flex items-center gap-2 group"
              >
                <span
                  className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold bg-primary-light text-primary-accent"
                  aria-hidden
                >
                  {initials(client.parrain.nom, client.parrain.prenom)}
                </span>
                <span className="text-[13px] font-semibold text-primary-accent group-hover:underline">
                  {client.parrain.prenom} {client.parrain.nom}
                </span>
                <span className="text-[11px] font-mono font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                  {client.parrain.matricule || client.parrain.codeParrain}
                </span>
              </Link>
            ) : (
              <p className="text-[13px] text-text-muted italic font-normal">Aucun parrain</p>
            )}
          </div>
        </div>
      </div>

      {/* PIN portail — uniquement pour les clients ACTIF */}
      {client.statut === 'ACTIF' && (
        <PinResetBlock clientId={client.id} />
      )}

      {/* Notes pleine largeur */}
      <div className="rounded-xl bg-bg border border-border px-4 py-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted mb-2">Notes</p>
        {client.notes ? (
          <p className="text-[13px] text-text whitespace-pre-wrap leading-relaxed">{client.notes}</p>
        ) : (
          <p className="text-[13px] text-text-muted italic">Aucune note pour ce client.</p>
        )}
      </div>
    </div>
  );
}
