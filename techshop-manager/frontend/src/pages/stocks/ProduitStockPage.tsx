import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Settings, AlertCircle, Package,
  ArrowUpCircle, ArrowDownCircle, ArrowRightLeft, SlidersHorizontal, Receipt,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useAuthStore } from '@/store/auth.store';
import { stocksApi, getStockStatut } from '@/lib/stocks.api';
import { StockStatusBadge } from '@/components/stocks/StockStatusBadge';
import { cn, formatUSD, formatDateTime } from '@/lib/utils';
import { useDebounce } from '@/hooks/useDebounce';
import type { TypeMouvement } from '@/types';
import { AdminDeleteButton } from '@/components/admin/AdminDeleteButton';

// ── Seuil modal ───────────────────────────────────────────────────────────────

interface EditSeuilModalProps {
  open: boolean;
  onClose: () => void;
  produitId: string;
  produitNom: string;
  siteId: string;
  siteNom: string;
  currentSeuil: number;
  currentStock: number;
  onSuccess: () => void;
}

export function EditSeuilModal({
  open, onClose, produitId, produitNom,
  siteId, siteNom, currentSeuil, currentStock, onSuccess,
}: EditSeuilModalProps) {
  const [seuil, setSeuil] = useState(currentSeuil);
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => stocksApi.updateSeuil(siteId, produitId, seuil),
    onSuccess: () => {
      toast.success(`Seuil mis à jour — ${produitNom} sur ${siteNom} : seuil = ${seuil}`);
      qc.invalidateQueries({ queryKey: ['stock-product', produitId] });
      qc.invalidateQueries({ queryKey: ['stocks'] });
      qc.invalidateQueries({ queryKey: ['stock-alerts'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      onSuccess();
      onClose();
    },
    onError: () => toast.error('Erreur lors de la mise à jour du seuil.'),
  });

  if (!open) return null;

  const preview = getStockStatut(currentStock, seuil);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="font-bold text-[15px] text-primary mb-0.5">Modifier le seuil d'alerte</h3>
        <p className="text-[12px] text-text-muted mb-5">{produitNom} — {siteNom}</p>

        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
            <span className="text-[12px] text-text-muted font-medium">Stock actuel</span>
            <span className="font-mono font-black text-[20px] text-primary">{currentStock}</span>
          </div>

          <div className="form-group">
            <label className="form-label">Seuil d'alerte</label>
            <input
              type="number"
              min={0}
              max={9999}
              value={seuil}
              onChange={e => setSeuil(Math.max(0, parseInt(e.target.value) || 0))}
              className="text-center text-[20px] font-black"
            />
          </div>

          <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
            <span className="text-[12px] text-text-muted font-medium">Statut avec ce seuil</span>
            <StockStatusBadge statut={preview} />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">
            Annuler
          </button>
          <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="btn-primary flex-1"
          >
            {mutation.isPending ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Icône mouvement ───────────────────────────────────────────────────────────

const MOUVEMENT_CONFIG: Record<TypeMouvement, {
  label: string; icon: typeof ArrowUpCircle; color: string; sign: '+' | '-';
}> = {
  ENTREE:                { label: 'Entrée',        icon: ArrowUpCircle,    color: 'text-success',        sign: '+' },
  SORTIE_VENTE:          { label: 'Vente',         icon: ArrowDownCircle,  color: 'text-danger',         sign: '-' },
  TRANSFERT_DEPART:      { label: 'Transfert ↗',   icon: ArrowRightLeft,   color: 'text-warning',        sign: '-' },
  TRANSFERT_ARRIVEE:     { label: 'Transfert ↙',   icon: ArrowRightLeft,   color: 'text-primary-accent', sign: '+' },
  AJUSTEMENT_INVENTAIRE: { label: 'Inventaire',    icon: SlidersHorizontal, color: 'text-platine',       sign: '+' },
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ProduitStockPage() {
  const { produitId } = useParams<{ produitId: string }>();
  const navigate = useNavigate();
  const { hasRole } = useAuthStore();
  const canEdit = hasRole('GERANT');

  const [editSeuil, setEditSeuil] = useState<{ siteId: string; siteNom: string; seuil: number; stock: number } | null>(null);

  // Historique filtres
  const [typeFilter, setTypeFilter] = useState<TypeMouvement | ''>('');
  const [siteFilter, setSiteFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [movPage, setMovPage] = useState(1);

  const debouncedType = useDebounce(typeFilter, 0);

  const { data: product, isLoading, isError } = useQuery({
    queryKey: ['stock-product', produitId],
    queryFn: () => stocksApi.getProductDetail(produitId!),
    enabled: !!produitId,
    staleTime: 3 * 60_000,
  });

  const { data: movements, isLoading: movLoading } = useQuery({
    queryKey: ['stock-movements', produitId, { type: debouncedType, siteFilter, dateFrom, dateTo, movPage }],
    queryFn: () => stocksApi.getMovements(produitId!, {
      type: typeFilter || undefined,
      siteId: siteFilter || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      page: movPage,
      limit: 10,
    }),
    enabled: !!produitId,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });

  if (isLoading) {
    return (
      <div className="space-y-5 animate-fade-in">
        <div className="skeleton h-8 w-48 rounded-lg" />
        <div className="card"><div className="skeleton h-24 rounded" /></div>
        <div className="card"><div className="skeleton h-40 rounded" /></div>
      </div>
    );
  }

  if (isError || !product) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-text-muted">
        <Package size={40} className="opacity-30" />
        <p className="text-[14px] font-semibold">Produit introuvable.</p>
        <button type="button" onClick={() => navigate('/stocks')} className="btn-secondary">
          <ArrowLeft size={14} /> Retour aux stocks
        </button>
      </div>
    );
  }

  const produit = product.produit;
  const stocksBySite = product.stocksBySite ?? (product as any).stocks ?? [];
  const totalStock = product.totalStock ?? (product as any).totalQuantite ?? 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/stocks')}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-border text-text-muted hover:border-border-strong hover:text-text transition-colors"
        >
          <ArrowLeft size={17} />
        </button>
        <div>
          <h1 className="text-[18px] font-extrabold text-primary leading-tight">
            {produit.sku} — {produit.nom}
          </h1>
          <p className="text-[12px] text-text-muted">{produit.categorie}</p>
        </div>
        <AdminDeleteButton
          entity="produit"
          id={produitId!}
          label={produit.nom}
          className="ml-auto"
          onDone={(result) => { if (result === 'deleted') navigate('/stocks', { replace: true }); }}
        />
      </div>

      {/* Carte produit */}
      <div className="card">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1">SKU</p>
            <p className="font-mono font-semibold text-[13px]">{produit.sku}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1">Catégorie</p>
            <p className="text-[13px]">{produit.categorie}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1">Prix vente</p>
            <p className="font-mono font-semibold text-[13px] text-primary-accent">{formatUSD(produit.prixVente)}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1">Prix achat</p>
            <p className="font-mono font-semibold text-[13px] text-text-muted">{formatUSD(produit.prixAchat)}</p>
          </div>
        </div>
        {produit.description && (
          <p className="mt-3 text-[12px] text-text-muted border-t border-border pt-3">{produit.description}</p>
        )}
        <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
          <span className="text-[12px] text-text-muted">Stock total (tous sites)</span>
          <span className="font-mono font-black text-[20px] text-primary">{totalStock}</span>
        </div>
      </div>

      {/* Stock par site */}
      <div className="card space-y-3">
        <h2 className="text-section-title">Stock par site</h2>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Site</th>
                <th className="text-center">Stock</th>
                <th className="text-center">Seuil</th>
                <th>Statut</th>
                <th>Mise à jour</th>
                {canEdit && <th />}
              </tr>
            </thead>
            <tbody>
              {stocksBySite.map(s => {
                const st = getStockStatut(s.quantite, s.seuilAlerte);
                return (
                  <tr
                    key={s.siteId}
                    className={cn(
                      st === 'RUPTURE' && 'bg-red-50/70',
                      st === 'ALERTE' && 'bg-amber-50/70',
                    )}
                  >
                    <td className="font-medium">{s.siteNom}</td>
                    <td className="text-center">
                      <span className={cn(
                        'font-black text-[18px] font-mono',
                        st === 'RUPTURE' && 'text-danger',
                        st === 'ALERTE' && 'text-warning',
                        st === 'OK' && 'text-success',
                      )}>
                        {s.quantite}
                      </span>
                    </td>
                    <td className="text-center font-mono text-[12px] text-text-muted">{s.seuilAlerte}</td>
                    <td><StockStatusBadge statut={st} size="sm" /></td>
                    <td className="text-[12px] text-text-muted">
                      {formatDistanceToNow(new Date(s.updatedAt), { locale: fr, addSuffix: true })}
                    </td>
                    {canEdit && (
                      <td>
                        <button
                          type="button"
                          onClick={() => setEditSeuil({ siteId: s.siteId, siteNom: s.siteNom, seuil: s.seuilAlerte, stock: s.quantite })}
                          className="p-1.5 rounded-lg text-text-muted hover:text-primary hover:bg-primary-light/30 transition-colors"
                          title="Modifier le seuil"
                        >
                          <Settings size={14} />
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Historique mouvements */}
      <div className="card space-y-4">
        <h2 className="text-section-title">Historique des mouvements</h2>

        {/* Filtres */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <select
              value={typeFilter}
              onChange={e => { setTypeFilter(e.target.value as TypeMouvement | ''); setMovPage(1); }}
              className="text-sm pr-8"
            >
              <option value="">Tous types</option>
              <option value="ENTREE">Entrée</option>
              <option value="SORTIE_VENTE">Vente</option>
              <option value="TRANSFERT_DEPART">Transfert ↗</option>
              <option value="TRANSFERT_ARRIVEE">Transfert ↙</option>
              <option value="AJUSTEMENT_INVENTAIRE">Inventaire</option>
            </select>
            <ArrowDownCircle size={12} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-subtle" />
          </div>

          <input
            type="date"
            value={dateFrom}
            onChange={e => { setDateFrom(e.target.value); setMovPage(1); }}
            className="text-sm w-auto"
            placeholder="Du"
          />
          <input
            type="date"
            value={dateTo}
            onChange={e => { setDateTo(e.target.value); setMovPage(1); }}
            className="text-sm w-auto"
            placeholder="Au"
          />
          {(typeFilter || siteFilter || dateFrom || dateTo) && (
            <button
              type="button"
              onClick={() => { setTypeFilter(''); setSiteFilter(''); setDateFrom(''); setDateTo(''); setMovPage(1); }}
              className="text-[12px] text-text-muted hover:text-danger transition-colors"
            >
              Réinitialiser
            </button>
          )}
        </div>

        {movLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="skeleton h-10 rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th className="text-right">Quantité</th>
                  <th className="text-center">Avant</th>
                  <th className="text-center">Après</th>
                  <th>Référence</th>
                  <th>Site</th>
                  <th>Agent</th>
                </tr>
              </thead>
              <tbody>
                {(movements?.mouvements ?? []).map(m => {
                  const cfg = MOUVEMENT_CONFIG[m.type] ?? MOUVEMENT_CONFIG.ENTREE;
                  const Icon = cfg.icon;
                  const isPositive = cfg.sign === '+';
                  const qtyDisplay = (isPositive ? '+' : '-') + Math.abs(m.quantite);
                  return (
                    <tr key={m.id}>
                      <td className="whitespace-nowrap text-[12px] text-text-muted">
                        {formatDateTime(m.createdAt)}
                      </td>
                      <td>
                        <span className={cn('inline-flex items-center gap-1.5 text-[12px] font-medium', cfg.color)}>
                          <Icon size={12} aria-hidden />
                          {cfg.label}
                        </span>
                      </td>
                      <td className={cn('text-right font-mono font-bold text-[13px]', isPositive ? 'text-success' : 'text-danger')}>
                        {qtyDisplay}
                      </td>
                      <td className="text-center font-mono text-[12px] text-text-muted">{m.quantiteAvant}</td>
                      <td className="text-center font-mono text-[12px]">{m.quantiteApres}</td>
                      <td className="text-[12px]">
                        {m.reference ? (
                          m.type === 'SORTIE_VENTE' ? (
                            <Link
                              to={`/sales/${m.reference}`}
                              className="font-mono text-primary-accent hover:underline"
                              onClick={e => e.stopPropagation()}
                            >
                              {m.reference}
                            </Link>
                          ) : (m.type === 'TRANSFERT_DEPART' || m.type === 'TRANSFERT_ARRIVEE') ? (
                            <Link
                              to={`/stocks/transfer/${m.reference}/receive`}
                              className="font-mono text-primary-accent hover:underline"
                              onClick={e => e.stopPropagation()}
                            >
                              {m.reference}
                            </Link>
                          ) : (
                            <span className="font-mono text-text-muted">{m.reference}</span>
                          )
                        ) : <span className="text-text-subtle">—</span>}
                      </td>
                      <td className="text-[12px] text-text-muted">{m.siteNom}</td>
                      <td className="text-[12px] text-text-muted">{m.agentNom}</td>
                    </tr>
                  );
                })}
                {!movLoading && !movements?.mouvements?.length && (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-[13px] text-text-muted">
                      <Receipt size={24} className="mx-auto mb-2 opacity-30" />
                      Aucun mouvement pour ces critères.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {movements && movements.meta.totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-[12px] text-text-muted">
              Page {movements.meta.page} / {movements.meta.totalPages}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMovPage(p => Math.max(1, p - 1))}
                disabled={movements.meta.page <= 1}
                className="btn-secondary text-[12px] py-1.5 px-3"
              >
                Précédent
              </button>
              <button
                type="button"
                onClick={() => setMovPage(p => Math.min(movements.meta.totalPages, p + 1))}
                disabled={movements.meta.page >= movements.meta.totalPages}
                className="btn-secondary text-[12px] py-1.5 px-3"
              >
                Suivant
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal seuil */}
      {editSeuil && (
        <EditSeuilModal
          open
          onClose={() => setEditSeuil(null)}
          produitId={produitId!}
          produitNom={produit.nom}
          siteId={editSeuil.siteId}
          siteNom={editSeuil.siteNom}
          currentSeuil={editSeuil.seuil}
          currentStock={editSeuil.stock}
          onSuccess={() => setEditSeuil(null)}
        />
      )}
    </div>
  );
}
