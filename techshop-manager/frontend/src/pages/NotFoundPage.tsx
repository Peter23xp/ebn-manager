import { Link } from 'react-router-dom';
import { PageSEO } from '@/components/seo/PageSEO';
import { usePageScroll } from '@/hooks/usePageScroll';

/**
 * 404 globale. Vrais liens (<a href>) vers des destinations publiques
 * uniquement : un visiteur non connecté ne doit pas être envoyé vers
 * /dashboard ou /clients (redirection vers la connexion, puis impasse).
 */
const CSS = `
  .nf { --ink: #111827; --text: #374151; --muted: #6b7280; --gold: #a17e36;
    min-height: 100vh; background: #fff; color: var(--ink); font-family: "Plus Jakarta Sans", system-ui, sans-serif;
    display: flex; flex-direction: column; }
  .nf-top { border-bottom: 1px solid #e5e7eb; padding: 0 32px; height: 68px; display: flex; align-items: center; }
  .nf-brand { display: flex; align-items: center; gap: 10px; text-decoration: none; }
  .nf-brand img { height: 40px; width: 40px; object-fit: contain; }
  .nf-brand-name { font-family: 'Playfair Display', Georgia, serif; font-size: 18px; font-weight: 700; color: var(--ink); }
  .nf-brand-name span { color: var(--gold); }
  .nf-body { flex: 1; display: flex; align-items: center; justify-content: center; padding: 48px 20px; }
  .nf-box { max-width: 480px; }
  .nf-code { font-family: 'Playfair Display', Georgia, serif; font-size: 96px; font-weight: 700; line-height: 1; color: var(--gold); margin: 0 0 16px; }
  .nf-title { font-family: 'Playfair Display', Georgia, serif; font-size: 34px; font-weight: 700; margin: 0 0 10px; }
  .nf-text { font-size: 16px; color: var(--text); margin: 0 0 28px; }
  .nf-actions { display: flex; flex-wrap: wrap; gap: 12px; }
  .nf .nf-btn { font-size: 14.5px; font-weight: 600; border-radius: 6px; padding: 0 22px; min-height: 46px; display: inline-flex; align-items: center; text-decoration: none; border: 1px solid transparent; }
  .nf .nf-btn-dark { background: var(--ink); color: #fff; }
  .nf .nf-btn-dark:hover { background: #374151; }
  .nf .nf-btn-line { background: #fff; color: var(--ink); border-color: #d1d5db; }
  .nf .nf-btn-line:hover { border-color: var(--ink); }
  .nf-help { font-size: 14px; color: var(--muted); margin: 28px 0 0; }
  .nf .nf-help a { min-height: 0; color: var(--ink); font-weight: 600; }
  .nf a:focus-visible { outline: 2px solid var(--gold); outline-offset: 3px; }
`;

export default function NotFoundPage() {
  usePageScroll();
  return (
    <div className="nf safe-page">
      <PageSEO title="Page introuvable" noindex />
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <header className="nf-top">
        <Link to="/" className="nf-brand" aria-label="EBN Network - Accueil">
          <img src="/assets/Progress business logo.png" alt="" />
          <span className="nf-brand-name">EBN <span>Network</span></span>
        </Link>
      </header>

      <main className="nf-body">
        <div className="nf-box">
          <p className="nf-code" aria-hidden>404</p>
          <h1 className="nf-title">Page introuvable</h1>
          <p className="nf-text">L'URL que vous avez saisie n'existe pas ou a été déplacée.</p>
          <div className="nf-actions">
            <Link to="/" className="nf-btn nf-btn-dark">Retour à l'accueil</Link>
            <Link to="/login" className="nf-btn nf-btn-line">Se connecter</Link>
          </div>
          <p className="nf-help">
            Besoin d'aide ? <Link to="/support">Contactez le support</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
