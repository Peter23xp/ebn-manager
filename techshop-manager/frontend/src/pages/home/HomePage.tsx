import { useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
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
  { num: '01', nom: 'Caisse POS', desc: 'Gestion des ventes en moins de 90 secondes, meme hors-ligne. Recus, historique, multi-operateurs.', badge: 'Commerce' },
  { num: '02', nom: 'Gestion Clients', desc: "Onboarding 4 etapes, profil complet, historique d'achats et suivi fidelite Bronze vers Platine.", badge: 'CRM' },
  { num: '03', nom: 'Stocks Multi-sites', desc: 'Inventaire en temps reel sur plusieurs boutiques, alertes de seuil, transferts inter-sites.', badge: 'Logistique' },
  { num: '04', nom: 'Programme Ambassadeur', desc: '8 niveaux de carriere, commissions en USD, salaire mensuel et bonus retraite 50 000 $.', badge: 'MLM' },
  { num: '05', nom: 'Fidelite & Points', desc: 'Programme Bronze vers Platine avec remises automatiques, points cumulables et recompenses.', badge: 'Fidelite' },
  { num: '06', nom: 'Rapports & Tableaux', desc: 'Export Excel/PDF, tableaux de bord par ville, rapports quotidiens et mensuels.', badge: 'Analytics' },
];

