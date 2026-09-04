import { cn } from '@/lib/utils';
import type { NiveauConfig } from '@/lib/portal.api';

type LegacyNiveau = 'BRONZE' | 'ARGENT' | 'OR' | 'PLATINE';

interface PointsCardProps {
  niveauFidelite: LegacyNiveau;
  pointsActuels: number;
  remisePct: number;
  prochainNiveau: { nom: string; seuilPts: number; pointsManquants: number } | null;
  niveauxConfig: NiveauConfig[];
}

const NIVEAU_LABEL: Record<LegacyNiveau, string> = {
  BRONZE: 'Bronze',
  ARGENT: 'Argent',
  OR: 'Or',
  PLATINE: 'Platine',
};

const NIVEAU_CHIP: Record<LegacyNiveau, string> = {
  BRONZE:  'bg-amber-100 text-amber-800',
  ARGENT:  'bg-slate-200 text-slate-600',
  OR:      'bg-yellow-100 text-yellow-700',
  PLATINE: 'bg-violet-100 text-[#4A148C]',
};

const NIVEAU_BAR: Record<LegacyNiveau, string> = {
  BRONZE:  'bg-amber-500',
  ARGENT:  'bg-slate-400',
  OR:      'bg-yellow-500',
  PLATINE: 'bg-violet-500',
};

export function PointsCard({
  niveauFidelite,
  pointsActuels,
  remisePct,
  prochainNiveau,
  niveauxConfig,
}: PointsCardProps) {
  const isPlatine = niveauFidelite === 'PLATINE';

  // Pourcentage de progression vers le palier suivant
  let pct = 100;
  if (!isPlatine && prochainNiveau) {
    const currentLevel = niveauxConfig
      .filter((n) => n.seuilPts <= pointsActuels)
      .sort((a, b) => b.seuilPts - a.seuilPts)[0];
    const base = currentLevel?.seuilPts ?? 0;
    const span = prochainNiveau.seuilPts - base;
    pct = span > 0 ? Math.min(100, Math.round(((pointsActuels - base) / span) * 100)) : 0;
  }

  return (
    <div
      className="rounded-2xl border border-border bg-bg-card p-4 shadow-card"
      data-testid="points-card"
    >
      <div className="flex items-center justify-between">
        <span
          className={cn(
            'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide',
            NIVEAU_CHIP[niveauFidelite] ?? NIVEAU_CHIP.BRONZE,
          )}
        >
          {NIVEAU_LABEL[niveauFidelite] ?? niveauFidelite}
        </span>
        {remisePct > 0 && (
          <span className="text-xs font-semibold text-emerald-700">
            Remise applicable : {remisePct}%
          </span>
        )}
      </div>

      <p className="mt-2.5 text-[32px] font-bold leading-none tabular-nums text-primary" aria-label={`${pointsActuels} points`}>
        {pointsActuels.toLocaleString('fr')}
        <span className="ml-1.5 text-sm font-medium text-text-subtle">pts</span>
      </p>

      {/* Progression vers le palier suivant */}
      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="text-text-muted">
            {isPlatine
              ? 'Niveau maximum atteint'
              : prochainNiveau
                ? `Vers ${prochainNiveau.nom}`
                : 'Progression'}
          </span>
          {!isPlatine && prochainNiveau && (
            <span className="font-semibold tabular-nums text-primary">
              {prochainNiveau.pointsManquants.toLocaleString('fr')} pts
            </span>
          )}
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-bg-inset">
          <div
            className={cn('h-full rounded-full transition-all duration-500 ease-out-quart', NIVEAU_BAR[niveauFidelite] ?? NIVEAU_BAR.BRONZE)}
            style={{ width: `${pct}%` }}
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
        {!isPlatine && prochainNiveau && (
          <p className="mt-1.5 text-xs text-text-subtle">
            Encore <span className="font-semibold text-text">{prochainNiveau.pointsManquants.toLocaleString('fr')} pts</span> pour atteindre{' '}
            <span className="font-semibold text-text">{prochainNiveau.nom}</span>
          </p>
        )}
        {niveauFidelite === 'BRONZE' && !isPlatine && (
          <p className="mt-1.5 text-xs font-medium text-amber-700">
            Atteignez 500 pts pour débloquer votre première remise.
          </p>
        )}
      </div>
    </div>
  );
}
