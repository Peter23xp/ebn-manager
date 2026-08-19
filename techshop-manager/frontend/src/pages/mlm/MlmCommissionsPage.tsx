import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle, DollarSign, XCircle, Clock, Filter } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MlmApi } from '@/lib/mlm.api';
import { formatDate, formatUSD } from '@/lib/utils';
import { Pagination } from '@/components/ui/Pagination';
import { Modal } from '@/components/ui/Modal';
import toast from 'react-hot-toast';

const STATUT_CONFIG: Record<string, { label: string; badge: string; icon: React.ReactNode }> = {
  EN_ATTENTE: {
    label: 'En attente',
    badge: 'badge-warning',
    icon: <Clock size={12} />,
  },
  VALIDEE: {
    label: 'Validée',
    badge: 'badge-info',
    icon: <CheckCircle size={12} />,
  },
  PAYEE: {
    label: 'Payée',
    badge: 'badge-success',
    icon: <DollarSign size={12} />,
  },
  ANNULEE: {
    label: 'Annulée',
    badge: 'badge-danger',
    icon: <XCircle size={12} />,
  },
};

export default function MlmCommissionsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [statut, setStatut] = useState(searchParams.get('statut') ?? '');
  const [levelId, setLevelId] = useState(0);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [cancelNotes, setCancelNotes] = useState('');
  const [cancelingId, setCancelingId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['mlm-commissions', { page, statut, levelId, dateFrom, dateTo }],
    queryFn: () =>
      MlmApi.listCommissions({
        page,
        limit: 20,
        statut: statut || undefined,
        levelId: levelId || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      }),
  });

  const { data: configData } = useQuery({
    queryKey: ['mlm-config'],
    queryFn: () => MlmApi.getConfig(),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['mlm-commissions'] });

  const validateMut = useMutation({
    mutationFn: (id: string) => MlmApi.validateCommission(id),
    onSuccess: () => { toast.success('Commission validée et créditée au portefeuille'); invalidate(); },
    onError: () => toast.error('Erreur lors de la validation'),
  });

  const payMut = useMutation({
    mutationFn: (id: string) => MlmApi.payCommission(id),
    onSuccess: () => { toast.success('Commission marquée comme payée'); invalidate(); },
    onError: () => toast.error('Erreur lors du marquage'),
  });

  const cancelMut = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) => MlmApi.cancelCommission(id, notes),
    onSuccess: () => {
      toast.success('Commission annulée');
      setCancelingId(null);
      setCancelNotes('');
      invalidate();
    },
    onError: () => toast.error('Erreur lors de l\'annulation'),
  });

  const commissions = data?.commissions ?? [];
  const meta = data?.meta;

  // Summary by statut
  const summary = commissions.reduce(
    (acc: any, c: any) => {
      const key = c.statut;
      if (!acc[key]) acc[key] = { count: 0, montant: 0 };
      acc[key].count++;
      acc[key].montant += Number(c.montant);
      return acc;
    },
    {} as Record<string, { count: number; montant: number }>,
  );

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/mlm')} className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-white text-text-muted hover:border-primary-accent hover:text-primary-accent transition-colors duration-150" aria-label="Retour">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-page-title text-primary">Gestion des commissions</h1>
          <p className="text-xs text-text-muted mt-0.5">Validation et suivi des commissions MLM (Option B)</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {['EN_ATTENTE', 'VALIDEE', 'PAYEE', 'ANNULEE'].map((s) => {
          const cfg = STATUT_CONFIG[s];
          const data = summary[s] ?? { count: 0, montant: 0 };
          return (
            <button
              key={s}
              onClick={() => { setStatut(statut === s ? '' : s); setPage(1); }}
              className={`rounded-xl border p-4 text-left transition-all duration-150 hover:shadow-card ${
                statut === s ? 'ring-2 ring-primary-accent bg-primary-light/20 border-primary-accent' : 'bg-bg-card border-border'
              }`}
            >
              <span className={`badge mb-3 ${cfg.badge}`}>
                {cfg.icon} {cfg.label}
              </span>
              <p className="text-2xl font-extrabold text-text">{data.count}</p>
              <p className="text-xs text-text-muted font-mono">{formatUSD(data.montant)}</p>
            </button>
          );
        })}
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-border bg-bg-card shadow-card p-4 flex flex-wrap gap-3 items-end">
        <div className="form-group">
          <label className="form-label" htmlFor="com-statut">Statut</label>
          <select id="com-statut" value={statut} onChange={(e) => { setStatut(e.target.value); setPage(1); }}>
            <option value="">Tous</option>
            {Object.entries(STATUT_CONFIG).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="com-niveau">Niveau</label>
          <select id="com-niveau" value={levelId} onChange={(e) => { setLevelId(Number(e.target.value)); setPage(1); }}>
            <option value={0}>Tous niveaux</option>
            {configData?.map((l: any) => (
              <option key={l.id} value={l.id}>{l.nom}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="com-du">Du</label>
          <input id="com-du" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="com-au">Au</label>
          <input id="com-au" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <button onClick={() => { setStatut(''); setLevelId(0); setDateFrom(''); setDateTo(''); setPage(1); }} className="btn-secondary text-sm flex items-center gap-1.5">
          <Filter size={14} /> Réinitialiser
        </button>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-bg-card shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="px-5 py-3.5">Bénéficiaire</th>
                <th className="px-5 py-3.5">Filleul</th>
                <th className="px-5 py-3.5">Niveau</th>
                <th className="px-5 py-3.5">Montant</th>
                <th className="px-5 py-3.5">Statut</th>
                <th className="px-5 py-3.5">Date</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? [...Array(5)].map((_, i) => (
                    <tr key={i}>
                      <td colSpan={7} className="px-5 py-4">
                        <div className="skeleton h-6 rounded w-full" />
                      </td>
                    </tr>
                  ))
                : commissions.length === 0
                ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-12 text-center text-text-muted">
                        Aucune commission trouvée.
                      </td>
                    </tr>
                  )
                : commissions.map((c: any) => {
                    const cfg = STATUT_CONFIG[c.statut] ?? STATUT_CONFIG['EN_ATTENTE'];
                    return (
                      <tr key={c.id} className="hover:bg-blue-50/40 transition-colors">
                        <td className="px-5 py-3">
                          <p className="font-semibold text-text">
                            {c.membre?.client?.prenom} {c.membre?.client?.nom}
                          </p>
                          <p className="text-xs text-text-muted font-mono">{c.membre?.matricule}</p>
                        </td>
                        <td className="px-5 py-3">
                          <p className="text-sm text-text">
                            {c.filleul?.client?.prenom} {c.filleul?.client?.nom}
                          </p>
                        </td>
                        <td className="px-5 py-3">
                          <span className="text-xs font-bold text-text-muted bg-bg px-2 py-1 rounded-full">
                            {c.level?.nom}
                          </span>
                        </td>
                        <td className="px-5 py-3 font-mono font-bold text-text">
                          {formatUSD(c.montant)}
                        </td>
                        <td className="px-5 py-3">
                          <span className={`badge ${cfg.badge}`}>
                            {cfg.icon} {cfg.label}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-xs text-text-muted">
                          {formatDate(c.createdAt)}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {c.statut === 'EN_ATTENTE' && (
                              <>
                                <button
                                  onClick={() => validateMut.mutate(c.id)}
                                  disabled={validateMut.isPending}
                                  className="btn-primary text-[13px] flex items-center gap-1"
                                >
                                  <CheckCircle size={12} /> Valider
                                </button>
                                <button
                                  onClick={() => setCancelingId(c.id)}
                                  className="btn-secondary text-[13px] text-danger border-red-200 hover:bg-red-50 flex items-center gap-1"
                                >
                                  Annuler
                                </button>
                              </>
                            )}
                            {c.statut === 'VALIDEE' && (
                              <button
                                onClick={() => payMut.mutate(c.id)}
                                disabled={payMut.isPending}
                                className="btn-secondary text-[13px] flex items-center gap-1"
                              >
                                <DollarSign size={12} /> Marquer payée
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {meta && meta.totalPages > 1 && (
          <div className="px-5 py-3 border-t border-border">
            <Pagination
              page={page}
              totalPages={meta.totalPages}
              total={meta.total}
              onPageChange={setPage}
              isLoading={isLoading}
            />
          </div>
        )}
      </div>

      {/* Cancel modal */}
      <Modal
        open={!!cancelingId}
        onClose={() => { setCancelingId(null); setCancelNotes(''); }}
        title="Annuler la commission"
        size="sm"
      >
        <p className="text-sm text-text-muted">Précisez la raison de l'annulation (optionnel).</p>
        <textarea
          value={cancelNotes}
          onChange={(e) => setCancelNotes(e.target.value)}
          placeholder="Raison de l'annulation..."
          rows={3}
          className="resize-none mt-3"
        />
        <div className="flex justify-end gap-3 pt-4">
          <button onClick={() => { setCancelingId(null); setCancelNotes(''); }} className="btn-secondary text-sm">
            Fermer
          </button>
          <button
            onClick={() => cancelMut.mutate({ id: cancelingId!, notes: cancelNotes })}
            disabled={cancelMut.isPending}
            className="btn-primary bg-red-600 hover:bg-red-700 text-sm"
          >
            Confirmer l'annulation
          </button>
        </div>
      </Modal>
    </div>
  );
}