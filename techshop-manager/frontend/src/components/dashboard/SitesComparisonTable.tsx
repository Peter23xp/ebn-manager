import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, Building2, TrendingUp, TrendingDown } from 'lucide-react';
import { formatUSD, cn } from '@/lib/utils';
import { useUIStore } from '@/store/ui.store';
import type { ComparisonData } from '@/hooks/useRegionalDashboard';

interface SitesComparisonTableProps {
  data: ComparisonData | undefined;
  isLoading: boolean;
}

export function SitesComparisonTable({ data, isLoading }: SitesComparisonTableProps) {
  const navigate = useNavigate();
  const setSelectedSiteId = useUIStore(state => state.setSelectedSiteId);
  const handleSiteClick = (siteId: string) => {
    setSelectedSiteId(siteId);
    navigate('/dashboard');
  };

  return (
    <section className="min-w-0 rounded-xl border border-border bg-white" aria-label="Comparatif des sites" aria-busy={isLoading}>
      <div className="dashboard-panel-heading px-4 pt-4 sm:px-5 sm:pt-5">
        <div>
          <h2>Performance par site</h2>
          <p>Sélectionnez un site pour consulter son tableau de bord. Clients et stocks : situation actuelle.</p>
        </div>
      </div>
      <div className="overflow-x-auto rounded-b-xl" role="region" aria-label="Tableau des performances défilable" tabIndex={0}>
        <table className="dashboard-table" aria-label="Performance par site">
          <thead><tr>
            <th scope="col">Site</th><th scope="col">CA · USD</th><th scope="col">Variation</th>
            <th scope="col">Ventes</th><th scope="col">Clients actifs</th><th scope="col">Alertes</th>
          </tr></thead>
          <tbody>
            {isLoading ? Array.from({ length: 3 }, (_, rowIndex) => <tr key={rowIndex}>
              {Array.from({ length: 6 }, (_, columnIndex) => <td key={columnIndex}><div className="skeleton h-8 rounded" /></td>)}
            </tr>) : data?.sites.map(site => <tr key={site.siteId}>
              <th scope="row">
                <button type="button" className="flex min-h-11 w-full items-center justify-between gap-3 rounded text-left font-semibold text-blue-700" onClick={() => handleSiteClick(site.siteId)}>
                  <span>{site.siteNom}<span className="block text-xs font-normal text-text-muted">{site.siteVille}</span></span>
                  <ArrowUpRight size={16} className="shrink-0" aria-hidden />
                </button>
              </th>
              <td className="whitespace-nowrap font-semibold">{formatUSD(site.ca)}</td>
              <td><span className={cn('inline-flex items-center gap-1 whitespace-nowrap', site.caVariation > 0 ? 'text-success' : site.caVariation < 0 ? 'text-red-700' : 'text-text-muted')}>
                {site.caVariation > 0 ? <TrendingUp size={14} aria-hidden /> : site.caVariation < 0 ? <TrendingDown size={14} aria-hidden /> : null}
                {site.caVariation === 0 ? 'Stable' : `${site.caVariation > 0 ? '+' : ''}${site.caVariation} %`}
              </span></td>
              <td>{site.nbVentes.toLocaleString('fr')}</td><td>{site.nbClientsActifs.toLocaleString('fr')}</td>
              <td><span className={cn('dashboard-badge', site.alertesStock > 0 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-text-muted')}>{site.alertesStock}</span></td>
            </tr>)}
          </tbody>
          {!isLoading && !!data?.sites.length && <tfoot><tr>
            <th scope="row">Total du réseau</th><td className="whitespace-nowrap">{formatUSD(data.totaux.ca)}</td><td>—</td>
            <td>{data.totaux.nbVentes.toLocaleString('fr')}</td><td>{data.totaux.nbClientsActifs.toLocaleString('fr')}</td><td>{data.totaux.alertesStock}</td>
          </tr></tfoot>}
        </table>
      </div>
      {!isLoading && !data?.sites.length && <div className="dashboard-empty" role="status"><Building2 size={24} aria-hidden /><p>Aucun site à comparer</p></div>}
    </section>
  );
}
