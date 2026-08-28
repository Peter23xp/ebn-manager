import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Building2, Plus, Pencil, Users, ShoppingBag, MapPin,
  CheckCircle, AlertCircle, RefreshCw, X, Power, PowerOff,
  ChevronDown, Globe,
} from 'lucide-react';
import { sitesApi, usersApi, type SiteWithCounts, type CreateSitePayload, type UpdateSitePayload } from '@/lib/settings.api';
import { cn, formatDate } from '@/lib/utils';
import { getErrorMessage } from '@/lib/api';

// ── Toast ──────────────────────────────────────────────────────────
function Toast({ msg, ok, onDismiss }: { msg: string; ok: boolean; onDismiss: () => void }) {
  return (
    <div role="alert" className={cn(
      'fixed bottom-4 left-4 right-4 sm:bottom-6 sm:left-auto sm:right-6 z-[60] flex items-center gap-3 rounded-xl px-5 py-3 text-sm font-semibold shadow-xl text-white sm:max-w-sm',
      ok ? 'bg-success' : 'bg-danger',
    )}>
      {ok ? <CheckCircle size={16} className="flex-shrink-0" /> : <AlertCircle size={16} className="flex-shrink-0" />}
      <span className="flex-1">{msg}</span>
      <button onClick={onDismiss} aria-label="Fermer la notification" className="ml-1 flex min-h-8 min-w-8 items-center justify-center rounded-md opacity-70 hover:opacity-100"><X size={14} /></button>
    </div>
  );
}

// ── Stat card ──────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, color }: {
  label: string; value: string | number; icon: React.ElementType; color: string;
}) {
  return (
    <div className="card flex items-center gap-4 py-4">
      <div className={cn('flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl', color)}>
        <Icon size={18} aria-hidden />
      </div>
      <div>
        <p className="text-[22px] font-black text-primary leading-none">{value}</p>
        <p className="text-xs text-text-muted mt-0.5">{label}</p>
      </div>
    </div>
  );
}

