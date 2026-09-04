import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Loader2, ReceiptText } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { PortalLayout } from '@/components/portal/PortalLayout';
import { portalApi } from '@/lib/portal.api';
import { usePortalPurchases, type PurchasePeriod } from '@/hooks/usePortalPurchases';
import { formatUSD, cn } from '@/lib/utils';

// ── Filtres de période ────────────────────────────────────────────────────────

const PERIODS: { value: PurchasePeriod; label: string }[] = [
  { value: 'month',   label: 'Ce mois'          },
  { value: '3months', label: '3 derniers mois'  },
  { value: 'all',     label: 'Tout'             },
];

function PeriodPills({ value, onChange }: {
  value: PurchasePeriod;
  onChange: (v: PurchasePeriod) => void;
}) {
  return (
    <div className="no-scrollbar flex gap-2 overflow-x-auto py-1">
      {PERIODS.map((p) => (
        <button
          key={p.value}
          type="button"
          onClick={() => onChange(p.value)}
          className={cn(
            'flex-shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors duration-150',
            value === p.value
              ? 'bg-[#1E3A5F] text-white'
              : 'bg-bg-inset text-text-muted hover:bg-border',
          )}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

// ── Carte stats ───────────────────────────────────────────────────────────────

function StatsCard({ totalDepense, nbAchats, totalPointsGagnes, period }: {
  totalDepense: number;
  nbAchats: number;
  totalPointsGagnes: number;
  period: PurchasePeriod;
}) {
  const label = period === 'month' ? 'ce mois' : period === '3months' ? 'ces 3 derniers mois' : 'au total';
  return (
    <div className="rounded-2xl border border-border bg-bg-card p-4 shadow-card">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-subtle">
        Total dépensé {label}
      </p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-primary">{formatUSD(totalDepense)}</p>
      <p className="mt-0.5 text-sm text-text-muted">
        {nbAchats} achat{nbAchats !== 1 ? 's' : ''}
        {totalPointsGagnes > 0 && ` · +${totalPointsGagnes.toLocaleString('fr')} pts gagnés`}
      </p>
    </div>
  );
}

// ── Carte achat ───────────────────────────────────────────────────────────────

function PurchaseCard({ achat, onTap }: {
  achat: {
    id: string; date: string; siteNom: string;
    produitPrincipal: string; nbArticles: number;
    montantTotal: number; pointsAttribues: number; remiseAppliquee: number;
  };
  onTap: (id: string) => void;
}) {
  const extra = achat.nbArticles - 1;
  const nom = achat.produitPrincipal.length > 25
    ? achat.produitPrincipal.slice(0, 25) + '…'
    : achat.produitPrincipal;

  return (
    <button
      type="button"
      onClick={() => onTap(achat.id)}
      className={cn(
        'flex w-full items-center gap-3 border-b border-border/70 bg-bg-card px-4 py-3.5 text-left transition-colors duration-150 last:border-b-0 hover:bg-blue-50/40 active:bg-blue-50',
      )}
    >
      <span className="w-11 flex-shrink-0 text-center">
        <span className="block text-sm font-bold leading-tight text-primary">
          {format(new Date(achat.date), 'd', { locale: fr })}
        </span>
        <span className="block text-[10px] uppercase tracking-wide text-text-subtle">
          {format(new Date(achat.date), 'MMM', { locale: fr })}
        </span>
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-text">
          {nom}
          {extra > 0 && <span className="ml-1 text-text-subtle">+{extra} article{extra !== 1 ? 's' : ''}</span>}
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 text-xs text-text-subtle">
          <span>{format(new Date(achat.date), "HH'h'mm", { locale: fr })}</span>
          <span aria-hidden>·</span>
          <span>{achat.siteNom}</span>
        </span>
        {achat.remiseAppliquee > 0 && (
          <span className="mt-0.5 block text-xs font-medium text-emerald-700">
            Remise appliquée : -{formatUSD(achat.remiseAppliquee)}
          </span>
        )}
      </span>

      <span className="flex-shrink-0 text-right">
        <span className="block text-sm font-bold tabular-nums text-primary">
          {formatUSD(achat.montantTotal)}
        </span>
        {achat.pointsAttribues > 0 && (
          <span className="block text-[11px] font-semibold text-emerald-600">
            +{achat.pointsAttribues} pts
          </span>
        )}
      </span>

      <ChevronRight size={15} className="flex-shrink-0 text-text-subtle" />
    </button>
  );
}

// ── Panneau de détail (bottom sheet) ──────────────────────────────────────────

function PurchaseDetailPanel({ venteId, onClose }: { venteId: string; onClose: () => void }) {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['portal', 'purchase-detail', venteId],
    queryFn: () => portalApi.getPurchaseDetail(venteId),
    staleTime: 5 * 60_000,
  });

  const v = data?.vente;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-[#0A1628]/50"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Détail de l'achat"
    >
      <div
        className="max-h-[80vh] w-full overflow-y-auto rounded-t-2xl bg-bg-card p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div aria-hidden className="mx-auto mb-4 h-1 w-10 rounded-full bg-border-strong" />

        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-bold text-primary">Détail de l'achat</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-semibold text-text-muted transition-colors hover:text-primary"
          >
            Fermer
          </button>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <div key={i} className="skeleton h-8 rounded" />)}
          </div>
        ) : v ? (
          <>
            <p className="font-mono text-xs text-text-subtle">{v.numeroVente ?? v.id.slice(0, 8)}</p>
            <p className="mb-4 text-xs text-text-muted">
              {format(new Date(v.date), "d MMMM yyyy 'à' HH:mm", { locale: fr })} · {v.siteNom}
            </p>

            <ul className="mb-4 divide-y divide-border/70 rounded-xl border border-border">
              {v.lignes.map((l, i) => (
                <li key={i} className="flex items-center justify-between px-3 py-2.5 text-sm first:rounded-t-xl last:rounded-b-xl">
                  <span className="text-text">{l.nom} ×{l.quantite}</span>
                  <span className="font-medium tabular-nums text-primary">{formatUSD(l.sousTotal)}</span>
                </li>
              ))}
            </ul>

            <div className="space-y-1 border-t border-border pt-3">
              <div className="flex justify-between text-sm">
                <span className="text-text-muted">Sous-total</span>
                <span className="tabular-nums">{formatUSD(v.montantBrut)}</span>
              </div>
              {v.remiseFidelite > 0 && (
                <div className="flex justify-between text-sm text-emerald-700">
                  <span>Remise fidélité</span>
                  <span className="tabular-nums">-{formatUSD(v.remiseFidelite)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-border pt-2 text-sm font-bold text-primary">
                <span>Total payé</span>
                <span className="tabular-nums">{formatUSD(v.montantNet)}</span>
              </div>
            </div>

            {v.pointsAttribues > 0 && (
              <p className="mt-3 text-sm font-semibold text-emerald-700">
                +{v.pointsAttribues} points attribués
                {v.soldePointsApres != null && ` · Solde : ${v.soldePointsApres.toLocaleString('fr')} pts`}
              </p>
            )}

            <button
              type="button"
              onClick={() => navigate(`/sales/${v.id}/receipt`)}
              className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border-strong text-sm font-semibold text-primary transition-colors duration-150 hover:bg-bg"
            >
              <ReceiptText size={15} /> Voir le reçu
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PortalAchatsPage() {
  const navigate = useNavigate();
  const { achatsByMonth, stats, period, setPeriod, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = usePortalPurchases();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const months = Object.keys(achatsByMonth);
  const hasAny = months.length > 0;

  return (
    <PortalLayout title="Mes achats" showBackButton onBack={() => navigate('/portal/home')}>
      <div className="px-4 py-4">

        <PeriodPills value={period} onChange={setPeriod} />

        {!isLoading && (
          <div className="mt-3">
            <StatsCard
              totalDepense={stats.totalDepense}
              nbAchats={stats.nbAchats}
              totalPointsGagnes={stats.totalPointsGagnes}
              period={period}
            />
          </div>
        )}

        {isLoading && (
          <div className="mt-3 space-y-3">
            {[1,2,3,4].map(i => (
              <div key={i} className="h-20 animate-pulse rounded-2xl bg-bg-inset" />
            ))}
          </div>
        )}

        {!isLoading && !hasAny && (
          <div className="mt-8 rounded-2xl border border-dashed border-border py-10 text-center">
            <p className="text-sm text-text-muted">
              {period === 'all'
                ? 'Aucun achat enregistré pour l\'instant.'
                : `Aucun achat ${period === 'month' ? 'ce mois' : 'ces 3 derniers mois'}.`}
            </p>
            {period !== 'all' && (
              <button
                type="button"
                onClick={() => setPeriod('all')}
                className="mt-2 text-sm font-semibold text-[#2E86C1] transition-colors hover:text-[#1E3A5F]"
              >
                Voir tous mes achats
              </button>
            )}
          </div>
        )}

        {months.map((month) => (
          <div key={month} className="mt-5">
            <p className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[0.14em] text-text-subtle">
              {month}
            </p>
            <div className="overflow-hidden rounded-2xl border border-border bg-bg-card shadow-card">
              {achatsByMonth[month].map((a) => (
                <PurchaseCard key={a.id} achat={a} onTap={setSelectedId} />
              ))}
            </div>
          </div>
        ))}

        {hasNextPage && (
          <button
            type="button"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border text-sm font-medium text-text-muted transition-colors duration-150 hover:bg-bg"
          >
            {isFetchingNextPage && <Loader2 size={14} className="animate-spin" />}
            Charger plus
          </button>
        )}
        {!hasNextPage && hasAny && (
          <p className="py-3 text-center text-xs text-text-subtle">Vous avez vu tous vos achats.</p>
        )}

      </div>

      {selectedId && (
        <PurchaseDetailPanel venteId={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </PortalLayout>
  );
}
