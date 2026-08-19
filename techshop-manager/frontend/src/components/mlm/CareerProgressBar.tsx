import React from 'react';
import { MLM_LEVELS_REF } from '@/types';
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';

interface CareerProgressBarProps {
  currentLevel: number;
  className?: string;
}

export const CareerProgressBar: React.FC<CareerProgressBarProps> = ({ currentLevel, className }) => {
  return (
    <div className={cn('w-full py-4', className)}>
      <div className="relative flex justify-between">
        {/* Ligne de fond */}
        <div className="absolute top-1/2 left-0 right-0 h-1 bg-bg-inset -translate-y-1/2 rounded-full" />

        {/* Ligne de progression */}
        <div
          className="absolute top-1/2 left-0 h-1 bg-primary-accent -translate-y-1/2 rounded-full transition-all duration-500 ease-out-quart"
          style={{ width: `${((currentLevel - 1) / (MLM_LEVELS_REF.length - 1)) * 100}%` }}
        />

        {MLM_LEVELS_REF.map((level, idx) => {
          const isCompleted = level.ordre < currentLevel;
          const isCurrent = level.ordre === currentLevel;
          const isUpcoming = level.ordre > currentLevel;

          return (
            <div key={level.ordre} className="relative flex flex-col items-center">
              <div
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center z-10 transition-colors duration-300',
                  isCompleted ? 'bg-primary-accent text-white' :
                  isCurrent ? 'bg-white border-2 border-primary-accent text-primary-accent ring-4 ring-primary-light' :
                  'bg-white border-2 border-border-strong text-text-subtle'
                )}
              >
                {isCompleted ? <Check size={16} strokeWidth={3} /> : <span className="text-sm font-bold">{level.ordre}</span>}
              </div>

              <div className="absolute top-10 flex flex-col items-center w-24 text-center">
                <span className={cn(
                  'text-xs font-semibold whitespace-nowrap transition-colors duration-300',
                  isCurrent ? 'text-primary-accent' :
                  isCompleted ? 'text-text' : 'text-text-muted'
                )}>
                  {level.nom}
                </span>
                {level.salaireActif && isCurrent && (
                  <span className="text-[10px] text-warning font-medium px-1.5 py-0.5 bg-amber-100 rounded-full mt-1">
                    Salaire actif
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};