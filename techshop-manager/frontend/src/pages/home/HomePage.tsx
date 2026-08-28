import { useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Lottie } from 'lottie-react';
import { PageSEO } from '@/components/seo/PageSEO';

/* ── helpers ──────────────────────────────────────────────────────────────── */

function usePageScroll() {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById('root');
    html.style.overflow = 'auto';
    body.style.overflow = 'auto';
    if (root) root.style.overflow = 'auto';
    return () => {
      html.style.overflow = '';
      body.style.overflow = '';
      if (root) root.style.overflow = '';
    };
  }, []);
}

function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.style.opacity = '1';
      el.style.transform = 'none';
      return;
    }
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          el.style.opacity = '1';
          el.style.transform = 'translateY(0)';
          obs.disconnect();
        }
      },
      { threshold: 0.1 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return ref;
}

function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const ref = useReveal();
  return (
    <div
      ref={ref}
      style={{
        opacity: 0,
        transform: 'translateY(22px)',
        transition: `opacity 0.6s cubic-bezier(0.25,1,0.5,1) ${delay}ms, transform 0.6s cubic-bezier(0.25,1,0.5,1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

/* ── donnees ──────────────────────────────────────────────────────────────── */

function LottieAsset({ file, label }: { file: string; label: string }) {
  const [animationData, setAnimationData] = useState<object | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/assets/${file}`, { signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error(`Impossible de charger ${file}`);
        return response.json();
      })
      .then(setAnimationData)
      .catch(error => {
        if (error.name !== 'AbortError') console.error(error);
      });
    return () => controller.abort();
  }, [file]);

  if (!animationData) return <div className="lp-lottie-loading" aria-hidden />;

  return <Lottie src={animationData} loop autoplay className="lp-lottie" aria-label={label} role="img" />;
}

const STATS = [
  { v: '3', l: 'Villes', sub: 'Goma · Bukavu · Kinshasa' },
  { v: '8', l: 'Niveaux', sub: "D'ambassadeur" },
  { v: '50K', l: 'Bonus $', sub: 'Retraite Crown' },
  { v: '100%', l: 'Tracable', sub: 'Portefeuille USD' },
];

const VALEURS = [
  {
    icon: String.fromCodePoint(0x1F91D),
    titre: 'Integrite',
    desc: 'Nous operons en toute transparence : plan de remuneration clair, pas de promesses irrealistes, des faits.',
  },
  {
    icon: String.fromCodePoint(0x1F30D),
    titre: 'Ancrage local',
    desc: 'Fondee a Goma, EBN connait les realites de la region des Grands Lacs et agit pour sa communaute.',
  },
  {
    icon: String.fromCodePoint(0x1F4C8),
    titre: 'Croissance reelle',
    desc: "Vente de produits et services concrets d'abord. Le reseau amplifie, il ne remplace pas la valeur reelle.",
  },
  {
    icon: String.fromCodePoint(0x1F512),
    titre: 'Conformite',
    desc: 'Enregistree legalement a Goma (RCCM), EBN opere dans un cadre legal rigoureux.',
  },
];

const PRODUITS = [
  { num: '01', nom: 'Produits et services reels', desc: 'Proposez des solutions utiles et concrètes qui créent une vraie valeur pour vos clients.', badge: 'Valeur réelle' },
  { num: '02', nom: 'Formation et accompagnement', desc: 'Commencez avec les bons outils, des conseils pratiques et un accompagnement à chaque étape.', badge: 'Démarrage' },
  { num: '03', nom: 'Une communauté locale', desc: 'Rejoignez des partenaires engagés à Goma, Bukavu et Kinshasa, et avancez avec eux.', badge: 'Communauté' },
  { num: '04', nom: 'Parrainage transparent', desc: 'Développez votre réseau dans un cadre clair, fondé sur la confiance et le partage.', badge: 'Réseau' },
  { num: '05', nom: 'Commissions évolutives', desc: 'Faites progresser vos revenus selon votre activité, votre engagement et les résultats de votre réseau.', badge: 'Progression' },
  { num: '06', nom: 'Un parcours de réussite', desc: 'Évoluez de Builder vers les niveaux Ambassadeur grâce à un plan de carrière structuré.', badge: 'Carrière' },
];

const OPPORTUNITE = [
  { niveau: 'Builder', filleuls: 4, commission: '24 USD', bonus: '2 pagnes' },
  { niveau: 'Sapphire', filleuls: 4, commission: '50 USD', bonus: '1er kit alimentaire' },
  { niveau: 'Ruby', filleuls: 4, commission: '80 USD', bonus: '2e kit alimentaire' },
  { niveau: 'Emerald', filleuls: 4, commission: '200 USD', bonus: 'Écran plat 52 pouces' },
  { niveau: 'Diamond', filleuls: 4, commission: '1 000 USD', bonus: 'Moto de luxe de 2 000 USD' },
  { niveau: 'Crown Diamond', filleuls: 4, commission: '2 000 USD', bonus: '1re voiture de 6 000 USD' },
  { niveau: 'Ambassadeur', filleuls: 4, commission: '20 000 USD', bonus: '1re maison de 30 000 USD + 2e voiture de 15 000 USD' },
  { niveau: 'Crown Ambassadeur', filleuls: 4, commission: '50 000 USD', bonus: '2e maison + 3e voiture' },
];

const TEMOIGNAGES = [
  { nom: 'Marie K.', ville: 'Goma', role: 'Ambassadrice Niveau Or', texte: "Grace a EBN, j'ai pu batir un reseau de plus de 20 partenaires en 6 mois. La transparence du systeme m'a convaincue des le depart." },
  { nom: 'Patrick M.', ville: 'Bukavu', role: 'Distributeur Bronze', texte: "Le systeme de caisse POS a revolutionne la gestion de ma boutique. Je vois mes ventes en temps reel meme depuis mon telephone." },
  { nom: 'Sarah N.', ville: 'Kinshasa', role: 'Ambassadrice Argent', texte: "Ce qui m'a seduite, c'est la clarte : chaque commission est visible dans mon portefeuille. Aucune surprise, aucune promesse vide." },
];

const ETAPES = [
  { n: '1', titre: 'Contactez-nous', desc: "Via WhatsApp ou le formulaire. Un conseiller EBN vous repond sous 24h pour repondre a vos questions." },
  { n: '2', titre: 'Inscription en boutique', desc: "Venez dans l'une de nos boutiques a Goma, Bukavu ou Kinshasa. Formation et activation de votre compte." },
  { n: '3', titre: 'Parrainez 4 personnes', desc: "Chaque personne que vous amenez occupe une position dans votre matrice et vous genere une commission." },
  { n: '4', titre: 'Montez les niveaux', desc: "Matrice complete = commission versee + promotion au niveau suivant avec des montants plus eleves." },
];

const WHATSAPP_LINK = 'https://wa.me/243974752784?text=Bonjour%20EBN%20!%20Je%20souhaite%20en%20savoir%20plus%20sur%20votre%20programme.';
const WHATSAPP_NUMBER = '+243 974 752 784';

/* ── formulaire contact ───────────────────────────────────────────────────── */

type ContactState = 'idle' | 'sending' | 'success' | 'error';

