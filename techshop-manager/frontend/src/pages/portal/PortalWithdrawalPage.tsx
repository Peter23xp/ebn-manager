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

// ── Commission Card ───────────────────────────────────────────────────────────

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
      className={cn(
        'w-full text-left bg-white border-2 rounded-xl p-4 transition-all',
        isSelected
          ? 'border-[#b45309] bg-orange-50/30'
          : 'border-neutral-100 hover:border-neutral-200',
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: commission.level?.nom === 'Bronze' ? '#cd7f32' : '#1a3260' }}
            />
            <p className="text-xs font-bold text-[#0A1628]">
              {commission.level?.nom ?? 'Niveau inconnu'}
            </p>
          </div>
          <p className="text-sm text-neutral-600 mb-2">
            {commission.description}
          </p>
          {commission.filleul && (
            <p className="text-[10px] text-neutral-500">
              Filleul: {commission.filleul.client.prenom} {commission.filleul.client.nom}
            </p>
          )}
          <p className="text-[10px] text-neutral-400 mt-1">
            Validée le {format(new Date(commission.valideeAt || commission.createdAt), 'd MMM yyyy', { locale: fr })}
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-[#b45309]">
            ${commission.montant.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </p>
          <div
            className={cn(
              'w-5 h-5 rounded-full border-2 mt-2 flex items-center justify-center',
              isSelected ? 'border-[#b45309] bg-[#b45309]' : 'border-neutral-300',
            )}
          >
            {isSelected && <CheckCircle2 size={14} className="text-white" />}
          </div>
        </div>
      </div>
    </button>
  );
}

// ── Withdrawal Request Card ───────────────────────────────────────────────────

