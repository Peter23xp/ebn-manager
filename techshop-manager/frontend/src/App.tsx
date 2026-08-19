import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, Suspense, lazy } from 'react';
import { useUIStore } from '@/store/ui.store';
import { useAuthStore } from '@/store/auth.store';
import { AppLayout } from '@/components/layout/AppLayout';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { RoleGuard } from '@/components/layout/RoleGuard';
import { OfflineBanner } from '@/components/ui/OfflineBanner';

// ── Lazy page imports (code-splitting par route) ───────────────────
// Auth
const LoginPage           = lazy(() => import('@/pages/auth/LoginPage'));
const ResetPasswordPage   = lazy(() => import('@/pages/auth/ResetPasswordPage'));

// Dashboard
const DashboardPage         = lazy(() => import('@/pages/dashboard/DashboardPage'));
const DashboardRegionalPage = lazy(() => import('@/pages/dashboard/DashboardRegionalPage'));

// Clients
const ClientsListPage        = lazy(() => import('@/pages/clients/ClientsListPage'));
const ClientDetailPage       = lazy(() => import('@/pages/clients/ClientDetailPage'));
const OnboardingRecitPage    = lazy(() => import('@/pages/clients/OnboardingRecitPage'));
const OnboardingFormationPage = lazy(() => import('@/pages/clients/OnboardingFormationPage'));
const OnboardingFichePage    = lazy(() => import('@/pages/clients/OnboardingFichePage'));
const OnboardingActivationPage = lazy(() => import('@/pages/clients/OnboardingActivationPage'));
const ImportMatriculesPage   = lazy(() => import('@/pages/clients/ImportMatriculesPage'));
const OnboardingQueuePage    = lazy(() => import('@/pages/clients/OnboardingQueuePage'));
const PaiementsOnboardingPage = lazy(() => import('@/pages/clients/PaiementsOnboardingPage'));

// Ventes
const POSPage              = lazy(() => import('@/pages/ventes/POSPage'));
const VentesHistoriquePage = lazy(() => import('@/pages/ventes/VentesHistoriquePage'));
const VenteDetailPage      = lazy(() => import('@/pages/ventes/VenteDetailPage'));
const RecuPage             = lazy(() => import('@/pages/ventes/RecuPage'));
const RetoursPage          = lazy(() => import('@/pages/ventes/RetoursPage'));
const JournalRetoursPage   = lazy(() => import('@/pages/ventes/JournalRetoursPage'));
const AvoirDocumentPage    = lazy(() => import('@/pages/ventes/AvoirDocumentPage'));
const EcrituresOhadaPage   = lazy(() => import('@/pages/ventes/EcrituresOhadaPage'));

// Stocks
const InventairePage          = lazy(() => import('@/pages/stocks/InventairePage'));
const NouveauProduitPage      = lazy(() => import('@/pages/stocks/NouveauProduitPage'));
const ProduitStockPage        = lazy(() => import('@/pages/stocks/ProduitStockPage'));
const EntreeStockPage         = lazy(() => import('@/pages/stocks/EntreeStockPage'));
const TransfertPage           = lazy(() => import('@/pages/stocks/TransfertPage'));
const ReceptionTransfertPage  = lazy(() => import('@/pages/stocks/ReceptionTransfertPage'));
const AlertesStockPage        = lazy(() => import('@/pages/stocks/AlertesStockPage'));
const InventairePhysiquePage  = lazy(() => import('@/pages/stocks/InventairePhysiquePage'));

// MLM
const MlmDashboardPage   = lazy(() => import('@/pages/mlm/MlmDashboardPage'));
const MlmMembersPage     = lazy(() => import('@/pages/mlm/MlmMembersPage'));
const MemberProgressPage = lazy(() => import('@/pages/mlm/MemberProgressPage'));
const WalletPage         = lazy(() => import('@/pages/mlm/WalletPage'));
const MlmConfigPage      = lazy(() => import('@/pages/mlm/MlmConfigPage'));

// Rapports
const RapportsDashboardPage  = lazy(() => import('@/pages/rapports/RapportsDashboardPage'));
const RapportVentesPage      = lazy(() => import('@/pages/rapports/RapportVentesPage'));
const RapportStocksPage      = lazy(() => import('@/pages/rapports/RapportStocksPage'));
const ExportPage             = lazy(() => import('@/pages/rapports/ExportPage'));

// Portal Client
const PortalLoginPage   = lazy(() => import('@/pages/portal/PortalLoginPage'));
const PortalHomePage    = lazy(() => import('@/pages/portal/PortalHomePage'));
const PortalAchatsPage  = lazy(() => import('@/pages/portal/PortalAchatsPage'));
const PortalPointsPage  = lazy(() => import('@/pages/portal/PortalPointsPage'));
const PortalFilleulsPage = lazy(() => import('@/pages/portal/PortalFilleulsPage'));

// Support
const SupportPage       = lazy(() => import('@/pages/support/SupportPage'));

// Home
const HomePage          = lazy(() => import('@/pages/home/HomePage'));

// Parametres
const UsersPage         = lazy(() => import('@/pages/parametres/UsersPage'));
const SitesPage         = lazy(() => import('@/pages/parametres/SitesPage'));
const ProfilPage        = lazy(() => import('@/pages/parametres/ProfilPage'));
const ConfigGeneralePage = lazy(() => import('@/pages/parametres/ConfigGeneralePage'));

// ── Fallback de chargement ─────────────────────────────────────────
function PageLoader() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-accent border-t-transparent" />
    </div>
  );
}

