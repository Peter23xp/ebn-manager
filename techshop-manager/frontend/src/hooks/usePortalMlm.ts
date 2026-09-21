import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth.store';
import { portalApi, type ReinvestLot } from '@/lib/portal.api';

export function usePortalMlm() {
  const user = useAuthStore((s) => s.user);
  const clientId = user?.id ?? null;

  const { data: walletData, isLoading: isWalletLoading, error, refetch } = useQuery({
    queryKey: ['portal', 'wallet', clientId],
    queryFn: () => portalApi.getWallet(),
    staleTime: 60_000,
    enabled: !!clientId,
    retry: false, // If the client is not an MLM member, this might fail, don't retry endlessly
  });

  // Un 404 = compte non encore membre MLM (normal) — on n'affiche pas d'erreur.
  // Une vraie panne (500/réseau) DOIT être surfacee : sinon la carte montre un
  // faux solde de 0,00 $ et le client croit avoir perdu son argent.
  const isNotFound = (error as any)?.response?.status === 404;

  return {
    wallet: walletData?.wallet ?? null,
    stats: walletData?.stats ?? null,
    financialSummary: walletData?.financialSummary,
    progressiveCommissions: error ? undefined : walletData?.progressiveCommissions,
    lots: (walletData?.reinvestLots ?? []) as ReinvestLot[],
    isLoading: isWalletLoading,
    error: isNotFound ? null : error,
    retryWallet: refetch,
  };
}
