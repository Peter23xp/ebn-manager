import { useAuthStore } from '@/store/auth.store';
import { hasMinimumRole, isSiteScopedStaff } from '@/lib/roles';
import type { AuthUser, Role } from '@/types';

function partition(user: AuthUser | null, sessionVersion: number) {
  return JSON.stringify([user?.id ?? null, sessionVersion, user?.role ?? null, user?.siteId ?? null]);
}

export function usePrivateQueryScope(minimumRole: Role = 'AGENT') {
  const { user, isAuthenticated, sessionVersion } = useAuthStore();
  const isScoped = !!user && isSiteScopedStaff(user.role);
  const siteId = isScoped ? user.siteId ?? undefined : undefined;
  const key = partition(user, sessionVersion);
  const enabled = isAuthenticated && hasMinimumRole(user?.role, minimumRole) && (!isScoped || !!siteId);

  return {
    key,
    siteId,
    enabled,
    isCurrent: () => {
      const current = useAuthStore.getState();
      return enabled && current.isAuthenticated && partition(current.user, current.sessionVersion) === key;
    },
  };
}
