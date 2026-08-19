import React, { useState } from 'react';
import { ArrowLeft, Save, ShieldAlert, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useMlmConfig } from '@/hooks/useMlm';
import { MlmLevelBadge } from '@/components/mlm/MlmLevelBadge';
import { formatUSD } from '@/lib/utils';
import toast from 'react-hot-toast';

export default function MlmConfigPage() {
  const navigate = useNavigate();
  const { data: levels, isLoading, updateConfig } = useMlmConfig();
  const [editingLevel, setEditingLevel] = useState<any | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLevel) return;

    try {
      await updateConfig.mutateAsync({
        levelId: editingLevel.id,
        commissionParFilleul: Number(editingLevel.commissionParFilleul),
        commissionTotale: Number(editingLevel.commissionTotale),
        bonusDescription: editingLevel.bonusDescription,
        salaireMensuel: Number(editingLevel.salaireMensuel),
        salaireActif: editingLevel.salaireActif,
        isActive: editingLevel.isActive,
      });
      toast.success(`Niveau ${editingLevel.nom} mis à jour avec succès !`);
      setEditingLevel(null);
    } catch (err: any) {
      toast.error('Erreur lors de la mise à jour');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/mlm')}
          className="btn btn-ghost p-2 text-gray-500 hover:text-gray-900"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Configuration du Plan MLM</h1>
          <p className="text-sm text-gray-500">Paramètres des 8 niveaux de carrière, commissions et bonus</p>
        </div>
      </div>

      {/* Levels list table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              <tr>
                <th className="px-6 py-3.5">Niveau</th>
                <th className="px-6 py-3.5">Com./Filleul</th>
                <th className="px-6 py-3.5">Com. Totale</th>
                <th className="px-6 py-3.5">Bonus Physique</th>
                <th className="px-6 py-3.5">Salaire Mensuel</th>
                <th className="px-6 py-3.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                [...Array(8)].map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={6} className="px-6 py-4">
                      <div className="h-4 bg-gray-200 rounded w-full" />
                    </td>
                  </tr>
                ))
              ) : (
                levels?.map((l: any) => (
                  <tr key={l.id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="px-6 py-4">
                      <MlmLevelBadge
                        level={l.ordre}
                        size="md"
                      />
                    </td>
                    <td className="px-6 py-4 font-mono font-bold text-gray-900">
                      {formatUSD(l.commissionParFilleul)}
                    </td>
                    <td className="px-6 py-4 font-mono font-bold text-green-700">
                      {formatUSD(l.commissionTotale)}
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-600 max-w-xs truncate">
                      {l.bonusDescription}
                    </td>
                    <td className="px-6 py-4 font-mono text-xs font-semibold">
                      {l.salaireActif ? (
                        <span className="text-purple-700 font-bold">{formatUSD(l.salaireMensuel)} / mois</span>
                      ) : (
                        <span className="text-gray-400">Non applicable</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => setEditingLevel({ ...l })}
                        className="btn btn-outline btn-xs"
                      >
                        Modifier
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit modal */}
      {editingLevel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-5">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              Modifier : {editingLevel.nom} (Niveau {editingLevel.ordre})
            </h2>

            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label text-xs font-bold text-gray-600">Commission / Filleul (USD)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editingLevel.commissionParFilleul}
                    onChange={(e) =>
                      setEditingLevel({ ...editingLevel, commissionParFilleul: e.target.value })
                    }
                    className="input w-full font-mono text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="label text-xs font-bold text-gray-600">Commission Totale (USD)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editingLevel.commissionTotale}
                    onChange={(e) =>
                      setEditingLevel({ ...editingLevel, commissionTotale: e.target.value })
                    }
                    className="input w-full font-mono text-sm"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="label text-xs font-bold text-gray-600">Description du Bonus Physique</label>
                <input
                  type="text"
                  value={editingLevel.bonusDescription}
                  onChange={(e) =>
                    setEditingLevel({ ...editingLevel, bonusDescription: e.target.value })
                  }
                  className="input w-full text-sm"
                  required
                />
              </div>

              <div className="flex items-center gap-4 pt-2">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={editingLevel.salaireActif}
                    onChange={(e) =>
                      setEditingLevel({ ...editingLevel, salaireActif: e.target.checked })
                    }
                    className="checkbox checkbox-primary"
                  />
                  <span className="text-sm font-semibold text-gray-700">Salaire mensuel actif</span>
                </label>
              </div>

              {editingLevel.salaireActif && (
                <div>
                  <label className="label text-xs font-bold text-gray-600">Montant Salaire Mensuel (USD)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editingLevel.salaireMensuel}
                    onChange={(e) =>
                      setEditingLevel({ ...editingLevel, salaireMensuel: e.target.value })
                    }
                    className="input w-full font-mono text-sm"
                  />
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setEditingLevel(null)}
                  className="btn btn-secondary text-sm"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={updateConfig.isPending}
                  className="btn btn-primary text-sm flex items-center gap-2"
                >
                  <Save size={16} />
                  Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
