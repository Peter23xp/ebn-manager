import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageSEO } from '@/components/seo/PageSEO';
import { Loader2 } from 'lucide-react';
import { api, authApi } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { cn } from '@/lib/utils';

// ── OTP PIN input (4 boxes) ──────────────────────────────────────────────────

interface PinInputProps {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}

function PinInput({ value, onChange, disabled }: PinInputProps) {
  const inputs = useRef<Array<HTMLInputElement | null>>([]);

  const handleKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !value[i] && i > 0) {
      inputs.current[i - 1]?.focus();
    }
  };

  const handleChange = (i: number, raw: string) => {
    const digit = raw.replace(/\D/g, '').slice(-1);
    const arr = value.split('').concat(['', '', '', '']).slice(0, 4);
    arr[i] = digit;
    const next = arr.join('').slice(0, 4);
    onChange(next);
    if (digit && i < 3) {
      setTimeout(() => inputs.current[i + 1]?.focus(), 0);
    }
  };

  return (
    <div className="flex gap-3 justify-center">
      {[0, 1, 2, 3].map((i) => (
        <input
          key={i}
          ref={(el) => { inputs.current[i] = el; }}
          type="password"
          inputMode="numeric"
          maxLength={1}
          value={value[i] ?? ''}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKey(i, e)}
          disabled={disabled}
          aria-label={`Chiffre ${i + 1} du PIN`}
          className={cn(
            'w-14 h-14 text-center text-xl font-bold rounded-xl border-2 outline-none',
            'focus:border-[#1E3A5F] border-neutral-200 bg-white transition-colors',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          )}
        />
      ))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PortalLoginPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const user = useAuthStore((s) => s.user);

  const [telephone, setTelephone] = useState('+243');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated && user?.role === 'CLIENT') {
      navigate('/portal/home', { replace: true });
    }
  }, [isAuthenticated, user, navigate]);

  // Auto-submit when 4th digit entered
  useEffect(() => {
    if (pin.length === 4) {
      handleSubmit();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  const handleSubmit = async () => {
    if (pin.length < 4 || !telephone.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.post('/portal/auth/login', {
        telephone: telephone.trim(),
        pin,
      });
      setAuth(
        {
          id: data.client.id,
          role: 'CLIENT',
          name: `${data.client.prenom} ${data.client.nom}`,
          prenom: data.client.prenom,
          nom: data.client.nom,
        },
        data.accessToken,
      );
      navigate('/portal/home', { replace: true });
    } catch (err: any) {
      const code = err?.response?.data?.error?.code;
      if (code === 'ACCOUNT_LOCKED') {
        setLockedUntil(err.response.data.error.unlocksAt);
        setError('Compte bloqué. Réessayez dans quelques minutes.');
      } else if (code === 'CLIENT_NOT_ACTIVE') {
        setError("Votre compte n'est pas encore activé. Contactez votre agent EBN Network.");
      } else {
        const left = err?.response?.data?.error?.attemptsLeft;
        setError(
          left !== undefined
            ? `Numéro ou PIN incorrect. ${left} tentative${left !== 1 ? 's' : ''} restante${left !== 1 ? 's' : ''}.`
            : 'Numéro ou PIN incorrect.',
        );
      }
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-100 flex items-center justify-center p-4 safe-page">
      <div className="safe-top-bar bg-neutral-100" />
      <PageSEO title="Portail Client — Connexion" noindex />
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <img src="/assets/Progress business logo.png" alt="EBN Network" className="w-24 h-24 rounded-2xl mx-auto mb-4 object-contain" />
          <h1 className="text-xl font-bold text-[#1E3A5F]">EBN Network</h1>
          <p className="text-sm text-neutral-500 mt-1">Espace Client — Connectez-vous</p>
        </div>

        <div className="space-y-5">
          {/* Phone */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-1">
              Numéro de téléphone
            </label>
            <input
              type="tel"
              value={telephone}
              onChange={(e) => setTelephone(e.target.value)}
              disabled={loading}
              aria-label="Numéro de téléphone"
              className="w-full h-12 rounded-xl border-2 border-neutral-200 px-3 text-sm
                         focus:outline-none focus:border-[#1E3A5F] disabled:opacity-50"
              placeholder="+243 XXXXXXXXX"
            />
          </div>

          {/* PIN */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-3 text-center">
              Code PIN (4 chiffres)
            </label>
            <PinInput value={pin} onChange={setPin} disabled={loading} />
          </div>

          {/* Error */}
          {error && (
            <div
              role="alert"
              className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700"
            >
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading || pin.length < 4 || !telephone.trim()}
            className="w-full h-12 rounded-xl bg-[#1E3A5F] text-white font-semibold text-sm
                       disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            Se connecter
          </button>

          <p className="text-xs text-center text-neutral-400">
            Vous avez oublié votre PIN ?<br />
            Contactez votre agent EBN Network.
          </p>
        </div>
      </div>
    </div>
  );
}
