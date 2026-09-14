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
    // CLIENT bloqué hors du portail → portail.
    // FORMATEUR (level 2) : exclu des routes staff (parent minRole AGENT) ET
    // du portail (maxRole CLIENT) — le renvoyer vers /dashboard bouclerait
    // (le parent le rebloque sur /dashboard). Landing publique = terminal.
    // Staff AGENT+ bloqué hors du back-office → dashboard.
    const to =
      user?.role === 'CLIENT' ? '/portal/home'
      : (ROLE_LEVEL[user?.role as Role] ?? 0) < ROLE_LEVEL.AGENT ? '/'
      : '/dashboard';
    return <Navigate to={to} replace />;
  }

  return <>{children}</>;
}
