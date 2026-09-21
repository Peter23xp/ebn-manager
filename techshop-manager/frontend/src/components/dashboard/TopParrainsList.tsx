import { useNavigate } from 'react-router-dom';
import { ArrowRight, Users } from 'lucide-react';
import { formatUSD } from '@/lib/utils';
import type { TopParrain } from '@/hooks/useRegionalDashboard';
import { DashboardPanel } from './DashboardPanel';

interface TopParrainsListProps {
  data: TopParrain[] | undefined;
  isLoading: boolean;
}

function formatReward(parrain: TopParrain): string {
  if (parrain.recompenseType === 'POINTS') return `${parrain.recompenseDue} pts`;
  if (parrain.recompenseType === 'REMISE') return `${parrain.recompenseDue}%`;
  return formatUSD(parrain.recompenseDue);
}

export function TopParrainsList({ data, isLoading }: TopParrainsListProps) {
  const navigate = useNavigate();
  return (
    <DashboardPanel title="Parrains les plus actifs" description="Filleuls activés et récompenses associées · Ce mois." isLoading={isLoading}
      action={<button type="button" className="dashboard-text-action" onClick={() => navigate('/mlm/members')}>Voir tout <ArrowRight size={15} aria-hidden /></button>}>
      {!data?.length ? <div className="dashboard-empty" role="status"><Users size={24} aria-hidden /><p>Aucun parrain à afficher</p><p className="text-xs">Aucun classement n’est disponible pour le moment.</p></div> : (
        <ol className="dashboard-list">
          {data.map(parrain => <li key={parrain.clientId}>
            <button type="button" className="dashboard-list-row" onClick={() => navigate(`/parrainage/tree/${parrain.clientId}`)}>
              <span className="dashboard-rank" aria-label={`Rang ${parrain.rang}`}>{parrain.rang}</span>
              <div className="min-w-0">
                <p className="dashboard-list-name">{parrain.clientPrenom} {parrain.clientNom}</p>
                <p className="dashboard-list-meta">{parrain.siteNom}</p>
              </div>
              <div className="dashboard-list-value"><span>{parrain.nbFilleulsActives} filleuls</span><span className="text-xs font-normal text-text-muted">{formatReward(parrain)}</span></div>
            </button>
          </li>)}
        </ol>
      )}
    </DashboardPanel>
  );
}
