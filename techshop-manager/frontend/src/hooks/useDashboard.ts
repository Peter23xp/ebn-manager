import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { api } from '@/lib/api';
import { getCachedData, cacheData } from '@/lib/offline';
import { useOnlineStatus } from './useOnlineStatus';

export interface DashboardStats {
  clientsActifs: number;
  ventesJour: number;
  alertesStock: number;
  rupturesStock: number;
  nouveauxFilleuls: number;
  trends: {
    clientsActifs: number;
    ventesJour: number;
    nouveauxFilleuls: number;
  };
}

export interface SalesChartDataset {
  site: string;
  siteId: string;
  data: number[];
  color: string;
}

export interface SalesChartData {
  labels: string[];
  datasets: SalesChartDataset[];
}

export interface Transaction {
  id: string;
  numeroVente: string;
  clientNom: string;
  produit: string;
  montant: number;
  site: string;
  statut: string;
  createdAt: string;
}

export interface StockAlert {
  produitNom: string;
  sku: string;
  siteNom: string;
  stockActuel: number;
  seuilAlerte: number;
  type: 'ALERTE' | 'RUPTURE';
}

const STALE_TIME = 2 * 60 * 1000;
const GC_TIME = 10 * 60 * 1000;
const CACHE_TTL = 3600 * 1000;

function buildCacheKey(siteId: string | null, period: string) {
  return `dashboard_${siteId ?? 'all'}_${period}`;
}

export function useDashboard(siteId: string | null, period: 'today' | 'week' | 'month') {
  const isOnline = useOnlineStatus();
  const queryClient = useQueryClient();

  const statsKey = ['dashboard', 'stats', siteId, period] as const;
  const chartKey = ['dashboard', 'chart', siteId] as const;
  const txKey = ['dashboard', 'transactions', siteId] as const;
  const alertsKey = ['dashboard', 'alerts', siteId] as const;

  const fetchWithCache = useCallback(
    async <T>(
      fetchFn: () => Promise<T>,
      cacheField: keyof { stats: unknown; chart: unknown; transactions: unknown; alerts: unknown },
    ): Promise<T> => {
      const key = buildCacheKey(siteId, period);
      try {
        const result = await fetchFn();
        // save to offline cache
        const existing = await getCachedData<Record<string, unknown>>(key);
        await cacheData(key, { ...(existing?.data ?? {}), [cacheField]: result, cachedAt: new Date().toISOString() });
        return result;
      } catch (err) {
        const cached = await getCachedData<Record<string, unknown>>(key);
        if (cached?.data?.[cacheField] !== undefined) {
          return cached.data[cacheField] as T;
        }
        throw err;
      }
    },
    [siteId, period],
  );

  const stats = useQuery<DashboardStats>({
    queryKey: statsKey,
    queryFn: () =>
      fetchWithCache(
        () => {
          const params = new URLSearchParams({ period });
          if (siteId) params.set('siteId', siteId);
          return api.get<DashboardStats>(`/dashboard/stats?${params}`).then((r) => r.data);
        },
        'stats',
      ),
    enabled: isOnline,
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
  });

  const salesChart = useQuery<SalesChartData>({
    queryKey: chartKey,
    queryFn: () =>
      fetchWithCache(
        () => {
          const params = new URLSearchParams({ days: '7' });
          if (siteId) params.set('siteId', siteId);
          return api.get<SalesChartData>(`/dashboard/sales-chart?${params}`).then((r) => r.data);
        },
        'chart',
      ),
    enabled: isOnline,
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
  });

  const recentTransactions = useQuery<Transaction[]>({
    queryKey: txKey,
    queryFn: () =>
      fetchWithCache(
        () => {
          const params = new URLSearchParams({ limit: '5' });
          if (siteId) params.set('siteId', siteId);
          return api
            .get<{ transactions: Transaction[] }>(`/dashboard/recent-transactions?${params}`)
            .then((r) => r.data.transactions ?? r.data);
        },
        'transactions',
      ),
    enabled: isOnline,
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
  });

  const stockAlerts = useQuery<StockAlert[]>({
    queryKey: alertsKey,
    queryFn: () =>
      fetchWithCache(
        () => {
          const params = new URLSearchParams({ limit: '3' });
          if (siteId) params.set('siteId', siteId);
          return api
            .get<{ alerts: StockAlert[] }>(`/dashboard/stock-alerts?${params}`)
            .then((r) => r.data.alerts ?? r.data);
        },
        'alerts',
      ),
    enabled: isOnline,
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
  });

  const isAnyLoading =
    stats.isLoading || salesChart.isLoading || recentTransactions.isLoading || stockAlerts.isLoading;

  const refetchAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  }, [queryClient]);

  const isOfflineData =
    !isOnline &&
    (stats.data !== undefined ||
      salesChart.data !== undefined ||
      recentTransactions.data !== undefined ||
      stockAlerts.data !== undefined);

  return {
    stats,
    salesChart,
    recentTransactions,
    stockAlerts,
    isAnyLoading,
    refetchAll,
    isOfflineData,
  };
}
