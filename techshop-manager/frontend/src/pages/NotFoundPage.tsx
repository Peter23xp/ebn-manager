import { Link } from 'react-router-dom';
import { PageSEO } from '@/components/seo/PageSEO';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-4 text-center">
      <PageSEO title="Page introuvable" noindex />

      <div className="animate-fade-up">
        <p className="text-8xl font-extrabold tracking-tight text-primary">404</p>
        <h1 className="mt-4 font-page-title text-text">Page introuvable</h1>
        <p className="mt-2 max-w-md text-body text-text-muted">
          L'URL que vous avez saisie n'existe pas ou a été déplacée.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/"
            className="flex min-h-touch items-center justify-center rounded bg-primary-accent px-5 font-label text-white transition-colors hover:bg-primary"
          >
            Retour à l'accueil
          </Link>
          <Link
            to="/login"
            className="flex min-h-touch items-center justify-center rounded border border-border-strong px-5 font-label text-text transition-colors hover:bg-sidebar-hover"
          >
            Se connecter
          </Link>
        </div>

        <p className="mt-8 text-body text-text-muted">
          Besoin d'aide ?{' '}
          <Link to="/support" className="text-primary-accent underline hover:text-primary">
            Contactez le support
          </Link>
        </p>
      </div>
    </div>
  );
}
