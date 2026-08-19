import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, Check, Share2, Loader2, Gift, UserPlus } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { PortalLayout } from '@/components/portal/PortalLayout';
import { usePortalReferrals, type ReferralFilter } from '@/hooks/usePortalReferrals';
import { cn } from '@/lib/utils';


// ── Share code card ───────────────────────────────────────────────────────────

function ShareCodeCard({ codeParrain }: { codeParrain: string }) {
  const [copied, setCopied] = useState(false);
  const [showDialog, setShowDialog] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(codeParrain);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }, [codeParrain]);

  const handleShare = useCallback(async () => {
    const text = `Inscris-toi chez EBN Network avec mon matricule : ${codeParrain}`;
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'EBN Network — Matricule Parrain', text });
      } catch { /* cancelled */ }
    } else {
      setShowDialog(true);
    }
  }, [codeParrain]);

  return (
    <div
      className="rounded-2xl p-6 text-white shadow-lg"
      style={{ background: 'linear-gradient(135deg, #1E3A5F 0%, #2E86C1 100%)' }}
    >
      <p className="text-[10px] font-semibold uppercase tracking-widest text-white/70 mb-2">
        Votre matricule membre
      </p>
      <p className="text-4xl font-mono font-bold text-center my-3" data-testid="code-parrain">
        {codeParrain}
      </p>

      <div className="flex gap-2 mt-4">
        <button
          type="button"
          onClick={handleCopy}
          aria-label="Copier le matricule"
          className="flex-1 h-11 rounded-xl bg-white/20 hover:bg-white/30 text-white font-semibold text-sm flex items-center justify-center gap-2"
        >
          {copied ? <><Check size={15} /> Copié !</> : <><Copy size={15} /> Copier</>}
        </button>
        <button
          type="button"
          onClick={handleShare}
          aria-label="Partager le matricule"
          className="flex-1 h-11 rounded-xl bg-white/20 hover:bg-white/30 text-white font-semibold text-sm flex items-center justify-center gap-2"
        >
          <Share2 size={15} /> Partager
        </button>
      </div>

      <p className="text-xs text-white/60 text-center mt-3">
        Donnez ce matricule à vos contacts lors de leur inscription chez EBN Network.
      </p>

      {/* Share fallback dialog */}
      {showDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setShowDialog(false)}
        >
          <div
            className="bg-white rounded-2xl p-6 mx-4 max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-bold text-[#1E3A5F] mb-3">Partager votre matricule</p>
            <p className="text-sm text-neutral-600 bg-neutral-50 rounded-xl p-3 mb-4">
              Inscris-toi chez EBN Network avec mon matricule : <strong>{codeParrain}</strong>
            </p>
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(`Inscris-toi chez EBN Network avec mon matricule : ${codeParrain}`);
                setShowDialog(false);
              }}
              className="w-full h-11 rounded-xl bg-[#1E3A5F] text-white font-semibold text-sm"
            >
              Copier le message
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Stats cards ───────────────────────────────────────────────────────────────

function ReferralStatsCards({ nbActifs, nbTotal, gainsTotaux, typeRecompense }: {
  nbActifs: number;
  nbTotal: number;
  gainsTotaux: number;
  typeRecompense?: string;
}) {
  const gainsLabel = typeRecompense === 'COMMISSION_CDF'
    ? `$${gainsTotaux.toLocaleString('en-US')}`
    : `${gainsTotaux.toLocaleString('fr')} pts`;

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="rounded-xl p-4 bg-white border border-blue-100 shadow-sm">
        <p className="text-[10px] uppercase tracking-wider text-neutral-400 mb-1">Filleuls actifs</p>
        <p className="text-3xl font-bold text-[#1E3A5F]">{nbActifs}</p>
        <p className="text-xs text-neutral-400">{nbTotal} inscrits au total</p>
      </div>
      <div className="rounded-xl p-4 bg-white border border-blue-100 shadow-sm">
        <p className="text-[10px] uppercase tracking-wider text-neutral-400 mb-1">Gains totaux</p>
        <p className="text-3xl font-bold text-[#1E3A5F]">{gainsLabel}</p>
        <p className="text-xs text-neutral-400">depuis votre inscription</p>
      </div>
    </div>
  );
}

