import { useNavigate } from 'react-router-dom';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { PortalLayout } from '@/components/portal/PortalLayout';
import { ParrainCard } from '@/components/portal/ParrainCard';
import { WalletCard } from '@/components/portal/WalletCard';
import { QuickActionsGrid } from '@/components/portal/QuickActionsGrid';
import { RecentPurchasesMini } from '@/components/portal/RecentPurchasesMini';
import { usePortalHome } from '@/hooks/usePortalHome';
import { usePortalMlm } from '@/hooks/usePortalMlm';
import { useAuthStore } from '@/store/auth.store';
import { PointsCard } from '@/components/portal/PointsCard';

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-text-subtle">
      {children}
    </p>
  );
}

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-bg-inset ${className ?? ''}`} />;
}

export default function PortalHomePage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  // Données fidélité classiques
  const {
    client, prochainNiveau, niveauxConfig,
    nbFilleulsActifs, nbFilleulsTotal,
    dernierAchats, isLoading: isHomeLoading, error, refetch,
  } = usePortalHome();

  // Données MLM (portefeuille et gains)
  const { wallet, stats, isLoading: isMlmLoading } = usePortalMlm();

  const displayName = user
    ? `${user.prenom ?? user.name?.split(' ')[0] ?? 'Partenaire'}`
    : 'Partenaire';

  if (error) {
    return (
      <PortalLayout>
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
            <AlertCircle size={26} className="text-red-600" />
          </div>
          <p className="text-center text-sm font-semibold text-primary">
            Impossible de charger vos données.
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-white transition-colors hover:bg-[#13294b]"
          >
            <RefreshCw size={14} /> Réessayer
          </button>
        </div>
      </PortalLayout>
    );
  }

  const isLoading = isHomeLoading || isMlmLoading;
  const hasLoyalty = client?.niveauFidelite != null;

  return (
    <PortalLayout>
      <div className="px-4 py-5">
        {/* Salutation */}
        <div className="mb-5">
          <h1 className="text-xl font-bold tracking-tight text-primary">
            Bonjour, {client?.prenom ?? displayName}
          </h1>
          <p className="mt-0.5 text-sm text-text-muted">
            Bienvenue sur votre espace partenaire EBN
          </p>
        </div>

        {/* Portefeuille MLM (focus principal) */}
        <div className="mb-5">
          {isMlmLoading ? (
            <Skeleton className="h-44 rounded-2xl" />
          ) : (
            <WalletCard
              solde={wallet?.soldeDisponible ?? 0}
              gainsTotaux={stats?.gainsTotaux ?? 0}
            />
          )}
        </div>

        {/* Fidélité : niveau + points */}
        {hasLoyalty && (
          <div className="mb-5">
            {isHomeLoading ? (
              <Skeleton className="h-32 rounded-2xl" />
            ) : (
              <PointsCard
                niveauFidelite={(client?.niveauFidelite ?? 'BRONZE') as never}
                pointsActuels={client?.pointsFidelite ?? 0}
                remisePct={client?.remisePct ?? 0}
                prochainNiveau={prochainNiveau}
                niveauxConfig={niveauxConfig}
              />
            )}
          </div>
        )}

        {/* Matricule & réseau */}
        <div className="mb-5">
          {isHomeLoading ? (
            <Skeleton className="h-28 rounded-2xl" />
          ) : client?.codeParrain ? (
            <ParrainCard
              codeParrain={client.codeParrain}
              nbFilleulsActifs={nbFilleulsActifs}
              nbFilleulsTotal={nbFilleulsTotal}
            />
          ) : null}
        </div>

        {/* Accès rapide */}
        <div className="mb-5">
          <SectionTitle>Accès rapide</SectionTitle>
          {isHomeLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-16 rounded-2xl" />
              <Skeleton className="h-16 rounded-2xl" />
              <Skeleton className="h-16 rounded-2xl" />
            </div>
          ) : (
            <QuickActionsGrid
              onNavigate={navigate}
              nbFilleulsActifs={nbFilleulsActifs}
            />
          )}
        </div>

        {/* Derniers achats */}
        <div>
          <SectionTitle>Derniers achats</SectionTitle>
          {isHomeLoading ? (
            <Skeleton className="h-40 rounded-2xl" />
          ) : (
            <RecentPurchasesMini
              achats={dernierAchats.slice(0, 3)}
              onViewAll={() => navigate('/portal/purchases')}
            />
          )}
        </div>
      </div>
    </PortalLayout>
  );
}
