import { useState } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth.store';
import { portalApi } from '@/lib/portal.api';

export type WalletTxFilter = 'all' | 'gains' | 'retraits';

export function usePortalWalletHistory() {
  const user = useAuthStore((s) => s.user);
  const clientId = user?.id ?? null;
  const [typeFilter, setTypeFilter] = useState<WalletTxFilter>('all');
  const qc = useQueryClient();

  // On peut réutiliser les stats MLM stockées dans le cache si nécessaire
  // Mais ici on n'a besoin que des transactions.
  const query = useInfiniteQuery({
    queryKey: ['portal', 'wallet-transactions', clientId, typeFilter],
    queryFn: ({ pageParam = 1 }) =>
      portalApi.getWalletTransactions({ typeFilter, page: pageParam as number }),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined,
    staleTime: 60_000,
    enabled: !!clientId,
  });

  const allTransactions = query.data?.pages.flatMap((p) => p.transactions) ?? [];

  return {
    transactions: allTransactions,
    typeFilter,
    setTypeFilter,
    isLoading: query.isLoading,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: !!query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
  };
}
