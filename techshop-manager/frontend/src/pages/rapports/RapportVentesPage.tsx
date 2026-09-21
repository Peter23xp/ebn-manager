import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { TrendingUp, ShoppingCart, Percent, Receipt, Download, AlertCircle, RefreshCw, ChevronUp, ChevronDown } from 'lucide-react';
import { usePrivateQueryScope } from '@/hooks/usePrivateQueryScope';
import { ReportSiteFilter } from '@/components/reports/ReportSiteFilter';
import { ReportPageLayout } from '@/components/reports/ReportPageLayout';
import { ReportMetric } from '@/components/reports/ReportMetric';
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
    <div className="report-filters space-y-3" role="group" aria-label="Filtres des ventes">
      <div className="report-fields">
        <ReportSiteFilter value={draft.siteId} onChange={siteId => setDraft({ ...draft, siteId })} />
        <div className="report-filter-field">
          <label htmlFor="period-selector">Période</label>
        <PeriodSelector
          value={draft.preset}
          onChange={(p, r) => setDraft({ ...draft, preset: p, dateRange: p === 'custom' ? draft.dateRange : r })}
        />
        </div>
        {draft.preset === 'custom' && (
          <div className="report-filter-field report-custom-range">
            <label htmlFor="date-range-picker-trigger">Dates personnalisées</label>
          <DateRangePicker
            value={draft.dateRange}
            onChange={(r) => setDraft({ ...draft, dateRange: r, preset: 'custom' })}
            maxDate={new Date()}
          />
          </div>
        )}
        <label className="report-filter-field">Mode de paiement
        <select
          value={draft.modePaiement}
          onChange={(e) => setDraft({ ...draft, modePaiement: e.target.value })}
          className="min-h-11 max-w-full rounded-lg border border-border bg-white px-3 text-sm"
          aria-label="Mode de paiement"
        >
          <option value="">Tous paiements</option>
          <option value="CASH">Espèces</option>
          <option value="MPESA">M-Pesa</option>
          <option value="AIRTEL_MONEY">Airtel Money</option>
          <option value="VIREMENT">Virement</option>
        </select>
        </label>
        <label className="report-filter-field">Recherche
        <input aria-label="Rechercher une vente" value={draft.search} onChange={event => setDraft({ ...draft, search: event.target.value })}
          placeholder="Numéro ou nom du client" className="min-h-11 w-full rounded-lg border border-border px-3 text-sm sm:w-auto" />
        </label>
        <label className="report-filter-field">Catégorie
        <input aria-label="Catégorie" value={draft.categorie} onChange={event => setDraft({ ...draft, categorie: event.target.value })}
          placeholder="Toutes catégories" className="min-h-11 w-full rounded-lg border border-border px-3 text-sm sm:w-auto" />
        </label>
        <label className="report-filter-field">Agent (identifiant)
        <input aria-label="Agent (identifiant)" value={draft.agentId} onChange={event => setDraft({ ...draft, agentId: event.target.value })}
          placeholder="Tous les agents" className="min-h-11 w-full rounded-lg border border-border px-3 text-sm sm:w-auto" />
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <p className="max-w-prose text-xs text-text-muted">Appliquez vos filtres pour mettre à jour les résultats.</p>
        <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onApply} className="btn-primary min-h-11 text-sm px-4">
          Appliquer {activeCount > 0 && <span className="ml-1 rounded-full bg-white/20 px-1.5">{activeCount}</span>}
        </button>
        <button type="button" onClick={onReset} className="btn-ghost min-h-11 text-sm px-3">
          Réinitialiser
        </button>
        </div>
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
      <div className="report-data-panel" role="status" aria-label="Chargement des ventes">
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
    <div className="report-data-panel">
      <div className="report-data-heading">
        <h2 className="text-sm font-bold text-primary">
          Détail des ventes
          {isFetching && <span className="ml-2 inline-flex items-center gap-1 text-xs text-text-muted"><RefreshCw size={12} className="motion-safe:animate-spin" aria-hidden="true" />Chargement…</span>}
        </h2>
        <span className="text-xs text-text-muted">{meta.total} résultat{meta.total !== 1 ? 's' : ''}</span>
      </div>
      <div className="overflow-x-auto" role="region" aria-label="Détail des ventes, défilement horizontal" tabIndex={0}>
        <table className="report-sales-table w-full text-sm" aria-label="Détail des ventes" aria-busy={isFetching}>
          <thead>
            <tr>
              {['N° Vente', 'Date', 'Client', 'Produit(s)', 'Agent', 'Site', 'Montant (USD)', 'Paiement', 'Remise (USD)', 'Points', 'Statut'].map((h) => (
                <th
                  key={h}
                  className="whitespace-nowrap px-4 py-3 text-left"
                  scope="col"
                  aria-sort={h === 'Date' ? sortDir === 'asc' ? 'ascending' : 'descending' : undefined}
                >
                  {h === 'Date' ? <button type="button" aria-label="Trier par date" onClick={onSort} className="flex min-h-11 items-center gap-1">
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
                  <td className="px-3 py-2.5 text-xs" title={v.client ? `${v.client.prenom} ${v.client.nom}` : undefined}>
                    {v.client ? `${v.client.prenom} ${v.client.nom}` : 'Anonyme'}
                  </td>
                  <td className="px-3 py-2.5 text-xs">
                    {firstProduit}
                    {extraCount > 0 && <span className="ml-1 text-text-muted">+{extraCount}</span>}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-text-muted">{v.agent?.nom ?? '—'}</td>
                  <td className="px-3 py-2.5 text-xs text-text-muted">{v.site?.nom ?? '—'}</td>
                  <td className="px-3 py-2.5 font-mono text-xs font-bold text-primary">
                    {formatUSD(Number(v.montantNet ?? 0))}
                  </td>
                  <td className="px-3 py-2.5 text-xs">
                    <span className="badge badge-info">{{ CASH: 'Espèces', MPESA: 'M-Pesa', AIRTEL_MONEY: 'Airtel Money', VIREMENT: 'Virement' }[v.modePaiement] ?? v.modePaiement}</span>
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
                      {{ VALIDE: 'Validée', RETOURNEE: 'Retournée', RETOURNEE_PARTIELLE: 'Retour partiel', ANNULEE: 'Annulée' }[v.statut] ?? v.statut}
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
      <div className="report-data-panel">
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
    <div className="report-data-panel">
      <div className="report-data-heading">
        <h2 className="text-sm font-bold text-primary">Performance par agent</h2>
      </div>
      <div className="overflow-x-auto" role="region" aria-label="Performance des agents, défilement horizontal" tabIndex={0}>
        <table className="report-agents-table w-full text-sm" aria-label="Performance par agent">
          <thead>
            <tr>
              {['Agent', 'Site', 'Ventes', 'CA total (USD)', 'CA moyen (USD)', 'Remises (USD)'].map((h) => (
                <th key={h} scope="col" className="px-4 py-3 text-left">{h}</th>
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
                <td className="px-4 py-2.5 font-semibold text-primary tabular-nums">{formatUSD(a.caTotal)}</td>
                <td className="px-4 py-2.5 text-text-muted tabular-nums">{formatUSD(a.caMoyen)}</td>
                <td className="px-4 py-2.5 tabular-nums text-danger">{a.remisesAccordees > 0 ? formatUSD(a.remisesAccordees) : '—'}</td>
              </tr>
            ))}
            <tr className="border-t border-border-strong bg-slate-50">
              <td className="px-4 py-2.5 font-bold text-primary" colSpan={2}>TOTAL</td>
              <td className="px-4 py-2.5 font-bold tabular-nums">{totals.nbVentes}</td>
              <td className="px-4 py-2.5 font-bold text-primary tabular-nums">{formatUSD(totals.caTotal)}</td>
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
    <ReportPageLayout active="sales" title="Ventes détaillées" description="Transactions, remises et performance de vos agents." exportUrl={exportUrl}
      action={<button
          type="button"
          onClick={() => navigate(exportUrl)}
          className="btn-primary gap-2"
        >
          <Download size={16} aria-hidden="true" />
          Export CSV/XLSX
        </button>}
    >

      {/* Filtres */}
      <FiltersPanel draft={draft} setDraft={setDraft} onApply={handleApply} onReset={handleReset} />

      {error && <div role="alert" className="card space-y-2 text-sm text-danger">
        <p><AlertCircle size={16} className="inline mr-2" />Impossible de charger le rapport. {reportErrorMessage(error, 'Réessayez.')}</p>
        <button type="button" onClick={() => void refetch()} className="btn-secondary min-h-11">Réessayer</button>
      </div>}

      {!error && <>

      {/* KPI cards */}
      <section aria-label="Indicateurs des ventes" aria-busy={isLoading}>
        <dl className="report-summary report-summary-four">
          <ReportMetric label="Chiffre d’affaires" value={resume ? formatUSD(resume.totalCA) : '—'} trend={resume?.trends?.ca} icon={<TrendingUp size={16} />} isLoading={isLoading} />
          <ReportMetric label="Nombre de ventes" value={resume ? resume.nbVentes.toLocaleString('fr-CD') : '—'} trend={resume?.trends?.ventes} icon={<ShoppingCart size={16} />} isLoading={isLoading} />
          <ReportMetric label="Remises accordées" value={resume ? formatUSD(resume.remisesAccordees) : '—'} icon={<Percent size={16} />} isLoading={isLoading} />
          <ReportMetric label="Ticket moyen" value={resume ? formatUSD(resume.ticketMoyen) : '—'} icon={<Receipt size={16} />} isLoading={isLoading} />
        </dl>
      </section>

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
    </ReportPageLayout>
  );
}

export default function RapportVentesPage() {
  const scope = usePrivateQueryScope('DIRECTEUR_REGIONAL');
  if (!scope.enabled) return <p role="alert" className="card text-sm text-danger">Votre session ne permet pas l’accès au rapport détaillé.</p>;
  return <SalesContent key={scope.key} />;
}
