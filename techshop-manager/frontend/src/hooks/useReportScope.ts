import { usePrivateQueryScope } from './usePrivateQueryScope';
import { useAuthStore } from '@/store/auth.store';
import type { Role } from '@/types';

export function useReportScope(minimumRole: Role = 'GERANT') {
  const scope = usePrivateQueryScope(minimumRole);
  const user = useAuthStore(state => state.user);
  const isGerant = user?.role === 'GERANT';
  const siteId = isGerant ? user.siteId ?? undefined : scope.siteId;
  const enabled = scope.enabled && (!isGerant || !!siteId?.trim());
  return { ...scope, siteId, enabled, isCurrent: () => enabled && scope.isCurrent() };
}
