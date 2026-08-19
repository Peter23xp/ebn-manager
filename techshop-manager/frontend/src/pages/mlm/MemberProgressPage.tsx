import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Wallet, Award, History, Layers } from 'lucide-react';
import { useMemberProgress } from '@/hooks/useMlm';
import { MlmLevelBadge } from '@/components/mlm/MlmLevelBadge';
import { CareerProgressBar } from '@/components/mlm/CareerProgressBar';
import { MatrixGrid } from '@/components/mlm/MatrixGrid';
import { formatDate, formatUSD } from '@/lib/utils';

export default function MemberProgressPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading } = useMemberProgress(id ?? '');
  const [selectedMatrixLevelId, setSelectedMatrixLevelId] = useState<number | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-48" />
        <div className="h-36 bg-white rounded-xl border border-gray-200 p-6" />
        <div className="h-64 bg-white rounded-xl border border-gray-200 p-6" />
      </div>
    );
  }

  if (!data?.membre) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500">Membre introuvable.</p>
        <button onClick={() => navigate('/mlm/members')} className="btn btn-secondary mt-4">
          Retour à la liste
        </button>
      </div>
    );
  }

  const { membre, progression, portefeuille, matrices, historiquePromotions } = data;

  // Currently viewed matrix
  const activeMatrix =
    matrices?.find((m: any) => m.niveau.id === (selectedMatrixLevelId ?? membre.level.id)) ??
    matrices?.[0];

  return (
    <div className="space-y-6">
      {/* Top navigation */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/mlm/members')}
          className="btn btn-ghost p-2 text-gray-500 hover:text-gray-900"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {membre.client.prenom} {membre.client.nom}
          </h1>
          <p className="text-sm text-gray-500 font-mono">Matricule : {membre.matricule}</p>
        </div>
      </div>

      {/* Member summary card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm flex flex-wrap items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <MlmLevelBadge
            level={membre.level.ordre}
            size="lg"
          />
          <div>
            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Niveau Actuel</p>
            <p className="text-xl font-bold text-gray-900">{membre.level.nom}</p>
            <p className="text-xs text-gray-500 mt-0.5">Membre depuis le {formatDate(membre.dateActivation)}</p>
          </div>
        </div>

        {/* Wallet balance */}
        {portefeuille && (
          <div className="flex items-center gap-6 border-l border-gray-100 pl-6">
            <div>
              <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Total Gagné</p>
              <p className="text-xl font-extrabold text-green-700 font-mono">
                {formatUSD(portefeuille.totalGagne)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Solde Dispo</p>
              <p className="text-xl font-extrabold text-blue-600 font-mono">
                {formatUSD(portefeuille.soldeDisponible)}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Career progression bar */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <Award size={18} className="text-amber-500" />
            Plan de Carrière (8 Niveaux)
          </h2>
          <span className="text-xs font-semibold text-gray-500">
            Niveau {membre.level.ordre} / 8
          </span>
        </div>
        <CareerProgressBar currentLevel={membre.level.ordre} />
      </div>

      {/* Matrices viewer */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <Layers size={18} className="text-blue-600" />
            Matrice 4 Positions
          </h2>

          {/* Matrix level tabs */}
          {matrices && matrices.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {matrices.map((m: any) => (
                <button
                  key={m.id}
                  onClick={() => setSelectedMatrixLevelId(m.niveau.id)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                    (selectedMatrixLevelId ?? membre.level.id) === m.niveau.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {m.niveau.nom}
                </button>
              ))}
            </div>
          )}
        </div>

        <MatrixGrid matrix={activeMatrix} />
      </div>

      {/* Promotion history */}
      {historiquePromotions && historiquePromotions.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-4">
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <History size={18} className="text-gray-600" />
            Historique des Promotions
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Commission Reçue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {historiquePromotions.map((p: any) => (
                  <tr key={p.id}>
                    <td className="px-4 py-3 text-gray-700">{formatDate(p.datePromotion)}</td>
                    <td className="px-4 py-3 font-mono font-bold text-green-700">
                      {formatUSD(p.commissionVersee)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
