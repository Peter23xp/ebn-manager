import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { isSiteScopedStaff } from '@/lib/roles';

export interface SiteOption {
  id: string;
  nom: string;
  ville: string;
  actif: boolean;
}

export function useSites() {
  const user = useAuthStore(state => state.user);
  const isScoped = !!user && isSiteScopedStaff(user.role);
  const { data, isLoading } = useQuery({
    queryKey: ['sites'],
    queryFn: () =>
      api.get<{ data: SiteOption[] }>('/sites').then(r => r.data),
    staleTime: 10 * 60_000,
    enabled: !isScoped,
  });
  const sites: SiteOption[] = isScoped
    ? user.siteId ? [{ id: user.siteId, nom: user.site?.nom ?? user.siteName ?? user.siteId, ville: '', actif: true }] : []
    : (data?.data ?? []).filter(s => s.actif !== false);
  return { sites, isLoading: !isScoped && isLoading };
}
