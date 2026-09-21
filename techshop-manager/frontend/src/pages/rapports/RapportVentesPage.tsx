import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, TrendingUp, TrendingDown, ShoppingCart, Percent, Receipt, Download, AlertCircle, RefreshCw, ChevronUp, ChevronDown } from 'lucide-react';
import { usePrivateQueryScope } from '@/hooks/usePrivateQueryScope';
import { ReportSiteFilter } from '@/components/reports/ReportSiteFilter';
import { readReportFilters, reportExportUrl, reportErrorMessage } from '@/lib/reportExport.utils';
import { useSalesDetailReport } from '@/hooks/useSalesDetailReport';
import { PeriodSelector } from '@/components/reports/PeriodSelector';
import { DateRangePicker } from '@/components/reports/DateRangePicker';
import { getDateRangeFromPreset, type PeriodPreset, type DateRange, toISODate } from '@/lib/dateRange.utils';
import { formatUSD, formatDateTime, cn } from '@/lib/utils';
import { Pagination } from '@/components/ui/Pagination';
import type { VentesDetailParams, AgentPerformance, VenteDetail } from '@/lib/reports.api';

// ── Types locaux ──────────────────────────────────────────────────────────────

interface SalesFilters {
  preset: PeriodPreset;
  dateRange: DateRange;
  siteId: string;
  agentId: string;
  modePaiement: string;
  categorie: string;
  search: string;
}

const DEFAULT_FILTERS: SalesFilters = {
  preset: 'this_month',
  dateRange: getDateRangeFromPreset('this_month'),
  siteId: '',
  agentId: '',
  modePaiement: '',
  categorie: '',
  search: '',
};

function initialFilters(params: URLSearchParams): SalesFilters {
  const filters = readReportFilters(params);
  const from = new Date(`${filters.dateDebut}T00:00:00`);
  const to = new Date(`${filters.dateFin}T00:00:00`);
  const hasDates = Number.isFinite(from.getTime()) && Number.isFinite(to.getTime());
  return { ...DEFAULT_FILTERS, ...filters,
    dateRange: hasDates ? { from, to } : getDateRangeFromPreset('this_month'),
    preset: hasDates ? 'custom' : 'this_month',
  };
}

// ── Stat card avec trend ──────────────────────────────────────────────────────

