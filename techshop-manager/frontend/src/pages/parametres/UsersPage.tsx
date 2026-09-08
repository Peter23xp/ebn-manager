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

// ── Constants ──────────────────────────────────────────────────────
const ALL_ROLES: Role[] = ['SUPER_ADMIN', 'DIRECTEUR_REGIONAL', 'GERANT', 'AGENT', 'FORMATEUR'];
const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: 'Super Admin', DIRECTEUR_REGIONAL: 'Dir. Régional',
  GERANT: 'Gérant', AGENT: 'Agent', FORMATEUR: 'Formateur', CLIENT: 'Client',
};

// ── Helpers ────────────────────────────────────────────────────────
function UserAvatar({ nom }: { nom: string }) {
  const parts = nom.trim().split(' ');
  const abbr = parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : nom.slice(0, 2).toUpperCase();
  const colors = ['bg-blue-100 text-blue-700', 'bg-violet-100 text-violet-700',
    'bg-teal-100 text-teal-700', 'bg-amber-100 text-amber-700', 'bg-rose-100 text-rose-700'];
  const color = colors[nom.charCodeAt(0) % colors.length];
  return (
    <span className={cn('flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold select-none', color)}>
      {abbr}
    </span>
  );
}

// ── Stat card ──────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, color, sub }: {
  label: string; value: string | number; icon: React.ElementType;
  color: string; sub?: string;
}) {
  return (
    <div className="card flex items-center gap-4 py-4">
      <div className={cn('flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl', color)}>
        <Icon size={18} aria-hidden />
      </div>
      <div className="min-w-0">
        <p className="text-[22px] font-black text-primary leading-none">{value}</p>
        <p className="text-xs text-text-muted mt-0.5">{label}</p>
        {sub && <p className="text-[10px] text-text-subtle mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── Toast ──────────────────────────────────────────────────────────
function Toast({ msg, ok, onDismiss }: { msg: string; ok: boolean; onDismiss: () => void }) {
  return createPortal(
    <div role="alert" className={cn(
      'fixed bottom-6 right-6 z-[60] flex items-center gap-3 rounded-xl px-5 py-3 text-sm font-semibold shadow-xl text-white max-w-sm',
      ok ? 'bg-success' : 'bg-danger',
    )}>
      {ok ? <CheckCircle size={16} className="flex-shrink-0" /> : <AlertCircle size={16} className="flex-shrink-0" />}
      <span className="flex-1">{msg}</span>
      <button onClick={onDismiss} className="ml-1 opacity-70 hover:opacity-100">
        <X size={14} />
      </button>
    </div>,
    document.body,
  );
}

// ── Confirm dialog ─────────────────────────────────────────────────
function ConfirmDialog({
  open, title, message, confirmLabel, danger, onConfirm, onCancel, loading,
}: {
  open: boolean; title: string; message: string; confirmLabel: string;
  danger?: boolean; onConfirm: () => void; onCancel: () => void; loading?: boolean;
}) {
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" role="dialog" aria-modal="true">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <h3 className="font-bold text-primary text-base">{title}</h3>
        <p className="text-sm text-text-muted">{message}</p>
        <div className="flex gap-3 pt-1">
          <button className="btn-secondary flex-1" onClick={onCancel} disabled={loading}>Annuler</button>
          <button
            className={cn('btn flex-1', danger ? 'btn-danger' : 'btn-primary')}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? <RefreshCw size={14} className="animate-spin" /> : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── CreateUserDialog ───────────────────────────────────────────────
const createSchema = z.object({
  nom: z.string().min(2, 'Nom trop court (min 2 caractères)'),
  telephone: z.string().regex(/^\+243\d{9}$/, 'Format requis : +243XXXXXXXXX'),
  role: z.enum(['SUPER_ADMIN', 'DIRECTEUR_REGIONAL', 'GERANT', 'AGENT', 'FORMATEUR']),
  siteId: z.string().optional(),
  passwordTemp: z.string().min(8, 'Minimum 8 caractères'),
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
  const needsSite = ['GERANT', 'AGENT', 'FORMATEUR'].includes(role);

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

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      role="dialog" aria-modal="true" aria-label="Créer un utilisateur">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-light">
              <UserCog size={16} className="text-primary-accent" />
            </div>
            <h2 className="font-bold text-primary">Nouvel utilisateur</h2>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-slate-100 transition-colors">
            <X size={16} />
          </button>
        </div>

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

            <div className="grid grid-cols-2 gap-3">
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
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-subtle hover:text-text"
                  tabIndex={-1}
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

          <div className="flex gap-3 pt-2">
            <button type="button" className="btn-secondary flex-1" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn-primary flex-1" disabled={mutation.isPending} aria-label="Valider la création">
              {mutation.isPending ? <><RefreshCw size={14} className="animate-spin" /> Création…</> : 'Créer l\'utilisateur'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

// ── EditUserDialog ─────────────────────────────────────────────────
const editSchema = z.object({
  nom: z.string().min(2, 'Nom trop court (min 2 caractères)'),
  email: z.string().email('Email invalide').or(z.literal('')).optional(),
  role: z.enum(['SUPER_ADMIN', 'DIRECTEUR_REGIONAL', 'GERANT', 'AGENT', 'FORMATEUR']),
  siteId: z.string().optional(),
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
  const needsSite = ['GERANT', 'AGENT', 'FORMATEUR'].includes(role);

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

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Modifier l'utilisateur"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-light">
              <Pencil size={15} className="text-primary-accent" />
            </div>
            <div>
              <h2 className="font-bold text-primary text-[14px] leading-none">Modifier l'utilisateur</h2>
              <p className="text-[11px] text-text-muted mt-0.5">{user.telephone}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-slate-100 transition-colors"
            aria-label="Fermer"
          >
            <X size={16} />
          </button>
        </div>

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
              </div>
            )}
          </div>

          {mutation.isError && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5" role="alert">
              <AlertCircle size={14} className="text-danger flex-shrink-0" />
              <p className="text-xs text-danger">{getErrorMessage(mutation.error)}</p>
            </div>
          )}

          {/* Footer actions — inside form so submit works */}
          <div className="flex gap-3 pt-2">
            <button type="button" className="btn-secondary flex-1" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn-primary flex-1" disabled={mutation.isPending}>
              {mutation.isPending ? <><RefreshCw size={14} className="animate-spin" /> Enregistrement…</> : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
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

  const { data, isLoading, isError, refetch } = useQuery({
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

  const users = data?.data ?? [];
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
    <div className="space-y-6 animate-fade-up">

      {/* ── En-tête ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-light" aria-hidden>
            <UserCog size={20} className="text-primary-accent" />
          </div>
          <div>
            <h1 className="text-page-title text-primary">Gestion des utilisateurs</h1>
            <p className="text-xs text-text-muted mt-0.5">Administration des accès et des rôles</p>
          </div>
        </div>
        <button
          className="btn-primary"
          onClick={() => setCreateOpen(true)}
          aria-label="Créer un nouvel utilisateur"
        >
          <Plus size={16} /> Nouvel utilisateur
        </button>
      </div>

      {/* ── Stats ───────────────────────────────────────────────── */}
      {!isLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Utilisateurs" value={total} icon={Users} color="bg-primary-light text-primary-accent" />
          <StatCard label="Actifs" value={actifs} icon={CheckCircle} color="bg-green-100 text-success" />
          <StatCard label="Inactifs" value={inactifs} icon={Lock} color="bg-red-50 text-danger" />
          <StatCard label="Super Admins" value={admins} icon={ShieldCheck} color="bg-violet-100 text-violet-700" />
        </div>
      )}

      {/* ── Tableau ─────────────────────────────────────────────── */}
      <div className="rounded-xl shadow-card border border-border bg-white">

        {/* Barre de filtres */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 px-4 py-3 border-b border-border">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle pointer-events-none" />
            <input
              ref={searchRef}
              type="search"
              placeholder="Nom, téléphone, email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 border border-border rounded-lg text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-primary-accent/30 focus:border-primary-accent transition"
              aria-label="Rechercher un utilisateur"
            />
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="relative">
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className={cn(
                  'appearance-none pl-3 pr-7 py-2 border rounded-lg text-[12px] font-medium bg-white cursor-pointer',
                  'focus:outline-none focus:ring-2 focus:ring-primary-accent/30 transition',
                  roleFilter ? 'border-primary-accent text-primary-accent bg-primary-light/30' : 'border-border text-text-muted',
                )}
                aria-label="Filtrer par rôle"
              >
                <option value="">Tous les rôles</option>
                {ALL_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
              <ChevronDown size={11} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-text-subtle" />
            </div>

            <div className="relative">
              <select
                value={actifFilter}
                onChange={(e) => setActifFilter(e.target.value)}
                className={cn(
                  'appearance-none pl-3 pr-7 py-2 border rounded-lg text-[12px] font-medium bg-white cursor-pointer',
                  'focus:outline-none focus:ring-2 focus:ring-primary-accent/30 transition',
                  actifFilter ? 'border-primary-accent text-primary-accent bg-primary-light/30' : 'border-border text-text-muted',
                )}
                aria-label="Filtrer par statut"
              >
                <option value="">Tous les statuts</option>
                <option value="true">Actifs</option>
                <option value="false">Inactifs</option>
              </select>
              <ChevronDown size={11} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-text-subtle" />
            </div>

            {hasFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="flex items-center gap-1 px-2 py-2 rounded-lg text-[12px] font-semibold text-text-muted hover:text-danger transition-colors"
                aria-label="Effacer les filtres"
              >
                <X size={13} /> <span className="hidden sm:inline">Effacer</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => refetch()}
              disabled={isLoading}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-white text-text-muted hover:border-primary-accent hover:text-primary-accent transition-colors"
              aria-label="Actualiser"
            >
              <RefreshCw size={14} className={cn(isLoading && 'animate-spin')} />
            </button>
          </div>
        </div>

        {/* Corps */}
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="space-y-px p-2" role="status" aria-label="Chargement">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <div className="skeleton h-9 w-9 rounded-full flex-shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="skeleton h-3.5 w-40 rounded-full" />
                    <div className="skeleton h-3 w-28 rounded-full" />
                  </div>
                  <div className="skeleton h-5 w-20 rounded-full hidden sm:block" />
                  <div className="skeleton h-5 w-16 rounded-full hidden sm:block" />
                </div>
              ))}
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center gap-3 py-16 px-5" role="alert">
              <AlertCircle size={32} className="text-danger opacity-60" />
              <p className="text-[13px] font-medium text-text">Impossible de charger les utilisateurs.</p>
              <button className="btn-secondary text-[13px] flex items-center gap-1.5" onClick={() => refetch()}>
                <RefreshCw size={13} /> Réessayer
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-text-muted" role="status">
              <Users size={36} className="mb-3 opacity-20" />
              <p className="text-[13px] font-semibold text-text">
                {hasFilters ? 'Aucun résultat pour ces critères' : 'Aucun utilisateur trouvé'}
              </p>
              {hasFilters && (
                <button className="mt-3 text-[13px] font-semibold text-primary-accent hover:text-blue-700 transition-colors" onClick={clearFilters}>
                  Réinitialiser les filtres
                </button>
              )}
            </div>
          ) : (
            <table className="w-full text-sm" aria-label="Liste des utilisateurs">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left">Utilisateur</th>
                  <th className="px-4 py-3 text-left">Rôle</th>
                  <th className="px-4 py-3 text-left hidden md:table-cell">Site</th>
                  <th className="px-4 py-3 text-left hidden lg:table-cell">Dernière connexion</th>
                  <th className="px-4 py-3 text-left">Statut</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((user, i) => (
                  <tr
                    key={user.id}
                    className="border-b border-border/60 last:border-b-0 transition-colors duration-100 hover:bg-blue-50/40"
                    style={{ backgroundColor: i % 2 === 0 ? '#ffffff' : '#f8fafc' }}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <UserAvatar nom={user.nom} />
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold text-text truncate">{user.nom}</p>
                          <p className="text-[11px] text-text-muted font-mono">{user.telephone}</p>
                          {user.email && <p className="text-[10px] text-text-subtle truncate">{user.email}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3"><UserRoleBadge role={user.role} /></td>
                    <td className="px-4 py-3 text-[12px] text-text-muted hidden md:table-cell">
                      {user.site?.nom ?? <span className="text-text-subtle italic">—</span>}
                    </td>
                    <td className="px-4 py-3 text-[11px] text-text-muted hidden lg:table-cell">
                      {user.derniereConnexion ? formatRelative(user.derniereConnexion) : <span className="italic text-text-subtle">Jamais</span>}
                    </td>
                    <td className="px-4 py-3">
                      {user.actif
                        ? <span className="badge-success"><CheckCircle size={9} className="mr-0.5" />Actif</span>
                        : <span className="badge-danger"><Lock size={9} className="mr-0.5" />Inactif</span>
                      }
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setEditUser(user)}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-text-muted border border-border hover:border-primary-accent hover:text-primary-accent hover:bg-primary-light/40 transition-colors"
                          title="Modifier l'utilisateur"
                          aria-label={`Modifier ${user.nom}`}
                        >
                          <Pencil size={11} /> Modifier
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirm({ user, action: 'reset' })}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-text-muted border border-border hover:border-amber-300 hover:text-amber-700 hover:bg-amber-50 transition-colors"
                          title="Réinitialiser le mot de passe"
                        >
                          <RotateCcw size={11} /> MDP
                        </button>
                        {user.actif ? (
                          <button
                            type="button"
                            onClick={() => setConfirm({ user, action: 'desactiver' })}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-danger border border-border hover:border-red-300 hover:bg-red-50 transition-colors"
                            aria-label={`Désactiver ${user.nom}`}
                          >
                            <Lock size={11} /> Désactiver
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirm({ user, action: 'reactiver' })}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-success border border-border hover:border-green-300 hover:bg-green-50 transition-colors"
                            aria-label={`Réactiver ${user.nom}`}
                          >
                            <Unlock size={11} /> Réactiver
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        {!isLoading && filtered.length > 0 && (
          <div className="px-4 py-2.5 border-t border-border bg-slate-50/50 flex items-center justify-between">
            <p className="text-[11px] text-text-muted">
              {filtered.length === users.length
                ? `${users.length} utilisateur${users.length > 1 ? 's' : ''}`
                : `${filtered.length} sur ${users.length} utilisateur${users.length > 1 ? 's' : ''}`}
            </p>
            {hasFilters && (
              <button onClick={clearFilters} className="text-[11px] text-primary-accent hover:underline">
                Effacer les filtres
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Dialogs ─────────────────────────────────────────────── */}
      <CreateUserDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(pwd) => showToast(`Utilisateur créé. MDP temp : ${pwd}`)}
      />

      {editUser && (
        <EditUserDialog
          user={editUser}
          onClose={() => setEditUser(null)}
          onSaved={() => showToast(`${editUser.nom} mis à jour`)}
        />
      )}

      <ConfirmDialog
        open={!!confirm}
        title={
          confirm?.action === 'desactiver' ? `Désactiver ${confirm?.user.nom} ?` :
          confirm?.action === 'reactiver' ? `Réactiver ${confirm?.user.nom} ?` :
          `Réinitialiser le mot de passe de ${confirm?.user.nom} ?`
        }
        message={
          confirm?.action === 'desactiver'
            ? 'Cet utilisateur ne pourra plus se connecter jusqu\'à sa réactivation.'
            : confirm?.action === 'reactiver'
            ? 'Cet utilisateur pourra de nouveau se connecter.'
            : 'Un nouveau mot de passe temporaire sera généré. L\'ancien ne fonctionnera plus.'
        }
        confirmLabel={
          confirm?.action === 'desactiver' ? 'Désactiver' :
          confirm?.action === 'reactiver' ? 'Réactiver' : 'Réinitialiser'
        }
        danger={confirm?.action === 'desactiver'}
        onConfirm={handleConfirmAction}
        onCancel={() => setConfirm(null)}
        loading={isActionLoading}
      />

      {toast && <Toast msg={toast.msg} ok={toast.ok} onDismiss={() => setToast(null)} />}
    </div>
  );
}
