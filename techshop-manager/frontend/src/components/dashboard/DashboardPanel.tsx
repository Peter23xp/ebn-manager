import { useId, type ReactNode } from 'react';

interface DashboardPanelProps {
  title: string;
  description?: string;
  action?: ReactNode;
  isLoading?: boolean;
  error?: boolean;
  children: ReactNode;
}

export function DashboardPanel({ title, description, action, isLoading = false, error, children }: DashboardPanelProps) {
  const headingId = useId();
  return (
    <section className="dashboard-panel" aria-labelledby={headingId} aria-busy={isLoading}>
      <div className="dashboard-panel-heading">
        <div className="min-w-0">
          <h2 id={headingId}>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        {action}
      </div>
      {isLoading ? (
        <div className="skeleton h-60 w-full rounded-lg" role="status" aria-label="Chargement des données" />
      ) : error ? (
        <p className="dashboard-empty text-red-700" role="alert">Ces données ne sont pas disponibles. Utilisez Actualiser pour réessayer.</p>
      ) : children}
    </section>
  );
}
