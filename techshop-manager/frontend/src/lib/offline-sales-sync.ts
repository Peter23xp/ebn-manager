import type { AuthUser } from '@/types';
import type { CreateVenteDto } from './ventes.api';
import { hasMinimumRole, isSiteScopedStaff } from './roles';

export interface PendingVente {
  localId: string;
  ownerUserId: string;
  ownerSiteId: string;
  createdAt: string;
  payload: CreateVenteDto;
  reviewRequired?: true;
}

export const OFFLINE_SALES_REVIEW_MESSAGE = "Des ventes hors ligne nécessitent une vérification par un responsable ; elles n'ont pas été envoyées.";
export const OFFLINE_SALES_UNCERTAIN_MESSAGE = 'Le résultat de certaines ventes doit être vérifié par un responsable ; elles ne seront pas renvoyées automatiquement.';

export type PendingQueueRecord = PendingVente | { localId: string; [key: string]: unknown };

export interface OfflineSyncSession {
  user: AuthUser | null;
  isAuthenticated: boolean;
  sessionVersion: number;
  effectiveSiteId: string | null;
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function canSubmitVente(payload: CreateVenteDto, session: OfflineSyncSession): boolean {
  const { user, isAuthenticated, effectiveSiteId } = session;
  return !!user && isAuthenticated && hasMinimumRole(user.role, 'CAISSIER') &&
    hasText(user.id) && hasText(effectiveSiteId) && payload.siteId === effectiveSiteId &&
    (!isSiteScopedStaff(user.role) || user.siteId === effectiveSiteId);
}

export function isSameOfflineSyncSession(previous: OfflineSyncSession, current: OfflineSyncSession): boolean {
  return previous.sessionVersion === current.sessionVersion &&
    previous.isAuthenticated === current.isAuthenticated && previous.user?.id === current.user?.id &&
    previous.user?.role === current.user?.role && previous.user?.siteId === current.user?.siteId &&
    previous.effectiveSiteId === current.effectiveSiteId;
}

export function canSyncPendingVente(record: PendingQueueRecord, session: OfflineSyncSession): record is PendingVente {
  if (record.reviewRequired || !hasText(record.localId) || !hasText(record.ownerUserId) || !hasText(record.ownerSiteId) ||
    !hasText(record.createdAt) || Number.isNaN(Date.parse(record.createdAt)) ||
    !record.payload || typeof record.payload !== 'object') return false;
  const payload = record.payload as CreateVenteDto;
  return record.ownerUserId === session.user?.id && record.ownerSiteId === payload.siteId &&
    canSubmitVente(payload, session);
}

export function isUncertainVenteError(error: unknown): boolean {
  const failure = error as { code?: string; __CANCEL__?: boolean; request?: unknown; response?: { status?: number } } | null;
  if (failure?.code === 'NETWORK_OFFLINE' || failure?.code === 'MOBILE_MONEY_UNAVAILABLE') return false;
  if ((failure?.code === 'ERR_CANCELED' || failure?.__CANCEL__) && !failure.request) return false;
  const status = failure?.response?.status;
  return !(typeof status === 'number' && status >= 400 && status < 500 && status !== 408);
}

export async function syncPendingVentes(dependencies: {
  load: () => Promise<PendingQueueRecord[]>;
  remove: (localId: string) => Promise<void>;
  setReviewRequired: (localId: string, required: boolean) => Promise<void>;
  send: (payload: CreateVenteDto, sessionVersion: number) => Promise<unknown>;
  getSession: () => OfflineSyncSession;
}): Promise<{ synced: number; blocked: number; failed: number }> {
  const initialSession = dependencies.getSession();
  const records = await dependencies.load();
  const result = { synced: 0, blocked: 0, failed: 0 };

  for (const record of records) {
    const session = dependencies.getSession();
    if (!isSameOfflineSyncSession(initialSession, session) || !canSyncPendingVente(record, session)) {
      result.blocked += 1;
      continue;
    }
    const localId = record.localId;
    try {
      await dependencies.setReviewRequired(localId, true);
      const current = dependencies.getSession();
      if (!isSameOfflineSyncSession(session, current) || !canSyncPendingVente(record, current)) {
        await dependencies.setReviewRequired(localId, false);
        result.blocked += 1;
        continue;
      }
      try {
        await dependencies.send(record.payload, session.sessionVersion);
      } catch (error) {
        if (!isUncertainVenteError(error)) await dependencies.setReviewRequired(localId, false);
        throw error;
      }
      await dependencies.remove(localId);
      result.synced += 1;
    } catch {
      if (isSameOfflineSyncSession(session, dependencies.getSession())) result.failed += 1;
      else result.blocked += 1;
    }
  }
  return result;
}
