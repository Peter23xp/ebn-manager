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
    <header className="relative flex items-center justify-between h-14 px-3 flex-shrink-0 bg-[#0A1628]">
      {/* Fini décoratif : liseré lumineux sous la barre */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[#b45309]/60 to-transparent"
      />

      <div className="w-10 flex items-center">
        {showBack && (
          <button
            type="button"
            onClick={handleBack}
            className="flex h-10 w-10 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Retour"
          >
            <ChevronLeft size={22} />
          </button>
        )}
      </div>

      <span className="text-white font-semibold text-sm tracking-wide">{title}</span>

      <div className="w-10 flex items-center justify-end">
        <button
          type="button"
          onClick={handleLogout}
          className="flex h-10 w-10 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          aria-label="Se déconnecter"
        >
          <LogOut size={17} />
        </button>
      </div>
    </header>
  );
}
