import { NavLink } from 'react-router-dom';
import { Home, ShoppingBag, Wallet, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

const TABS = [
  { to: '/portal/home',      icon: Home,        label: 'Accueil'  },
  { to: '/portal/purchases', icon: ShoppingBag, label: 'Achats'   },
  { to: '/portal/points',    icon: Wallet,      label: 'Gains'    },
  { to: '/portal/referrals', icon: Users,       label: 'Filleuls' },
];

export function PortalNav() {
  return (
    <nav
      className="flex items-stretch border-t border-neutral-200 bg-white flex-shrink-0"
      style={{ height: 60, paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {TABS.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            cn(
              'flex-1 flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors',
              isActive
                ? 'text-[#1E3A5F]'
                : 'text-neutral-400 hover:text-neutral-600',
            )
          }
        >
          {({ isActive }) => (
            <>
              <span
                className={cn(
                  'rounded-xl p-1.5',
                  isActive && 'bg-blue-50',
                )}
              >
                <Icon size={20} />
              </span>
              {label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
