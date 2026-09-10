import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Search, Plus, ArrowRightLeft, RefreshCw,
  Package, AlertCircle, ChevronDown, ChevronUp, PackagePlus,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { useDebounce } from '@/hooks/useDebounce';
import { stocksApi, getStockStatut } from '@/lib/stocks.api';
import { StockStatusBadge } from '@/components/stocks/StockStatusBadge';
import { cn, formatUSD } from '@/lib/utils';
import type { StatutStock } from '@/types';

const LIMIT = 50;

export default function InventairePage() {
  const navigate = useNavigate();
  const { user, hasRole } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();

  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const [categorie, setCategorie] = useState(searchParams.get('categorie') ?? '');
  const [statut, setStatut] = useState<StatutStock | ''>(
    (searchParams.get('statut') as StatutStock | '') ?? '',
  );
  const [page, setPage] = useState(1);
  const [sortField, setSortField] = useState<'nom' | 'quantite'>('quantite');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const debouncedSearch = useDebounce(search, 300);

  const canWrite = hasRole('GERANT');
  const canSeeSites = hasRole('DIRECTEUR_REGIONAL');
  const siteId = canSeeSites ? undefined : (user?.siteId ?? undefined);

  const { data: catData } = useQuery({
    queryKey: ['produits', 'categories'],
    queryFn: () => stocksApi.getCategories(),
    staleTime: 5 * 60_000,
  });
  const categories = catData?.categories ?? [];

  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: ['stocks', { siteId, search: debouncedSearch, categorie, statut, page, sortField, sortOrder }],
    queryFn: () => stocksApi.getInventory({
      siteId,
      search: debouncedSearch || undefined,
      categorie: categorie || undefined,
      statut: statut || undefined,
      page,
      limit: LIMIT,
      sortBy: sortField,
      sortOrder,
    }),
    staleTime: 2 * 60_000,
    placeholderData: (prev) => prev,
  });

  const stocks = data?.stocks ?? [];
  const meta = data?.meta;

  function toggleSort(field: 'nom' | 'quantite') {
    if (sortField === field) {
      setSortOrder(o => o === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
    setPage(1);
  }

  function SortIcon({ field }: { field: string }) {
    if (sortField !== field) return <ChevronDown size={11} className="opacity-30" />;
    return sortOrder === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />;
  }

  function handleSearch(v: string) {
    setSearch(v);
    setPage(1);
    const p = new URLSearchParams(searchParams);
    v ? p.set('search', v) : p.delete('search');
    setSearchParams(p, { replace: true });
  }

  function handleCategorie(v: string) {
    setCategorie(v);
    setPage(1);
    const p = new URLSearchParams(searchParams);
    v ? p.set('categorie', v) : p.delete('categorie');
    setSearchParams(p, { replace: true });
  }

  function handleStatut(v: StatutStock | '') {
    setStatut(v);
    setPage(1);
    const p = new URLSearchParams(searchParams);
    v ? p.set('statut', v) : p.delete('statut');
    setSearchParams(p, { replace: true });
  }

  function resetFilters() {
    setSearch(''); setCategorie(''); setStatut(''); setPage(1);
    setSearchParams({}, { replace: true });
  }

  const hasFilters = !!(search || categorie || statut);
  const totalAlertes = meta?.totalAlertes ?? 0;
  const totalRuptures = meta?.totalRuptures ?? 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="text-page-title text-primary">Stocks</h1>
          <p className="mt-1 text-[13px] text-text-muted">
            {user?.siteName ?? 'Tous les sites'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="btn-secondary"
            title="Rafraîchir"
          >
            <RefreshCw size={14} className={cn(isFetching && 'animate-spin')} />
            <span className="hidden sm:inline">Rafraîchir</span>
          </button>
          {canWrite && (
            <>
              <button
                type="button"
                onClick={() => navigate('/stocks/new')}
                className="btn-secondary"
                title="Nouveau produit"
              >
                <PackagePlus size={14} />
                <span className="hidden sm:inline">Nouveau produit</span>
              </button>
              <button
                type="button"
                onClick={() => navigate('/stocks/entry')}
                className="btn-secondary"
                title="Entrée stock"
              >
                <Plus size={14} />
                <span className="hidden sm:inline">Entrée</span>
              </button>
              <button
                type="button"
                onClick={() => navigate('/stocks/transfer')}
                className="btn-primary"
                title="Transfert"
              >
                <ArrowRightLeft size={14} />
                <span className="hidden sm:inline">Transfert</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Alertes summary */}
      {(totalRuptures > 0 || totalAlertes > 0) && (
        <div className="flex flex-wrap gap-2">
          {totalRuptures > 0 && (
            <button
              type="button"
              onClick={() => handleStatut('RUPTURE')}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold',
                'bg-red-100 text-danger hover:bg-red-200 transition-colors',
              )}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-danger" />
              {totalRuptures} rupture{totalRuptures > 1 ? 's' : ''}
            </button>
          )}
          {totalAlertes > 0 && (
            <button
              type="button"
              onClick={() => handleStatut('ALERTE')}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold',
                'bg-amber-100 text-warning hover:bg-amber-200 transition-colors',
              )}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-warning" />
              {totalAlertes} en alerte
            </button>
          )}
        </div>
      )}

      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-subtle" />
          <input
            type="text"
            placeholder="Rechercher par nom ou SKU..."
            value={search}
            onChange={e => handleSearch(e.target.value)}
            className="pl-8 text-sm"
          />
        </div>

        <div className="relative">
          <select
            value={categorie}
            onChange={e => handleCategorie(e.target.value)}
            className={cn('appearance-none text-sm pr-8', categorie && 'border-primary-accent bg-primary-light/20')}
          >
            <option value="">Catégorie</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-subtle" />
        </div>

        <div className="relative">
          <select
            value={statut}
            onChange={e => handleStatut(e.target.value as StatutStock | '')}
            className={cn('appearance-none text-sm pr-8', statut && 'border-primary-accent bg-primary-light/20')}
          >
            <option value="">Statut</option>
            <option value="OK">OK</option>
            <option value="ALERTE">Alerte</option>
            <option value="RUPTURE">Rupture</option>
          </select>
          <ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-subtle" />
        </div>

        {hasFilters && (
          <button
            type="button"
            onClick={resetFilters}
            className="text-[12px] text-text-muted hover:text-danger transition-colors"
          >
            Réinitialiser
          </button>
        )}
      </div>

      {/* Erreur */}
      {isError && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-danger">
          <AlertCircle size={16} />
          Impossible de charger les stocks.
          <button type="button" onClick={() => refetch()} className="ml-auto underline hover:no-underline">
            Réessayer
          </button>
        </div>
      )}

      {/* Tableau */}
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th className="hidden lg:table-cell">SKU</th>
              <th>
                <button
                  type="button"
                  onClick={() => toggleSort('nom')}
                  className="inline-flex items-center gap-1 hover:text-primary transition-colors"
                >
                  Produit <SortIcon field="nom" />
                </button>
              </th>
              <th className="hidden sm:table-cell">Catégorie</th>
              <th className="text-right hidden sm:table-cell">Prix vente</th>
              <th className="text-center">
                <button
                  type="button"
                  onClick={() => toggleSort('quantite')}
                  className="inline-flex items-center gap-1 hover:text-primary transition-colors"
                >
                  Stock <SortIcon field="quantite" />
                </button>
              </th>
              <th className="text-center hidden lg:table-cell">Seuil</th>
              <th>Statut</th>
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    <td className="hidden lg:table-cell"><div className="skeleton h-3 rounded w-full" /></td>
                    <td><div className="skeleton h-3 rounded w-full" /></td>
                    <td className="hidden sm:table-cell"><div className="skeleton h-3 rounded w-full" /></td>
                    <td className="hidden sm:table-cell"><div className="skeleton h-3 rounded w-full" /></td>
                    <td><div className="skeleton h-3 rounded w-full" /></td>
                    <td className="hidden lg:table-cell"><div className="skeleton h-3 rounded w-full" /></td>
                    <td><div className="skeleton h-3 rounded w-full" /></td>
                  </tr>
                ))
              : stocks.map(s => {
                  const statut = getStockStatut(s.quantite, s.seuilAlerte);
                  return (
                    <tr
                      key={`${s.produitId}-${s.siteId}`}
                      onClick={() => navigate(`/stocks/${s.produitId}`)}
                      className={cn(
                        'cursor-pointer',
                        statut === 'RUPTURE' && 'bg-red-50/70',
                        statut === 'ALERTE' && 'bg-amber-50/70',
                      )}
                    >
                      <td className="hidden lg:table-cell">
                        <span className="font-mono text-[11px] text-text-muted">{s.sku}</span>
                      </td>
                      <td className="font-medium text-[13px]">{s.produitNom}</td>
                      <td className="text-[12px] text-text-muted hidden sm:table-cell">{s.categorie}</td>
                      <td className="text-right font-mono text-[12px] hidden sm:table-cell">{formatUSD(s.prixVente)}</td>
                      <td className="text-center">
                        <span className={cn(
                          'font-black text-[18px] font-mono',
                          statut === 'RUPTURE' && 'text-danger',
                          statut === 'ALERTE' && 'text-warning',
                          statut === 'OK' && 'text-success',
                        )}>
                          {s.quantite}
                        </span>
                      </td>
                      <td className="text-center font-mono text-[12px] text-text-muted hidden lg:table-cell">
                        {s.seuilAlerte}
                      </td>
                      <td>
                        <StockStatusBadge statut={statut} size="sm" />
                      </td>
                    </tr>
                  );
                })
            }
          </tbody>
        </table>

        {!isLoading && stocks.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-text-muted">
            <Package size={32} className="opacity-30" />
            <p className="text-[13px] font-medium">
              {hasFilters ? 'Aucun résultat pour ces critères.' : 'Aucun produit en stock sur ce site.'}
            </p>
            {hasFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="text-[12px] text-primary-accent hover:underline"
              >
                Réinitialiser les filtres
              </button>
            )}
          </div>
        )}
      </div>

      {/* Pagination */}
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between flex-wrap gap-3">
          <p className="text-[12px] text-text-muted">
            Page {meta.page} / {meta.totalPages} — {meta.total} produits
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={meta.page <= 1 || isFetching}
              className="btn-secondary text-[12px] py-1.5 px-3"
            >
              Précédent
            </button>
            <button
              type="button"
              onClick={() => setPage(p => Math.min(meta.totalPages, p + 1))}
              disabled={meta.page >= meta.totalPages || isFetching}
              className="btn-secondary text-[12px] py-1.5 px-3"
            >
              Suivant
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
