import { api } from './api';

export type DeletableEntity = 'site' | 'utilisateur' | 'client' | 'produit';

export interface DeletionImpact {
  entity: DeletableEntity;
  id: string;
  label: string;
  canDelete: boolean;
  blockers: { key: string; label: string; count: number }[];
  forbiddenReason: string | null;
  fallback: 'DESACTIVER' | 'ARCHIVER';
  alreadyInactive: boolean;
}

export const adminDeletionApi = {
  impact: (entity: DeletableEntity, id: string) =>
    api.get<DeletionImpact>(`/admin/deletion/${entity}/${encodeURIComponent(id)}`).then((r) => r.data),
  remove: (entity: DeletableEntity, id: string) =>
    api.delete<{ deleted: true; label: string }>(`/admin/deletion/${entity}/${encodeURIComponent(id)}`).then((r) => r.data),
  deactivate: (entity: DeletableEntity, id: string) =>
    api.patch<{ deactivated: true; label: string }>(`/admin/deletion/${entity}/${encodeURIComponent(id)}/deactivate`).then((r) => r.data),
};
