import { NavLink } from 'react-router-dom';
import { Home, ShoppingBag, DollarSign, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

const TABS = [
  { to: '/portal/home',        icon: Home,        label: 'Accueil'     },
  { to: '/portal/purchases',   icon: ShoppingBag, label: 'Achats'      },
  { to: '/portal/commissions', icon: DollarSign,  label: 'Commissions' },
  { to: '/portal/referrals',   icon: Users,       label: 'Filleuls'    },
];

export function PortalNav() {
  return (
    <nav
      className="flex items-stretch border-t border-border bg-white flex-shrink-0"
      style={{ height: 64, paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {TABS.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            cn(
              'relative flex-1 flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors duration-150',
              isActive
                ? 'text-[#0A1628]'
                : 'text-text-subtle hover:text-text-muted',
            )
          }
        >
          {({ isActive }) => (
            <>
              {/* Point d'ancrage de l'onglet actif, au-dessus de l'icône */}
              <span
                aria-hidden
                className={cn(
                  'absolute top-0 h-0.5 w-8 rounded-full bg-[#b45309] transition-opacity duration-200',
                  isActive ? 'opacity-100' : 'opacity-0',
                )}
              />
              <Icon size={20} strokeWidth={isActive ? 2.2 : 1.8} />
              <span className={cn(isActive && 'font-semibold')}>{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
