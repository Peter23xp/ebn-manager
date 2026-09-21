import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Users, Clock, ChevronRight, RefreshCw, FileText, Zap } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate, cn } from '@/lib/utils';
import { useSites } from '@/hooks/useSites';
import { useAuthStore } from '@/store/auth.store';
import { hasMinimumRole, isSiteScopedStaff } from '@/lib/roles';
import { usePrivateQueryScope } from '@/hooks/usePrivateQueryScope';

// ── Types ─────────────────────────────────────────────────────────────────────

interface QueueClient {
  id: string;
  prenom: string;
  nom: string;
  telephone: string;
  site: { id: string; nom: string };
  createdBy: { id: string; nom: string } | null;
  createdAt: string;
  etapeActuelle: 'RECIT' | 'FICHE' | 'ACTIVATION';
  prochainRoute: string;
  etapes: {
    recit:      { statut: string; completeeAt?: string | null } | null;
    fiche:      { statut: string; completeeAt?: string | null } | null;
    activation: { statut: string; completeeAt?: string | null } | null;
  };
}

interface QueueResponse {
  queue: QueueClient[];
  stats: { ficheEnAttente: number; activationEnAttente: number; total: number };
}

// ── Couleurs par étape ────────────────────────────────────────────────────────

const ETAPE_CONFIG: Record<string, { label: string; labelAction: string; bg: string; text: string; icon: React.ReactNode }> = {
  FICHE:      { label: 'Fiche à payer',   labelAction: 'Enregistrer la fiche',   bg: 'bg-blue-50 border-blue-200',    text: 'text-blue-700',   icon: <FileText size={13} /> },
  ACTIVATION: { label: 'Prêt à activer', labelAction: 'Activer le compte',       bg: 'bg-green-50 border-green-200',  text: 'text-green-700',  icon: <Zap size={13} /> },
  RECIT:      { label: 'Récit à encaisser', labelAction: 'Compléter le récit',   bg: 'bg-amber-50 border-amber-200',  text: 'text-amber-700',  icon: <Clock size={13} /> },
};

// ── Dot récapitulatif d'étape ─────────────────────────────────────────────────

function StepDot({ done, label }: { done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1">
      <div className={cn('w-2 h-2 rounded-full flex-shrink-0', done ? 'bg-success' : 'bg-slate-200')} />
      <span className={cn('text-[10px] font-medium', done ? 'text-success' : 'text-text-muted')}>{label}</span>
    </div>
  );
}

// ── Ligne client ──────────────────────────────────────────────────────────────

