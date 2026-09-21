import { useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSites } from '@/hooks/useSites';
import { useAuthStore } from '@/store/auth.store';

interface Props {
  value: string;
  onChange: (siteId: string) => void;
  disabled?: boolean;
}

function RegionalSites({ value, onChange, disabled }: Props) {
  const { sites, isLoading } = useSites();
  const queryClient = useQueryClient();
  const state = useSyncExternalStore(
    notify => queryClient.getQueryCache().subscribe(notify),
    () => queryClient.getQueryState(['sites']),
  );
  return (
    <div className="min-w-0 space-y-1">
      <label className="block text-sm font-medium" htmlFor="report-site">Site</label>
      <select id="report-site" value={value} onChange={event => onChange(event.target.value)} disabled={disabled || isLoading}
        className="min-h-11 max-w-full rounded-lg border border-border bg-white px-3 text-sm focus-visible:ring-2 focus-visible:ring-primary">
        <option value="">{isLoading ? 'Chargement des sites…' : 'Tous les sites'}</option>
        {value && !sites.some(site => site.id === value) && <option value={value}>Site sélectionné ({value})</option>}
        {sites.map(site => <option key={site.id} value={site.id}>{site.nom}</option>)}
      </select>
      {state?.error && <p role="alert" className="text-sm text-danger">
        Impossible de charger les sites. <button type="button" className="min-h-11 underline" onClick={() => void queryClient.refetchQueries({ queryKey: ['sites'], exact: true })}>Réessayer les sites</button>
      </p>}
    </div>
  );
}

export function ReportSiteFilter(props: Props) {
  const user = useAuthStore(state => state.user);
  if (user?.role === 'GERANT') {
    return <div className="space-y-1 text-sm"><p className="font-medium">Site</p><p>{user.site?.nom ?? user.siteName ?? user.siteId}</p><p className="text-text-muted">Votre site uniquement</p></div>;
  }
  return <RegionalSites {...props} />;
}