// ── How it works ──────────────────────────────────────────────────────────────

function HowReferralWorks({ recompenseValeur, typeRecompense }: {
  recompenseValeur: number;
  typeRecompense?: string;
}) {
  const rewardText = typeRecompense === 'COMMISSION_CDF'
    ? `vous gagnez $${recompenseValeur.toLocaleString('en-US')} !`
    : `vous gagnez ${recompenseValeur.toLocaleString('fr')} pts !`;

  const steps = [
    { icon: Share2, color: 'bg-blue-100 text-blue-600', title: 'Donnez votre code', desc: 'Partagez votre code TSG avec vos amis.' },
    { icon: UserPlus, color: 'bg-green-100 text-green-600', title: 'Votre ami s\'inscrit', desc: 'Il utilise votre code lors de son inscription et suit la formation EBN Network.' },
    { icon: Gift, color: 'bg-yellow-100 text-yellow-700', title: 'Vous recevez votre récompense', desc: `Dès que son compte est activé, ${rewardText}` },
  ];

  return (
    <div className="bg-neutral-50 border border-neutral-100 rounded-xl p-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-3">
        Comment ça marche ?
      </p>
      <div className="space-y-3">
        {steps.map((s, i) => (
          <div key={i} className="flex items-start gap-3">
            <div className={cn('w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0', s.color)}>
              <s.icon size={15} />
            </div>
            <div>
              <p className="text-sm font-medium text-neutral-800">{s.title}</p>
              <p className="text-xs text-neutral-500">{s.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Filleul card ──────────────────────────────────────────────────────────────

function FilleulCard({ filleul, typeRecompense }: {
  filleul: {
    id: string; prenom: string; nom: string;
    statut: 'ACTIF' | 'EN_COURS' | 'SUSPENDU';
    dateInscription: string; recompenseGeneree: number; etapeEnCours?: string;
  };
  typeRecompense?: string;
}) {
  const initials = `${filleul.prenom[0] ?? ''}${filleul.nom[0] ?? ''}`.toUpperCase();
  const avatarColor = filleul.statut === 'ACTIF' ? 'bg-green-100 text-green-700'
    : filleul.statut === 'SUSPENDU' ? 'bg-red-100 text-red-600'
    : 'bg-orange-100 text-orange-600';

  const badge = filleul.statut === 'ACTIF'
    ? <span className="text-[11px] font-semibold text-green-600 bg-green-50 rounded-full px-2 py-0.5">Actif ●</span>
    : filleul.statut === 'SUSPENDU'
    ? <span className="text-[11px] font-semibold text-red-600 bg-red-50 rounded-full px-2 py-0.5">Suspendu ✗</span>
    : <span className="text-[11px] font-semibold text-orange-500 bg-orange-50 rounded-full px-2 py-0.5">En cours ○</span>;

  return (
    <div className="bg-white border border-neutral-100 rounded-xl p-4 mb-3 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={cn('w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0', avatarColor)}>
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-neutral-800 truncate">
              {filleul.prenom} {filleul.nom}
            </p>
            {badge}
          </div>
          <p className="text-xs text-neutral-400">
            Inscrit le {format(new Date(filleul.dateInscription), 'd MMM yyyy', { locale: fr })}
          </p>
          {filleul.statut === 'ACTIF' && filleul.recompenseGeneree > 0 && (
            <p className="text-xs text-green-600 font-medium">
              Vous a rapporté : +{typeRecompense === 'COMMISSION_CDF' ? '$' : ''}{filleul.recompenseGeneree.toLocaleString('en-US')}{' '}
              {typeRecompense === 'COMMISSION_CDF' ? '' : 'pts'}
            </p>
          )}
          {filleul.statut === 'EN_COURS' && filleul.etapeEnCours && (
            <p className="text-xs text-orange-500 italic">{filleul.etapeEnCours}</p>
          )}
          {filleul.statut === 'SUSPENDU' && (
            <p className="text-xs text-red-500">Compte suspendu</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Filter pills ──────────────────────────────────────────────────────────────

const FILTERS: { value: ReferralFilter; label: string }[] = [
  { value: 'actifs',     label: 'Actifs'      },
  { value: 'en_attente', label: 'En attente'  },
  { value: 'tous',       label: 'Tous'        },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PortalFilleulsPage() {
  const navigate = useNavigate();
  const {
    codeParrain, stats, typeRecompense, recompenseValeur,
    filleuls, filter, setFilter,
    isLoading, fetchNextPage, hasNextPage, isFetchingNextPage,
  } = usePortalReferrals();

  return (
    <PortalLayout title="Mes filleuls" showBackButton onBack={() => navigate('/portal/home')}>
      <div className="px-4 py-4 space-y-5">

        {/* Share code */}
        {isLoading ? (
          <div className="h-44 rounded-2xl animate-pulse bg-neutral-200" />
        ) : codeParrain ? (
          <ShareCodeCard codeParrain={codeParrain} />
        ) : null}

        {/* Stats */}
        {!isLoading && stats && (
          <ReferralStatsCards
            nbActifs={stats.nbFilleulsActifs}
            nbTotal={stats.nbFilleulsTotal}
            gainsTotaux={stats.gainsTotaux}
            typeRecompense={typeRecompense}
          />
        )}

        {/* How it works */}
        {!isLoading && (
          <HowReferralWorks
            recompenseValeur={recompenseValeur ?? 0}
            typeRecompense={typeRecompense}
          />
        )}

        {/* Filleuls list */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-2">
            Mes filleuls {stats ? `(${stats.nbFilleulsActifs} actifs)` : ''}
          </p>

          {/* Filter pills */}
          <div className="flex gap-2 mb-3">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setFilter(f.value)}
                className={cn(
                  'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                  filter === f.value ? 'bg-[#1E3A5F] text-white' : 'bg-neutral-100 text-neutral-600',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          {filter === 'en_attente' && filleuls.length > 0 && (
            <p className="text-xs text-orange-600 bg-orange-50 rounded-xl p-3 mb-3">
              Ces amis ont commencé leur inscription mais ne l'ont pas encore terminée. Encouragez-les à finaliser leur formation !
            </p>
          )}

          {isLoading && (
            <div className="space-y-3">
              {[1,2,3,4].map(i => <div key={i} className="h-20 rounded-xl animate-pulse bg-neutral-200" />)}
            </div>
          )}

          {!isLoading && filleuls.length === 0 && (
            <div className="py-8 text-center">
              {filter === 'en_attente' ? (
                <p className="text-sm text-neutral-500">Tous vos amis inscrits ont bien finalisé leur inscription ! 🎉</p>
              ) : (
                <>
                  <p className="text-sm text-neutral-500 mb-2">Vous n'avez pas encore de filleuls.</p>
                  {codeParrain && (
                    <p className="text-sm font-semibold text-[#2E86C1]">
                      Partagez votre code {codeParrain} pour commencer !
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {filleuls.map((f) => (
            <FilleulCard key={f.id} filleul={f} typeRecompense={typeRecompense} />
          ))}

          {hasNextPage && (
            <button
              type="button"
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              className="w-full h-10 rounded-xl border border-neutral-200 text-sm text-neutral-600 flex items-center justify-center gap-2"
            >
              {isFetchingNextPage && <Loader2 size={14} className="animate-spin" />}
              Charger plus…
            </button>
          )}
          {!hasNextPage && filleuls.length > 0 && (
            <p className="text-center text-xs text-neutral-400 py-2">Vous avez vu tous vos filleuls.</p>
          )}
        </div>

      </div>
    </PortalLayout>
  );
}
