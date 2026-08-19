import { openDB, IDBPDatabase } from 'idb';

const DB_NAME = 'ebn-network-offline';
const DB_VERSION = 2;

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
      if (oldVersion < 2) {
        if (!database.objectStoreNames.contains('dashboardCache')) {
          const store = database.createObjectStore('dashboardCache', { keyPath: 'key' });
          store.createIndex('cachedAt', 'cachedAt');
        }
      }
    },
  });
  return db;
}

export async function savePendingVente(vente: object) {
  const database = await getDB();
  const localId = `offline-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await database.put('pending-ventes', { localId, ...vente, createdAt: new Date().toISOString() });
  return localId;
}

export async function getPendingVentes() {
  const database = await getDB();
  return database.getAll('pending-ventes');
}

export async function removePendingVente(localId: string) {
  const database = await getDB();
  return database.delete('pending-ventes', localId);
}

export async function cacheData(key: string, data: unknown) {
  const database = await getDB();
  return database.put('cache', { key, data, cachedAt: new Date().toISOString() });
}

export async function getCachedData<T>(key: string): Promise<{ data: T; cachedAt: string } | null> {
  const database = await getDB();
  return database.get('cache', key);
}

// Dashboard cache helpers
export async function saveDashboardCache(key: string, data: unknown) {
  const database = await getDB();
  return database.put('dashboardCache', { key, data, cachedAt: new Date().toISOString() });
}

export async function getDashboardCache<T>(key: string): Promise<{ data: T; cachedAt: string } | null> {
  const database = await getDB();
  return database.get('dashboardCache', key);
}