function ContactForm() {
  const [form, setForm] = useState({ nom: '', telephone: '', ville: '', message: '' });
  const [state, setState] = useState<ContactState>('idle');

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nom.trim() || !form.telephone.trim()) { setState('error'); return; }
    setState('sending');
    await new Promise(r => setTimeout(r, 1200));
    setState('success');
  };

  if (state === 'success') {
    return (
      <div className="lp-form-success" role="status">
        <div className="lp-success-icon" aria-hidden>
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </div>
        <h3 className="lp-success-title">Message recu !</h3>
        <p className="lp-success-desc">Merci {form.nom}. Un conseiller EBN vous contactera sous 24h au {form.telephone}.</p>
      </div>
    );
  }

  return (
    <form className="lp-contact-form" onSubmit={submit} noValidate>
      <div className="lp-form-row">
        <div className="lp-field">
          <label htmlFor="lp-nom">Nom complet *</label>
          <input id="lp-nom" type="text" value={form.nom} onChange={set('nom')} placeholder="Jean Kabila" autoComplete="name" />
        </div>
        <div className="lp-field">
          <label htmlFor="lp-tel">Telephone *</label>
          <input id="lp-tel" type="tel" value={form.telephone} onChange={set('telephone')} placeholder="+243 9XX XXX XXX" autoComplete="tel" />
        </div>
      </div>
      <div className="lp-field">
        <label htmlFor="lp-ville">Ville</label>
        <select id="lp-ville" value={form.ville} onChange={set('ville')}>
          <option value="">Choisir votre ville</option>
          {['Goma', 'Bukavu', 'Kinshasa', 'Autre'].map(v => <option key={v} value={v}>{v}</option>)}
        </select>
      </div>
      <div className="lp-field">
        <label htmlFor="lp-message">Message</label>
        <textarea id="lp-message" rows={3} value={form.message} onChange={set('message')} placeholder="Dites-nous en quoi nous pouvons vous aider..." />
      </div>
      {state === 'error' && (
        <p className="lp-form-error" role="alert">Merci de remplir votre nom et telephone.</p>
      )}
      <button type="submit" className="lp-form-submit" disabled={state === 'sending'}>
        {state === 'sending' ? (
          <><span className="lp-spinner" aria-hidden /> Envoi en cours...</>
        ) : 'Envoyer le message'}
      </button>
      <p className="lp-form-note">Reponse garantie sous 24h ouvrees. Vos donnees ne servent qu'a traiter votre demande.</p>
    </form>
  );
}

/* ── page ─────────────────────────────────────────────────────────────────── */

