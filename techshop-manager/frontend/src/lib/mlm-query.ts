import type { QueryClient } from '@tanstack/react-query';

export function invalidateMlm(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ predicate: query =>
    String(query.queryKey[0]).startsWith('mlm-') || query.queryKey[0] === 'portal',
  });
}
