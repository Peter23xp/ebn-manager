import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { formatUSD } from '@/lib/utils';
import type { TopParrain } from '@/hooks/useRegionalDashboard';

interface TopParrainsListProps {
  data: TopParrain[] | undefined;
  isLoading: boolean;
}

const rankStyle = (rang: number): string => {
  if (rang === 1) return 'bg-amber-100 text-amber-700';
  if (rang === 2) return 'bg-slate-200 text-slate-600';
  if (rang === 3) return 'bg-orange-200 text-orange-800';
  return 'bg-slate-100 text-text-muted';
};

function Avatar({ nom, prenom }: { nom: string; prenom: string }) {
  const ini = (prenom[0] + nom[0]).toUpperCase();
  return (
    <span
      className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold bg-primary-light text-primary-accent select-none"
      aria-hidden
    >
      {ini}
    </span>
  );
}

function formatReward(parrain: TopParrain): string {
  if (parrain.recompenseType === 'POINTS') return `${parrain.recompenseDue} pts`;
  if (parrain.recompenseType === 'REMISE') return `${parrain.recompenseDue}%`;
  return formatUSD(parrain.recompenseDue);
}

export function TopParrainsList({ data, isLoading }: TopParrainsListProps) {
  const navigate = useNavigate();

  return (
    <div className="rounded-xl shadow-card border border-border bg-white p-5 h-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-section-title text-primary">Top 5 Parrains</h2>
          <p className="text-xs text-text-muted mt-0.5">Ce mois</p>
        </div>
        <button
          type="button"
          className="text-[13px] font-semibold text-primary-accent hover:text-blue-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-accent rounded"
          onClick={() => navigate('/mlm/members')}
        >
          Voir tout →
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="skeleton w-7 h-7 rounded-full" />
              <div className="skeleton w-8 h-8 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <div className="skeleton h-3.5 w-28 rounded-full" />
                <div className="skeleton h-3 w-16 rounded-full" />
              </div>
              <div className="skeleton h-3.5 w-14 rounded-full" />
            </div>
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <p className="text-center text-text-muted text-sm py-8" role="status" aria-live="polite">
          Aucune donnée ce mois
        </p>
      ) : (
        <ol className="space-y-0.5">
          {data.map((parrain) => (
            <li key={parrain.clientId}>
              <button
                type="button"
                className={cn(
                  'flex w-full items-center gap-3 p-2 rounded-lg text-left transition-colors duration-100',
                  'hover:bg-blue-50/60',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-accent',
                )}
                onClick={() => navigate(`/parrainage/tree/${parrain.clientId}`)}
              >
                <span className={cn(
                  'w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0',
                  rankStyle(parrain.rang),
                )}>
                  {parrain.rang}
                </span>
                <Avatar nom={parrain.clientNom} prenom={parrain.clientPrenom} />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-text truncate">
                    {parrain.clientPrenom} {parrain.clientNom}
                  </p>
                  <p className="text-[11px] text-text-muted">{parrain.siteNom}</p>
                </div>
                <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                  <span className="text-[12px] font-bold text-text font-mono">
                    {parrain.nbFilleulsActives} filleuls
                  </span>
                  <span className="text-[11px] text-success">{formatReward(parrain)}</span>
                </div>
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
