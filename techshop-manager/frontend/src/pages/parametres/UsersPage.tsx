import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  UserCog, Plus, Search, RotateCcw, Lock, Unlock, X,
  CheckCircle, AlertCircle, RefreshCw, ChevronDown,
  Users, ShieldCheck, Eye, EyeOff, Pencil,
} from 'lucide-react';
import { usersApi, sitesApi, type CreateUserPayload, type UpdateUserPayload } from '@/lib/settings.api';
import { UserRoleBadge } from '@/components/settings/UserRoleBadge';
import { cn, formatRelative, initials } from '@/lib/utils';
import { getErrorMessage } from '@/lib/api';
import type { Role, Utilisateur } from '@/types';
import { requiresAssignedSite } from '@/lib/roles';
import { SettingsPageLayout, SettingsSummary } from '@/components/settings/SettingsPageLayout';
import { SettingsDialog } from '@/components/settings/SettingsDialog';
import './settings-directory.css';

// ── Constants ──────────────────────────────────────────────────────
const ALL_ROLES: Role[] = ['SUPER_ADMIN', 'DIRECTEUR_REGIONAL', 'GERANT', 'CAISSIER', 'AGENT', 'FORMATEUR'];
const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: 'Super Admin', DIRECTEUR_REGIONAL: 'Dir. Régional',
  GERANT: 'Gérant', CAISSIER: 'Caissier', AGENT: 'Agent', FORMATEUR: 'Formateur', CLIENT: 'Client',
};

// ── Helpers ────────────────────────────────────────────────────────
function UserAvatar({ nom }: { nom: string }) {
  return <span className="settings-user-avatar" aria-hidden="true">{initials(nom)}</span>;
}

function Toast({ msg, ok, onDismiss }: { msg: string; ok: boolean; onDismiss: () => void }) {
  return createPortal(
    <div role="alert" className={cn(
      'settings-toast',
      ok ? 'bg-success' : 'bg-danger',
    )}>
      {ok ? <CheckCircle size={16} className="flex-shrink-0" /> : <AlertCircle size={16} className="flex-shrink-0" />}
      <span className="flex-1">{msg}</span>
      <button onClick={onDismiss} aria-label="Fermer la notification">
        <X size={14} />
      </button>
    </div>,
    document.body,
  );
}

// ── Confirm dialog ─────────────────────────────────────────────────
function ConfirmDialog({ open, title, message, confirmLabel, danger, onConfirm, onCancel, loading }: {
  open: boolean; title: string; message: string; confirmLabel: string;
  danger?: boolean; onConfirm: () => void; onCancel: () => void; loading?: boolean;
}) {
  if (!open) return null;
  return (
    <SettingsDialog title={title} onClose={onCancel} busy={loading}>
      <header><h2>{title}</h2></header>
      <div className="settings-confirm-content space-y-4">
        <p className="text-sm text-text-muted">{message}</p>
        <div className="settings-form-actions">
          <button className="btn-secondary" onClick={onCancel} disabled={loading}>Annuler</button>
          <button className={danger ? 'btn-danger' : 'btn-primary'} onClick={onConfirm} disabled={loading}>{loading ? 'Enregistrement…' : confirmLabel}</button>
        </div>
      </div>
    </SettingsDialog>
  );
}

const createSchema = z.object({
  nom: z.string().min(2, 'Nom trop court (min 2 caractères)'),
  telephone: z.string().regex(/^\+243\d{9}$/, 'Format requis : +243XXXXXXXXX'),
  role: z.enum(['SUPER_ADMIN', 'DIRECTEUR_REGIONAL', 'GERANT', 'CAISSIER', 'AGENT', 'FORMATEUR']),
  siteId: z.string().optional(),
  passwordTemp: z.string().min(8, 'Minimum 8 caractères'),
}).refine((data) => !requiresAssignedSite(data.role) || !!data.siteId?.trim(), {
  message: 'Le site est obligatoire', path: ['siteId'],
});
type CreateForm = z.infer<typeof createSchema>;