function StatCard({
  label, value, trend, icon, isLoading,
}: {
  label: string;
  value: string;
  trend?: number;
  icon: React.ReactNode;
  isLoading: boolean;
}) {
  return (
    <div className="stat-card">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {isLoading ? (
            <>
              <div className="skeleton h-6 w-28 rounded mb-1" />
              <div className="skeleton h-3 w-20 rounded" />
            </>
          ) : (
            <>
              <p className="text-lg font-bold text-primary leading-tight">{value}</p>
              <p className="text-xs text-text-muted mt-0.5">{label}</p>
            </>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/8 text-primary">
            {icon}
          </div>
          {trend !== undefined && !isLoading && trend !== 0 && (
            <span className={cn('flex items-center gap-0.5 text-xs font-semibold', trend > 0 ? 'text-success' : 'text-danger')}>
              {trend > 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
              {Math.abs(trend)}%
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Filtres ───────────────────────────────────────────────────────────────────

function FiltersPanel({
  draft, setDraft, onApply, onReset,
}: {
  draft: SalesFilters;
  setDraft: (f: SalesFilters) => void;
  onApply: () => void;
  onReset: () => void;
}) {
  const activeCount = [draft.siteId, draft.agentId, draft.modePaiement, draft.categorie, draft.search].filter(Boolean).length
    + (draft.preset !== 'this_month' ? 1 : 0);

  return (
    <div className="card space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <PeriodSelector
          value={draft.preset}
          onChange={(p, r) => setDraft({ ...draft, preset: p, dateRange: p === 'custom' ? draft.dateRange : r })}
        />
        {draft.preset === 'custom' && (
          <DateRangePicker
            value={draft.dateRange}
            onChange={(r) => setDraft({ ...draft, dateRange: r, preset: 'custom' })}
            maxDate={new Date()}
          />
        )}
        <ReportSiteFilter value={draft.siteId} onChange={siteId => setDraft({ ...draft, siteId })} />
        <select
          value={draft.modePaiement}
          onChange={(e) => setDraft({ ...draft, modePaiement: e.target.value })}
          className="min-h-11 max-w-full rounded-lg border border-border bg-white px-3 text-sm"
          aria-label="Mode de paiement"
        >
          <option value="">Tous paiements</option>
          <option value="CASH">Cash</option>
          <option value="MPESA">M-Pesa</option>
          <option value="AIRTEL_MONEY">Airtel Money</option>
          <option value="VIREMENT">Virement</option>
        </select>
        <input aria-label="Rechercher une vente" value={draft.search} onChange={event => setDraft({ ...draft, search: event.target.value })}
          placeholder="Numéro ou nom du client" className="min-h-11 w-full rounded-lg border border-border px-3 text-sm sm:w-auto" />
        <input aria-label="Catégorie" value={draft.categorie} onChange={event => setDraft({ ...draft, categorie: event.target.value })}
          placeholder="Toutes catégories" className="min-h-11 w-full rounded-lg border border-border px-3 text-sm sm:w-auto" />
        <input aria-label="Agent (identifiant)" value={draft.agentId} onChange={event => setDraft({ ...draft, agentId: event.target.value })}
          placeholder="Tous les agents" className="min-h-11 w-full rounded-lg border border-border px-3 text-sm sm:w-auto" />
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onApply} className="btn-primary min-h-11 text-sm px-4">
          Appliquer {activeCount > 0 && <span className="ml-1 rounded-full bg-white/20 px-1.5">{activeCount}</span>}
        </button>
        <button type="button" onClick={onReset} className="btn-secondary min-h-11 text-sm px-3">
          Réinitialiser
        </button>
      </div>
    </div>
  );
}

// ── Tableau ventes ────────────────────────────────────────────────────────────

function SalesDetailTable({
  ventes, meta, onPageChange, isLoading, isFetching, sortDir, onSort,
}: {
  ventes: VenteDetail[];
  meta: { total: number; page: number; limit: number; totalPages: number };
  onPageChange: (p: number) => void;
  isLoading: boolean;
  isFetching: boolean;
  sortDir: 'asc' | 'desc';
  onSort: () => void;
}) {
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="card p-0 overflow-hidden" role="status" aria-label="Chargement des ventes">
        <div className="p-4 border-b">
          <div className="skeleton h-5 w-40 rounded" />
        </div>
        <div className="divide-y">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="px-4 py-3 space-y-2">
              <div className="skeleton h-4 w-full rounded" />
              <div className="skeleton h-3 w-3/4 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const STATUT_STYLE: Record<string, string> = {
    VALIDE: 'badge-success',
    RETOURNEE: 'bg-red-100 text-red-700 border border-red-200 text-xs font-semibold px-2 py-0.5 rounded-full',
    RETOURNEE_PARTIELLE: 'badge-warning',
    ANNULEE: 'bg-gray-100 text-gray-500 border border-gray-200 text-xs font-semibold px-2 py-0.5 rounded-full',
  };

  return (
    <div className="card p-0 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h2 className="text-sm font-bold text-primary">
          Détail des ventes
          {isFetching && <span className="ml-2 inline-flex items-center gap-1 text-xs text-primary-accent"><RefreshCw size={10} className="animate-spin" />Chargement…</span>}
        </h2>
        <span className="text-xs text-text-muted">{meta.total} résultat{meta.total !== 1 ? 's' : ''}</span>
      </div>
      <div className="overflow-x-auto" role="region" aria-label="Détail des ventes, défilement horizontal" tabIndex={0}>
        <table className="w-full text-sm" aria-label="Détail des ventes" aria-busy={isFetching}>
          <thead>
            <tr style={{ background: '#1E3A5F' }}>
              {['N° Vente', 'Date', 'Client', 'Produit(s)', 'Agent', 'Site', 'Montant', 'Paiement', 'Remise', 'Points', 'Statut'].map((h) => (
                <th
                  key={h}
                  className="px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-white whitespace-nowrap"
                  scope="col"
                  aria-sort={h === 'Date' ? sortDir === 'asc' ? 'ascending' : 'descending' : undefined}
                >
                  {h === 'Date' ? <button type="button" aria-label="Trier par date" onClick={onSort} className="flex min-h-11 items-center gap-1 focus-visible:ring-2 focus-visible:ring-white">
                    Date {sortDir === 'desc' ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
                  </button> : h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ventes.length === 0 && (
              <tr>
                <td colSpan={11} className="py-10 text-center text-text-muted">
                  Aucune vente pour les filtres sélectionnés.
                </td>
              </tr>
            )}
            {ventes.map((v) => {
              const isProblematic = v.statut === 'RETOURNEE' || v.statut === 'ANNULEE';
              const remise = Number(v.remiseFidelite ?? 0) + Number(v.remiseParrainage ?? 0);
              const firstProduit = v.lignes?.[0]?.produit?.nom ?? '—';
              const extraCount = (v.lignes?.length ?? 1) - 1;
              return (
                <tr
                  key={v.id}
                  className={cn(
                    'border-b border-border/60 hover:bg-blue-50/40 transition-colors',
                    isProblematic && 'bg-gray-50',
                  )}
                >
                  <td className="px-3 py-2.5">
                    <button
                      type="button"
                      onClick={() => navigate(`/sales/${v.id}`)}
                      className="font-mono text-xs font-semibold text-primary-accent hover:underline"
                    >
                      {v.numeroVente ?? v.id.slice(0, 8)}
                    </button>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-text-muted whitespace-nowrap">
                    {formatDateTime(v.createdAt)}
                  </td>
                  <td className="px-3 py-2.5 text-xs">
                    {v.client ? `${v.client.prenom} ${v.client.nom}`.slice(0, 18) : 'Anonyme'}
                  </td>
                  <td className="px-3 py-2.5 text-xs">
                    {firstProduit.slice(0, 18)}
                    {extraCount > 0 && <span className="ml-1 text-text-muted">+{extraCount}</span>}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-text-muted">{v.agent?.nom ?? '—'}</td>
                  <td className="px-3 py-2.5 text-xs text-text-muted">{v.site?.nom ?? '—'}</td>
                  <td className="px-3 py-2.5 font-mono text-xs font-bold text-primary">
                    {formatUSD(Number(v.montantNet ?? 0))}
                  </td>
                  <td className="px-3 py-2.5 text-xs">
                    <span className="badge badge-info">{v.modePaiement}</span>
                  </td>
                  <td className="px-3 py-2.5 text-xs">
                    {remise > 0
                      ? <span className="font-semibold text-danger">-{formatUSD(remise)}</span>
                      : <span className="text-text-muted">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-xs">
                    {(v.pointsAttribues ?? 0) > 0
                      ? <span className="font-semibold text-success">+{v.pointsAttribues} pts</span>
                      : <span className="text-text-muted">—</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', STATUT_STYLE[v.statut] ?? 'badge-gray')}>
                      {v.statut}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {meta.totalPages > 1 && (
        <div className="px-4 py-3 border-t">
          <Pagination
            page={meta.page}
            totalPages={meta.totalPages}
            total={meta.total}
            onPageChange={onPageChange}
          />
        </div>
      )}
    </div>
  );
}

// ── Tableau performance agents ────────────────────────────────────────────────

function AgentPerformanceTable({ data, isLoading, onAgentClick }: {
  data: AgentPerformance[];
  isLoading: boolean;
  onAgentClick: (agentId: string) => void;
}) {
  if (isLoading) {
    return (
      <div className="card p-0 overflow-hidden">
        <div className="p-4 border-b"><div className="skeleton h-5 w-48 rounded" /></div>
        <div className="divide-y">
          {[...Array(4)].map((_, i) => <div key={i} className="px-4 py-3"><div className="skeleton h-4 w-full rounded" /></div>)}
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) return null;

  const totals = {
    nbVentes: data.reduce((s, a) => s + a.nbVentes, 0),
    caTotal: data.reduce((s, a) => s + a.caTotal, 0),
    caMoyen: 0,
    remisesAccordees: data.reduce((s, a) => s + a.remisesAccordees, 0),
  };

  return (
    <div className="card p-0 overflow-hidden">
      <div className="px-4 py-3 border-b">
        <h2 className="text-sm font-bold text-primary">Performance par agent</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: '#1E3A5F' }}>
              {['Agent', 'Site', 'Nb ventes', 'CA total', 'CA moyen', 'Remises'].map((h) => (
                <th key={h} className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-white">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((a) => (
              <tr
                key={a.agentId}
                className="border-b border-border/60 hover:bg-blue-50/40"
              >
                <td className="px-4 py-2.5 font-semibold text-primary"><button type="button" onClick={() => onAgentClick(a.agentId)} className="min-h-11 text-left hover:underline" aria-label={`Filtrer par agent ${a.agentNom}`}>{a.agentNom}</button></td>
                <td className="px-4 py-2.5 text-text-muted text-xs">{a.siteNom}</td>
                <td className="px-4 py-2.5 tabular-nums">{a.nbVentes}</td>
                <td className="px-4 py-2.5 font-bold text-success tabular-nums">{formatUSD(a.caTotal)}</td>
                <td className="px-4 py-2.5 text-text-muted tabular-nums">{formatUSD(a.caMoyen)}</td>
                <td className="px-4 py-2.5 tabular-nums text-danger">{a.remisesAccordees > 0 ? formatUSD(a.remisesAccordees) : '—'}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-primary/30 bg-slate-50">
              <td className="px-4 py-2.5 font-bold text-primary" colSpan={2}>TOTAL</td>
              <td className="px-4 py-2.5 font-bold tabular-nums">{totals.nbVentes}</td>
              <td className="px-4 py-2.5 font-bold text-success tabular-nums">{formatUSD(totals.caTotal)}</td>
              <td className="px-4 py-2.5 text-text-muted">—</td>
              <td className="px-4 py-2.5 font-bold text-danger tabular-nums">{totals.remisesAccordees > 0 ? formatUSD(totals.remisesAccordees) : '—'}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

function SalesContent() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [draft, setDraft] = useState<SalesFilters>(() => initialFilters(searchParams));
  const [applied, setApplied] = useState<SalesFilters>(() => initialFilters(searchParams));
  const [page, setPage] = useState(1);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(searchParams.get('sortDir') === 'asc' ? 'asc' : 'desc');

  const params: VentesDetailParams = {
    siteId: applied.siteId || undefined,
    agentId: applied.agentId || undefined,
    modePaiement: applied.modePaiement || undefined,
    categorie: applied.categorie || undefined,
    search: applied.search || undefined,
    sortDir,
    dateDebut: toISODate(applied.dateRange.from),
    dateFin: toISODate(applied.dateRange.to),
    page,
    limit: 50,
  };

  const { data, isLoading, isFetching, error, refetch } = useSalesDetailReport(params);

  const ventes = data?.ventes ?? [];
  const meta = data?.meta ?? { total: 0, page: 1, limit: 50, totalPages: 0 };
  const resume = data?.resume;
  const totauxParAgent = data?.totauxParAgent ?? [];

  const filtersUrl = (filters: SalesFilters, direction = sortDir) => reportExportUrl('VENTES_DETAIL', {
    siteId: filters.siteId, agentId: filters.agentId, modePaiement: filters.modePaiement, categorie: filters.categorie,
    search: filters.search, sortDir: direction, dateDebut: toISODate(filters.dateRange.from), dateFin: toISODate(filters.dateRange.to),
  });
  const syncUrl = (filters: SalesFilters, direction = sortDir) => {
    const next = new URLSearchParams(filtersUrl(filters, direction).split('?')[1]);
    next.delete('type');
    setSearchParams(next, { replace: true });
  };
  const handleApply = () => { setApplied(draft); setPage(1); syncUrl(draft); };
  const handleReset = () => {
    const defaults = { ...DEFAULT_FILTERS, dateRange: getDateRangeFromPreset('this_month') };
    setDraft(defaults); setApplied(defaults); setPage(1); setSortDir('desc'); syncUrl(defaults, 'desc');
  };
  const handleAgentClick = (agentId: string) => {
    const next = { ...applied, agentId };
    setApplied(next); setDraft(next); setPage(1); syncUrl(next);
  };
  const handleSort = () => { const direction = sortDir === 'asc' ? 'desc' : 'asc'; setSortDir(direction); setPage(1); syncUrl(applied, direction); };

  const exportUrl = filtersUrl(applied);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <button type="button" aria-label="Retour aux rapports" onClick={() => navigate('/reports')} className="btn-ghost min-h-11 min-w-11 rounded-lg">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-page-title text-primary">Rapport Ventes Détaillé</h1>
            <p className="text-xs text-text-muted">Analyse ligne par ligne des transactions</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigate(exportUrl)}
          className="btn-secondary min-h-11 text-sm flex items-center gap-1.5"
        >
          <Download size={13} />
          Export CSV/XLSX
        </button>
      </div>

      {/* Filtres */}
      <FiltersPanel draft={draft} setDraft={setDraft} onApply={handleApply} onReset={handleReset} />

      {error && <div role="alert" className="card space-y-2 text-sm text-danger">
        <p><AlertCircle size={16} className="inline mr-2" />Impossible de charger le rapport. {reportErrorMessage(error, 'Réessayez.')}</p>
        <button type="button" onClick={() => void refetch()} className="btn-secondary min-h-11">Réessayer</button>
      </div>}

      {!error && <>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="CA Total" value={resume ? formatUSD(resume.totalCA) : '—'} trend={resume?.trends?.ca} icon={<TrendingUp size={16} />} isLoading={isLoading} />
        <StatCard label="Nb ventes" value={resume ? String(resume.nbVentes) : '—'} trend={resume?.trends?.ventes} icon={<ShoppingCart size={16} />} isLoading={isLoading} />
        <StatCard label="Remises accordées" value={resume ? formatUSD(resume.remisesAccordees) : '—'} icon={<Percent size={16} />} isLoading={isLoading} />
        <StatCard label="Ticket moyen" value={resume ? formatUSD(resume.ticketMoyen) : '—'} icon={<Receipt size={16} />} isLoading={isLoading} />
      </div>

      {/* Tableau ventes */}
      <SalesDetailTable
        ventes={ventes}
        meta={meta}
        onPageChange={setPage}
        isLoading={isLoading}
        isFetching={isFetching}
        sortDir={sortDir}
        onSort={handleSort}
      />

      {/* Performance agents */}
      <AgentPerformanceTable
        data={totauxParAgent}
        isLoading={isLoading}
        onAgentClick={handleAgentClick}
      />
      </>}
    </div>
  );
}

export default function RapportVentesPage() {
  const scope = usePrivateQueryScope('DIRECTEUR_REGIONAL');
  if (!scope.enabled) return <p role="alert" className="card text-sm text-danger">Votre session ne permet pas l’accès au rapport détaillé.</p>;
  return <SalesContent key={scope.key} />;
}
