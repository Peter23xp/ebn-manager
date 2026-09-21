import { useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { useUIStore } from '@/store/ui.store';
import { useAuthStore } from '@/store/auth.store';
import { getOfflineSyncSession, getPendingVentes, removePendingVente, setPendingVenteReviewRequired } from '@/lib/offline';
import { isSameOfflineSyncSession, syncPendingVentes, OFFLINE_SALES_REVIEW_MESSAGE, OFFLINE_SALES_UNCERTAIN_MESSAGE } from '@/lib/offline-sales-sync';
import type { OfflineSyncSession } from '@/lib/offline-sales-sync';
import { ventesApi } from '@/lib/ventes.api';

interface ActiveDrain {
  session: OfflineSyncSession;
  hasSent: boolean;
  promise: ReturnType<typeof syncPendingVentes>;
}

let activeDrain: ActiveDrain | null = null;

export function useOnlineSync() {
  const { setOnline, setPendingSyncCount } = useUIStore();
  const { user, isAuthenticated, sessionVersion } = useAuthStore();
  const effectiveSiteId = getOfflineSyncSession().effectiveSiteId;
  const warnedBlocked = useRef(false);

  useEffect(() => {
    let active = true;

    const refreshCount = async () => {
      const pending = await getPendingVentes();
      if (active) setPendingSyncCount(pending.length);
      return pending;
    };

    const handleOnline = async () => {
      setOnline(true);
      const requestedSession = getOfflineSyncSession();
      try {
        let joinedResult: Awaited<ReturnType<typeof syncPendingVentes>> | undefined;
        while (activeDrain && !isSameOfflineSyncSession(activeDrain.session, requestedSession)) {
          const previousDrain = activeDrain;
          const previousResult = await previousDrain.promise.catch(() => undefined);
          if (!active || !navigator.onLine || !isSameOfflineSyncSession(requestedSession, getOfflineSyncSession())) return;
          if (previousDrain.hasSent && previousResult && previousDrain.session.user?.id === requestedSession.user?.id &&
            previousDrain.session.effectiveSiteId === requestedSession.effectiveSiteId) {
            joinedResult = previousResult;
            break;
          }
        }
        if (!active || !navigator.onLine) return;
        if (!joinedResult && !activeDrain) {
          const drain: ActiveDrain = {
            session: requestedSession,
            hasSent: false,
            promise: syncPendingVentes({
              load: async () => {
                const pending = await getPendingVentes();
                if (active) setPendingSyncCount(pending.length);
                return pending;
              },
              remove: removePendingVente,
              setReviewRequired: setPendingVenteReviewRequired,
              send: (payload, version) => {
                drain.hasSent = true;
                return ventesApi.create(payload, version);
              },
              getSession: getOfflineSyncSession,
            }).finally(() => { activeDrain = null; }),
          };
          activeDrain = drain;
        }
        const result = joinedResult ?? await activeDrain!.promise;
        if (!active) return;
        const pending = await refreshCount();
        if (!active || !isSameOfflineSyncSession(requestedSession, getOfflineSyncSession())) return;
        const requiresReview = pending.some(record => record.reviewRequired);
        const hasBlocked = result.blocked > 0 || requiresReview;
        if (hasBlocked && !warnedBlocked.current) {
          toast(requiresReview ? OFFLINE_SALES_UNCERTAIN_MESSAGE : OFFLINE_SALES_REVIEW_MESSAGE, { id: 'offline-sales-blocked', icon: '⚠️' });
        }
        warnedBlocked.current = hasBlocked;
      } catch {
        if (active) toast.error('Impossible de lire les ventes hors ligne', { id: 'offline-sales-read-error' });
      }
    };

    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    if (navigator.onLine) void handleOnline();
    else void refreshCount().catch(() => undefined);

    return () => {
      active = false;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [setOnline, setPendingSyncCount, effectiveSiteId, isAuthenticated, sessionVersion, user?.id, user?.role, user?.siteId]);
}
