import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Users, Gift, TrendingUp, DollarSign, AlertCircle, RefreshCw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useAuth } from '@/hooks/useAuth';
import { useParrainageReport } from '@/hooks/useParrainageReport';
import { PeriodSelector } from '@/components/reports/PeriodSelector';
import { DateRangePicker } from '@/components/reports/DateRangePicker';
import { getDateRangeFromPreset, type PeriodPreset, type DateRange, toISODate } from '@/lib/dateRange.utils';
import { formatUSD, cn } from '@/lib/utils';
import type { FunnelData, TopParrain, RecompenseDue } from '@/lib/reports.api';

// ── Funnel SVG ────────────────────────────────────────────────────────────────

const FUNNEL_COLORS = ['#2E86C1', '#1A6B3A', '#E65100', '#1E3A5F'];
const FUNNEL_LABELS = ['Récits vendus', 'Formations', 'Fiches achetées', 'Activations'];

function OnboardingFunnelChart({ funnel, isLoading }: { funnel: FunnelData | null; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[100, 85, 70, 55].map((w, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="skeleton h-4 w-24 rounded flex-shrink-0" />
            <div className="skeleton h-8 rounded" style={{ width: `${w}%` }} />
            <div className="skeleton h-4 w-12 rounded flex-shrink-0" />
          </div>
        ))}
      </div>
    );
  }

  if (!funnel || funnel.recits === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-text-muted">
        Aucune donnée sur cette période.
      </div>
    );
  }

  const values = [funnel.recits, funnel.formations, funnel.fiches, funnel.activations];
  const max = funnel.recits;

  return (
    <div className="space-y-3">
      {values.map((val, i) => {
        const pct = max > 0 ? Math.round((val / max) * 100) : 0;
        const stepPct = i > 0 && values[i - 1] > 0 ? Math.round((val / values[i - 1]) * 100) : null;
        return (
          <div key={i}>
            <div className="flex items-center gap-2 mb-1 text-xs">
              <span className="w-32 flex-shrink-0 font-medium text-text">{FUNNEL_LABELS[i]}</span>
              <div className="flex-1 h-8 bg-gray-100 rounded-lg overflow-hidden">
                <div
                  className="h-full flex items-center justify-end pr-3 rounded-lg transition-all duration-500"
                  style={{
                    width: `${pct}%`,
                    background: FUNNEL_COLORS[i],
                    minWidth: val > 0 ? '40px' : '0',
                  }}
                >
                  <span className="text-white text-[11px] font-bold">{pct}%</span>
                </div>
              </div>
              <span className="w-8 text-right font-bold text-text tabular-nums">{val}</span>
            </div>
            {stepPct !== null && i < values.length && (
              <p className="text-[10px] text-text-muted ml-32 pl-2">
                → {stepPct}% ont passé cette étape
              </p>
            )}
          </div>
        );
      })}
      <div className="mt-3 pt-3 border-t border-border text-xs font-semibold text-primary">
        Taux global de conversion : {funnel.tauxConversion}%
      </div>
    </div>
  );
}

// ── Top parrains ──────────────────────────────────────────────────────────────

const MEDAL_STYLE: Record<number, { bg: string; text: string; label: string }> = {
  1: { bg: '#FFC107', text: '#fff', label: '🥇' },
  2: { bg: '#78909C', text: '#fff', label: '🥈' },
  3: { bg: '#795548', text: '#fff', label: '🥉' },
};

const STATUT_BADGE: Record<string, string> = {
  EN_ATTENTE: 'bg-orange-100 text-orange-700 border border-orange-200',
  VALIDE: 'bg-blue-100 text-blue-700 border border-blue-200',
  RECOMPENSE_VERSEE: 'bg-green-100 text-green-700 border border-green-200',
};
const STATUT_LABEL: Record<string, string> = {
  EN_ATTENTE: 'En attente',
  VALIDE: 'À verser',
  RECOMPENSE_VERSEE: 'Versée',
};

