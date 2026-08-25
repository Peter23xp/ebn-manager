import { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  ShoppingCart,
  Receipt,
  Package,
  Network,
  Wallet,
  BarChart2,
  Settings,
  User,
  Building2,
  SlidersHorizontal,
  UserCog,
  LogOut,
  ChevronDown,
  Menu,
  X,
  Zap,
  Clock,
  CreditCard,
  RotateCcw,
  HelpCircle,
  Award,
  DollarSign,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { useUIStore } from '@/store/ui.store';
import { cn } from '@/lib/utils';
import { OfflineBanner } from '@/components/ui/OfflineBanner';
import type { Role } from '@/types';

interface NavItemDef {
  label: string;
  icon: React.ReactNode;
  to: string;
  minRole: Role;
}

interface NavGroupDef {
  label: string;
  icon: React.ReactNode;
  minRole: Role;
  children: NavItemDef[];
}

const NAV_ITEMS: NavItemDef[] = [
  { label: 'Dashboard',            icon: <LayoutDashboard size={16} />, to: '/dashboard',          minRole: 'AGENT' },
  { label: 'Clients',              icon: <Users size={16} />,           to: '/clients',            minRole: 'AGENT' },
  { label: 'File onboarding',      icon: <Clock size={16} />,           to: '/clients/queue',      minRole: 'AGENT' },
  { label: 'Paiements onboarding', icon: <CreditCard size={16} />,      to: '/clients/paiements',  minRole: 'GERANT' },
  { label: 'Caisse POS',           icon: <ShoppingCart size={16} />,    to: '/sales/pos',              minRole: 'AGENT' },
  { label: 'Ventes',               icon: <Receipt size={16} />,         to: '/sales',                  minRole: 'GERANT' },
  { label: 'Journal retours',      icon: <RotateCcw size={16} />,       to: '/sales/journal-retours',  minRole: 'GERANT' },
  { label: 'Stocks',               icon: <Package size={16} />,         to: '/stocks',             minRole: 'AGENT' },
  { label: 'Dashboard MLM',        icon: <Network size={16} />,       to: '/mlm',                minRole: 'GERANT' },
  { label: '8 Niveaux MLM',        icon: <Award size={16} />,         to: '/mlm/levels',         minRole: 'AGENT' },
  { label: 'Commissions',          icon: <DollarSign size={16} />,    to: '/mlm/commissions',    minRole: 'GERANT' },
  { label: 'Membres MLM',          icon: <Users size={16} />,         to: '/mlm/members',        minRole: 'GERANT' },
  { label: 'Mon Portefeuille',     icon: <Wallet size={16} />,        to: '/mlm/wallet',         minRole: 'AGENT' },
  { label: 'Rapports',             icon: <BarChart2 size={16} />,       to: '/reports',            minRole: 'GERANT' },
];

const SETTINGS_GROUP: NavGroupDef = {
  label: 'Paramètres',
  icon: <Settings size={16} />,
  minRole: 'AGENT',
  children: [
    { label: 'Utilisateurs', icon: <UserCog size={15} />,        to: '/settings/users',   minRole: 'SUPER_ADMIN' },
    { label: 'Sites',        icon: <Building2 size={15} />,      to: '/settings/sites',   minRole: 'SUPER_ADMIN' },
    { label: 'Profil',       icon: <User size={15} />,           to: '/settings/profile', minRole: 'AGENT' },
    { label: 'Config',       icon: <SlidersHorizontal size={15} />, to: '/settings/general', minRole: 'SUPER_ADMIN' },
  ],
};

// ── Nav section label ─────────────────────────────────────────────
function NavSection({ label }: { label: string }) {
  return (
    <p className="px-5 pt-5 pb-1.5 text-[10px] font-bold uppercase tracking-[0.12em]"
       style={{ color: '#94a3b8' }}>
      {label}
    </p>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────
function Sidebar({ onClose }: { onClose?: () => void }) {
  const { hasRole } = useAuthStore();
  const location = useLocation();
  const onSettingsPage = location.pathname.startsWith('/settings');
  const [settingsOpen, setSettingsOpen] = useState(onSettingsPage);

  // Ouvre/ferme auto selon la route active
  useEffect(() => {
    if (onSettingsPage) setSettingsOpen(true);
  }, [onSettingsPage]);

  const visibleItems = NAV_ITEMS.filter((item) => hasRole(item.minRole));
  const visibleSettingsChildren = SETTINGS_GROUP.children.filter((c) => hasRole(c.minRole));
  const showSettings = hasRole(SETTINGS_GROUP.minRole) && visibleSettingsChildren.length > 0;

  // Split nav into groups by to-path prefix
  const mainItems     = visibleItems.filter(i => i.to === '/dashboard');
  const clientItems   = visibleItems.filter(i => i.to.startsWith('/clients'));
  const opItems       = visibleItems.filter(i => ['/sales/pos', '/sales', '/sales/journal-retours', '/stocks'].includes(i.to));
  const mlmItems      = visibleItems.filter(i => i.to.startsWith('/mlm'));
  const businessItems = visibleItems.filter(i => ['/reports'].includes(i.to));

  return (
    <aside className="sidebar flex flex-col shadow-sidebar">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5" style={{ borderBottom: '1px solid #e2e8f0' }}>
        <img src="/assets/Progress business logo.png" alt="EBN Network" className="h-14 w-14 rounded-md object-contain flex-shrink-0" />
        <div className="flex flex-col leading-none">
          <span className="text-[13px] font-bold tracking-tight" style={{ color: '#0f172a' }}>EBN Network</span>
          <span className="text-[10px] font-medium" style={{ color: '#94a3b8' }}>Manager v1.0</span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="ml-auto flex h-7 w-7 items-center justify-center rounded-md transition-colors lg:hidden
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-accent"
            style={{ color: '#64748b' }}
            aria-label="Fermer le menu"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto no-scrollbar py-2" aria-label="Navigation principale">

        {mainItems.length > 0 && (
          <>
            <NavSection label="Vue d'ensemble" />
            <div className="space-y-0.5 px-2">
              {mainItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end
                  onClick={onClose}
                  className={({ isActive }) => cn('sidebar-link', isActive && 'active')}
                >
                  <span className="sidebar-icon">{item.icon}</span>
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          </>
        )}

        {clientItems.length > 0 && (
          <>
            <NavSection label="Clients" />
            <div className="space-y-0.5 px-2">
              {clientItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/clients'}
                  onClick={onClose}
                  className={({ isActive }) => cn('sidebar-link', isActive && 'active')}
                >
                  <span className="sidebar-icon">{item.icon}</span>
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          </>
        )}

        {opItems.length > 0 && (
          <>
            <NavSection label="Opérations" />
            <div className="space-y-0.5 px-2">
              {opItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={onClose}
                  className={({ isActive }) => cn('sidebar-link', isActive && 'active')}
                >
                  <span className="sidebar-icon">{item.icon}</span>
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          </>
        )}

        {mlmItems.length > 0 && (
          <>
            <NavSection label="Réseau MLM" />
            <div className="space-y-0.5 px-2">
              {mlmItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/mlm'}
                  onClick={onClose}
                  className={({ isActive }) => cn('sidebar-link', isActive && 'active')}
                >
                  <span className="sidebar-icon">{item.icon}</span>
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          </>
        )}

        {businessItems.length > 0 && (
          <>
            <NavSection label="Rapports" />
            <div className="space-y-0.5 px-2">
              {businessItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={onClose}
                  className={({ isActive }) => cn('sidebar-link', isActive && 'active')}
                >
                  <span className="sidebar-icon">{item.icon}</span>
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          </>
        )}

        {/* Settings group + Support */}
        {showSettings && (
          <>
            <NavSection label="Système" />
            <div className="px-2 space-y-0.5">
              <button
                type="button"
                onClick={() => setSettingsOpen((v) => !v)}
                className={cn(
                  'sidebar-link w-full justify-between',
                  settingsOpen && 'active',
                )}
                aria-expanded={settingsOpen}
              >
                <span className="flex items-center gap-3">
                  <span className="sidebar-icon">{SETTINGS_GROUP.icon}</span>
                  {SETTINGS_GROUP.label}
                </span>
                <ChevronDown
                  size={13}
                  className={cn('transition-transform duration-200', settingsOpen && 'rotate-180')}
                  style={{ color: '#94a3b8' }}
                />
              </button>

              {settingsOpen && (
                <div className="mt-0.5 ml-3 pl-3 space-y-0.5" style={{ borderLeft: '1px solid #e2e8f0' }}>
                  {visibleSettingsChildren.map((child) => (
                    <NavLink
                      key={child.to}
                      to={child.to}
                      onClick={onClose}
                      className={({ isActive }) =>
                        cn('sidebar-link text-[12px] py-1.5', isActive && 'active')
                      }
                    >
                      <span className="sidebar-icon">{child.icon}</span>
                      <span>{child.label}</span>
                    </NavLink>
                  ))}
                </div>
              )}
            </div>

            <NavLink
              to="/support"
              onClick={onClose}
              className={({ isActive }) => cn('sidebar-link', isActive && 'active')}
            >
              <span className="sidebar-icon"><HelpCircle size={16} /></span>
              <span>Support</span>
            </NavLink>
          </>
        )}
      </nav>
    </aside>
  );
}

// ── Header ────────────────────────────────────────────────────────
function Header({ onMenuClick }: { onMenuClick: () => void }) {
  const { user, logout } = useAuthStore();
  const { selectedSiteId } = useUIStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const siteName = user?.siteName ?? (selectedSiteId ? `Site ${selectedSiteId}` : null);
  const initials = user?.name?.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase() ?? '';

  return (
    <header className="flex h-14 items-center justify-between gap-4 bg-white border-b border-border px-5 flex-shrink-0">
      {/* Left */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onMenuClick}
          type="button"
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-border
                     text-text-muted hover:border-primary-accent hover:text-primary-accent
                     transition-colors duration-150 lg:hidden
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-accent"
          aria-label="Ouvrir le menu"
        >
          <Menu size={16} />
        </button>

        {siteName && (
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary-light flex-shrink-0">
              <Building2 size={12} className="text-primary-accent" aria-hidden />
            </div>
            <span className="text-sm font-semibold text-text truncate">{siteName}</span>
          </div>
        )}
      </div>

      {/* Right */}
      <div className="flex items-center gap-3 flex-shrink-0">
        {user && (
          <div className="hidden sm:flex flex-col items-end leading-none gap-0.5">
            <span className="text-[13px] font-semibold text-text">{user.name}</span>
            <span className="text-[11px] text-text-muted capitalize">
              {user.role.replace(/_/g, ' ').toLowerCase()}
            </span>
          </div>
        )}

        {user && (
          <div
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full
                       bg-primary-accent text-white font-bold text-[11px] select-none"
            aria-hidden
          >
            {initials}
          </div>
        )}

        <NavLink
          to="/support"
          className={({ isActive }) => cn(
            'flex h-8 w-8 items-center justify-center rounded-lg border border-border text-text-muted transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-accent',
            isActive ? 'border-primary-accent text-primary-accent bg-primary-light/30' : 'hover:border-primary-accent hover:text-primary-accent hover:bg-primary-light/20',
          )}
          title="Support technique"
          aria-label="Support technique"
        >
          <HelpCircle size={15} aria-hidden />
        </NavLink>

        <button
          type="button"
          onClick={handleLogout}
          className="flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-[13px]
                     font-medium text-text-muted
                     hover:border-danger hover:text-danger hover:bg-red-50
                     transition-colors duration-150
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger"
          title="Se déconnecter"
        >
          <LogOut size={14} aria-hidden />
          <span className="hidden sm:inline">Déconnexion</span>
        </button>
      </div>
    </header>
  );
}

// ── AppLayout ─────────────────────────────────────────────────────
export function AppLayout() {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  return (
    <>
      <OfflineBanner />

      <div className="flex overflow-hidden bg-bg" style={{ height: '100dvh' }}>
        {/* Desktop sidebar */}
        <div className="hidden lg:flex lg:flex-shrink-0">
          <Sidebar />
        </div>

        {/* Mobile sidebar overlay */}
        {mobileSidebarOpen && (
          <>
            <div
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
              onClick={() => setMobileSidebarOpen(false)}
              aria-hidden="true"
            />
            <div className="fixed inset-y-0 left-0 z-50 animate-slide-in-left lg:hidden">
              <Sidebar onClose={() => setMobileSidebarOpen(false)} />
            </div>
          </>
        )}

        {/* Main content area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Notch/status-bar filler — same white as header */}
          <div className="flex-shrink-0 bg-white" style={{ height: 'env(safe-area-inset-top, 0px)' }} />
          <Header onMenuClick={() => setMobileSidebarOpen(true)} />
          <main className="flex-1 overflow-y-auto p-5 sm:p-7 bg-bg"
            style={{ paddingBottom: 'max(1.75rem, env(safe-area-inset-bottom, 0px))' }}
          >
            <Outlet />
          </main>
          {/* Home-bar filler — same color as page background */}
          <div className="flex-shrink-0 bg-bg" style={{ height: 'env(safe-area-inset-bottom, 0px)' }} />
        </div>
      </div>
    </>
  );
}
