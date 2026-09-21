import { usePrivateQueryScope } from '@/hooks/usePrivateQueryScope';

export function useSalesQueryScope() {
  return usePrivateQueryScope('CAISSIER');
}
