import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bell, Landmark, Gift, UserPlus, CheckCircle2 } from 'lucide-react';
import { MlmApi } from '@/lib/mlm.api';
import { useAuthStore } from '@/store/auth.store';
import { cn } from '@/lib/utils';

/**
 * Cloche de notifications du back-office (GERANT+) : actions en attente
 * (retraits à approuver, bonus physiques à livrer, réclamations de filleuls).
 * Rafraîchie automatiquement toutes les 60 s et à chaque focus de fenêtre.
 */
export function NotificationBell() {
  const navigate = useNavigate();
  const hasRole = useAuthStore((s) => s.hasRole);
  const [open, setOpen] = useState(false);
  const visible = hasRole('GERANT');

  const { data, isLoading } = useQuery({
    queryKey: ['mlm-notifications-counts'],
    queryFn: () => MlmApi.getNotificationCounts(),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    enabled: visible,
  });

  if (!visible) return null;

  const items = [
    {
      key: 'retraits',
      label: 'Retraits à approuver',
      count: data?.retraitsEnAttente ?? 0,
      to: '/mlm/withdrawal-requests',
      icon: <Landmark size={14} className="text-[#2E86C1]" />,
    },
    {
      key: 'bonus',
      label: 'Bonus physiques à livrer',
      count: data?.bonusALivrer ?? 0,
      to: '/mlm/bonuses',
      icon: <Gift size={14} className="text-warning" />,
    },
    {
      key: 'claims',
      label: 'Réclamations de filleuls',
      count: data?.reclamationsEnAttente ?? 0,
      to: '/mlm/claims',
      icon: <UserPlus size={14} className="text-success" />,
    },
  ];
  const total = items.reduce((s, i) => s + i.count, 0);

  const go = (to: string) => {
    setOpen(false);
    navigate(to);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={total > 0 ? `Notifications — ${total} en attente` : 'Notifications — aucune en attente'}
        aria-expanded={open}
        className={cn(
          'relative flex h-8 w-8 items-center justify-center rounded-lg border border-border text-text-muted transition-colors duration-150',
          open
            ? 'border-primary-accent text-primary-accent bg-primary-light/30'
            : 'hover:border-primary-accent hover:text-primary-accent hover:bg-primary-light/20',
        )}
      >
        <Bell size={15} aria-hidden />
        {total > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[17px] h-[17px] flex items-center justify-center rounded-full bg-danger text-white text-[9px] font-bold px-1 tabular-nums">
            {total > 99 ? '99+' : total}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Fermeture au clic ailleurs */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-0 top-10 z-50 w-72 rounded-xl border border-border bg-white shadow-2xl overflow-hidden">
            <p className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.12em] text-text-muted border-b border-border bg-bg/60">
              Actions en attente
            </p>
            {isLoading ? (
              <div className="p-4 space-y-2">
                <div className="skeleton h-8 rounded" />
                <div className="skeleton h-8 rounded" />
              </div>
            ) : total === 0 ? (
              <div className="flex flex-col items-center gap-1.5 py-6 text-text-muted">
                <CheckCircle2 size={22} className="text-success" />
                <p className="text-xs font-medium">Tout est à jour — rien à traiter.</p>
              </div>
            ) : (
              <ul>
                {items.filter((i) => i.count > 0).map((i) => (
                  <li key={i.key}>
                    <button
                      type="button"
                      onClick={() => go(i.to)}
                      className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left hover:bg-blue-50/60 transition-colors"
                    >
                      <span className="flex items-center gap-2 text-[13px] font-medium text-text">
                        {i.icon}
                        {i.label}
                      </span>
                      <span className="min-w-[22px] h-[22px] flex items-center justify-center rounded-full bg-primary-light text-primary-accent text-[11px] font-bold tabular-nums">
                        {i.count}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
