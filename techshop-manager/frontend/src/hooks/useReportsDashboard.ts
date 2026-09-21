import { useQuery } from '@tanstack/react-query';
import { reportsApi, type VentesReportParams, type VentesReportResponse } from '@/lib/reports.api';
import { getGranulariteFromRange, type DateRange } from '@/lib/dateRange.utils';
import { toISODate } from '@/lib/dateRange.utils';
import { usePrivateQueryScope } from './usePrivateQueryScope';
import { useAuthStore } from '@/store/auth.store';
import type { ReportActivity } from '@/lib/report-overview';

export interface UseReportsDashboardParams {
  siteId?: string;
  dateRange: DateRange;
}

export function useReportsDashboard({ siteId, dateRange }: UseReportsDashboardParams) {
  const scope = usePrivateQueryScope('GERANT');
  const user = useAuthStore(state => state.user);
  const enabled = scope.enabled && (user?.role !== 'GERANT' || !!user.siteId);
  const granularite = getGranulariteFromRange(dateRange);
  const dateDebut = toISODate(dateRange.from);
  const dateFin   = toISODate(dateRange.to);

  const params: VentesReportParams = {
    siteId: user?.role === 'GERANT' ? user.siteId ?? undefined : siteId,
    dateDebut,
    dateFin,
    granularite,
  };

  const query = useQuery<VentesReportResponse & { activity?: ReportActivity }>({
    queryKey: ['reports', 'dashboard', scope.key, params],
    queryFn: () => {
      if (!enabled || !scope.isCurrent()) throw new Error('La session a changé. Rechargez le rapport.');
      return reportsApi.getVentesReport(params);
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: enabled && !!dateDebut && !!dateFin,
    placeholderData: (previous, previousQuery) => previousQuery?.queryKey[2] === scope.key ? previous : undefined,
  });

  return {
    data: enabled ? query.data : undefined,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: () => enabled && scope.isCurrent() ? query.refetch() : Promise.resolve(undefined),
    granularite,
  };
}
