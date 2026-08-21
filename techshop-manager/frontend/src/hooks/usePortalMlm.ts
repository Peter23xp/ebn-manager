import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth.store';
import { portalApi } from '@/lib/portal.api';

export function usePortalMlm() {
  const user = useAuthStore((s) => s.user);
  const clientId = user?.id ?? null;

  const { data: walletData, isLoading: isWalletLoading } = useQuery({
    queryKey: ['portal', 'wallet', clientId],
    queryFn: () => portalApi.getWallet(),
    staleTime: 60_000,
    enabled: !!clientId,
    retry: false, // If the client is not an MLM member, this might fail, don't retry endlessly
  });

  return {
    wallet: walletData?.wallet ?? null,
    stats: walletData?.stats ?? null,
    isLoading: isWalletLoading,
  };
}
