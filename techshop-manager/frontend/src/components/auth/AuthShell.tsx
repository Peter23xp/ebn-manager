import { Link } from 'react-router-dom';
import { SIEGE } from '@/lib/site';
import { usePageScroll } from '@/hooks/usePageScroll';

/**
 * Gabarit commun des pages de connexion (staff et membre).
 * Même langage visuel que la page d'accueil : fond blanc, texte noir,
 * accent or utilisé avec parcimonie, photo réelle sans surimpression.
 */

interface AuthShellProps {
  label: string;
  title: string;
  subtitle: string;
  photo: { src: string; alt: string; caption: string };
  /** Lien vers l'autre espace (membre ↔ staff). */
  switchLink: { to: string; text: string; cta: string };
  banner?: React.ReactNode;
  children: React.ReactNode;
}

const CSS = `
  .au { --ink: #111827; --text: #374151; --muted: #6b7280; --line: #e5e7eb; --gold: #a17e36;
    min-height: 100vh; background: #fff; color: var(--ink); font-family: "Plus Jakarta Sans", system-ui, sans-serif;
    display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
  @media (max-width: 960px) { .au { grid-template-columns: 1fr; } }
  .au * { box-sizing: border-box; }

  .au-aside { background: #f1f5f9; padding: 32px 48px 32px; display: flex; flex-direction: column; gap: 28px; position: sticky; top: 0; height: 100vh; height: 100dvh; }
  @media (max-width: 960px) { .au-aside { display: none; } }
  .au-photo { position: relative; flex: 1; min-height: 0; border-radius: 8px; overflow: hidden; background: #e5e7eb; }
  .au-photo img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center 30%; display: block; }
  .au-caption { font-size: 13px; color: var(--muted); margin: -16px 0 0; }
  .au-aside-foot { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; font-size: 12.5px; color: var(--muted); border-top: 1px solid #d1d5db; padding-top: 16px; }

  .au-main { display: flex; flex-direction: column; padding: 28px 48px 32px; }
  @media (max-width: 640px) { .au-main { padding: 20px 20px 28px; } }
  .au-top { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
  .au-brand { display: flex; align-items: center; gap: 10px; text-decoration: none; }
  .au-brand img { height: 40px; width: 40px; object-fit: contain; }
  .au-brand-name { font-family: 'Playfair Display', Georgia, serif; font-size: 18px; font-weight: 700; color: var(--ink); }
  .au-brand-name span { color: var(--gold); }
  .au .au-back { min-height: 0; font-size: 13.5px; color: var(--text); text-decoration: none; }
  .au-back:hover { color: var(--ink); text-decoration: underline; text-underline-offset: 4px; }

  .au-body { flex: 1; display: flex; align-items: center; justify-content: center; padding: 48px 0; }
  .au-form { width: 100%; max-width: 400px; }
  .au-label { font-size: 12px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: var(--gold); margin: 0 0 12px; }
  .au-title { font-family: 'Playfair Display', Georgia, serif; font-size: clamp(30px, 3.4vw, 38px); font-weight: 700; line-height: 1.12; letter-spacing: -0.01em; margin: 0 0 10px; color: var(--ink); }
  .au-sub { font-size: 15px; color: var(--text); margin: 0 0 32px; }

  .au-field { margin-bottom: 18px; }
  .au-field-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px; }
  .au-field label, .au-field .au-field-label { font-size: 13px; font-weight: 600; color: var(--ink); display: block; }
  .au-field-head label { margin: 0; }
  .au .au-field input.au-input { font-family: inherit; font-size: 15px; color: var(--ink); width: 100%; min-height: 48px; padding: 11px 14px; border: 1px solid #d1d5db; border-radius: 6px; background: #fff; transition: border-color .15s, box-shadow .15s; }
  .au .au-field input.au-input::placeholder { color: #9ca3af; }
  .au .au-field input.au-input:focus { outline: none; border-color: var(--gold); box-shadow: 0 0 0 3px rgba(161,126,54,.15); }
  .au .au-field input.au-input:disabled { opacity: .55; cursor: not-allowed; }
  .au .au-field input.au-input.is-error { border-color: #b91c1c; }
  .au-hint { font-size: 12.5px; margin: 6px 0 0; color: var(--muted); }
  .au-hint.ok { color: #15803d; }
  .au-hint.err { color: #b91c1c; }
  .au-pwd { position: relative; }
  .au .au-pwd input.au-input { padding-right: 48px; }
  .au-eye { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); width: 38px; height: 38px; border: 0; background: none; color: var(--muted); cursor: pointer; display: flex; align-items: center; justify-content: center; border-radius: 6px; }
  .au-eye:hover { color: var(--ink); }
  .au .au-link { min-height: 0; font-size: 13px; font-weight: 600; color: var(--ink); text-decoration: underline; text-underline-offset: 3px; }
  .au-link:hover { color: var(--gold); }
  .au-check { display: flex; align-items: center; gap: 10px; font-size: 14px; color: var(--text); cursor: pointer; margin: 4px 0 22px; }
  .au-check input { width: 16px; height: 16px; accent-color: var(--ink); cursor: pointer; }

  .au-btn { font-family: inherit; width: 100%; min-height: 50px; border: 0; border-radius: 6px; background: var(--ink); color: #fff; font-size: 15px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 10px; transition: background .15s; }
  .au-btn:hover:not(:disabled) { background: #374151; }
  .au-btn:disabled { opacity: .45; cursor: not-allowed; }
  .au-btn:focus-visible, .au-eye:focus-visible, .au-link:focus-visible, .au-back:focus-visible, .au-switch a:focus-visible { outline: 2px solid var(--gold); outline-offset: 3px; }
  .au-btn-sub { display: block; font-size: 12px; font-weight: 400; opacity: .8; }

  .au-error { border: 1px solid #fecaca; background: #fef2f2; color: #b91c1c; border-radius: 6px; padding: 12px 14px; font-size: 14px; font-weight: 600; margin: 0 0 18px; }
  .au-countdown { display: block; margin-top: 6px; font-size: 22px; font-variant-numeric: tabular-nums; }
  .au-note { font-size: 13px; color: var(--muted); margin: 18px 0 0; text-align: center; }
  .au-status { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--muted); }
  .au-status i { width: 7px; height: 7px; border-radius: 50%; background: #16a34a; }
  .au-status.off i { background: #d97706; }

  .au-switch { border-top: 1px solid var(--line); margin-top: 32px; padding-top: 20px; font-size: 14px; color: var(--text); }
  .au-switch a { color: var(--ink); font-weight: 600; }
  .au-legal { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px 18px; font-size: 12.5px; margin-bottom: 12px; }
  .au .au-legal a { min-height: 0; color: var(--muted); text-decoration: none; }
  .au .au-legal a:hover { color: var(--ink); text-decoration: underline; }
  .au-foot { font-size: 12.5px; color: var(--muted); display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  @media (min-width: 961px) { .au-foot { display: none; } }

  .au-banner { position: fixed; top: 0; left: 0; right: 0; z-index: 50; background: #92400e; color: #fff; font-size: 13px; font-weight: 600; text-align: center; padding: 8px 16px; }

  .au-pin { display: flex; gap: 12px; }
  .au .au-pin > input[inputmode] { flex: 0 0 56px; min-height: 0; padding: 0; width: 56px; height: 60px; text-align: center; font-size: 22px; font-weight: 700; font-family: inherit; color: var(--ink); border: 1px solid #d1d5db; border-radius: 6px; background: #fff; }
  .au .au-pin > input[inputmode]:focus { outline: none; border-color: var(--gold); box-shadow: 0 0 0 3px rgba(161,126,54,.15); }
  .au .au-pin > input[inputmode]:disabled { opacity: .55; }
`;