function TopParrainsTable({ parrains, isLoading }: { parrains: TopParrain[]; isLoading: boolean }) {
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="divide-y">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="px-4 py-3 space-y-1">
            <div className="skeleton h-4 w-full rounded" />
            <div className="skeleton h-3 w-2/3 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (!parrains?.length) {
    return <p className="py-8 text-center text-sm text-text-muted">Aucun parrain sur la période.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr style={{ background: '#1E3A5F' }}>
            {['Rang', 'Parrain', 'Site', 'Filleuls', 'CA filleuls', 'Récompense', 'Statut'].map((h) => (
              <th key={h} className="px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-white">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {parrains.map((p) => {
            const medal = MEDAL_STYLE[p.rang];
            return (
              <tr
                key={p.clientId}
                className="border-b border-border/60 hover:bg-blue-50/40 cursor-pointer transition-colors"
                onClick={() => navigate(`/parrainage/tree/${p.clientId}`)}
              >
                <td className="px-3 py-2.5">
                  <span
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold"
                    style={medal ? { background: medal.bg, color: medal.text } : { background: '#E2E8F0', color: '#475569' }}
                  >
                    {medal ? medal.label : p.rang}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <p className="font-semibold text-primary text-sm">{p.prenom} {p.nom}</p>
                </td>
                <td className="px-3 py-2.5 text-xs text-text-muted">{p.siteNom}</td>
                <td className="px-3 py-2.5 font-bold tabular-nums text-center">{p.nbFilleulsActives}</td>
                <td className="px-3 py-2.5 font-semibold text-success tabular-nums">
                  {p.caGenereParFilleuls > 0 ? formatUSD(p.caGenereParFilleuls) : '—'}
                </td>
                <td className="px-3 py-2.5 text-xs tabular-nums">
                  {p.recompenseType === 'POINTS'
                    ? `${p.recompenseDue} pts`
                    : p.recompenseDue > 0
                    ? formatUSD(p.recompenseDue)
                    : '—'}
                </td>
                <td className="px-3 py-2.5">
                  <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', STATUT_BADGE[p.statutRecompense] ?? 'bg-gray-100 text-gray-600')}>
                    {STATUT_LABEL[p.statutRecompense] ?? p.statutRecompense}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Récompenses dues ──────────────────────────────────────────────────────────

function RecompensesDuesTable({ recompenses, isLoading }: { recompenses: RecompenseDue[]; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="divide-y">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="px-4 py-3"><div className="skeleton h-4 w-full rounded" /></div>
        ))}
      </div>
    );
  }

  if (!recompenses?.length) {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-green-50 border border-green-200 p-4">
        <span className="text-xl">✅</span>
        <p className="text-sm font-semibold text-success">Toutes les récompenses ont été versées.</p>
      </div>
    );
  }

  return (
    <div className="card p-0 overflow-hidden">
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <h2 className="text-sm font-bold text-primary">Récompenses dues</h2>
        <span className="badge-warning text-xs">{recompenses.length} en attente</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: '#1E3A5F' }}>
              {['Parrain', 'Filleul', 'Date activation', 'Récompense', 'Depuis'].map((h) => (
                <th key={h} className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-white">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {recompenses.map((r) => (
              <tr key={r.id} className="border-b border-border/60 hover:bg-orange-50/30">
                <td className="px-4 py-2.5">
                  <Link to={`/clients/${r.parrainId}`} className="font-semibold text-primary-accent hover:underline text-xs">
                    {r.parrainNom}
                  </Link>
                </td>
                <td className="px-4 py-2.5">
                  <Link to={`/clients/${r.filleulId}`} className="text-primary hover:underline text-xs">
                    {r.filleulNom}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-xs text-text-muted">
                  {new Date(r.dateActivation).toLocaleDateString('fr-FR')}
                </td>
                <td className="px-4 py-2.5 text-xs font-semibold">
                  {r.recompenseType === 'POINTS'
                    ? `${r.recompenseValeur} pts`
                    : r.recompenseValeur > 0
                    ? formatUSD(r.recompenseValeur)
                    : '—'}
                </td>
                <td className="px-4 py-2.5 text-xs text-text-muted">
                  {formatDistanceToNow(new Date(r.dateActivation), { locale: fr, addSuffix: true })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RapportParrainagePage() {
  const navigate = useNavigate();
  const { user, hasRole } = useAuth();
  const isGerant = hasRole('GERANT') && !hasRole('DIRECTEUR_REGIONAL');

  const [preset, setPreset] = useState<PeriodPreset>('this_month');
  const [dateRange, setDateRange] = useState<DateRange>(getDateRangeFromPreset('this_month'));
  const [siteId, setSiteId] = useState('');

  const params = {
    siteId: isGerant ? (user?.siteId ?? undefined) : (siteId || undefined),
    dateDebut: toISODate(dateRange.from),
    dateFin: toISODate(dateRange.to),
  };

  const { data, isLoading, error, refetch } = useParrainageReport(params);

  const handlePresetChange = (p: PeriodPreset, r: DateRange) => {
    setPreset(p);
    if (p !== 'custom') setDateRange(r);
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 min-h-[60vh]">
        <AlertCircle size={36} className="text-danger" />
        <p className="text-sm font-semibold text-primary">Impossible de charger le rapport.</p>
        <button type="button" onClick={() => refetch()} className="btn-primary flex items-center gap-2">
          <RefreshCw size={14} /> Réessayer
        </button>
      </div>
    );
  }

  const summary = data?.summary ?? { parrainagesActifs: 0, filleulsActives: 0, recompensesDues: 0, caGenereParFilleuls: 0 };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => navigate('/reports')} className="btn-ghost !min-h-0 !p-1.5 rounded-lg">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-page-title text-primary">Rapport Parrainage</h1>
            <p className="text-xs text-text-muted">Analyse du programme de parrainage</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PeriodSelector value={preset} onChange={handlePresetChange} />
          {preset === 'custom' && (
            <DateRangePicker value={dateRange} onChange={(r) => setDateRange(r)} maxDate={new Date()} />
          )}
          {!isGerant && (
            <select
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
              className="h-9 rounded-lg border border-border bg-white px-3 text-sm"
              aria-label="Filtrer par site"
            >
              <option value="">Tous les sites</option>
              <option value="goma">Goma</option>
              <option value="bukavu">Bukavu</option>
              <option value="kinshasa">Kinshasa</option>
            </select>
          )}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Parrainages actifs', value: String(summary.parrainagesActifs), icon: Users, color: '#1E3A5F' },
          { label: 'Filleuls activés (période)', value: String(summary.filleulsActives), icon: Users, color: '#1A6B3A' },
          { label: 'Récompenses dues', value: String(summary.recompensesDues), icon: Gift, color: '#E65100' },
          { label: 'CA généré par filleuls', value: formatUSD(summary.caGenereParFilleuls), icon: DollarSign, color: '#2E86C1' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="stat-card">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl" style={{ background: color + '18' }}>
                <Icon size={20} style={{ color }} />
              </div>
              <div className="min-w-0">
                {isLoading ? (
                  <>
                    <div className="skeleton h-6 w-16 rounded mb-1" />
                    <div className="skeleton h-3 w-24 rounded" />
                  </>
                ) : (
                  <>
                    <p className="text-lg font-bold text-primary leading-tight">{value}</p>
                    <p className="text-xs text-text-muted">{label}</p>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Funnel */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp size={16} className="text-primary-accent" />
          <h2 className="text-sm font-bold text-primary">Funnel de conversion Onboarding</h2>
        </div>
        <OnboardingFunnelChart funnel={data?.funnel ?? null} isLoading={isLoading} />
      </div>

      {/* Top parrains */}
      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <h2 className="text-sm font-bold text-primary">Top Parrains</h2>
          <button
            type="button"
            onClick={() => navigate('/mlm/members')}
            className="text-xs text-primary-accent font-semibold hover:underline"
          >
            Voir tout →
          </button>
        </div>
        <TopParrainsTable parrains={data?.topParrains ?? []} isLoading={isLoading} />
      </div>

      {/* Récompenses dues */}
      <RecompensesDuesTable recompenses={data?.recompensesDues ?? []} isLoading={isLoading} />
    </div>
  );
}
