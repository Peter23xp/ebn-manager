import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  ArrowLeft, Edit2, Phone, MapPin, Calendar, CreditCard,
  Users, ShoppingBag, Star, Clock, AlertCircle, RefreshCw,
  FileText, Loader2,
  type LucideIcon,
} from 'lucide-react';
import { pdf } from '@react-pdf/renderer';
import toast from 'react-hot-toast';
import { cn, formatDate, initials } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import { useClientDetail } from '@/hooks/useClientDetail';
import { ClientStatusBadge } from '@/components/clients/ClientStatusBadge';
import { EditClientModal } from '@/components/clients/EditClientModal';
import { ClientInfoTab } from '@/components/clients/tabs/ClientInfoTab';
import { ClientAchatsTab } from '@/components/clients/tabs/ClientAchatsTab';
import { FicheAdhesionPDF, type FicheAdhesionData } from '@/components/clients/FicheAdhesionPDF';
import type { UpdateClientDto } from '@/lib/clients.api';

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'infos' | 'achats';

const VALID_TABS: Tab[] = ['infos', 'achats'];

const TABS: { key: Tab; label: string; Icon: LucideIcon }[] = [
  { key: 'infos',      label: 'Informations', Icon: CreditCard  },
  { key: 'achats',     label: 'Achats',       Icon: ShoppingBag },
];

const ETAPE_LABEL: Record<string, string> = {
  RECIT:      'Récit de vente',
  FORMATION:  'Formation',
  FICHE:      'Fiche client',
  ACTIVATION: 'Activation',
};

