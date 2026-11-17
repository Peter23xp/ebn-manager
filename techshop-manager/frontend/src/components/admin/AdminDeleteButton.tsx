import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Archive, Loader2, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal } from '@/components/ui/Modal';
import { adminDeletionApi, type DeletableEntity } from '@/lib/admin-deletion.api';
import { getErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';

const NOUN: Record<DeletableEntity, string> = {
  site: 'ce site',
  utilisateur: 'cet utilisateur',
  client: 'ce client',
  produit: 'ce produit',
};

interface AdminDeleteButtonProps {
  entity: DeletableEntity;
  id: string;
  /** Nom affiché sur le bouton (accessibilité) avant le chargement des détails. */
  label: string;
  /** Appelé après une suppression ou une désactivation réussie. */
  onDone?: (result: 'deleted' | 'deactivated') => void;
  /** `icon` : bouton compact pour les lignes de liste. */
  variant?: 'icon' | 'button';
  className?: string;
}

/**
 * Bouton « Supprimer » réservé au super admin.
 *
 * Avant de confirmer, il demande au serveur ce qui relie l'élément au reste de
 * l'application. Sans historique : suppression définitive. Avec historique :
 * il explique pourquoi et propose de désactiver (ou d'archiver) à la place.
 */
export function AdminDeleteButton({ entity, id, label, onDone, variant = 'button', className }: AdminDeleteButtonProps) {
  const isSuperAdmin = useAuthStore((s) => s.user?.role === 'SUPER_ADMIN');
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const impact = useQuery({
    queryKey: ['admin-deletion-impact', entity, id],
    queryFn: () => adminDeletionApi.impact(entity, id),
    enabled: open && isSuperAdmin,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });

  const finish = async (result: 'deleted' | 'deactivated', message: string) => {
    toast.success(message);
    setOpen(false);
    // Action rare et transverse : on rafraîchit toutes les listes.
    await queryClient.invalidateQueries();
    onDone?.(result);
  };

  const remove = useMutation({
    mutationFn: () => adminDeletionApi.remove(entity, id),
    onSuccess: (r) => finish('deleted', `« ${r.label} » a été supprimé.`),
    onError: (e) => { toast.error(getErrorMessage(e)); void impact.refetch(); },
  });

  const deactivate = useMutation({
    mutationFn: () => adminDeletionApi.deactivate(entity, id),
    onSuccess: (r) => finish('deactivated', `« ${r.label} » a été ${fallbackDone(impact.data?.fallback)}.`),
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  if (!isSuperAdmin) return null;

  const busy = remove.isPending || deactivate.isPending;
  const data = impact.data;
  const close = () => { if (!busy) setOpen(false); };

  return (
    <>
      {variant === 'icon' ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn('inline-flex h-11 w-11 items-center justify-center rounded-lg text-text-muted hover:bg-red-50 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger', className)}
          aria-label={`Supprimer ${label}`}
          title="Supprimer"
        >
          <Trash2 size={18} aria-hidden />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn('btn-secondary text-danger hover:border-danger hover:bg-red-50', className)}
        >
          <Trash2 size={16} aria-hidden />
          Supprimer
        </button>
      )}

      <Modal open={open} onClose={close} title={`Supprimer ${NOUN[entity]}`} size="sm">
        {impact.isLoading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-text-muted" role="status">
            <Loader2 size={18} className="animate-spin" aria-hidden /> Vérification des données liées…
          </div>
        ) : impact.isError || !data ? (
          <div className="space-y-4">
            <p className="text-sm text-danger" role="alert">{getErrorMessage(impact.error)}</p>
            <div className="flex justify-end"><button type="button" className="btn-secondary" onClick={close}>Fermer</button></div>
          </div>
        ) : data.forbiddenReason ? (
          <div className="space-y-4">
            <p className="flex gap-2 text-sm text-text" role="alert">
              <AlertTriangle size={18} className="mt-0.5 shrink-0 text-warning" aria-hidden />
              {data.forbiddenReason}
            </p>
            <div className="flex justify-end"><button type="button" className="btn-secondary" onClick={close}>Fermer</button></div>
          </div>
        ) : data.canDelete ? (
          <div className="space-y-4">
            <p className="text-sm text-text">
              Supprimer définitivement <strong>« {data.label} »</strong> ? Cette action est irréversible.
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" className="btn-secondary" onClick={close} disabled={busy}>Annuler</button>
              <button type="button" className="btn-danger" onClick={() => remove.mutate()} disabled={busy}>
                {remove.isPending ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Trash2 size={16} aria-hidden />}
                Supprimer définitivement
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2 text-sm text-text">
              <p>
                <strong>« {data.label} »</strong> ne peut pas être supprimé : il est lié à
              </p>
              <ul className="list-disc space-y-1 pl-5">
                {data.blockers.map((b) => <li key={b.key}><strong>{b.count}</strong> {b.label}</li>)}
              </ul>
              <p className="text-text-muted">
                Le supprimer fausserait la comptabilité, le stock ou le réseau.
                {data.alreadyInactive
                  ? ` Il est déjà ${fallbackDone(data.fallback)}.`
                  : ` Vous pouvez le ${data.fallback === 'ARCHIVER' ? 'archiver' : 'désactiver'} : il n’apparaîtra plus comme actif, mais son historique est conservé.`}
              </p>
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" className="btn-secondary" onClick={close} disabled={busy}>
                {data.alreadyInactive ? 'Fermer' : 'Annuler'}
              </button>
              {!data.alreadyInactive && (
                <button type="button" className="btn-primary" onClick={() => deactivate.mutate()} disabled={busy}>
                  {deactivate.isPending ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Archive size={16} aria-hidden />}
                  {data.fallback === 'ARCHIVER' ? 'Archiver' : 'Désactiver'}
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

function fallbackDone(fallback?: 'DESACTIVER' | 'ARCHIVER') {
  return fallback === 'ARCHIVER' ? 'archivé' : 'désactivé';
}
