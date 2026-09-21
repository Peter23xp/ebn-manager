import { useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BarChart2, ShoppingCart, Package, Download, Users, Building2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

export interface ReportNavigationProps {
  active: 'overview' | 'sales' | 'stocks' | 'export';
  overviewUrl?: string;
  salesUrl?: string;
  stocksUrl?: string;
  exportUrl?: string;
}

export function ReportNavigation({ active, overviewUrl = '/reports', salesUrl = '/reports/sales', stocksUrl = '/reports/stocks', exportUrl = '/reports/export' }: ReportNavigationProps) {
  const { hasRole } = useAuth();
  const navigate = useNavigate();
  const regional = hasRole('DIRECTEUR_REGIONAL');
  const navigationRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const navigation = navigationRef.current;
    const current = navigation?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!navigation || !current || navigation.scrollWidth <= navigation.clientWidth) return;
    navigation.scrollLeft += current.getBoundingClientRect().left - navigation.getBoundingClientRect().left - 12;
  }, [active, regional]);
  return (
    <nav ref={navigationRef} aria-label="Rapports disponibles" className="report-navigation">
      <Link to={overviewUrl} aria-current={active === 'overview' ? 'page' : undefined}><BarChart2 size={16} aria-hidden="true" />Vue d’ensemble</Link>
      {regional && <Link to={salesUrl} aria-current={active === 'sales' ? 'page' : undefined}><ShoppingCart size={16} aria-hidden="true" />Ventes détaillées</Link>}
      {regional && <Link to={stocksUrl} aria-current={active === 'stocks' ? 'page' : undefined}><Package size={16} aria-hidden="true" />Stocks et inventaire</Link>}
      <Link to={exportUrl} aria-current={active === 'export' ? 'page' : undefined}><Download size={16} aria-hidden="true" />Exports</Link>
      <Link to="/clients"><Users size={16} aria-hidden="true" />Liste des clients</Link>
      {regional && <button type="button" onClick={() => navigate('/dashboard/regional')} className="xl:ml-auto"><Building2 size={16} aria-hidden="true" />Vue régionale</button>}
    </nav>
  );
}