function ClientRow({ client, canCollect, onAction }: { client: QueueClient; canCollect: boolean; onAction: (route: string) => void }) {
  const cfg = ETAPE_CONFIG[client.etapeActuelle] ?? ETAPE_CONFIG['RECIT'];
  const joursDepuis = Math.floor((Date.now() - new Date(client.createdAt).getTime()) / 86_400_000);

  return (
    <tr className="hover:bg-slate-50 transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-primary-accent/10 flex items-center justify-center text-[11px] font-bold text-primary-accent flex-shrink-0">
            {client.prenom[0]}{client.nom[0]}
          </div>
          <div>
            <p className="text-[13px] font-semibold text-text">{client.prenom} {client.nom}</p>
            <p className="text-[11px] text-text-muted">{client.telephone}</p>
          </div>
        </div>
      </td>

      <td className="px-4 py-3 hidden sm:table-cell">
        <p className="text-[12px] text-text-muted">{client.site?.nom ?? '—'}</p>
        {client.createdBy && (
          <p className="text-[10px] text-text-subtle">Par {client.createdBy.nom}</p>
        )}
      </td>

      <td className="px-4 py-3">
        <div className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold', cfg.bg, cfg.text)}>
          {cfg.icon}
          {canCollect ? cfg.label : 'En attente de passage en caisse'}
        </div>
      </td>

      <td className="px-4 py-3 hidden md:table-cell">
        <div className="flex flex-col gap-1">
          <StepDot done={client.etapes.recit?.statut === 'COMPLETE'} label="Récit" />
          <StepDot done={client.etapes.fiche?.statut === 'COMPLETE'} label="Fiche" />
        </div>
      </td>

      <td className="px-4 py-3 hidden lg:table-cell">
        <p className="text-[12px] text-text-muted">{formatDate(client.createdAt)}</p>
        <p className="text-[10px] text-text-subtle">
          {joursDepuis === 0 ? "Aujourd'hui" : joursDepuis === 1 ? 'Hier' : `Il y a ${joursDepuis}j`}
        </p>
      </td>

      <td className="px-4 py-3 text-right">
        <button
          type="button"
          onClick={() => onAction(canCollect ? client.prochainRoute : `/clients/${client.id}`)}
          className={cn(
            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors',
            canCollect && client.etapeActuelle === 'ACTIVATION'
              ? 'bg-green-600 hover:bg-green-700 text-white'
              : 'btn-primary',
          )}
        >
          {canCollect ? cfg.labelAction : 'Ouvrir le dossier'}
          <ChevronRight size={13} />
        </button>
      </td>
    </tr>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function OnboardingQueuePage() {
  const scope = usePrivateQueryScope();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { sites } = useSites();

  const isScoped = !!user && isSiteScopedStaff(user.role);
  const canCollect = hasMinimumRole(user?.role, 'CAISSIER');
  const [selectedSiteId, setSiteId] = useState(user?.siteId ?? '');
  const siteId = isScoped ? user.siteId ?? '' : selectedSiteId;
  const [filterEtape, setFilterEtape] = useState<string>('');

  const { data: response, isLoading, refetch, isFetching } = useQuery<QueueResponse>({
    queryKey: ['onboarding-queue', siteId, scope.key],
    queryFn: () => api.get('/clients/onboarding-queue', { params: siteId ? { siteId } : {} }).then(r => r.data),
    refetchInterval: 30_000,
    enabled: scope.enabled,
  });
  const data = scope.enabled ? response : undefined;

  const queue = (data?.queue ?? []).filter(c => !filterEtape || c.etapeActuelle === filterEtape);

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[20px] font-extrabold text-primary flex items-center gap-2">
            <Users size={20} className="text-primary-accent" />
            File d'attente onboarding
          </h1>
          <p className="text-[13px] text-text-muted mt-0.5">
            Clients en cours d'enregistrement — actualisé toutes les 30 secondes
          </p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="btn-secondary flex items-center gap-1.5 text-[13px]"
        >
          <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
          Actualiser
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {[
          { label: 'Total',          value: data?.stats.total ?? 0,               color: 'text-primary' },
          { label: 'Fiche à payer',  value: data?.stats.ficheEnAttente ?? 0,      color: 'text-blue-700' },
          { label: 'À activer',      value: data?.stats.activationEnAttente ?? 0, color: 'text-green-700' },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-xl border border-border bg-white px-2 sm:px-4 py-3 text-center min-w-0">
            <p className={cn('text-[22px] sm:text-[24px] font-black leading-none', color)}>{value}</p>
            <p className="text-[10px] sm:text-[11px] text-text-muted font-medium mt-1 truncate">{label}</p>
          </div>
        ))}
      </div>

      {/* Filtres */}
      <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center gap-2.5">
        {!isScoped && (
          <select
            value={siteId}
            onChange={e => setSiteId(e.target.value)}
            className="text-[13px] px-3 py-2 rounded-lg border border-border bg-white focus:outline-none focus:ring-2 focus:ring-primary-accent/30 w-full sm:w-auto"
          >
            <option value="">Tous les sites</option>
            {sites.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}
          </select>
        )}

        <div className="flex rounded-lg border border-border overflow-hidden flex-shrink-0">
          {[
            { key: '',           label: 'Tous' },
            { key: 'FICHE',      label: 'Fiche' },
            { key: 'ACTIVATION', label: 'À activer' },
          ].map(opt => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setFilterEtape(opt.key)}
              className={cn(
                'px-3 py-1.5 text-[12px] font-semibold transition-colors whitespace-nowrap',
                filterEtape === opt.key
                  ? 'bg-primary text-white'
                  : 'bg-white text-text-muted hover:bg-slate-50',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tableau */}
      <div className="rounded-xl border border-border bg-white overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-2">
            {[...Array(5)].map((_, i) => <div key={i} className="skeleton h-14 rounded-lg" />)}
          </div>
        ) : queue.length === 0 ? (
          <div className="py-16 text-center">
            <Users size={32} className="mx-auto text-text-muted opacity-30 mb-3" />
            <p className="text-[14px] font-semibold text-text">Aucun client en attente</p>
            <p className="text-[12px] text-text-muted mt-1">
              {filterEtape ? 'Changer le filtre ou ' : ''}Enregistrer un nouveau client pour le voir apparaître ici.
            </p>
            <button
              type="button"
              onClick={() => navigate('/clients/new/recit')}
              className="btn-primary mt-4 text-[13px]"
            >
              + Nouveau client
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-slate-50 text-left text-[11px] font-bold uppercase tracking-wide text-text-muted">
                  <th className="px-4 py-2.5">Client</th>
                  <th className="px-4 py-2.5 hidden sm:table-cell">Site / Agent</th>
                  <th className="px-4 py-2.5">Étape actuelle</th>
                  <th className="px-4 py-2.5 hidden md:table-cell">Progression</th>
                  <th className="px-4 py-2.5 hidden lg:table-cell">Depuis</th>
                  <th className="px-4 py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {queue.map(c => (
                  <ClientRow key={c.id} client={c} canCollect={canCollect} onAction={(route) => navigate(route)} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
