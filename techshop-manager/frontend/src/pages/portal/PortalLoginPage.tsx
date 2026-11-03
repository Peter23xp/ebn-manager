import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PageSEO } from '@/components/seo/PageSEO';
import { Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { AuthShell } from '@/components/auth/AuthShell';
import { photo } from '@/lib/photos';

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
    <div className="au-pin" role="group" aria-labelledby="portal-pin-label">
      {[0, 1, 2, 3].map((i) => (
        <input
          key={i}
          ref={(el) => { inputs.current[i] = el; }}
          type="password"
          inputMode="numeric"
          autoComplete="off"
          maxLength={1}
          value={value[i] ?? ''}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKey(i, e)}
          disabled={disabled}
          aria-label={`Chiffre ${i + 1} du PIN`}
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
      <AuthShell
        label="Portail membre"
        title="Accédez à votre espace"
        subtitle="Suivez vos achats, vos points fidélité, vos filleuls et votre portefeuille."
        photo={{
          src: photo('1531123414780-f74242c2b052'),
          alt: 'Membre souriante vêtue de wax',
          caption: 'Chaque commission est visible dans votre portefeuille, à tout moment.',
        }}
        switchLink={{ to: '/login', text: 'Vous faites partie du personnel ?', cta: 'Espace employé' }}
      >
        <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} noValidate>
          <div className="au-field">
            <label htmlFor="portal-phone" style={{ marginBottom: 6 }}>Numéro de téléphone</label>
            <input
              id="portal-phone"
              type="tel"
              autoComplete="tel"
              value={telephone}
              onChange={(e) => setTelephone(e.target.value)}
              disabled={loading}
              className="au-input"
              placeholder="+243 XXXXXXXXX"
            />
          </div>

          <div className="au-field" style={{ marginBottom: 24 }}>
            <span id="portal-pin-label" className="au-field-label" style={{ marginBottom: 8 }}>
              Code PIN <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(4 chiffres)</span>
            </span>
            <PinInput value={pin} onChange={setPin} disabled={loading} />
          </div>

          {error && (
            <div className="au-error" role="alert">
              {error}
              {lockedUntil && (
                <span style={{ display: 'block', fontWeight: 400, marginTop: 4 }}>
                  Déblocage prévu à {new Date(lockedUntil).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}.
                </span>
              )}
            </div>
          )}

          <button type="submit" disabled={loading || pin.length < 4 || !telephone.trim()} className="au-btn">
            {loading && <Loader2 size={16} className="animate-spin" aria-hidden />}
            Se connecter
          </button>

          <p className="au-note">PIN oublié ? Contactez votre agent EBN ou votre boutique.</p>
          <p className="au-note" style={{ marginTop: 8 }}>
            En vous connectant, vous acceptez les <Link className="au-link" to="/legal/conditions">conditions générales</Link> et
            la <Link className="au-link" to="/legal/confidentialite">politique de confidentialité</Link>.
          </p>
        </form>
      </AuthShell>
    </>
  );
}