// ── Confirm ────────────────────────────────────────────────────────
function ConfirmDialog({ open, title, message, confirmLabel, danger, onConfirm, onCancel, loading }: {
  open: boolean; title: string; message: string; confirmLabel: string;
  danger?: boolean; onConfirm: () => void; onCancel: () => void; loading?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" role="dialog" aria-modal="true">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4 max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <h3 className="font-bold text-primary">{title}</h3>
        <p className="text-sm text-text-muted">{message}</p>
        <div className="flex gap-3 pt-1">
          <button className="btn-secondary flex-1" onClick={onCancel} disabled={loading}>Annuler</button>
          <button className={cn('btn flex-1', danger ? 'btn-danger' : 'btn-primary')} onClick={onConfirm} disabled={loading}>
            {loading ? <RefreshCw size={14} className="animate-spin" /> : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── SiteDialog ─────────────────────────────────────────────────────
const siteSchema = z.object({
  nom: z.string().min(2, 'Nom trop court'),
  ville: z.string().min(2, 'Ville requise'),
  adresse: z.string().optional(),
  gerantId: z.string().optional(),
});
type SiteForm = z.infer<typeof siteSchema>;

function SiteDialog({ mode, site, onClose, onSaved }: {
  mode: 'create' | 'edit'; site?: SiteWithCounts; onClose: () => void; onSaved: (name: string) => void;
}) {
  const qc = useQueryClient();
  const { data: gerants } = useQuery({
    queryKey: ['users', 'GERANT'],
    queryFn: () => usersApi.getAll({ role: 'GERANT', actif: 'true' }),
  });

  const { register, handleSubmit, formState: { errors, isDirty } } = useForm<SiteForm>({
    resolver: zodResolver(siteSchema),
    defaultValues: site ? { nom: site.nom, ville: site.ville, adresse: site.adresse ?? '', gerantId: '' } : {},
  });

  const mutation = useMutation({
    mutationFn: (data: SiteForm) => {
      const payload = { ...data, gerantId: data.gerantId || undefined };
      return mode === 'create'
        ? sitesApi.create(payload as CreateSitePayload)
        : sitesApi.update(site!.id, payload as UpdateSitePayload);
    },
    onSuccess: (s) => { qc.invalidateQueries({ queryKey: ['sites'] }); onSaved(s.nom); onClose(); },
  });

  const title = mode === 'create' ? 'Nouveau site' : `Modifier — ${site?.nom}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      role="dialog" aria-modal="true" aria-label={title}>
        <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-light">
              <Building2 size={16} className="text-primary-accent" />
            </div>
            <h2 className="font-bold text-primary">{title}</h2>
          </div>
          <button onClick={onClose} aria-label="Fermer" className="flex min-h-10 min-w-10 items-center justify-center rounded-lg text-text-muted hover:bg-slate-100 transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="form-group sm:col-span-2">
              <label className="form-label" htmlFor="sd-nom">Nom du site</label>
              <input id="sd-nom" {...register('nom')} placeholder="Goma Principal" autoFocus />
              {errors.nom && <p className="form-error">{errors.nom.message}</p>}
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="sd-ville">Ville</label>
              <input id="sd-ville" {...register('ville')} placeholder="Goma" />
              {errors.ville && <p className="form-error">{errors.ville.message}</p>}
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="sd-gerant">Gérant (optionnel)</label>
              <div className="relative">
                <select id="sd-gerant" {...register('gerantId')} className="appearance-none pr-8">
                  <option value="">— Aucun —</option>
                  {(gerants?.data ?? []).map((u) => (
                    <option key={u.id} value={u.id}>{u.nom}</option>
                  ))}
                </select>
                <ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-subtle" />
              </div>
            </div>
            <div className="form-group sm:col-span-2">
              <label className="form-label" htmlFor="sd-adresse">Adresse complète (optionnel)</label>
              <input id="sd-adresse" {...register('adresse')} placeholder="Av. du Commerce, 12 — Goma" />
            </div>
          </div>

          {mutation.isError && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5" role="alert">
              <AlertCircle size={14} className="text-danger flex-shrink-0" />
              <p className="text-xs text-danger">{getErrorMessage(mutation.error)}</p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" className="btn-secondary flex-1" onClick={onClose}>Annuler</button>
            <button
              type="submit"
              className="btn-primary flex-1"
              disabled={mutation.isPending || (mode === 'edit' && !isDirty)}
              aria-label={mode === 'create' ? 'Créer le site' : 'Enregistrer'}
            >
              {mutation.isPending
                ? <><RefreshCw size={14} className="animate-spin" /> Enregistrement…</>
                : mode === 'create' ? 'Créer le site' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── SiteCard ───────────────────────────────────────────────────────
function SiteCard({ site, onEdit, onToggle }: {
  site: SiteWithCounts; onEdit: () => void; onToggle: () => void;
}) {
  return (
    <div className={cn(
      'card flex flex-col gap-0 overflow-hidden p-0 transition-all duration-200 hover:shadow-lg',
      !site.actif && 'opacity-70',
    )} data-testid={`site-card-${site.id}`}>
      {/* Bandeau couleur */}
      <div className={cn(
        'h-1.5 w-full',
        site.actif ? 'bg-primary-accent' : 'bg-slate-200',
      )} />

      <div className="p-5 flex flex-col gap-4 flex-1">
        {/* Entête */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className={cn(
              'flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl',
              site.actif ? 'bg-primary-light' : 'bg-slate-100',
            )}>
              <Building2 size={20} className={site.actif ? 'text-primary-accent' : 'text-slate-400'} />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-text truncate">{site.nom}</p>
              <div className="flex items-center gap-1 text-[11px] text-text-muted mt-0.5">
                <MapPin size={10} />
                <span>{site.ville}</span>
              </div>
            </div>
          </div>
          {site.actif
            ? <span className="badge-success flex-shrink-0">Actif</span>
            : <span className="badge-gray flex-shrink-0">Inactif</span>
          }
        </div>

        {/* Adresse */}
        {site.adresse && (
          <div className="flex items-center gap-1.5 text-[11px] text-text-subtle">
            <Globe size={10} className="flex-shrink-0" />
            <span className="truncate">{site.adresse}</span>
          </div>
        )}

        {/* Stats */}
        {site._count && (
          <div className="grid grid-cols-2 gap-3 py-3 border-y border-border/60">
            <div className="text-center">
              <p className="text-xl font-black text-primary leading-none">{site._count.utilisateurs}</p>
              <p className="text-[10px] text-text-muted mt-0.5 flex items-center justify-center gap-1">
                <Users size={9} /> Agents
              </p>
            </div>
            <div className="text-center">
              <p className="text-xl font-black text-primary leading-none">{site._count.clients}</p>
              <p className="text-[10px] text-text-muted mt-0.5 flex items-center justify-center gap-1">
                <ShoppingBag size={9} /> Clients
              </p>
            </div>
          </div>
        )}

        {/* Date création */}
        <p className="text-[10px] text-text-subtle">Créé le {formatDate(site.createdAt)}</p>

        {/* Actions */}
        <div className="flex gap-2 mt-auto">
          <button
            type="button"
            className="btn-secondary flex-1 text-xs py-2"
            onClick={onEdit}
            aria-label={`Modifier ${site.nom}`}
          >
            <Pencil size={13} /> Modifier
          </button>
          <button
            type="button"
            className={cn(
              'flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all duration-150 border',
              site.actif
                ? 'border-red-200 text-danger hover:bg-red-50'
                : 'border-green-200 text-success hover:bg-green-50',
            )}
            onClick={onToggle}
            aria-label={site.actif ? `Désactiver ${site.nom}` : `Activer ${site.nom}`}
          >
            {site.actif ? <><PowerOff size={13} /> Désactiver</> : <><Power size={13} /> Activer</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── SitesPage ──────────────────────────────────────────────────────
export default function SitesPage() {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<{ mode: 'create' | 'edit'; site?: SiteWithCounts } | null>(null);
  const [confirm, setConfirm] = useState<{ site: SiteWithCounts } | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  };

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['sites'],
    queryFn: () => sitesApi.getAll(),
  });

  const toggleMut = useMutation({
    mutationFn: (site: SiteWithCounts) => sitesApi.update(site.id, { actif: !site.actif }),
    onSuccess: (s) => { qc.invalidateQueries({ queryKey: ['sites'] }); showToast(`${s.nom} ${s.actif ? 'activé' : 'désactivé'}`); setConfirm(null); },
    onError: (e) => { showToast(getErrorMessage(e), false); setConfirm(null); },
  });

  const sites = data?.data ?? [];
  const actifs = sites.filter((s) => s.actif).length;
  const totalUsers = sites.reduce((acc, s) => acc + (s._count?.utilisateurs ?? 0), 0);
  const totalClients = sites.reduce((acc, s) => acc + (s._count?.clients ?? 0), 0);

  return (
    <div className="space-y-6 animate-fade-up">

      {/* ── En-tête ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-light" aria-hidden>
            <Building2 size={20} className="text-primary-accent" />
          </div>
          <div>
            <h1 className="text-page-title text-primary">Gestion des sites</h1>
            <p className="text-xs text-text-muted mt-0.5">Gérez vos points de vente et leurs équipes</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isLoading}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-white text-text-muted hover:border-primary-accent hover:text-primary-accent transition-colors"
            aria-label="Actualiser"
          >
            <RefreshCw size={14} className={cn(isLoading && 'animate-spin')} />
          </button>
          <button
            className="btn-primary"
            onClick={() => setDialog({ mode: 'create' })}
            aria-label="Créer un nouveau site"
          >
            <Plus size={16} /> Nouveau site
          </button>
        </div>
      </div>

      {/* ── Stats ───────────────────────────────────────────────── */}
      {!isLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Sites total" value={sites.length} icon={Building2} color="bg-primary-light text-primary-accent" />
          <StatCard label="Sites actifs" value={actifs} icon={CheckCircle} color="bg-green-100 text-success" />
          <StatCard label="Agents (total)" value={totalUsers} icon={Users} color="bg-sky-100 text-sky-700" />
          <StatCard label="Clients (total)" value={totalClients} icon={ShoppingBag} color="bg-violet-100 text-violet-700" />
        </div>
      )}

      {/* ── Grille ──────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card animate-pulse space-y-4 p-5">
              <div className="flex items-center gap-3">
                <div className="skeleton h-11 w-11 rounded-xl flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-4 w-3/4 rounded-full" />
                  <div className="skeleton h-3 w-1/2 rounded-full" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="skeleton h-12 rounded-lg" />
                <div className="skeleton h-12 rounded-lg" />
              </div>
              <div className="skeleton h-9 w-full rounded-lg" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="card flex flex-col items-center gap-3 py-16" role="alert">
          <AlertCircle size={32} className="text-danger opacity-60" />
          <p className="font-medium text-text">Impossible de charger les sites.</p>
          <button className="btn-secondary flex items-center gap-1.5" onClick={() => refetch()}>
            <RefreshCw size={13} /> Réessayer
          </button>
        </div>
      ) : sites.length === 0 ? (
        <div className="card flex flex-col items-center py-16 text-text-muted" role="status">
          <Building2 size={36} className="mb-3 opacity-20" />
          <p className="font-semibold text-text">Aucun site configuré</p>
          <button className="mt-4 btn-primary" onClick={() => setDialog({ mode: 'create' })}>
            <Plus size={14} /> Créer le premier site
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {sites.map((site) => (
            <SiteCard
              key={site.id}
              site={site}
              onEdit={() => setDialog({ mode: 'edit', site })}
              onToggle={() => setConfirm({ site })}
            />
          ))}
        </div>
      )}

      {/* ── Dialogs ─────────────────────────────────────────────── */}
      {dialog && (
        <SiteDialog
          mode={dialog.mode}
          site={dialog.site}
          onClose={() => setDialog(null)}
          onSaved={(name) => showToast(dialog.mode === 'create' ? `Site "${name}" créé` : `Site "${name}" mis à jour`)}
        />
      )}

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.site.actif ? `Désactiver ${confirm?.site.nom} ?` : `Activer ${confirm?.site.nom} ?`}
        message={
          confirm?.site.actif
            ? 'Les agents de ce site ne pourront plus accéder à l\'application.'
            : 'Ce site sera à nouveau accessible pour ses agents.'
        }
        confirmLabel={confirm?.site.actif ? 'Désactiver' : 'Activer'}
        danger={confirm?.site.actif}
        onConfirm={() => confirm && toggleMut.mutate(confirm.site)}
        onCancel={() => setConfirm(null)}
        loading={toggleMut.isPending}
      />

      {toast && <Toast msg={toast.msg} ok={toast.ok} onDismiss={() => setToast(null)} />}
    </div>
  );
}
