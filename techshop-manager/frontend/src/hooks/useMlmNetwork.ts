import { useQuery } from '@tanstack/react-query';
import { MlmApi } from '@/lib/mlm.api';

export function useMlmNetwork() {
  const statsQuery = useQuery({
    queryKey: ['mlm-stats'],
    queryFn: () => MlmApi.getNetworkStats(),
    staleTime: 5 * 60 * 1000,
  });

  const membersByLevelQuery = useQuery({
    queryKey: ['mlm-members-by-level'],
    queryFn: () => MlmApi.getMembersByLevel(),
    staleTime: 5 * 60 * 1000,
  });

  const recentPromotionsQuery = useQuery({
    queryKey: ['mlm-recent-promotions'],
    queryFn: () => MlmApi.getRecentPromotions(),
    staleTime: 5 * 60 * 1000,
  });

  return {
    stats: statsQuery.data,
    isLoadingStats: statsQuery.isLoading,
    membersByLevel: membersByLevelQuery.data,
    isLoadingMembers: membersByLevelQuery.isLoading,
    recentPromotions: recentPromotionsQuery.data,
    isLoadingPromotions: recentPromotionsQuery.isLoading,
  };
}
