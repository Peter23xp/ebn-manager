import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { PageSEO } from '@/components/seo/PageSEO';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { authApi, getErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { cn } from '@/lib/utils';
import { AuthShell } from '@/components/auth/AuthShell';
import { photo } from '@/lib/photos';
import type { Role } from '@/types';

const PHONE_RE = /^(\+243|0)[0-9]{9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_ATTEMPTS = 5;

function detectFormat(value: string): 'phone' | 'email' | 'unknown' | 'empty' {
  if (!value) return 'empty';
  if (PHONE_RE.test(value)) return 'phone';
  if (EMAIL_RE.test(value)) return 'email';
  return 'unknown';
}

function getRoleRedirect(role: Role): string {
  switch (role) {
    case 'SUPER_ADMIN':
    case 'GERANT':              return '/dashboard';
    case 'DIRECTEUR_REGIONAL': return '/dashboard/regional';
    case 'AGENT':              return '/dashboard';
    case 'CAISSIER':           return '/sales/pos';
    case 'FORMATEUR':          return '/clients';
    case 'CLIENT':             return '/portal/home';
    default:                   return '/dashboard';
  }
}

export default function LoginPage() {
  const navigate       = useNavigate();
  const [searchParams] = useSearchParams();
  const location       = useLocation();
  const isOnline       = useOnlineStatus();
  const { setAuth, loginAttempts, lockedUntil, incrementAttempts, resetAttempts, setLockedUntil } =
    useAuthStore();

  const [identifier,    setIdentifier]   = useState('');
  const [password,      setPassword]     = useState('');
  const [rememberMe,    setRememberMe]   = useState(false);
  const [showPassword,  setShowPassword] = useState(false);
  const [isLoading,     setIsLoading]    = useState(false);
  const [slowServer,    setSlowServer]   = useState(false);
  const [errorMsg,      setErrorMsg]     = useState('');
  const [lockCountdown, setLockCountdown] = useState('');

  const identifierRef   = useRef<HTMLInputElement>(null);
  const lockIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const identifierFormat = detectFormat(identifier);
  const isLocked   = lockedUntil !== null && lockedUntil > new Date();
  const isDisabled = isLoading || isLocked;
  const canSubmit  = identifier.trim().length > 0 && password.length > 0 && !isDisabled;

  useEffect(() => {
    if (!isLocked || !lockedUntil) {
      setLockCountdown('');
      if (lockIntervalRef.current) clearInterval(lockIntervalRef.current);
      return;
    }
    const update = () => {
      const remaining = Math.max(0, lockedUntil.getTime() - Date.now());
      if (remaining <= 0) {
        resetAttempts(); setLockCountdown('');
        if (lockIntervalRef.current) clearInterval(lockIntervalRef.current);
        return;
      }
      const m = Math.floor(remaining / 60000).toString().padStart(2, '0');
      const s = Math.floor((remaining % 60000) / 1000).toString().padStart(2, '0');
      setLockCountdown(`${m}:${s}`);
    };
    update();
    lockIntervalRef.current = setInterval(update, 1000);
    return () => { if (lockIntervalRef.current) clearInterval(lockIntervalRef.current); };
  }, [isLocked, lockedUntil, resetAttempts]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setIsLoading(true); setErrorMsg(''); setSlowServer(false);
    const slowTimer = setTimeout(() => setSlowServer(true), 8000);
    try {
      const { data } = await authApi.login({ identifier, password, rememberMe });
      const { user, accessToken } = data;
      setAuth(user, accessToken);
      toast.success(`Bienvenue, ${user.name} !`);
      const redirect = searchParams.get('redirect');
      const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
      let target = redirect ?? from ?? getRoleRedirect(user.role);
      // Ne jamais renvoyer un STAFF vers le portail client (et inversement) :
      // le `from` mémorisé par AuthGuard peut être périmé si le compte saisi
      // n'appartient pas à l'espace d'où vient la redirection.
      if (user.role === 'CLIENT' && !target.startsWith('/portal')) target = '/portal/home';
      if (user.role !== 'CLIENT' && target.startsWith('/portal')) target = getRoleRedirect(user.role);
      navigate(target, { replace: true });
    } catch (error: unknown) {
      const axErr = error as { response?: { status?: number; data?: { error?: { attemptsLeft?: number; unlocksAt?: string } } } };
      const status = axErr?.response?.status;
      if (status === 401) {
        incrementAttempts(); setPassword('');
        setTimeout(() => identifierRef.current?.focus(), 50);
        const attemptsLeft = axErr.response?.data?.error?.attemptsLeft;
        if (loginAttempts + 1 >= MAX_ATTEMPTS) {
          setLockedUntil(new Date(Date.now() + 15 * 60 * 1000));
          setErrorMsg('Compte temporairement bloqué.');
        } else {
          const rem = attemptsLeft ?? MAX_ATTEMPTS - (loginAttempts + 1);
          setErrorMsg(`Identifiant ou mot de passe incorrect — ${rem} tentative${rem > 1 ? 's' : ''} restante${rem > 1 ? 's' : ''}`);
        }
      } else if (status === 423) {
        const unlocksAt = axErr.response?.data?.error?.unlocksAt;
        if (unlocksAt) setLockedUntil(new Date(unlocksAt));
        setErrorMsg('Compte temporairement bloqué.');
      } else {
        toast.error(getErrorMessage(error) || 'Serveur inaccessible. Vérifiez votre connexion.');
      }
    } finally {
      clearTimeout(slowTimer);
      setIsLoading(false);
      setSlowServer(false);
    }
  };

  const identifierHasErr = identifier.length > 3 && identifierFormat === 'unknown';

  return (
    <>
      <PageSEO title="Connexion" noindex />
      <AuthShell
        label="Espace employé"
        title="Connexion du personnel"
        subtitle="Gérants, agents, caissiers et formateurs : accédez à la caisse, aux stocks et aux clients."
        photo={{
          src: photo('1556740758-90de374c12ad'),
          alt: 'Vendeuse utilisant une tablette de caisse en boutique',
          caption: 'La caisse, les stocks et les clients de votre site, au même endroit.',
        }}
        switchLink={{ to: '/portal/login', text: 'Vous êtes membre du réseau ?', cta: 'Accéder au portail membre' }}
        banner={!isOnline && (
          <div className="au-banner" role="status">Mode hors-ligne — données de la dernière session utilisées</div>
        )}
      >
        <form onSubmit={handleSubmit} noValidate>
          <div className="au-field">
            <label htmlFor="identifier" style={{ marginBottom: 6 }}>Téléphone ou Email professionnel</label>
            <input
              id="identifier"
              ref={identifierRef}
              type="text"
              autoComplete="username"
              placeholder="+243 8XX XXX XXX"
              disabled={isDisabled}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              aria-invalid={identifierHasErr || undefined}
              aria-describedby={identifier.length > 3 ? 'identifier-hint' : undefined}
              className={cn('au-input', identifierHasErr && 'is-error')}
            />
            {identifier.length > 3 && identifierFormat !== 'empty' && (
              <p id="identifier-hint" className={cn('au-hint', identifierFormat === 'unknown' ? 'err' : 'ok')}>
                {identifierFormat === 'unknown'
                  ? 'Format non reconnu : utilisez +243XXXXXXXXX ou une adresse email.'
                  : `${identifierFormat === 'phone' ? 'Téléphone' : 'Email'} reconnu`}
              </p>
            )}
          </div>

          <div className="au-field">
            <div className="au-field-head">
              <label htmlFor="password">Mot de passe</label>
              <a href="/reset-password" className="au-link">Mot de passe oublié ?</a>
            </div>
            <div className="au-pwd">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                disabled={isDisabled}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="au-input"
              />
              <button
                type="button"
                className="au-eye"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
              >
                {showPassword ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
              </button>
            </div>
          </div>

          <label className="au-check">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              disabled={isDisabled}
            />
            Se souvenir de moi sur cet appareil
          </label>

          {errorMsg && (
            <div className="au-error" role="alert">
              {errorMsg}
              {isLocked && lockCountdown && <span className="au-countdown">{lockCountdown}</span>}
            </div>
          )}

          <button type="submit" disabled={!canSubmit} className="au-btn">
            {isLoading ? (
              <span style={{ textAlign: 'center' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <Loader2 size={16} className="animate-spin" aria-hidden />
                  {slowServer ? 'Démarrage du serveur…' : 'Connexion en cours…'}
                </span>
                {slowServer && <span className="au-btn-sub">Première connexion du jour, patientez 30 s</span>}
              </span>
            ) : 'Se connecter'}
          </button>

          <p className="au-note">
            <span className={cn('au-status', !isOnline && 'off')}><i aria-hidden />{isOnline ? 'En ligne' : 'Hors-ligne'}</span>
            {' · '}Connexion chiffrée, réservée au personnel EBN.
          </p>

          {!isOnline && (
            <p className="au-note">
              <button
                type="button"
                className="au-link"
                style={{ background: 'none', border: 0, cursor: 'pointer', fontFamily: 'inherit' }}
                onClick={() => toast.error('Aucune session locale disponible.')}
              >
                Continuer sans connexion →
              </button>
            </p>
          )}
        </form>
      </AuthShell>
    </>
  );
}
