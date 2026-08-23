import { useNavigate } from 'react-router-dom';
import { ChevronLeft, LogOut } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';

interface PortalHeaderProps {
  title?: string;
  showBack?: boolean;
  onBack?: () => void;
}

export function PortalHeader({
  title = 'EBN Network',
  showBack = false,
  onBack,
}: PortalHeaderProps) {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);

  const handleLogout = () => {
    if (!window.confirm('Voulez-vous vous déconnecter ?')) return;
    logout();
    navigate('/portal/login', { replace: true });
  };

  const handleBack = () => {
    if (onBack) onBack();
    else navigate(-1);
  };

  return (
    <header
      className="flex items-center justify-between h-14 px-4 flex-shrink-0"
      style={{ background: '#1E3A5F' }}
    >
      <div className="w-8">
        {showBack && (
          <button
            type="button"
            onClick={handleBack}
            className="text-white/80 hover:text-white p-1"
            aria-label="Retour"
          >
            <ChevronLeft size={22} />
          </button>
        )}
      </div>

      <span className="text-white font-semibold text-sm">{title}</span>

      <button
        type="button"
        onClick={handleLogout}
        className="text-white/80 hover:text-white p-1"
        aria-label="Se déconnecter"
      >
        <LogOut size={18} />
      </button>
    </header>
  );
}
