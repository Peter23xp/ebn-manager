import { useQuery } from '@tanstack/react-query';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { differenceInDays } from 'date-fns';
import {
  ArrowLeft,
  Printer,
  RotateCcw,
  Receipt,
  Banknote,
  Smartphone,
  CreditCard,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import toast from 'react-hot-toast';
import { api, getErrorMessage } from '@/lib/api';
import { cn, formatUSD, formatDateTime } from '@/lib/utils';
import { SaleStatusBadge } from '@/components/sales/SaleStatusBadge';
import type { StatutVente, ModePaiement } from '@/types';

// ── Types locaux étendus ──────────────────────────────────────────────────────

interface LigneVenteDetail {
  id: string;
  produit: { id: string; sku: string; nom: string; categorie: string };
  quantite: number;
  prixUnitaire: number;
  sousTotal: number;
  quantiteRetournee: number;
  retournee: boolean;
}

interface VenteDetail {
  id: string;
  numeroVente: string;
  createdAt: string;
  statut: StatutVente;
  agent: { id: string; nom: string; prenom?: string };
  site: { id: string; nom: string; ville?: string };
  client?: {
    id: string;
    nom: string;
    prenom: string;
    telephone: string;
  };
  lignes: LigneVenteDetail[];
  montantBrut: number;
  montantNet: number;
  modePaiement: ModePaiement;
  referenceTransaction?: string;
  montantRecu?: number;
  monnaieRendue?: number;
}

// ── Constantes ────────────────────────────────────────────────────────────────

const PAYMENT_ICONS: Record<ModePaiement, LucideIcon> = {
  CASH: Banknote,
  MPESA: Smartphone,
  AIRTEL_MONEY: Smartphone,
  VIREMENT: CreditCard,
};

const PAYMENT_LABELS: Record<ModePaiement, string> = {
  CASH: 'Espèces',
  MPESA: 'M-Pesa',
  AIRTEL_MONEY: 'Airtel Money',
  VIREMENT: 'Virement bancaire',
};



// ── Skeleton ──────────────────────────────────────────────────────────────────

function VenteDetailSkeleton() {
  return (
    <div className="max-w-4xl mx-auto space-y-5 px-4 py-6 animate-pulse">
      <div className="h-8 w-48 bg-slate-200 rounded-lg" />
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl shadow-card p-5 h-48">
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-4 bg-slate-200 rounded w-full" />
            ))}
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-card p-5 h-48">
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-4 bg-slate-200 rounded w-full" />
            ))}
          </div>
        </div>
      </div>
      <div className="bg-white rounded-xl shadow-card p-5 h-32">
        <div className="space-y-3">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-4 bg-slate-200 rounded w-full" />
          ))}
        </div>
      </div>
      <div className="bg-white rounded-xl shadow-card p-5 h-64">
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-4 bg-slate-200 rounded w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────

