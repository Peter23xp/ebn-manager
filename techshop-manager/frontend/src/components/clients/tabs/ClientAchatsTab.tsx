import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingBag } from 'lucide-react';
import { cn, formatUSD, formatDate } from '@/lib/utils';
import type { ClientDetail } from '@/lib/clients.api';

interface ClientAchatsTabProps {
  client: ClientDetail;
}

type Periode = 'mois' | 'trimestre' | 'tout';

const PERIODE_LABEL: Record<Periode, string> = {
  mois:      'Ce mois',
  trimestre: '3 derniers mois',
  tout:      'Tout',
};

const MODE_LABEL: Record<string, string> = {
  CASH:         'Cash',
  MPESA:        'M-Pesa',
  AIRTEL_MONEY: 'Airtel Money',
  VIREMENT:     'Virement',
};

const STATUT_LABEL: Record<string, { label: string; classes: string }> = {
  VALIDE:              { label: 'Validée',        classes: 'bg-green-100 text-success' },
  RETOURNEE_PARTIELLE: { label: 'Ret. partielle', classes: 'bg-amber-100 text-warning' },
  RETOURNEE:           { label: 'Retournée',      classes: 'bg-red-100 text-danger' },
  ANNULEE:             { label: 'Annulée',        classes: 'bg-slate-100 text-slate-500' },
};

export function ClientAchatsTab({ client }: ClientAchatsTabProps) {
  const [periode, setPeriode] = useState<Periode>('mois');

  const now = new Date();
  const filtered = (client.ventes ?? []).filter((v) => {
    const d = new Date(v.createdAt);
    if (periode === 'mois') {
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }
    if (periode === 'trimestre') {
      const diff = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
      return diff < 3;
    }
    return true;
  });

  const totalDepense = filtered.reduce((s, v) => s + v.montantNet, 0);

  return (
    <div className="space-y-4">

      {/* Filtre période */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="period-toggle" role="group" aria-label="Période">
          {(['mois', 'trimestre', 'tout'] as Periode[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriode(p)}
              className={cn('period-btn', periode === p && 'active')}
            >
              {PERIODE_LABEL[p]}
            </button>
          ))}
        </div>
      </div>

      {/* Tableau */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 text-text-muted" role="status">
          <ShoppingBag size={32} className="mb-2 opacity-20" aria-hidden />
          <p className="text-[13px] font-medium text-text">Aucun achat sur cette période.</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm" aria-label="Historique des achats">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">N° vente</th>
                  <th className="px-4 py-3 text-left hidden md:table-cell">Produits</th>
                  <th className="px-4 py-3 text-right">Montant</th>
                  <th className="px-4 py-3 text-left hidden sm:table-cell">Paiement</th>
                  <th className="px-4 py-3 text-left hidden sm:table-cell">Statut</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((v, i) => {
                  const statut = STATUT_LABEL[v.statut] ?? STATUT_LABEL.VALIDE;
                  const isRetourne = v.statut === 'RETOURNEE' || v.statut === 'RETOURNEE_PARTIELLE';
                  const premierProduit = v.lignes?.[0]?.produitNom ?? '—';
                  const autresCount = (v.lignes?.length ?? 0) - 1;

                  return (
                    <tr
                      key={v.id}
                      className={cn(
                        'border-b border-border/60 last:border-b-0 transition-colors',
                        isRetourne ? 'bg-red-50/60' : i % 2 === 0 ? 'bg-white' : 'bg-[#f8fafc]',
                      )}
                    >
                      <td className="px-4 py-3 text-[12px] text-text-muted">
                        {formatDate(v.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          to={`/sales/${v.id}`}
                          className="text-[12px] font-mono font-semibold text-primary-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-accent rounded"
                        >
                          {v.numeroVente}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-[12px] text-text hidden md:table-cell">
                        {premierProduit}
                        {autresCount > 0 && (
                          <span className="ml-1 text-text-muted">+ {autresCount} autre{autresCount > 1 ? 's' : ''}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <p className="text-[13px] font-bold text-text font-mono">
                          {formatUSD(v.montantNet)}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-[12px] text-text-muted hidden sm:table-cell">
                        {MODE_LABEL[v.modePaiement] ?? v.modePaiement}
                      </td>

                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className={cn(
                          'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold',
                          statut.classes,
                        )}>
                          {statut.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Stats résumées */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-bg border border-border px-4 py-3 text-center">
              <p className="text-[22px] font-extrabold font-mono text-text">{filtered.length}</p>
              <p className="text-[11px] text-text-muted mt-0.5">achat{filtered.length !== 1 ? 's' : ''}</p>
            </div>
            <div className="rounded-xl bg-bg border border-border px-4 py-3 text-center">
              <p className="text-[18px] font-extrabold font-mono text-success leading-tight">
                {formatUSD(totalDepense)}
              </p>
              <p className="text-[11px] text-text-muted mt-0.5">total dépensé</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
