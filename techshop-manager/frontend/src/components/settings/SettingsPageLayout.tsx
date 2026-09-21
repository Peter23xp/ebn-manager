import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Building2, Users, UserRound, Settings } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import './settings.css';

const destinations = [
  { id: 'sites', label: 'Sites', path: '/settings/sites', icon: Building2, admin: true },
  { id: 'users', label: 'Utilisateurs', path: '/settings/users', icon: Users, admin: true },
  { id: 'profile', label: 'Mon profil', path: '/settings/profile', icon: UserRound, admin: false },
  { id: 'general', label: 'Configuration', path: '/settings/general', icon: Settings, admin: true },
] as const;

export function SettingsPageLayout({ active, title, description, action, children }: {
  active: 'sites' | 'users' | 'profile' | 'general';
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const administrator = useAuthStore((state) => state.user?.role === 'SUPER_ADMIN');
  return (
    <div className="settings-page">
      <header className="settings-page-header">
        <div className="min-w-0">
          <h1 className="text-page-title text-primary">{title}</h1>
          <p className="settings-description mt-1">{description}</p>
        </div>
        {action && <div className="settings-header-actions">{action}</div>}
      </header>
      <nav className="settings-navigation" aria-label="Paramètres">
        {destinations.filter((destination) => administrator || !destination.admin).map(({ id, path, label, icon: Icon }) => (
          <Link key={id} to={path} aria-current={active === id ? 'page' : undefined}>
            <Icon size={16} aria-hidden="true" />{label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}

export function SettingsSummary({ label, loading, items, note }: {
  label: string;
  loading: boolean;
  items: { label: string; value: number | undefined }[];
  note?: string;
}) {
  return (
    <section aria-label={label} aria-busy={loading} className="settings-summary">
      <dl>{items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{loading ? <span className="skeleton inline-block h-6 w-16" aria-label="Chargement" /> : item.value === undefined ? <span className="text-sm font-normal text-text-muted">Non disponible</span> : item.value.toLocaleString('fr-CD')}</dd>
        </div>
      ))}</dl>
      {note && <p className="settings-description px-4 pb-3">{note}</p>}
    </section>
  );
}
