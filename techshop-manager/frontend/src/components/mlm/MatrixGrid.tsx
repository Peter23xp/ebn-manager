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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 animate-pulse">
        {[1, 2, 3, 4].map((n) => (
          <div key={n} className="h-36 rounded-xl bg-gray-100 border border-gray-200" />
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
      <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3 border border-gray-200">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-700">Remplissage de la matrice :</span>
          <span className="font-mono font-bold text-blue-600">
            {matrix?.filleulsValides ?? 0} / 4 positions
          </span>
        </div>
        {matrix?.estComplete ? (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700">
            <CheckCircle2 size={14} />
            Complète
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
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
                'rounded-xl border-2 p-4 flex flex-col items-center justify-center text-center transition-all min-h-[140px]',
                isFilled
                  ? 'border-green-300 bg-green-50/60 shadow-sm'
                  : 'border-dashed border-gray-300 bg-gray-50/50',
              )}
            >
              {/* Position index badge */}
              <span
                className={cn(
                  'w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center mb-2',
                  isFilled ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-600',
                )}
              >
                {pos.numeroPosition}
              </span>

              {isFilled ? (
                <>
                  <div className="w-10 h-10 rounded-full bg-green-200 text-green-800 flex items-center justify-center font-bold text-sm mb-1.5">
                    <User size={20} />
                  </div>
                  <p className="text-xs font-bold text-gray-900">Position validée</p>
                  {pos.dateValidation && (
                    <p className="text-[10px] text-gray-500 mt-0.5 font-mono">
                      {formatDate(pos.dateValidation)}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <Circle size={28} className="text-gray-300 stroke-1 mb-1.5" />
                  <p className="text-xs font-medium text-gray-400">Position libre</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">En attente de filleul</p>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
