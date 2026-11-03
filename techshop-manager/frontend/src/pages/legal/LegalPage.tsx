import { Link, NavLink, useParams } from 'react-router-dom';
import { useEffect } from 'react';
import { PageSEO } from '@/components/seo/PageSEO';
import { LegalMarkdown } from '@/components/legal/LegalMarkdown';
import { usePageScroll } from '@/hooks/usePageScroll';
import { SIEGE } from '@/lib/site';
import NotFoundPage from '@/pages/NotFoundPage';
import confidentialite from '@/content/legal/confidentialite.md?raw';
import conditions from '@/content/legal/conditions.md?raw';
import mentions from '@/content/legal/mentions-legales.md?raw';
import cookies from '@/content/legal/cookies.md?raw';

/** Documents juridiques publics. Le Markdown de src/content/legal est la source unique. */
export const LEGAL_DOCS = [
  { slug: 'mentions-legales', titre: 'Mentions légales', description: "Éditeur du site, siège social, hébergement et propriété intellectuelle d'EBN Network.", source: mentions },
  { slug: 'confidentialite', titre: 'Politique de confidentialité', description: 'Données collectées par EBN Network, finalités, prestataires, durées de conservation et droits des personnes (loi russe 152-FZ).', source: confidentialite },
  { slug: 'conditions', titre: "Conditions générales", description: "Conditions d'utilisation du service et d'adhésion au programme de parrainage EBN Network.", source: conditions },
  { slug: 'cookies', titre: 'Politique cookies', description: 'Cookies et stockage local strictement nécessaires utilisés par EBN Network.', source: cookies },
] as const;