export function AuthShell({ label, title, subtitle, photo, switchLink, banner, children }: AuthShellProps) {
  usePageScroll();
  const year = new Date().getFullYear();
  return (
    <div className="au safe-page">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      {banner}

      <aside className="au-aside">
        <div className="au-photo">
          <img src={photo.src} alt={photo.alt} decoding="async" />
        </div>
        <p className="au-caption">{photo.caption}</p>
        <div className="au-aside-foot">
          <span>Siège social : {SIEGE.libelle}</span>
          <span>Boutiques : Goma · Bukavu · Kinshasa</span>
        </div>
      </aside>

      <main className="au-main">
        <div className="au-top">
          <Link to="/" className="au-brand" aria-label="EBN Network - Accueil">
            <img src="/assets/logo-ebn.png" alt="" />
            <span className="au-brand-name">EBN <span>Network</span></span>
          </Link>
          <Link to="/" className="au-back">← Retour au site</Link>
        </div>

        <div className="au-body">
          <div className="au-form">
            <p className="au-label">{label}</p>
            <h1 className="au-title">{title}</h1>
            <p className="au-sub">{subtitle}</p>
            {children}
            <p className="au-switch">
              {switchLink.text} <Link to={switchLink.to}>{switchLink.cta}</Link>
            </p>
          </div>
        </div>

        <nav className="au-legal" aria-label="Informations légales">
          <Link to="/legal/confidentialite">Confidentialité</Link>
          <Link to="/legal/conditions">Conditions générales</Link>
          <Link to="/legal/cookies">Cookies</Link>
          <Link to="/legal/mentions-legales">Mentions légales</Link>
        </nav>
        <div className="au-foot">
          <span>Siège social : {SIEGE.libelle}</span>
          <span>© {year} EBN Network</span>
        </div>
      </main>
    </div>
  );
}
