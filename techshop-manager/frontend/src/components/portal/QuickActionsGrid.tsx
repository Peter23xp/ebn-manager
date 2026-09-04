import { ShoppingBag, Star, Users, ChevronRight } from 'lucide-react';

interface QuickActionsGridProps {
  onNavigate: (route: string) => void;
  nbFilleulsActifs: number;
}

/**
 * Liste d'actions primaires : une action = une ligne pleine largeur.
 * Lisible sous pression, cibles 44px+, hiérarchie unique (pas de carrousel coloré).
 */
export function QuickActionsGrid({ onNavigate, nbFilleulsActifs }: QuickActionsGridProps) {
  const actions = [
    { to: '/portal/purchases', icon: ShoppingBag, label: 'Mes achats', hint: 'Suivi de vos commandes' },
    { to: '/portal/points',    icon: Star,        label: 'Mes points', hint: 'Fidélité et remises' },
    { to: '/portal/referrals', icon: Users,       label: 'Mes filleuls', hint: `${nbFilleulsActifs} filleul${nbFilleulsActifs !== 1 ? 's' : ''} actif${nbFilleulsActifs !== 1 ? 's' : ''}`, ariaLabel: `Mes filleuls — ${nbFilleulsActifs} actifs` },
  ];

  return (
    <div className="divide-y divide-border rounded-2xl border border-border bg-bg-card shadow-card overflow-hidden">
      {actions.map(({ to, icon: Icon, label, hint, ariaLabel }) => (
        <button
          key={to}
          type="button"
          onClick={() => onNavigate(to)}
          className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-blue-50/50 active:bg-blue-50"
          aria-label={ariaLabel ?? label}
        >
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-primary/5 text-primary">
            <Icon size={17} />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-semibold text-text">{label}</span>
            <span className="block text-xs text-text-subtle">{hint}</span>
          </span>
          <ChevronRight size={16} className="flex-shrink-0 text-text-subtle" />
        </button>
      ))}
    </div>
  );
}
