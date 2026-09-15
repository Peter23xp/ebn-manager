import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Gift, PackageCheck, Clock, Loader2 } from 'lucide-react';
import { usePendingBonuses } from '@/hooks/useMlm';
import { formatDate } from '@/lib/utils';
import toast from 'react-hot-toast';
import { Pagination } from '@/components/ui/Pagination';

export default function MlmBonusesPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const { data, isLoading, deliverBonus } = usePendingBonuses({ page, limit: 20 });

  const bonuses = data?.bonuses ?? [];
  const meta = data?.meta;

  const handleDeliver = (bonusId: string, nom: string) => {
    deliverBonus.mutate(bonusId, {
      onSuccess: () => toast.success(`${nom} — bonus marqué livré.`),
      onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Erreur lors de la livraison'),
    });
  };

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
          <h1 className="text-page-title text-primary">Bonus physiques à livrer</h1>
          <p className="text-xs text-text-muted mt-0.5">
            Cadeaux liés aux promotions de niveaux (pagnes, kits, écrans, motos…) — marquez-les livrés une fois remis
          </p>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-bg-card shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="px-5 py-3.5 text-left">Bénéficiaire</th>
                <th className="px-5 py-3.5 text-left">Niveau atteint</th>
                <th className="px-5 py-3.5 text-left">Bonus</th>
                <th className="px-5 py-3.5 text-left">Attribué le</th>
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
              ) : bonuses.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-text-muted">
                    <Gift size={28} className="mx-auto mb-2 opacity-40" />
                    Aucun bonus en attente de livraison.
                  </td>
                </tr>
              ) : (
                bonuses.map((b: any) => (
                  <tr key={b.id} className="hover:bg-blue-50/40 transition-colors border-t border-border">
                    <td className="px-5 py-3">
                      <p className="font-semibold text-text">
                        {b.membre?.client?.prenom} {b.membre?.client?.nom}
                      </p>
                      <p className="text-xs text-text-muted font-mono">{b.membre?.client?.telephone}</p>
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-xs font-bold text-text-muted bg-bg px-2 py-1 rounded-full">
                        N{b.level?.ordre} · {b.level?.nom}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <p className="text-sm text-text">{b.description || '—'}</p>
                    </td>
                    <td className="px-5 py-3 text-xs text-text-muted">
                      <span className="inline-flex items-center gap-1">
                        <Clock size={11} /> {formatDate(b.dateAttribution)}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => handleDeliver(b.id, `${b.membre?.client?.prenom} ${b.membre?.client?.nom}`)}
                        disabled={deliverBonus.isPending}
                        className="btn-primary text-[13px] flex items-center gap-1.5 ml-auto"
                      >
                        {deliverBonus.isPending
                          ? <Loader2 size={12} className="animate-spin" />
                          : <PackageCheck size={12} />}
                        Marquer livré
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {meta && meta.totalPages > 1 && (
          <div className="px-5 py-3 border-t border-border">
            <Pagination page={page} totalPages={meta.totalPages} total={meta.total} onPageChange={setPage} isLoading={isLoading} />
          </div>
        )}
      </div>
    </div>
  );
}
