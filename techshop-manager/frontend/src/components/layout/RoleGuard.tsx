import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/auth.store';
import type { Role } from '@/types';

interface RoleGuardProps {
  children: React.ReactNode;
  minRole: Role;
}

export function RoleGuard({ children, minRole }: RoleGuardProps) {
  const { user, hasRole } = useAuthStore();

  if (!hasRole(minRole)) {
    // Un CLIENT ne peut pas accéder au back-office : renvoyer vers son portail
    return <Navigate to={user?.role === 'CLIENT' ? '/portal/home' : '/dashboard'} replace />;
  }

  return <>{children}</>;
}
