import { useQuery } from '@tanstack/react-query';
import { reportsApi } from '@/lib/reports.api';
import type { StocksReportParams } from '@/lib/reports.api';
import { usePrivateQueryScope } from './usePrivateQueryScope';

export function useStocksReport(params: StocksReportParams = {}) {
  const scope = usePrivateQueryScope('DIRECTEUR_REGIONAL');
  const query = useQuery({
    queryKey: ['reports', scope.key, 'stocks', params],
    queryFn: async ({ signal }) => {
      if (!scope.isCurrent()) throw new Error('Session terminée');
      const data = await reportsApi.getStocksReport(params, signal);
      if (!scope.isCurrent()) throw new Error('Session terminée');
      return data;
    },
    staleTime: 10 * 60 * 1000,
    enabled: scope.enabled,
    retry: false,
  });
  return { ...query, data: scope.enabled ? query.data : undefined,
    refetch: () => scope.isCurrent() ? query.refetch() : Promise.resolve() };
}
