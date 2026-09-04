import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, Check, Share2, Loader2, Gift, UserPlus, BadgeCheck, List, Network } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { PortalLayout } from '@/components/portal/PortalLayout';
import { ReferralTree } from '@/components/portal/ReferralTree';
import { usePortalReferrals, type ReferralFilter } from '@/hooks/usePortalReferrals';
import { usePortalReferralTree } from '@/hooks/usePortalReferralTree';
import { cn } from '@/lib/utils';


// ── Carte de partage du code ──────────────────────────────────────────────────

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
      className="relative overflow-hidden rounded-2xl text-white"
      style={{ background: 'linear-gradient(150deg, #0A1628 0%, #14304f 60%, #1E3A5F 100%)' }}
    >
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(115deg, transparent 0 9px, #ffffff 9px 10px)',
        }}
      />
      <div
        aria-hidden
        className="absolute -bottom-16 -left-10 w-44 h-44 rounded-full border border-white/10"
      />

      <div className="relative p-5">
        <div className="flex items-center gap-2">
          <Share2 size={14} className="text-[#e8a33d]" />
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/60">
            Votre matricule membre
          </p>
        </div>

        <p
          className="mt-3 text-center font-mono text-[28px] font-bold tracking-[0.1em]"
          data-testid="code-parrain"
        >
          {codeParrain}
        </p>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={handleCopy}
            aria-label="Copier le code parrain"
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-white/10 text-sm font-semibold text-white backdrop-blur transition-colors duration-150 hover:bg-white/20"
          >
            {copied ? <><Check size={15} /> Copié !</> : <><Copy size={15} /> Copier</>}
          </button>
          <button
            type="button"
            onClick={handleShare}
            aria-label="Partager le code parrain"
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-white/10 text-sm font-semibold text-white backdrop-blur transition-colors duration-150 hover:bg-white/20"
          >
            <Share2 size={15} /> Partager
          </button>
        </div>

        <p className="mt-3 text-center text-xs text-white/50">
          Donnez ce matricule à vos contacts lors de leur inscription chez EBN Network.
        </p>
      </div>

      {/* Dialogue de repli (Web Share indisponible) */}
      {showDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0A1628]/60"
          onClick={() => setShowDialog(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Partager votre matricule"
        >
          <div
            className="mx-4 w-full max-w-sm rounded-2xl bg-bg-card p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-3 font-bold text-primary">Partager votre matricule</p>
            <p className="mb-4 rounded-xl bg-bg p-3 text-sm text-text-muted">
              Inscris-toi chez EBN Network avec mon matricule : <strong className="text-primary">{codeParrain}</strong>
            </p>
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(`Inscris-toi chez EBN Network avec mon matricule : ${codeParrain}`);
                setShowDialog(false);
              }}
              className="h-11 w-full rounded-xl bg-[#1E3A5F] text-sm font-semibold text-white transition-colors hover:bg-[#13294b]"
            >
              Copier le message
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Cartes stats ──────────────────────────────────────────────────────────────

function ReferralStatsCards({ nbActifs, nbTotal, gainsTotaux, typeRecompense }: {
  nbActifs: number;
  nbTotal: number;
  gainsTotaux: number;
  typeRecompense?: string;
}) {
  const gainsLabel = typeRecompense === 'COMMISSION_CDF'
    ? `${gainsTotaux.toLocaleString('fr')} CDF`
    : `${gainsTotaux.toLocaleString('fr')} pts`;

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="rounded-2xl border border-border bg-bg-card p-4 shadow-card">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-subtle">Filleuls actifs</p>
        <p className="mt-1 text-3xl font-bold tabular-nums text-primary">{nbActifs}</p>
        <p className="mt-0.5 text-xs text-text-subtle">{nbTotal} inscrits au total</p>
      </div>
      <div className="rounded-2xl border border-border bg-bg-card p-4 shadow-card">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-subtle">Gains totaux</p>
        <p className="mt-1 text-3xl font-bold tabular-nums text-primary">{gainsLabel}</p>
        <p className="mt-0.5 text-xs text-text-subtle">depuis votre inscription</p>
      </div>
    </div>
  );
}

