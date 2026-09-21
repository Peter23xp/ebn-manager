import { useNavigate } from 'react-router-dom';
import { ArrowRight, ShoppingCart } from 'lucide-react';
import { formatUSD, formatRelative, initials, cn } from '@/lib/utils';
import type { Transaction } from '@/hooks/useDashboard';
import { DashboardPanel } from './DashboardPanel';

interface RecentTransactionsProps {
  data: Transaction[] | undefined;
  isLoading: boolean;
  canNavigate?: boolean;
  error?: boolean;
}

const statutStyle: Record<string, { cls: string; label: string }> = {
  VALIDE: { cls: 'bg-green-100 text-green-700', label: 'Validée' },
  RETOURNEE_PARTIELLE: { cls: 'bg-amber-100 text-amber-800', label: 'Retour partiel' },
  RETOURNEE: { cls: 'bg-red-100 text-red-700', label: 'Retournée' },
  ANNULEE: { cls: 'bg-slate-100 text-text-muted', label: 'Annulée' },
  EN_ATTENTE_PAIEMENT: { cls: 'bg-amber-100 text-amber-800', label: 'Paiement en attente' },
};

export function RecentTransactions({ data, isLoading, canNavigate = true, error }: RecentTransactionsProps) {
  const navigate = useNavigate();
  return (
    <DashboardPanel title="Transactions récentes" description="Les cinq dernières opérations de votre périmètre." isLoading={isLoading} error={error}
      action={canNavigate && <button type="button" className="dashboard-text-action" onClick={() => navigate('/sales')}>Voir tout <ArrowRight size={15} aria-hidden /></button>}>
      {!data?.length ? <div className="dashboard-empty" role="status"><ShoppingCart size={24} aria-hidden /><p>Aucune transaction récente</p></div> : (
        <ol className="dashboard-list">
          {data.slice(0, 5).map(transaction => {
            const Row = canNavigate ? 'button' : 'div';
            const status = statutStyle[transaction.statut] ?? { cls: 'bg-slate-100 text-text-muted', label: transaction.statut || 'Statut inconnu' };
            return <li key={transaction.id}>
              <Row type={canNavigate ? 'button' : undefined} className="dashboard-list-row" onClick={canNavigate ? () => navigate(`/sales/${transaction.id}`) : undefined}>
                <span className="dashboard-rank" aria-hidden>{initials(transaction.clientNom) || '?'}</span>
                <div className="min-w-0">
                  <p className="dashboard-list-name">{transaction.clientNom}</p>
                  <p className="dashboard-list-meta">{transaction.produit} · {transaction.site}</p>
                  <p className="dashboard-list-meta">{transaction.numeroVente} · {formatRelative(transaction.createdAt)}</p>
                </div>
                <div className="dashboard-list-value">
                  <span>{formatUSD(transaction.montant)}</span>
                  <span className={cn('dashboard-badge', status.cls)}>{status.label}</span>
                </div>
              </Row>
            </li>;
          })}
        </ol>
      )}
    </DashboardPanel>
  );
}