export default function VenteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: vente, isLoading } = useQuery<VenteDetail>({
    queryKey: ['vente', id],
    queryFn: () =>
      api.get(`/ventes/${id}`).then((r) => r.data),
  });

  const canRetour = vente
    ? differenceInDays(new Date(), new Date(vente.createdAt)) <= 7 &&
      vente.statut === 'VALIDE'
    : false;

  if (isLoading) return <VenteDetailSkeleton />;

  if (!vente) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-text-muted">
        <Receipt size={48} className="opacity-30" strokeWidth={1.5} />
        <p className="text-lg font-semibold text-text">Vente introuvable</p>
        <button
          onClick={() => navigate('/sales')}
          className="btn-secondary flex items-center gap-2"
        >
          <ArrowLeft size={16} />
          Retour à l'historique
        </button>
      </div>
    );
  }

  const PayIcon = PAYMENT_ICONS[vente.modePaiement];
  const isMobileMoney =
    vente.modePaiement === 'MPESA' || vente.modePaiement === 'AIRTEL_MONEY';

  return (
    <div className="max-w-4xl mx-auto space-y-5 px-4 py-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/sales')}
            className="btn-secondary p-2"
            aria-label="Retour à l'historique"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <p className="text-sm text-text-muted">← Historique</p>
            <h1 className="text-xl font-bold text-text font-mono leading-tight">
              {vente.numeroVente}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(`/sales/${id}/receipt`)}
            className="btn-secondary flex items-center gap-2"
          >
            <Printer size={16} />
            Imprimer
          </button>
          {canRetour && (
            <button
              onClick={() => navigate(`/sales/returns?venteId=${id}`)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border-2 border-danger text-danger font-semibold text-sm transition-colors hover:bg-red-50"
            >
              <RotateCcw size={16} />
              ↩ Initier un retour
            </button>
          )}
        </div>
      </div>

      {/* Bannière statut dégradé */}
      {vente.statut === 'RETOURNEE_PARTIELLE' && (
        <div className="flex items-center gap-3 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-warning text-sm font-medium">
          <RotateCcw size={16} />
          Cette vente a fait l'objet d'un retour partiel. Certains articles ont été retournés.
        </div>
      )}
      {(vente.statut === 'RETOURNEE' || vente.statut === 'ANNULEE') && (
        <div className="flex items-center gap-3 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-danger text-sm font-medium">
          <RotateCcw size={16} />
          {vente.statut === 'RETOURNEE'
            ? 'Cette vente a été intégralement retournée.'
            : 'Cette vente a été annulée.'}
        </div>
      )}

      {/* Grille infos générales + paiement */}
      <div className="grid lg:grid-cols-2 gap-4">
        {/* Card infos générales */}
        <div className="bg-white rounded-xl shadow-card p-5 space-y-3">
          <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide">
            Informations générales
          </h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-text-muted">N° vente</span>
              <span className="font-mono font-semibold text-text">
                {vente.numeroVente}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Date</span>
              <span className="text-text">{formatDateTime(vente.createdAt)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Agent</span>
              <span className="text-text">
                {vente.agent.prenom
                  ? `${vente.agent.prenom} ${vente.agent.nom}`
                  : vente.agent.nom}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Site</span>
              <span className="text-text">
                {vente.site.nom}
                {vente.site.ville ? ` — ${vente.site.ville}` : ''}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-text-muted">Statut</span>
              <SaleStatusBadge statut={vente.statut} />
            </div>
          </div>
        </div>

        {/* Card paiement */}
        <div className="bg-white rounded-xl shadow-card p-5 space-y-3">
          <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide">
            Paiement
          </h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-text-muted">Mode</span>
              <span className="flex items-center gap-1.5 font-medium text-text">
                <PayIcon size={15} className="text-primary-accent" />
                {PAYMENT_LABELS[vente.modePaiement]}
              </span>
            </div>
            {isMobileMoney && vente.referenceTransaction && (
              <div className="flex justify-between">
                <span className="text-text-muted">Référence</span>
                <span className="font-mono text-text text-xs">
                  {vente.referenceTransaction}
                </span>
              </div>
            )}
            {vente.modePaiement === 'CASH' && vente.montantRecu != null && (
              <div className="flex justify-between">
                <span className="text-text-muted">Montant reçu</span>
                <span className="text-text">{formatUSD(vente.montantRecu)}</span>
              </div>
            )}
            {vente.modePaiement === 'CASH' &&
              vente.monnaieRendue != null &&
              vente.monnaieRendue > 0 && (
                <div className="flex justify-between">
                  <span className="text-text-muted">Monnaie rendue</span>
                  <span className="text-text-accent font-semibold">
                    {formatUSD(vente.monnaieRendue)}
                  </span>
                </div>
              )}
          </div>
        </div>
      </div>

      {/* Card client */}
      {vente.client && (
        <div className="bg-white rounded-xl shadow-card p-5 space-y-3">
          <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide">
            Client
          </h2>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              <Link
                to={`/clients/${vente.client.id}`}
                className="font-semibold text-primary-accent hover:underline"
              >
                {vente.client.prenom} {vente.client.nom}
              </Link>
              <p className="text-sm text-text-muted">{vente.client.telephone}</p>
            </div>

          </div>
        </div>
      )}

      {/* Card articles */}
      <div className="bg-white rounded-xl shadow-card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wide">
          Articles
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="pb-3 font-semibold text-text-muted text-xs uppercase tracking-wide">
                  SKU
                </th>
                <th className="pb-3 font-semibold text-text-muted text-xs uppercase tracking-wide">
                  Produit
                </th>
                <th className="pb-3 font-semibold text-text-muted text-xs uppercase tracking-wide text-center">
                  Qté
                </th>
                <th className="pb-3 font-semibold text-text-muted text-xs uppercase tracking-wide text-right">
                  P.U.
                </th>
                <th className="pb-3 font-semibold text-text-muted text-xs uppercase tracking-wide text-right">
                  Sous-total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {vente.lignes.map((ligne) => (
                <tr
                  key={ligne.id}
                  className={cn(
                    'transition-colors',
                    ligne.retournee && 'opacity-50',
                  )}
                >
                  <td
                    className={cn(
                      'py-3 font-mono text-xs text-text-muted',
                      ligne.retournee && 'line-through',
                    )}
                  >
                    {ligne.produit.sku}
                  </td>
                  <td className="py-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={cn(
                          'font-medium text-text',
                          ligne.retournee && 'line-through',
                        )}
                      >
                        {ligne.produit.nom}
                      </span>
                      {ligne.retournee && (
                        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-orange-100 text-orange-700">
                          ↩ Retourné
                        </span>
                      )}
                    </div>
                  </td>
                  <td
                    className={cn(
                      'py-3 text-center text-text',
                      ligne.retournee && 'line-through',
                    )}
                  >
                    {ligne.quantite}
                  </td>
                  <td
                    className={cn(
                      'py-3 text-right text-text-muted',
                      ligne.retournee && 'line-through',
                    )}
                  >
                    {formatUSD(ligne.prixUnitaire)}
                  </td>
                  <td
                    className={cn(
                      'py-3 text-right font-semibold text-text',
                      ligne.retournee && 'line-through',
                    )}
                  >
                    {formatUSD(ligne.sousTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pied du tableau */}
        <div className="border-t border-border pt-4 space-y-2 text-sm">
          <div className="flex justify-between text-text-muted">
            <span>Sous-total</span>
            <span>{formatUSD(vente.montantBrut)}</span>
          </div>

          <div className="flex justify-between items-center font-bold text-lg text-text border-t border-border pt-2">
            <span>Total</span>
            <span>{formatUSD(vente.montantNet)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
