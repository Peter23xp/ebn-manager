import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Download,
  ChevronRight,
  RefreshCw,
  AlertCircle,
  Receipt,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useDebounce } from '@/hooks/useDebounce';
import { ventesApi } from '@/lib/ventes.api';
import { SaleStatusBadge } from '@/components/sales/SaleStatusBadge';
import { cn, formatUSD, formatDateTime } from '@/lib/utils';
import type { ModePaiement } from '@/types';
import type { SalesListResponse } from '@/lib/ventes.api';

// ── Utilitaires ───────────────────────────────────────────────────

type Periode = 'today' | 'week' | 'month' | 'last_month';

function getPeriodeDates(p: Periode): { dateDebut: string; dateFin: string } {
  const now = new Date();

  if (p === 'today') {
    const debut = new Date(now);
    debut.setHours(0, 0, 0, 0);
    const fin = new Date(now);
    fin.setHours(23, 59, 59, 999);
    return { dateDebut: debut.toISOString(), dateFin: fin.toISOString() };
  }

  if (p === 'week') {
    const debut = new Date(now);
    debut.setDate(now.getDate() - now.getDay());
    debut.setHours(0, 0, 0, 0);
    const fin = new Date(now);
    fin.setHours(23, 59, 59, 999);
    return { dateDebut: debut.toISOString(), dateFin: fin.toISOString() };
  }

  if (p === 'last_month') {
    const debut = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const fin = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    return { dateDebut: debut.toISOString(), dateFin: fin.toISOString() };
  }

  // month (défaut)
  const debut = new Date(now.getFullYear(), now.getMonth(), 1);
  const fin = new Date(now);
  fin.setHours(23, 59, 59, 999);
  return { dateDebut: debut.toISOString(), dateFin: fin.toISOString() };
}

