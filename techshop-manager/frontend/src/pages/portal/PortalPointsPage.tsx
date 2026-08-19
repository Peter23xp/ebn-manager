import { useNavigate } from 'react-router-dom';
import { Loader2, Lock, Check, ShoppingBag, Users } from 'lucide-react';
import { PortalLayout } from '@/components/portal/PortalLayout';
import { usePortalPoints, type PointsFilter } from '@/hooks/usePortalPoints';
import { cn } from '@/lib/utils';
import type { NiveauConfig } from '@/lib/portal.api';

type LegacyNiveau = 'BRONZE' | 'ARGENT' | 'OR' | 'PLATINE';

// ── Niveaux guide ─────────────────────────────────────────────────────────────

const NIVEAU_ORDER: LegacyNiveau[] = ['BRONZE', 'ARGENT', 'OR', 'PLATINE'];
const NIVEAU_GRADIENT: Record<LegacyNiveau, string> = {
  BRONZE:  'from-amber-50 to-amber-100',
  ARGENT:  'from-gray-50 to-gray-100',
  OR:      'from-yellow-50 to-yellow-100',
  PLATINE: 'from-purple-50 to-purple-100',
};
const NIVEAU_BORDER: Record<LegacyNiveau, string> = {
  BRONZE:  'border-amber-300',
  ARGENT:  'border-gray-300',
  OR:      'border-yellow-400',
  PLATINE: 'border-violet-400',
};

