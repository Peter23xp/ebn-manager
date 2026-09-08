import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, UserPlus, Clock, Loader2, Link2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MlmApi } from '@/lib/mlm.api';
import { formatDate } from '@/lib/utils';
import { Modal } from '@/components/ui/Modal';
import toast from 'react-hot-toast';

type PendingClaim = Awaited<ReturnType<typeof MlmApi.listPendingClaims>>[number];

const STATUT_BADGE: Record<string, string> = {
  ACTIF: 'badge-success',
  EN_COURS: 'badge-warning',
};

export default function MlmClaimsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: claims = [], isLoading } = useQuery({
    queryKey: ['mlm-claims-pending'],
    queryFn: () => MlmApi.listPendingClaims(),
  });

  // Grouper par parrain : un seul code facture rattache tous ses filleuls
  const grouped = useMemo(() => {
    const map = new Map<string, { parrain: PendingClaim['parrain']; claims: PendingClaim[] }>();
    for (const c of claims) {
      const entry = map.get(c.parrain.id) ?? { parrain: c.parrain, claims: [] };
      entry.claims.push(c);
      map.set(c.parrain.id, entry);
    }
    return Array.from(map.values());
  }, [claims]);

  const [confirmTarget, setConfirmTarget] = useState<{ parrain: PendingClaim['parrain']; nb: number } | null>(null);
  const [code, setCode] = useState('');

  const confirmMut = useMutation({
    mutationFn: () => MlmApi.confirmClaim({
      parrainClientId: confirmTarget!.parrain.id,
      codeFacture: code,
    }),
    onSuccess: (res) => {
      const conflits = res.conflits ?? 0;
      toast.success(
        `${res.attachés} filleul(s) rattaché(s)${conflits ? ` — ${conflits} conflit(s) à trancher` : ''}.`,
      );
      setConfirmTarget(null);
      setCode('');
      queryClient.invalidateQueries({ queryKey: ['mlm-claims-pending'] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Échec de la confirmation'),
  });

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
          <h1 className="text-page-title text-primary">Filleuls en attente de parrain</h1>
          <p className="text-xs text-text-muted mt-0.5">
            Parrainés enregistrés avant l'activation de leur parrain — rattacher avec le code de sa facture d'activation
          </p>
        </div>
      </div>

      {/* Table groupée par parrain */}
      <div className="rounded-xl border border-border bg-bg-card shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="px-5 py-3.5 text-left">Parrain</th>
                <th className="px-5 py-3.5 text-left">Statut parrain</th>
                <th className="px-5 py-3.5 text-left">Filleuls en attente</th>
                <th className="px-5 py-3.5 text-left">Depuis</th>
                <th className="px-5 py-3.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [...Array(3)].map((_, i) => (
                  <tr key={i}>
                    <td colSpan={5} className="px-5 py-4">
                      <div className="skeleton h-6 rounded w-full" />
                    </td>
                  </tr>
                ))
              ) : grouped.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-text-muted">
                    Aucune réclamation en attente.
                  </td>
                </tr>
              ) : (
                grouped.map(({ parrain, claims: filleuls }) => (
                  <tr key={parrain.id} className="hover:bg-blue-50/40 transition-colors border-t border-border">
                    <td className="px-5 py-3">
                      <p className="font-semibold text-text">{parrain.prenom} {parrain.nom}</p>
                      <p className="text-xs text-text-muted font-mono">{parrain.telephone}</p>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`badge ${STATUT_BADGE[parrain.statut] ?? 'badge-info'}`}>
                        <Clock size={12} /> {parrain.statut === 'ACTIF' ? 'Activé' : 'En cours d\'activation'}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <p className="text-sm text-text">
                        {filleuls.map((f) => `${f.filleul.prenom} ${f.filleul.nom}`).join(', ')}
                      </p>
                      <p className="text-xs text-text-muted">{filleuls.length} filleul(s)</p>
                    </td>
                    <td className="px-5 py-3 text-xs text-text-muted">
                      {formatDate(filleuls[0].createdAt)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => { setConfirmTarget({ parrain, nb: filleuls.length }); setCode(''); }}
                        className="btn-primary text-[13px] flex items-center gap-1 ml-auto"
                      >
                        <Link2 size={12} /> Confirmer par code facture
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de confirmation */}
      <Modal
        open={!!confirmTarget}
        onClose={() => { setConfirmTarget(null); setCode(''); }}
        title="Confirmer le rattachement"
        size="sm"
      >
        {confirmTarget && (
          <div className="space-y-4">
            <p className="text-sm text-text-muted">
              Saisissez le code de la facture d'activation de{' '}
              <span className="font-semibold text-text">
                {confirmTarget.parrain.prenom} {confirmTarget.parrain.nom}
              </span>{' '}
              (les 4 derniers chiffres, ex. <span className="font-mono">0047</span>, ou le numéro complet)
              pour rattacher ses {confirmTarget.nb} filleul(s) et déclencher ses commissions.
            </p>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Code facture (ex. 0047)"
              className="w-full"
              autoFocus
              data-testid="input-code-facture-admin"
            />
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => { setConfirmTarget(null); setCode(''); }}
                className="btn-secondary text-sm"
              >
                Fermer
              </button>
              <button
                onClick={() => confirmMut.mutate()}
                disabled={!code.trim() || confirmMut.isPending}
                className="btn-primary text-sm flex items-center gap-2 disabled:opacity-50"
              >
                {confirmMut.isPending
                  ? <Loader2 size={14} className="animate-spin" />
                  : <UserPlus size={14} />}
                Confirmer
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