export default function HomePage() {
  const navigate = useNavigate();
  usePageScroll();
  const [activeTestimonial, setActiveTestimonial] = useState(0);

  const scrollTo = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <>
      <PageSEO canonical="/" ogType="website" />
      <Helmet>
        <title>EBN - Entreprise Benie Network | Goma, RDC</title>
        <meta name="description" content="Entreprise Benie Network (EBN) - marketing relationnel base a Goma, RDC. Rejoignez notre reseau de partenaires engages et batissez votre avenir dans la region des Grands Lacs." />
        <meta property="og:title" content="EBN - Entreprise Benie Network | Goma, RDC" />
        <meta property="og:description" content="Rejoignez un reseau de partenaires engages a Goma et dans la region des Grands Lacs, autour de produits qui changent des vies." />
        <meta property="og:type" content="website" />
        <script type="application/ld+json">{JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'Organization',
          'name': 'Entreprise Benie Network sarl',
          'alternateName': 'EBN',
          'url': 'https://ebnnetwork.onrender.com',
          'logo': 'https://ebnnetwork.onrender.com/assets/Progress business logo.png',
          'description': 'Reseau de marketing relationnel base a Goma, RDC.',
          'address': { '@type': 'PostalAddress', 'addressCountry': 'CD', 'addressLocality': 'Goma', 'addressRegion': 'Nord-Kivu' },
          'areaServed': ['Goma', 'Bukavu', 'Kinshasa', 'Grands Lacs'],
          'contactPoint': { '@type': 'ContactPoint', 'contactType': 'customer service', 'availableLanguage': ['French'] },
        })}</script>
      </Helmet>

      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700&display=swap');

        .lp { background: #f1f5f9; color: #0f172a; font-family: "Plus Jakarta Sans", system-ui, sans-serif; }
        .lp * { box-sizing: border-box; }

        /* WHATSAPP FLOAT */
        .lp-wa-float {
          position: fixed; bottom: 24px; right: 24px; z-index: 100;
          width: 56px; height: 56px; border-radius: 50%;
          background: #25D366; color: #fff;
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 4px 20px rgba(37,211,102,0.45);
          text-decoration: none; transition: transform .2s, box-shadow .2s;
        }
        .lp-wa-float:hover { transform: scale(1.1); box-shadow: 0 8px 30px rgba(37,211,102,0.55); }
        @media (max-width: 640px) { .lp-wa-float { bottom: 16px; right: 16px; width: 50px; height: 50px; } }

        /* NAV */
        .lp-nav {
          position: fixed; top: 0; left: 0; right: 0; z-index: 50;
          height: 60px; display: flex; align-items: center; justify-content: space-between;
          padding: 0 6vw; background: rgba(255,255,255,0.94);
          backdrop-filter: blur(14px); border-bottom: 1px solid #e2e8f0;
        }
        .lp-nav-brand { display: flex; align-items: center; gap: 10px; text-decoration: none; }
        .lp-nav-brand img { height: 44px; width: 44px; object-fit: contain; }
        .lp-nav-name { font-family: 'Playfair Display', Georgia, serif; font-size: 17px; font-weight: 700; color: #0A1628; letter-spacing: -0.01em; }
        .lp-nav-name span { color: #2563eb; font-style: italic; }
        .lp-nav-links { display: flex; align-items: center; gap: 18px; }
        @media (max-width: 820px) { .lp-nav-links { display: none; } }
        .lp-nav-link { font-size: 13px; font-weight: 600; color: #334155; text-decoration: none; background: none; border: none; cursor: pointer; padding: 0; }
        .lp-nav-link:hover { color: #0A1628; }
        .lp-nav-btn { font-size: 13px; font-weight: 700; color: #fff; background: #2563eb; border: none; border-radius: 7px; padding: 0 18px; height: 36px; cursor: pointer; transition: background .18s; }
        .lp-nav-btn:hover { background: #1d4ed8; }
        .lp-nav-btn.dark { background: #fff; color: #0A1628; border: 1.5px solid #e2e8f0; }
        .lp-nav-btn.dark:hover { background: #f1f5f9; border-color: #cbd5e1; }
        .lp-nav-btn:focus-visible { outline: 2px solid #2563eb; outline-offset: 3px; }

        /* HERO - editorial, premium and conversion-focused */
        .lp-hero { min-height: 700px; padding: 52px 6vw 76px; display: grid; grid-template-columns: minmax(0, .9fr) minmax(420px, 1.1fr); gap: clamp(38px, 7vw, 108px); align-items: center; background: #0A1628; position: relative; overflow: hidden; }
        .lp-hero::before { content: ''; position: absolute; width: 520px; height: 520px; border: 1px solid rgba(251,191,36,.18); border-radius: 50%; right: -160px; top: -220px; pointer-events: none; }
        .lp-hero::after { content: ''; position: absolute; width: 300px; height: 300px; background: rgba(37,99,235,.12); filter: blur(90px); left: -90px; bottom: -140px; pointer-events: none; }
        .lp-hero-inner { padding: 34px 0; max-width: 640px; position: relative; z-index: 1; }
        @media (max-width: 860px) { .lp-hero { min-height: auto; grid-template-columns: 1fr; gap: 28px; padding: 92px 6vw 64px; } .lp-hero-inner { padding: 14px 0 0; max-width: 700px; } }
        @media (max-width: 640px) { .lp-hero { padding: 80px 20px 48px; } .lp-hero-inner { padding: 0; } }

        .lp-eyebrow { display: inline-flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: #fbbf24; margin-bottom: 28px; }
        .lp-eyebrow-dot { width: 7px; height: 7px; border-radius: 50%; background: #fbbf24; flex-shrink: 0; animation: lp-pulse 2s ease-in-out infinite; box-shadow: 0 0 0 5px rgba(251,191,36,.13); }
        @keyframes lp-pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }

        .lp-h1 { font-family: 'Playfair Display', Georgia, serif; font-size: clamp(44px, 6.5vw, 78px); font-weight: 900; line-height: 0.99; letter-spacing: -0.03em; color: #fff; margin: 0 0 30px; text-wrap: balance; }
        .lp-h1 em { font-style: italic; color: #fbbf24; }

        .lp-hero-sub { font-size: clamp(15px, 1.45vw, 18px); font-weight: 400; line-height: 1.7; color: #cbd5e1; max-width: 560px; margin: 0 0 40px; }

        .lp-actions { display: flex; gap: 12px; flex-wrap: wrap; }
        .lp-btn-primary { font-size: 14px; font-weight: 700; background: #2563eb; color: #fff; border: none; border-radius: 8px; padding: 14px 30px; cursor: pointer; min-height: 48px; transition: background .18s, box-shadow .18s; }
        .lp-btn-primary:hover { background: #1d4ed8; box-shadow: 0 8px 24px rgba(37,99,235,0.25); }
        .lp-btn-primary:focus-visible { outline: 2px solid #2563eb; outline-offset: 3px; }
        .lp-btn-secondary { font-size: 14px; font-weight: 700; background: transparent; color: #fff; border: 1.5px solid rgba(255,255,255,.3); border-radius: 8px; padding: 14px 30px; cursor: pointer; min-height: 48px; transition: background .18s, border-color .18s; }
        .lp-btn-secondary:hover { background: rgba(255,255,255,.1); border-color: rgba(255,255,255,.65); }
        .lp-btn-secondary:focus-visible { outline: 2px solid #fbbf24; outline-offset: 3px; }

        .lp-hero-proof { display: flex; flex-wrap: wrap; gap: 12px 22px; margin-top: 26px; color: #94a3b8; font-size: 11px; line-height: 1.4; }
        .lp-hero-proof span { display: inline-flex; align-items: center; gap: 5px; }
        .lp-hero-proof span::before { content: ''; width: 5px; height: 5px; border-radius: 50%; background: #fbbf24; }
        .lp-hero-proof strong { color: #fff; font-weight: 800; }

        .lp-hero-img-wrap { margin: 0; height: min(620px, 68vh); min-height: 470px; border-radius: 28px; overflow: visible; background: #16243a; border: 1px solid rgba(255,255,255,.2); position: relative; display: flex; align-items: center; justify-content: center; box-shadow: 0 28px 80px rgba(0,0,0,.34); }
        @media (max-width: 860px) { .lp-hero-img-wrap { height: 430px; min-height: 0; max-width: 760px; width: 100%; } }
        @media (max-width: 640px) { .lp-hero-img-wrap { height: 330px; min-height: 0; border-radius: 20px; } }
        .lp-hero-img { position: relative; z-index: 1; width: 100%; height: 100%; object-fit: cover; object-position: center 28%; display: block; border-radius: inherit; }
        .lp-lottie { position: relative; z-index: 2; width: 100%; height: 100%; }
        .lp-lottie-loading { width: 100%; height: 100%; min-height: 160px; }
        .lp-hero-img-wrap { background: transparent; border: 0; box-shadow: none; border-radius: 0; }
        .lp-about-photo { background: transparent; border-radius: 0; }
        .lp-temo-photo { background-image: url('/assets/testimoniql.jpg') !important; background-size: cover; background-position: center; }
        .lp-temo-photo > img { opacity: 0; }
        .lp-temo-photo > .lp-temo-image { position: absolute; inset: 0; z-index: 1; width: 100%; height: 100%; object-fit: cover; object-position: center; opacity: 1; }
        .lp-hero-img-wrap > .lp-hero-img, .lp-hero-img-wrap > .lp-hero-placeholder { display: none; }
        .lp-hero-placeholder { position: absolute; inset: 0; z-index: 0; border-radius: inherit; background: linear-gradient(135deg, #0A1628 0%, #16305a 55%, #1e3a5f 100%); }
        .lp-hero-placeholder::after { content: ''; position: absolute; inset: 0; background: linear-gradient(135deg, rgba(37,99,235,.08), transparent 55%, rgba(251,191,36,.08)); }
        .lp-hero-text-overlay { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; z-index: 2; }
        .lp-hero-overlay-title { font-family: 'Playfair Display', Georgia, serif; font-size: clamp(28px, 4vw, 52px); font-weight: 900; color: rgba(255,255,255,0.9); text-align: center; letter-spacing: -0.02em; text-shadow: 0 2px 20px rgba(0,0,0,0.4); }
        .lp-hero-overlay-title em { font-style: italic; color: #93c5fd; }
        .lp-hero-overlay-sub { font-size: 14px; color: rgba(255,255,255,0.5); letter-spacing: 0.15em; text-transform: uppercase; }
        .lp-img-badge { position: absolute; bottom: -20px; left: -24px; z-index: 3; display: flex; align-items: center; gap: 9px; padding: 14px 18px; background: #fff; border: 1px solid #e2e8f0; box-shadow: 0 18px 45px rgba(0,0,0,.22); border-radius: 12px; font-size: 11px; color: #0A1628; font-weight: 800; letter-spacing: 0.05em; }
        @media (max-width: 640px) { .lp-img-badge { left: 14px; bottom: -14px; padding: 11px 14px; } }
        .lp-badge-dot { width: 6px; height: 6px; border-radius: 50%; background: #22c55e; flex-shrink: 0; animation: lp-pulse 2s ease-in-out infinite; }
        .lp-hero-caption { display: none; }
        .lp-hero-caption-kicker { color: #fff; font-size: 12px; font-weight: 800; letter-spacing: .04em; text-transform: none; }

        /* STATS */
        .lp-stats { background: #0A1628; padding: 40px 6vw; display: grid; grid-template-columns: repeat(4,1fr); border-top: 1px solid #0A1628; border-bottom: 1px solid #0A1628; }
        @media (max-width: 600px) { .lp-stats { grid-template-columns: repeat(2,1fr); gap: 32px 0; } }
        .lp-stat { padding-right: 28px; border-right: 1px solid rgba(255,255,255,.14); }
        .lp-stat:last-child { border-right: none; }
        @media (max-width: 600px) { .lp-stat:nth-child(2) { border-right: none; } .lp-stat:nth-child(3) { border-right: 1px solid rgba(255,255,255,.14); } }
        .lp-stat-v { font-family: 'Playfair Display', Georgia, serif; font-size: clamp(36px, 4vw, 48px); font-weight: 900; color: #fbbf24; line-height: 1; margin-bottom: 4px; }
        .lp-stat-l { font-size: 11px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #f8fafc; margin-bottom: 2px; }
        .lp-stat-sub { font-size: 11px; color: #94a3b8; }

        /* SECTIONS */
        .lp-sec { padding: 88px 6vw; background: #f1f5f9; }
        @media (max-width: 640px) { .lp-sec { padding: 64px 20px; } }
        .lp-sec-white { background: #ffffff; }

        .lp-sec-eyebrow { font-size: 10px; font-weight: 700; letter-spacing: 0.25em; text-transform: uppercase; color: #94a3b8; margin-bottom: 14px; }
        .lp-sec-title { font-family: 'Playfair Display', Georgia, serif; font-size: clamp(26px, 3.5vw, 40px); font-weight: 700; line-height: 1.1; letter-spacing: -0.02em; color: #0A1628; margin: 0 0 16px; max-width: 520px; }
        .lp-sec-title em { font-style: italic; color: #2563eb; }
        .lp-sec-sub { font-size: 15px; line-height: 1.7; color: #475569; max-width: 560px; margin: 0 0 48px; }

        /* A PROPOS */
        .lp-about-grid { display: grid; grid-template-columns: repeat(2,1fr); gap: 2px; background: #e2e8f0; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
        @media (max-width: 680px) { .lp-about-grid { grid-template-columns: 1fr; } }
        .lp-about-cell { background: #fff; padding: 32px 28px; transition: background .15s; }
        .lp-about-cell:hover { background: #f8fafc; }
        .lp-about-icon { font-size: 28px; margin-bottom: 14px; display: block; }
        .lp-about-titre { font-size: 16px; font-weight: 700; color: #0A1628; margin: 0 0 8px; }
        .lp-about-desc { font-size: 13.5px; line-height: 1.65; color: #475569; }

        /* PRODUITS */
        .lp-prod-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 1px; background: #e2e8f0; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; }
        @media (max-width: 900px) { .lp-prod-grid { grid-template-columns: repeat(2,1fr); } }
        @media (max-width: 500px) { .lp-prod-grid { grid-template-columns: 1fr; } }
        .lp-prod-cell { background: #fff; padding: 28px 26px; transition: background .15s; }
        .lp-prod-cell:hover { background: #f8fafc; }
        .lp-prod-num { font-family: 'Playfair Display', Georgia, serif; font-size: 11px; color: #cbd5e1; margin-bottom: 16px; }
        .lp-prod-badge { display: inline-block; font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #1d4ed8; background: #dbeafe; border-radius: 999px; padding: 3px 9px; margin-bottom: 10px; }
        .lp-prod-nom { font-size: 15px; font-weight: 700; color: #0f172a; margin-bottom: 8px; }
        .lp-prod-desc { font-size: 13px; color: #64748b; line-height: 1.6; }

        /* OPPORTUNITE */
        .lp-opp-ladder { display: flex; flex-direction: column; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; }
        .lp-opp-head { display: grid; grid-template-columns: minmax(0, 1fr) minmax(180px, 1.3fr) 110px; padding: 14px 18px 12px; font-size: 10.5px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #64748b; border-bottom: 1px solid #cbd5e1; background: #f8fafc; }
        @media (max-width: 640px) { .lp-opp-head { grid-template-columns: 1fr 90px; } .lp-opp-hide { display: none; } }
        .lp-opp-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(180px, 1.3fr) 110px; align-items: center; gap: 12px; padding: 14px 18px; border-bottom: 1px solid #e2e8f0; transition: background .15s; }
        .lp-opp-row:hover { background: #f8fafc; }
        .lp-opp-row.crown { background: #eff6ff; }
        .lp-opp-row.crown:hover { background: #dbeafe; }
        @media (max-width: 640px) { .lp-opp-row { grid-template-columns: 1fr 90px; } }
        .lp-opp-nom { font-size: 15px; font-weight: 700; color: #0f172a; }
        .lp-opp-nom.crown-nom { color: #1d4ed8; }
        .lp-opp-note { font-size: 11px; color: #94a3b8; margin-top: 2px; }
        .lp-opp-val { font-size: 12px; color: #475569; line-height: 1.35; }
        .lp-opp-total { font-size: 16px; font-weight: 800; color: #2563eb; text-align: right; font-family: 'Playfair Display', Georgia, serif; }
        .lp-opp-footnote { font-size: 12px; color: #475569; margin-top: 20px; line-height: 1.6; border-top: 1px solid #e2e8f0; padding-top: 18px; }
        .lp-disclaimer { font-size: 12px; color: #64748b; margin-top: 24px; line-height: 1.6; padding: 14px 18px; border: 1px solid #e2e8f0; border-radius: 8px; background: #fff; }

        /* TEMOIGNAGES */
        .lp-temoignages { display: flex; flex-direction: column; gap: 14px; }
        .lp-temoignage { background: #fff; border-radius: 12px; padding: 28px 26px; border: 1.5px solid #e2e8f0; cursor: pointer; transition: box-shadow .2s, border-color .2s; }
        .lp-temoignage.active { border-color: #2563eb; box-shadow: 0 4px 20px rgba(37,99,235,0.12); }
        .lp-temoignage:hover { border-color: #93c5fd; }
        .lp-temoignage-quote { font-size: 15px; line-height: 1.7; color: #334155; margin-bottom: 18px; }
        .lp-temoignage-footer { display: flex; align-items: center; gap: 12px; }
        .lp-temoignage-avatar { width: 38px; height: 38px; border-radius: 50%; border: 2px solid #bfdbfe; display: flex; align-items: center; justify-content: center; background: #eff6ff; font-size: 14px; font-weight: 800; color: #2563eb; flex-shrink: 0; }
        .lp-temoignage-nom { font-size: 14px; font-weight: 700; color: #0A1628; }
        .lp-temoignage-role { font-size: 11px; color: #94a3b8; }

        /* ETAPES */
        .lp-steps { display: grid; grid-template-columns: repeat(4,1fr); border-top: 1px solid #e2e8f0; }
        @media (max-width: 980px) { .lp-steps { grid-template-columns: repeat(2,1fr); } }
        @media (max-width: 560px) { .lp-steps { grid-template-columns: 1fr; } }
        .lp-step { padding: 30px 26px 34px 0; border-bottom: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; }
        .lp-step:last-child { border-right: none; }
        @media (max-width: 980px) and (min-width: 561px) { .lp-step:nth-child(2n) { border-right: none; } }
        @media (max-width: 560px) { .lp-step { border-right: none !important; padding-left: 0 !important; padding-right: 0 !important; } .lp-step:last-child { border-bottom: none; } }
        .lp-step-n { font-family: 'Playfair Display', Georgia, serif; font-size: 14px; font-weight: 700; color: #2563eb; width: 34px; height: 34px; border: 1.5px solid #bfdbfe; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 18px; background: #eff6ff; }
        .lp-step-titre { font-size: 15px; font-weight: 700; color: #0f172a; margin: 0 0 8px; }
        .lp-step-desc { font-size: 13px; line-height: 1.65; color: #475569; }

        /* PORTAILS */
        .lp-portals-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        @media (max-width: 640px) { .lp-portals-grid { grid-template-columns: 1fr; } }
        .lp-portal-card { border-radius: 12px; padding: 36px 32px; cursor: pointer; text-align: left; border: none; display: flex; flex-direction: column; gap: 10px; transition: box-shadow .2s, transform .2s; }
        .lp-portal-card:hover { transform: translateY(-2px); }
        .lp-portal-card:focus-visible { outline: 2px solid #2563eb; outline-offset: 3px; }
        .lp-portal-card.agent { background: #fff; border: 1.5px solid #e2e8f0; box-shadow: 0 4px 20px rgba(15,23,42,0.06); }
        .lp-portal-card.agent:hover { border-color: #93c5fd; box-shadow: 0 12px 40px rgba(37,99,235,0.12); }
        .lp-portal-card.client { background: #f8fafc; border: 1.5px solid #e2e8f0; box-shadow: 0 4px 20px rgba(15,23,42,0.04); }
        .lp-portal-card.client:hover { border-color: #cbd5e1; box-shadow: 0 12px 40px rgba(15,23,42,0.10); }
        .lp-portal-label { font-size: 10px; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; }
        .agent .lp-portal-label { color: #2563eb; }
        .client .lp-portal-label { color: #64748b; }
        .lp-portal-title { font-family: 'Playfair Display', Georgia, serif; font-size: 26px; font-weight: 700; line-height: 1.05; }
        .agent .lp-portal-title { color: #0A1628; }
        .client .lp-portal-title { color: #0A1628; }
        .lp-portal-desc { font-size: 13px; line-height: 1.6; }
        .agent .lp-portal-desc { color: #475569; }
        .client .lp-portal-desc { color: #475569; }
        .lp-portal-cta { font-size: 13px; font-weight: 700; margin-top: 12px; display: inline-flex; align-items: center; gap: 6px; }
        .agent .lp-portal-cta { color: #2563eb; }
        .client .lp-portal-cta { color: #0f172a; }

        /* CONTACT */
        .lp-contact-grid { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1.2fr); gap: clamp(40px,6vw,80px); align-items: flex-start; }
        @media (max-width: 860px) { .lp-contact-grid { grid-template-columns: 1fr; } }
        .lp-wa-btn { display: inline-flex; align-items: center; gap: 12px; background: #25D366; color: #fff; font-size: 15px; font-weight: 700; border: none; border-radius: 10px; padding: 16px 28px; cursor: pointer; min-height: 52px; text-decoration: none; transition: background .18s, box-shadow .18s; margin-top: 28px; }
        .lp-wa-btn:hover { background: #1da855; box-shadow: 0 6px 20px rgba(37,211,102,0.35); }
        .lp-contact-info { display: flex; flex-direction: column; gap: 20px; margin-top: 28px; }
        .lp-contact-info-item { display: flex; gap: 12px; align-items: flex-start; }
        .lp-contact-info-icon { width: 36px; height: 36px; border-radius: 8px; background: #eff6ff; color: #2563eb; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 16px; }
        .lp-contact-info-title { font-size: 13px; font-weight: 700; color: #0A1628; margin: 0 0 2px; }
        .lp-contact-info-val { font-size: 13px; color: #64748b; }

        .lp-contact-form { display: flex; flex-direction: column; }
        .lp-form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        @media (max-width: 480px) { .lp-form-row { grid-template-columns: 1fr; } }
        .lp-field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
        .lp-field label { font-size: 12px; font-weight: 700; color: #334155; letter-spacing: 0.02em; }
        .lp-field input, .lp-field select, .lp-field textarea { font-family: inherit; font-size: 14px; color: #0f172a; border: 1.5px solid #cbd5e1; border-radius: 8px; padding: 11px 13px; background: #fff; min-height: 44px; transition: border-color .15s, box-shadow .15s; width: 100%; }
        .lp-field textarea { resize: vertical; min-height: 80px; }
        .lp-field input:focus, .lp-field select:focus, .lp-field textarea:focus { outline: none; border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,0.12); }
        .lp-field input::placeholder, .lp-field textarea::placeholder { color: #94a3b8; }
        .lp-form-submit { width: 100%; font-size: 15px; font-weight: 700; color: #fff; background: #2563eb; border: none; border-radius: 9px; padding: 15px; cursor: pointer; min-height: 50px; margin-top: 4px; display: flex; align-items: center; justify-content: center; gap: 10px; transition: background .18s; }
        .lp-form-submit:hover { background: #1d4ed8; }
        .lp-form-submit:disabled { opacity: 0.65; cursor: wait; }
        .lp-spinner { width: 16px; height: 16px; border-radius: 50%; border: 2.5px solid rgba(255,255,255,0.35); border-top-color: #fff; animation: lp-spin 0.7s linear infinite; }
        @keyframes lp-spin { to { transform: rotate(360deg); } }
        .lp-form-note { font-size: 12px; color: #94a3b8; text-align: center; margin: 12px 0 0; }
        .lp-form-error { font-size: 13px; font-weight: 600; color: #b91c1c; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 11px 14px; margin: 0 0 14px; }
        .lp-form-success { text-align: center; padding: 34px 10px; }
        .lp-success-icon { width: 62px; height: 62px; border-radius: 50%; margin: 0 auto 20px; background: #dcfce7; color: #15803d; display: flex; align-items: center; justify-content: center; }
        .lp-success-title { font-size: 20px; font-weight: 800; color: #0A1628; margin: 0 0 10px; }
        .lp-success-desc { font-size: 14px; line-height: 1.7; color: #475569; margin: 0; }

        /* PHOTO PLACEHOLDERS */
        .lp-photo {
          position: relative; overflow: hidden; border-radius: 12px;
          background: #e8edf5;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 10px;
        }
        .lp-photo img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center 28%; display: block; border-radius: 12px; }
        .lp-about-photo > img, .lp-about-photo > .lp-photo-hint { display: none; }
        .lp-photo-hint {
          display: none !important; flex-direction: column; align-items: center; gap: 8px;
          pointer-events: none; user-select: none; text-align: center; padding: 20px;
          position: relative; z-index: 1;
        }
        .lp-photo-hint-icon {
          width: 48px; height: 48px; border-radius: 50%;
          background: rgba(10,22,40,0.07); border: 1.5px dashed #94a3b8;
          display: flex; align-items: center; justify-content: center;
          color: #94a3b8; font-size: 20px;
        }
        .lp-photo-hint-label {
          font-size: 11px; font-weight: 600; letter-spacing: 0.12em;
          text-transform: uppercase; color: #94a3b8;
        }
        .lp-photo-hint-sub { font-size: 11px; color: #cbd5e1; }

        /* A PROPOS layout with photo */
        .lp-about-wrap { display: grid; grid-template-columns: 1fr minmax(0, 420px); gap: clamp(32px,5vw,72px); align-items: flex-start; }
        @media (max-width: 960px) { .lp-about-wrap { grid-template-columns: 1fr; } }
        .lp-about-photo { height: 560px; }
        @media (max-width: 960px) { .lp-about-photo { height: 340px; } }

        /* PHOTO STRIP (full-width) */
        .lp-photo-strip {
          display: grid; grid-template-columns: 1.4fr 1fr 1fr; gap: 3px;
          height: 440px; margin: 0;
        }
        @media (max-width: 760px) { .lp-photo-strip { grid-template-columns: 1fr 1fr; height: 320px; } }
        @media (max-width: 480px) { .lp-photo-strip { grid-template-columns: 1fr; height: auto; gap: 3px; } }
        .lp-photo-strip .lp-photo { border-radius: 0; }
        @media (max-width: 760px) { .lp-photo-strip .lp-photo:last-child { display: none; } }

        /* TEMOIGNAGES layout with photo */
        .lp-temo-wrap { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,380px); gap: clamp(32px,5vw,64px); align-items: flex-start; }
        @media (max-width: 900px) { .lp-temo-wrap { grid-template-columns: 1fr; } }
        .lp-temo-photo { height: 520px; }
        @media (max-width: 900px) { .lp-temo-photo { height: 320px; } }

        /* FOOTER */

        .lp-footer { background: #ffffff; padding: 40px 6vw 28px; border-top: 1px solid #e2e8f0; }
        @media (max-width: 640px) { .lp-footer { padding: 32px 20px 24px; } }
        .lp-footer-grid { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 40px; margin-bottom: 36px; }
        @media (max-width: 760px) { .lp-footer-grid { grid-template-columns: 1fr 1fr; } }
        @media (max-width: 480px) { .lp-footer-grid { grid-template-columns: 1fr; } }
        .lp-footer-brand { display: flex; align-items: center; gap: 9px; margin-bottom: 14px; }
        .lp-footer-brand img { height: 36px; width: 36px; object-fit: contain; opacity: 0.9; }
        .lp-footer-brand-name { font-family: 'Playfair Display', Georgia, serif; font-size: 15px; font-weight: 700; color: #0A1628; }
        .lp-footer-brand-name span { color: #2563eb; font-style: italic; }
        .lp-footer-desc { font-size: 13px; color: #64748b; line-height: 1.6; max-width: 300px; }
        .lp-footer-col-title { font-size: 11px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: #334155; margin-bottom: 14px; }
        .lp-footer-links { display: flex; flex-direction: column; gap: 10px; }
        .lp-footer-link { font-size: 13px; color: #64748b; text-decoration: none; background: none; border: none; cursor: pointer; text-align: left; padding: 0; transition: color .15s; }
        .lp-footer-link:hover { color: #0A1628; }
        .lp-footer-legal { border-top: 1px solid #e2e8f0; padding-top: 24px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
        .lp-footer-rccm { font-size: 11px; color: #475569; line-height: 1.7; }
        .lp-footer-copy { font-size: 11px; color: #475569; }

        /* ANIMATIONS HERO */
        @keyframes lp-up { from { opacity:0; transform:translateY(18px); } to { opacity:1; transform:translateY(0); } }
        .lp-a0 { animation: lp-up .6s cubic-bezier(0.25,1,0.5,1) 0ms   both; }
        .lp-a1 { animation: lp-up .6s cubic-bezier(0.25,1,0.5,1) 100ms  both; }
        .lp-a2 { animation: lp-up .6s cubic-bezier(0.25,1,0.5,1) 190ms  both; }
        .lp-a3 { animation: lp-up .6s cubic-bezier(0.25,1,0.5,1) 280ms  both; }
        .lp-a4 { animation: lp-up .6s cubic-bezier(0.25,1,0.5,1) 390ms  both; }

        @media (prefers-reduced-motion: reduce) {
          .lp-a0,.lp-a1,.lp-a2,.lp-a3,.lp-a4 { animation: none; }
          .lp-eyebrow-dot,.lp-badge-dot { animation: none; }
        }

        /* PALETTE EBN : blanc, noir et or — aucun bleu */
        .lp-hero { background: #fff; }
        .lp-hero::before { border-color: rgba(161,126,54,.2); }
        .lp-hero::after { background: rgba(161,126,54,.08); }
        .lp-h1 { color: #111827; }
        .lp-h1 em, .lp-eyebrow { color: #a17e36; }
        .lp-eyebrow-dot, .lp-hero-proof span::before { background: #a17e36; box-shadow: 0 0 0 5px rgba(161,126,54,.12); }
        .lp-hero-sub { color: #475569; }
        .lp-btn-primary, .lp-form-submit { background: #111827; }
        .lp-btn-primary:hover, .lp-form-submit:hover { background: #374151; box-shadow: 0 8px 24px rgba(17,24,39,.18); }
        .lp-btn-primary:focus-visible, .lp-nav-btn:focus-visible, .lp-field input:focus, .lp-field select:focus, .lp-field textarea:focus { outline-color: #a17e36; border-color: #a17e36; box-shadow: 0 0 0 3px rgba(161,126,54,.12); }
        .lp-btn-secondary { color: #111827; border-color: #d1d5db; background: #fff; }
        .lp-btn-secondary:hover { background: #f9fafb; border-color: #a17e36; }
        .lp-hero-proof { color: #64748b; }
        .lp-hero-proof strong { color: #111827; }
        .lp-hero-img-wrap { background: transparent; border: 0; box-shadow: none; border-radius: 0; }
        .lp-hero-placeholder { background: linear-gradient(135deg, #111827 0%, #374151 55%, #6b7280 100%); }
        .lp-hero-overlay-title em { color: #f5d98b; }
        .lp-stats { background: #fff; border-color: #e5e7eb; }
        .lp-stat { border-color: #e5e7eb; }
        .lp-stat-v { color: #a17e36; }
        .lp-stat-l { color: #111827; }
        .lp-nav-name span, .lp-footer-brand-name span { color: #a17e36; }
        .lp-nav-btn { background: #111827; }
        .lp-nav-btn:hover { background: #374151; }
        .lp-nav-btn:focus-visible { outline-color: #a17e36; }
        .lp-sec-title em, .lp-opp-total, .lp-portal-label, .lp-prod-badge, .lp-step-n { color: #a17e36; }
        .lp-prod-badge, .lp-step-n { background: #faf7ef; border-color: #dfcfaa; }
        .lp-opp-row.crown { background: #faf7ef; }
        .lp-opp-row.crown:hover { background: #f5eddb; }
        .lp-portal-card.agent:hover { border-color: #dfcfaa; box-shadow: 0 12px 40px rgba(161,126,54,.12); }
        .lp-portal-card:focus-visible { outline-color: #a17e36; }
        .lp-contact-info-icon { background: #faf7ef; color: #a17e36; }
        .lp-temoignage.active { border-color: #a17e36; box-shadow: 0 4px 20px rgba(161,126,54,.12); }
        .lp-temoignage:hover { border-color: #dfcfaa; }
        .lp-temoignage-avatar { border-color: #dfcfaa; background: #faf7ef; color: #a17e36; }
        .lp-img-badge { color: #111827; }
      `}} />

      <div className="lp">

        {/* WHATSAPP FLOAT */}
        <a href={WHATSAPP_LINK} target="_blank" rel="noopener noreferrer" className="lp-wa-float" aria-label="Contacter EBN sur WhatsApp">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
        </a>

        {/* NAV */}
        <nav className="lp-nav">
          <a href="/" className="lp-nav-brand" aria-label="Entreprise Benie Network - Accueil">
            <img src="/assets/Progress business logo.png" alt="EBN" />
            <span className="lp-nav-name">EBN <span>Network</span></span>
          </a>
          <div className="lp-nav-links">
            <button className="lp-nav-link" onClick={() => scrollTo('a-propos')}>A propos</button>
            <button className="lp-nav-link" onClick={() => scrollTo('produits')}>Produits</button>
            <button className="lp-nav-link" onClick={() => scrollTo('opportunite')}>Opportunite</button>
            <button className="lp-nav-link" onClick={() => scrollTo('contact')}>Contact</button>
            <div style={{ width: 1, height: 20, background: '#cbd5e1', margin: '0 4px' }} aria-hidden />
            <button className="lp-nav-link" onClick={() => navigate('/login')}>Staff</button>
            <button className="lp-nav-btn dark" onClick={() => navigate('/portal/login')}>Connexion Membre</button>
          </div>
        </nav>

        {/* HERO */}
        <section className="lp-hero" aria-labelledby="lp-hero-title">
          <div className="lp-hero-inner">
            <p className="lp-eyebrow lp-a0">
              <span className="lp-eyebrow-dot" aria-hidden />
              Entreprise Benie Network · Goma, RDC
            </p>
            <h1 id="lp-hero-title" className="lp-h1 lp-a1">
              Batissez votre<br />
              avenir avec<br />
              <em>EBN.</em>
            </h1>
            <p className="lp-hero-sub lp-a2">
              Rejoignez un reseau de partenaires engages a Goma et dans la region des
              Grands Lacs, autour de produits qui changent des vies. Transparent, legal,
              ancre dans la realite congolaise.
            </p>
            <div className="lp-actions lp-a3">
              <button className="lp-btn-primary" onClick={() => scrollTo('contact')} id="hero-cta-contact">
                Nous contacter
              </button>
              <button className="lp-btn-secondary" onClick={() => scrollTo('produits')} id="hero-cta-produits">
                Decouvrir nos produits
              </button>
            </div>
            <div className="lp-hero-proof lp-a3" aria-label="Engagements EBN">
              <span><strong>RDC</strong> · ancrage local</span>
              <span><strong>8</strong> niveaux transparents</span>
              <span><strong>4</strong> filleuls par étape</span>
            </div>
          </div>
          <div className="lp-hero-img-wrap lp-a4">
            <LottieAsset file="hero%20sect.json" label="Animation présentant une femme dans l'univers EBN Network" />
            <img
              src="https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1600&q=85"
              alt="Professionnelle noire représentant la communauté EBN Network"
              className="lp-hero-img"
              onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
            <div className="lp-hero-placeholder" aria-hidden>
              <div className="lp-hero-text-overlay">
                <div className="lp-hero-overlay-title">Votre reseau,<br />votre <em>avenir.</em></div>
                <div className="lp-hero-overlay-sub">Goma · Bukavu · Kinshasa</div>
              </div>
            </div>
            <div className="lp-hero-caption">
              <span className="lp-hero-caption-kicker">Une communauté qui avance</span>
              <span>Goma · Bukavu · Kinshasa</span>
            </div>
          </div>
        </section>

        {/* STATS */}
        <div className="lp-stats" role="region" aria-label="Chiffres cles EBN">
          {STATS.map(({ v, l, sub }) => (
            <div key={l} className="lp-stat">
              <div className="lp-stat-v">{v}</div>
              <div className="lp-stat-l">{l}</div>
              <div className="lp-stat-sub">{sub}</div>
            </div>
          ))}
        </div>

        {/* A PROPOS */}
        <section className="lp-sec lp-sec-white" id="a-propos" aria-labelledby="lp-about-title">
          <Reveal>
            <p className="lp-sec-eyebrow">A propos d'EBN</p>
            <h2 id="lp-about-title" className="lp-sec-title">
              Mission, vision &<br /><em>valeurs fondatrices.</em>
            </h2>
            <p className="lp-sec-sub">
              Entreprise Benie Network sarl est une societe de marketing relationnel enregistree
              legalement a Goma, RDC. Notre mission : creer de la valeur reelle en combinant
              vente de produits et services avec un programme de developpement de reseau transparent.
            </p>
          </Reveal>
          <div className="lp-about-wrap">
            <Reveal delay={80}>
              <div className="lp-about-grid">
                {VALEURS.map(({ icon, titre, desc }) => (
                  <div key={titre} className="lp-about-cell">
                    <span className="lp-about-icon" role="img" aria-label={titre}>{icon}</span>
                    <div className="lp-about-titre">{titre}</div>
                    <div className="lp-about-desc">{desc}</div>
                  </div>
                ))}
              </div>
            </Reveal>
            {/* ── PHOTO PLACEHOLDER : Equipe / bureau EBN ── */}
            <Reveal delay={140}>
              <div className="lp-photo lp-about-photo" aria-hidden>
                <LottieAsset file="about.json" label="Animation présentant une femme et les valeurs d'EBN Network" />
                <img src="https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=1100&q=85" alt="Équipe noire réunie autour d’un projet" loading="lazy" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                <div className="lp-photo-hint">
                  <div className="lp-photo-hint-icon">&#x1F4F7;</div>
                  <div className="lp-photo-hint-label">Photo — equipe EBN</div>
                  <div className="lp-photo-hint-sub">Recommande : portrait d'equipe ou bureau Goma<br />Format : 3:4 ou 4:5 · Min 800×1000 px</div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* PRODUITS */}
        <section className="lp-sec" id="produits" aria-labelledby="lp-prod-title">
          <Reveal>
            <p className="lp-sec-eyebrow">L'expérience EBN</p>
            <h2 id="lp-prod-title" className="lp-sec-title">
              Construisez votre avenir<br />avec un <em>réseau solide.</em>
            </h2>
            <p className="lp-sec-sub">
              Chez EBN, le marketing relationnel commence par une valeur réelle : des produits utiles,
              une communauté engagée et un accompagnement qui vous aide à grandir durablement.
            </p>
          </Reveal>
          <Reveal delay={80}>
            <div className="lp-prod-grid">
              {PRODUITS.map(({ num, nom, desc, badge }) => (
                <div key={nom} className="lp-prod-cell">
                  <div className="lp-prod-num">{num}</div>
                  <div className="lp-prod-badge">{badge}</div>
                  <div className="lp-prod-nom">{nom}</div>
                  <div className="lp-prod-desc">{desc}</div>
                </div>
              ))}
            </div>
          </Reveal>
        </section>

        {/* ── PHOTO STRIP — entre Produits et Opportunite ── */}
        <div className="lp-photo-strip" aria-hidden role="presentation">
          <div className="lp-photo">
            <img src="https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=1400&q=85" alt="Entrepreneur noir en réunion" loading="lazy" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
            <div className="lp-photo-hint">
              <div className="lp-photo-hint-icon">&#x1F4F7;</div>
              <div className="lp-photo-hint-label">Photo principale</div>
              <div className="lp-photo-hint-sub">Boutique, produit ou ambassadeur<br />Format paysage · Min 1200×800 px</div>
            </div>
          </div>
          <div className="lp-photo">
            <img src="https://images.unsplash.com/photo-1531123897727-8f129e1688ce?auto=format&fit=crop&w=1100&q=85" alt="Partenaire noire lors d’une rencontre" loading="lazy" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
            <div className="lp-photo-hint">
              <div className="lp-photo-hint-icon">&#x1F4F7;</div>
              <div className="lp-photo-hint-label">Photo ambiance</div>
              <div className="lp-photo-hint-sub">Portrait client ou partenaire<br />Format portrait · Min 800×1000 px</div>
            </div>
          </div>
          <div className="lp-photo">
            <img src="https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=1100&q=85" alt="Espace de travail professionnel" loading="lazy" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
            <div className="lp-photo-hint">
              <div className="lp-photo-hint-icon">&#x1F4F7;</div>
              <div className="lp-photo-hint-label">Photo contexte</div>
              <div className="lp-photo-hint-sub">Goma, ville, marche<br />Format portrait · Min 800×1000 px</div>
            </div>
          </div>
        </div>

        {/* OPPORTUNITE */}
        <section className="lp-sec lp-sec-white" id="opportunite" aria-labelledby="lp-opp-title">
          <Reveal>
            <p className="lp-sec-eyebrow">L'opportunite d'affaires</p>
            <h2 id="lp-opp-title" className="lp-sec-title">
              8 niveaux de carriere,<br /><em>un parcours clair.</em>
            </h2>
            <p className="lp-sec-sub">
              Chaque niveau demande 4 filleuls actifs. Matrice complete = commission versee + promotion.
              Les montants sont configures dans le systeme - rien n'est negocie a part, rien n'est cache.
            </p>
          </Reveal>
          <Reveal delay={80}>
            <div className="lp-opp-ladder" role="table" aria-label="Bareme des 8 niveaux de carriere EBN">
              <div className="lp-opp-head" role="row" aria-hidden>
                <span>Niveau</span>
                <span className="lp-opp-hide">Bonus d'incitation</span>
                <span style={{ textAlign: 'right' }}>Gains USD</span>
              </div>
              {OPPORTUNITE.map(({ niveau, filleuls, commission, bonus }) => (
                <div key={niveau} className={`lp-opp-row${niveau === 'Crown Ambassadeur' ? ' crown' : ''}`} role="row">
                  <div>
                    <div className={`lp-opp-nom${niveau === 'Crown Ambassadeur' ? ' crown-nom' : ''}`}>
                      {niveau}
                      {niveau === 'Crown Ambassadeur' && (
<span style={{ display: 'inline-block', fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#a17e36', background: '#faf7ef', borderRadius: 999, padding: '2px 8px', marginLeft: 10 }}>Rang ultime</span>
                      )}
                    </div>
                    <div className="lp-opp-note">{filleuls} filleuls par matrice</div>
                  </div>
                  <span className="lp-opp-val lp-opp-hide">{bonus}</span>
                  <span className="lp-opp-total">{commission}</span>
                </div>
              ))}
            </div>
            <p className="lp-opp-footnote">
              Les 8 étapes représentent un total calculé de <strong>73 354 USD</strong>.
              Chaque étape nécessite 4 filleuls directs ; les bonus d'incitation sont ceux indiqués ci-dessus.
            </p>
            <p className="lp-disclaimer">
              <strong>Mention legale :</strong> Les revenus presentes correspondent aux montants maximaux par niveau.
              Les resultats reels varient selon l'engagement et le developpement du reseau de chaque participant.
              Aucune garantie de revenu n'est faite. L'activite commerciale reelle (vente de produits et services)
              est le fondement de la legitimite de ce programme. EBN opere dans le cadre legal de la RDC.
            </p>
          </Reveal>
        </section>

        {/* TEMOIGNAGES */}
        <section className="lp-sec lp-sec-white" id="temoignages" aria-labelledby="lp-temo-title">
          <Reveal>
            <p className="lp-sec-eyebrow">Temoignages</p>
            <h2 id="lp-temo-title" className="lp-sec-title">
              Ils ont rejoint<br /><em>le reseau EBN.</em>
            </h2>
          </Reveal>
          <div className="lp-temo-wrap">
            <Reveal delay={80}>
              <div className="lp-temoignages" role="list">
                {TEMOIGNAGES.map((t, i) => (
                  <div
                    key={i}
                    className={`lp-temoignage${activeTestimonial === i ? ' active' : ''}`}
                    role="listitem"
                    onClick={() => setActiveTestimonial(i)}
                    tabIndex={0}
                    onKeyDown={e => e.key === 'Enter' && setActiveTestimonial(i)}
                    aria-label={`Temoignage de ${t.nom}`}
                  >
                    <p className="lp-temoignage-quote">{t.texte}</p>
                    <div className="lp-temoignage-footer">
                      <div className="lp-temoignage-avatar" aria-hidden>{t.nom.charAt(0)}</div>
                      <div>
                        <div className="lp-temoignage-nom">{t.nom} · {t.ville}</div>
                        <div className="lp-temoignage-role">{t.role}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Reveal>
            {/* ── PHOTO PLACEHOLDER : Ambassadeur / partenaire ── */}
            <Reveal delay={140}>
              <div className="lp-photo lp-temo-photo" aria-hidden>
                <img className="lp-temo-image" src="/assets/testimoniql.jpg" alt="" loading="lazy" />
                <img src="https://images.unsplash.com/photo-1504593811423-6dd665756598?auto=format&fit=crop&w=1000&q=85" alt="Portrait d’un partenaire noir EBN" loading="lazy" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                <div className="lp-photo-hint">
                  <div className="lp-photo-hint-icon">&#x1F4F7;</div>
                  <div className="lp-photo-hint-label">Photo ambassadeur</div>
                  <div className="lp-photo-hint-sub">Portrait d'un partenaire EBN<br />Format : 4:5 · Min 800×1000 px</div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* COMMENT REJOINDRE */}
        <section className="lp-sec" id="comment-rejoindre" aria-labelledby="lp-steps-title">
          <Reveal>
            <p className="lp-sec-eyebrow">Comment rejoindre</p>
            <h2 id="lp-steps-title" className="lp-sec-title">
              De visiteur a partenaire,<br /><em>en 4 etapes.</em>
            </h2>
            <p className="lp-sec-sub">
              Pas de jargon, pas d'engagement flou. Voici exactement comment integrer le reseau EBN.
            </p>
          </Reveal>
          <Reveal delay={80}>
            <div className="lp-steps">
              {ETAPES.map(et => (
                <article key={et.n} className="lp-step">
                  <div className="lp-step-n" aria-hidden>{et.n}</div>
                  <h3 className="lp-step-titre">{et.titre}</h3>
                  <p className="lp-step-desc">{et.desc}</p>
                </article>
              ))}
            </div>
          </Reveal>
        </section>

        {/* PORTAILS */}
        <section className="lp-sec lp-sec-white" id="acces" aria-labelledby="lp-portals-title">
          <Reveal>
            <p className="lp-sec-eyebrow">Acces</p>
            <h2 id="lp-portals-title" className="lp-sec-title" style={{ marginBottom: 36 }}>
              Choisissez<br /><em>votre espace.</em>
            </h2>
            <div className="lp-portals-grid">
              <button
                className="lp-portal-card agent"
                onClick={() => navigate('/login')}
                id="portal-employe"
                aria-label="Acceder a l'espace employe"
              >
                <span className="lp-portal-label">Personnel EBN</span>
                <span className="lp-portal-title">Espace Employe</span>
                <span className="lp-portal-desc">
                  Gerants · Agents · Superviseurs<br />
                  POS · Stocks · Clients · Rapports
                </span>
                <span className="lp-portal-cta">Se connecter &rarr;</span>
              </button>
              <button
                className="lp-portal-card client"
                onClick={() => navigate('/portal/login')}
                id="portal-client"
                aria-label="Acceder au portail client"
              >
                <span className="lp-portal-label">Clients EBN</span>
                <span className="lp-portal-title">Portail Client</span>
                <span className="lp-portal-desc">
                  Achats · Points fidelite · Filleuls<br />
                  Programme Bronze &rarr; Platine
                </span>
                <span className="lp-portal-cta">Acceder &rarr;</span>
              </button>
            </div>
          </Reveal>
        </section>

        {/* CONTACT */}
        <section className="lp-sec" id="contact" aria-labelledby="lp-contact-title">
          <Reveal>
            <p className="lp-sec-eyebrow">Contact</p>
            <h2 id="lp-contact-title" className="lp-sec-title">
              Nous contacter<br /><em>facilement.</em>
            </h2>
          </Reveal>
          <div className="lp-contact-grid">
            <Reveal delay={60}>
              <div>
                <p className="lp-sec-sub" style={{ marginBottom: 0 }}>
                  La facon la plus rapide de nous joindre est WhatsApp - notre canal principal
                  a Goma et dans toute la region des Grands Lacs.
                </p>
                <a href={WHATSAPP_LINK} target="_blank" rel="noopener noreferrer" className="lp-wa-btn" id="contact-whatsapp" aria-label="Contacter EBN sur WhatsApp">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                  Ecrire sur WhatsApp
                </a>
                <div className="lp-contact-info">
                  <div className="lp-contact-info-item">
                    <div className="lp-contact-info-icon">&#x1F4CD;</div>
                    <div>
                      <div className="lp-contact-info-title">Siege social</div>
                      <div className="lp-contact-info-val">Goma, Nord-Kivu, RDC</div>
                    </div>
                  </div>
                  <div className="lp-contact-info-item">
                    <div className="lp-contact-info-icon">&#x1F4F1;</div>
                    <div>
                      <div className="lp-contact-info-title">WhatsApp Business</div>
                      <div className="lp-contact-info-val">{WHATSAPP_NUMBER}</div>
                    </div>
                  </div>
                  <div className="lp-contact-info-item">
                    <div className="lp-contact-info-icon">&#x1F3E2;</div>
                    <div>
                      <div className="lp-contact-info-title">Boutiques</div>
                      <div className="lp-contact-info-val">Goma · Bukavu · Kinshasa</div>
                    </div>
                  </div>
                </div>
              </div>
            </Reveal>
            <Reveal delay={120}>
              <ContactForm />
            </Reveal>
          </div>

        </section>

        {/* FOOTER */}
        <footer className="lp-footer">
          <div className="lp-footer-grid">
            <div>
              <div className="lp-footer-brand">
                <img src="/assets/Progress business logo.png" alt="" aria-hidden />
                <span className="lp-footer-brand-name">EBN <span>Network</span></span>
              </div>
              <p className="lp-footer-desc">
                Entreprise Benie Network sarl - Reseau de marketing relationnel base a Goma, RDC.
                Vente de produits et services reels, plan de remuneration transparent.
              </p>
            </div>
            <div>
              <div className="lp-footer-col-title">Navigation</div>
              <div className="lp-footer-links">
                <button className="lp-footer-link" onClick={() => scrollTo('a-propos')}>A propos</button>
                <button className="lp-footer-link" onClick={() => scrollTo('produits')}>Produits</button>
                <button className="lp-footer-link" onClick={() => scrollTo('opportunite')}>Opportunite</button>
                <button className="lp-footer-link" onClick={() => scrollTo('temoignages')}>Temoignages</button>
                <button className="lp-footer-link" onClick={() => scrollTo('contact')}>Contact</button>
              </div>
            </div>
            <div>
              <div className="lp-footer-col-title">Portails</div>
              <div className="lp-footer-links">
                <button className="lp-footer-link" onClick={() => navigate('/portal/login')}>Portail Client</button>
                <button className="lp-footer-link" onClick={() => navigate('/login')}>Espace Employe</button>
              </div>
            </div>
          </div>
          <div className="lp-footer-legal">
            <div className="lp-footer-rccm">
              Entreprise Benie Network sarl · RCCM : [N° RCCM Goma] · Siege : Goma, Nord-Kivu, RDC<br />
              Les resultats varient selon l'engagement. Aucune garantie de revenu n'est faite.
            </div>
            <span className="lp-footer-copy">EBN Network RDC © {new Date().getFullYear()}</span>
          </div>
        </footer>

      </div>
    </>
  );
}
