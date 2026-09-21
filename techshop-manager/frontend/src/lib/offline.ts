import { openDB, IDBPDatabase } from 'idb';
import { useAuthStore } from '@/store/auth.store';
import { useUIStore } from '@/store/ui.store';
import { isSiteScopedStaff } from './roles';
import { canSyncPendingVente, isSameOfflineSyncSession } from './offline-sales-sync';
import type { OfflineSyncSession, PendingQueueRecord, PendingVente } from './offline-sales-sync';
import type { CreateVenteDto } from './ventes.api';

const DB_NAME = 'ebn-network-offline';
const DB_VERSION = 3;

let db: IDBPDatabase | null = null;

export async function getDB() {
  if (db) return db;
  db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(database, oldVersion) {
      if (oldVersion < 1) {
        if (!database.objectStoreNames.contains('pending-ventes')) {
          database.createObjectStore('pending-ventes', { keyPath: 'localId' });
        }
        if (!database.objectStoreNames.contains('cache')) {
          database.createObjectStore('cache', { keyPath: 'key' });
        }
      }
      // v2 avait un store dashboardCache jamais utilisé → supprimé en v3
      if (oldVersion < 3 && database.objectStoreNames.contains('dashboardCache')) {
        database.deleteObjectStore('dashboardCache');
      }
    },
  });
  return db;
}

export function getOfflineSyncSession(): OfflineSyncSession {
  const { user, isAuthenticated, sessionVersion } = useAuthStore.getState();
  const effectiveSiteId = user && isSiteScopedStaff(user.role)
    ? user.siteId ?? null
    : user?.siteId ?? useUIStore.getState().selectedSiteId;
  return { user, isAuthenticated, sessionVersion, effectiveSiteId };
}

export async function savePendingVente(payload: CreateVenteDto, session: OfflineSyncSession, options: { reviewRequired?: true } = {}): Promise<string> {
  const localId = `offline-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const record: PendingVente = {
    localId, ownerUserId: session.user?.id ?? '', ownerSiteId: session.effectiveSiteId ?? '',
    createdAt: new Date().toISOString(), payload: structuredClone(payload),
  };
  const validate = () => {
    const current = getOfflineSyncSession();
    if (!isSameOfflineSyncSession(session, current) || !canSyncPendingVente(record, current)) {
      throw new Error('Session non autorisée pour cette vente hors ligne');
    }
  };
  validate();
  const database = await getDB();
  validate();
  if (options.reviewRequired) record.reviewRequired = true;
  await database.put('pending-ventes', record);
  return localId;
}

export async function getPendingVentes(): Promise<PendingQueueRecord[]> {
  const database = await getDB();
  return database.getAll('pending-ventes');
}

export async function removePendingVente(localId: string) {
  const database = await getDB();
  return database.delete('pending-ventes', localId);
}

export async function setPendingVenteReviewRequired(localId: string, required: boolean): Promise<void> {
  const database = await getDB();
  const transaction = database.transaction('pending-ventes', 'readwrite');
  const record = await transaction.store.get(localId);
  if (record) {
    if (required) record.reviewRequired = true;
    else delete record.reviewRequired;
    await transaction.store.put(record);
  }
  await transaction.done;
}

export async function cacheData(key: string, data: unknown) {
  const database = await getDB();
  return database.put('cache', { key, data, cachedAt: new Date().toISOString() });
}

export async function getCachedData<T>(key: string): Promise<{ data: T; cachedAt: string } | null> {
  const database = await getDB();
  return database.get('cache', key);
}
