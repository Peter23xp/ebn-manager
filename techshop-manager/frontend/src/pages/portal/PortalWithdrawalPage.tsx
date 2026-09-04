import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, CheckCircle2, XCircle, Clock, DollarSign, Smartphone, Banknote, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { PortalLayout } from '@/components/portal/PortalLayout';
import { portalApi, type ValidatedCommission, type WithdrawalRequest } from '@/lib/portal.api';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

// ── Carte commission ──────────────────────────────────────────────────────────

function CommissionCard({
  commission,
  isSelected,
  onToggle,
}: {
  commission: ValidatedCommission;
  isSelected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={isSelected}
      className={cn(
        'flex w-full items-start justify-between gap-3 rounded-2xl border p-4 text-left transition-all duration-150',
        isSelected
          ? 'border-[#b45309] bg-amber-50/60 shadow-card'
          : 'border-border bg-bg-card shadow-card hover:border-border-strong',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="h-2 w-2 flex-shrink-0 rounded-full"
            style={{ backgroundColor: commission.level?.nom === 'Bronze' ? '#cd7f32' : '#1a3260' }}
          />
          <p className="text-xs font-bold text-primary">
            {commission.level?.nom ?? 'Niveau inconnu'}
          </p>
        </div>
        <p className="mt-1 text-sm text-text">{commission.description}</p>
        {commission.filleul && (
          <p className="mt-1 text-[11px] text-text-muted">
            Filleul : {commission.filleul.client.prenom} {commission.filleul.client.nom}
          </p>
        )}
        <p className="mt-1 text-[10px] text-text-subtle">
          Validée le {format(new Date(commission.valideeAt || commission.createdAt), 'd MMM yyyy', { locale: fr })}
        </p>
      </div>
      <div className="flex flex-col items-end gap-2">
        <p className="whitespace-nowrap text-base font-bold tabular-nums text-[#b45309]">
          ${commission.montant.toLocaleString('en-US', { minimumFractionDigits: 2 })}
        </p>
        <span
          aria-hidden
          className={cn(
            'flex h-5 w-5 items-center justify-center rounded-full border-2',
            isSelected ? 'border-[#b45309] bg-[#b45309]' : 'border-border-strong',
          )}
        >
          {isSelected && <CheckCircle2 size={13} className="text-white" />}
        </span>
      </div>
    </button>
  );
}

// ── Carte demande de retrait ──────────────────────────────────────────────────

function WithdrawalRequestCard({
  request,
  onCancel,
}: {
  request: WithdrawalRequest;
  onCancel?: () => void;
}) {
  const statusConfig = {
    EN_ATTENTE: { label: 'En attente', icon: Clock, color: 'bg-amber-50 text-amber-700' },
    APPROUVE: { label: 'Approuvé', icon: CheckCircle2, color: 'bg-blue-50 text-[#2E86C1]' },
    PAYE: { label: 'Payé', icon: CheckCircle2, color: 'bg-emerald-50 text-emerald-700' },
    REJETE: { label: 'Rejeté', icon: XCircle, color: 'bg-red-50 text-red-600' },
    ANNULE: { label: 'Annulé', icon: XCircle, color: 'bg-bg-inset text-text-muted' },
  };

  const status = statusConfig[request.statut];
  const StatusIcon = status.icon;

  return (
    <div className="rounded-2xl border border-border bg-bg-card p-4 shadow-card">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-bold tabular-nums text-primary">
            ${request.montant.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-text-muted">
            {request.type === 'MOBILE_MONEY' ? (
              <>
                <Smartphone size={12} className="mr-1 inline" />
                Mobile Money — {request.provider}
              </>
            ) : (
              <>
                <Banknote size={12} className="mr-1 inline" />
                Espèces sur place
              </>
            )}
          </p>
          {request.phoneNumber && (
            <p className="mt-0.5 text-[11px] text-text-subtle">{request.phoneNumber}</p>
          )}
        </div>
        <span className={cn('flex items-center gap-1.5 rounded-full px-3 py-1', status.color)}>
          <StatusIcon size={12} />
          <span className="text-[10px] font-bold uppercase tracking-wide">{status.label}</span>
        </span>
      </div>

      <div className="space-y-1 text-xs text-text-muted">
        <p>Demandé le {format(new Date(request.createdAt), 'd MMM yyyy à HH:mm', { locale: fr })}</p>
        {request.approvedAt && (
          <p className="text-emerald-700">
            Approuvé le {format(new Date(request.approvedAt), 'd MMM yyyy à HH:mm', { locale: fr })}
          </p>
        )}
        {request.paidAt && (
          <p className="font-semibold text-emerald-700">
            Payé le {format(new Date(request.paidAt), 'd MMM yyyy à HH:mm', { locale: fr })}
          </p>
        )}
        {request.rejectReason && (
          <p className="mt-1.5 text-red-600">
            <AlertCircle size={12} className="mr-1 inline" />
            Motif du rejet : {request.rejectReason}
          </p>
        )}
        {request.notes && (
          <p className="mt-1.5 italic text-text-muted">Note : {request.notes}</p>
        )}
      </div>

      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="mt-3 h-10 w-full rounded-lg border border-border text-xs font-semibold text-text-muted transition-colors duration-150 hover:bg-bg"
        >
          Annuler la demande
        </button>
      )}

      <p className="mt-2 text-[10px] text-text-subtle">
        {request.commissionIds.length} commission{request.commissionIds.length > 1 ? 's' : ''} incluse{request.commissionIds.length > 1 ? 's' : ''}
      </p>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PortalWithdrawalPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [withdrawalType, setWithdrawalType] = useState<'MOBILE_MONEY' | 'CASH'>('MOBILE_MONEY');
  const [provider, setProvider] = useState<'VODACOM_MPESA_COD' | 'AIRTEL_COD' | 'ORANGE_COD'>('VODACOM_MPESA_COD');
  const [phoneNumber, setPhoneNumber] = useState('243');
  const [notes, setNotes] = useState('');
  const [activeTab, setActiveTab] = useState<'new' | 'history'>('new');

  // Commissions validées
  const { data: commissionsData, isLoading: isLoadingCommissions } = useQuery({
    queryKey: ['portal', 'commissions', 'validated'],
    queryFn: () => portalApi.getValidatedCommissions(),
  });

  // Demandes de retrait
  const { data: requestsData, isLoading: isLoadingRequests } = useQuery({
    queryKey: ['portal', 'withdrawal-requests'],
    queryFn: () => portalApi.getWithdrawalRequests({ page: 1, limit: 50 }),
  });

  const createWithdrawalMutation = useMutation({
    mutationFn: portalApi.createWithdrawalRequest,
    onSuccess: () => {
      toast.success('Demande de retrait créée avec succès !');
      setSelectedIds([]);
      setNotes('');
      setPhoneNumber('243');
      setActiveTab('history');
      queryClient.invalidateQueries({ queryKey: ['portal', 'commissions', 'validated'] });
      queryClient.invalidateQueries({ queryKey: ['portal', 'withdrawal-requests'] });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message ?? 'Erreur lors de la création de la demande');
    },
  });

  const cancelWithdrawalMutation = useMutation({
    mutationFn: (requestId: string) => portalApi.cancelWithdrawalRequest(requestId),
    onSuccess: () => {
      toast.success('Demande annulée');
      queryClient.invalidateQueries({ queryKey: ['portal', 'commissions', 'validated'] });
      queryClient.invalidateQueries({ queryKey: ['portal', 'withdrawal-requests'] });
    },
    onError: (error: any) =>
      toast.error(error?.response?.data?.message ?? 'Erreur lors de l\'annulation'),
  });

  const commissions = commissionsData?.commissions ?? [];
  const totalDisponible = commissionsData?.totalDisponible ?? 0;
  const requests = requestsData?.requests ?? [];

  const selectedCommissions = commissions.filter((c) => selectedIds.includes(c.id));
  const selectedTotal = selectedCommissions.reduce((sum, c) => sum + c.montant, 0);

  const toggleCommission = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((cid) => cid !== id) : [...prev, id],
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (selectedIds.length === 0) {
      toast.error('Veuillez sélectionner au moins une commission');
      return;
    }

    if (withdrawalType === 'MOBILE_MONEY' && (!provider || !phoneNumber || phoneNumber.length < 12)) {
      toast.error('Veuillez fournir un numéro de téléphone valide');
      return;
    }

    createWithdrawalMutation.mutate({
      montant: selectedTotal,
      type: withdrawalType,
      provider: withdrawalType === 'MOBILE_MONEY' ? provider : undefined,
      phoneNumber: withdrawalType === 'MOBILE_MONEY' ? phoneNumber : undefined,
      commissionIds: selectedIds,
      notes: notes || undefined,
    });
  };

  return (
    <PortalLayout title="Mes commissions" showBackButton onBack={() => navigate('/portal/home')}>
      <div className="px-4 py-4">

        {/* Solde disponible */}
        <div
          className="relative mb-5 overflow-hidden rounded-2xl text-white"
          style={{ background: 'linear-gradient(150deg, #7c2d12 0%, #92400e 55%, #b45309 100%)' }}
        >
          <div
            aria-hidden
            className="absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage:
                'repeating-linear-gradient(115deg, transparent 0 9px, #ffffff 9px 10px)',
            }}
          />
          <div className="relative p-5">
            <div className="flex items-center gap-1.5">
              <DollarSign size={13} />
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/70">
                Commissions disponibles
              </p>
            </div>
            <p className="mt-2 font-mono text-[26px] font-bold leading-none tabular-nums">
              ${totalDisponible.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
            <p className="mt-1.5 text-xs text-white/60">
              {commissions.length} commission{commissions.length > 1 ? 's' : ''} validée{commissions.length > 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {/* Onglets */}
        <div className="mb-4 flex gap-1 rounded-xl bg-bg-inset p-1">
          <button
            type="button"
            onClick={() => setActiveTab('new')}
            className={cn(
              'h-9 flex-1 rounded-lg text-sm font-semibold transition-all duration-150',
              activeTab === 'new' ? 'bg-bg-card text-primary shadow-sm' : 'text-text-muted hover:text-text',
            )}
          >
            Nouvelle demande
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={cn(
              'h-9 flex-1 rounded-lg text-sm font-semibold transition-all duration-150',
              activeTab === 'history' ? 'bg-bg-card text-primary shadow-sm' : 'text-text-muted hover:text-text',
            )}
          >
            Historique ({requests.length})
          </button>
        </div>

        {/* Onglet : nouvelle demande */}
        {activeTab === 'new' && (
          <div className="space-y-4">
            {isLoadingCommissions ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="skeleton h-24 rounded-2xl" />
                ))}
              </div>
            ) : commissions.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border py-10 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-bg-inset">
                  <DollarSign size={20} className="text-text-subtle" />
                </div>
                <p className="mb-0.5 text-sm font-medium text-text">
                  Aucune commission disponible
                </p>
                <p className="text-xs text-text-muted">
                  Vos commissions validées apparaîtront ici.
                </p>
              </div>
            ) : (
              <>
                <div>
                  <p className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-text-subtle">
                    Sélectionnez les commissions à retirer
                  </p>
                  <div className="space-y-2.5">
                    {commissions.map((commission) => (
                      <CommissionCard
                        key={commission.id}
                        commission={commission}
                        isSelected={selectedIds.includes(commission.id)}
                        onToggle={() => toggleCommission(commission.id)}
                      />
                    ))}
                  </div>
                </div>

                {selectedIds.length > 0 && (
                  <form
                    onSubmit={handleSubmit}
                    className="animate-fade-in space-y-4 rounded-2xl border border-[#b45309]/40 bg-amber-50/40 p-5 shadow-card"
                  >
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-subtle">
                        Montant sélectionné
                      </p>
                      <p className="mt-1 text-2xl font-bold tabular-nums text-[#b45309]">
                        ${selectedTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </p>
                      <p className="mt-0.5 text-xs text-text-muted">
                        {selectedIds.length} commission{selectedIds.length > 1 ? 's' : ''} sélectionnée{selectedIds.length > 1 ? 's' : ''}
                      </p>
                    </div>

                    <div>
                      <p className="mb-2 text-xs font-semibold text-text">Mode de retrait</p>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setWithdrawalType('MOBILE_MONEY')}
                          aria-pressed={withdrawalType === 'MOBILE_MONEY'}
                          className={cn(
                            'flex h-11 items-center justify-center gap-2 rounded-xl border text-sm font-semibold transition-colors duration-150',
                            withdrawalType === 'MOBILE_MONEY'
                              ? 'border-[#b45309] bg-[#b45309] text-white'
                              : 'border-border bg-bg-card text-text-muted hover:border-border-strong',
                          )}
                        >
                          <Smartphone size={16} />
                          Mobile Money
                        </button>
                        <button
                          type="button"
                          onClick={() => setWithdrawalType('CASH')}
                          aria-pressed={withdrawalType === 'CASH'}
                          className={cn(
                            'flex h-11 items-center justify-center gap-2 rounded-xl border text-sm font-semibold transition-colors duration-150',
                            withdrawalType === 'CASH'
                              ? 'border-[#b45309] bg-[#b45309] text-white'
                              : 'border-border bg-bg-card text-text-muted hover:border-border-strong',
                          )}
                        >
                          <Banknote size={16} />
                          Espèces
                        </button>
                      </div>
                    </div>

                    {withdrawalType === 'MOBILE_MONEY' && (
                      <>
                        <div>
                          <label htmlFor="wd-provider" className="mb-2 block text-xs font-semibold text-text">
                            Opérateur
                          </label>
                          <select
                            id="wd-provider"
                            value={provider}
                            onChange={(e) => setProvider(e.target.value as typeof provider)}
                            className="rounded-xl"
                          >
                            <option value="VODACOM_MPESA_COD">M-Pesa (Vodacom)</option>
                            <option value="AIRTEL_COD">Airtel Money</option>
                            <option value="ORANGE_COD">Orange Money</option>
                          </select>
                        </div>

                        <div>
                          <label htmlFor="wd-phone" className="mb-2 block text-xs font-semibold text-text">
                            Numéro de téléphone
                          </label>
                          <input
                            id="wd-phone"
                            type="tel"
                            required
                            pattern="^243[0-9]{9}$"
                            value={phoneNumber}
                            onChange={(e) => setPhoneNumber(e.target.value)}
                            placeholder="243XXXXXXXXX"
                            className="rounded-xl"
                          />
                        </div>
                      </>
                    )}

                    {withdrawalType === 'CASH' && (
                      <div className="rounded-xl border border-blue-100 bg-blue-50 p-3">
                        <p className="text-xs text-blue-800">
                          <AlertCircle size={13} className="mr-1 inline" />
                          Vous devrez vous présenter au bureau pour retirer vos commissions en espèces après approbation.
                        </p>
                      </div>
                    )}

                    <div>
                      <label htmlFor="wd-notes" className="mb-2 block text-xs font-semibold text-text">
                        Note (optionnel)
                      </label>
                      <textarea
                        id="wd-notes"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Ajoutez une note..."
                        rows={2}
                        className="resize-none rounded-xl"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={createWithdrawalMutation.isPending}
                      className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#b45309] text-sm font-bold text-white transition-colors duration-150 hover:bg-[#92400e] disabled:opacity-50"
                    >
                      {createWithdrawalMutation.isPending && <Loader2 size={16} className="animate-spin" />}
                      {createWithdrawalMutation.isPending ? 'Envoi en cours...' : 'Soumettre la demande'}
                    </button>
                  </form>
                )}
              </>
            )}
          </div>
        )}

        {/* Onglet : historique */}
        {activeTab === 'history' && (
          <div>
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-text-subtle">
              Mes demandes de retrait
            </p>

            {isLoadingRequests ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="skeleton h-28 rounded-2xl" />
                ))}
              </div>
            ) : requests.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border py-10 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-bg-inset">
                  <Clock size={20} className="text-text-subtle" />
                </div>
                <p className="mb-0.5 text-sm font-medium text-text">
                  Aucune demande
                </p>
                <p className="text-xs text-text-muted">
                  Vos demandes de retrait apparaîtront ici.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {requests.map((request) => (
                  <WithdrawalRequestCard
                    key={request.id}
                    request={request}
                    onCancel={
                      request.statut === 'EN_ATTENTE' && !cancelWithdrawalMutation.isPending
                        ? () => cancelWithdrawalMutation.mutate(request.id)
                        : undefined
                    }
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </PortalLayout>
  );
}
