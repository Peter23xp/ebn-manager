import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import { api } from '@/lib/api';
import { formatUSD } from '@/lib/utils';
import { Produit } from '@/types';

interface Props {
  siteId: string;
  onSelect: (produit: Produit) => void;
  selected: Produit | null;
  onClear: () => void;
}

export function ProduitSearchInput({ siteId, onSelect, selected, onClear }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  const { data, isFetching, isError } = useQuery<Produit[]>({
    queryKey: ['produits-search', query, siteId],
    queryFn: async () => {
      const res = await api.get('/produits/search', {
        params: { q: query, siteId, limit: 10 },
      });
      return (res.data.produits ?? res.data) as Produit[];
    },
    enabled: !!siteId && query.length >= 1 && open,
    staleTime: 30_000,
  });

  if (selected) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2.5">
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-bold text-primary truncate">{selected.nom}</p>
          <p className="text-[11px] text-text-muted">{selected.sku}</p>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full hover:bg-red-100 text-text-muted hover:text-danger transition-colors"
          aria-label="Retirer le produit sélectionné"
        >
          <X size={13} aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 focus-within:border-primary-accent focus-within:ring-1 focus-within:ring-primary-accent/20">
        <Search size={14} className="text-text-muted flex-shrink-0" aria-hidden />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
          placeholder="Rechercher un produit (nom ou SKU)…"
          className="flex-1 bg-transparent text-[13px] text-text placeholder:text-text-muted outline-none"
          aria-label="Rechercher un produit"
          aria-autocomplete="list"
          aria-expanded={open}
        />
        {isFetching && (
          <span className="text-[11px] text-text-muted italic">Recherche…</span>
        )}
      </div>

      {open && data && data.length > 0 && (
        <ul
          role="listbox"
          className="absolute z-20 mt-1 w-full rounded-lg border border-border bg-white shadow-lg overflow-hidden max-h-52 overflow-y-auto"
        >
          {data.map((produit) => (
            <li
              key={produit.id}
              role="option"
              onClick={() => {
                onSelect(produit);
                setOpen(false);
                setQuery('');
              }}
              className="flex items-center justify-between px-3 py-2.5 cursor-pointer hover:bg-slate-50 border-b border-border last:border-0"
            >
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-text truncate">{produit.nom}</p>
                <p className="text-[11px] text-text-muted">{produit.sku}</p>
              </div>
              <span className="text-[12px] font-mono font-bold text-primary flex-shrink-0 ml-4">
                {formatUSD(produit.prixVente)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {open && query.length >= 1 && !isFetching && data?.length === 0 && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-border bg-white shadow-lg px-3 py-3 text-[12px] text-text-muted text-center">
          Aucun produit trouvé pour « {query} »
        </div>
      )}

      {open && query.length >= 1 && isError && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-red-200 bg-red-50 shadow-lg px-3 py-3 text-[12px] text-danger text-center">
          Erreur lors de la recherche. Vérifiez votre connexion.
        </div>
      )}
    </div>
  );
}
