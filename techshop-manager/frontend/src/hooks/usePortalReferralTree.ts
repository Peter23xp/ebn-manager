import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth.store';
import { portalApi } from '@/lib/portal.api';

const TREE_LIMIT = 500;

/**
 * Vue arborescente : recharge la totalité du réseau descendant (toutes générations,
 * filtre 'tous') en une seule requête, pour permettre la reconstruction de la
 * hiérarchie parent → enfant côté client.
 *
 * Désactivée tant que la vue Arbre n'est pas affichée (query `enabled`).
 */
export function usePortalReferralTree(active: boolean) {
  const user = useAuthStore((s) => s.user);
  const clientId = user?.id ?? null;

  const query = useQuery({
    queryKey: ['portal', 'referrals-tree', clientId],
    queryFn: () =>
      portalApi.getReferrals({ filter: 'tous', page: 1, limit: TREE_LIMIT }),
    staleTime: 3 * 60_000,
    enabled: !!clientId && active,
  });

  return {
    filleuls: query.data?.filleuls ?? [],
    total: query.data?.meta?.total ?? 0,
    isLoading: query.isLoading,
  };
}
