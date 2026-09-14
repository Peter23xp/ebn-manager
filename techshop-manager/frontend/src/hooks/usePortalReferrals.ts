import { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth.store';
import { portalApi } from '@/lib/portal.api';

export type ReferralFilter = 'actifs' | 'en_attente' | 'tous';

export function usePortalReferrals() {
  const user = useAuthStore((s) => s.user);
  const clientId = user?.id ?? null;
  const [filter, setFilter] = useState<ReferralFilter>('actifs');

  const query = useInfiniteQuery({
    queryKey: ['portal', 'referrals', clientId, filter],
    queryFn: ({ pageParam = 1 }) =>
      portalApi.getReferrals({ filter, page: pageParam as number }),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined,
    staleTime: 3 * 60_000,
    enabled: !!clientId,
  });

  const firstPage = query.data?.pages[0];
  const allFilleuls = query.data?.pages.flatMap((p) => p.filleuls) ?? [];

  return {
    codeParrain: firstPage?.codeParrain,
    stats: firstPage?.stats,
    filleuls: allFilleuls,
    filter,
    setFilter,
    isLoading: query.isLoading,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: !!query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
  };
}
