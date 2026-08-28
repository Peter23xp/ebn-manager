import { useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, CheckCircle2, XCircle, Phone, MapPin, CreditCard,
  Copy, AlertTriangle, Loader2, Zap, Users, FileText,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { pdf } from '@react-pdf/renderer';
import { api, getErrorMessage } from '@/lib/api';
import { cn, formatCDF, formatUSD, formatDate, initials } from '@/lib/utils';
import { OnboardingStepper } from '@/components/clients/OnboardingStepper';
import { ProduitSearchInput } from '@/components/clients/ProduitSearchInput';
import { FicheAdhesionPDF, FicheAdhesionData } from '@/components/clients/FicheAdhesionPDF';
import { useAuthStore } from '@/store/auth.store';
import { Produit } from '@/types';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ClientActivation {
  id: string;
  prenom: string;
  nom: string;
  telephone: string;
  email?: string;
  adresse?: string;
  statut: string;
  codeParrain: string | null;
  siteInscriptionId: string;
  site: { id: string; nom: string };
  parrain: { id: string; prenom: string; nom: string; codeParrain: string } | null;
  onboardingEtapes: Array<{
    etape: 'RECIT' | 'FORMATION' | 'FICHE' | 'ACTIVATION';
    statut: string;
    completeeAt?: string | null;
    montant?: number | null;
    modePaiement?: string | null;
    referenceTransaction?: string | null;
  }>;
}

interface ActivationResult {
  id: string;
  statut: string;
  codeParrain: string;
  dateActivation: string;
  prenom: string;
  nom: string;
  telephone: string;
}

const MODE_PAIEMENT = [
  { value: 'CASH',         label: 'Cash' },
] as const;

const ETAPE_REQUIRED: Array<{ key: 'RECIT' | 'FICHE'; label: string }> = [
  { key: 'RECIT', label: 'Récit de vente' },
  { key: 'FICHE', label: 'Fiche client' },
];

const MODE_LABEL: Record<string, string> = {
  CASH: 'Cash', MPESA: 'M-Pesa', AIRTEL_MONEY: 'Airtel Money', VIREMENT: 'Virement',
};

// ── Modale confirmation ───────────────────────────────────────────────────────

function ConfirmModal({
  client,
  nextCode,
  produit,
  modePaiement,
  onConfirm,
  onCancel,
  isLoading,
}: {
  client: ClientActivation;
  nextCode: string | null;
  produit: Produit;
  modePaiement: string;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-border p-6 space-y-4"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-amber-100">
            <AlertTriangle size={18} className="text-warning" aria-hidden />
          </div>
          <div>
            <h2 id="confirm-title" className="text-[15px] font-bold text-primary">
              Confirmer l'activation ?
            </h2>
            <p className="text-[13px] text-text-muted mt-1">
              Cette action est <strong>irréversible</strong>. Le compte de{' '}
              <strong>{client.prenom} {client.nom}</strong> sera définitivement activé
              {nextCode && <> et son matricule <strong className="font-mono">{nextCode}</strong> sera généré</>}.
            </p>
          </div>
        </div>

        {/* Récap produit */}
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-[12px] space-y-1">
          <p className="font-bold text-text">Produit acheté</p>
          <p className="text-text-muted">{produit.nom} — <span className="font-mono font-bold text-text">{formatUSD(produit.prixVente)}</span></p>
          <p className="text-text-muted">Mode de paiement : <span className="font-semibold text-text">{MODE_LABEL[modePaiement] ?? modePaiement}</span></p>
          <p className="text-orange-600 text-[11px] font-medium mt-1">⚠ 1 unité sera retirée du stock.</p>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="btn-secondary text-[13px]"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className="btn-primary text-[13px] flex items-center gap-2"
          >
            {isLoading && <Loader2 size={14} className="animate-spin" aria-hidden />}
            ✓ Activer le compte
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Écran succès ──────────────────────────────────────────────────────────────

function SuccessScreen({
  result,
  client,
  clientId,
  activationProduit,
  onNavigate,
}: {
  result: ActivationResult;
  client: ClientActivation;
  clientId: string;
  activationProduit: Produit;
  onNavigate: () => void;
}) {
  const user = useAuthStore((s) => s.user);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);

  const copyCode = () => {
    navigator.clipboard.writeText(result.codeParrain).catch(() => {});
    toast.success('Code copié !');
  };

  async function handleGeneratePDF() {
    setGenerating(true);
    try {
      const dateStr = new Date(result.dateActivation).toLocaleDateString('fr-FR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
      });
      const numeroFiche = result.id.slice(-4).toUpperCase();
      const siteVille = client.site?.nom?.split(' ').pop() ?? 'Goma';
      const ficheData: FicheAdhesionData = {
        nomComplet: `${result.prenom} ${result.nom}`.toUpperCase(),
        telephone: result.telephone,
        email: client.email ?? undefined,
        adresse: client.adresse ?? undefined,
        ville: siteVille,
        numeroFiche,
        dateActivation: dateStr,
        parrainNom: client.parrain
          ? `${client.parrain.prenom} ${client.parrain.nom}`
          : undefined,
        parrainCode: client.parrain?.codeParrain ?? undefined,
        agentNom: user?.nom ?? user?.name ?? 'Agent',
        produitNom: activationProduit.nom,
        produitPrix: activationProduit.prixVente,
        pointsCumules: 40,
      };
      const blob = await pdf(<FicheAdhesionPDF data={ficheData} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fiche-${result.prenom}-${result.nom}-${numeroFiche}.pdf`
        .toLowerCase()
        .replace(/\s+/g, '-');
      a.click();
      URL.revokeObjectURL(url);
      setGenerated(true);
      toast.success('Fiche générée avec succès !');
    } catch {
      toast.error('Erreur lors de la génération du PDF.');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="flex flex-col items-center text-center py-10 px-6 space-y-5">
      <CheckCircle2 size={72} className="text-success" aria-hidden />
      <div>
        <h2 className="text-[22px] font-extrabold text-primary">Compte activé avec succès !</h2>
        <p className="text-[14px] text-text-muted mt-1">
          {result.prenom} {result.nom} est maintenant un client actif.
        </p>
      </div>

      {/* Code parrain */}
      <div className="rounded-xl border border-blue-100 bg-blue-50 px-6 py-4 space-y-3 w-full max-w-sm">
        <p className="text-[11px] font-bold uppercase tracking-widest text-primary-accent">Matricule attribué</p>
        <p className="text-[28px] font-extrabold font-mono text-primary tracking-widest">{result.codeParrain}</p>
        <button
          type="button"
          onClick={copyCode}
          className="flex items-center gap-1.5 mx-auto px-4 py-1.5 rounded-lg border border-border text-[12px] font-semibold text-text-muted hover:text-primary-accent hover:border-primary-accent transition-colors"
        >
          <Copy size={13} aria-hidden />
          Copier le code
        </button>
      </div>

      <p className="text-[12px] text-text-muted">
        Un SMS de bienvenue a été envoyé au {result.telephone}{' '}
        <span className="italic">(si le service SMS est configuré)</span>
      </p>

      {/* Récap produit vendu + stock */}
      <div className="w-full max-w-sm rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-left space-y-1">
        <p className="text-[11px] font-bold uppercase tracking-widest text-success">Produit vendu · Stock mis à jour</p>
        <p className="text-[13px] font-semibold text-text">{activationProduit.nom}</p>
        <p className="text-[12px] text-text-muted font-mono">{formatUSD(activationProduit.prixVente)} · 1 unité retirée du stock</p>
      </div>

      {/* Génération fiche PDF */}
      <div className="w-full max-w-sm rounded-xl border border-border bg-white shadow-sm p-5 space-y-4 text-left">
        <div>
          <p className="text-[13px] font-bold text-primary">Générer la Fiche d'Adhésion</p>
          <p className="text-[11px] text-text-muted mt-0.5">
            Le produit <strong>{activationProduit.nom}</strong> est inclus dans la fiche.
          </p>
        </div>

        <button
          type="button"
          onClick={handleGeneratePDF}
          disabled={generating}
          className="btn-primary w-full text-[13px] flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {generating
            ? <><Loader2 size={14} className="animate-spin" aria-hidden /> Génération…</>
            : <><FileText size={14} aria-hidden /> Générer la Fiche PDF</>
          }
        </button>

        {generated && (
          <p className="text-[11px] text-success text-center font-medium">
            ✓ Fiche téléchargée. Vous pouvez en générer une nouvelle si besoin.
          </p>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center gap-3 flex-wrap justify-center pt-2">
        <Link to={`/clients/${clientId}`} className="btn-primary text-[13px]">
          Voir la fiche client
        </Link>
        <Link to="/clients/new/recit" className="btn-secondary text-[13px]">
          + Nouveau client
        </Link>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function OnboardingActivationPage() {
  const { id }   = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc       = useQueryClient();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [successResult, setSuccessResult] = useState<ActivationResult | null>(null);

  // Produit + mode de paiement — saisis AVANT la confirmation
  const [selectedProduit, setSelectedProduit] = useState<Produit | null>(null);
  const [modePaiement, setModePaiement] = useState<string>('CASH');

  const { data: client, isLoading } = useQuery<ClientActivation>({
    queryKey: ['client-activation', id],
    queryFn: () => api.get(`/clients/${id}`).then(r => r.data),
    enabled: !!id,
  });

  const { data: nextCodeData } = useQuery<{ nextCode: string }>({
    queryKey: ['next-code', client?.site?.id],
    queryFn: () =>
      api.get(`/clients/next-code`, { params: { siteId: client!.site.id } }).then(r => r.data),
    enabled: !!client?.site?.id && !client?.codeParrain,
  });
  const nextCode = client?.codeParrain ?? nextCodeData?.nextCode ?? null;

  const handleSuccessNavigate = useCallback(() => navigate(`/clients/${id}`), [navigate, id]);

  const mutation = useMutation({
    mutationFn: () => api.post(`/clients/${id}/onboarding/activate`, {
      produitId: selectedProduit!.id,
      modePaiement,
    }),
    onSuccess: (res) => {
      setConfirmOpen(false);
      const c = res.data;
      setSuccessResult({
        id:             c.id,
        statut:         c.statut,
        codeParrain:    c.codeParrain,
        dateActivation: c.dateActivation,
        prenom:         c.prenom,
        nom:            c.nom,
        telephone:      c.telephone,
      });
      qc.invalidateQueries({ queryKey: ['client', id] });
      qc.invalidateQueries({ queryKey: ['clients'] });
      qc.invalidateQueries({ queryKey: ['stocks'] });
    },
    onError: (error: any) => {
      setConfirmOpen(false);
      const status = error?.response?.status;
      const code = error?.response?.data?.code;
      const msg = error?.response?.data?.message;
      if (code === 'ERR_CONFLICT' || code === 'ERR_ALREADY_ACTIVE') {
        toast.error('Ce client est déjà activé.');
      } else if (code === 'ERR_STOCK_INSUFFISANT') {
        toast.error(msg ?? 'Stock insuffisant pour ce produit.');
      } else if (status === 400) {
        // Validation error — affiche le détail pour faciliter le debug
        const detail = Array.isArray(msg) ? msg.join(', ') : (msg ?? 'Données invalides.');
        toast.error(`Erreur de validation : ${detail}`);
      } else {
        toast.error(getErrorMessage(error) || "Erreur lors de l'activation.");
      }
    },
  });

  // ── Loading ──────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto space-y-5 animate-pulse">
        <div className="skeleton h-9 w-48 rounded-lg" />
        <div className="skeleton h-12 w-full rounded-xl" />
        <div className="skeleton h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="text-center py-16 text-text-muted">
        <p>Client introuvable.</p>
      </div>
    );
  }

  // ── Succès ───────────────────────────────────────────────────
  if (successResult && selectedProduit) {
    return (
      <div className="max-w-2xl mx-auto rounded-xl border border-border bg-white shadow-sm">
        <SuccessScreen
          result={successResult}
          client={client}
          clientId={id!}
          activationProduit={selectedProduit}
          onNavigate={handleSuccessNavigate}
        />
      </div>
    );
  }

  // ── Calculs ──────────────────────────────────────────────────
  const recit = client.onboardingEtapes.find(e => e.etape === 'RECIT');
  const fiche = client.onboardingEtapes.find(e => e.etape === 'FICHE');

  const stepsOk = ETAPE_REQUIRED.map(({ key, label }) => ({
    key, label,
    done: client.onboardingEtapes.find(e => e.etape === key)?.statut === 'COMPLETE',
  }));
  const missingSteps = stepsOk.filter(s => !s.done);
  const allComplete  = missingSteps.length === 0;

  const totalPaye = Number(recit?.montant ?? 0) + Number(fiche?.montant ?? 0);

  const firstMissingRoute: Record<string, string> = {
    RECIT: '/clients/new/recit',
    FICHE: `/clients/${id}/fiche`,
  };

  const canActivate = allComplete && !!selectedProduit;

  return (
    <>
      <div className="max-w-2xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(`/clients/${id}`)}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-border text-text-muted hover:border-border-strong hover:text-text transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-accent"
            aria-label="Retour à la fiche client"
          >
            <ArrowLeft size={17} aria-hidden />
          </button>
          <div>
            <h1 className="text-[18px] font-extrabold text-primary leading-tight">Activation du compte</h1>
            <p className="text-[12px] text-text-muted">Étape 3 sur 3 — Dernière étape</p>
          </div>
        </div>

        {/* Stepper */}
        <OnboardingStepper currentStep={3} clientId={id} />

        {/* Guard — étapes incomplètes */}
        {!allComplete && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-4 space-y-2" role="alert">
            <div className="flex items-center gap-2">
              <XCircle size={15} className="text-danger flex-shrink-0" aria-hidden />
              <p className="text-[13px] font-bold text-danger">L'onboarding n'est pas encore complet.</p>
            </div>
            <ul className="space-y-1 ml-5">
              {missingSteps.map((s) => (
                <li key={s.key} className="text-[12px] text-danger">
                  • {s.label} non complété
                </li>
              ))}
            </ul>
            <Link
              to={firstMissingRoute[missingSteps[0].key]}
              className="inline-block mt-1 text-[12px] font-semibold text-danger hover:underline"
            >
              → Compléter l'onboarding
            </Link>
          </div>
        )}

        {/* Récapitulatif client */}
        <div className="rounded-xl border border-border bg-white shadow-sm p-5 space-y-5">
          <h2 className="text-[14px] font-bold text-primary uppercase tracking-wide">
            Récapitulatif avant activation
          </h2>

          {/* Identité client + parrain */}
          <div className="rounded-xl border border-border bg-slate-50 p-4 space-y-3">
            <div className="flex items-center gap-3">
              <span
                className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full text-[14px] font-extrabold bg-primary-accent text-white select-none"
                aria-hidden
              >
                {initials(client.nom, client.prenom)}
              </span>
              <div>
                <p className="text-[15px] font-bold text-primary">{client.prenom} {client.nom}</p>
                <div className="flex flex-wrap gap-3 mt-0.5 text-[12px] text-text-muted">
                  <span className="flex items-center gap-1"><Phone size={11} aria-hidden />{client.telephone}</span>
                  <span className="flex items-center gap-1"><MapPin size={11} aria-hidden />{client.site?.nom}</span>
                </div>
              </div>
            </div>

            {client.parrain ? (
              <div className="flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2">
                <Users size={13} className="text-primary-accent flex-shrink-0" aria-hidden />
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] text-primary-accent font-semibold">
                    {client.parrain.prenom} {client.parrain.nom}
                    <span className="font-mono ml-2 text-text-muted">({client.parrain.codeParrain})</span>
                  </p>
                </div>
                <span className="text-[10px] font-bold text-success bg-green-100 px-2 py-0.5 rounded-full flex-shrink-0">
                  ✓ Lié
                </span>
              </div>
            ) : (
              <p className="text-[12px] text-text-muted italic">Aucun parrain.</p>
            )}

            {!client.codeParrain && (
              <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2.5 text-center">
                <p className="text-[10px] font-bold uppercase tracking-widest text-primary-accent mb-1">
                  Matricule qui sera généré
                </p>
                <p className="text-[20px] font-extrabold font-mono text-primary tracking-widest">
                  {nextCode ?? 'TSG-XXXX'}
                </p>
                <p className="text-[10px] text-text-muted mt-0.5">(prévisualisation — non définitif)</p>
              </div>
            )}
          </div>

          {/* Paiements */}
          <div className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-widest text-text-muted">Paiements effectués</p>
            {[
              { label: 'Récit de vente', etape: recit },
              { label: 'Fiche client',   etape: fiche },
            ].map(({ label, etape }) => (
              <div
                key={label}
                className={cn(
                  'flex items-center justify-between px-3 py-2.5 rounded-lg border border-border',
                  etape?.statut === 'COMPLETE' ? 'bg-green-50/50' : 'bg-slate-50',
                )}
              >
                <div className="flex items-center gap-2">
                  <CreditCard size={13} className="text-text-muted" aria-hidden />
                  <span className="text-[12px] font-medium text-text">{label}</span>
                </div>
                <div className="text-right">
                  <p className="text-[13px] font-bold font-mono text-text">
                    {etape?.montant ? formatCDF(Number(etape.montant)) : '—'}
                  </p>
                  {etape?.completeeAt && (
                    <p className="text-[10px] text-text-muted">
                      {formatDate(etape.completeeAt)}
                      {etape.modePaiement && ` · ${MODE_LABEL[etape.modePaiement] ?? etape.modePaiement}`}
                    </p>
                  )}
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between px-3 py-2 border-t border-border">
              <span className="text-[13px] font-bold text-text">Total payé</span>
              <span className="text-[15px] font-extrabold font-mono text-success">{formatCDF(totalPaye)}</span>
            </div>
          </div>

          {/* Checklist étapes */}
          <div className="space-y-2">
            {stepsOk.map((s) => (
              <div
                key={s.key}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg border',
                  s.done ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50',
                )}
              >
                {s.done
                  ? <CheckCircle2 size={15} className="text-success flex-shrink-0" aria-hidden />
                  : <XCircle     size={15} className="text-danger flex-shrink-0"   aria-hidden />}
                <p className={cn('text-[13px] font-medium', s.done ? 'text-success' : 'text-danger')}>
                  {s.label} — {s.done ? 'Complété' : 'Non complété'}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Produit d'activation + mode de paiement — obligatoires */}
        {allComplete && (
          <div className="rounded-xl border border-border bg-white shadow-sm p-5 space-y-4">
            <h2 className="text-[14px] font-bold text-primary uppercase tracking-wide">
              Produit acheté à l'activation
            </h2>
            <p className="text-[12px] text-text-muted -mt-2">
              Sélectionnez le produit physique acheté par le client. Il sera déduit du stock.
            </p>

            <ProduitSearchInput
              siteId={client.siteInscriptionId}
              selected={selectedProduit}
              onSelect={setSelectedProduit}
              onClear={() => setSelectedProduit(null)}
            />

            {selectedProduit && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-text-muted">
                Prix : <span className="font-mono font-bold text-text">
                  {formatUSD(selectedProduit.prixVente)}
                </span>
                {' · '}Points : <span className="font-bold text-primary">40P</span>
                {' · '}Stock : <span className="font-bold text-orange-600">−1 unité après activation</span>
              </div>
            )}

            {/* Mode de paiement */}
            <div className="space-y-2">
              <label className="text-[12px] font-bold text-text-muted uppercase tracking-wide">
                Mode de paiement
              </label>
              <div className="grid grid-cols-2 gap-2">
                {MODE_PAIEMENT.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setModePaiement(value)}
                    className={cn(
                      'px-3 py-2.5 rounded-lg border text-[12px] font-semibold transition-colors',
                      modePaiement === value
                        ? 'border-primary-accent bg-primary-accent/10 text-primary-accent'
                        : 'border-border bg-white text-text-muted hover:border-border-strong',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* CTA activation */}
        {allComplete && (
          <div className="rounded-xl border border-border bg-white shadow-sm p-5">
            <div className="flex items-start gap-3 mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              <AlertTriangle size={14} className="text-warning flex-shrink-0 mt-0.5" aria-hidden />
              <p className="text-[12px] text-warning font-medium">
                Cette action est irréversible. Le compte sera définitivement activé.
              </p>
            </div>
            {!selectedProduit && (
              <p className="text-[12px] text-danger text-center mb-3 font-medium">
                ⚠ Sélectionnez un produit avant d'activer.
              </p>
            )}
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              disabled={!canActivate || mutation.isPending}
              className="btn-primary w-full text-[14px] py-3 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Zap size={16} aria-hidden />
              ✓ Activer le compte et générer le matricule
            </button>
          </div>
        )}

      </div>

      {/* Modale de confirmation */}
      {confirmOpen && client && selectedProduit && (
        <ConfirmModal
          client={client}
          nextCode={nextCode}
          produit={selectedProduit}
          modePaiement={modePaiement}
          onConfirm={() => mutation.mutate()}
          onCancel={() => setConfirmOpen(false)}
          isLoading={mutation.isPending}
        />
      )}
    </>
  );
}
