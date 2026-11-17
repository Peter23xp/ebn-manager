import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';

const sameList = (a: readonly string[] = [], b: readonly string[] = []) =>
  a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');

/**
 * Recharge les fonctionnalités retirées au compte (ouverture de l'app puis
 * toutes les 5 minutes) : un changement fait par le super admin s'applique
 * sans que l'utilisateur ait à se reconnecter. Le serveur bloque de toute façon
 * les routes concernées ; ceci met le menu et les écrans à jour.
 */
export function useSyncAccountRestrictions() {
  const user = useAuthStore((s) => s.user);
  const isStaff = !!user && user.role !== 'CLIENT';

  const { data } = useQuery({
    queryKey: ['account-restrictions', user?.id],
    queryFn: async () => {
      const res = await authApi.me();
      return (res.data?.fonctionnalitesRetirees ?? []) as string[];
    },
    enabled: isStaff,
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true,
    staleTime: 60_000,
    retry: false,
  });

  useEffect(() => {
    if (!data) return;
    const { user: current, accessToken, setAuth } = useAuthStore.getState();
    if (!current || !accessToken || sameList(current.fonctionnalitesRetirees, data)) return;
    // Même compte : setAuth conserve la session en cours (pas de déconnexion).
    setAuth({ ...current, fonctionnalitesRetirees: data }, accessToken);
  }, [data]);
}
