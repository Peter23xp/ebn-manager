import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CreditCard, TrendingUp, Receipt, FileText } from 'lucide-react';
import { api } from '@/lib/api';
import { formatCDF, formatDate, cn } from '@/lib/utils';
import { useSites } from '@/hooks/useSites';
import { useAuthStore } from '@/store/auth.store';
import { isSiteScopedStaff } from '@/lib/roles';
import { usePrivateQueryScope } from '@/hooks/usePrivateQueryScope';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Paiement {
  id: string;
  etape: 'RECIT' | 'FICHE';
  montant: number;
  modePaiement: string;
  referenceTransaction: string | null;
  completeeAt: string;
  client: { id: string; prenom: string; nom: string; telephone: string };
  agent:  { id: string; nom: string } | null;
  site:   { id: string; nom: string } | null;
}

interface PaiementsResponse {
  paiements: Paiement[];
  meta: { total: number; page: number; limit: number; totalPages: number };
  kpis: {
    totalEncaisse:     number;
    totalEncaisseJour: number;
    nbRecitJour:       number;
    nbFicheJour:       number;
    montantRecitJour:  number;
    montantFicheJour:  number;
  };
}

// ── Badge étape ───────────────────────────────────────────────────────────────

function EtapeBadge({ etape }: { etape: 'RECIT' | 'FICHE' }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide',
      etape === 'RECIT'
        ? 'bg-blue-100 text-blue-700'
        : 'bg-emerald-100 text-emerald-700',
    )}>
      {etape === 'RECIT' ? <Receipt size={10} /> : <FileText size={10} />}
      {etape}
    </span>
  );
}

