import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageSEO } from '@/components/seo/PageSEO';
import { Eye, EyeOff, Loader2, Wifi, WifiOff, ShieldCheck, MapPin } from 'lucide-react';
import toast from 'react-hot-toast';
import { authApi, getErrorMessage } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { cn } from '@/lib/utils';
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
    case 'AGENT':              return '/sales/pos';
    case 'FORMATEUR':          return '/clients';
    case 'CLIENT':             return '/portal/home';
    default:                   return '/dashboard';
  }
}

export default function LoginPage() {
  const navigate       = useNavigate();
  const [searchParams] = useSearchParams();
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
      navigate(redirect ?? getRoleRedirect(user.role), { replace: true });
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
    <div className="min-h-screen flex bg-white safe-page">
      {/* Étend la couleur du panneau gauche derrière l'encoche et la barre home */}
      <div className="safe-top-bar" style={{ background: '#0A1628' }} />
      <PageSEO title="Connexion" noindex />

      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700&display=swap');

        .lg-serif { font-family: 'Playfair Display', Georgia, serif; }
      `}} />

      {/* ── Bandeau hors-ligne ── */}
      {!isOnline && (
        <div className="fixed top-0 inset-x-0 z-50 flex items-center justify-center gap-2 bg-warning py-2 text-white text-[12px] font-bold">
          <WifiOff size={12} aria-hidden />
          Mode hors-ligne — Données de la dernière session utilisées
        </div>
      )}

      <div className="flex flex-col lg:flex-row w-full">

        {/* ── Panneau gauche : identité EBN ── */}
        <div
          className="lg-brand hidden lg:flex flex-col justify-between w-[420px] xl:w-[480px] flex-shrink-0 px-12 xl:px-14 py-14 text-white"
          style={{ background: 'linear-gradient(160deg, #0A1628 0%, #122540 55%, #16305a 100%)' }}
        >
          {/* Logo */}
          <div className="flex items-center gap-3">
            <img
              src="/assets/Progress business logo.png"
              alt="EBN Network"
              className="h-16 w-16 rounded-xl object-contain flex-shrink-0"
            />
            <div>
              <p className="text-[9px] font-bold tracking-[0.28em] uppercase" style={{ color: '#93c5fd' }}>
                Entreprise Benie Network
              </p>
              <p className="lg-serif text-[19px] font-bold tracking-tight leading-none mt-1">
                EBN <em style={{ color: '#60a5fa', fontStyle: 'italic' }}>Network</em>
              </p>
            </div>
          </div>

          {/* Accroche */}
          <div>
            <p
              className="text-[10px] font-bold tracking-[0.22em] uppercase mb-5"
              style={{ color: '#7d95b8' }}
            >
              Espace collaborateur · Accès sécurisé
            </p>
            <h2 className="lg-serif text-[36px] xl:text-[42px] font-black leading-[1.08] tracking-[-0.02em] text-white">
              Le professionnalisme,<br />
              notre <em style={{ color: '#60a5fa' }}>signature.</em>
            </h2>
            <p className="mt-5 text-[13.5px] leading-relaxed max-w-[300px]" style={{ color: '#aebdd4' }}>
              Entreprise Benie Network sarl — réseau de marketing relationnel fondé à Goma.
              Un cadre légal rigoureux, des produits réels, une équipe engagée.
            </p>

            {/* Villes */}
            <div className="flex items-center gap-2 mt-8" style={{ color: '#7d95b8' }}>
              <MapPin size={13} aria-hidden />
              <span className="text-[11.5px] font-semibold tracking-[0.08em] uppercase">
                Goma · Bukavu · Kinshasa
              </span>
            </div>
          </div>

          {/* Pied */}
          <p className="text-[11px]" style={{ color: '#5b7096' }}>
            RCCM Goma · EBN Network RDC © 2025
          </p>
        </div>

        {/* ── Colonne droite : formulaire ── */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-14 lg:px-16 xl:px-24 bg-white">

          {/* Logo mobile */}
          <div className="lg:hidden flex items-center gap-3 mb-10 self-start">
            <img
              src="/assets/Progress business logo.png"
              alt="EBN Network"
              className="h-14 w-14 rounded-xl object-contain flex-shrink-0"
            />
            <div>
              <p className="lg-serif text-[15px] font-bold text-primary tracking-tight leading-none">EBN <span style={{ color: '#2563eb', fontStyle: 'italic' }}>Network</span></p>
              <p className="text-[9px] font-bold tracking-[0.22em] text-text-subtle uppercase mt-1">Espace collaborateur</p>
            </div>
          </div>

          <div className="w-full max-w-[400px]">

            {/* Titre */}
            <div className="flex items-start justify-between mb-8">
              <div>
                <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-text-subtle mb-2">
                  Connexion staff
                </p>
                <h1 className="text-[28px] font-black text-primary tracking-tight leading-tight">
                  Bienvenue de retour
                </h1>
                <p className="text-[13px] text-text-muted mt-1">
                  Accédez à votre espace professionnel.
                </p>
              </div>
              <span className={cn(
                'inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full flex-shrink-0 ml-3 mt-1 border',
                isOnline
                  ? 'bg-green-50 text-success border-green-200'
                  : 'bg-amber-50 text-warning border-amber-200',
              )}>
                {isOnline
                  ? <Wifi size={10} aria-hidden />
                  : <WifiOff size={10} aria-hidden />}
                {isOnline ? 'En ligne' : 'Hors-ligne'}
              </span>
            </div>

            <form onSubmit={handleSubmit} noValidate className="space-y-5">

              {/* Identifiant */}
              <div className="space-y-1.5">
                <label
                  htmlFor="identifier"
                  className="block text-[10px] font-bold uppercase tracking-[0.14em] text-text-muted"
                >
                  Téléphone ou Email professionnel
                </label>
                <input
                  id="identifier"
                  ref={identifierRef}
                  type="text"
                  autoComplete="username"
                  placeholder="+243 8XX XXX XXX"
                  disabled={isDisabled}
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className={cn(
                    'w-full bg-white border rounded-xl px-4 py-3.5 text-[14px] text-text',
                    'placeholder:text-text-subtle caret-primary-accent',
                    'focus:outline-none transition duration-150',
                    identifierHasErr
                      ? 'border-danger focus:border-danger focus:ring-2 focus:ring-danger/15'
                      : 'border-border focus:border-primary-accent focus:ring-2 focus:ring-primary-accent/20',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                  )}
                />
                {identifier.length > 3 && identifierFormat !== 'empty' && (
                  <p className={cn(
                    'text-[11px] font-medium',
                    identifierFormat === 'unknown' ? 'text-danger' : 'text-success',
                  )}>
                    {identifierFormat === 'unknown'
                      ? '✗ Format non reconnu'
                      : `✓ ${identifierFormat === 'phone' ? 'Téléphone' : 'Email'} reconnu`}
                  </p>
                )}
              </div>

              {/* Mot de passe */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="password"
                    className="block text-[10px] font-bold uppercase tracking-[0.14em] text-text-muted"
                  >
                    Mot de passe
                  </label>
                  <a
                    href="/reset-password"
                    className="text-[12px] font-semibold text-primary-accent hover:text-blue-700 transition-colors"
                  >
                    Oublié ?
                  </a>
                </div>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    disabled={isDisabled}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={cn(
                      'w-full bg-white border border-border rounded-xl px-4 py-3.5 pr-12 text-[14px] text-text',
                      'placeholder:text-text-subtle caret-primary-accent',
                      'focus:outline-none focus:border-primary-accent focus:ring-2 focus:ring-primary-accent/20 transition duration-150',
                      'disabled:opacity-50 disabled:cursor-not-allowed',
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-text-subtle hover:text-text transition-colors"
                    aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  >
                    {showPassword ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
                  </button>
                </div>
              </div>

              {/* Se souvenir */}
              <label className="flex items-center gap-3 cursor-pointer group">
                <div className="relative flex-shrink-0">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    disabled={isDisabled}
                    className="peer sr-only"
                  />
                  <div className={cn(
                    'w-4 h-4 rounded border transition-colors',
                    rememberMe
                      ? 'bg-primary-accent border-primary-accent'
                      : 'bg-white border-border group-hover:border-border-strong',
                  )} />
                  {rememberMe && (
                    <svg
                      className="absolute inset-0 m-auto w-2.5 h-2.5 text-white pointer-events-none"
                      viewBox="0 0 10 10" fill="none" aria-hidden
                    >
                      <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <span className="text-[13px] text-text-muted group-hover:text-text transition-colors select-none">
                  Se souvenir de moi
                </span>
              </label>

              {/* Erreur */}
              {errorMsg && (
                <div
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-3.5"
                  role="alert"
                >
                  <p className="text-[13px] font-semibold text-danger">{errorMsg}</p>
                  {isLocked && lockCountdown && (
                    <p className="mt-2 text-[24px] font-black font-mono text-danger tabular-nums">
                      {lockCountdown}
                    </p>
                  )}
                </div>
              )}

              {/* Bouton */}
              <button
                type="submit"
                disabled={!canSubmit}
                className={cn(
                  'w-full py-3.5 rounded-xl text-[14px] font-bold tracking-wide mt-1',
                  'bg-primary-accent text-white',
                  'hover:bg-blue-700',
                  'active:scale-[0.99] transition-all duration-150',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-accent focus-visible:ring-offset-2',
                  'flex items-center justify-center gap-2',
                  'disabled:opacity-40 disabled:cursor-not-allowed disabled:scale-100',
                  'shadow-kpi-blue',
                )}
              >
                {isLoading ? (
                  <span className="flex flex-col items-center gap-0.5">
                    <span className="flex items-center gap-2">
                      <Loader2 size={16} className="animate-spin" aria-hidden />
                      {slowServer ? 'Démarrage du serveur…' : 'Connexion en cours…'}
                    </span>
                    {slowServer && (
                      <span className="text-[11px] font-normal opacity-80">
                        Première connexion du jour, patientez 30 s
                      </span>
                    )}
                  </span>
                ) : 'Se connecter'}
              </button>
            </form>

            {/* Note sécurité */}
            <div className="flex items-center justify-center gap-1.5 mt-6 pt-5 border-t border-border" style={{ color: '#94a3b8' }}>
              <ShieldCheck size={13} aria-hidden />
              <p className="text-[11.5px]">
                Connexion chiffrée — accès réservé au personnel EBN.
              </p>
            </div>

            {/* Continuer hors-ligne */}
            {!isOnline && (
              <div className="mt-5 text-center">
                <button
                  type="button"
                  className="text-[12px] font-semibold text-primary-accent hover:text-blue-700 transition-colors"
                  onClick={() => toast.error('Aucune session locale disponible.')}
                >
                  Continuer sans connexion →
                </button>
              </div>
            )}

            {/* Version mobile */}
            <p className="lg:hidden text-center text-[11px] text-text-subtle mt-8">
              v1.0 · EBN Network RDC © 2025
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