function WithdrawalRequestCard({ request }: { request: WithdrawalRequest }) {
  const statusConfig = {
    EN_ATTENTE: { label: 'En attente', icon: Clock, color: 'text-yellow-600 bg-yellow-50' },
    APPROUVE: { label: 'Approuvé', icon: CheckCircle2, color: 'text-blue-600 bg-blue-50' },
    PAYE: { label: 'Payé', icon: CheckCircle2, color: 'text-green-600 bg-green-50' },
    REJETE: { label: 'Rejeté', icon: XCircle, color: 'text-red-600 bg-red-50' },
    ANNULE: { label: 'Annulé', icon: XCircle, color: 'text-neutral-600 bg-neutral-50' },
  };

  const status = statusConfig[request.statut];
  const StatusIcon = status.icon;

  return (
    <div className="bg-white border border-neutral-100 rounded-xl p-4 shadow-sm">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-lg font-bold text-[#0A1628]">
            ${request.montant.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-neutral-500">
            {request.type === 'MOBILE_MONEY' ? (
              <>
                <Smartphone size={12} className="inline mr-1" />
                Mobile Money - {request.provider}
              </>
            ) : (
              <>
                <Banknote size={12} className="inline mr-1" />
                Espèces sur place
              </>
            )}
          </p>
          {request.phoneNumber && (
            <p className="text-[10px] text-neutral-400 mt-0.5">{request.phoneNumber}</p>
          )}
        </div>
        <div className={cn('px-3 py-1 rounded-full flex items-center gap-1.5', status.color)}>
          <StatusIcon size={12} />
          <span className="text-[10px] font-bold uppercase tracking-wide">{status.label}</span>
        </div>
      </div>

      <div className="text-xs text-neutral-500 space-y-1">
        <p>Demandé le {format(new Date(request.createdAt), 'd MMM yyyy à HH:mm', { locale: fr })}</p>
        {request.approvedAt && (
          <p className="text-green-600">
            Approuvé le {format(new Date(request.approvedAt), 'd MMM yyyy à HH:mm', { locale: fr })}
          </p>
        )}
        {request.paidAt && (
          <p className="text-green-700 font-semibold">
            Payé le {format(new Date(request.paidAt), 'd MMM yyyy à HH:mm', { locale: fr })}
          </p>
        )}
        {request.rejectReason && (
          <p className="text-red-600 mt-2">
            <AlertCircle size={12} className="inline mr-1" />
            Motif du rejet: {request.rejectReason}
          </p>
        )}
        {request.notes && (
          <p className="text-neutral-600 mt-2 italic">Note: {request.notes}</p>
        )}
      </div>

      <p className="text-[10px] text-neutral-400 mt-2">
        {request.commissionIds.length} commission{request.commissionIds.length > 1 ? 's' : ''} incluse{request.commissionIds.length > 1 ? 's' : ''}
      </p>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PortalWithdrawalPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [withdrawalType, setWithdrawalType] = useState<'MOBILE_MONEY' | 'CASH'>('MOBILE_MONEY');
  const [provider, setProvider] = useState<'VODACOM_MPESA_COD' | 'AIRTEL_COD' | 'ORANGE_COD'>('VODACOM_MPESA_COD');
  const [phoneNumber, setPhoneNumber] = useState('243');
  const [notes, setNotes] = useState('');
  const [activeTab, setActiveTab] = useState<'new' | 'history'>('new');

  // Fetch validated commissions
  const { data: commissionsData, isLoading: isLoadingCommissions } = useQuery({
    queryKey: ['portal', 'commissions', 'validated'],
    queryFn: () => portalApi.getValidatedCommissions(),
  });

  // Fetch withdrawal requests
  const { data: requestsData, isLoading: isLoadingRequests } = useQuery({
    queryKey: ['portal', 'withdrawal-requests'],
    queryFn: () => portalApi.getWithdrawalRequests({ page: 1, limit: 50 }),
  });

  // Create withdrawal request mutation
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
      <div className="px-4 py-4 space-y-5">
        {/* Header avec solde total disponible */}
        <div
          className="rounded-2xl p-5 text-white shadow-lg relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #b45309 0%, #d97706 100%)' }}
        >
          <div className="absolute -top-12 -right-12 w-32 h-32 bg-white/10 rounded-full blur-2xl" />
          <div className="relative z-10">
            <div className="flex items-center gap-1.5 mb-1">
              <DollarSign size={14} />
              <p className="text-[10px] font-semibold uppercase tracking-widest text-white/80">
                Commissions disponibles
              </p>
            </div>
            <p className="text-2xl font-bold font-mono">
              ${totalDisponible.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-white/70 mt-1">
              {commissions.length} commission{commissions.length > 1 ? 's' : ''} validée{commissions.length > 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-neutral-200">
          <button
            type="button"
            onClick={() => setActiveTab('new')}
            className={cn(
              'px-4 py-2 text-sm font-semibold transition-colors border-b-2',
              activeTab === 'new'
                ? 'border-[#b45309] text-[#b45309]'
                : 'border-transparent text-neutral-500',
            )}
          >
            Nouvelle demande
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={cn(
              'px-4 py-2 text-sm font-semibold transition-colors border-b-2',
              activeTab === 'history'
                ? 'border-[#b45309] text-[#b45309]'
                : 'border-transparent text-neutral-500',
            )}
          >
            Historique ({requests.length})
          </button>
        </div>

        {/* Tab: Nouvelle demande */}
        {activeTab === 'new' && (
          <div className="space-y-4">
            {isLoadingCommissions ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-28 rounded-xl animate-pulse bg-neutral-200" />
                ))}
              </div>
            ) : commissions.length === 0 ? (
              <div className="py-12 text-center">
                <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-3">
                  <DollarSign size={20} className="text-neutral-400" />
                </div>
                <p className="text-sm font-medium text-neutral-600 mb-1">
                  Aucune commission disponible
                </p>
                <p className="text-xs text-neutral-500">
                  Vos commissions validées apparaîtront ici.
                </p>
              </div>
            ) : (
              <>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-neutral-400 mb-3">
                    Sélectionnez les commissions à retirer
                  </p>
                  <div className="space-y-2">
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
                  <form onSubmit={handleSubmit} className="rounded-2xl border-2 border-[#b45309] bg-orange-50/30 p-5 space-y-4">
                    <div>
                      <p className="text-sm font-bold text-[#0A1628] mb-1">
                        Montant sélectionné
                      </p>
                      <p className="text-2xl font-bold text-[#b45309]">
                        ${selectedTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </p>
                      <p className="text-xs text-neutral-500 mt-1">
                        {selectedIds.length} commission{selectedIds.length > 1 ? 's' : ''} sélectionnée{selectedIds.length > 1 ? 's' : ''}
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-neutral-700 mb-2">
                        Mode de retrait
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setWithdrawalType('MOBILE_MONEY')}
                          className={cn(
                            'h-11 rounded-xl border-2 flex items-center justify-center gap-2 text-sm font-semibold transition-colors',
                            withdrawalType === 'MOBILE_MONEY'
                              ? 'border-[#b45309] bg-[#b45309] text-white'
                              : 'border-neutral-200 text-neutral-600',
                          )}
                        >
                          <Smartphone size={16} />
                          Mobile Money
                        </button>
                        <button
                          type="button"
                          onClick={() => setWithdrawalType('CASH')}
                          className={cn(
                            'h-11 rounded-xl border-2 flex items-center justify-center gap-2 text-sm font-semibold transition-colors',
                            withdrawalType === 'CASH'
                              ? 'border-[#b45309] bg-[#b45309] text-white'
                              : 'border-neutral-200 text-neutral-600',
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
                          <label className="block text-xs font-semibold text-neutral-700 mb-2">
                            Opérateur
                          </label>
                          <select
                            value={provider}
                            onChange={(e) => setProvider(e.target.value as typeof provider)}
                            className="h-11 w-full rounded-xl border border-neutral-200 px-3 text-sm"
                          >
                            <option value="VODACOM_MPESA_COD">M-Pesa (Vodacom)</option>
                            <option value="AIRTEL_COD">Airtel Money</option>
                            <option value="ORANGE_COD">Orange Money</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-neutral-700 mb-2">
                            Numéro de téléphone
                          </label>
                          <input
                            type="tel"
                            required
                            pattern="^243[0-9]{9}$"
                            value={phoneNumber}
                            onChange={(e) => setPhoneNumber(e.target.value)}
                            placeholder="243XXXXXXXXX"
                            className="h-11 w-full rounded-xl border border-neutral-200 px-3 text-sm"
                          />
                        </div>
                      </>
                    )}

                    {withdrawalType === 'CASH' && (
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                        <p className="text-xs text-blue-700">
                          <AlertCircle size={14} className="inline mr-1" />
                          Vous devrez vous présenter au bureau pour retirer vos commissions en espèces après approbation.
                        </p>
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-semibold text-neutral-700 mb-2">
                        Note (optionnel)
                      </label>
                      <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Ajoutez une note..."
                        rows={2}
                        className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm resize-none"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={createWithdrawalMutation.isPending}
                      className="h-11 w-full rounded-xl bg-[#b45309] text-sm font-bold text-white disabled:opacity-50 flex items-center justify-center gap-2"
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

        {/* Tab: Historique */}
        {activeTab === 'history' && (
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-neutral-400 mb-3">
              Mes demandes de retrait
            </p>

            {isLoadingRequests ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-32 rounded-xl animate-pulse bg-neutral-200" />
                ))}
              </div>
            ) : requests.length === 0 ? (
              <div className="py-12 text-center">
                <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-3">
                  <Clock size={20} className="text-neutral-400" />
                </div>
                <p className="text-sm font-medium text-neutral-600 mb-1">
                  Aucune demande
                </p>
                <p className="text-xs text-neutral-500">
                  Vos demandes de retrait apparaîtront ici.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {requests.map((request) => (
                  <WithdrawalRequestCard key={request.id} request={request} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </PortalLayout>
  );
}
