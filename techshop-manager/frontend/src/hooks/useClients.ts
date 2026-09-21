import { useQuery } from '@tanstack/react-query';
import { clientsApi } from '@/lib/clients.api';
import { useDebounce } from '@/hooks/useDebounce';
import type { StatutClient } from '@/types';
import { usePrivateQueryScope } from '@/hooks/usePrivateQueryScope';

export interface UseClientsParams {
  search?: string;
  siteId?: string | null;
  statut?: StatutClient | '';
  page?: number;
  limit?: number;
}

export function useClients(params: UseClientsParams) {
  const scope = usePrivateQueryScope();
  const siteId = scope.siteId ?? params.siteId;
  const debouncedSearch = useDebounce(params.search ?? '', 350);

  const query = useQuery({
    queryKey: [
      'clients',
      scope.key,
      {
        search: debouncedSearch,
        siteId,
        statut: params.statut,
        page: params.page ?? 1,
        limit: params.limit ?? 25,
      },
    ],
    queryFn: () =>
      clientsApi.getList({
        search: debouncedSearch || undefined,
        siteId,
        statut: params.statut || undefined,
        page: params.page ?? 1,
        limit: params.limit ?? 25,
      }),
    staleTime: 2 * 60 * 1000,
    enabled: scope.enabled,
    placeholderData: (previous, previousQuery) => previousQuery?.queryKey[1] === scope.key ? previous : undefined,
  });

  return {
    clients: scope.enabled ? query.data?.data ?? [] : [],
    meta: scope.enabled ? query.data?.meta : undefined,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: () => scope.enabled ? query.refetch() : Promise.resolve(),
  };
}
