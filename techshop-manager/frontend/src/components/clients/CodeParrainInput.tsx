import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, XCircle, Loader2, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';

interface ParrainResult {
  id: string;
  nom: string;
  codeParrain: string;
  telephone: string;
}

interface CodeParrainInputProps {
  /** La valeur stockée dans le formulaire = codeParrain interne (ex: TSG-0042) */
  value: string;
  onChange: (value: string) => void;
  currentClientPhone?: string;
  disabled?: boolean;
  error?: string;
}

export function CodeParrainInput({
  value,
  onChange,
  currentClientPhone,
  disabled,
  error,
}: CodeParrainInputProps) {
  // Texte tapé par l'utilisateur (matricule ou nom)
  const [query, setQuery] = useState('');
  // Résultats de la suggestion
  const [results, setResults] = useState<ParrainResult[]>([]);
  // Parrain sélectionné (confirmé)
  const [selected, setSelected] = useState<ParrainResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [selfError, setSelfError] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fermer la liste si clic en dehors
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Lancer la recherche avec debounce de 350ms
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!query || query.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }

    setLoading(true);
    timerRef.current = setTimeout(async () => {
      try {
        const res = await api.get<{ results: ParrainResult[] }>(
          `/clients/search-parrain?q=${encodeURIComponent(query.trim())}`,
        );
        setResults(res.data.results ?? []);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 350);

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [query]);

  const handleSelect = (parrain: ParrainResult) => {
    // Anti auto-parrainage
    if (currentClientPhone && parrain.telephone === currentClientPhone) {
      setSelfError(true);
      setOpen(false);
      return;
    }
    setSelfError(false);
    setSelected(parrain);
    setQuery('');
    setOpen(false);
    setResults([]);
    onChange(parrain.codeParrain);
  };

  const handleClear = () => {
    setSelected(null);
    setQuery('');
    setSelfError(false);
    onChange('');
  };

  const hasError = !!error || selfError;

  return (
    <div ref={containerRef} className="relative">
      {/* Chip parrain sélectionné */}
      {selected ? (
        <div
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-lg border text-[13px]',
            'border-success bg-success/5',
          )}
        >
          <CheckCircle2 size={15} className="text-success flex-shrink-0" />
          <span className="font-semibold text-success">{selected.codeParrain}</span>
          <span className="text-text-muted">—</span>
          <span className="text-text truncate">{selected.nom}</span>
          {!disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="ml-auto text-text-muted hover:text-danger transition-colors"
              aria-label="Effacer le parrain"
            >
              <X size={14} />
            </button>
          )}
        </div>
      ) : (
        /* Champ de recherche */
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
          />
          <input
            type="text"
            placeholder="Matricule ou nom du parrain…"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelfError(false); }}
            onFocus={() => { if (results.length > 0) setOpen(true); }}
            disabled={disabled}
            className={cn(
              'w-full pl-8 pr-9 py-2.5 rounded-lg border border-border text-[13px] text-text bg-white',
              'focus:outline-none focus:ring-2 focus:ring-primary-accent/30 focus:border-primary-accent',
              'disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-bg',
              'transition-colors',
              hasError && 'border-danger focus:ring-danger/30 focus:border-danger',
            )}
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2" aria-hidden>
            {loading && <Loader2 size={14} className="text-text-muted animate-spin" />}
            {!loading && hasError && <XCircle size={14} className="text-danger" />}
          </span>
        </div>
      )}

      {/* Dropdown résultats */}
      {open && results.length > 0 && !selected && (
        <ul className="absolute z-50 mt-1 w-full bg-white border border-border rounded-lg shadow-lg overflow-hidden">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); handleSelect(r); }}
                className="w-full text-left px-3 py-2.5 text-[13px] hover:bg-primary-accent/10 transition-colors flex items-center gap-2"
              >
                <span className="font-mono font-semibold text-primary">{r.codeParrain}</span>
                <span className="text-text-muted">—</span>
                <span className="text-text">{r.nom}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Aucun résultat */}
      {open && !loading && query.trim().length >= 2 && results.length === 0 && (
        <p className="mt-1 text-[11px] text-text-muted">Aucun parrain actif trouvé.</p>
      )}

      {/* Auto-parrainage */}
      {selfError && (
        <p className="mt-1 text-[11px] text-danger">Auto-parrainage interdit.</p>
      )}

      {/* Erreur Zod */}
      {error && !selfError && (
        <p className="mt-1 text-[11px] text-danger">{error}</p>
      )}
    </div>
  );
}
