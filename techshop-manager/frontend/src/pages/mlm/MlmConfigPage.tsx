import React, { useState } from 'react';
import { ArrowLeft, Save, ShieldAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useMlmConfig } from '@/hooks/useMlm';
import { MlmLevelBadge } from '@/components/mlm/MlmLevelBadge';
import { Modal } from '@/components/ui/Modal';
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
          <h1 className="text-page-title text-primary">Configuration du plan MLM</h1>
          <p className="text-xs text-text-muted mt-0.5">Paramètres des 8 niveaux de carrière, commissions et bonus</p>
        </div>
      </div>

      {/* Warning banner */}
      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
        <ShieldAlert size={18} className="text-warning flex-shrink-0 mt-0.5" />
        <p className="text-sm text-text">
          Les modifications affectent les commissions de tous les membres. Vérifiez les montants avant d'enregistrer.
        </p>
      </div>

      {/* Levels list table */}
      <div className="rounded-xl border border-border bg-bg-card shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="px-6 py-3.5">Niveau</th>
                <th className="px-6 py-3.5">Com. / filleul</th>
                <th className="px-6 py-3.5">Com. totale</th>
                <th className="px-6 py-3.5">Bonus physique</th>
                <th className="px-6 py-3.5">Salaire mensuel</th>
                <th className="px-6 py-3.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [...Array(8)].map((_, i) => (
                  <tr key={i}>
                    <td colSpan={6} className="px-6 py-4">
                      <div className="skeleton h-6 rounded w-full" />
                    </td>
                  </tr>
                ))
              ) : (
                levels?.map((l: any) => (
                  <tr key={l.id} className="hover:bg-blue-50/40 transition-colors">
                    <td className="px-6 py-4">
                      <MlmLevelBadge
                        level={l.ordre}
                        name={l.nom}
                        size="md"
                      />
                    </td>
                    <td className="px-6 py-4 font-mono font-bold text-text">
                      {formatUSD(l.commissionParFilleul)}
                    </td>
                    <td className="px-6 py-4 font-mono font-bold text-success">
                      {formatUSD(l.commissionTotale)}
                    </td>
                    <td className="px-6 py-4 text-xs text-text-muted max-w-xs truncate">
                      {l.bonusDescription}
                    </td>
                    <td className="px-6 py-4 font-mono text-xs font-semibold">
                      {l.salaireActif ? (
                        <span className="text-platine font-bold">{formatUSD(l.salaireMensuel)} / mois</span>
                      ) : (
                        <span className="text-text-subtle">Non applicable</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => setEditingLevel({ ...l })}
                        className="btn-secondary text-[13px]"
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
      <Modal
        open={!!editingLevel}
        onClose={() => setEditingLevel(null)}
        title={editingLevel ? `Modifier : ${editingLevel.nom} (Niveau ${editingLevel.ordre})` : ''}
        size="lg"
      >
        {editingLevel && (
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="form-group">
                <label className="form-label" htmlFor="cfg-com-filleul">Commission / filleul (USD)</label>
                <input
                  id="cfg-com-filleul"
                  type="number"
                  step="0.01"
                  value={editingLevel.commissionParFilleul}
                  onChange={(e) =>
                    setEditingLevel({ ...editingLevel, commissionParFilleul: e.target.value })
                  }
                  className="font-mono"
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="cfg-com-totale">Commission totale (USD)</label>
                <input
                  id="cfg-com-totale"
                  type="number"
                  step="0.01"
                  value={editingLevel.commissionTotale}
                  onChange={(e) =>
                    setEditingLevel({ ...editingLevel, commissionTotale: e.target.value })
                  }
                  className="font-mono"
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="cfg-bonus">Description du bonus physique</label>
              <input
                id="cfg-bonus"
                type="text"
                value={editingLevel.bonusDescription}
                onChange={(e) =>
                  setEditingLevel({ ...editingLevel, bonusDescription: e.target.value })
                }
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
                <span className="text-sm font-semibold text-text">Salaire mensuel actif</span>
              </label>
            </div>

            {editingLevel.salaireActif && (
              <div className="form-group">
                <label className="form-label" htmlFor="cfg-salaire">Montant salaire mensuel (USD)</label>
                <input
                  id="cfg-salaire"
                  type="number"
                  step="0.01"
                  value={editingLevel.salaireMensuel}
                  onChange={(e) =>
                    setEditingLevel({ ...editingLevel, salaireMensuel: e.target.value })
                  }
                  className="font-mono"
                />
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              <button
                type="button"
                onClick={() => setEditingLevel(null)}
                className="btn-secondary text-sm"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={updateConfig.isPending}
                className="btn-primary text-sm flex items-center gap-2"
              >
                <Save size={16} />
                Enregistrer
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
