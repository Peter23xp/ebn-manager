import { useNavigate } from 'react-router-dom';
import { Package, CheckCircle, ArrowRight } from 'lucide-react';
import type { StockAlert } from '@/hooks/useDashboard';
import { DashboardPanel } from './DashboardPanel';

interface StockAlertsProps {
  data: StockAlert[] | undefined;
  isLoading: boolean;
  canManage?: boolean;
  error?: boolean;
}

export function StockAlerts({ data, isLoading, canManage = true, error }: StockAlertsProps) {
  const navigate = useNavigate();
  return (
    <DashboardPanel title="Alertes stock" description="Les produits à surveiller en priorité." isLoading={isLoading} error={error}
      action={canManage && <button type="button" className="dashboard-text-action" onClick={() => navigate('/stocks/alerts')}>Gérer <ArrowRight size={15} aria-hidden /></button>}>
      {!data?.length ? <div className="dashboard-empty" role="status"><CheckCircle size={24} className="text-success" aria-hidden /><p>Tous les stocks sont suffisants</p><p className="text-xs">Aucune alerte à traiter pour le moment.</p></div> : (
        <ol className="dashboard-list">
          {data.slice(0, 3).map((alert, index) => <li key={`${alert.sku}-${alert.siteNom}-${index}`}>
            <button type="button" className="dashboard-list-row" onClick={() => navigate(`/stocks?alert=${encodeURIComponent(alert.sku)}`)}>
              <span className="dashboard-rank"><Package size={18} aria-hidden /></span>
              <div className="min-w-0">
                <p className="dashboard-list-name">{alert.produitNom}</p>
                <p className="dashboard-list-meta">{alert.siteNom} · {alert.sku}</p>
                <p className="dashboard-list-meta">Stock : {alert.stockActuel} · Seuil : {alert.seuilAlerte}</p>
              </div>
              <div className="dashboard-list-value">
                <span className={`dashboard-badge ${alert.type === 'RUPTURE' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>{alert.type === 'RUPTURE' ? 'Rupture' : 'Stock faible'}</span>
              </div>
            </button>
          </li>)}
        </ol>
      )}
    </DashboardPanel>
  );
}