const CSS = `
  .lg { --ink: #111827; --text: #374151; --muted: #6b7280; --line: #e5e7eb; --gold: #a17e36;
    min-height: 100vh; background: #fff; color: var(--ink); font-family: "Plus Jakarta Sans", system-ui, sans-serif; }
  .lg * { box-sizing: border-box; }
  .lg-wrap { max-width: 1180px; margin: 0 auto; padding: 0 32px; }
  @media (max-width: 640px) { .lg-wrap { padding: 0 20px; } }
  .lg-top { border-bottom: 1px solid var(--line); }
  .lg-top .lg-wrap { height: 68px; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
  .lg-brand { display: flex; align-items: center; gap: 10px; text-decoration: none; }
  .lg-brand img { height: 40px; width: 40px; object-fit: contain; }
  .lg-brand-name { font-family: 'Playfair Display', Georgia, serif; font-size: 18px; font-weight: 700; color: var(--ink); }
  .lg-brand-name span { color: var(--gold); }
  .lg .lg-back { min-height: 0; font-size: 13.5px; color: var(--text); text-decoration: none; }
  .lg .lg-back:hover { color: var(--ink); text-decoration: underline; text-underline-offset: 4px; }

  .lg-grid { display: grid; grid-template-columns: 240px minmax(0, 1fr); gap: 64px; padding: 56px 0 96px; align-items: start; }
  @media (max-width: 900px) { .lg-grid { grid-template-columns: 1fr; gap: 28px; padding: 32px 0 64px; } }
  .lg-nav { position: sticky; top: 24px; }
  @media (max-width: 900px) { .lg-nav { position: static; } }
  .lg-nav-title { font-size: 12px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: var(--gold); margin: 0 0 12px; }
  .lg-nav ul { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--line); }
  .lg-nav li { border-bottom: 1px solid var(--line); }
  .lg .lg-nav a { min-height: 0; display: block; padding: 12px 0; font-size: 14px; color: var(--text); text-decoration: none; }
  .lg .lg-nav a:hover { color: var(--ink); }
  .lg .lg-nav a.active { color: var(--ink); font-weight: 700; }
  @media (max-width: 900px) { .lg-nav ul { display: flex; flex-wrap: wrap; gap: 8px 20px; border: 0; } .lg-nav li { border: 0; } .lg .lg-nav a { padding: 4px 0; } }

  .lg-doc { max-width: 74ch; font-size: 15.5px; line-height: 1.7; color: var(--text); }
  .lg-doc p { margin: 0 0 14px; }
  .lg-doc ul { margin: 0 0 16px; padding-left: 20px; list-style: disc; }
  .lg-doc li::marker { color: var(--gold); }
  .lg-doc li { margin-bottom: 6px; }
  .lg-doc strong { color: var(--ink); }
  .lg-doc a { color: var(--ink); text-decoration: underline; text-underline-offset: 3px; overflow-wrap: anywhere; }
  .lg-h1 { font-family: 'Playfair Display', Georgia, serif; font-size: clamp(32px, 4vw, 44px); line-height: 1.12; font-weight: 700; color: var(--ink); margin: 0 0 8px; }
  .lg-h1 + p { font-size: 13.5px; color: var(--muted); margin-bottom: 32px; }
  .lg-h2 { font-family: 'Playfair Display', Georgia, serif; font-size: 24px; font-weight: 700; color: var(--ink); margin: 40px 0 12px; padding-top: 24px; border-top: 1px solid var(--line); scroll-margin-top: 24px; }
  .lg-h3 { font-size: 16px; font-weight: 700; color: var(--ink); margin: 24px 0 8px; }
  .lg-quote { font-size: 13.5px; line-height: 1.6; color: #92400e; background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 14px 16px; margin: 0 0 32px; }
  .lg-todo { background: #fef3c7; color: #92400e; font-weight: 700; padding: 0 4px; border-radius: 3px; }
  .lg-assume { background: #eef2ff; color: #3730a3; font-size: .9em; padding: 0 4px; border-radius: 3px; }
  .lg-table-wrap { overflow-x: auto; border: 1px solid var(--line); border-radius: 8px; margin: 0 0 20px; }
  .lg-doc table { width: 100%; border-collapse: collapse; font-size: 14px; }
  .lg-doc th { text-align: left; font-size: 12px; font-weight: 600; color: var(--muted); background: #f9fafb; padding: 10px 14px; border-bottom: 1px solid var(--line); }
  .lg-doc td { padding: 10px 14px; border-bottom: 1px solid var(--line); vertical-align: top; }
  .lg-doc tr:last-child td { border-bottom: 0; }
  .lg-foot { border-top: 1px solid var(--line); padding: 24px 0 32px; font-size: 12.5px; color: var(--muted); }
  .lg-foot .lg-wrap { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
`;

export default function LegalPage() {
  usePageScroll();
  const { slug } = useParams();
  const doc = LEGAL_DOCS.find(d => d.slug === slug);

  useEffect(() => { window.scrollTo(0, 0); }, [slug]);

  if (!doc) return <NotFoundPage />;

  return (
    <div className="lg safe-page">
      <PageSEO title={doc.titre} description={doc.description} canonical={`/legal/${doc.slug}`} />
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <header className="lg-top">
        <div className="lg-wrap">
          <Link to="/" className="lg-brand" aria-label="EBN Network - Accueil">
            <img src="/assets/Progress business logo.png" alt="" />
            <span className="lg-brand-name">EBN <span>Network</span></span>
          </Link>
          <Link to="/" className="lg-back">← Retour au site</Link>
        </div>
      </header>

      <div className="lg-wrap lg-grid">
        <nav className="lg-nav" aria-label="Informations légales">
          <p className="lg-nav-title">Informations légales</p>
          <ul>
            {LEGAL_DOCS.map(d => (
              <li key={d.slug}><NavLink to={`/legal/${d.slug}`}>{d.titre}</NavLink></li>
            ))}
          </ul>
        </nav>
        <article className="lg-doc">
          <LegalMarkdown source={doc.source} />
        </article>
      </div>

      <footer className="lg-foot">
        <div className="lg-wrap">
          <span>Siège social : {SIEGE.libelle}</span>
          <span>© {new Date().getFullYear()} EBN Network</span>
        </div>
      </footer>
    </div>
  );
}
