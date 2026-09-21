import { useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Package, MapPin, BarChart2, AlertTriangle, Download } from 'lucide-react';
import { useStocksReport } from '@/hooks/useStocksReport';
import { useDebounce } from '@/hooks/useDebounce';
import { formatUSD, cn } from '@/lib/utils';
import { usePrivateQueryScope } from '@/hooks/usePrivateQueryScope';
import { ReportSiteFilter } from '@/components/reports/ReportSiteFilter';
import { ReportPageLayout } from '@/components/reports/ReportPageLayout';
import { ReportMetric } from '@/components/reports/ReportMetric';
import { reportExportUrl, reportErrorMessage } from '@/lib/reportExport.utils';
import type { StocksReportResponse } from '@/lib/reports.api';

// ── Helpers ───────────────────────────────────────────────────────────────────

function abbreviateCDF(amount: number): string {
  return formatUSD(amount);
}

// ── Stat card stocks ──────────────────────────────────────────────────────────

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
      <div className="report-data-panel" role="status" aria-label="Chargement des stocks">
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
    <section className="report-data-panel" aria-labelledby="report-inventory-title">
      <div className="report-data-heading">
        <h2 id="report-inventory-title">Inventaire par produit</h2>
        <p className="text-xs text-text-muted">{filtered.length.toLocaleString('fr-CD')} produit(s) · Ruptures affichées en premier</p>
      </div>
      {/* Desktop: Table normale avec scroll horizontal */}
      <div className="hidden md:block overflow-x-auto" role="region" aria-label="Stocks par site, défilement horizontal" tabIndex={0}>
        <table className="w-full text-sm" style={{ minWidth: '700px' }} aria-label="Stocks par site">
          <thead>
            <tr>
              <th
                className="sticky left-0 z-10 min-w-[160px] bg-slate-50 px-4 py-3 text-left"
                scope="col"
                aria-sort={sortField === 'nom' ? sortDir === 'asc' ? 'ascending' : 'descending' : 'none'}
              ><button type="button" className="min-h-11" onClick={() => toggleSort('nom')}>SKU / Nom</button></th>
              <th scope="col" className="px-4 py-3 text-left">Catégorie</th>
              <th scope="col" className="px-4 py-3 text-right">Prix d’achat (USD)</th>
              {sites.map((s) => (
                <th key={s.id} scope="col" className="min-w-24 px-4 py-3 text-center">{s.nom}</th>
              ))}
              <th
                className="px-4 py-3 text-center"
                scope="col"
                aria-sort={sortField === 'total' ? sortDir === 'asc' ? 'ascending' : 'descending' : 'none'}
              ><button type="button" className="min-h-11" onClick={() => toggleSort('total')}>Total</button></th>
              <th scope="col" className="px-4 py-3 text-right">Valeur (USD)</th>
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
                  <p className="font-mono text-xs text-text-muted">{p.sku}</p>
                  <button type="button"
                    className="min-h-11 text-left font-semibold text-primary text-sm hover:underline"
                    onClick={() => navigate(`/stocks/${p.id}`)}
                  >
                    {p.nom}
                  </button>
                </td>
                <td className="px-3 py-2.5 text-xs text-text-muted">{p.categorie}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{formatUSD(Number(p.prixAchat ?? 0))}</td>
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
                      {qty === 0 ? <span aria-label="Rupture de stock : 0 unité">0<span className="block text-xs font-medium">Rupture</span></span> : qty}
                    </td>
                  );
                })}
                <td className="px-3 py-2.5 text-center font-semibold tabular-nums text-primary">{p.totalStock}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums text-primary">
                  {abbreviateCDF(p.valeurTotale)}
                </td>
              </tr>
            ))}
            {/* TOTAL row */}
            <tr className="border-t border-border-strong bg-slate-100">
              <td className="px-3 py-2.5 font-bold text-primary sticky left-0 bg-slate-100" colSpan={3}>TOTAL</td>
              {sites.map((s) => (
                <td key={s.id} className="px-3 py-2.5 text-center font-bold tabular-nums">{totals[s.id] ?? 0}</td>
              ))}
              <td className="px-3 py-2.5 text-center font-bold tabular-nums text-primary">{totals.all}</td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right font-bold tabular-nums text-primary">
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
            <div key={p.id} className="min-w-0 space-y-3 p-4">
              {/* Nom + SKU */}
              <div>
                <p className="break-words text-sm font-semibold leading-snug text-primary">{p.nom}</p>
                <p className="mt-1 break-words font-mono text-xs text-text-muted">{p.sku}</p>
              </div>

              {/* Stock total + valeur */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs text-text-muted">Stock total</p>
                  <p className="text-base font-bold tabular-nums text-primary">{p.totalStock}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-text-muted">Valeur</p>
                  <p className="text-sm font-semibold tabular-nums text-primary">{abbreviateCDF(p.valeurTotale)}</p>
                </div>
              </div>

              {/* Par site */}
              {sites.length > 0 && (
                <div className="pt-2 border-t border-border/50">
                  <p className="mb-2 text-xs text-text-muted">Par site</p>
                  <div className="space-y-2">
                    {sites.map((s) => (
                      <div key={s.id} className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="min-w-0 break-words text-text-muted">{s.nom}</span>
                        <span className={cn(
                          'shrink-0 font-semibold tabular-nums',
                          p.stockParSite[s.id] === 0 ? 'text-danger' : 'text-text'
                        )}>
                          {p.stockParSite[s.id] === 0 ? '0 · Rupture' : p.stockParSite[s.id] ?? 0}
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
    </section>
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
    <ReportPageLayout active="stocks" title="Stocks et inventaire" description="Disponibilités, ruptures et valorisation de votre inventaire."
      exportUrl={reportExportUrl('STOCKS', { siteId, categorie, search: searchInput })}
      action={<button
          type="button"
          onClick={() => navigate(reportExportUrl('STOCKS', { siteId, categorie, search: searchInput }))}
          className="btn-primary gap-2"
        >
          <Download size={16} aria-hidden="true" />
          Export CSV/XLSX
        </button>}
    >
      <div className="report-filters space-y-3" role="group" aria-label="Filtres du stock">
        <div className="report-fields">
          <ReportSiteFilter value={siteId} onChange={value => updateFilters({ siteId: value, categorie, search: searchInput })} />
          <label className="report-filter-field">Recherche
            <input type="text" value={searchInput} onChange={event => updateFilters({ siteId, categorie, search: event.target.value })}
              aria-label="Rechercher par nom ou SKU" placeholder="Nom du produit ou SKU" />
          </label>
          <label className="report-filter-field">Catégorie
            <select value={categorie} onChange={event => updateFilters({ siteId, categorie: event.target.value, search: searchInput })} aria-label="Filtrer par catégorie">
              <option value="">Toutes catégories</option>
              {categorie && !['Smartphones', 'Accessoires', 'Audio', 'Informatique'].includes(categorie) && <option value={categorie}>{categorie}</option>}
              <option value="Smartphones">Smartphones</option>
              <option value="Accessoires">Accessoires</option>
              <option value="Audio">Audio</option>
              <option value="Informatique">Informatique</option>
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <p className="text-xs text-text-muted">Inventaire actuel · Indépendant du filtre de dates</p>
          <button type="button" className="btn-ghost" onClick={() => updateFilters({ siteId: '', categorie: '', search: '' })}>Réinitialiser</button>
        </div>
      </div>

      {/* KPI cards */}
      {!error && <section aria-label="Indicateurs du stock" aria-busy={isLoading}>
        <dl className="report-summary report-summary-three">
          <ReportMetric label="Valeur totale inventaire" value={abbreviateCDF(summary.valeurTotale)} icon={<BarChart2 size={16} />} isLoading={isLoading} />
          <ReportMetric label="Produits référencés" value={summary.nbProduits.toLocaleString('fr-CD')} note={summary.nbAvecAlerte > 0 ? `${summary.nbAvecAlerte} alerte(s) produit/site` : undefined} icon={<Package size={16} />} isLoading={isLoading} />
          <ReportMetric label="Sites actifs" value={summary.nbSites.toLocaleString('fr-CD')} icon={<MapPin size={16} />} isLoading={isLoading} />
        </dl>
      </section>}

      {/* Alert ruptures */}
      {rupturesProduits.length > 0 && !isLoading && !error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="flex items-start gap-2 mb-3">
            <AlertTriangle size={18} className="shrink-0 text-red-700" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-red-800">
              Produits nécessitant attention — {rupturesProduits.length} produit{rupturesProduits.length !== 1 ? 's' : ''} en rupture partielle ou totale
            </h2>
          </div>
          <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto">
            {rupturesProduits.map((item: any) => (
              <button
                key={item.produit.id}
                type="button"
                onClick={() => navigate(`/stocks/${item.produit.id}`)}
                className="min-w-0 max-w-full rounded-lg px-2 py-1.5 text-left text-red-800 hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700"
              >
                <span className="block break-words text-sm font-semibold">{item.produit.nom}</span>
                <span className="block break-words font-mono text-xs">{item.produit.sku}</span>
              </button>
            ))}
          </div>
        </div>
      )}

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
    </ReportPageLayout>
  );
}

export default function RapportStocksPage() {
  const scope = usePrivateQueryScope('DIRECTEUR_REGIONAL');
  if (!scope.enabled) return <p role="alert" className="card text-sm text-danger">Votre session ne permet pas l’accès au rapport stocks.</p>;
  return <StocksContent key={scope.key} />;
}