function exportCSV(ventes: SalesListResponse['ventes']) {
  const rows = [
    ['N° Vente', 'Date', 'Agent', 'Client', 'Montant ($)', 'Mode Paiement', 'Statut'],
    ...ventes.map((v) => [
      v.numeroVente,
      v.createdAt,
      v.agent.nom,
      v.client ? `${v.client.prenom} ${v.client.nom}` : '—',
      String(v.montantNet),
      v.modePaiement,
      v.statut,
    ]),
  ];
  const csv = rows.map((r) => r.join(';')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ventes-ebn-network-${new Date().toISOString().slice(0, 7)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Icônes mode de paiement ───────────────────────────────────────

const MODE_ICONS: Record<ModePaiement, string> = {
  CASH: '💵',
  MPESA: '📱',
  AIRTEL_MONEY: '📱',
  VIREMENT: '💳',
};

const MODE_LABELS: Record<ModePaiement, string> = {
  CASH: 'Espèces',
  MPESA: 'M-Pesa',
  AIRTEL_MONEY: 'Airtel',
  VIREMENT: 'Virement',
};

// ── KPI Card ──────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  isLoading,
}: {
  label: string;
  value: string;
  isLoading: boolean;
}) {
  return (
    <div className="card flex flex-col gap-1">
      <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted">{label}</p>
      {isLoading ? (
        <div className="skeleton h-6 w-3/4 rounded mt-1" />
      ) : (
        <p className="text-[20px] font-bold text-primary">{value}</p>
      )}
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────────

export default function VentesHistoriquePage() {
  const navigate = useNavigate();

  const [periode, setPeriode] = useState<Periode>('month');
  const [modePaiement, setModePaiement] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const debouncedSearch = useDebounce(search, 400);

  const { data, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: ['ventes', { periode, modePaiement, search: debouncedSearch, page, sortOrder }],
    queryFn: () =>
      ventesApi.list({
        ...getPeriodeDates(periode),
        modePaiement: modePaiement || undefined,
        search: debouncedSearch || undefined,
        page,
        limit: 50,
        sortBy: 'createdAt',
        sortOrder,
      }),
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });

  const ventes = data?.ventes ?? [];
  const meta = data?.meta;
  const kpis = data?.kpis;

  const PERIODES: { value: Periode; label: string }[] = [
    { value: 'today', label: "Aujourd'hui" },
    { value: 'week', label: 'Cette semaine' },
    { value: 'month', label: 'Ce mois' },
    { value: 'last_month', label: 'Mois dernier' },
  ];

  const MODES_OPTIONS: { value: string; label: string }[] = [
    { value: '', label: 'Tous modes' },
    { value: 'CASH', label: 'Espèces' },
    { value: 'MPESA', label: 'M-Pesa' },
    { value: 'AIRTEL_MONEY', label: 'Airtel Money' },
    { value: 'VIREMENT', label: 'Virement' },
  ];

  function handleChangePeriode(p: Periode) {
    setPeriode(p);
    setPage(1);
  }

  function handleChangeMode(m: string) {
    setModePaiement(m);
    setPage(1);
  }

  function handleChangeSearch(s: string) {
    setSearch(s);
    setPage(1);
  }

  function toggleSort() {
    setSortOrder((v) => (v === 'desc' ? 'asc' : 'desc'));
    setPage(1);
  }

  return (
    <div className="space-y-5">
      {/* ── En-tête ──────────────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h1 className="text-page-title text-primary">Historique des ventes</h1>
          <p className="mt-1 text-[13px] text-text-muted">
            Consultez et exportez toutes les transactions
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="btn-secondary"
            title="Rafraîchir"
          >
            <RefreshCw size={14} className={cn(isFetching && 'animate-spin')} />
            Rafraîchir
          </button>
          {ventes.length > 0 && (
            <button
              type="button"
              onClick={() => exportCSV(ventes)}
              className="btn-secondary"
            >
              <Download size={14} />
              Export CSV
            </button>
          )}
        </div>
      </div>

      {/* ── KPIs ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          label="Chiffre d'affaires"
          value={kpis ? formatUSD(kpis.totalCA) : '—'}
          isLoading={isLoading}
        />
        <KpiCard
          label="Nombre de ventes"
          value={kpis ? String(kpis.nbVentes) : '—'}
          isLoading={isLoading}
        />
        <KpiCard
          label="Panier moyen"
          value={kpis ? formatUSD(kpis.panierMoyen) : '—'}
          isLoading={isLoading}
        />
      </div>

      {/* ── Filtres ───────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center gap-2.5">
        {/* Toggle période — scrollable horizontalement sur mobile */}
        <div className="period-toggle overflow-x-auto max-w-full flex-shrink-0">
          {PERIODES.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => handleChangePeriode(p.value)}
              className={cn('period-btn whitespace-nowrap', periode === p.value && 'active')}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto flex-wrap">
          {/* Recherche */}
          <div className="relative flex-1 min-w-[160px]">
            <Search
              size={13}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-subtle"
            />
            <input
              type="text"
              placeholder="N° vente, client..."
              value={search}
              onChange={(e) => handleChangeSearch(e.target.value)}
              className="pl-8 text-sm"
            />
          </div>

          {/* Mode paiement */}
          <div className="relative flex-shrink-0">
            <select
              value={modePaiement}
              onChange={(e) => handleChangeMode(e.target.value)}
              className="text-sm pr-8"
            >
              {MODES_OPTIONS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <ChevronDown
              size={13}
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-subtle"
            />
          </div>
        </div>
      </div>

      {/* ── État d'erreur ─────────────────────────────────────────── */}
      {isError && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-danger">
          <AlertCircle size={16} />
          Impossible de charger les ventes. Vérifiez votre connexion.
          <button
            type="button"
            onClick={() => refetch()}
            className="ml-auto text-danger underline hover:no-underline"
          >
            Réessayer
          </button>
        </div>
      )}

      {/* ── Tableau ───────────────────────────────────────────────── */}
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>N° Vente</th>
              <th>
                <button
                  type="button"
                  onClick={toggleSort}
                  className="inline-flex items-center gap-1 hover:text-primary transition-colors"
                >
                  Date
                  {sortOrder === 'desc' ? (
                    <ChevronDown size={11} />
                  ) : (
                    <ChevronUp size={11} />
                  )}
                </button>
              </th>
              <th className="hidden md:table-cell">Agent</th>
              <th className="hidden sm:table-cell">Client</th>
              <th className="text-right">Montant</th>
              <th className="hidden sm:table-cell">Paiement</th>
              <th>Statut</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    <td><div className="skeleton h-3 rounded w-full" /></td>
                    <td><div className="skeleton h-3 rounded w-full" /></td>
                    <td className="hidden md:table-cell"><div className="skeleton h-3 rounded w-full" /></td>
                    <td className="hidden sm:table-cell"><div className="skeleton h-3 rounded w-full" /></td>
                    <td><div className="skeleton h-3 rounded w-full" /></td>
                    <td className="hidden sm:table-cell"><div className="skeleton h-3 rounded w-full" /></td>
                    <td><div className="skeleton h-3 rounded w-full" /></td>
                    <td><div className="skeleton h-3 rounded w-full" /></td>
                  </tr>
                ))
              : ventes.map((vente) => (
                  <tr
                    key={vente.id}
                    onClick={() => navigate(`/sales/${vente.id}`)}
                    className={cn(
                      'cursor-pointer',
                      vente.statut === 'RETOURNEE' && 'bg-red-50/60',
                      vente.statut === 'ANNULEE' && 'opacity-60',
                    )}
                  >
                    <td>
                      <span className="font-mono text-[12px] font-semibold text-primary-accent">
                        {vente.numeroVente}
                      </span>
                    </td>
                    <td className="text-[12px] text-text-muted whitespace-nowrap">
                      {formatDateTime(vente.createdAt)}
                    </td>
                    <td className="text-[13px] hidden md:table-cell">
                      {vente.agent.prenom
                        ? `${vente.agent.prenom} ${vente.agent.nom}`
                        : vente.agent.nom}
                    </td>
                    <td className="text-[13px] hidden sm:table-cell">
                      {vente.client ? (
                        `${vente.client.prenom} ${vente.client.nom}`
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>
                    <td className="text-right font-mono font-semibold text-[13px]">
                      {formatUSD(vente.montantNet)}
                    </td>
                    <td className="hidden sm:table-cell">
                      <span className="inline-flex items-center gap-1 text-[12px]">
                        <span aria-hidden>{MODE_ICONS[vente.modePaiement]}</span>
                        {MODE_LABELS[vente.modePaiement]}
                      </span>
                    </td>
                    <td>
                      <SaleStatusBadge statut={vente.statut} />
                    </td>
                    <td>
                      <ChevronRight size={14} className="text-text-subtle" />
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>

        {!isLoading && ventes.length === 0 && !isError && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-text-muted">
            <Receipt size={32} className="opacity-30" />
            <p className="text-[13px] font-medium">Aucune vente pour cette période</p>
          </div>
        )}
      </div>

      {/* ── Pagination ────────────────────────────────────────────── */}
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between flex-wrap gap-3">
          <p className="text-[12px] text-text-muted">
            Page {meta.page} / {meta.totalPages} — {meta.total} ventes
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={meta.page <= 1 || isFetching}
              className="btn-secondary text-[12px] py-1.5 px-3"
            >
              Précédent
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
              disabled={meta.page >= meta.totalPages || isFetching}
              className="btn-secondary text-[12px] py-1.5 px-3"
            >
              Suivant
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
