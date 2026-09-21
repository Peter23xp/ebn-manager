import { useNavigate } from 'react-router-dom';
import { Package } from 'lucide-react';
import { formatUSD } from '@/lib/utils';
import type { TopProduct } from '@/hooks/useRegionalDashboard';
import { DashboardPanel } from './DashboardPanel';

interface TopProductsListProps {
  data: TopProduct[] | undefined;
  isLoading: boolean;
}

export function TopProductsList({ data, isLoading }: TopProductsListProps) {
  const navigate = useNavigate();
  return (
    <DashboardPanel title="Produits les plus vendus" description="Les cinq premiers produits sur la période sélectionnée." isLoading={isLoading}>
      {!data?.length ? <div className="dashboard-empty" role="status"><Package size={24} aria-hidden /><p>Aucune vente sur cette période</p></div> : (
        <ol className="dashboard-list">
          {data.map(product => <li key={product.produitId}>
            <button type="button" className="dashboard-list-row" onClick={() => navigate(`/stocks/${product.produitId}`)}>
              <span className="dashboard-rank" aria-label={`Rang ${product.rang}`}>{product.rang}</span>
              <div className="min-w-0">
                <p className="dashboard-list-name">{product.produitNom}</p>
                <p className="dashboard-list-meta">{product.sku} · {product.siteLeader}</p>
              </div>
              <div className="dashboard-list-value"><span>{product.quantiteVendue} unités</span><span className="text-xs font-normal text-text-muted">{formatUSD(product.caGenere)}</span></div>
            </button>
          </li>)}
        </ol>
      )}
    </DashboardPanel>
  );
}
