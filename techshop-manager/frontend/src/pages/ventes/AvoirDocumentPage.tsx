import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Printer, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';
import { formatUSD, formatDateTime } from '@/lib/utils';

interface LigneAvoir {
  produit: { id: string; nom: string; sku: string; categorie: string };
  quantite: number;
  prixUnitaire: number;
  sousTotal: number;
}

interface AvoirDocument {
  id: string;
  numeroAvoir: string;
  dateEmission: string;
  motif: string;
  motifDescription?: string;
  modeRemboursement: string;
  referenceTransaction?: string;
  montantRembourse: number;
  montantHT: number;
  montantTVA: number;
  tauxTVA: number;
  lignes: LigneAvoir[];
  vente: {
    numeroVente: string;
    dateVente: string;
    client?: { id: string; prenom: string; nom: string; telephone: string } | null;
    site: { id: string; nom: string; adresse?: string; ville?: string };
    agent: { id: string; nom: string };
  };
}

const MODE_LABELS: Record<string, string> = {
  CASH: 'Espèces',
  MOBILE_MONEY: 'Mobile Money',
  AVOIR_POINTS: 'Avoir en points fidélité',
};

const MOTIF_LABELS: Record<string, string> = {
  DEFECTUEUX: 'Produit défectueux',
  MAUVAISE_COMMANDE: 'Mauvaise commande',
  NON_CONFORME: 'Non conforme à la description',
  CHANGE_AVIS: "Changement d'avis",
  AUTRE: 'Autre',
};