function CreateUserDialog({ open, onClose, onCreated }: {
  open: boolean; onClose: () => void; onCreated: (tempPwd: string) => void;
}) {
  const qc = useQueryClient();
  const [showPwd, setShowPwd] = useState(false);
  const { data: sitesData } = useQuery({ queryKey: ['sites'], queryFn: () => sitesApi.getAll() });

  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: { role: 'AGENT' },
  });

  const role = watch('role');
  const needsSite = requiresAssignedSite(role);

  const mutation = useMutation({
    mutationFn: (data: CreateUserPayload) => usersApi.create(data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['users'] });
      onCreated(vars.passwordTemp);
      reset();
      onClose();
    },
  });

  const onSubmit = (data: CreateForm) => {
    const payload: CreateUserPayload = {
      nom: data.nom,
      telephone: data.telephone,
      role: data.role,
      passwordTemp: data.passwordTemp,
      ...(needsSite && data.siteId ? { siteId: data.siteId } : {}),
    };
    mutation.mutate(payload);
  };

  if (!open) return null;

  return (
    <SettingsDialog title="Créer un utilisateur" onClose={onClose} busy={mutation.isPending}>
        <header>
          <h2>Nouvel utilisateur</h2>
          <button onClick={onClose} disabled={mutation.isPending} className="btn-ghost !px-2" aria-label="Fermer">
            <X size={16} />
          </button>
        </header>

        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          <div className="grid grid-cols-1 gap-4">
            <div className="form-group">
              <label className="form-label" htmlFor="cu-nom">Nom complet</label>
              <input id="cu-nom" {...register('nom')} placeholder="Jean Mutombo" autoFocus />
              {errors.nom && <p className="form-error">{errors.nom.message}</p>}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="cu-tel">Téléphone</label>
              <input id="cu-tel" {...register('telephone')} placeholder="+243900000001" />
              {errors.telephone && <p className="form-error">{errors.telephone.message}</p>}
            </div>

            <div className="settings-form-grid">
              <div className="form-group">
                <label className="form-label" htmlFor="cu-role">Rôle</label>
                <div className="relative">
                  <select id="cu-role" {...register('role')} className="appearance-none pr-8">
                    {ALL_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                  </select>
                  <ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-subtle" />
                </div>
                {errors.role && <p className="form-error">{errors.role.message}</p>}
              </div>

              {needsSite && (
                <div className="form-group">
                  <label className="form-label" htmlFor="cu-site">Site</label>
                  <div className="relative">
                    <select id="cu-site" {...register('siteId')} className="appearance-none pr-8">
                      <option value="">— Aucun —</option>
                      {sitesData?.data.filter(s => s.actif).map((s) => (
                        <option key={s.id} value={s.id}>{s.nom}</option>
                      ))}
                    </select>
                    <ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-subtle" />
                  </div>
                  {errors.siteId && <p className="form-error">{errors.siteId.message}</p>}
                </div>
              )}
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="cu-pwd">Mot de passe temporaire</label>
              <div className="relative">
                <input
                  id="cu-pwd"
                  type={showPwd ? 'text' : 'password'}
                  {...register('passwordTemp')}
                  placeholder="Min. 8 caractères"
                  className="!pr-14"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(v => !v)}
                  className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center text-text-muted"
                  aria-label={showPwd ? 'Masquer le mot de passe temporaire' : 'Afficher le mot de passe temporaire'}
                  aria-pressed={showPwd}
                >
                  {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {errors.passwordTemp && <p className="form-error">{errors.passwordTemp.message}</p>}
              <p className="text-[11px] text-text-subtle mt-1">L'utilisateur devra changer ce mot de passe à la première connexion.</p>
            </div>
          </div>

          {mutation.isError && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5" role="alert">
              <AlertCircle size={14} className="text-danger flex-shrink-0" />
              <p className="text-xs text-danger">{getErrorMessage(mutation.error)}</p>
            </div>
          )}

          <div className="settings-form-actions">
            <button type="button" className="btn-secondary flex-1" onClick={onClose} disabled={mutation.isPending}>Annuler</button>
            <button type="submit" className="btn-primary flex-1" disabled={mutation.isPending} aria-label="Valider la création">
              {mutation.isPending ? <><RefreshCw size={14} className="animate-spin" /> Création…</> : 'Créer l\'utilisateur'}
            </button>
          </div>
        </form>
    </SettingsDialog>
  );
}

