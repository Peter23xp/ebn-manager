import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/auth.store';
import type { Role } from '@/types';
import { hasMinimumRole, ROLE_LEVEL } from '@/lib/roles';

interface RoleGuardProps {
  children: React.ReactNode;
  minRole: Role;
  /** Plafond : exclut les rôles supérieurs (cloisonne portail client vs back-office). */
  maxRole?: Role;
}

export function RoleGuard({ children, minRole, maxRole }: RoleGuardProps) {
  const { user } = useAuthStore();
  const level = user ? (ROLE_LEVEL[user.role] ?? 0) : 0;
  const max = maxRole ? ROLE_LEVEL[maxRole] : ROLE_LEVEL.SUPER_ADMIN;

  if (!user || !hasMinimumRole(user.role, minRole) || !(level <= max)) {
    // CLIENT bloqué hors du portail → portail.
    // FORMATEUR (level 2) : exclu des routes staff (parent minRole AGENT) ET
    // du portail (maxRole CLIENT) — le renvoyer vers /dashboard bouclerait
    // (le parent le rebloque sur /dashboard). Landing publique = terminal.
    // Staff AGENT+ bloqué hors du back-office → dashboard.
    const to =
      user?.role === 'CLIENT' ? '/portal/home'
      : !hasMinimumRole(user?.role, 'AGENT') ? '/'
      : '/dashboard';
    return <Navigate to={to} replace />;
  }

  return <>{children}</>;
}