const ETAPE_ROUTE: Record<string, string> = {
  RECIT:      'recit',
  FORMATION:  'formation',
  FICHE:      'fiche',
  ACTIVATION: 'activation',
};

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function DetailSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="skeleton h-9 w-9 rounded-lg" />
        <div className="skeleton h-5 w-48 rounded-lg" />
      </div>
      <div className="rounded-xl border border-border bg-white p-5 space-y-4">
        <div className="flex items-center gap-4">
          <div className="skeleton h-16 w-16 rounded-full" />
          <div className="space-y-2 flex-1">
            <div className="skeleton h-6 w-48 rounded-lg" />
            <div className="skeleton h-4 w-64 rounded-lg" />
            <div className="skeleton h-4 w-56 rounded-lg" />
          </div>
        </div>
      </div>
      <div className="rounded-xl border border-border bg-white overflow-hidden">
        <div className="skeleton h-12 w-full" />
        <div className="p-5 space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="skeleton h-14 rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { hasRole, user } = useAuthStore();
  const [editOpen, setEditOpen] = useState(false);

  const rawTab = searchParams.get('tab') as Tab | null;
  const activeTab: Tab = rawTab && VALID_TABS.includes(rawTab) ? rawTab : 'infos';

  const {
    client,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
    updateClient,
    isUpdating,
    updateError,
    resetUpdateError,
  } = useClientDetail(id ?? '');

  const canEdit = hasRole('GERANT');
  const [generatingPDF, setGeneratingPDF] = useState(false);

  async function handleGenerateFiche() {
    if (!client) return;
    setGeneratingPDF(true);
    try {
      const activation = client.onboardingEtapes?.find(e => e.etape === 'ACTIVATION');
      const dateStr = activation?.completeeAt
        ? new Date(activation.completeeAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
        : client.dateActivation
          ? new Date(client.dateActivation).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
          : formatDate(client.dateInscription);

      const numeroFiche = client.id.slice(-4).toUpperCase();
      const siteVille = client.site?.nom?.split(' ').pop() ?? 'Goma';

      // Récupère le produit depuis la première vente (vente d'activation)
      const premiereVente = client.ventes?.[0];
      const produitNom = premiereVente?.lignes?.[0]?.produitNom ?? 'Produit EBN Network';
      const produitPrix = Number(activation?.montant ?? premiereVente?.montantNet ?? 0);

      const ficheData: FicheAdhesionData = {
        nomComplet: `${client.prenom} ${client.nom}`.toUpperCase(),
        telephone: client.telephone,
        email: client.email ?? undefined,
        adresse: (client as any).adresse ?? undefined,
        ville: siteVille,
        numeroFiche,
        dateActivation: dateStr,
        parrainNom: client.parrain
          ? `${client.parrain.prenom} ${client.parrain.nom}`
          : undefined,
        parrainCode: client.parrain?.codeParrain ?? undefined,
        agentNom: activation?.agentNom ?? user?.nom ?? user?.name ?? 'Agent',
        produitNom,
        produitPrix,
        pointsCumules: 0,
      };

      const blob = await pdf(<FicheAdhesionPDF data={ficheData} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fiche-${client.prenom}-${client.nom}-${numeroFiche}.pdf`
        .toLowerCase().replace(/\s+/g, '-');
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Fiche générée avec succès !');
    } catch {
      toast.error('Erreur lors de la génération du PDF.');
    } finally {
      setGeneratingPDF(false);
    }
  }

  // Close modal on successful save (updateError becomes null after reset)
  useEffect(() => {
    if (!isUpdating && !updateError && editOpen) {
      // We detect success via the query re-validating; close only when no error
    }
  }, [isUpdating, updateError, editOpen]);

  const handleSave = (data: UpdateClientDto) => {
    updateClient(data, {
      onSuccess: () => setEditOpen(false),
    });
  };

  const setTab = (tab: Tab) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', tab);
      return next;
    }, { replace: true });
  };

  const missingStep = client?.statut === 'EN_COURS'
    ? (client.onboardingEtapes ?? []).find((e) => e.statut !== 'COMPLETE')?.etape ?? null
    : null;

  // ── Loading ──────────────────────────────────────────────────────
  if (isLoading) return <DetailSkeleton />;

  // ── Error ────────────────────────────────────────────────────────
  if (isError || !client) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-text-muted" role="alert">
        <AlertCircle size={36} className="mb-3 opacity-40" aria-hidden />
        <p className="text-[14px] font-medium text-text mb-1">
          {isError ? 'Impossible de charger ce client.' : 'Client introuvable.'}
        </p>
        {isError && (
          <p className="text-[12px] text-text-muted mb-4">
            {error instanceof Error ? error.message : 'Erreur réseau.'}
          </p>
        )}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => refetch()}
            className="flex items-center gap-1.5 text-[13px] font-medium text-primary-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-accent rounded"
          >
            <RefreshCw size={13} aria-hidden />
            Réessayer
          </button>
          <Link
            to="/clients"
            className="text-[13px] text-text-muted hover:text-text transition-colors"
          >
            Retour à la liste
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">

        {/* Breadcrumb */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/clients')}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-border text-text-muted hover:border-border-strong hover:text-text transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-accent"
            aria-label="Retour à la liste des clients"
          >
            <ArrowLeft size={17} aria-hidden />
          </button>
          <p className="text-[13px] text-text-muted truncate">
            <Link to="/clients" className="hover:text-primary transition-colors">Clients</Link>
            {' / '}
            <span className="text-text font-medium">
              {client.prenom} {client.nom}
            </span>
          </p>
          {isFetching && !isLoading && (
            <RefreshCw size={13} className="text-text-muted animate-spin flex-shrink-0 ml-auto" aria-label="Actualisation…" />
          )}
        </div>

        {/* Bannière EN_COURS */}
        {missingStep && (
          <div
            className="flex items-center justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 px-5 py-3"
            role="alert"
          >
            <div className="flex items-center gap-2">
              <Clock size={15} className="text-warning flex-shrink-0" aria-hidden />
              <p className="text-[13px] text-warning font-medium">
                Onboarding en cours — étape manquante :{' '}
                <strong>{ETAPE_LABEL[missingStep] ?? missingStep}</strong>
              </p>
            </div>
            <Link
              to={`/clients/${client.id}/${ETAPE_ROUTE[missingStep] ?? missingStep.toLowerCase()}`}
              className="text-[13px] font-semibold text-warning hover:underline whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning rounded"
            >
              Continuer →
            </Link>
          </div>
        )}

        {/* Hero card */}
        <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              {/* Avatar */}
              <span
                className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full text-[18px] font-extrabold select-none bg-primary-accent text-white"
                aria-hidden
              >
                {initials(client.nom, client.prenom)}
              </span>

              {/* Identity */}
              <div className="min-w-0">
                <h1 className="text-[20px] font-extrabold text-primary leading-tight">
                  {client.prenom} {client.nom}
                </h1>
                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                  <ClientStatusBadge statut={client.statut} size="md" />
                  {(client.matricule || client.codeParrain) && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold font-mono bg-primary/10 text-primary">
                      {client.matricule || client.codeParrain}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[12px] text-text-muted">
                  <span className="flex items-center gap-1.5">
                    <Phone size={11} aria-hidden />
                    {client.telephone}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <MapPin size={11} aria-hidden />
                    {client.site?.nom}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Calendar size={11} aria-hidden />
                    Inscrit le {formatDate(client.dateInscription)}
                  </span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-wrap">
              {client.statut === 'ACTIF' && (
                <button
                  type="button"
                  onClick={handleGenerateFiche}
                  disabled={generatingPDF}
                  className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[13px] font-medium text-text-muted hover:border-green-500 hover:text-green-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {generatingPDF
                    ? <Loader2 size={14} className="animate-spin" aria-hidden />
                    : <FileText size={14} aria-hidden />
                  }
                  {generatingPDF ? 'Génération…' : 'Fiche PDF'}
                </button>
              )}
              {canEdit && (
                <button
                  type="button"
                  onClick={() => { resetUpdateError(); setEditOpen(true); }}
                  className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[13px] font-medium text-text-muted hover:border-primary-accent hover:text-primary-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-accent"
                >
                  <Edit2 size={14} aria-hidden />
                  Modifier
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Tabbed card */}
        <div className="rounded-xl border border-border bg-white overflow-hidden shadow-sm">

          {/* Tab bar */}
          <div
            className="flex overflow-x-auto border-b border-border"
            role="tablist"
            aria-label="Sections du client"
            style={{ scrollbarWidth: 'none' }}
          >
            {TABS.map(({ key, label, Icon }) => (
              <button
                key={key}
                type="button"
                role="tab"
                id={`tab-${key}`}
                aria-selected={activeTab === key}
                aria-controls={`panel-${key}`}
                onClick={() => setTab(key)}
                className={cn(
                  'flex items-center gap-2 px-5 py-3.5 text-[13px] font-medium whitespace-nowrap border-b-2 transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-accent',
                  activeTab === key
                    ? 'border-primary-accent text-primary-accent bg-primary-light/30'
                    : 'border-transparent text-text-muted hover:text-text hover:bg-slate-50',
                )}
              >
                <Icon size={14} aria-hidden />
                {label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div
            className="p-5"
            role="tabpanel"
            id={`panel-${activeTab}`}
            aria-labelledby={`tab-${activeTab}`}
          >
            {activeTab === 'infos'      && <ClientInfoTab      client={client} />}
            {activeTab === 'achats'     && <ClientAchatsTab     client={client} />}
          </div>
        </div>

      </div>

      {/* Modal modification */}
      {canEdit && (
        <EditClientModal
          client={client}
          isOpen={editOpen}
          onClose={() => setEditOpen(false)}
          onSave={handleSave}
          isLoading={isUpdating}
          error={updateError}
        />
      )}
    </>
  );
}
