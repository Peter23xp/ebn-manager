import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/auth.store';
import type { Role } from '@/types';

const ROLE_LEVEL: Record<Role, number> = {
  SUPER_ADMIN: 6,
  DIRECTEUR_REGIONAL: 5,
  GERANT: 4,
  AGENT: 3,
  FORMATEUR: 2,
  CLIENT: 1,
};

interface RoleGuardProps {
  children: React.ReactNode;
  minRole: Role;
  /** Plafond : exclut les rôles supérieurs (cloisonne portail client vs back-office). */
  maxRole?: Role;
}

export function RoleGuard({ children, minRole, maxRole }: RoleGuardProps) {
  const { user } = useAuthStore();
  const level = user ? (ROLE_LEVEL[user.role] ?? 0) : 0;
  const min = ROLE_LEVEL[minRole] ?? 0;
  const max = maxRole ? (ROLE_LEVEL[maxRole] ?? 6) : 6;

  if (!user || level < min || level > max) {
    // Un CLIENT ne peut pas accéder au back-office : renvoyer vers son portail.
    // Un STAFF (AGENT+) bloqué hors du portail : renvoyer au back-office.
    return <Navigate to={user?.role === 'CLIENT' ? '/portal/home' : '/dashboard'} replace />;
  }

  return <>{children}</>;
}
