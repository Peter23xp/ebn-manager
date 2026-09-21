import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PaginationProps {
  page: number;
  totalPages: number;
  total?: number;
  onPageChange: (page: number) => void;
  isLoading?: boolean;
}

export function Pagination({
  page,
  totalPages,
  total,
  onPageChange,
  isLoading = false,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  // Fenêtre glissante de 5 pages max
  const getPageNumbers = (): number[] => {
    if (totalPages <= 5) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const start = Math.max(1, Math.min(page - 2, totalPages - 4));
    return Array.from({ length: 5 }, (_, i) => start + i);
  };

  const pages = getPageNumbers();

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 py-3">
      {total !== undefined && (
        <p className="text-[12px] text-text-muted order-2 sm:order-1">
          Page <span className="font-semibold text-text">{page}</span> / {totalPages}
          <span className="hidden sm:inline"> · {total.toLocaleString('fr')} résultats</span>
        </p>
      )}

      <div className={cn('flex items-center gap-1 order-1 sm:order-2', !total && 'mx-auto')}>
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1 || isLoading}
          className={cn(
            'flex h-10 min-w-[44px] items-center justify-center rounded-lg border border-border text-text-muted',
            'hover:border-border-strong hover:text-text transition-colors duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-accent',
            'disabled:opacity-40 disabled:cursor-not-allowed',
          )}
          aria-label="Page précédente"
        >
          <ChevronLeft size={15} aria-hidden />
        </button>

        {pages[0] > 1 && (
          <>
            <button
              type="button"
              onClick={() => onPageChange(1)}
              disabled={isLoading}
              className={cn(
                'flex h-8 min-w-[32px] px-2 items-center justify-center rounded-lg border text-[12px] font-medium transition-colors duration-150',
                'border-border text-text-muted hover:border-border-strong hover:text-text',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-accent',
                'disabled:opacity-40 disabled:cursor-not-allowed',
              )}
            >
              1
            </button>
            {pages[0] > 2 && (
              <span className="text-text-muted text-sm px-1">…</span>
            )}
          </>
        )}

        {pages.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPageChange(p)}
            disabled={isLoading}
            className={cn(
              'flex h-10 min-w-[44px] px-2 items-center justify-center rounded-lg border text-[12px] font-medium transition-all duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-accent',
              'disabled:cursor-not-allowed',
              p === page
                ? 'border-primary-accent bg-primary-accent text-white shadow-sm'
                : 'border-border text-text-muted hover:border-border-strong hover:text-text disabled:opacity-40',
            )}
            aria-current={p === page ? 'page' : undefined}
          >
            {p}
          </button>
        ))}

        {pages[pages.length - 1] < totalPages && (
          <>
            {pages[pages.length - 1] < totalPages - 1 && (
              <span className="text-text-muted text-sm px-1">…</span>
            )}
            <button
              type="button"
              onClick={() => onPageChange(totalPages)}
              disabled={isLoading}
              className={cn(
                'flex h-8 min-w-[32px] px-2 items-center justify-center rounded-lg border text-[12px] font-medium transition-colors duration-150',
                'border-border text-text-muted hover:border-border-strong hover:text-text',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-accent',
                'disabled:opacity-40 disabled:cursor-not-allowed',
              )}
            >
              {totalPages}
            </button>
          </>
        )}

        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages || isLoading}
          className={cn(
            'flex h-10 min-w-[44px] items-center justify-center rounded-lg border border-border text-text-muted',
            'hover:border-border-strong hover:text-text transition-colors duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-accent',
            'disabled:opacity-40 disabled:cursor-not-allowed',
          )}
          aria-label="Page suivante"
        >
          <ChevronRight size={15} aria-hidden />
        </button>
      </div>
    </div>
  );
}