// ── Comment ça marche ─────────────────────────────────────────────────────────

function HowReferralWorks({ recompenseValeur, typeRecompense }: {
  recompenseValeur?: number;
  typeRecompense?: string;
}) {
  const recompense = typeRecompense === 'COMMISSION_CDF'
    ? `${recompenseValeur?.toLocaleString('fr') ?? ''} CDF`
    : `${recompenseValeur?.toLocaleString('fr') ?? ''} pts`;

  const steps = [
    { icon: Share2, title: 'Donnez votre code', desc: 'Partagez votre matricule avec vos futurs partenaires.' },
    { icon: UserPlus, title: 'Votre ami s\'inscrit', desc: 'Il utilise votre matricule lors de son inscription au réseau EBN.' },
    { icon: Gift, title: 'Vous recevez votre récompense', desc: `Dès que son compte est actif, vous recevez ${recompense}.` },
  ];

  return (
    <div className="rounded-2xl border border-border bg-bg p-4">
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-text-subtle">
        Comment ça marche ?
      </p>
      <ol className="space-y-3">
        {steps.map((s, i) => (
          <li key={i} className="flex items-start gap-3">
            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-bg-card text-primary shadow-card">
              <s.icon size={14} />
            </span>
            <div>
              <p className="text-sm font-semibold text-text">
                <span className="mr-1.5 text-text-subtle">{i + 1}.</span>{s.title}
              </p>
              <p className="text-xs text-text-muted">{s.desc}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ── Carte filleul ─────────────────────────────────────────────────────────────

function FilleulCard({ filleul }: {
  filleul: {
    id: string; prenom: string; nom: string;
    statut: 'ACTIF' | 'EN_COURS' | 'SUSPENDU';
    dateInscription: string; etapeEnCours?: string;
    generation?: number;
    recompenseGeneree?: number;
  };
}) {
  const initials = `${filleul.prenom[0] ?? ''}${filleul.nom[0] ?? ''}`.toUpperCase();

  const badge = filleul.statut === 'ACTIF'
    ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">Actif ●</span>
    : filleul.statut === 'SUSPENDU'
    ? <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600">Suspendu ✗</span>
    : <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">En cours ○</span>;

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span
        className={cn(
          'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold',
          filleul.statut === 'ACTIF' ? 'bg-emerald-50 text-emerald-700'
            : filleul.statut === 'SUSPENDU' ? 'bg-red-50 text-red-600'
            : 'bg-amber-50 text-amber-700',
        )}
        aria-hidden
      >
        {initials}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-medium text-text">
            {filleul.prenom} {filleul.nom}
          </p>
          {badge}
        </div>
        <p className="text-xs text-text-subtle">
          Inscrit le {format(new Date(filleul.dateInscription), 'd MMM yyyy', { locale: fr })}
          {filleul.generation ? ` · Génération ${filleul.generation}` : ''}
          {filleul.recompenseGeneree != null && filleul.recompenseGeneree > 0 && (
            <> · <span className="font-semibold text-emerald-600">+{filleul.recompenseGeneree} pts</span></>
          )}
        </p>
        {filleul.statut === 'EN_COURS' && filleul.etapeEnCours && (
          <p className="mt-0.5 text-xs italic text-amber-700">{filleul.etapeEnCours}</p>
        )}
        {filleul.statut === 'SUSPENDU' && (
          <p className="mt-0.5 text-xs text-red-500">Compte suspendu</p>
        )}
      </div>
    </li>
  );
}

// ── Filtres ───────────────────────────────────────────────────────────────────

const FILTERS: { value: ReferralFilter; label: string }[] = [
  { value: 'actifs',     label: 'Actifs'      },
  { value: 'en_attente', label: 'En attente'  },
  { value: 'tous',       label: 'Tous'        },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PortalFilleulsPage() {
  const navigate = useNavigate();
  const [view, setView] = useState<'liste' | 'arbre'>('liste');
  const {
    codeParrain, stats, typeRecompense, recompenseValeur,
    filleuls, filter, setFilter,
    isLoading, fetchNextPage, hasNextPage, isFetchingNextPage,
  } = usePortalReferrals();
  const tree = usePortalReferralTree(view === 'arbre');

  return (
    <PortalLayout title="Mes filleuls" showBackButton onBack={() => navigate('/portal/home')}>
      <div className="px-4 py-4 space-y-5">

        {/* Code de partage */}
        {isLoading ? (
          <div className="skeleton h-44 rounded-2xl" />
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

        {/* Comment ça marche */}
        {!isLoading && (
          <HowReferralWorks recompenseValeur={recompenseValeur} typeRecompense={typeRecompense} />
        )}

        {/* Section filleuls : vue Liste ou vue Arbre */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-text-subtle">
              Mes filleuls {stats ? `(${stats.nbFilleulsActifs} actifs)` : ''}
            </p>
            <div className="flex gap-1 rounded-xl bg-bg-inset p-1" role="group" aria-label="Type d'affichage">
              <button
                type="button"
                onClick={() => setView('liste')}
                aria-pressed={view === 'liste'}
                className={cn(
                  'flex h-7 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold transition-all duration-150',
                  view === 'liste' ? 'bg-bg-card text-primary shadow-sm' : 'text-text-muted hover:text-text',
                )}
              >
                <List size={13} /> Liste
              </button>
              <button
                type="button"
                onClick={() => setView('arbre')}
                aria-pressed={view === 'arbre'}
                className={cn(
                  'flex h-7 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold transition-all duration-150',
                  view === 'arbre' ? 'bg-bg-card text-primary shadow-sm' : 'text-text-muted hover:text-text',
                )}
              >
                <Network size={13} /> Arbre
              </button>
            </div>
          </div>

          {view === 'arbre' ? (
            <ReferralTree
              nodes={tree.filleuls}
              total={tree.total}
              isLoading={tree.isLoading}
              codeParrain={codeParrain}
            />
          ) : (
            <>
          <div className="mb-3 flex gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setFilter(f.value)}
                className={cn(
                  'rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors duration-150',
                  filter === f.value ? 'bg-[#1E3A5F] text-white' : 'bg-bg-inset text-text-muted hover:bg-border',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          {filter === 'en_attente' && filleuls.length > 0 && (
            <p className="mb-3 rounded-xl border border-amber-100 bg-amber-50 p-3 text-xs text-amber-800">
              Ces amis ont commencé leur inscription mais ne l'ont pas encore terminée.
              Encouragez-les à finaliser leur formation !
            </p>
          )}

          {isLoading && (
            <div className="space-y-3">
              {[1,2,3].map(i => <div key={i} className="h-16 animate-pulse rounded-2xl bg-bg-inset" />)}
              <div className="h-40 animate-pulse rounded-2xl bg-bg-inset" />
            </div>
          )}

          {!isLoading && filleuls.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border py-8 text-center">
              {filter === 'en_attente' ? (
                <>
                  <BadgeCheck size={22} className="mx-auto mb-2 text-emerald-600" />
                  <p className="text-sm text-text-muted">Tous vos amis inscrits ont bien finalisé leur inscription !</p>
                </>
              ) : (
                <>
                  <p className="mb-1.5 text-sm text-text-muted">Vous n'avez pas encore de filleuls.</p>
                  {codeParrain && (
                    <p className="text-sm font-semibold text-[#2E86C1]">
                      Partagez votre code {codeParrain} pour commencer !
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {!isLoading && filleuls.length > 0 && (
            <ul className="divide-y divide-border/70 overflow-hidden rounded-2xl border border-border bg-bg-card shadow-card">
              {filleuls.map((f) => (
                <FilleulCard key={f.id} filleul={f} />
              ))}
            </ul>
          )}

          {hasNextPage && (
            <button
              type="button"
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border text-sm font-medium text-text-muted transition-colors duration-150 hover:bg-bg"
            >
              {isFetchingNextPage && <Loader2 size={14} className="animate-spin" />}
              Charger plus
            </button>
          )}
          {!hasNextPage && filleuls.length > 0 && (
            <p className="py-2.5 text-center text-xs text-text-subtle">Vous avez vu tous vos filleuls.</p>
          )}
            </>
          )}
        </div>

      </div>
    </PortalLayout>
  );
}