const OPPORTUNITE = [
  { niveau: 'Pierre',  filleuls: 4, commission: '40 $',    salaire: null },
  { niveau: 'Argent',  filleuls: 4, commission: '60 $',    salaire: null },
  { niveau: 'Bronze',  filleuls: 4, commission: '100 $',   salaire: null },
  { niveau: 'Fer',     filleuls: 4, commission: '200 $',   salaire: null },
  { niveau: 'Or',      filleuls: 4, commission: '400 $',   salaire: '100 $/mois' },
  { niveau: 'Diamant', filleuls: 4, commission: '1 000 $', salaire: '250 $/mois' },
  { niveau: 'Platine', filleuls: 4, commission: '2 000 $', salaire: '500 $/mois' },
  { niveau: 'Crown',   filleuls: 4, commission: '5 000 $', salaire: '1 000 $/mois' },
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

const WHATSAPP_LINK = 'https://wa.me/243000000000?text=Bonjour%20EBN%20!%20Je%20souhaite%20en%20savoir%20plus%20sur%20votre%20programme.';
const WHATSAPP_NUMBER = '+243 000 000 000';

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
        .lp-nav-name span { color: #b45309; font-style: italic; }
        .lp-nav-links { display: flex; align-items: center; gap: 18px; }
        @media (max-width: 820px) { .lp-nav-links { display: none; } }
        .lp-nav-link { font-size: 13px; font-weight: 600; color: #334155; text-decoration: none; background: none; border: none; cursor: pointer; padding: 0; }
        .lp-nav-link:hover { color: #0A1628; }
        .lp-nav-btn { font-size: 13px; font-weight: 700; color: #fff; background: #b45309; border: none; border-radius: 7px; padding: 0 18px; height: 36px; cursor: pointer; transition: background .18s; }
        .lp-nav-btn:hover { background: #92400e; }
        .lp-nav-btn.dark { background: #0A1628; }
        .lp-nav-btn.dark:hover { background: #1a3260; }
        .lp-nav-btn:focus-visible { outline: 2px solid #b45309; outline-offset: 3px; }

        /* HERO */
        .lp-hero { min-height: 100vh; padding-top: 60px; display: flex; flex-direction: column; background: #ffffff; }
        .lp-hero-inner { padding: 80px 6vw 72px; max-width: 960px; }
        @media (max-width: 640px) { .lp-hero-inner { padding: 60px 20px 56px; } }

        .lp-eyebrow { display: inline-flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 600; letter-spacing: 0.18em; text-transform: uppercase; color: #64748b; margin-bottom: 28px; }
        .lp-eyebrow-dot { width: 6px; height: 6px; border-radius: 50%; background: #b45309; flex-shrink: 0; animation: lp-pulse 2s ease-in-out infinite; }
        @keyframes lp-pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }

        .lp-h1 { font-family: 'Playfair Display', Georgia, serif; font-size: clamp(44px, 7.5vw, 84px); font-weight: 900; line-height: 0.97; letter-spacing: -0.03em; color: #0A1628; margin: 0 0 32px; }
        .lp-h1 em { font-style: italic; color: #b45309; }

        .lp-hero-sub { font-size: clamp(15px, 1.6vw, 18px); font-weight: 400; line-height: 1.65; color: #64748b; max-width: 560px; margin: 0 0 48px; }

        .lp-actions { display: flex; gap: 12px; flex-wrap: wrap; }
        .lp-btn-primary { font-size: 14px; font-weight: 700; background: #b45309; color: #fff; border: none; border-radius: 8px; padding: 14px 30px; cursor: pointer; min-height: 48px; transition: background .18s, box-shadow .18s; }
        .lp-btn-primary:hover { background: #92400e; box-shadow: 0 8px 24px rgba(180,83,9,0.25); }
        .lp-btn-primary:focus-visible { outline: 2px solid #b45309; outline-offset: 3px; }
        .lp-btn-secondary { font-size: 14px; font-weight: 600; background: #f8fafc; color: #0A1628; border: 1.5px solid #e2e8f0; border-radius: 8px; padding: 14px 30px; cursor: pointer; min-height: 48px; transition: background .18s, border-color .18s; }
        .lp-btn-secondary:hover { background: #f1f5f9; border-color: #cbd5e1; }
        .lp-btn-secondary:focus-visible { outline: 2px solid #0A1628; outline-offset: 3px; }

        .lp-hero-img-wrap { margin: 0 6vw 0; height: 380px; border-radius: 12px; overflow: hidden; background: #0A1628; border: 1px solid #e2e8f0; position: relative; display: flex; align-items: center; justify-content: center; }
        @media (max-width: 640px) { .lp-hero-img-wrap { height: 220px; margin: 0 20px; } }
        .lp-hero-img { width: 100%; height: 100%; object-fit: cover; object-position: center; display: block; }
        .lp-hero-placeholder { position: absolute; inset: 0; background: linear-gradient(135deg, #0A1628 0%, #1a3260 50%, #451a03 100%); }
        .lp-hero-placeholder::after { content: ''; position: absolute; inset: 0; background-image: repeating-linear-gradient(0deg, transparent, transparent 47px, rgba(255,255,255,0.025) 47px, rgba(255,255,255,0.025) 48px), repeating-linear-gradient(90deg, transparent, transparent 47px, rgba(255,255,255,0.025) 47px, rgba(255,255,255,0.025) 48px); }
        .lp-hero-text-overlay { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; z-index: 2; }
        .lp-hero-overlay-title { font-family: 'Playfair Display', Georgia, serif; font-size: clamp(28px, 4vw, 52px); font-weight: 900; color: rgba(255,255,255,0.9); text-align: center; letter-spacing: -0.02em; text-shadow: 0 2px 20px rgba(0,0,0,0.4); }
        .lp-hero-overlay-title em { font-style: italic; color: #fcd34d; }
        .lp-hero-overlay-sub { font-size: 14px; color: rgba(255,255,255,0.5); letter-spacing: 0.15em; text-transform: uppercase; }
        .lp-img-badge { position: absolute; bottom: 18px; right: 18px; z-index: 3; display: flex; align-items: center; gap: 7px; padding: 8px 14px; background: rgba(10,22,40,0.72); border: 1px solid rgba(255,255,255,0.14); backdrop-filter: blur(8px); border-radius: 20px; font-size: 11px; color: rgba(255,255,255,0.75); font-weight: 600; letter-spacing: 0.07em; }
        .lp-badge-dot { width: 6px; height: 6px; border-radius: 50%; background: #22c55e; flex-shrink: 0; animation: lp-pulse 2s ease-in-out infinite; }

        /* STATS */
        .lp-stats { background: #0A1628; padding: 44px 6vw; display: grid; grid-template-columns: repeat(4,1fr); }
        @media (max-width: 600px) { .lp-stats { grid-template-columns: repeat(2,1fr); gap: 32px 0; } }
        .lp-stat { padding-right: 28px; border-right: 1px solid rgba(255,255,255,0.08); }
        .lp-stat:last-child { border-right: none; }
        @media (max-width: 600px) { .lp-stat:nth-child(2) { border-right: none; } .lp-stat:nth-child(3) { border-right: 1px solid rgba(255,255,255,0.08); } }
        .lp-stat-v { font-family: 'Playfair Display', Georgia, serif; font-size: clamp(36px, 4vw, 48px); font-weight: 900; color: #fbbf24; line-height: 1; margin-bottom: 4px; }
        .lp-stat-l { font-size: 11px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #e2e8f0; margin-bottom: 2px; }
        .lp-stat-sub { font-size: 11px; color: #64748b; }

        /* SECTIONS */
        .lp-sec { padding: 88px 6vw; background: #f1f5f9; }
        @media (max-width: 640px) { .lp-sec { padding: 64px 20px; } }
        .lp-sec-white { background: #ffffff; }
        .lp-sec-dark { background: #0A1628; }

        .lp-sec-eyebrow { font-size: 10px; font-weight: 700; letter-spacing: 0.25em; text-transform: uppercase; color: #94a3b8; margin-bottom: 14px; }
        .lp-sec-title { font-family: 'Playfair Display', Georgia, serif; font-size: clamp(26px, 3.5vw, 40px); font-weight: 700; line-height: 1.1; letter-spacing: -0.02em; color: #0A1628; margin: 0 0 16px; max-width: 520px; }
        .lp-sec-title em { font-style: italic; color: #b45309; }
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
        .lp-prod-cell:hover { background: #fffbeb; }
        .lp-prod-num { font-family: 'Playfair Display', Georgia, serif; font-size: 11px; color: #cbd5e1; margin-bottom: 16px; }
        .lp-prod-badge { display: inline-block; font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #b45309; background: #fef3c7; border-radius: 999px; padding: 3px 9px; margin-bottom: 10px; }
        .lp-prod-nom { font-size: 15px; font-weight: 700; color: #0f172a; margin-bottom: 8px; }
        .lp-prod-desc { font-size: 13px; color: #64748b; line-height: 1.6; }

        /* OPPORTUNITE */
        .lp-opp-ladder { display: flex; flex-direction: column; }
        .lp-opp-head { display: grid; grid-template-columns: 1fr 80px 100px; padding: 0 18px 12px; font-size: 10.5px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #64748b; border-bottom: 1px solid #1e3a5f; }
        @media (max-width: 640px) { .lp-opp-head { grid-template-columns: 1fr 80px; } .lp-opp-hide { display: none; } }
        .lp-opp-row { display: grid; grid-template-columns: 1fr 80px 100px; align-items: center; gap: 12px; padding: 14px 18px; border-bottom: 1px solid rgba(255,255,255,0.06); transition: background .15s; }
        .lp-opp-row:hover { background: rgba(255,255,255,0.04); }
        .lp-opp-row.crown { background: rgba(251,191,36,0.08); }
        .lp-opp-row.crown:hover { background: rgba(251,191,36,0.13); }
        @media (max-width: 640px) { .lp-opp-row { grid-template-columns: 1fr 80px; } }
        .lp-opp-nom { font-size: 15px; font-weight: 700; color: #f8fafc; }
        .lp-opp-nom.crown-nom { color: #fbbf24; }
        .lp-opp-note { font-size: 11px; color: #64748b; margin-top: 2px; }
        .lp-opp-val { font-size: 13px; color: #94a3b8; }
        .lp-opp-total { font-size: 16px; font-weight: 800; color: #fbbf24; text-align: right; font-family: 'Playfair Display', Georgia, serif; }
        .lp-opp-footnote { font-size: 12px; color: #64748b; margin-top: 20px; line-height: 1.6; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 18px; }
        .lp-disclaimer { font-size: 12px; color: #94a3b8; margin-top: 24px; line-height: 1.6; padding: 14px 18px; border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; background: rgba(255,255,255,0.03); }

        /* TEMOIGNAGES */
        .lp-temoignages { display: flex; flex-direction: column; gap: 14px; }
        .lp-temoignage { background: #fff; border-radius: 12px; padding: 28px 26px; border: 1.5px solid #e2e8f0; cursor: pointer; transition: box-shadow .2s, border-color .2s; }
        .lp-temoignage.active { border-color: #b45309; box-shadow: 0 4px 20px rgba(180,83,9,0.12); }
        .lp-temoignage:hover { border-color: #fde68a; }
        .lp-temoignage-quote { font-size: 15px; line-height: 1.7; color: #334155; margin-bottom: 18px; }
        .lp-temoignage-footer { display: flex; align-items: center; gap: 12px; }
        .lp-temoignage-avatar { width: 38px; height: 38px; border-radius: 50%; border: 2px solid #fcd34d; display: flex; align-items: center; justify-content: center; background: #0A1628; font-size: 14px; font-weight: 800; color: #fbbf24; flex-shrink: 0; }
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
        .lp-step-n { font-family: 'Playfair Display', Georgia, serif; font-size: 14px; font-weight: 700; color: #b45309; width: 34px; height: 34px; border: 1.5px solid #fde68a; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 18px; background: #fffbeb; }
        .lp-step-titre { font-size: 15px; font-weight: 700; color: #0f172a; margin: 0 0 8px; }
        .lp-step-desc { font-size: 13px; line-height: 1.65; color: #475569; }

        /* PORTAILS */
        .lp-portals-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        @media (max-width: 640px) { .lp-portals-grid { grid-template-columns: 1fr; } }
        .lp-portal-card { border-radius: 12px; padding: 36px 32px; cursor: pointer; text-align: left; border: none; display: flex; flex-direction: column; gap: 10px; transition: box-shadow .2s, transform .2s; }
        .lp-portal-card:hover { transform: translateY(-2px); }
        .lp-portal-card:focus-visible { outline: 2px solid #2563eb; outline-offset: 3px; }
        .lp-portal-card.agent { background: #0A1628; box-shadow: 0 4px 20px rgba(10,22,40,0.18); }
        .lp-portal-card.agent:hover { box-shadow: 0 12px 40px rgba(10,22,40,0.28); }
        .lp-portal-card.client { background: #fffbeb; border: 1.5px solid #fde68a; box-shadow: 0 4px 20px rgba(180,83,9,0.08); }
        .lp-portal-card.client:hover { box-shadow: 0 12px 40px rgba(180,83,9,0.15); }
        .lp-portal-label { font-size: 10px; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; }
        .agent .lp-portal-label { color: #94a8c7; }
        .client .lp-portal-label { color: #b45309; }
        .lp-portal-title { font-family: 'Playfair Display', Georgia, serif; font-size: 26px; font-weight: 700; line-height: 1.05; }
        .agent .lp-portal-title { color: #ffffff; }
        .client .lp-portal-title { color: #0A1628; }
        .lp-portal-desc { font-size: 13px; line-height: 1.6; }
        .agent .lp-portal-desc { color: #94a8c7; }
        .client .lp-portal-desc { color: #92400e; }
        .lp-portal-cta { font-size: 13px; font-weight: 700; margin-top: 12px; display: inline-flex; align-items: center; gap: 6px; }
        .agent .lp-portal-cta { color: #93c5fd; }
        .client .lp-portal-cta { color: #b45309; }

        /* CONTACT */
        .lp-contact-grid { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1.2fr); gap: clamp(40px,6vw,80px); align-items: flex-start; }
        @media (max-width: 860px) { .lp-contact-grid { grid-template-columns: 1fr; } }
        .lp-wa-btn { display: inline-flex; align-items: center; gap: 12px; background: #25D366; color: #fff; font-size: 15px; font-weight: 700; border: none; border-radius: 10px; padding: 16px 28px; cursor: pointer; min-height: 52px; text-decoration: none; transition: background .18s, box-shadow .18s; margin-top: 28px; }
        .lp-wa-btn:hover { background: #1da855; box-shadow: 0 6px 20px rgba(37,211,102,0.35); }
        .lp-contact-info { display: flex; flex-direction: column; gap: 20px; margin-top: 28px; }
        .lp-contact-info-item { display: flex; gap: 12px; align-items: flex-start; }
        .lp-contact-info-icon { width: 36px; height: 36px; border-radius: 8px; background: #fffbeb; color: #b45309; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 16px; }
        .lp-contact-info-title { font-size: 13px; font-weight: 700; color: #0A1628; margin: 0 0 2px; }
        .lp-contact-info-val { font-size: 13px; color: #64748b; }

        .lp-contact-form { display: flex; flex-direction: column; }
        .lp-form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        @media (max-width: 480px) { .lp-form-row { grid-template-columns: 1fr; } }
        .lp-field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
        .lp-field label { font-size: 12px; font-weight: 700; color: #334155; letter-spacing: 0.02em; }
        .lp-field input, .lp-field select, .lp-field textarea { font-family: inherit; font-size: 14px; color: #0f172a; border: 1.5px solid #cbd5e1; border-radius: 8px; padding: 11px 13px; background: #fff; min-height: 44px; transition: border-color .15s, box-shadow .15s; width: 100%; }
        .lp-field textarea { resize: vertical; min-height: 80px; }
        .lp-field input:focus, .lp-field select:focus, .lp-field textarea:focus { outline: none; border-color: #b45309; box-shadow: 0 0 0 3px rgba(180,83,9,0.12); }
        .lp-field input::placeholder, .lp-field textarea::placeholder { color: #94a3b8; }
        .lp-form-submit { width: 100%; font-size: 15px; font-weight: 700; color: #fff; background: #0A1628; border: none; border-radius: 9px; padding: 15px; cursor: pointer; min-height: 50px; margin-top: 4px; display: flex; align-items: center; justify-content: center; gap: 10px; transition: background .18s; }
        .lp-form-submit:hover { background: #1a3260; }
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
        .lp-photo img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center; display: block; border-radius: 12px; }
        .lp-photo-hint {
          display: flex; flex-direction: column; align-items: center; gap: 8px;
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
        .lp-about-photo { height: 480px; }
        @media (max-width: 960px) { .lp-about-photo { height: 260px; } }

        /* PHOTO STRIP (full-width) */
        .lp-photo-strip {
          display: grid; grid-template-columns: 1.4fr 1fr 1fr; gap: 3px;
          height: 340px; margin: 0;
        }
        @media (max-width: 760px) { .lp-photo-strip { grid-template-columns: 1fr 1fr; height: 260px; } }
        @media (max-width: 480px) { .lp-photo-strip { grid-template-columns: 1fr; height: auto; gap: 3px; } }
        .lp-photo-strip .lp-photo { border-radius: 0; }
        @media (max-width: 760px) { .lp-photo-strip .lp-photo:last-child { display: none; } }

        /* TEMOIGNAGES layout with photo */
        .lp-temo-wrap { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,380px); gap: clamp(32px,5vw,64px); align-items: flex-start; }
        @media (max-width: 900px) { .lp-temo-wrap { grid-template-columns: 1fr; } }
        .lp-temo-photo { height: 420px; }
        @media (max-width: 900px) { .lp-temo-photo { height: 220px; } }

        /* BOUTIQUES photo grid */
        .lp-boutiques-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 12px; margin-top: 40px; }
        @media (max-width: 640px) { .lp-boutiques-grid { grid-template-columns: 1fr; } }
        .lp-boutique-photo { height: 200px; position: relative; }
        .lp-boutique-label {
          position: absolute; bottom: 14px; left: 14px; z-index: 2;
          font-size: 12px; font-weight: 700; color: #fff;
          background: rgba(10,22,40,0.7); backdrop-filter: blur(4px);
          padding: 4px 11px; border-radius: 999px; letter-spacing: 0.05em;
        }

        /* FOOTER */

        .lp-footer { background: #060d1a; padding: 40px 6vw 28px; border-top: 1px solid rgba(255,255,255,0.05); }
        @media (max-width: 640px) { .lp-footer { padding: 32px 20px 24px; } }
        .lp-footer-grid { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 40px; margin-bottom: 36px; }
        @media (max-width: 760px) { .lp-footer-grid { grid-template-columns: 1fr 1fr; } }
        @media (max-width: 480px) { .lp-footer-grid { grid-template-columns: 1fr; } }
        .lp-footer-brand { display: flex; align-items: center; gap: 9px; margin-bottom: 14px; }
        .lp-footer-brand img { height: 36px; width: 36px; object-fit: contain; opacity: 0.9; }
        .lp-footer-brand-name { font-family: 'Playfair Display', Georgia, serif; font-size: 15px; font-weight: 700; color: #e2e8f0; }
        .lp-footer-brand-name span { color: #fbbf24; font-style: italic; }
        .lp-footer-desc { font-size: 13px; color: #64748b; line-height: 1.6; max-width: 300px; }
        .lp-footer-col-title { font-size: 11px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: #e2e8f0; margin-bottom: 14px; }
        .lp-footer-links { display: flex; flex-direction: column; gap: 10px; }
        .lp-footer-link { font-size: 13px; color: #64748b; text-decoration: none; background: none; border: none; cursor: pointer; text-align: left; padding: 0; transition: color .15s; }
        .lp-footer-link:hover { color: #e2e8f0; }
        .lp-footer-legal { border-top: 1px solid rgba(255,255,255,0.06); padding-top: 24px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
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
            <button className="lp-nav-btn" onClick={() => navigate('/ambassadeur')}>Devenir Partenaire</button>
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
              <button className="lp-btn-primary" onClick={() => navigate('/ambassadeur')} id="hero-cta-partenaire">
                Devenir Partenaire
              </button>
              <button className="lp-btn-secondary" onClick={() => scrollTo('produits')} id="hero-cta-produits">
                Decouvrir nos produits
              </button>
            </div>
          </div>
          <div className="lp-hero-img-wrap lp-a4">
            <img
              src="/assets/hero-banner.jpg"
              alt="Equipe EBN Network a Goma, RDC - marketing relationnel"
              className="lp-hero-img"
              onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
            <div className="lp-hero-placeholder" aria-hidden>
              <div className="lp-hero-text-overlay">
                <div className="lp-hero-overlay-title">Votre reseau,<br />votre <em>avenir.</em></div>
                <div className="lp-hero-overlay-sub">Goma · Bukavu · Kinshasa</div>
              </div>
            </div>
            <div className="lp-img-badge">
              <span className="lp-badge-dot" aria-hidden />
              Goma, Nord-Kivu · RDC
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
                <img src="/assets/about-team.jpg" alt="" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
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
            <p className="lp-sec-eyebrow">Nos produits & services</p>
            <h2 id="lp-prod-title" className="lp-sec-title">
              Des solutions concretes<br />pour votre <em>commerce.</em>
            </h2>
            <p className="lp-sec-sub">
              EBN propose des produits et services reels - c'est la fondation de notre modele.
              Le reseau amplifie, mais la valeur creee est tangible et mesurable.
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
            <img src="/assets/strip-1.jpg" alt="" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
            <div className="lp-photo-hint">
              <div className="lp-photo-hint-icon">&#x1F4F7;</div>
              <div className="lp-photo-hint-label">Photo principale</div>
              <div className="lp-photo-hint-sub">Boutique, produit ou ambassadeur<br />Format paysage · Min 1200×800 px</div>
            </div>
          </div>
          <div className="lp-photo">
            <img src="/assets/strip-2.jpg" alt="" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
            <div className="lp-photo-hint">
              <div className="lp-photo-hint-icon">&#x1F4F7;</div>
              <div className="lp-photo-hint-label">Photo ambiance</div>
              <div className="lp-photo-hint-sub">Portrait client ou partenaire<br />Format portrait · Min 800×1000 px</div>
            </div>
          </div>
          <div className="lp-photo">
            <img src="/assets/strip-3.jpg" alt="" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
            <div className="lp-photo-hint">
              <div className="lp-photo-hint-icon">&#x1F4F7;</div>
              <div className="lp-photo-hint-label">Photo contexte</div>
              <div className="lp-photo-hint-sub">Goma, ville, marche<br />Format portrait · Min 800×1000 px</div>
            </div>
          </div>
        </div>

        {/* OPPORTUNITE */}
        <section className="lp-sec lp-sec-dark" id="opportunite" aria-labelledby="lp-opp-title">
          <Reveal>
            <p className="lp-sec-eyebrow" style={{ color: '#475569' }}>L'opportunite d'affaires</p>
            <h2 id="lp-opp-title" className="lp-sec-title" style={{ color: '#f8fafc' }}>
              8 niveaux de carriere,<br /><em>un parcours clair.</em>
            </h2>
            <p className="lp-sec-sub" style={{ color: '#94a3b8' }}>
              Chaque niveau demande 4 filleuls actifs. Matrice complete = commission versee + promotion.
              Les montants sont configures dans le systeme - rien n'est negocie a part, rien n'est cache.
            </p>
          </Reveal>
          <Reveal delay={80}>
            <div className="lp-opp-ladder" role="table" aria-label="Bareme des 8 niveaux de carriere EBN">
              <div className="lp-opp-head" role="row" aria-hidden>
                <span>Niveau</span>
                <span className="lp-opp-hide">Salaire mensuel</span>
                <span style={{ textAlign: 'right' }}>Commission totale</span>
              </div>
              {OPPORTUNITE.map(({ niveau, filleuls, commission, salaire }) => (
                <div key={niveau} className={`lp-opp-row${niveau === 'Crown' ? ' crown' : ''}`} role="row">
                  <div>
                    <div className={`lp-opp-nom${niveau === 'Crown' ? ' crown-nom' : ''}`}>
                      {niveau}
                      {niveau === 'Crown' && (
                        <span style={{ display: 'inline-block', fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#92400e', background: '#fef3c7', borderRadius: 999, padding: '2px 8px', marginLeft: 10 }}>Rang ultime</span>
                      )}
                    </div>
                    <div className="lp-opp-note">{filleuls} filleuls par matrice</div>
                  </div>
                  <span className="lp-opp-val lp-opp-hide">{salaire ?? '\u2014'}</span>
                  <span className="lp-opp-total">{commission}</span>
                </div>
              ))}
            </div>
            <p className="lp-opp-footnote">
              Les salaires mensuels demarrent a partir du niveau Or (100 $/mois) et montent jusqu'a 1 000 $/mois au rang Crown.
              Le bonus retraite de 50 000 $ est verse quand un de vos filleuls directs atteint le rang Crown Ambassadeur.
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
                <img src="/assets/ambassadeur.jpg" alt="" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
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

          {/* ── PHOTO GRID : Nos boutiques ── */}
          <Reveal delay={160}>
            <div className="lp-boutiques-grid" aria-hidden role="presentation">
              {[
                { ville: 'Goma', src: '/assets/boutique-goma.jpg' },
                { ville: 'Bukavu', src: '/assets/boutique-bukavu.jpg' },
                { ville: 'Kinshasa', src: '/assets/boutique-kinshasa.jpg' },
              ].map(({ ville, src }) => (
                <div key={ville} className="lp-photo lp-boutique-photo">
                  <img src={src} alt="" onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                  <div className="lp-photo-hint" style={{ gap: 6 }}>
                    <div className="lp-photo-hint-icon" style={{ width: 36, height: 36, fontSize: 16 }}>&#x1F4F7;</div>
                    <div className="lp-photo-hint-label">Boutique {ville}</div>
                    <div className="lp-photo-hint-sub">Min 800×600 px</div>
                  </div>
                  <div className="lp-boutique-label">{ville}</div>
                </div>
              ))}
            </div>
          </Reveal>
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
                <button className="lp-footer-link" onClick={() => navigate('/ambassadeur')}>Devenir Partenaire</button>
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
