import { useQuery } from '@tanstack/react-query';
import { reportsApi } from '@/lib/reports.api';
import type { VentesDetailParams } from '@/lib/reports.api';
import { usePrivateQueryScope } from './usePrivateQueryScope';

export function useSalesDetailReport(params: VentesDetailParams) {
  const scope = usePrivateQueryScope('DIRECTEUR_REGIONAL');
  const query = useQuery({
    queryKey: ['reports', scope.key, 'sales-detail', params],
    queryFn: async ({ signal }) => {
      if (!scope.isCurrent()) throw new Error('Session terminée');
      const data = await reportsApi.getVentesDetail(params, signal);
      if (!scope.isCurrent()) throw new Error('Session terminée');
      return data;
    },
    staleTime: 3 * 60 * 1000,
    enabled: scope.enabled,
    retry: false,
  });
  return { ...query, data: scope.enabled ? query.data : undefined,
    refetch: () => scope.isCurrent() ? query.refetch() : Promise.resolve() };
}
