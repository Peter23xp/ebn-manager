import { useNavigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { formatUSD } from '@/lib/utils';
import type { SiteCA } from '@/lib/reports.api';

interface SitesSummaryTableProps {
  data: SiteCA[];
  isLoading: boolean;
  /** When true, hides the TOTAL row (single-site view for GERANT) */
  hideTotalRow?: boolean;
}

export function SitesSummaryTable({ data, isLoading, hideTotalRow = false }: SitesSummaryTableProps) {
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="table-container">
        <table className="report-table w-full text-sm" aria-label="Synthèse des sites en cours de chargement">
          <thead>
            <tr>
              {['Site', 'CA ($)', 'Ventes', 'Nvx clients', 'Alertes'].map((h) => (
                <th key={h} scope="col" className="px-4 py-3 text-text-muted">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...Array(hideTotalRow ? 1 : 4)].map((_, i) => (
              <tr key={i} className="border-b border-border/60">
                {[...Array(5)].map((_, j) => (
                  <td key={j} className="px-4 py-3">
                    <div className="skeleton h-4 rounded" style={{ width: j === 0 ? '80px' : '60px' }} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="table-container">
        <div className="text-center text-sm text-text-muted py-8">
          Aucune donnée sur la période sélectionnée
        </div>
      </div>
    );
  }

  const totalCA      = data.reduce((s, r) => s + r.ca, 0);
  const totalVentes  = data.reduce((s, r) => s + r.nbVentes, 0);
  const totalClients = data.reduce((s, r) => s + r.nbNouveauxClients, 0);
  const totalAlertes = data.reduce((s, r) => s + r.alertesStock, 0);

  return (
    <div className="table-container focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-accent" role="region" aria-label="Résumé des sites, tableau défilant" tabIndex={0}>
      <table className="report-table w-full text-sm" aria-label="Résultats par site">
        <thead>
          <tr>
            {['Site', 'CA (USD)', 'Ventes', 'Nouveaux clients', 'Alertes stock'].map((h) => (
              <th
                key={h}
                scope="col"
                className="px-4 py-3 text-text-muted"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr
              key={row.siteId}
              className="border-b border-border/60 transition-colors hover:bg-blue-50/50"
            >
              <td className="px-4 py-3 font-semibold text-primary">
                <button
                  type="button"
                  onClick={() => navigate('/dashboard', { state: { siteId: row.siteId } })}
                  aria-label={`Tableau de bord de ${row.siteNom}`}
                  className="text-left hover:underline text-primary font-semibold"
                >
                  {row.siteNom}
                </button>
              </td>
              <td className="px-4 py-3 font-semibold text-primary tabular-nums">{formatUSD(row.ca)}</td>
              <td className="px-4 py-3 text-text tabular-nums">{row.nbVentes}</td>
              <td className="px-4 py-3 text-text tabular-nums">{row.nbNouveauxClients}</td>
              <td className="px-4 py-3">
                {row.alertesStock > 0 ? (
                  <span className="badge-danger inline-flex items-center gap-1">
                    <AlertTriangle size={10} />
                    {row.alertesStock}
                  </span>
                ) : (
                  <span className="text-success font-semibold">0</span>
                )}
              </td>
            </tr>
          ))}

          {!hideTotalRow && (
            <tr className="border-t border-border-strong bg-slate-50">
              <td className="px-4 py-3 font-bold text-primary">TOTAL</td>
              <td className="px-4 py-3 font-bold text-primary tabular-nums">{formatUSD(totalCA)}</td>
              <td className="px-4 py-3 font-bold text-text tabular-nums">{totalVentes}</td>
              <td className="px-4 py-3 font-bold text-text tabular-nums">{totalClients}</td>
              <td className="px-4 py-3">
                {totalAlertes > 0 ? (
                  <span className="badge-danger inline-flex items-center gap-1">
                    <AlertTriangle size={10} />
                    {totalAlertes}
                  </span>
                ) : (
                  <span className="text-success font-semibold">0</span>
                )}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
