import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageSEO } from '@/components/seo/PageSEO';
import { Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { cn } from '@/lib/utils';

// ── PIN input (4 cases) ──────────────────────────────────────────────────────

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
    <div className="flex justify-center gap-3">
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
            'h-14 w-14 rounded-xl border border-border bg-bg-card text-center font-mono text-xl font-bold text-primary shadow-sm outline-none',
            'transition-all duration-150 focus:border-[#1E3A5F] focus:ring-2 focus:ring-[#1E3A5F]/25',
            'disabled:cursor-not-allowed disabled:opacity-50',
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

  // Auto-submit dès que le 4e chiffre est saisi
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
    <>
      <PageSEO title="Portail Client — Connexion" noindex />
      <div className="safe-page flex min-h-screen flex-col bg-gradient-to-b from-[#0A1628] via-[#12233f] to-[#1E3A5F] md:flex-row">

      {/* Volet identité (desktop) / en-tête (mobile) */}
      <div className="flex flex-col justify-between px-8 pb-10 pt-14 text-white md:w-[44%] md:px-14 md:py-16">
        <div>
          <img
            src="/assets/Progress business logo.png"
            alt="EBN Network"
            className="mb-6 h-16 w-16 rounded-2xl bg-white object-contain p-1.5 md:h-20 md:w-20 md:p-2"
          />
          <h1 className="text-2xl font-bold tracking-tight md:text-4xl">EBN Network</h1>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/60 md:text-base">
            L'espace partenaire des membres du réseau TechShop : suivez vos achats,
            vos points de fidélité et vos commissions, où que vous soyez.
          </p>
        </div>

        <ul className="mt-10 hidden space-y-4 md:block">
          {[
            'Historique d’achats avec reçus détaillés',
            'Points fidélité et remises par niveau',
            'Commissions de parrainage et retraits',
          ].map((item) => (
            <li key={item} className="flex items-center gap-3 text-sm text-white/70">
              <span aria-hidden className="h-1 w-6 rounded-full bg-[#e8a33d]" />
              {item}
            </li>
          ))}
        </ul>

        <p className="mt-12 hidden text-xs text-white/40 md:block">
          Goma · Bukavu · Kinshasa — RDC
        </p>
      </div>

      {/* Volet formulaire */}
      <div className="flex flex-1 items-start justify-center bg-bg px-4 pb-12 pt-10 md:items-center md:rounded-tl-[28px] md:px-10 md:pb-16 md:pt-0">
        <div className="w-full max-w-sm">
          <h2 className="text-lg font-bold text-primary">Espace client</h2>
          <p className="mt-1 text-sm text-text-muted">
            Connectez-vous avec votre numéro de téléphone.
          </p>

          <div className="mt-7 space-y-5">
            {/* Téléphone */}
            <div>
              <label htmlFor="portal-phone" className="mb-1.5 block text-sm font-medium text-text">
                Numéro de téléphone
              </label>
              <input
                id="portal-phone"
                type="tel"
                value={telephone}
                onChange={(e) => setTelephone(e.target.value)}
                disabled={loading}
                aria-label="Numéro de téléphone"
                className="h-12 rounded-xl border-border bg-bg-card shadow-sm"
                placeholder="+243 XXXXXXXXX"
              />
            </div>

            {/* PIN */}
            <div>
              <label className="mb-3 block text-sm font-medium text-text">
                Code PIN <span className="text-text-subtle">(4 chiffres)</span>
              </label>
              <PinInput value={pin} onChange={setPin} disabled={loading} />
            </div>

            {/* Erreur */}
            {error && (
              <div
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 animate-fade-in"
              >
                {error}
              </div>
            )}

            {/* Validation */}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading || pin.length < 4 || !telephone.trim()}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#1E3A5F] text-sm font-semibold text-white shadow-sm transition-all duration-150 hover:bg-[#13294b] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              Se connecter
            </button>

            <p className="text-center text-xs text-text-subtle">
              Vous avez oublié votre PIN ?<br />
              Contactez votre agent EBN Network.
            </p>
          </div>
        </div>
      </div>
      </div>
    </>
  );
}
