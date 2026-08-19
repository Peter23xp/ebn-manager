import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle, Eye, EyeOff, WifiOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { authApi, getErrorMessage } from '@/lib/api';
import { OtpInput } from '@/components/auth/OtpInput';
import { PasswordStrength } from '@/components/auth/PasswordStrength';
import { useCountdown } from '@/hooks/useCountdown';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

type Step = 1 | 2 | 3 | 'done';

const PHONE_RE = /^(\+243|0)[0-9]{9}$/;

function normalizePhone(raw: string): string {
  return raw.startsWith('0') ? '+243' + raw.slice(1) : raw;
}

const STEP_LABELS = ['Téléphone', 'Code OTP', 'Nouveau MDP'];

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const isOnline = useOnlineStatus();
  const countdown = useCountdown(120);

  const [step, setStep] = useState<Step>(1);
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [maskedPhone, setMaskedPhone] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [otpValue, setOtpValue] = useState('');
  const [otpError, setOtpError] = useState('');
  const [otpShake, setOtpShake] = useState(false);
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [generalError, setGeneralError] = useState('');

  // Restart countdown when entering step 2
  useEffect(() => {
    if (step === 2) {
      countdown.reset();
      countdown.start();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // --- Step 1: send OTP ---
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setPhoneError('');
    setGeneralError('');
    const normalized = normalizePhone(phone.trim());
    if (!PHONE_RE.test(normalized)) {
      setPhoneError('Format attendu : +243 XX XXX XXXX');
      return;
    }
    setIsLoading(true);
    try {
      const { data } = await authApi.forgotPassword(normalized);
      setMaskedPhone(data.maskedPhone ?? normalized);
      setMaskedEmail(data.maskedEmail ?? '');
      setPhone(normalized);
      toast.success(`Code envoyé à ${data.maskedEmail ?? data.maskedPhone}`);
      setStep(2);
    } catch (error: unknown) {
      const axiosError = error as { response?: { status?: number; data?: { error?: { code?: string } } } };
      const code = axiosError.response?.data?.error?.code;
      if (axiosError.response?.status === 404) {
        setGeneralError('Aucun compte trouvé pour ce numéro de téléphone.');
      } else if (code === 'NO_EMAIL') {
        setGeneralError('Aucun email associé à ce compte. Contactez votre administrateur pour en ajouter un.');
      } else if (axiosError.response?.status === 429) {
        setGeneralError('Trop de demandes. Attendez quelques minutes avant de réessayer.');
      } else {
        setGeneralError(getErrorMessage(error) || 'Erreur lors de l\'envoi du code.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // --- Step 2: verify OTP ---
  const handleVerifyOtp = async (code?: string) => {
    const otp = code ?? otpValue;
    if (otp.length < 6) return;
    setOtpError('');
    setGeneralError('');
    setIsLoading(true);
    try {
      const { data } = await authApi.verifyOtp(phone, otp);
      setResetToken(data.resetToken);
      setStep(3);
    } catch (error: unknown) {
      const axiosError = error as { response?: { status?: number; data?: { error?: { attemptsLeft?: number; blockedUntil?: string } } } };
      const status = axiosError.response?.status;
      setOtpValue('');
      setOtpShake(true);
      setTimeout(() => setOtpShake(false), 600);

      if (status === 400) {
        const left = axiosError.response?.data?.error?.attemptsLeft ?? '?';
        setOtpError(`Code incorrect. ${left} tentative(s) restante(s).`);
      } else if (status === 410) {
        setGeneralError('Ce code a expiré. Renvoyez un nouveau code.');
        countdown.reset();
      } else if (status === 429) {
        setGeneralError('Trop de tentatives. Réessayez dans quelques minutes.');
      } else {
        setGeneralError(getErrorMessage(error) || 'Erreur de vérification.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (!countdown.isFinished) return;
    setGeneralError('');
    setIsLoading(true);
    try {
      const { data } = await authApi.forgotPassword(phone);
      setMaskedPhone(data.maskedPhone ?? phone);
      countdown.reset();
      countdown.start();
      toast.success('Nouveau code envoyé.');
    } catch {
      toast.error('Erreur lors du renvoi du code.');
    } finally {
      setIsLoading(false);
    }
  };

  // --- Step 3: reset password ---
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setGeneralError('');
    if (newPassword.length < 6) {
      setPasswordError('Minimum 6 caractères requis.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Les mots de passe ne correspondent pas.');
      return;
    }
    setIsLoading(true);
    try {
      await authApi.resetPassword(resetToken, newPassword);
      setStep('done');
      setTimeout(() => navigate('/login', { replace: true }), 3000);
    } catch (error: unknown) {
      const axiosError = error as { response?: { status?: number; data?: { error?: { code?: string } } } };
      const status = axiosError.response?.status;
      const code = axiosError.response?.data?.error?.code;
      if (status === 400 && code === 'PASSWORD_ALREADY_USED') {
        setGeneralError('Ce mot de passe a déjà été utilisé. Choisissez-en un nouveau.');
      } else if (status === 410) {
        setGeneralError('Votre session de réinitialisation a expiré. Recommencez.');
      } else {
        setGeneralError(getErrorMessage(error) || 'Erreur lors de la réinitialisation.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const stepIndex = step === 'done' ? 3 : (step as number) - 1;

  return (
    <div className="min-h-screen bg-bg-default flex items-center justify-center p-4 safe-page">
      <div className="safe-top-bar bg-bg-default" />
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-black text-primary">EBN NETWORK</h1>
          <p className="text-text-muted mt-1 text-sm">Réinitialisation du mot de passe</p>
        </div>

        <div className="bg-bg-card rounded-2xl shadow-lg p-8">
          {/* Stepper */}
          {step !== 'done' && (
            <div className="flex items-center mb-8">
              {STEP_LABELS.map((label, idx) => (
                <div key={label} className="flex items-center flex-1">
                  <div className="flex flex-col items-center flex-1">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                        idx < stepIndex
                          ? 'bg-success text-white'
                          : idx === stepIndex
                          ? 'bg-primary text-white'
                          : 'bg-gray-200 text-gray-500'
                      }`}
                    >
                      {idx < stepIndex ? <CheckCircle size={16} /> : idx + 1}
                    </div>
                    <span className={`text-xs mt-1 font-medium ${idx === stepIndex ? 'text-primary' : 'text-gray-400'}`}>
                      {label}
                    </span>
                  </div>
                  {idx < STEP_LABELS.length - 1 && (
                    <div className={`h-0.5 flex-1 mx-1 mb-4 transition-colors ${idx < stepIndex ? 'bg-success' : 'bg-gray-200'}`} />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Offline warning */}
          {!isOnline && step !== 'done' && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-danger text-sm flex items-start gap-2" role="alert">
              <WifiOff size={16} className="flex-shrink-0 mt-0.5" />
              <span>
                La réinitialisation du mot de passe nécessite une connexion internet.
                Vérifiez votre connexion et réessayez.
              </span>
            </div>
          )}

          {/* General error */}
          {generalError && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-danger text-sm" role="alert">
              {generalError}
              {generalError.includes('expiré') && step === 3 && (
                <button
                  type="button"
                  onClick={() => { setStep(1); setGeneralError(''); setOtpValue(''); setResetToken(''); }}
                  className="ml-2 underline font-semibold"
                >
                  Recommencer
                </button>
              )}
            </div>
          )}

          {/* ── STEP 1 ── */}
          {step === 1 && (
            <form onSubmit={handleSendOtp} className="space-y-5">
              <div>
                <h2 className="text-base font-bold text-text-default mb-1">Entrez votre numéro</h2>
                <p className="text-sm text-text-muted">Vous recevrez un code sur l'email lié à votre compte.</p>
              </div>
              <div>
                <label className="form-label" htmlFor="phone">Numéro de téléphone</label>
                <input
                  id="phone"
                  type="tel"
                  placeholder="+243 8XX XXX XXX"
                  disabled={isLoading || !isOnline}
                  value={phone}
                  onChange={(e) => { setPhone(e.target.value); setPhoneError(''); }}
                  className="w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-accent transition disabled:opacity-50 border-gray-300"
                />
                {phoneError && <p className="form-error">{phoneError}</p>}
              </div>
              <button
                type="submit"
                disabled={isLoading || !phone || !isOnline}
                className="btn-primary w-full py-3 font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isLoading ? (
                  <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Envoi en cours...</>
                ) : 'ENVOYER LE CODE PAR EMAIL'}
              </button>
            </form>
          )}

          {/* ── STEP 2 ── */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-base font-bold text-text-default mb-1">Code de vérification</h2>
                <p className="text-sm text-text-muted">
                  Code envoyé à <span className="font-medium">{maskedEmail || maskedPhone}</span> — valable 10 minutes.
                </p>
              </div>

              <OtpInput
                value={otpValue}
                onChange={setOtpValue}
                onComplete={handleVerifyOtp}
                disabled={isLoading}
                hasError={otpShake}
              />

              {otpError && (
                <p className="text-danger text-sm text-center">{otpError}</p>
              )}

              <button
                type="button"
                onClick={() => handleVerifyOtp()}
                disabled={isLoading || otpValue.length < 6}
                className="btn-primary w-full py-3 font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isLoading ? (
                  <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Vérification...</>
                ) : 'VÉRIFIER LE CODE'}
              </button>

              <div className="text-center text-sm text-text-muted">
                Pas reçu ?{' '}
                {countdown.isFinished ? (
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={isLoading}
                    className="text-primary-accent hover:underline font-medium"
                  >
                    Renvoyer le code
                  </button>
                ) : (
                  <span className="text-gray-400">Renvoyer dans {countdown.formatted}</span>
                )}
              </div>

              <button
                type="button"
                onClick={() => { setStep(1); setOtpValue(''); setOtpError(''); setGeneralError(''); }}
                className="flex items-center gap-1 text-sm text-text-muted hover:text-primary transition"
              >
                <ArrowLeft size={14} /> Modifier le numéro
              </button>
            </div>
          )}

          {/* ── STEP 3 ── */}
          {step === 3 && (
            <form onSubmit={handleResetPassword} className="space-y-5">
              <div>
                <h2 className="text-base font-bold text-text-default mb-1">Nouveau mot de passe</h2>
                <p className="text-sm text-text-muted">Choisissez un mot de passe sécurisé.</p>
              </div>

              <div>
                <label className="form-label" htmlFor="newPassword">Nouveau mot de passe</label>
                <div className="relative">
                  <input
                    id="newPassword"
                    type={showNew ? 'text' : 'password'}
                    placeholder="••••••••"
                    disabled={isLoading}
                    value={newPassword}
                    onChange={(e) => { setNewPassword(e.target.value); setPasswordError(''); }}
                    className="w-full px-4 py-3 pr-12 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-accent transition disabled:opacity-50 border-gray-300"
                  />
                  <button type="button" onClick={() => setShowNew((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                    {showNew ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <PasswordStrength password={newPassword} />
              </div>

              <div>
                <label className="form-label" htmlFor="confirmPassword">Confirmer le mot de passe</label>
                <div className="relative">
                  <input
                    id="confirmPassword"
                    type={showConfirm ? 'text' : 'password'}
                    placeholder="••••••••"
                    disabled={isLoading}
                    value={confirmPassword}
                    onChange={(e) => { setConfirmPassword(e.target.value); setPasswordError(''); }}
                    className="w-full px-4 py-3 pr-12 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-accent transition disabled:opacity-50 border-gray-300"
                  />
                  <button type="button" onClick={() => setShowConfirm((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                    {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {confirmPassword && (
                  <p className={`text-xs mt-1 ${newPassword === confirmPassword ? 'text-success' : 'text-danger'}`}>
                    {newPassword === confirmPassword ? '✓ Les mots de passe correspondent' : 'Les mots de passe ne correspondent pas'}
                  </p>
                )}
                {passwordError && <p className="form-error">{passwordError}</p>}
              </div>

              <button
                type="submit"
                disabled={isLoading || newPassword.length < 6 || newPassword !== confirmPassword}
                className="btn-primary w-full py-3 font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isLoading ? (
                  <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Enregistrement...</>
                ) : 'ENREGISTRER LE NOUVEAU MOT DE PASSE'}
              </button>
            </form>
          )}

          {/* ── DONE ── */}
          {step === 'done' && (
            <div className="text-center space-y-4 py-4">
              <div className="flex justify-center">
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                  <CheckCircle size={40} className="text-success" />
                </div>
              </div>
              <h2 className="text-xl font-bold text-text-default">Mot de passe réinitialisé !</h2>
              <p className="text-sm text-text-muted">
                Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.
                <br />
                Redirection automatique dans 3 secondes…
              </p>
              <button
                type="button"
                onClick={() => navigate('/login', { replace: true })}
                className="btn-primary px-6 py-2 font-semibold"
              >
                SE CONNECTER →
              </button>
            </div>
          )}

          {/* Back to login */}
          {step !== 'done' && (
            <div className="mt-6 pt-4 border-t border-gray-100">
              <Link to="/login" className="flex items-center gap-2 text-sm text-text-muted hover:text-primary transition">
                <ArrowLeft size={14} />
                Retour à la connexion
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