export default function App() {
  const setOnline = useUIStore((s) => s.setOnline);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [setOnline]);

  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <OfflineBanner />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/portal/login" element={<PortalLoginPage />} />

          {/* Portal Client — role CLIENT — each page owns its own PortalLayout */}
          <Route path="/portal/home"      element={<AuthGuard><RoleGuard minRole="CLIENT"><PortalHomePage /></RoleGuard></AuthGuard>} />
          <Route path="/portal/purchases" element={<AuthGuard><RoleGuard minRole="CLIENT"><PortalAchatsPage /></RoleGuard></AuthGuard>} />
          <Route path="/portal/points"    element={<AuthGuard><RoleGuard minRole="CLIENT"><PortalPointsPage /></RoleGuard></AuthGuard>} />
          <Route path="/portal/referrals" element={<AuthGuard><RoleGuard minRole="CLIENT"><PortalFilleulsPage /></RoleGuard></AuthGuard>} />

          {/* App routes — role AGENT+ */}
          <Route element={<AuthGuard><RoleGuard minRole="AGENT"><AppLayout /></RoleGuard></AuthGuard>}>
            {/* Dashboard */}
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="dashboard/regional" element={<RoleGuard minRole="DIRECTEUR_REGIONAL"><DashboardRegionalPage /></RoleGuard>} />

            {/* Clients */}
            <Route path="clients" element={<ClientsListPage />} />
            <Route path="clients/new/recit" element={<OnboardingRecitPage />} />
            <Route path="clients/import" element={<RoleGuard minRole="GERANT"><ImportMatriculesPage /></RoleGuard>} />
            <Route path="clients/queue" element={<OnboardingQueuePage />} />
            <Route path="clients/paiements" element={<RoleGuard minRole="GERANT"><PaiementsOnboardingPage /></RoleGuard>} />
            <Route path="clients/:id" element={<ClientDetailPage />} />
            <Route path="clients/:id/formation" element={<RoleGuard minRole="FORMATEUR"><OnboardingFormationPage /></RoleGuard>} />
            <Route path="clients/:id/fiche" element={<OnboardingFichePage />} />
            <Route path="clients/:id/activate" element={<OnboardingActivationPage />} />

            {/* Ventes */}
            <Route path="sales/pos" element={<POSPage />} />
            <Route path="sales" element={<RoleGuard minRole="GERANT"><VentesHistoriquePage /></RoleGuard>} />
            <Route path="sales/returns" element={<RoleGuard minRole="GERANT"><RetoursPage /></RoleGuard>} />
            <Route path="sales/journal-retours" element={<RoleGuard minRole="GERANT"><JournalRetoursPage /></RoleGuard>} />
            <Route path="sales/retours/:retourId/avoir" element={<AvoirDocumentPage />} />
            <Route path="sales/retours/:retourId/ecritures" element={<RoleGuard minRole="GERANT"><EcrituresOhadaPage /></RoleGuard>} />
            <Route path="sales/:id" element={<RoleGuard minRole="GERANT"><VenteDetailPage /></RoleGuard>} />
            <Route path="sales/:id/receipt" element={<RecuPage />} />

            {/* Stocks */}
            <Route path="stocks" element={<InventairePage />} />
            <Route path="stocks/new" element={<RoleGuard minRole="GERANT"><NouveauProduitPage /></RoleGuard>} />
            <Route path="stocks/entry" element={<RoleGuard minRole="GERANT"><EntreeStockPage /></RoleGuard>} />
            <Route path="stocks/transfer" element={<RoleGuard minRole="GERANT"><TransfertPage /></RoleGuard>} />
            <Route path="stocks/alerts" element={<RoleGuard minRole="GERANT"><AlertesStockPage /></RoleGuard>} />
            <Route path="stocks/inventory" element={<RoleGuard minRole="GERANT"><InventairePhysiquePage /></RoleGuard>} />
            <Route path="stocks/transfer/:id/receive" element={<RoleGuard minRole="GERANT"><ReceptionTransfertPage /></RoleGuard>} />
            <Route path="stocks/:produitId" element={<RoleGuard minRole="GERANT"><ProduitStockPage /></RoleGuard>} />

            {/* MLM */}
            <Route path="mlm" element={<RoleGuard minRole="GERANT"><MlmDashboardPage /></RoleGuard>} />
            <Route path="mlm/members" element={<RoleGuard minRole="GERANT"><MlmMembersPage /></RoleGuard>} />
            <Route path="mlm/members/:id" element={<RoleGuard minRole="AGENT"><MemberProgressPage /></RoleGuard>} />
            <Route path="mlm/wallet" element={<RoleGuard minRole="AGENT"><WalletPage /></RoleGuard>} />
            <Route path="mlm/config" element={<RoleGuard minRole="SUPER_ADMIN"><MlmConfigPage /></RoleGuard>} />

            {/* Rapports */}
            <Route path="reports" element={<RoleGuard minRole="GERANT"><RapportsDashboardPage /></RoleGuard>} />
            <Route path="reports/sales" element={<RoleGuard minRole="DIRECTEUR_REGIONAL"><RapportVentesPage /></RoleGuard>} />
            <Route path="reports/stocks" element={<RoleGuard minRole="DIRECTEUR_REGIONAL"><RapportStocksPage /></RoleGuard>} />
            <Route path="reports/export" element={<RoleGuard minRole="GERANT"><ExportPage /></RoleGuard>} />

            {/* Support */}
            <Route path="support" element={<SupportPage />} />

            {/* Parametres */}
            <Route path="settings/users" element={<RoleGuard minRole="SUPER_ADMIN"><UsersPage /></RoleGuard>} />
            <Route path="settings/sites" element={<RoleGuard minRole="SUPER_ADMIN"><SitesPage /></RoleGuard>} />
            <Route path="settings/profile" element={<ProfilPage />} />
            <Route path="settings/general" element={<RoleGuard minRole="SUPER_ADMIN"><ConfigGeneralePage /></RoleGuard>} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
