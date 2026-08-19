import { useNavigate } from 'react-router-dom';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { PortalLayout } from '@/components/portal/PortalLayout';
import { PointsCard } from '@/components/portal/PointsCard';
import { ParrainCard } from '@/components/portal/ParrainCard';
import { QuickActionsGrid } from '@/components/portal/QuickActionsGrid';
import { RecentPurchasesMini } from '@/components/portal/RecentPurchasesMini';
import { usePortalHome } from '@/hooks/usePortalHome';
import { useAuthStore } from '@/store/auth.store';

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-2">
      {children}
    </p>
  );
}

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-neutral-200 ${className ?? ''}`} />;
}

export default function PortalHomePage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const {
    client, prochainNiveau, niveauxConfig,
    nbFilleulsActifs, nbFilleulsTotal,
    dernierAchats, isLoading, error, refetch,
  } = usePortalHome();

  const displayName = user
    ? `${user.prenom ?? user.name?.split(' ')[0] ?? 'Client'}`
    : 'Client';

  if (error) {
    return (
      <PortalLayout>
        <div className="flex flex-col items-center justify-center gap-4 min-h-[60vh] p-6">
          <AlertCircle size={36} className="text-red-500" />
          <p className="text-sm font-semibold text-center text-[#1E3A5F]">
            Impossible de charger vos données.
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="flex items-center gap-2 bg-[#1E3A5F] text-white rounded-xl px-4 h-10 text-sm font-semibold"
          >
            <RefreshCw size={14} /> Réessayer
          </button>
        </div>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout>
      <div className="px-4 py-5 space-y-5">

        {/* Greeting */}
        <div>
          <h1 className="text-xl font-bold text-[#1E3A5F]">
            Bonjour, {client?.prenom ?? displayName} 👋
          </h1>
          <p className="text-sm text-neutral-500">Bienvenue sur votre espace fidélité</p>
        </div>

        {/* Points card */}
        {isLoading ? (
          <Skeleton className="h-36" />
        ) : client ? (
          <PointsCard
            niveauFidelite={(client.niveauFidelite ?? 'BRONZE') as 'BRONZE' | 'ARGENT' | 'OR' | 'PLATINE'}
            pointsActuels={client.pointsFidelite ?? 0}
            remisePct={client.remisePct ?? 0}
            prochainNiveau={prochainNiveau}
            niveauxConfig={niveauxConfig}
          />
        ) : null}

        {/* Code parrain */}
        {isLoading ? (
          <Skeleton className="h-28" />
        ) : client?.codeParrain ? (
          <ParrainCard
            codeParrain={client.codeParrain}
            nbFilleulsActifs={nbFilleulsActifs}
            nbFilleulsTotal={nbFilleulsTotal}
          />
        ) : null}

        {/* Quick actions */}
        <div>
          <SectionTitle>Accès rapide</SectionTitle>
          {isLoading ? (
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="h-[72px]" />
              <Skeleton className="h-[72px]" />
              <Skeleton className="col-span-2 h-[72px]" />
            </div>
          ) : (
            <QuickActionsGrid
              onNavigate={navigate}
              nbFilleulsActifs={nbFilleulsActifs}
            />
          )}
        </div>

        {/* Recent purchases */}
        <div>
          <SectionTitle>Derniers achats</SectionTitle>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-5" />
              <Skeleton className="h-5" />
            </div>
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
