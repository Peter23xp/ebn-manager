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

const NIVEAU_STYLE: Record<LegacyNiveau, { gradient: string; border: string }> = {
  BRONZE:  { gradient: 'from-amber-50 to-amber-100',   border: 'border-l-amber-500' },
  ARGENT:  { gradient: 'from-gray-50 to-gray-100',     border: 'border-l-gray-400'  },
  OR:      { gradient: 'from-yellow-50 to-yellow-100', border: 'border-l-yellow-500'},
  PLATINE: { gradient: 'from-purple-50 to-purple-100', border: 'border-l-violet-500'},
};

export function PointsCard({
  niveauFidelite,
  pointsActuels,
  remisePct,
  prochainNiveau,
  niveauxConfig,
}: PointsCardProps) {
  const { gradient, border } = NIVEAU_STYLE[niveauFidelite] ?? NIVEAU_STYLE.BRONZE;
  const isPlatine = niveauFidelite === 'PLATINE';

  // Progress percentage
  let pct = 100;
  if (!isPlatine && prochainNiveau) {
    const currentLevel = niveauxConfig
      .filter((n) => n.seuilPts <= pointsActuels)
      .sort((a, b) => b.seuilPts - a.seuilPts)[0];
    const base = currentLevel?.seuilPts ?? 0;
    const span = prochainNiveau.seuilPts - base;
    pct = span > 0 ? Math.min(100, Math.round(((pointsActuels - base) / span) * 100)) : 0;
  }

  const barColor: Record<LegacyNiveau, string> = {
    BRONZE:  'bg-amber-500',
    ARGENT:  'bg-gray-400',
    OR:      'bg-yellow-500',
    PLATINE: 'bg-violet-500',
  };

  return (
    <div
      className={cn(
        'bg-gradient-to-br rounded-xl p-5 shadow-md border-l-4',
        gradient,
        border,
      )}
      data-testid="points-card"
    >
      <p className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500 mb-2">
        Vos Points
      </p>

      <div className="flex items-center gap-3 mb-3">
        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-white/70 text-primary-accent border border-primary-accent/30">
          {niveauFidelite}
        </span>
        <span className="text-4xl font-bold text-[#1E3A5F]" aria-label={`${pointsActuels} points`}>
          {pointsActuels.toLocaleString('fr')}
          <span className="text-base font-medium text-neutral-500 ml-1">pts</span>
        </span>
      </div>

      {/* Progress bar */}
      <div className="mb-2">
        <div className="flex justify-between text-xs text-neutral-500 mb-1">
          <span>
            {isPlatine
              ? '🏆 Niveau maximum atteint !'
              : `Progression vers ${prochainNiveau?.nom ?? '—'}`}
          </span>
          {!isPlatine && <span>{pct}%</span>}
        </div>
        <div className="h-2.5 bg-white/60 rounded-full overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all', barColor[niveauFidelite])}
            style={{ width: `${pct}%` }}
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
        {!isPlatine && prochainNiveau && (
          <p className="text-xs text-neutral-500 mt-1">
            Il vous manque{' '}
            <span className="font-semibold">{prochainNiveau.pointsManquants.toLocaleString('fr')} pts</span>
            {' '}pour atteindre <span className="font-semibold">{prochainNiveau.nom}</span>
          </p>
        )}
        {niveauFidelite === 'BRONZE' && !isPlatine && (
          <p className="text-xs text-amber-700 mt-1 font-medium">
            Atteignez 500 pts pour débloquer votre première remise !
          </p>
        )}
      </div>

      {remisePct > 0 && (
        <p className="text-sm font-semibold text-green-700 mt-1">
          Remise applicable sur vos achats : {remisePct}%
        </p>
      )}
    </div>
  );
}
