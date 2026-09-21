import { useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Package, MapPin, BarChart2, AlertTriangle, Download, RefreshCw } from 'lucide-react';
import { useStocksReport } from '@/hooks/useStocksReport';
import { useDebounce } from '@/hooks/useDebounce';
import { formatUSD, cn } from '@/lib/utils';
import { usePrivateQueryScope } from '@/hooks/usePrivateQueryScope';
import { ReportSiteFilter } from '@/components/reports/ReportSiteFilter';
import { reportExportUrl, reportErrorMessage } from '@/lib/reportExport.utils';
import type { StocksReportResponse } from '@/lib/reports.api';

// ── Helpers ───────────────────────────────────────────────────────────────────

function abbreviateCDF(amount: number): string {
  return formatUSD(amount);
}

// ── Stat card stocks ──────────────────────────────────────────────────────────

function StockValueCard({ label, value, sub, icon: Icon, isLoading, color = '#2E86C1' }: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  isLoading?: boolean;
  color?: string;
}) {
  return (
    <div className="stat-card">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl" style={{ background: color + '18' }}>
          <Icon size={20} style={{ color }} />
        </div>
        <div className="min-w-0">
          {isLoading ? (
            <>
              <div className="skeleton h-6 w-28 rounded mb-1" />
              <div className="skeleton h-3 w-20 rounded" />
            </>
          ) : (
            <>
              <p className="text-lg font-bold text-primary leading-tight">{value}</p>
              <p className="text-xs text-text-muted">{label}</p>
              {sub && <p className="text-[11px] text-text-muted">{sub}</p>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Tableau stocks consolidés ─────────────────────────────────────────────────

function ConsolidatedStockTable({ rawData, search, categorie, isLoading }: {
  rawData: StocksReportResponse | undefined;
  search: string;
  categorie: string;
  isLoading: boolean;
}) {
  const navigate = useNavigate();
  const [sortField, setSortField] = useState<'total' | 'nom'>('total');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const sites: Array<{ id: string; nom: string }> = useMemo(() => {
    if (!rawData?.data?.length) return [];
    const siteMap: Record<string, string> = {};
    for (const item of rawData.data) {
      for (const stock of item.sites ?? []) {
        siteMap[stock.site.id] = stock.site.nom;
      }
    }
    return Object.entries(siteMap).map(([id, nom]) => ({ id, nom }));
  }, [rawData]);

  const produits = useMemo(() => {
    if (!rawData?.data) return [];
    return rawData.data.map(item => {
      const stockParSite: Record<string, number> = {};
      let hasRupture = false;
      for (const stock of item.sites ?? []) {
        stockParSite[stock.site.id] = stock.quantite;
        if (stock.quantite === 0) hasRupture = true;
      }
      return {
        ...item.produit,
        stockParSite,
        totalStock: item.totalQuantite,
        valeurTotale: item.valeurStock,
        hasRupture,
      };
    });
  }, [rawData]);

  const filtered = useMemo(() => {
    let list = [...produits];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((p: any) => p.nom.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q));
    }
    if (categorie) {
      list = list.filter((p: any) => p.categorie === categorie);
    }
    return list.sort((a: any, b: any) => {
      if (a.hasRupture && !b.hasRupture) return -1;
      if (!a.hasRupture && b.hasRupture) return 1;
      if (sortField === 'nom') return sortDir === 'asc' ? a.nom.localeCompare(b.nom) : b.nom.localeCompare(a.nom);
      return sortDir === 'asc' ? a.totalStock - b.totalStock : b.totalStock - a.totalStock;
    });
  }, [produits, search, categorie, sortField, sortDir]);

  const totals = useMemo(() => {
    const t: Record<string, number> = { all: 0 };
    for (const p of filtered) {
      for (const [sid, qty] of Object.entries(p.stockParSite as Record<string, number>)) {
        t[sid] = (t[sid] ?? 0) + qty;
        t.all += qty;
      }
    }
    return t;
  }, [filtered]);

  const toggleSort = (field: 'total' | 'nom') => {
    if (sortField === field) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  if (isLoading) {
    return (
      <div className="card p-0 overflow-hidden" role="status" aria-label="Chargement des stocks">
        <div className="p-4 border-b"><div className="skeleton h-5 w-56 rounded" /></div>
        <div className="divide-y">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="px-4 py-3 space-y-1">
              <div className="skeleton h-4 w-full rounded" />
              <div className="skeleton h-3 w-3/4 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="card p-0 overflow-hidden">
      {/* Desktop: Table normale avec scroll horizontal */}
      <div className="hidden md:block overflow-x-auto" role="region" aria-label="Stocks par site, défilement horizontal" tabIndex={0}>
        <table className="w-full text-sm" style={{ minWidth: '700px' }} aria-label="Stocks par site">
          <thead>
            <tr style={{ background: '#1E3A5F' }}>
              <th
                className="px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-white sticky left-0 bg-[#1E3A5F] min-w-[100px] cursor-pointer"
                aria-sort={sortField === 'nom' ? sortDir === 'asc' ? 'ascending' : 'descending' : 'none'}
              ><button type="button" className="min-h-11" onClick={() => toggleSort('nom')}>SKU / Nom</button></th>
              <th className="px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-white">Catégorie</th>
              <th className="px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-white">P. Achat</th>
              {sites.map((s) => (
                <th key={s.id} className="px-3 py-2.5 text-center text-[11px] font-bold uppercase tracking-wide text-white">{s.nom}</th>
              ))}
              <th
                className="px-3 py-2.5 text-center text-[11px] font-bold uppercase tracking-wide text-white cursor-pointer"
                aria-sort={sortField === 'total' ? sortDir === 'asc' ? 'ascending' : 'descending' : 'none'}
              ><button type="button" className="min-h-11" onClick={() => toggleSort('total')}>Total</button></th>
              <th className="px-3 py-2.5 text-right text-[11px] font-bold uppercase tracking-wide text-white">Valeur</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={5 + sites.length} className="py-10 text-center text-text-muted">Aucun produit trouvé.</td></tr>
            )}
            {filtered.map((p: any, idx: number) => (
              <tr
                key={p.id}
                className={cn('border-b border-border/60', idx % 2 === 1 ? 'bg-gray-50/50' : 'bg-white')}
              >
                <td className="px-3 py-2.5 sticky left-0 bg-inherit">
                  <p className="font-mono text-[11px] text-text-muted">{p.sku}</p>
                  <button type="button"
                    className="min-h-11 text-left font-semibold text-primary text-sm hover:underline"
                    onClick={() => navigate(`/stocks/${p.id}`)}
                  >
                    {p.nom.length > 22 ? p.nom.slice(0, 22) + '…' : p.nom}
                  </button>
                </td>
                <td className="px-3 py-2.5 text-xs text-text-muted">{p.categorie}</td>
                <td className="px-3 py-2.5 text-xs tabular-nums">{formatUSD(Number(p.prixAchat ?? 0))}</td>
                {sites.map((s) => {
                  const qty = p.stockParSite[s.id] ?? 0;
                  return (
                    <td
                      key={s.id}
                      className={cn(
                        'px-3 py-2.5 text-center font-bold tabular-nums text-sm',
                        qty === 0 ? 'bg-red-100 text-red-700' : 'text-text',
                      )}
                    >
                      {qty === 0 ? '🔴 0' : qty}
                    </td>
                  );
                })}
                <td className="px-3 py-2.5 text-center font-black tabular-nums text-primary">{p.totalStock}</td>
                <td className="px-3 py-2.5 text-right font-mono text-xs tabular-nums text-success">
                  {abbreviateCDF(p.valeurTotale)}
                </td>
              </tr>
            ))}
            {/* TOTAL row */}
            <tr className="border-t-2 border-primary/30 bg-slate-100">
              <td className="px-3 py-2.5 font-bold text-primary sticky left-0 bg-slate-100" colSpan={3}>TOTAL</td>
              {sites.map((s) => (
                <td key={s.id} className="px-3 py-2.5 text-center font-bold tabular-nums">{totals[s.id] ?? 0}</td>
              ))}
              <td className="px-3 py-2.5 text-center font-black tabular-nums text-primary">{totals.all}</td>
              <td className="px-3 py-2.5 text-right font-mono font-bold tabular-nums text-success">
                {abbreviateCDF(filtered.reduce((s: number, p: any) => s + p.valeurTotale, 0))}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Mobile: Cards empilées */}
      <div className="md:hidden divide-y divide-border">
        {filtered.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-text-muted">
            Aucun produit trouvé
          </div>
        ) : (
          filtered.map((p: any) => (
            <div key={p.id} className="px-4 py-3 space-y-2">
              {/* Nom + SKU */}
              <div>
                <p className="text-[13px] font-semibold text-text leading-snug">{p.nom}</p>
                <p className="text-[11px] text-text-muted font-mono">{p.sku}</p>
              </div>

              {/* Stock total + valeur */}
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] text-text-muted uppercase tracking-wide">Stock total</p>
                  <p className="text-[16px] font-black text-primary font-mono">{p.totalStock}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-text-muted uppercase tracking-wide">Valeur</p>
                  <p className="text-[14px] font-bold text-success font-mono">{abbreviateCDF(p.valeurTotale)}</p>
                </div>
              </div>

              {/* Par site */}
              {sites.length > 0 && (
                <div className="pt-2 border-t border-border/50">
                  <p className="text-[10px] text-text-muted uppercase tracking-wide mb-1.5">Par site</p>
                  <div className="grid grid-cols-2 gap-2">
                    {sites.map((s) => (
                      <div key={s.id} className="flex items-center justify-between text-xs">
                        <span className="text-text-muted">{s.nom}</span>
                        <span className={cn(
                          'font-mono font-semibold tabular-nums',
                          p.stockParSite[s.id] === 0 ? 'text-danger' : 'text-text'
                        )}>
                          {p.stockParSite[s.id] ?? 0}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

function StocksContent() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState(searchParams.get('search') ?? '');
  const [categorie, setCategorie] = useState(searchParams.get('categorie') ?? '');
  const [siteId, setSiteId] = useState(searchParams.get('siteId') ?? '');
  const search = useDebounce(searchInput, 200);

  const { data: rawData, isLoading, isFetching, error, refetch } = useStocksReport({ siteId: siteId || undefined, categorie: categorie || undefined, search: search || undefined });
  const updateFilters = (next: { siteId: string; categorie: string; search: string }) => {
    setSiteId(next.siteId); setCategorie(next.categorie); setSearchInput(next.search);
    const params = new URLSearchParams(reportExportUrl('STOCKS', next).split('?')[1]);
    params.delete('type');
    setSearchParams(params, { replace: true });
  };

  const summary = useMemo(() => {
    if (!rawData) return { nbSites: 0, nbProduits: 0, nbAvecAlerte: 0, valeurTotale: 0 };
    let nbAvecAlerte = 0;
    let valeurTotale = 0;
    for (const item of rawData.data ?? []) {
      for (const s of item.sites ?? []) {
        if (s.alerte) nbAvecAlerte++;
      }
      valeurTotale += item.valeurStock ?? 0;
    }
    return {
      nbSites: rawData.totalSites ?? 0,
      nbProduits: rawData.totalProduits ?? 0,
      nbAvecAlerte,
      valeurTotale,
    };
  }, [rawData]);

  const rupturesProduits = useMemo(() => {
    if (!rawData?.data) return [];
    return rawData.data.filter((item: any) =>
      item.sites?.some((s: any) => s.quantite === 0),
    );
  }, [rawData]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <button type="button" aria-label="Retour aux rapports" onClick={() => navigate('/reports')} className="btn-ghost min-h-11 min-w-11 rounded-lg">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-page-title text-primary">Rapport Stocks Multi-Sites</h1>
            <p className="text-xs text-text-muted">Inventaire consolidé par site</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigate(reportExportUrl('STOCKS', { siteId, categorie, search: searchInput }))}
          className="btn-secondary min-h-11 text-sm flex items-center gap-1.5"
        >
          <Download size={13} />
          Export CSV/XLSX
        </button>
      </div>

      {/* KPI cards */}
      {!error && <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StockValueCard label="Sites actifs" value={String(summary.nbSites)} icon={MapPin} isLoading={isLoading} color="#1E3A5F" />
        <StockValueCard
          label="Produits référencés"
          value={String(summary.nbProduits)}
          sub={summary.nbAvecAlerte > 0 ? `${summary.nbAvecAlerte} avec alerte/rupture` : undefined}
          icon={Package}
          isLoading={isLoading}
          color={summary.nbAvecAlerte > 0 ? '#E65100' : '#1A6B3A'}
        />
        <StockValueCard
          label="Valeur totale inventaire"
          value={isLoading ? '…' : abbreviateCDF(summary.valeurTotale)}
          icon={BarChart2}
          isLoading={isLoading}
          color="#2E86C1"
        />
      </div>}

      {/* Alert ruptures */}
      {rupturesProduits.length > 0 && !isLoading && !error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={18} className="text-danger" />
            <h2 className="text-sm font-bold text-danger">
              Produits nécessitant attention — {rupturesProduits.length} produit{rupturesProduits.length !== 1 ? 's' : ''} en rupture partielle ou totale
            </h2>
          </div>
          <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto">
            {rupturesProduits.map((item: any) => (
              <button
                key={item.produit.id}
                type="button"
                onClick={() => navigate(`/stocks/${item.produit.id}`)}
                className="bg-white border border-red-200 rounded-lg px-3 py-1.5 text-left hover:border-red-400 transition-colors"
              >
                <p className="font-mono text-[11px] text-text-muted">{item.produit.sku}</p>
                <p className="text-xs font-semibold text-danger">{item.produit.nom}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-3">
        <ReportSiteFilter value={siteId} onChange={value => updateFilters({ siteId: value, categorie, search: searchInput })} />
        <input
          type="text"
          value={searchInput}
          onChange={event => updateFilters({ siteId, categorie, search: event.target.value })}
          aria-label="Rechercher par nom ou SKU"
          placeholder="Rechercher par nom ou SKU…"
          className="min-h-11 w-full min-w-0 rounded-lg border border-border bg-white px-3 text-sm sm:w-auto focus:outline-none focus:ring-2 focus:ring-primary-accent/30"
        />
        <select
          value={categorie}
          onChange={event => updateFilters({ siteId, categorie: event.target.value, search: searchInput })}
          className="min-h-11 max-w-full rounded-lg border border-border bg-white px-3 text-sm"
          aria-label="Filtrer par catégorie"
        >
          <option value="">Toutes catégories</option>
          {categorie && !['Smartphones', 'Accessoires', 'Audio', 'Informatique'].includes(categorie) && <option value={categorie}>{categorie}</option>}
          <option value="Smartphones">Smartphones</option>
          <option value="Accessoires">Accessoires</option>
          <option value="Audio">Audio</option>
          <option value="Informatique">Informatique</option>
        </select>
        <button type="button" className="btn-secondary min-h-11 text-sm" onClick={() => updateFilters({ siteId: '', categorie: '', search: '' })}>Réinitialiser</button>
      </div>

      {error && <div role="alert" className="card space-y-2 text-sm text-danger">
        <p>Impossible de charger le rapport stocks. {reportErrorMessage(error, 'Réessayez.')}</p>
        <button type="button" onClick={() => void refetch()} className="btn-secondary min-h-11">Réessayer</button>
      </div>}
      {isFetching && <p role="status" className="text-sm text-text-muted">Actualisation des stocks…</p>}

      {/* Tableau consolidé */}
      {!error && <ConsolidatedStockTable
        rawData={rawData}
        search={search}
        categorie={categorie}
        isLoading={isLoading}
      />}
    </div>
  );
}

export default function RapportStocksPage() {
  const scope = usePrivateQueryScope('DIRECTEUR_REGIONAL');
  if (!scope.enabled) return <p role="alert" className="card text-sm text-danger">Votre session ne permet pas l’accès au rapport stocks.</p>;
  return <StocksContent key={scope.key} />;
}
