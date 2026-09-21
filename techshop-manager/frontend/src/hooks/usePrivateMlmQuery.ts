import { useQuery, type QueryKey } from '@tanstack/react-query';
import type { Role } from '@/types';
import { usePrivateQueryScope } from './usePrivateQueryScope';

export function usePrivateMlmQuery<Data>({ queryKey, queryFn, enabled = true }: {
  queryKey: QueryKey;
  queryFn: () => Promise<Data>;
  enabled?: boolean;
}, minimumRole: Role = 'AGENT') {
  const scope = usePrivateQueryScope(minimumRole);
  const isCurrent = () => enabled && scope.isCurrent();
  const query = useQuery({
    queryKey: [queryKey[0], scope.key, ...queryKey.slice(1)],
    queryFn: async () => {
      if (!isCurrent()) throw new Error('Session terminée');
      const data = await queryFn();
      if (!isCurrent()) throw new Error('Session terminée');
      return data;
    },
    enabled: enabled && scope.enabled,
  });
  return {
    ...query,
    data: isCurrent() ? query.data : undefined,
    refetch: () => isCurrent() ? query.refetch() : Promise.resolve(),
  };
}