// ── EditUserDialog ─────────────────────────────────────────────────
const editSchema = z.object({
  nom: z.string().min(2, 'Nom trop court (min 2 caractères)'),
  email: z.string().email('Email invalide').or(z.literal('')).optional(),
  role: z.enum(['SUPER_ADMIN', 'DIRECTEUR_REGIONAL', 'GERANT', 'CAISSIER', 'AGENT', 'FORMATEUR']),
  siteId: z.string().optional(),
}).refine((data) => !requiresAssignedSite(data.role) || !!data.siteId?.trim(), {
  message: 'Le site est obligatoire', path: ['siteId'],
});
type EditForm = z.infer<typeof editSchema>;

function EditUserDialog({ user, onClose, onSaved }: {
  user: Utilisateur; onClose: () => void; onSaved: () => void;
}) {
  const qc = useQueryClient();
  const { data: sitesData } = useQuery({ queryKey: ['sites'], queryFn: () => sitesApi.getAll() });

  const { register, handleSubmit, watch, formState: { errors } } = useForm<EditForm>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      nom: user.nom,
      email: user.email ?? '',
      role: user.role as EditForm['role'],
      siteId: user.siteId ?? '',
    },
  });

  const role = watch('role');
  const needsSite = requiresAssignedSite(role);

  const mutation = useMutation({
    mutationFn: (data: EditForm) => {
      const payload: UpdateUserPayload = {
        nom: data.nom,
        email: data.email || undefined,
        role: data.role,
        siteId: needsSite ? (data.siteId || null) : null,
      };
      return usersApi.update(user.id, payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      onSaved();
      onClose();
    },
  });

  return (
    <SettingsDialog title="Modifier l'utilisateur" onClose={onClose} busy={mutation.isPending}>
        <header>
            <div className="min-w-0">
              <h2 className="font-bold text-primary text-[14px] leading-none">Modifier l'utilisateur</h2>
              <p className="text-[11px] text-text-muted mt-0.5">{user.telephone}</p>
            </div>
          <button
            onClick={onClose} disabled={mutation.isPending}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-slate-100 transition-colors"
            aria-label="Fermer"
          >
            <X size={16} />
          </button>
        </header>

        {/* Body scrollable */}
        <form
          onSubmit={handleSubmit((d) => mutation.mutate(d))}
          className="overflow-y-auto flex-1 p-6 space-y-4"
        >
          <div className="form-group">
            <label className="form-label" htmlFor="eu-nom">Nom complet</label>
            <input id="eu-nom" {...register('nom')} autoFocus />
            {errors.nom && <p className="form-error">{errors.nom.message}</p>}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="eu-email">Email <span className="text-text-subtle font-normal">(optionnel)</span></label>
            <input id="eu-email" type="email" {...register('email')} placeholder="user@example.com" />
            {errors.email && <p className="form-error">{errors.email.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="form-group">
              <label className="form-label" htmlFor="eu-role">Rôle</label>
              <div className="relative">
                <select id="eu-role" {...register('role')} className="appearance-none pr-8">
                  {ALL_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
                <ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-subtle" />
              </div>
              {errors.role && <p className="form-error">{errors.role.message}</p>}
            </div>

            {needsSite && (
              <div className="form-group">
                <label className="form-label" htmlFor="eu-site">Site</label>
                <div className="relative">
                  <select id="eu-site" {...register('siteId')} className="appearance-none pr-8">
                    <option value="">— Aucun —</option>
                    {sitesData?.data.filter(s => s.actif).map((s) => (
                      <option key={s.id} value={s.id}>{s.nom}</option>
                    ))}
                  </select>
                  <ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-subtle" />
                </div>
                {errors.siteId && <p className="form-error">{errors.siteId.message}</p>}
              </div>
            )}
          </div>

          {mutation.isError && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5" role="alert">
              <AlertCircle size={14} className="text-danger flex-shrink-0" />
              <p className="text-xs text-danger">{getErrorMessage(mutation.error)}</p>
            </div>
          )}

          <div className="settings-form-actions">
            <button type="button" className="btn-secondary flex-1" onClick={onClose} disabled={mutation.isPending}>Annuler</button>
            <button type="submit" className="btn-primary flex-1" disabled={mutation.isPending}>
              {mutation.isPending ? <><RefreshCw size={14} className="animate-spin" /> Enregistrement…</> : 'Enregistrer'}
            </button>
          </div>
        </form>
    </SettingsDialog>
  );
}

// ── UsersPage ──────────────────────────────────────────────────────
export default function UsersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [actifFilter, setActifFilter] = useState<string>('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<Utilisateur | null>(null);
  const [confirm, setConfirm] = useState<{ user: Utilisateur; action: 'desactiver' | 'reactiver' | 'reset' } | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  };

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['users', roleFilter, actifFilter],
    queryFn: () => usersApi.getAll({ role: roleFilter || undefined, actif: actifFilter || undefined }),
  });

  const desactiverMut = useMutation({
    mutationFn: (id: string) => usersApi.desactiver(id),
    onSuccess: (u) => { qc.invalidateQueries({ queryKey: ['users'] }); showToast(`${u.nom} désactivé`); setConfirm(null); },
    onError: (e) => { showToast(getErrorMessage(e), false); setConfirm(null); },
  });

  const reactiverMut = useMutation({
    mutationFn: (id: string) => usersApi.reactiver(id),
    onSuccess: (u) => { qc.invalidateQueries({ queryKey: ['users'] }); showToast(`${u.nom} réactivé`); setConfirm(null); },
    onError: (e) => { showToast(getErrorMessage(e), false); setConfirm(null); },
  });

  const resetMut = useMutation({
    mutationFn: (id: string) => usersApi.resetPassword(id),
    onSuccess: (res) => {
      const msg = res.tempPassword
        ? `Nouveau MDP : ${res.tempPassword}`
        : 'Mot de passe réinitialisé et envoyé par SMS';
      showToast(msg);
      if (res.tempPassword) navigator.clipboard?.writeText(res.tempPassword).catch(() => {});
      setConfirm(null);
    },
    onError: (e) => { showToast(getErrorMessage(e), false); setConfirm(null); },
  });

  const handleConfirmAction = () => {
    if (!confirm) return;
    if (confirm.action === 'desactiver') desactiverMut.mutate(confirm.user.id);
    else if (confirm.action === 'reactiver') reactiverMut.mutate(confirm.user.id);
    else resetMut.mutate(confirm.user.id);
  };

  const users = isError ? [] : data?.data ?? [];
  const ready = !!data && !isError;
  const filtered = users.filter((u) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return u.nom.toLowerCase().includes(q) || u.telephone.includes(q) || (u.email ?? '').toLowerCase().includes(q);
  });

  const total = users.length;
  const actifs = users.filter((u) => u.actif).length;
  const inactifs = total - actifs;
  const admins = users.filter((u) => u.role === 'SUPER_ADMIN').length;

  const isActionLoading = desactiverMut.isPending || reactiverMut.isPending || resetMut.isPending;

  const hasFilters = !!(search || roleFilter || actifFilter);
  const clearFilters = () => { setSearch(''); setRoleFilter(''); setActifFilter(''); searchRef.current?.focus(); };

  return (
    <SettingsPageLayout active="users" title="Gestion des utilisateurs" description="Administrez les accès, les rôles et les affectations de votre équipe."
      action={<button className="btn-primary" onClick={() => setCreateOpen(true)} aria-label="Créer un nouvel utilisateur"><Plus size={16} aria-hidden="true" />Nouvel utilisateur</button>}>
      <SettingsSummary label="Synthèse des utilisateurs" loading={isLoading} items={[
        { label: 'Utilisateurs', value: ready ? total : undefined },
        { label: 'Actifs', value: ready ? actifs : undefined },
        { label: 'Inactifs', value: ready ? inactifs : undefined },
        { label: 'Super administrateurs', value: ready ? admins : undefined },
      ]} note="Totaux selon le rôle et le statut sélectionnés, avant la recherche par nom." />
      <section className="settings-panel settings-toolbar" aria-label="Filtres des utilisateurs">
        <div className="settings-search"><label htmlFor="users-search">Rechercher un utilisateur</label><input id="users-search" ref={searchRef} type="search" placeholder="Nom, téléphone, email…" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
        <div className="settings-filter"><label htmlFor="users-role">Rôle</label><select id="users-role" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} aria-label="Filtrer par rôle"><option value="">Tous les rôles</option>{ALL_ROLES.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}</select></div>
        <div className="settings-filter"><label htmlFor="users-status">Statut</label><select id="users-status" value={actifFilter} onChange={(event) => setActifFilter(event.target.value)} aria-label="Filtrer par statut"><option value="">Tous les statuts</option><option value="true">Actifs</option><option value="false">Inactifs</option></select></div>
        <button className="btn-secondary" onClick={() => refetch()} disabled={isFetching} aria-label="Actualiser"><RefreshCw size={16} className={cn(isFetching && 'animate-spin')} aria-hidden="true" /></button>
        {hasFilters && <button className="btn-secondary" onClick={clearFilters} aria-label="Effacer les filtres">Effacer</button>}
      </section>
      <section className="settings-directory" aria-labelledby="users-list-title">
        <div className="settings-directory-heading"><h2 id="users-list-title" className="settings-section-title">Équipe et accès</h2>{ready && <p className="settings-description" role="status">{filtered.length} sur {users.length} utilisateur{users.length > 1 ? 's' : ''}</p>}</div>
        {isLoading ? <div className="settings-panel space-y-4" role="status" aria-label="Chargement">{[0, 1, 2].map((index) => <div key={index} className="skeleton h-20 w-full" />)}</div>
          : isError ? <div className="settings-panel settings-empty" role="alert"><AlertCircle size={28} /><p>Impossible de charger les utilisateurs.</p><button className="btn-secondary" onClick={() => refetch()}>Réessayer</button></div>
          : !filtered.length ? <div className="settings-panel settings-empty" role="status"><Users size={28} /><h3 className="settings-section-title">{hasFilters ? 'Aucun résultat pour ces critères' : 'Aucun utilisateur trouvé'}</h3><p className="settings-description">{hasFilters ? 'Modifiez la recherche, le rôle ou le statut sélectionné.' : 'Ajoutez un membre à votre équipe pour lui donner accès au système.'}</p>{hasFilters ? <button className="btn-secondary" onClick={clearFilters}>Réinitialiser les filtres</button> : <button className="btn-primary" onClick={() => setCreateOpen(true)}>Créer le premier utilisateur</button>}</div>
          : <div className="settings-users-results"><table className="settings-users-table" role="table" aria-label="Liste des utilisateurs">
            <thead role="rowgroup"><tr role="row"><th scope="col" role="columnheader">Utilisateur</th><th scope="col" role="columnheader">Rôle</th><th scope="col" role="columnheader">Site</th><th scope="col" role="columnheader">Dernière connexion</th><th scope="col" role="columnheader">Statut</th><th scope="col" role="columnheader">Actions</th></tr></thead>
            <tbody role="rowgroup">{filtered.map((user) => <tr key={user.id} role="row">
              <th scope="row" role="rowheader" className="settings-user-identity"><div className="flex items-start gap-3 min-w-0"><UserAvatar nom={user.nom} /><div className="min-w-0"><p className="font-semibold text-text">{user.nom}</p><p className="font-mono text-xs text-text-muted mt-1">{user.telephone}</p>{user.email && <p className="text-xs text-text-muted mt-1">{user.email}</p>}</div></div></th>
              <td role="cell" className="settings-user-role" data-label="Rôle"><UserRoleBadge role={user.role} /></td>
              <td role="cell" className="settings-user-site" data-label="Site">{user.site?.nom ?? 'Non rattaché'}</td>
              <td role="cell" className="settings-user-connection" data-label="Dernière connexion">{user.derniereConnexion ? formatRelative(user.derniereConnexion) : 'Jamais'}</td>
              <td role="cell" className="settings-user-status" data-label="Statut"><span className={user.actif ? 'badge-success' : 'badge-gray'}>{user.actif ? <CheckCircle size={13} aria-hidden="true" /> : <Lock size={13} aria-hidden="true" />}{user.actif ? 'Actif' : 'Inactif'}</span></td>
              <td role="cell" className="settings-user-actions"><div>
                <button className="btn-secondary" onClick={() => setEditUser(user)} aria-label={`Modifier ${user.nom}`}><Pencil size={14} aria-hidden="true" />Modifier</button>
                <button className="btn-secondary" onClick={() => setConfirm({ user, action: 'reset' })} aria-label={`Réinitialiser le mot de passe de ${user.nom}`}><RotateCcw size={14} aria-hidden="true" />Mot de passe</button>
                <button className={cn('btn-secondary', user.actif ? '!text-red-700' : '!text-green-700')} onClick={() => setConfirm({ user, action: user.actif ? 'desactiver' : 'reactiver' })} aria-label={`${user.actif ? 'Désactiver' : 'Réactiver'} ${user.nom}`}>{user.actif ? <Lock size={14} aria-hidden="true" /> : <Unlock size={14} aria-hidden="true" />}{user.actif ? 'Désactiver' : 'Réactiver'}</button>
              </div></td>
            </tr>)}</tbody>
          </table></div>}
      </section>
      <CreateUserDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreated={(password) => showToast(`Utilisateur créé. Mot de passe temporaire : ${password}`)} />
      {editUser && <EditUserDialog user={editUser} onClose={() => setEditUser(null)} onSaved={() => showToast(`${editUser.nom} mis à jour`)} />}
      <ConfirmDialog open={!!confirm}
        title={confirm?.action === 'desactiver' ? `Désactiver ${confirm?.user.nom} ?` : confirm?.action === 'reactiver' ? `Réactiver ${confirm?.user.nom} ?` : `Réinitialiser le mot de passe de ${confirm?.user.nom} ?`}
        message={confirm?.action === 'desactiver' ? 'Cet utilisateur ne pourra plus se connecter jusqu’à sa réactivation.' : confirm?.action === 'reactiver' ? 'Cet utilisateur pourra de nouveau se connecter.' : 'Un nouveau mot de passe temporaire sera généré. L’ancien ne fonctionnera plus.'}
        confirmLabel={confirm?.action === 'desactiver' ? 'Désactiver' : confirm?.action === 'reactiver' ? 'Réactiver' : 'Réinitialiser'}
        danger={confirm?.action === 'desactiver'} onConfirm={handleConfirmAction} onCancel={() => setConfirm(null)} loading={isActionLoading} />
      {toast && <Toast msg={toast.msg} ok={toast.ok} onDismiss={() => setToast(null)} />}
    </SettingsPageLayout>
  );
}