export default function AvoirDocumentPage() {
  const { retourId } = useParams<{ retourId: string }>();
  const navigate = useNavigate();

  const { data, isLoading, isError } = useQuery<{ avoir: AvoirDocument }>({
    queryKey: ['avoir-document', retourId],
    queryFn: () => api.get(`/ventes/retours/${retourId}/avoir`).then((r) => r.data),
    enabled: !!retourId,
  });

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto p-6 animate-pulse space-y-4">
        <div className="h-8 w-40 bg-slate-200 rounded" />
        <div className="h-64 bg-slate-100 rounded-xl" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertTriangle size={40} className="text-danger opacity-60" />
        <p className="text-text font-semibold">Avoir introuvable.</p>
        <button onClick={() => navigate('/sales')} className="btn-secondary">← Retour</button>
      </div>
    );
  }

  const { avoir } = data;

  return (
    <div className="max-w-3xl mx-auto space-y-4 p-4">
      {/* Actions (masquées à l'impression) */}
      <div className="flex items-center justify-between print:hidden">
        <button onClick={() => navigate(-1)} className="btn-secondary flex items-center gap-2 text-[13px]">
          <ArrowLeft size={15} />Retour
        </button>
        <button
          onClick={() => window.print()}
          className="btn-primary flex items-center gap-2 text-[13px]"
        >
          <Printer size={15} />Imprimer l'avoir
        </button>
      </div>

      {/* Document */}
      <div className="bg-white rounded-xl border border-border shadow-card p-8 space-y-6 print:shadow-none print:rounded-none print:border-0">

        {/* En-tête */}
        <div className="flex items-start justify-between gap-4 border-b border-border pb-5">
          <div>
            <h1 className="text-[22px] font-extrabold text-primary tracking-tight">AVOIR COMMERCIAL</h1>
            <p className="text-[13px] text-text-muted mt-0.5">Système OHADA — EBN Network</p>
          </div>
          <div className="text-right">
            <p className="text-[13px] font-bold text-primary font-mono">{avoir.numeroAvoir}</p>
            <p className="text-[12px] text-text-muted">Émis le {formatDateTime(avoir.dateEmission)}</p>
          </div>
        </div>

        {/* Infos émetteur / client */}
        <div className="grid grid-cols-2 gap-6 text-[12px]">
          <div>
            <p className="font-bold text-text-muted uppercase tracking-wide text-[10px] mb-2">Émetteur</p>
            <p className="font-semibold text-text">{avoir.vente.site.nom}</p>
            {avoir.vente.site.adresse && <p className="text-text-muted">{avoir.vente.site.adresse}</p>}
            {avoir.vente.site.ville && <p className="text-text-muted">{avoir.vente.site.ville}</p>}
            <p className="text-text-muted mt-1">Agent : {avoir.vente.agent.nom}</p>
          </div>
          <div>
            <p className="font-bold text-text-muted uppercase tracking-wide text-[10px] mb-2">Client</p>
            {avoir.vente.client ? (
              <>
                <p className="font-semibold text-text">{avoir.vente.client.prenom} {avoir.vente.client.nom}</p>
                <p className="text-text-muted">{avoir.vente.client.telephone}</p>
              </>
            ) : (
              <p className="text-text-muted italic">Client anonyme</p>
            )}
          </div>
        </div>

        {/* Référence vente d'origine */}
        <div className="rounded-lg bg-slate-50 border border-border px-4 py-3 text-[12px] flex flex-wrap gap-4">
          <div>
            <span className="text-text-muted">Vente d'origine :</span>{' '}
            <span className="font-semibold text-text font-mono">{avoir.vente.numeroVente}</span>
          </div>
          <div>
            <span className="text-text-muted">Date vente :</span>{' '}
            <span className="font-semibold text-text">{formatDateTime(avoir.vente.dateVente)}</span>
          </div>
          <div>
            <span className="text-text-muted">Motif :</span>{' '}
            <span className="font-semibold text-text">{MOTIF_LABELS[avoir.motif] ?? avoir.motif}</span>
            {avoir.motifDescription && <span className="text-text-muted"> — {avoir.motifDescription}</span>}
          </div>
        </div>

        {/* Lignes */}
        <div>
          <p className="font-bold text-text-muted uppercase tracking-wide text-[10px] mb-3">Articles retournés</p>
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-border text-text-muted text-left">
                <th className="py-2 font-semibold">Désignation</th>
                <th className="py-2 font-semibold text-center">Qté</th>
                <th className="py-2 font-semibold text-right">P.U. HT</th>
                <th className="py-2 font-semibold text-right">Sous-total HT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {avoir.lignes.map((l, i) => {
                const puHT = l.prixUnitaire / 1.16;
                const stHT = puHT * l.quantite;
                return (
                  <tr key={i}>
                    <td className="py-2">
                      <p className="font-medium text-text">{l.produit.nom}</p>
                      <p className="text-text-subtle font-mono text-[10px]">{l.produit.sku}</p>
                    </td>
                    <td className="py-2 text-center text-text">{l.quantite}</td>
                    <td className="py-2 text-right text-text">{formatUSD(Math.round(puHT))}</td>
                    <td className="py-2 text-right font-semibold text-text">{formatUSD(Math.round(stHT))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Totaux OHADA */}
        <div className="border-t border-border pt-4 space-y-1 text-[12px]">
          <div className="flex justify-between text-text-muted">
            <span>Montant HT</span>
            <span className="font-semibold text-text">{formatUSD(avoir.montantHT)}</span>
          </div>
          <div className="flex justify-between text-text-muted">
            <span>TVA {avoir.tauxTVA}%</span>
            <span className="font-semibold text-text">{formatUSD(avoir.montantTVA)}</span>
          </div>
          <div className="flex justify-between text-[14px] font-bold text-primary border-t border-border pt-2">
            <span>Montant TTC à rembourser</span>
            <span className="text-danger">{formatUSD(avoir.montantRembourse)}</span>
          </div>
          <div className="flex justify-between text-text-muted mt-1">
            <span>Mode de remboursement</span>
            <span className="font-semibold text-text">{MODE_LABELS[avoir.modeRemboursement] ?? avoir.modeRemboursement}</span>
          </div>
          {avoir.referenceTransaction && (
            <div className="flex justify-between text-text-muted">
              <span>Référence transaction</span>
              <span className="font-mono text-text">{avoir.referenceTransaction}</span>
            </div>
          )}
        </div>

        {/* Pied de page */}
        <div className="border-t border-border pt-4 text-[11px] text-text-muted text-center space-y-1">
          <p>Document généré conformément au système comptable OHADA.</p>
          <p>EBN Network — {avoir.vente.site.nom}</p>
        </div>
      </div>
    </div>
  );
}
