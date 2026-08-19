import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MlmApi } from '@/lib/mlm.api';

export function useMlmMembers(params: {
  page?: number;
  limit?: number;
  statut?: string;
  levelId?: number;
  search?: string;
}) {
  return useQuery({
    queryKey: ['mlm-members', params],
    queryFn: () => MlmApi.getNetworkStats().then(() =>
      // Fetch members from API
      import('@/lib/api').then(({ api }) =>
        api.get('/mlm/members', { params }).then((r) => r.data),
      ),
    ),
  });
}

export function useMemberProgress(memberId: string) {
  return useQuery({
    queryKey: ['mlm-progress', memberId],
    queryFn: () => MlmApi.getMemberProgress(memberId),
    enabled: !!memberId,
  });
}

export function useMemberMatrix(memberId: string, levelId: number) {
  return useQuery({
    queryKey: ['mlm-matrix', memberId, levelId],
    queryFn: () => MlmApi.getMemberMatrix(memberId, levelId),
    enabled: !!memberId && !!levelId,
  });
}

export function useNetworkTree(memberId: string, depth = 3) {
  return useQuery({
    queryKey: ['mlm-tree', memberId, depth],
    queryFn: () => MlmApi.getNetworkTree(memberId),
    enabled: !!memberId,
  });
}

export function useWallet(memberId?: string) {
  return useQuery({
    queryKey: ['mlm-wallet', memberId],
    queryFn: () => MlmApi.getWallet(memberId),
  });
}

export function useWalletTransactions(params: {
  page: number;
  limit: number;
  memberId?: string;
  type?: string;
}) {
  return useQuery({
    queryKey: ['mlm-transactions', params],
    queryFn: () => MlmApi.getTransactions(params),
  });
}

export function useEarningsByLevel(memberId?: string) {
  return useQuery({
    queryKey: ['mlm-earnings', memberId],
    queryFn: () => MlmApi.getEarningsByLevel(memberId),
  });
}

export function useMlmConfig() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['mlm-config'],
    queryFn: () => MlmApi.getConfig(),
  });

  const updateMutation = useMutation({
    mutationFn: (config: any) => MlmApi.updateConfig(config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mlm-config'] });
    },
  });

  return { ...query, updateConfig: updateMutation };
}

export function usePendingBonuses(params: { page: number; limit: number }) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['mlm-bonuses-pending', params],
    queryFn: () => MlmApi.getPendingBonuses(params),
  });

  const deliverMutation = useMutation({
    mutationFn: (bonusId: string) => MlmApi.deliverBonus(bonusId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mlm-bonuses-pending'] });
    },
  });

  return { ...query, deliverBonus: deliverMutation };
}
