import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Trophy, TrendingUp, Award, Star, Shield, Zap, Crown, Gem } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useMlmConfig } from '@/hooks/useMlm';
import { formatUSD } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { MLM_LEVELS_REF } from '@/types';

// Level icons map (lucide, matching MLM_LEVELS_REF.icone)
const LEVEL_ICONS: Record<string, LucideIcon> = {
  star: Star,
  award: Award,
  shield: Shield,
  zap: Zap,
  crown: Crown,
  gem: Gem,
  'trending-up': TrendingUp,
};

export default function MlmLevelsPage() {
  const navigate = useNavigate();
  const { data: levels, isLoading } = useMlmConfig();
  const displayedLevels = levels?.length ? levels : MLM_LEVELS_REF;
  const totalGains = displayedLevels.reduce((sum: number, level: any) => sum + Number(level.commissionTotale ?? 0), 0);

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/mlm')}
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-white text-text-muted hover:border-primary-accent hover:text-primary-accent transition-colors duration-150"
          aria-label="Retour"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-page-title text-primary">Plan de carrière</h1>
          <p className="text-xs text-text-muted mt-0.5">
            Les 8 niveaux du parcours EBN Network — Builder → Crown Ambassadeur
          </p>
        </div>
      </div>

      {/* Crown Ambassadeur banner */}
      <div className="rounded-xl border border-border bg-bg-card shadow-card p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-amber-100 text-warning">
            <Trophy size={22} />
          </div>
          <div>
            <h2 className="text-section-title text-primary">Crown Ambassadeur — le sommet</h2>
            <p className="text-sm text-text-muted max-w-2xl mt-1">
              Atteignez le niveau ultime après avoir complété 8 matrices de 4 filleuls chacune.
              Gain total annoncé sur les 8 étapes : <strong className="font-semibold text-text">{formatUSD(totalGains)}</strong>.
              Votre parrain personnel reçoit également un bonus retraite de 50 000 $.
            </p>
          </div>
        </div>
      </div>

      {/* Levels grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-64 rounded-xl skeleton" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {displayedLevels.map((level: any) => (
            <LevelCard key={level.id} level={level} />
          ))}
        </div>
      )}

      {/* Legend */}
      <div className="rounded-xl border border-border bg-bg-card shadow-card p-5">
        <h3 className="text-section-title text-primary mb-4">Comment progresser ?</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm text-text-muted">
          <div className="flex items-start gap-3">
            <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary-light text-primary-accent">
              <span className="text-xs font-bold">1</span>
            </div>
            <p>Recrutez <strong className="font-semibold text-text">4 filleuls directs</strong> pour compléter votre matrice au niveau actuel.</p>
          </div>
          <div className="flex items-start gap-3">
            <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-green-100 text-success">
              <span className="text-xs font-bold">2</span>
            </div>
            <p>Une fois les 4 positions remplies, vous êtes <strong className="font-semibold text-text">promu au niveau suivant</strong> et une commission est générée.</p>
          </div>
          <div className="flex items-start gap-3">
            <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-amber-100 text-warning">
              <span className="text-xs font-bold">3</span>
            </div>
            <p>La commission est <strong className="font-semibold text-text">validée par l'administration</strong> avant d'être créditée à votre portefeuille.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Level Card ────────────────────────────────────────────────────────────────

function LevelCard({ level }: { level: any }) {
  const Icon = LEVEL_ICONS[level.icone] ?? Award;
  const levelColor = level.couleur ?? '#64748b';

  return (
    <div className="flex flex-col rounded-xl border border-border bg-bg-card shadow-card p-5 hover:shadow-card-hover transition-shadow duration-150">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ backgroundColor: `${levelColor}1a`, color: levelColor }}
        >
          <Icon size={20} />
        </div>
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-text-muted">
          Niveau {level.ordre}
        </span>
      </div>

      <h3 className="text-base font-bold text-text leading-snug">{level.nom}</h3>
      <p className="text-xs text-text-muted mt-0.5">4 personnes requises</p>

      {/* Details */}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-border bg-bg p-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-text-muted">Com. / personne</p>
          <p className="text-lg font-black text-text font-mono mt-0.5">
            {formatUSD(level.commissionParFilleul)}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-bg p-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-text-muted">Total annoncé</p>
          <p className="text-lg font-black text-success font-mono mt-0.5">
            {formatUSD(level.commissionTotale)}
          </p>
        </div>
      </div>

      {/* Bonus */}
      <div className="mt-3 rounded-lg border border-border bg-bg-card px-3 py-2.5">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-text-muted mb-1">
          Bonus physique
        </p>
        <p className="text-xs text-text font-medium leading-snug">
          {level.bonusDescription}
        </p>
      </div>

      {/* Salary if applicable */}
      {level.salaireActif && Number(level.salaireMensuel) > 0 && (
        <div className="mt-3 flex items-center gap-1.5 text-xs font-bold text-platine bg-violet-50 rounded-lg px-3 py-2">
          <TrendingUp size={13} />
          Salaire mensuel : {formatUSD(level.salaireMensuel)} / mois
        </div>
      )}

      {/* Members count */}
      <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
        <span className="text-xs text-text-muted">Membres actifs</span>
        <span className="text-sm font-bold text-text">
          {level.count ?? level.membresActifs ?? 0}
        </span>
      </div>
    </div>
  );
}