const MODE_LABEL: Record<string, string> = {
  CASH: 'Cash', MPESA: 'M-Pesa', AIRTEL_MONEY: 'Airtel Money', VIREMENT: 'Virement',
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PaiementsOnboardingPage() {
  const scope = usePrivateQueryScope();
  const { user } = useAuthStore();
  const { sites } = useSites();
  const isScoped = !!user && isSiteScopedStaff(user.role);

  const today = new Date().toISOString().slice(0, 10);
  const [selectedSiteId, setSiteId] = useState(user?.siteId ?? '');
  const siteId = isScoped ? user.siteId ?? '' : selectedSiteId;
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin,   setDateFin]   = useState('');
  const [filterEtape, setFilterEtape] = useState<string>('');
  const [page, setPage] = useState(1);

  const params: Record<string, string | number> = { page, limit: 50 };
  if (siteId)    params.siteId    = siteId;
  if (dateDebut) params.dateDebut = dateDebut;
  if (dateFin)   params.dateFin   = dateFin;

  const { data: response, isLoading } = useQuery<PaiementsResponse>({
    queryKey: ['paiements-onboarding', siteId, dateDebut, dateFin, page, scope.key],
    queryFn: () => api.get('/clients/paiements-onboarding', { params }).then(r => r.data),
    staleTime: 60_000,
    enabled: scope.enabled,
  });
  const data = scope.enabled ? response : undefined;

  const paiements = (data?.paiements ?? []).filter(p => !filterEtape || p.etape === filterEtape);

  return (
    <div className="space-y-5">

      {/* Header */}
      <div>
        <h1 className="text-[20px] font-extrabold text-primary flex items-center gap-2">
          <CreditCard size={20} className="text-primary-accent" />
          Paiements onboarding
        </h1>
        <p className="text-[13px] text-text-muted mt-0.5">
          Encaissements Récit et Fiche — traçabilité complète
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border border-border bg-white px-4 py-3 col-span-2 md:col-span-1">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp size={14} className="text-primary-accent" />
            <p className="text-[11px] font-bold uppercase tracking-wide text-text-muted">Encaissé aujourd'hui</p>
          </div>
          {isLoading
            ? <div className="skeleton h-7 w-28 rounded" />
            : <p className="text-[20px] font-black text-primary">{formatCDF(data?.kpis.totalEncaisseJour ?? 0)}</p>}
        </div>

        <div className="rounded-xl border border-border bg-white px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-text-muted mb-1">Récits (auj.)</p>
          {isLoading
            ? <div className="skeleton h-7 w-16 rounded" />
            : <>
                <p className="text-[18px] font-black text-blue-700">{data?.kpis.nbRecitJour ?? 0}</p>
                <p className="text-[10px] text-text-muted">{formatCDF(data?.kpis.montantRecitJour ?? 0)}</p>
              </>}
        </div>

        <div className="rounded-xl border border-border bg-white px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-text-muted mb-1">Fiches (auj.)</p>
          {isLoading
            ? <div className="skeleton h-7 w-16 rounded" />
            : <>
                <p className="text-[18px] font-black text-emerald-700">{data?.kpis.nbFicheJour ?? 0}</p>
                <p className="text-[10px] text-text-muted">{formatCDF(data?.kpis.montantFicheJour ?? 0)}</p>
              </>}
        </div>

        <div className="rounded-xl border border-border bg-white px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-text-muted mb-1">Total période</p>
          {isLoading
            ? <div className="skeleton h-7 w-28 rounded" />
            : <p className="text-[18px] font-black text-primary">{formatCDF(data?.kpis.totalEncaisse ?? 0)}</p>}
        </div>
      </div>

      {/* Filtres */}
      <div className="rounded-xl border border-border bg-white px-4 py-3 flex flex-wrap gap-3 items-end">
        {!isScoped && (
          <div className="form-group mb-0 min-w-[140px]">
            <label className="form-label text-[11px]">Site</label>
            <select
              value={siteId}
              onChange={e => { setSiteId(e.target.value); setPage(1); }}
              className="text-[13px] px-3 py-2 rounded-lg border border-border bg-white w-full focus:outline-none focus:ring-2 focus:ring-primary-accent/30"
            >
              <option value="">Tous les sites</option>
              {sites.map(s => <option key={s.id} value={s.id}>{s.nom}</option>)}
            </select>
          </div>
        )}

        <div className="form-group mb-0">
          <label className="form-label text-[11px]">Date début</label>
          <input
            type="date"
            value={dateDebut}
            max={today}
            onChange={e => { setDateDebut(e.target.value); setPage(1); }}
            className="text-[13px] px-3 py-2 rounded-lg border border-border bg-white focus:outline-none focus:ring-2 focus:ring-primary-accent/30"
          />
        </div>

        <div className="form-group mb-0">
          <label className="form-label text-[11px]">Date fin</label>
          <input
            type="date"
            value={dateFin}
            max={today}
            onChange={e => { setDateFin(e.target.value); setPage(1); }}
            className="text-[13px] px-3 py-2 rounded-lg border border-border bg-white focus:outline-none focus:ring-2 focus:ring-primary-accent/30"
          />
        </div>

        <div className="flex rounded-lg border border-border overflow-hidden self-end">
          {[
            { key: '',      label: 'Tous' },
            { key: 'RECIT', label: 'Récit' },
            { key: 'FICHE', label: 'Fiche' },
          ].map(opt => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setFilterEtape(opt.key)}
              className={cn(
                'px-3 py-2 text-[12px] font-semibold transition-colors',
                filterEtape === opt.key
                  ? 'bg-primary text-white'
                  : 'bg-white text-text-muted hover:bg-slate-50',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {(dateDebut || dateFin || siteId) && (
          <button
            type="button"
            onClick={() => { setDateDebut(''); setDateFin(''); setSiteId(user?.siteId ?? ''); setPage(1); }}
            className="text-[12px] text-text-muted hover:text-danger transition-colors self-end pb-2"
          >
            Réinitialiser
          </button>
        )}
      </div>

      {/* Tableau */}
      <div className="rounded-xl border border-border bg-white overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-2">
            {[...Array(8)].map((_, i) => <div key={i} className="skeleton h-12 rounded-lg" />)}
          </div>
        ) : paiements.length === 0 ? (
          <div className="py-16 text-center">
            <CreditCard size={32} className="mx-auto text-text-muted opacity-30 mb-3" />
            <p className="text-[14px] font-semibold text-text">Aucun paiement trouvé</p>
            <p className="text-[12px] text-text-muted mt-1">Ajustez les filtres ou la période.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-slate-50 text-left text-[11px] font-bold uppercase tracking-wide text-text-muted">
                    <th className="px-4 py-2.5">Client</th>
                    <th className="px-4 py-2.5">Type</th>
                    <th className="px-4 py-2.5 text-right">Montant</th>
                    <th className="px-4 py-2.5 hidden sm:table-cell">Mode</th>
                    <th className="px-4 py-2.5 hidden md:table-cell">Agent</th>
                    <th className="px-4 py-2.5 hidden md:table-cell">Site</th>
                    <th className="px-4 py-2.5 hidden lg:table-cell">Date</th>
                    <th className="px-4 py-2.5 hidden lg:table-cell">Réf.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paiements.map(p => (
                    <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="text-[13px] font-semibold text-text">{p.client.prenom} {p.client.nom}</p>
                        <p className="text-[10px] text-text-muted">{p.client.telephone}</p>
                      </td>
                      <td className="px-4 py-3">
                        <EtapeBadge etape={p.etape} />
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-[13px] font-bold text-success">
                        {formatCDF(p.montant)}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell text-[12px] text-text-muted">
                        {MODE_LABEL[p.modePaiement] ?? p.modePaiement}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-[12px] text-text-muted">
                        {p.agent?.nom ?? '—'}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-[12px] text-text-muted">
                        {p.site?.nom ?? '—'}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell text-[12px] text-text-muted">
                        {p.completeeAt ? formatDate(p.completeeAt) : '—'}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        {p.referenceTransaction
                          ? <span className="font-mono text-[11px] text-text-muted bg-slate-100 px-1.5 py-0.5 rounded">{p.referenceTransaction}</span>
                          : <span className="text-[11px] text-text-subtle">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {data && data.meta.totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <p className="text-[12px] text-text-muted">
                  {data.meta.total} paiement{data.meta.total > 1 ? 's' : ''} au total
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="btn-secondary text-[12px] px-3 py-1.5 disabled:opacity-40"
                  >
                    ← Précédent
                  </button>
                  <span className="text-[12px] text-text-muted">
                    {page} / {data.meta.totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage(p => Math.min(data.meta.totalPages, p + 1))}
                    disabled={page === data.meta.totalPages}
                    className="btn-secondary text-[12px] px-3 py-1.5 disabled:opacity-40"
                  >
                    Suivant →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
