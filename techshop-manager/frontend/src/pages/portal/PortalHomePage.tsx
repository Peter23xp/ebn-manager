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

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-neutral-400 mb-3">
      {children}
    </p>
  );
}

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-neutral-200 ${className ?? ''}`} />;
}

export default function PortalHomePage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  
  // Données E-commerce & Fidélité classiques
  const {
    client, prochainNiveau, niveauxConfig,
    nbFilleulsActifs, nbFilleulsTotal,
    dernierAchats, isLoading: isHomeLoading, error, refetch,
  } = usePortalHome();

  // Données MLM (Portefeuille et gains)
  const { wallet, stats, isLoading: isMlmLoading } = usePortalMlm();

  const displayName = user
    ? `${user.prenom ?? user.name?.split(' ')[0] ?? 'Partenaire'}`
    : 'Partenaire';

  if (error) {
    return (
      <PortalLayout>
        <div className="flex flex-col items-center justify-center gap-4 min-h-[60vh] p-6">
          <AlertCircle size={36} className="text-red-500" />
          <p className="text-sm font-semibold text-center text-[#0A1628]">
            Impossible de charger vos données.
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="flex items-center gap-2 bg-[#0A1628] text-white rounded-xl px-4 h-10 text-sm font-semibold"
          >
            <RefreshCw size={14} /> Réessayer
          </button>
        </div>
      </PortalLayout>
    );
  }

  const isLoading = isHomeLoading || isMlmLoading;

  return (
    <PortalLayout>
      <div className="px-4 py-6 space-y-6">

        {/* Greeting */}
        <div>
          <h1 className="text-2xl font-bold text-[#0A1628] tracking-tight">
            Bonjour, {client?.prenom ?? displayName} 👋
          </h1>
          <p className="text-sm text-neutral-500 mt-1">Bienvenue sur votre espace partenaire EBN</p>
        </div>

        {/* Wallet MLM (Primary Focus) */}
        <div>
          {isMlmLoading ? (
            <Skeleton className="h-40" />
          ) : (
            <WalletCard 
              solde={wallet?.soldeDisponible ?? 0} 
              gainsTotaux={stats?.gainsTotaux ?? 0} 
            />
          )}
        </div>



        {/* Code parrain & Réseau */}
        <div>
          {isHomeLoading ? (
            <Skeleton className="h-28" />
          ) : client?.codeParrain ? (
            <ParrainCard
              codeParrain={client.codeParrain}
              nbFilleulsActifs={nbFilleulsActifs}
              nbFilleulsTotal={nbFilleulsTotal}
            />
          ) : null}
        </div>

        {/* Quick actions */}
        <div>
          <SectionTitle>Accès rapide</SectionTitle>
          {isHomeLoading ? (
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
          {isHomeLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
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
