import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  Clock,
  DollarSign,
  Smartphone,
  Banknote,
  AlertCircle,
  Filter,
} from 'lucide-react';
import { MlmApi } from '@/lib/mlm.api';
import { formatDate, formatUSD } from '@/lib/utils';
import { Pagination } from '@/components/ui/Pagination';
import { Modal } from '@/components/ui/Modal';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/auth.store';

const STATUT_CONFIG: Record<
  string,
  { label: string; badge: string; icon: React.ReactNode }
> = {
  EN_ATTENTE: {
    label: 'En attente',
    badge: 'badge-warning',
    icon: <Clock size={12} />,
  },
  APPROUVE: {
    label: 'Approuvé',
    badge: 'badge-info',
    icon: <CheckCircle size={12} />,
  },
  PAYE: {
    label: 'Payé',
    badge: 'badge-success',
    icon: <DollarSign size={12} />,
  },
  REJETE: {
    label: 'Rejeté',
    badge: 'badge-danger',
    icon: <XCircle size={12} />,
  },
  ANNULE: {
    label: 'Annulé',
    badge: 'badge-muted',
    icon: <XCircle size={12} />,
  },
};

interface WithdrawalRequestItem {
  id: string;
  montant: number;
  type: 'MOBILE_MONEY' | 'CASH';
  provider?: string;
  phoneNumber?: string;
  statut: 'EN_ATTENTE' | 'APPROUVE' | 'REJETE' | 'PAYE' | 'ANNULE';
  commissionIds: string[];
  notes?: string;
  rejectReason?: string;
  createdAt: string;
  approvedAt?: string;
  paidAt?: string;
  membre: {
    id: string;
    matricule: string;
    client: {
      id: string;
      prenom: string;
      nom: string;
      telephone: string;
    };
    level: {
      id: number;
      ordre: number;
      nom: string;
      couleur: string;
    };
  };
}

export default function MlmWithdrawalRequestsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const canModerate =
    user?.role === 'SUPER_ADMIN' || user?.role === 'DIRECTEUR_REGIONAL';
  const [page, setPage] = useState(1);
  const [statut, setStatut] = useState('');
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [approveNotes, setApproveNotes] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['mlm-withdrawal-requests', { page, statut }],
    queryFn: () =>
      MlmApi.listWithdrawalRequests({
        page,
        limit: 20,
        statut: statut || undefined,
      }),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['mlm-withdrawal-requests'] });
  };

  const approveMut = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      MlmApi.approveWithdrawalRequest(id, user?.id ?? '', notes),
    onSuccess: () => {
      toast.success('Demande approuvée avec succès');
      setApprovingId(null);
      setApproveNotes('');
      invalidate();
    },
    onError: (error: any) =>
      toast.error(error?.response?.data?.message ?? 'Erreur lors de l\'approbation'),
  });

  const rejectMut = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      MlmApi.rejectWithdrawalRequest(id, reason),
    onSuccess: () => {
      toast.success('Demande rejetée');
      setRejectingId(null);
      setRejectReason('');
      invalidate();
    },
    onError: (error: any) =>
      toast.error(error?.response?.data?.message ?? 'Erreur lors du rejet'),
  });

  const markPaidMut = useMutation({
    mutationFn: (id: string) => MlmApi.markWithdrawalAsPaid(id),
    onSuccess: () => {
      toast.success('Demande marquée comme payée');
      invalidate();
    },
    onError: (error: any) =>
      toast.error(error?.response?.data?.message ?? 'Erreur lors du marquage'),
  });

  const requests: WithdrawalRequestItem[] = data?.requests ?? [];
  const meta = data?.meta;

  // Summary by statut
  const summary = requests.reduce(
    (acc, r) => {
      const key = r.statut;
      if (!acc[key]) acc[key] = { count: 0, montant: 0 };
      acc[key].count++;
      acc[key].montant += r.montant;
      return acc;
    },
    {} as Record<string, { count: number; montant: number }>,
  );

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/mlm')}
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-white text-text-muted hover:border-primary-accent hover:text-primary-accent transition-colors duration-150"
          aria-label="Retour"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-page-title text-primary">Demandes de retrait des commissions</h1>
          <p className="text-xs text-text-muted mt-0.5">
            Validation des retraits de commissions (Mobile Money & Cash)
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {['EN_ATTENTE', 'APPROUVE', 'PAYE', 'REJETE', 'ANNULE'].map((s) => {
          const cfg = STATUT_CONFIG[s];
          const data = summary[s] ?? { count: 0, montant: 0 };
          return (
            <button
              key={s}
              onClick={() => {
                setStatut(statut === s ? '' : s);
                setPage(1);
              }}
              className={`rounded-xl border p-4 text-left transition-all duration-150 hover:shadow-card ${
                statut === s
                  ? 'ring-2 ring-primary-accent bg-primary-light/20 border-primary-accent'
                  : 'bg-bg-card border-border'
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
          <label className="form-label" htmlFor="wr-statut">
            Statut
          </label>
          <select
            id="wr-statut"
            value={statut}
            onChange={(e) => {
              setStatut(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Tous</option>
            {Object.entries(STATUT_CONFIG).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={() => {
            setStatut('');
            setPage(1);
          }}
          className="btn-secondary text-sm flex items-center gap-1.5"
        >
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
                <th className="px-5 py-3.5">Niveau</th>
                <th className="px-5 py-3.5">Montant</th>
                <th className="px-5 py-3.5">Type</th>
                <th className="px-5 py-3.5">Infos paiement</th>
                <th className="px-5 py-3.5">Statut</th>
                <th className="px-5 py-3.5">Date demande</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? [...Array(5)].map((_, i) => (
                    <tr key={i}>
                      <td colSpan={8} className="px-5 py-4">
                        <div className="skeleton h-6 rounded w-full" />
                      </td>
                    </tr>
                  ))
                : requests.length === 0
                ? (
                    <tr>
                      <td colSpan={8} className="px-5 py-12 text-center text-text-muted">
                        Aucune demande de retrait trouvée.
                      </td>
                    </tr>
                  )
                : requests.map((r) => {
                    const cfg = STATUT_CONFIG[r.statut] ?? STATUT_CONFIG['EN_ATTENTE'];
                    return (
                      <tr key={r.id} className="hover:bg-blue-50/40 transition-colors">
                        <td className="px-5 py-3">
                          <p className="font-semibold text-text">
                            {r.membre.client.prenom} {r.membre.client.nom}
                          </p>
                          <p className="text-xs text-text-muted font-mono">
                            {r.membre.matricule}
                          </p>
                          <p className="text-xs text-text-muted">{r.membre.client.telephone}</p>
                        </td>
                        <td className="px-5 py-3">
                          <span
                            className="text-xs font-bold px-2 py-1 rounded-full"
                            style={{
                              backgroundColor: `${r.membre.level.couleur}20`,
                              color: r.membre.level.couleur,
                            }}
                          >
                            {r.membre.level.nom}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <p className="font-mono font-bold text-text">{formatUSD(r.montant)}</p>
                          <p className="text-[10px] text-text-muted">
                            {r.commissionIds.length} commission
                            {r.commissionIds.length > 1 ? 's' : ''}
                          </p>
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-1.5">
                            {r.type === 'MOBILE_MONEY' ? (
                              <Smartphone size={14} className="text-primary-accent" />
                            ) : (
                              <Banknote size={14} className="text-green-600" />
                            )}
                            <span className="text-xs font-semibold">
                              {r.type === 'MOBILE_MONEY' ? 'Mobile Money' : 'Espèces'}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          {r.type === 'MOBILE_MONEY' && r.provider && r.phoneNumber ? (
                            <>
                              <p className="text-xs font-semibold">{r.provider}</p>
                              <p className="text-xs text-text-muted font-mono">
                                {r.phoneNumber}
                              </p>
                            </>
                          ) : (
                            <p className="text-xs text-text-muted italic">Sur place</p>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          <span className={`badge ${cfg.badge}`}>
                            {cfg.icon} {cfg.label}
                          </span>
                          {r.rejectReason && (
                            <p className="text-[10px] text-red-600 mt-1 max-w-xs">
                              {r.rejectReason}
                            </p>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          <p className="text-xs text-text-muted">{formatDate(r.createdAt)}</p>
                          {r.approvedAt && (
                            <p className="text-[10px] text-green-600 mt-0.5">
                              Approuvé: {formatDate(r.approvedAt)}
                            </p>
                          )}
                          {r.paidAt && (
                            <p className="text-[10px] text-green-700 font-semibold mt-0.5">
                              Payé: {formatDate(r.paidAt)}
                            </p>
                          )}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {r.statut === 'EN_ATTENTE' && canModerate && (
                              <>
                                <button
                                  onClick={() => setApprovingId(r.id)}
                                  className="btn-primary text-[13px] flex items-center gap-1"
                                >
                                  <CheckCircle size={12} /> Approuver
                                </button>
                                <button
                                  onClick={() => setRejectingId(r.id)}
                                  className="btn-secondary text-[13px] text-danger border-red-200 hover:bg-red-50 flex items-center gap-1"
                                >
                                  <XCircle size={12} /> Rejeter
                                </button>
                              </>
                            )}
                            {r.statut === 'APPROUVE' &&
                              r.type === 'MOBILE_MONEY' &&
                              canModerate && (
                              <button
                                onClick={() => markPaidMut.mutate(r.id)}
                                disabled={markPaidMut.isPending}
                                className="btn-secondary text-[13px] flex items-center gap-1"
                              >
                                <DollarSign size={12} /> Marquer payé
                              </button>
                            )}
                            {r.notes && (
                              <div className="text-[10px] text-text-muted italic max-w-xs">
                                Note: {r.notes}
                              </div>
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

      {/* Approve modal */}
      <Modal
        open={!!approvingId}
        onClose={() => {
          setApprovingId(null);
          setApproveNotes('');
        }}
        title="Approuver la demande de retrait"
        size="sm"
      >
        {approvingId && (() => {
          const request = requests.find((r) => r.id === approvingId);
          if (!request) return null;

          return (
            <div className="space-y-4">
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                <p className="text-sm font-semibold text-text mb-2">Résumé de la demande</p>
                <div className="space-y-1 text-xs text-text-muted">
                  <p>
                    <span className="font-semibold">Bénéficiaire:</span>{' '}
                    {request.membre.client.prenom} {request.membre.client.nom}
                  </p>
                  <p>
                    <span className="font-semibold">Montant:</span> {formatUSD(request.montant)}
                  </p>
                  <p>
                    <span className="font-semibold">Type:</span>{' '}
                    {request.type === 'MOBILE_MONEY' ? 'Mobile Money' : 'Espèces sur place'}
                  </p>
                  {request.type === 'MOBILE_MONEY' && (
                    <>
                      <p>
                        <span className="font-semibold">Opérateur:</span> {request.provider}
                      </p>
                      <p>
                        <span className="font-semibold">Numéro:</span> {request.phoneNumber}
                      </p>
                    </>
                  )}
                  <p>
                    <span className="font-semibold">Commissions:</span>{' '}
                    {request.commissionIds.length}
                  </p>
                </div>
              </div>

              {request.type === 'CASH' && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs text-amber-700 flex items-center gap-1.5">
                    <AlertCircle size={14} />
                    Ce retrait en espèces sera automatiquement marqué comme payé après approbation.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-2">
                  Note (optionnel)
                </label>
                <textarea
                  value={approveNotes}
                  onChange={(e) => setApproveNotes(e.target.value)}
                  placeholder="Ajoutez une note..."
                  rows={2}
                  className="resize-none w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm"
                />
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setApprovingId(null);
                    setApproveNotes('');
                  }}
                  className="btn-secondary text-sm"
                >
                  Annuler
                </button>
                <button
                  onClick={() =>
                    approveMut.mutate({
                      id: approvingId,
                      notes: approveNotes || undefined,
                    })
                  }
                  disabled={approveMut.isPending}
                  className="btn-primary text-sm"
                >
                  {approveMut.isPending ? 'Approbation...' : 'Confirmer l\'approbation'}
                </button>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* Reject modal */}
      <Modal
        open={!!rejectingId}
        onClose={() => {
          setRejectingId(null);
          setRejectReason('');
        }}
        title="Rejeter la demande de retrait"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-text-muted">
            Précisez la raison du rejet. Le client pourra voir ce message.
          </p>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Raison du rejet (requis)..."
            rows={3}
            className="resize-none w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm"
            required
          />
          <div className="flex justify-end gap-3">
            <button
              onClick={() => {
                setRejectingId(null);
                setRejectReason('');
              }}
              className="btn-secondary text-sm"
            >
              Annuler
            </button>
            <button
              onClick={() => {
                if (!rejectReason.trim()) {
                  toast.error('Veuillez préciser la raison du rejet');
                  return;
                }
                rejectMut.mutate({ id: rejectingId!, reason: rejectReason });
              }}
              disabled={rejectMut.isPending || !rejectReason.trim()}
              className="btn-primary bg-red-600 hover:bg-red-700 text-sm"
            >
              {rejectMut.isPending ? 'Rejet...' : 'Confirmer le rejet'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
