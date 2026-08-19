import React from 'react';
import { CheckCircle2, Circle, Clock, User } from 'lucide-react';
import { cn, formatDate } from '@/lib/utils';
import type { Matrix, Position } from '@/types';

interface MatrixGridProps {
  matrix?: Matrix | null;
  isLoading?: boolean;
}

export function MatrixGrid({ matrix, isLoading }: MatrixGridProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((n) => (
          <div key={n} className="h-36 rounded-xl skeleton" />
        ))}
      </div>
    );
  }

  const positions: Position[] = matrix?.positions ?? [1, 2, 3, 4].map((n) => ({
    id: `placeholder-${n}`,
    matrixId: matrix?.id ?? '',
    numeroPosition: n,
    filleulId: undefined,
    estValide: false,
  }));

  // Ensure 4 positions sorted
  const sortedPositions = [...positions].sort((a, b) => a.numeroPosition - b.numeroPosition);
  while (sortedPositions.length < 4) {
    const nextNum = sortedPositions.length + 1;
    sortedPositions.push({
      id: `placeholder-${nextNum}`,
      matrixId: matrix?.id ?? '',
      numeroPosition: nextNum,
      filleulId: undefined,
      estValide: false,
    });
  }

  return (
    <div className="space-y-4">
      {/* Matrix status banner */}
      <div className="flex items-center justify-between rounded-xl px-4 py-3 border border-border bg-bg">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-text">Remplissage de la matrice :</span>
          <span className="font-mono font-bold text-primary-accent">
            {matrix?.filleulsValides ?? 0} / 4 positions
          </span>
        </div>
        {matrix?.estComplete ? (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-success">
            <CheckCircle2 size={14} />
            Complète
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-warning">
            <Clock size={14} />
            En cours
          </span>
        )}
      </div>

      {/* 4-position cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {sortedPositions.map((pos) => {
          const isFilled = pos.estValide;

          return (
            <div
              key={pos.id}
              className={cn(
                'rounded-xl border p-4 flex flex-col items-center justify-center text-center transition-colors duration-150 min-h-[140px]',
                isFilled
                  ? 'border-success/40 bg-green-50'
                  : 'border-dashed border-border-strong bg-white',
              )}
            >
              {/* Position index badge */}
              <span
                className={cn(
                  'w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center mb-2',
                  isFilled ? 'bg-success text-white' : 'bg-bg-inset text-text-muted',
                )}
              >
                {pos.numeroPosition}
              </span>

              {isFilled ? (
                <>
                  <div className="w-10 h-10 rounded-full bg-green-200 text-success flex items-center justify-center font-bold text-sm mb-1.5">
                    <User size={20} />
                  </div>
                  <p className="text-xs font-bold text-text">Position validée</p>
                  {pos.dateValidation && (
                    <p className="text-[10px] text-text-muted mt-0.5 font-mono">
                      {formatDate(pos.dateValidation)}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <Circle size={28} className="text-border-strong stroke-1 mb-1.5" />
                  <p className="text-xs font-medium text-text-muted">Position libre</p>
                  <p className="text-[10px] text-text-subtle mt-0.5">En attente de filleul</p>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}