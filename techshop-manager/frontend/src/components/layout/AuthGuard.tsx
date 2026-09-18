import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/auth.store';

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { isAuthenticated, hasLoggedOut } = useAuthStore();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to={hasLoggedOut ? '/' : '/login'} state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