function NiveauxGuide({ niveauxConfig, niveauActuel }: {
  niveauxConfig: NiveauConfig[];
  niveauActuel: LegacyNiveau;
}) {
  const currentIdx = NIVEAU_ORDER.indexOf(niveauActuel);

  return (
    <div className="grid grid-cols-2 gap-3">
      {NIVEAU_ORDER.map((n, i) => {
        const cfg = niveauxConfig.find((c) => c.nom.toUpperCase() === n);
        const isActuel = n === niveauActuel;
        const isPast = i < currentIdx;
        const isFuture = i > currentIdx;

        return (
          <div
            key={n}
            className={cn(
              'bg-gradient-to-br rounded-xl p-3 border relative',
              NIVEAU_GRADIENT[n],
              isActuel ? `border-2 ${NIVEAU_BORDER[n]} shadow-md` : 'border-neutral-200',
              isFuture && 'opacity-70',
            )}
          >
            {(isActuel || isPast) && (
              <span className="absolute top-2 right-2 text-green-600">
                <Check size={14} />
              </span>
            )}
            {isFuture && (
              <span className="absolute top-2 right-2 text-neutral-400">
                <Lock size={12} />
              </span>
            )}
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/70 text-primary-accent border border-primary-accent/30">{n}</span>
            {cfg && (
              <>
                <p className="text-[11px] text-neutral-500 mt-1.5">
                  {cfg.seuilPts > 0
                    ? (i === NIVEAU_ORDER.length - 1 ? `${cfg.seuilPts.toLocaleString('fr')}+ pts` : `${cfg.seuilPts.toLocaleString('fr')} pts`)
                    : '0–499 pts'}
                </p>
                <p className="text-[11px] font-semibold text-neutral-700">
                  Remise : {Number(cfg.remisePct)}%
                </p>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── How to earn ───────────────────────────────────────────────────────────────

function HowToEarn({ ratioPtsCDF }: { ratioPtsCDF: number }) {
  return (
    <div className="bg-neutral-50 border border-neutral-100 rounded-xl p-4 space-y-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
        Comment gagner des points ?
      </p>
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
          <ShoppingBag size={15} className="text-green-600" />
        </div>
        <div>
          <p className="text-sm font-medium text-neutral-800">Achetez des produits</p>
          <p className="text-xs text-neutral-500">
            1 point pour chaque ${ratioPtsCDF.toLocaleString('en-US')} dépensés
          </p>
        </div>
      </div>
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
          <Users size={15} className="text-blue-600" />
        </div>
        <div>
          <p className="text-sm font-medium text-neutral-800">Parrainez un ami</p>
          <p className="text-xs text-neutral-500">
            Des points bonus quand votre filleul est activé
          </p>
        </div>
      </div>
      <p className="text-[11px] text-neutral-400 italic">
        Les points sont attribués automatiquement lors de chaque achat en magasin.
      </p>
    </div>
  );
}

// ── Movement row ──────────────────────────────────────────────────────────────

const MOUVEMENT_ICONS: Record<string, { bg: string; color: string; icon: typeof ShoppingBag }> = {
  ACHAT:       { bg: 'bg-green-100', color: 'text-green-600', icon: ShoppingBag },
  PARRAINAGE:  { bg: 'bg-blue-100',  color: 'text-blue-600',  icon: Users       },
};

import { RotateCcw, Clock, Settings2 } from 'lucide-react';
const EXTRA_ICONS: Record<string, { bg: string; color: string; icon: typeof RotateCcw }> = {
  RETOUR:      { bg: 'bg-red-100',    color: 'text-red-600',    icon: RotateCcw  },
  EXPIRATION:  { bg: 'bg-orange-100', color: 'text-orange-600', icon: Clock      },
  AJUSTEMENT:  { bg: 'bg-gray-100',   color: 'text-gray-600',   icon: Settings2  },
};

import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

function MouvementRow({ m }: { m: { type: string; delta: number; soldeApres: number; description?: string; createdAt: string } }) {
  const typeKey = m.type.toUpperCase();
  const style = MOUVEMENT_ICONS[typeKey] ?? EXTRA_ICONS[typeKey] ?? { bg: 'bg-gray-100', color: 'text-gray-600', icon: Settings2 };
  const Icon = style.icon;
  const isPositive = m.delta > 0;
  const desc = (m.description ?? typeKey.toLowerCase()).slice(0, 30);

  return (
    <div className="flex items-center gap-3 py-3 border-b border-neutral-100 last:border-0">
      <div className={cn('w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0', style.bg)}>
        <Icon size={15} className={style.color} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-neutral-800 truncate">{desc}</p>
        <p className="text-xs text-neutral-400">
          {format(new Date(m.createdAt), "d MMM · HH'h'mm", { locale: fr })}
        </p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className={cn('text-base font-bold', isPositive ? 'text-green-600' : 'text-red-600')}>
          {isPositive ? '+' : ''}{m.delta.toLocaleString('fr')} pts
        </p>
        <p className="text-xs text-neutral-400">{m.soldeApres.toLocaleString('fr')} pts</p>
      </div>
    </div>
  );
}

// ── Filter pills ──────────────────────────────────────────────────────────────

const FILTERS: { value: PointsFilter; label: string }[] = [
  { value: 'all',        label: 'Tous'         },
  { value: 'gains',      label: 'Gains'        },
  { value: 'deductions', label: 'Déductions'   },
];

// ── Progress bar ──────────────────────────────────────────────────────────────

function ProgressBar({ pts, prochainNiveau, niveauxConfig, niveau }: {
  pts: number;
  prochainNiveau: { nom: string; seuilPts: number; pointsManquants: number } | null;
  niveauxConfig: NiveauConfig[];
  niveau: LegacyNiveau;
}) {
  const isPlatine = niveau === 'PLATINE';
  let pct = 100;
  if (!isPlatine && prochainNiveau) {
    const base = niveauxConfig.filter(n => n.seuilPts <= pts).sort((a,b) => b.seuilPts - a.seuilPts)[0]?.seuilPts ?? 0;
    const span = prochainNiveau.seuilPts - base;
    pct = span > 0 ? Math.min(100, Math.round(((pts - base) / span) * 100)) : 0;
  }
  const barColor: Record<LegacyNiveau, string> = {
    BRONZE:'bg-amber-500', ARGENT:'bg-gray-400', OR:'bg-yellow-500', PLATINE:'bg-violet-500',
  };
  return (
    <div>
      <div className="flex justify-between text-xs text-neutral-500 mb-1">
        <span>{isPlatine ? '🏆 Vous avez atteint le niveau maximum !' : `Vers ${prochainNiveau?.nom}`}</span>
        {!isPlatine && <span>{pct}%</span>}
      </div>
      <div className="h-3 bg-neutral-200 rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full', barColor[niveau])} style={{ width: `${pct}%` }}
          role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} />
      </div>
      {!isPlatine && prochainNiveau && (
        <p className="text-xs text-neutral-500 mt-1">
          Il vous manque <strong>{prochainNiveau.pointsManquants.toLocaleString('fr')} pts</strong>{' '}
          pour <strong>{prochainNiveau.nom}</strong>
        </p>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PortalPointsPage() {
  const navigate = useNavigate();
  const {
    niveauFidelite, pointsActuels, remisePct, niveauxConfig, prochainNiveau,
    mouvements, typeFilter, setTypeFilter,
    isLoading, fetchNextPage, hasNextPage, isFetchingNextPage,
  } = usePortalPoints();

  const niveau = (niveauFidelite ?? 'BRONZE') as LegacyNiveau;
  const pts = pointsActuels ?? 0;

  return (
    <PortalLayout title="Mes points" showBackButton onBack={() => navigate('/portal/home')}>
      <div className="px-4 py-4 space-y-5">

        {/* Solde card */}
        {isLoading ? (
          <div className="h-32 rounded-xl animate-pulse bg-neutral-200" />
        ) : (
          <div className={cn('bg-gradient-to-br rounded-xl p-4 border-l-4',
            NIVEAU_GRADIENT[niveau], NIVEAU_BORDER[niveau],
          )}>
            <div className="flex items-center gap-3 mb-3">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-white/70 text-primary-accent border border-primary-accent/30">{niveau}</span>
              <span className="text-3xl font-bold text-[#1E3A5F]">
                {pts.toLocaleString('fr')}
                <span className="text-sm font-medium text-neutral-500 ml-1">pts</span>
              </span>
            </div>
            <ProgressBar pts={pts} prochainNiveau={prochainNiveau} niveauxConfig={niveauxConfig} niveau={niveau} />
            {(remisePct ?? 0) > 0 && (
              <p className="text-sm font-semibold text-green-700 mt-2">
                Remise applicable : {remisePct}%
              </p>
            )}
          </div>
        )}

        {/* Niveaux guide */}
        {niveauxConfig.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-2">
              Les niveaux
            </p>
            <NiveauxGuide niveauxConfig={niveauxConfig} niveauActuel={niveau} />
          </div>
        )}

        <HowToEarn ratioPtsCDF={1000} />

        {/* Historique */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-2">
            Historique de vos points
          </p>
          <div className="flex gap-2 mb-3">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setTypeFilter(f.value)}
                className={cn(
                  'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                  typeFilter === f.value
                    ? 'bg-[#1E3A5F] text-white'
                    : 'bg-neutral-100 text-neutral-600',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          {isLoading && (
            <div className="space-y-3">
              {[1,2,3,4].map(i => <div key={i} className="h-12 rounded animate-pulse bg-neutral-200" />)}
            </div>
          )}

          {!isLoading && mouvements.length === 0 && (
            <p className="text-sm text-neutral-500 py-4 text-center">
              {typeFilter === 'deductions'
                ? 'Aucune déduction de points pour l\'instant.'
                : 'Vous n\'avez pas encore de points. Faites votre premier achat !'}
            </p>
          )}

          {mouvements.map((m) => <MouvementRow key={m.id} m={m} />)}

          {hasNextPage && (
            <button
              type="button"
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              className="w-full mt-3 h-10 rounded-xl border border-neutral-200 text-sm text-neutral-600 flex items-center justify-center gap-2"
            >
              {isFetchingNextPage && <Loader2 size={14} className="animate-spin" />}
              Charger plus…
            </button>
          )}
          {!hasNextPage && mouvements.length > 0 && (
            <p className="text-center text-xs text-neutral-400 py-2">Historique complet affiché.</p>
          )}
        </div>

      </div>
    </PortalLayout>
  );
}
