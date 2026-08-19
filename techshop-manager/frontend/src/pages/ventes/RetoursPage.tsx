import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { differenceInDays } from 'date-fns';
import {
  ArrowLeft,
  RotateCcw,
  AlertTriangle,
  Loader2,
  X,
  FileText,
  Printer,
  CheckCircle2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { api, getErrorMessage } from '@/lib/api';
import { cn, formatUSD, formatDateTime } from '@/lib/utils';
import type { StatutVente, ModePaiement } from '@/types';

// ── Types ─────────────────────────────────────────────────────────────────────

type ReturnMotif =
  | 'DEFECTUEUX'
  | 'MAUVAISE_COMMANDE'
  | 'NON_CONFORME'
  | 'CHANGE_AVIS'
  | 'AUTRE';

type ReturnMode = 'CASH' | 'MOBILE_MONEY';

interface LigneRetour {
  id: string;
  produit: { id: string; sku: string; nom: string };
  quantite: number;
  prixUnitaire: number;
  sousTotal: number;
  quantiteRetournee: number;
  retournee: boolean;
}

interface VenteRetour {
  id: string;
  numeroVente: string;
  createdAt: string;
  statut: StatutVente;
  montantBrut: number;
  montantNet: number;
  modePaiement: ModePaiement;
  client?: {
    id: string;
    nom: string;
    prenom: string;
    telephone: string;
  };
  lignes: LigneRetour[];
}

interface AvoirCreated {
  id: string;
  numeroAvoir: string;
  montantRembourse: number;
  modeRemboursement: string;
}

const MOTIF_LABELS: Record<ReturnMotif, string> = {
  DEFECTUEUX: 'Produit défectueux',
  MAUVAISE_COMMANDE: 'Mauvaise commande',
  NON_CONFORME: 'Non conforme à la description',
  CHANGE_AVIS: "Changement d'avis",
  AUTRE: 'Autre',
};

const MODE_REMBOURSEMENT_LABELS: Record<ReturnMode, string> = {
  CASH: 'Espèces',
  MOBILE_MONEY: 'Mobile Money',
};

// ── Modal confirmation ────────────────────────────────────────────────────────

function ConfirmModal({
  nbArticles,
  montant,
  onConfirm,
  onCancel,
  isPending,
}: {
  nbArticles: number;
  montant: number;
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-text text-lg">Confirmer le retour</h2>
          <button onClick={onCancel} className="p-1.5 rounded-lg hover:bg-bg text-text-muted">
            <X size={18} />
          </button>
        </div>
        <div className="rounded-xl bg-red-50 border border-red-200 p-4 space-y-1 text-sm">
          <p className="font-semibold text-danger">
            Retourner {nbArticles} article{nbArticles > 1 ? 's' : ''} pour {formatUSD(montant)}
          </p>
          <p className="text-text-muted">Un avoir commercial numéroté sera généré automatiquement.</p>
        </div>
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onCancel} disabled={isPending} className="btn-secondary flex-1">
            Annuler
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-danger text-white font-semibold text-sm transition-colors hover:bg-red-700 disabled:opacity-60"
          >
            {isPending ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
            Valider
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Success panel ─────────────────────────────────────────────────────────────

function AvoirSuccessPanel({ avoir, venteId }: { avoir: AvoirCreated; venteId: string }) {
  return (
    <div className="rounded-xl border border-green-200 bg-green-50 p-5 space-y-4">
      <div className="flex items-start gap-3">
        <CheckCircle2 size={22} className="text-success flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-bold text-success text-base">Retour enregistré</p>
          <p className="text-[13px] text-text-muted mt-0.5">
            Avoir commercial émis : <span className="font-mono font-semibold text-text">{avoir.numeroAvoir}</span>
          </p>
          <p className="text-[13px] text-text-muted">
            Remboursement de <span className="font-semibold text-text">{formatUSD(avoir.montantRembourse)}</span> par{' '}
            {MODE_REMBOURSEMENT_LABELS[avoir.modeRemboursement as ReturnMode] ?? avoir.modeRemboursement}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link
          to={`/sales/retours/${avoir.id}/avoir`}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-border text-[13px] font-semibold text-text hover:border-primary-accent hover:text-primary-accent transition-colors"
        >
          <FileText size={14} />
          Voir l'avoir
        </Link>
        <Link
          to={`/sales/${venteId}`}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary-accent text-white text-[13px] font-semibold hover:bg-primary transition-colors"
        >
          Retour à la vente
        </Link>
      </div>
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────

export default function RetoursPage() {
  const [searchParams] = useSearchParams();
  const venteId = searchParams.get('venteId') ?? '';
  const navigate = useNavigate();

  const [selectedLines, setSelectedLines] = useState<Map<string, number>>(new Map());
  const [motif, setMotif] = useState<ReturnMotif | ''>('');
  const [motifDescription, setMotifDescription] = useState('');
  const [returnMode, setReturnMode] = useState<ReturnMode | ''>('');
  const [mobilePhone, setMobilePhone] = useState('');
  const [referenceTransaction, setReferenceTransaction] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [avoirCreated, setAvoirCreated] = useState<AvoirCreated | null>(null);

  const { data: vente, isLoading } = useQuery<VenteRetour>({
    queryKey: ['vente-retour', venteId],
    queryFn: () => api.get(`/ventes/${venteId}`).then((r) => r.data),
    enabled: !!venteId,
  });

  const mutation = useMutation({
    mutationFn: (payload: object) => api.post(`/ventes/${venteId}/retour`, payload),
    onSuccess: (res) => {
      const r = res.data?.retour;
      if (r) {
        setAvoirCreated(r);
        toast.success(`Avoir ${r.numeroAvoir} créé. Stock réapprovisionné.`);
      }
    },
    onError: (error: unknown) => {
      const axiosError = error as { response?: { data?: { error?: { code?: string }; code?: string } } };
      const code = axiosError?.response?.data?.code ?? axiosError?.response?.data?.error?.code;
      if (code === 'ALREADY_RETURNED') {
        toast.error('Certains articles ont déjà été retournés.');
        setSelectedLines(new Map());
      } else if (code === 'RETURN_PERIOD_EXPIRED') {
        toast.error('Le délai de retour est dépassé.');
      } else {
        toast.error(getErrorMessage(error));
      }
    },
  });

  if (!venteId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertTriangle size={40} className="text-danger opacity-60" />
        <p className="text-text font-semibold">Paramètre venteId manquant.</p>
        <button onClick={() => navigate('/sales')} className="btn-secondary">← Retour à l'historique</button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto space-y-5 px-4 py-6 animate-pulse">
        <div className="h-8 w-48 bg-slate-200 rounded-lg" />
        {[...Array(2)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl shadow-card p-5 h-32">
            <div className="space-y-3">{[...Array(3)].map((_, j) => <div key={j} className="h-4 bg-slate-200 rounded" />)}</div>
          </div>
        ))}
      </div>
    );
  }

  if (!vente) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertTriangle size={40} className="text-danger opacity-60" />
        <p className="text-text font-semibold">Vente introuvable.</p>
        <button onClick={() => navigate('/sales')} className="btn-secondary">← Retour à l'historique</button>
      </div>
    );
  }

  const daysSince = differenceInDays(new Date(), new Date(vente.createdAt));

  if (daysSince > 7) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        <button onClick={() => navigate(`/sales/${venteId}`)} className="btn-secondary flex items-center gap-2">
          <ArrowLeft size={16} />Retour à la vente {vente.numeroVente}
        </button>
        <div className="rounded-xl bg-red-50 border border-red-200 p-5 flex items-start gap-3">
          <AlertTriangle size={20} className="text-danger mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold text-danger">Retour impossible — délai de 7 jours dépassé</p>
            <p className="text-sm text-text-muted mt-1">(vente effectuée il y a {daysSince} jours)</p>
          </div>
        </div>
      </div>
    );
  }

  const toutesRetournees = vente.lignes.every((l) => l.retournee);
  if (toutesRetournees) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        <button onClick={() => navigate(`/sales/${venteId}`)} className="btn-secondary flex items-center gap-2">
          <ArrowLeft size={16} />Retour à la vente {vente.numeroVente}
        </button>
        <div className="rounded-xl bg-red-50 border border-red-200 p-5 flex items-start gap-3">
          <AlertTriangle size={20} className="text-danger mt-0.5 shrink-0" />
          <p className="font-semibold text-danger">Toutes les lignes ont déjà été retournées.</p>
        </div>
      </div>
    );
  }

  // ── Calculs ────────────────────────────────────────────────────────────────

  const montantBrutRetour = Array.from(selectedLines.entries()).reduce((sum, [produitId, qty]) => {
    const ligne = vente.lignes.find((l) => l.produit.id === produitId);
    return sum + (ligne ? ligne.prixUnitaire * qty : 0);
  }, 0);

  const remisePct = 0; // Removed legacy fidelite
  const montantARembourser = Math.round(montantBrutRetour * (1 - remisePct));
  const nbArticlesRetournes = Array.from(selectedLines.values()).reduce((a, b) => a + b, 0);

  const lignesDisponibles = vente.lignes.filter((l) => !l.retournee);
  const allSelected =
    lignesDisponibles.length > 0 && lignesDisponibles.every((l) => selectedLines.has(l.produit.id));

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedLines(new Map());
    } else {
      const next = new Map<string, number>();
      lignesDisponibles.forEach((l) => {
        const qtyMax = l.quantite - l.quantiteRetournee;
        if (qtyMax > 0) next.set(l.produit.id, qtyMax);
      });
      setSelectedLines(next);
    }
  };

  const toggleLigne = (ligne: LigneRetour) => {
    const next = new Map(selectedLines);
    if (next.has(ligne.produit.id)) {
      next.delete(ligne.produit.id);
    } else {
      const qtyMax = ligne.quantite - ligne.quantiteRetournee;
      next.set(ligne.produit.id, qtyMax > 0 ? qtyMax : 1);
    }
    setSelectedLines(next);
  };

  const setQty = (produitId: string, qty: number) => {
    const next = new Map(selectedLines);
    next.set(produitId, qty);
    setSelectedLines(next);
  };

  const needsRef = returnMode === 'MOBILE_MONEY';
  const formValid =
    selectedLines.size > 0 &&
    motif !== '' &&
    (motif !== 'AUTRE' || motifDescription.trim().length > 0) &&
    returnMode !== '' &&
    (!needsRef || mobilePhone.trim().length > 0) &&
    confirmed;

  const handleSubmit = () => {
    if (!formValid) return;
    const lignes = Array.from(selectedLines.entries()).map(([produitId, qty]) => ({ produitId, quantite: qty }));
    mutation.mutate({
      lignes,
      motif,
      motifDescription: motif === 'AUTRE' ? motifDescription : undefined,
      modeRemboursement: returnMode,
      referenceTransaction: needsRef ? mobilePhone : undefined,
    });
    setConfirmOpen(false);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5 px-4 py-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(`/sales/${venteId}`)} className="btn-secondary p-2" aria-label="Retour">
          <ArrowLeft size={18} />
        </button>
        <div>
          <p className="text-sm text-text-muted">← Vente {vente.numeroVente}</p>
          <h1 className="text-xl font-bold text-text flex items-center gap-2">
            <RotateCcw size={20} className="text-danger" />
            Retour de marchandise
          </h1>
        </div>
      </div>

      {/* Panel succès — affiché après création */}
      {avoirCreated && <AvoirSuccessPanel avoir={avoirCreated} venteId={venteId} />}

      {/* Formulaire — masqué après succès */}
      {!avoirCreated && (
        <>
          {/* Articles */}
          <div className="bg-white rounded-xl shadow-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-text">Articles</h2>
              <label className="flex items-center gap-2 text-sm text-text-muted cursor-pointer select-none">
                <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="w-4 h-4 rounded accent-danger" />
                Tout sélectionner
              </label>
            </div>
            <div className="space-y-3">
              {vente.lignes.map((ligne) => {
                const qtyMax = ligne.quantite - ligne.quantiteRetournee;
                const isChecked = selectedLines.has(ligne.produit.id);
                return (
                  <div
                    key={ligne.id}
                    className={cn(
                      'flex items-start gap-3 p-3 rounded-xl border-2 transition-colors',
                      ligne.retournee ? 'border-border bg-bg opacity-60' : isChecked ? 'border-danger bg-red-50' : 'border-border hover:border-border-strong',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      disabled={ligne.retournee}
                      onChange={() => toggleLigne(ligne)}
                      className="mt-1 w-4 h-4 rounded accent-danger"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-text text-sm">{ligne.produit.nom}</span>
                        <span className="font-mono text-xs text-text-subtle">{ligne.produit.sku}</span>
                        {ligne.retournee && (
                          <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-orange-100 text-orange-700">Déjà retourné</span>
                        )}
                        {!ligne.retournee && ligne.quantiteRetournee > 0 && (
                          <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700">
                            {ligne.quantiteRetournee} déjà retourné{ligne.quantiteRetournee > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-text-muted mt-0.5">
                        Vendu : {ligne.quantite} × {formatUSD(ligne.prixUnitaire)}
                        {qtyMax < ligne.quantite && (
                          <span className="ml-1 text-primary-accent font-medium">
                            · Retournable : {qtyMax}
                          </span>
                        )}
                      </p>
                    </div>
                    {isChecked && !ligne.retournee && (
                      <div className="flex items-center gap-2 shrink-0">
                        <label htmlFor={`qty-${ligne.produit.id}`} className="text-xs text-text-muted font-medium">
                          Qté à retourner :
                        </label>
                        <select
                          id={`qty-${ligne.produit.id}`}
                          value={selectedLines.get(ligne.produit.id) ?? 1}
                          onChange={(e) => setQty(ligne.produit.id, Number(e.target.value))}
                          onClick={(e) => e.stopPropagation()}
                          className="border border-danger rounded-lg px-2 py-1 text-sm font-semibold text-danger focus:outline-none focus:ring-2 focus:ring-danger min-w-[56px]"
                        >
                          {Array.from({ length: qtyMax }, (_, i) => i + 1).map((q) => (
                            <option key={q} value={q}>{q} / {qtyMax}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Motif */}
          {selectedLines.size > 0 && (
            <div className="bg-white rounded-xl shadow-card p-5 space-y-4">
              <h2 className="font-semibold text-text">Motif du retour</h2>
              <div className="space-y-2">
                <label className="form-label" htmlFor="motif-select">Motif *</label>
                <select
                  id="motif-select"
                  value={motif}
                  onChange={(e) => setMotif(e.target.value as ReturnMotif | '')}
                  className="w-full px-4 py-2.5 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-accent"
                >
                  <option value="">Sélectionner un motif…</option>
                  {(Object.keys(MOTIF_LABELS) as ReturnMotif[]).map((key) => (
                    <option key={key} value={key}>{MOTIF_LABELS[key]}</option>
                  ))}
                </select>
              </div>
              {motif === 'AUTRE' && (
                <div className="space-y-2">
                  <label className="form-label" htmlFor="motif-desc">Description *</label>
                  <textarea
                    id="motif-desc"
                    rows={3}
                    value={motifDescription}
                    onChange={(e) => setMotifDescription(e.target.value)}
                    placeholder="Décrivez la raison du retour…"
                    className="w-full px-4 py-2.5 border border-border rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-accent"
                  />
                </div>
              )}
            </div>
          )}

          {/* Mode remboursement */}
          {motif !== '' && (motif !== 'AUTRE' || motifDescription.trim().length > 0) && (
            <div className="bg-white rounded-xl shadow-card p-5 space-y-4">
              <h2 className="font-semibold text-text">Mode de remboursement</h2>
              <div className="space-y-3">
                {/* CASH */}
                <label className={cn('flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors', returnMode === 'CASH' ? 'border-primary-accent bg-blue-50' : 'border-border hover:border-border-strong')}>
                  <input type="radio" name="returnMode" value="CASH" checked={returnMode === 'CASH'} onChange={() => setReturnMode('CASH')} className="mt-1 accent-primary-accent" />
                  <div>
                    <p className="font-medium text-text text-sm">Espèces</p>
                    {returnMode === 'CASH' && <p className="text-sm text-success font-semibold mt-1">Montant à remettre : {formatUSD(montantARembourser)}</p>}
                  </div>
                </label>

                {/* MOBILE_MONEY */}
                <label className={cn('flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors', returnMode === 'MOBILE_MONEY' ? 'border-primary-accent bg-blue-50' : 'border-border hover:border-border-strong')}>
                  <input
                    type="radio"
                    name="returnMode"
                    value="MOBILE_MONEY"
                    checked={returnMode === 'MOBILE_MONEY'}
                    onChange={() => { setReturnMode('MOBILE_MONEY'); if (!mobilePhone && vente.client?.telephone) setMobilePhone(vente.client.telephone); }}
                    className="mt-1 accent-primary-accent"
                  />
                  <div className="flex-1">
                    <p className="font-medium text-text text-sm">Mobile Money</p>
                    {returnMode === 'MOBILE_MONEY' && (
                      <div className="mt-2 space-y-1">
                        <label className="form-label text-xs" htmlFor="mm-phone">Numéro Mobile Money *</label>
                        <input
                          id="mm-phone"
                          type="tel"
                          value={mobilePhone}
                          onChange={(e) => setMobilePhone(e.target.value)}
                          placeholder="+243XXXXXXXXX"
                          className="w-full px-3 py-2 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-accent"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                    )}
                  </div>
                </label>

              </div>
            </div>
          )}

          {/* Récapitulatif */}
          {returnMode !== '' && selectedLines.size > 0 && (
            <div className="bg-white rounded-xl shadow-card p-5 space-y-3">
              <h2 className="font-semibold text-text">Récapitulatif</h2>
              <div className="space-y-2 text-sm">
                <div>
                  <p className="font-medium text-text-muted mb-1.5">Articles retournés :</p>
                  {Array.from(selectedLines.entries()).map(([produitId, qty]) => {
                    const ligne = vente.lignes.find((l) => l.produit.id === produitId);
                    if (!ligne) return null;
                    return (
                      <div key={produitId} className="flex justify-between text-text">
                        <span>{ligne.produit.nom} × {qty}</span>
                        <span>{formatUSD(ligne.prixUnitaire * qty)}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="border-t border-border pt-2 space-y-1">
                  <div className="flex justify-between font-semibold text-text">
                    <span>Montant à rembourser</span>
                    <span className="text-danger">{formatUSD(montantARembourser)}</span>
                  </div>
                </div>
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-2.5 text-[12px] text-amber-800">
                  Un avoir commercial numéroté sera généré automatiquement.
                </div>
              </div>
            </div>
          )}

          {/* Confirmation */}
          {returnMode !== '' && selectedLines.size > 0 && (
            <div className="bg-white rounded-xl shadow-card p-5 space-y-4">
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="w-4 h-4 rounded accent-danger" />
                <span className="text-sm text-text font-medium">Je confirme que les produits sont récupérés physiquement.</span>
              </label>
              <button
                type="button"
                disabled={!formValid || mutation.isPending}
                onClick={() => setConfirmOpen(true)}
                className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-danger text-white font-bold text-sm transition-colors hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {mutation.isPending ? <Loader2 size={18} className="animate-spin" /> : <RotateCcw size={18} />}
                VALIDER LE RETOUR ({formatUSD(montantARembourser)})
              </button>
            </div>
          )}
        </>
      )}

      {/* Modal */}
      {confirmOpen && (
        <ConfirmModal
          nbArticles={nbArticlesRetournes}
          montant={montantARembourser}
          onConfirm={handleSubmit}
          onCancel={() => setConfirmOpen(false)}
          isPending={mutation.isPending}
        />
      )}
    </div>
  );
}
