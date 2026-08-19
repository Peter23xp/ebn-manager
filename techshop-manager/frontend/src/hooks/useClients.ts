import { useQuery } from '@tanstack/react-query';
import { clientsApi } from '@/lib/clients.api';
import { useDebounce } from '@/hooks/useDebounce';
import type { StatutClient } from '@/types';

export interface UseClientsParams {
  search?: string;
  siteId?: string | null;
  statut?: StatutClient | '';
  page?: number;
  limit?: number;
}

export function useClients(params: UseClientsParams) {
  const debouncedSearch = useDebounce(params.search ?? '', 350);

  const query = useQuery({
    queryKey: [
      'clients',
      {
        search: debouncedSearch,
        siteId: params.siteId,
        statut: params.statut,
        page: params.page ?? 1,
        limit: params.limit ?? 25,
      },
    ],
    queryFn: () =>
      clientsApi.getList({
        search: debouncedSearch || undefined,
        siteId: params.siteId,
        statut: params.statut || undefined,
        page: params.page ?? 1,
        limit: params.limit ?? 25,
      }),
    staleTime: 2 * 60 * 1000,
    placeholderData: (prev) => prev,
  });

  return {
    clients: query.data?.data ?? [],
    meta: query.data?.meta,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
