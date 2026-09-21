import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clientsApi } from '@/lib/clients.api';
import type { UpdateClientDto } from '@/lib/clients.api';
import { usePrivateQueryScope } from '@/hooks/usePrivateQueryScope';

export function useClientDetail(clientId: string) {
  const queryClient = useQueryClient();
  const scope = usePrivateQueryScope('FORMATEUR');

  const query = useQuery({
    queryKey: ['client', clientId, scope.key],
    queryFn: () => clientsApi.getDetailById(clientId),
    staleTime: 5 * 60 * 1000,
    enabled: !!clientId && scope.enabled,
  });

  const updateMutation = useMutation({
    mutationFn: (body: UpdateClientDto) => clientsApi.update(clientId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client', clientId] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
  });

  return {
    client: scope.enabled ? query.data ?? null : null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: () => scope.enabled ? query.refetch() : Promise.resolve(),
    updateClient: updateMutation.mutate,
    isUpdating: updateMutation.isPending,
    updateError: updateMutation.error,
    resetUpdateError: updateMutation.reset,
  };
}
