import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { PageSEO } from '@/components/seo/PageSEO';
import { api, getErrorMessage } from '@/lib/api';

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

function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
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
          el.style.transform = 'none';
          obs.disconnect();
        }
      },
      { threshold: 0.12 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return ref;
}

function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const ref = useReveal<HTMLDivElement>();
  return (
    <div
      ref={ref}
      style={{
        opacity: 0,
        transform: 'translateY(20px)',
        transition: `opacity 0.55s cubic-bezier(0.25,1,0.5,1) ${delay}ms, transform 0.55s cubic-bezier(0.25,1,0.5,1) ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

// ── Données du programme (source : MLM_LEVELS_REF / config backend) ──────────

const NIVEAUX = [
  { ordre: 1, nom: 'Pierre',            filleuls: 4, parFilleul: 10,   totale: 40,    salaire: null,  note: 'Accès au système' },
  { ordre: 2, nom: 'Argent',            filleuls: 4, parFilleul: 15,   totale: 60,    salaire: null,  note: 'Bonus niveau 2' },
  { ordre: 3, nom: 'Bronze',            filleuls: 4, parFilleul: 25,   totale: 100,   salaire: null,  note: 'Bonus niveau 3' },
  { ordre: 4, nom: 'Fer',               filleuls: 4, parFilleul: 50,   totale: 200,   salaire: null,  note: 'Bonus niveau 4' },
  { ordre: 5, nom: 'Or',                filleuls: 4, parFilleul: 100,  totale: 400,   salaire: 100,   note: 'Salaire mensuel activé' },
  { ordre: 6, nom: 'Diamant',           filleuls: 4, parFilleul: 250,  totale: 1000,  salaire: 250,   note: 'Salaire mensuel majoré' },
  { ordre: 7, nom: 'Platine',           filleuls: 4, parFilleul: 500,  totale: 2000,  salaire: 500,   note: 'Salaire mensuel premium' },
  { ordre: 8, nom: 'Crown Ambassadeur', filleuls: 4, parFilleul: 1250, totale: 5000,  salaire: 1000,  note: 'Bonus retraite 50 000 $' },
];

const ETAPES = [
  {
    n: '1',
    titre: 'Pose ta candidature',
    desc: 'Remplis le formulaire en bas de page. Un conseiller TechShop te rappelle sous 24h pour vérifier ton profil et répondre à tes questions.',
  },
  {
    n: '2',
    titre: 'Inscris-toi en boutique',
    desc: 'Passage en boutique TechShop (Goma, Bukavu ou Kinshasa) : récit, formation et fiche — les 4 étapes d\u2019activation de ton compte membre.',
  },
  {
    n: '3',
    titre: 'Parraine 4 personnes',
    desc: 'Chaque personne que tu amènes et qui active son compte occupe une position dans ta matrice du niveau courant.',
  },
  {
    n: '4',
    titre: 'Gagne et monte',
    desc: 'Matrice complète = commission versée sur ton portefeuille USD + promotion au niveau suivant. Les paliers Or et au-delà ajoutent un salaire mensuel.',
  },
];

const FAQ = [
  {
    q: 'Combien dois-je payer pour devenir Ambassadeur ?',
    a: 'L\u2019inscription passe par l\u2019onboarding officiel en boutique TechShop (récit, formation, fiche, activation). Les frais exacts te sont communiqués par le conseiller lors de ton rappel — ils dépendent du site où tu t\u2019inscris.',
  },
  {
    q: 'Quand est-ce que je reçois mes commissions ?',
    a: 'Chaque commission générée est d\u2019abord vérifiée par l\u2019équipe TechShop (validation manuelle), puis créditée sur ton portefeuille USD consultable à tout moment. Ce contrôle protège le réseau contre les comptes fictifs.',
  },
  {
    q: 'Que se passe-t-il quand ma matrice de 4 est complète ?',
    a: 'Ta matrice du niveau courant est marquée complète : tu touches la commission totale du niveau et tu es promu au niveau supérieur, avec sa nouvelle matrice et ses montants plus élevés.',
  },
  {
    q: 'Les salaires mensuels, comment ça marche ?',
    a: 'À partir du niveau Or (niveau 5), un salaire mensuel s\u2019ajoute aux commissions : 100 $/mois à Or, 250 $ à Diamant, 500 $ à Platine et 1 000 $/mois au rang Crown Ambassadeur.',
  },
  {
    q: 'C\u2019est quoi le bonus retraite de 50 000 $ ?',
    a: 'Quand une personne de tes filleuls directs atteint le rang Crown Ambassadeur, tu reçois un bonus exceptionnel de 50 000 $. Le réseau te récompense d\u2019avoir formé un leader.',
  },
  {
    q: 'Faut-il acheter des produits pour gagner ?',
    a: 'Tes commissions viennent du développement de ton réseau (parrainages activés), pas d\u2019un stock à acheter. Aucune commande de produits n\u2019est exigée pour monter de niveau.',
  },
];

const VILLES = ['Goma', 'Bukavu', 'Kinshasa', 'Autre ville'];

const fmtUSD = (n: number) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

// ── Formulaire de candidature ────────────────────────────────────────────────

type FormState = 'idle' | 'sending' | 'success' | 'error';

function CandidatureForm() {
  const [form, setForm] = useState({
    prenom: '', nom: '', telephone: '', email: '',
    ville: '', codeParrain: '', motivation: '',
  });
  const [state, setState] = useState<FormState>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.prenom.trim() || !form.nom.trim() || !form.telephone.trim() || !form.ville) {
      setState('error');
      setErrorMsg('Merci de remplir les champs obligatoires (prénom, nom, téléphone, ville).');
      return;
    }
    setState('sending');
    setErrorMsg('');
    try {
      await api.post('/public/ambassadeur-application', {
        prenom: form.prenom.trim(),
        nom: form.nom.trim(),
        telephone: form.telephone.trim(),
        email: form.email.trim() || undefined,
        ville: form.ville,
        codeParrain: form.codeParrain.trim() || undefined,
        motivation: form.motivation.trim() || undefined,
      });
      setState('success');
    } catch (err) {
      setState('error');
      setErrorMsg(getErrorMessage(err));
    }
  };

  if (state === 'success') {
    return (
      <div className="am-form-success" role="status">
        <div className="am-success-icon" aria-hidden>
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </div>
        <h3 className="am-success-title">Candidature reçue</h3>
        <p className="am-success-desc">
          Merci {form.prenom}. Un conseiller TechShop te contactera sous 24h au numéro{' '}
          <strong>{form.telephone}</strong> pour finaliser ton inscription.
        </p>
      </div>
    );
  }

  return (
    <form className="am-form" onSubmit={submit} noValidate>
      <div className="am-form-row">
        <div className="am-field">
          <label htmlFor="am-prenom">Prénom *</label>
          <input id="am-prenom" type="text" value={form.prenom} onChange={set('prenom')} autoComplete="given-name" placeholder="Jean" />
        </div>
        <div className="am-field">
          <label htmlFor="am-nom">Nom *</label>
          <input id="am-nom" type="text" value={form.nom} onChange={set('nom')} autoComplete="family-name" placeholder="Kabila" />
        </div>
      </div>

      <div className="am-form-row">
        <div className="am-field">
          <label htmlFor="am-tel">Téléphone *</label>
          <input id="am-tel" type="tel" value={form.telephone} onChange={set('telephone')} autoComplete="tel" placeholder="+243 9XX XXX XXX" />
        </div>
        <div className="am-field">
          <label htmlFor="am-ville">Ville *</label>
          <select id="am-ville" value={form.ville} onChange={set('ville')}>
            <option value="">Choisis ta ville</option>
            {VILLES.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
      </div>

      <div className="am-form-row">
        <div className="am-field">
          <label htmlFor="am-email">Email (optionnel)</label>
          <input id="am-email" type="email" value={form.email} onChange={set('email')} autoComplete="email" placeholder="toi@exemple.com" />
        </div>
        <div className="am-field">
          <label htmlFor="am-parrain">Code parrain (si tu en as un)</label>
          <input id="am-parrain" type="text" value={form.codeParrain} onChange={set('codeParrain')} placeholder="TSG-0000" />
        </div>
      </div>

      <div className="am-field">
        <label htmlFor="am-motivation">Ton message (optionnel)</label>
        <textarea
          id="am-motivation"
          rows={3}
          value={form.motivation}
          onChange={set('motivation')}
          placeholder="Dis-nous en une phrase pourquoi tu veux rejoindre le réseau."
        />
      </div>

      {state === 'error' && (
        <p className="am-form-error" role="alert">{errorMsg}</p>
      )}

      <button type="submit" className="am-submit" disabled={state === 'sending'}>
        {state === 'sending' ? (
          <>
            <span className="am-spinner" aria-hidden /> Envoi en cours…
          </>
        ) : (
          'Poser ma candidature'
        )}
      </button>
      <p className="am-form-note">Réponse sous 24h ouvrées. Tes données ne servent qu’à traiter ta candidature.</p>
    </form>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AmbassadeurPage() {
  const navigate = useNavigate();
  usePageScroll();
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const scrollToForm = () => {
    document.getElementById('candidature')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <>
      <PageSEO
        title="TechShop Ambassadeur — Programme de marketing relationnel"
        description="Rejoins le réseau TechShop Ambassadeur : 8 niveaux de carrière, commissions en USD dès ton premier filleul, salaires mensuels dès le niveau Or et bonus retraite de 50 000 $. Goma, Bukavu, Kinshasa."
        canonical="/ambassadeur"
        ogType="website"
      />
      <Helmet>
        <script type="application/ld+json">{JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          'mainEntity': FAQ.map((f) => ({
            '@type': 'Question',
            'name': f.q,
            'acceptedAnswer': { '@type': 'Answer', 'text': f.a },
          })),
        })}</script>
      </Helmet>

      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700&display=swap');

        .am { background: #ffffff; color: #0f172a; font-family: "Plus Jakarta Sans", system-ui, sans-serif; }
        .am * { box-sizing: border-box; }

        /* ── NAV ── */
        .am-nav {
          position: fixed; top: 0; left: 0; right: 0; z-index: 50;
          height: 60px;
          display: flex; align-items: center; justify-content: space-between;
          padding: 0 6vw;
          background: rgba(255,255,255,0.94);
          backdrop-filter: blur(14px);
          border-bottom: 1px solid #e2e8f0;
        }
        .am-nav-brand { display: flex; align-items: center; gap: 10px; text-decoration: none; }
        .am-nav-brand img { height: 42px; width: 42px; object-fit: contain; }
        .am-nav-name {
          font-family: 'Playfair Display', Georgia, serif;
          font-size: 16px; font-weight: 700; color: #0A1628; letter-spacing: -0.01em;
        }
        .am-nav-name span { color: #2563eb; font-style: italic; }
        .am-nav-links { display: flex; align-items: center; gap: 26px; }
        @media (max-width: 760px) { .am-nav-links { display: none; } }
        .am-nav-link {
          font-size: 13px; font-weight: 600; color: #334155;
          text-decoration: none; background: none; border: none; cursor: pointer;
          padding: 0; letter-spacing: 0.01em;
        }
        .am-nav-link:hover { color: #2563eb; }
        .am-nav-cta {
          font-size: 13px; font-weight: 700; color: #fff; background: #0A1628;
          border: none; border-radius: 7px; padding: 0 18px; height: 36px;
          cursor: pointer; transition: background .18s;
        }
        .am-nav-cta:hover { background: #1a3260; }
        .am-nav-cta-main { }
        .am-nav-cta-mobile { display: none; }
        @media (max-width: 760px) {
          .am-nav-cta-main { display: none; }
          .am-nav-cta-mobile { display: inline-flex; }
          .am-nav-links { display: none; }
        }

        /* ── HERO ── */
        .am-hero {
          min-height: 92vh; padding-top: 60px;
          display: grid; grid-template-columns: minmax(0, 46%) minmax(0, 54%);
          background: #0A1628;
        }
        @media (max-width: 900px) { .am-hero { grid-template-columns: 1fr; min-height: 0; } }

        .am-hero-copy {
          display: flex; flex-direction: column; justify-content: center;
          padding: clamp(48px, 7vh, 96px) clamp(24px, 4vw, 64px);
        }
        .am-kicker {
          display: inline-flex; align-items: center; gap: 9px;
          font-size: 11px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase;
          color: #93c5fd; margin-bottom: 26px;
        }
        .am-kicker::before {
          content: ''; width: 22px; height: 2px; background: #2563eb; flex-shrink: 0;
        }
        .am-h1 {
          font-family: 'Playfair Display', Georgia, serif;
          font-size: clamp(40px, 5.4vw, 72px);
          font-weight: 900; line-height: 1.02; letter-spacing: -0.03em;
          color: #ffffff; margin: 0 0 26px;
          text-wrap: balance;
        }
        .am-h1 em { font-style: italic; color: #60a5fa; }
        .am-hero-sub {
          font-size: clamp(15px, 1.5vw, 17px); line-height: 1.7;
          color: #b6c2d9; max-width: 480px; margin: 0 0 38px;
        }
        .am-hero-actions { display: flex; gap: 12px; flex-wrap: wrap; }
        .am-btn-primary {
          font-size: 14px; font-weight: 700; color: #fff;
          background: #2563eb; border: none; border-radius: 8px;
          padding: 15px 30px; cursor: pointer; min-height: 48px;
          letter-spacing: 0.01em; transition: background .18s, transform .18s;
        }
        .am-btn-primary:hover { background: #1d4fd7; }
        .am-btn-primary:active { transform: translateY(1px); }
        .am-btn-primary:focus-visible { outline: 2px solid #93c5fd; outline-offset: 3px; }
        .am-btn-primary:disabled { opacity: 0.6; cursor: wait; }
        .am-btn-ghost {
          font-size: 14px; font-weight: 600; color: #e8edf5;
          background: transparent; border: 1.5px solid rgba(255,255,255,0.25);
          border-radius: 8px; padding: 15px 30px; cursor: pointer; min-height: 48px;
          transition: border-color .18s, background .18s;
        }
        .am-btn-ghost:hover { border-color: rgba(255,255,255,0.5); background: rgba(255,255,255,0.05); }
        .am-btn-ghost:focus-visible { outline: 2px solid #93c5fd; outline-offset: 3px; }

        .am-hero-figure { position: relative; min-height: 420px; overflow: hidden; }
        @media (max-width: 900px) { .am-hero-figure { min-height: 300px; order: -1; } }
        .am-hero-figure img {
          position: absolute; inset: 0; width: 100%; height: 100%;
          object-fit: cover; object-position: center 30%;
        }
        .am-hero-figure::after {
          content: ''; position: absolute; inset: 0;
          background: linear-gradient(90deg, rgba(10,22,40,0.55) 0%, rgba(10,22,40,0) 45%);
        }
        @media (max-width: 900px) {
          .am-hero-figure::after { background: linear-gradient(180deg, rgba(10,22,40,0) 55%, rgba(10,22,40,0.75) 100%); }
        }
        .am-hero-tag {
          position: absolute; bottom: 22px; right: 22px; z-index: 2;
          display: flex; align-items: center; gap: 8px;
          padding: 8px 14px; border-radius: 999px;
          background: rgba(10,22,40,0.72); border: 1px solid rgba(255,255,255,0.14);
          backdrop-filter: blur(8px);
          font-size: 11px; font-weight: 600; color: #dbeafe; letter-spacing: 0.05em;
        }
        .am-hero-tag-dot {
          width: 6px; height: 6px; border-radius: 50%; background: #22c55e;
          animation: am-pulse 2s ease-in-out infinite;
        }
        @keyframes am-pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }

        /* ── BANDE CHIFFRES ── */
        .am-stats {
          background: #0A1628; border-top: 1px solid rgba(255,255,255,0.07);
          padding: 44px 6vw; display: grid; grid-template-columns: repeat(4, 1fr);
          gap: 24px;
        }
        @media (max-width: 700px) { .am-stats { grid-template-columns: repeat(2, 1fr); row-gap: 34px; } }
        .am-stat-v {
          font-family: 'Playfair Display', Georgia, serif;
          font-size: clamp(30px, 3.4vw, 46px); font-weight: 900; color: #fff; line-height: 1;
          margin-bottom: 8px;
        }
        .am-stat-v small { font-size: 0.55em; font-weight: 700; color: #60a5fa; }
        .am-stat-l {
          font-size: 11px; font-weight: 600; letter-spacing: 0.13em; text-transform: uppercase;
          color: #8fa3c2; line-height: 1.5;
        }

        /* ── SECTIONS ── */
        .am-sec { padding: clamp(64px, 9vh, 104px) 6vw; }
        .am-sec-gray { background: #f8fafc; }
        .am-sec-head { max-width: 640px; margin-bottom: clamp(40px, 6vh, 64px); }
        .am-h2 {
          font-family: 'Playfair Display', Georgia, serif;
          font-size: clamp(27px, 3.4vw, 42px); font-weight: 700; line-height: 1.12;
          letter-spacing: -0.02em; color: #0A1628; margin: 0 0 16px;
          text-wrap: balance;
        }
        .am-h2 em { font-style: italic; color: #2563eb; }
        .am-sec-sub { font-size: 15px; line-height: 1.7; color: #475569; margin: 0; }

        /* ── ÉTAPES ── */
        .am-steps {
          display: grid; grid-template-columns: repeat(4, 1fr); gap: 0;
          border-top: 1px solid #e2e8f0;
        }
        @media (max-width: 980px) { .am-steps { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 560px) { .am-steps { grid-template-columns: 1fr; } }
        .am-step {
          padding: 30px 26px 34px 0; border-bottom: 1px solid #e2e8f0;
          position: relative;
        }
        .am-step:nth-child(odd) { border-right: 1px solid #e2e8f0; padding-right: 26px; }
        .am-step:nth-child(even) { padding-left: 26px; }
        @media (min-width: 981px) {
          .am-step:not(:last-child) { border-right: 1px solid #e2e8f0; }
          .am-step:nth-child(even) { padding-left: 26px; }
        }
        @media (max-width: 980px) and (min-width: 561px) {
          .am-step:nth-child(2n) { border-right: none; }
        }
        @media (max-width: 560px) {
          .am-step { border-right: none !important; padding-left: 0 !important; padding-right: 0 !important; }
        }
        .am-step-n {
          font-family: 'Playfair Display', Georgia, serif;
          font-size: 15px; font-weight: 700; color: #2563eb;
          width: 34px; height: 34px; border: 1.5px solid #bfdbfe; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          margin-bottom: 18px; background: #eff6ff;
        }
        .am-step-titre { font-size: 16px; font-weight: 700; color: #0f172a; margin: 0 0 8px; letter-spacing: -0.01em; }
        .am-step-desc { font-size: 13.5px; line-height: 1.65; color: #475569; margin: 0; }

        /* ── PARCOURS (échelle des niveaux) ── */
        .am-ladder { display: flex; flex-direction: column; }
        .am-rung {
          display: grid;
          grid-template-columns: 52px minmax(0, 1.35fr) minmax(0, 1fr) minmax(0, 1fr) auto;
          align-items: center; gap: 18px;
          padding: 15px 18px;
          border-bottom: 1px solid #e2e8f0;
          transition: background .15s;
        }
        .am-rung:hover { background: #f8fafc; }
        .am-rung:first-child { border-top: 1px solid #e2e8f0; }
        @media (max-width: 860px) {
          .am-rung { grid-template-columns: 40px minmax(0,1fr) auto; row-gap: 4px; }
          .am-rung-mid, .am-rung-sal { display: none; }
        }
        .am-rung-head {
          border-bottom: none; padding: 0 18px 12px;
          font-size: 10.5px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase;
          color: #94a3b8;
        }
        .am-rung-head:hover { background: none; }
        @media (max-width: 860px) { .am-rung-head { display: none; } }
        .am-rung-n {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 13px; font-weight: 700; color: #94a3b8;
        }
        .am-rung-nom { font-size: 15px; font-weight: 700; color: #0f172a; letter-spacing: -0.01em; }
        .am-rung-crown .am-rung-nom { color: #92400e; }
        .am-rung-note { font-size: 12px; color: #64748b; margin-top: 2px; }
        .am-rung-mid { font-size: 13px; color: #475569; }
        .am-rung-mid strong { color: #0f172a; font-weight: 700; }
        .am-rung-sal { font-size: 13px; color: #475569; }
        .am-rung-total {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          font-size: 16px; font-weight: 700; color: #0f172a; text-align: right; white-space: nowrap;
        }
        .am-rung-crown { background: linear-gradient(0deg, rgba(217,119,6,0.06), rgba(217,119,6,0.06)); }
        .am-rung-crown:hover { background: rgba(217,119,6,0.1); }
        .am-crown-flag {
          display: inline-block; font-size: 10px; font-weight: 800; letter-spacing: 0.1em;
          text-transform: uppercase; color: #92400e; background: #fef3c7;
          border-radius: 999px; padding: 3px 9px; margin-left: 10px; vertical-align: middle;
        }
        .am-ladder-footnote { font-size: 12.5px; color: #64748b; margin-top: 18px; line-height: 1.6; }

        /* ── MATRICE ── */
        .am-matrix-wrap {
          display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
          gap: clamp(32px, 5vw, 72px); align-items: center;
        }
        @media (max-width: 880px) { .am-matrix-wrap { grid-template-columns: 1fr; } }
        .am-matrix-diagram {
          display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px;
          max-width: 380px; margin: 0 auto; position: relative;
        }
        .am-slot {
          aspect-ratio: 1; border-radius: 14px;
          display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
          border: 1.5px solid #dbeafe; background: #eff6ff;
        }
        .am-slot-full { border-color: #2563eb; background: #2563eb; }
        .am-slot-icon { color: #60a5fa; }
        .am-slot-full .am-slot-icon { color: #bfdbfe; }
        .am-slot-label { font-size: 12px; font-weight: 700; color: #1e40af; }
        .am-slot-full .am-slot-label { color: #fff; }
        .am-slot-sub { font-size: 10.5px; color: #60a5fa; font-family: 'JetBrains Mono', monospace; }
        .am-slot-full .am-slot-sub { color: #bfdbfe; }
        .am-matrix-center {
          position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
          width: 74px; height: 74px; border-radius: 50%;
          background: #0A1628; color: #fff;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          border: 3px solid #fff; box-shadow: 0 4px 18px rgba(10,22,40,0.3);
          z-index: 2;
        }
        .am-matrix-center strong { font-size: 11px; font-weight: 800; letter-spacing: 0.04em; }
        .am-matrix-points { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 20px; }
        .am-matrix-points li { display: flex; gap: 14px; align-items: flex-start; }
        .am-point-bullet {
          flex-shrink: 0; width: 30px; height: 30px; border-radius: 8px;
          background: #eff6ff; color: #2563eb;
          display: flex; align-items: center; justify-content: center;
          font-family: 'JetBrains Mono', monospace; font-size: 12px; font-weight: 700;
        }
        .am-point-titre { font-size: 14.5px; font-weight: 700; color: #0f172a; margin: 0 0 3px; }
        .am-point-desc { font-size: 13.5px; line-height: 1.6; color: #475569; margin: 0; }

        /* ── AU-DELÀ (3 avantages) ── */
        .am-extra-grid {
          display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: 1px; background: #e2e8f0; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;
        }
        .am-extra-cell { background: #fff; padding: 34px 30px; }
        .am-extra-val {
          font-family: 'Playfair Display', Georgia, serif;
          font-size: clamp(30px, 3vw, 40px); font-weight: 900; color: #0A1628; line-height: 1;
          margin-bottom: 12px;
        }
        .am-extra-val small { font-size: 0.5em; color: #d97706; vertical-align: super; }
        .am-extra-titre { font-size: 15px; font-weight: 700; color: #0f172a; margin: 0 0 8px; }
        .am-extra-desc { font-size: 13.5px; line-height: 1.65; color: #475569; margin: 0; }

        /* ── FAQ ── */
        .am-faq { max-width: 780px; }
        .am-faq-item { border-bottom: 1px solid #e2e8f0; }
        .am-faq-item:first-child { border-top: 1px solid #e2e8f0; }
        .am-faq-q {
          width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 18px;
          padding: 21px 4px; background: none; border: none; cursor: pointer; text-align: left;
          font-size: 15.5px; font-weight: 700; color: #0f172a; letter-spacing: -0.01em;
        }
        .am-faq-q:hover { color: #2563eb; }
        .am-faq-q:focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }
        .am-faq-chevron { flex-shrink: 0; color: #94a3b8; transition: transform .25s cubic-bezier(0.25,1,0.5,1); }
        .am-faq-q[aria-expanded="true"] .am-faq-chevron { transform: rotate(180deg); color: #2563eb; }
        .am-faq-a {
          overflow: hidden; max-height: 0;
          transition: max-height .3s cubic-bezier(0.25,1,0.5,1);
        }
        .am-faq-a.open { max-height: 320px; }
        .am-faq-a p { font-size: 14px; line-height: 1.7; color: #475569; margin: 0; padding: 0 4px 22px; max-width: 65ch; }

        /* ── CANDIDATURE ── */
        .am-apply {
          background: #0A1628; color: #fff;
          display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);
          gap: clamp(36px, 5vw, 80px);
        }
        @media (max-width: 880px) { .am-apply { grid-template-columns: 1fr; } }
        .am-apply-copy { display: flex; flex-direction: column; justify-content: center; }
        .am-apply .am-h2 { color: #fff; }
        .am-apply .am-h2 em { color: #60a5fa; }
        .am-apply-points { list-style: none; margin: 26px 0 0; padding: 0; display: flex; flex-direction: column; gap: 13px; }
        .am-apply-points li {
          display: flex; gap: 11px; align-items: baseline;
          font-size: 14px; line-height: 1.6; color: #b6c2d9;
        }
        .am-apply-points li::before {
          content: ''; flex-shrink: 0; width: 7px; height: 7px; border-radius: 50%;
          background: #2563eb; transform: translateY(-1px);
        }
        .am-form-card {
          background: #fff; border-radius: 16px; padding: clamp(26px, 3.4vw, 40px);
          box-shadow: 0 24px 70px rgba(0,0,0,0.35);
        }
        .am-form-title { font-size: 19px; font-weight: 800; color: #0A1628; margin: 0 0 4px; letter-spacing: -0.015em; }
        .am-form-intro { font-size: 13px; color: #64748b; margin: 0 0 24px; }
        .am-form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        @media (max-width: 520px) { .am-form-row { grid-template-columns: 1fr; } }
        .am-field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
        .am-field label { font-size: 12px; font-weight: 700; color: #334155; letter-spacing: 0.02em; }
        .am-field input, .am-field select, .am-field textarea {
          font-family: inherit; font-size: 14px; color: #0f172a;
          border: 1.5px solid #cbd5e1; border-radius: 8px;
          padding: 11px 13px; background: #fff; min-height: 44px;
          transition: border-color .15s, box-shadow .15s;
          width: 100%;
        }
        .am-field textarea { resize: vertical; min-height: 84px; }
        .am-field input:focus, .am-field select:focus, .am-field textarea:focus {
          outline: none; border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,0.15);
        }
        .am-field input::placeholder, .am-field textarea::placeholder { color: #94a3b8; }
        .am-submit {
          width: 100%; font-size: 15px; font-weight: 700; color: #fff;
          background: #0A1628; border: none; border-radius: 9px;
          padding: 15px; cursor: pointer; min-height: 50px; margin-top: 6px;
          display: flex; align-items: center; justify-content: center; gap: 10px;
          transition: background .18s;
        }
        .am-submit:hover { background: #1a3260; }
        .am-submit:focus-visible { outline: 2px solid #2563eb; outline-offset: 3px; }
        .am-submit:disabled { opacity: 0.65; cursor: wait; }
        .am-spinner {
          width: 16px; height: 16px; border-radius: 50%;
          border: 2.5px solid rgba(255,255,255,0.35); border-top-color: #fff;
          animation: am-spin 0.7s linear infinite;
        }
        @keyframes am-spin { to { transform: rotate(360deg); } }
        .am-form-note { font-size: 12px; color: #94a3b8; text-align: center; margin: 14px 0 0; line-height: 1.5; }
        .am-form-error {
          font-size: 13px; font-weight: 600; color: #b91c1c;
          background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px;
          padding: 11px 14px; margin: 0 0 16px;
        }
        .am-form-success { text-align: center; padding: 34px 10px; }
        .am-success-icon {
          width: 62px; height: 62px; border-radius: 50%; margin: 0 auto 20px;
          background: #dcfce7; color: #15803d;
          display: flex; align-items: center; justify-content: center;
        }
        .am-success-title { font-size: 20px; font-weight: 800; color: #0A1628; margin: 0 0 10px; }
        .am-success-desc { font-size: 14px; line-height: 1.7; color: #475569; margin: 0; max-width: 40ch; margin-inline: auto; }

        /* ── FOOTER ── */
        .am-footer {
          background: #060d1a; padding: 34px 6vw;
          display: flex; align-items: center; justify-content: space-between;
          gap: 14px; flex-wrap: wrap;
        }
        .am-footer-brand { display: flex; align-items: center; gap: 9px; }
        .am-footer-brand img { height: 30px; width: 30px; object-fit: contain; opacity: 0.85; }
        .am-footer-brand span {
          font-family: 'Playfair Display', Georgia, serif;
          font-size: 13px; font-weight: 700; color: #8fa3c2;
        }
        .am-footer-links { display: flex; gap: 20px; flex-wrap: wrap; }
        .am-footer-links button, .am-footer-links a {
          font-size: 12px; font-weight: 600; color: #8fa3c2; text-decoration: none;
          background: none; border: none; cursor: pointer; padding: 0;
        }
        .am-footer-links button:hover, .am-footer-links a:hover { color: #fff; }
        .am-footer-copy { font-size: 11px; color: #5b6b85; }

        /* ── entrée animée ── */
        @keyframes am-up {
          from { opacity: 0; transform: translateY(18px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .am-a0 { animation: am-up .6s cubic-bezier(0.25,1,0.5,1) 0ms both; }
        .am-a1 { animation: am-up .6s cubic-bezier(0.25,1,0.5,1) 110ms both; }
        .am-a2 { animation: am-up .6s cubic-bezier(0.25,1,0.5,1) 210ms both; }
        .am-a3 { animation: am-up .6s cubic-bezier(0.25,1,0.5,1) 320ms both; }
        @media (prefers-reduced-motion: reduce) {
          .am-a0, .am-a1, .am-a2, .am-a3 { animation: none; }
          .am-hero-tag-dot { animation: none; }
          .am-faq-a { transition: none; }
          * { scroll-behavior: auto !important; }
        }
      `}} />

      <div className="am">
        {/* ── NAV ── */}
        <nav className="am-nav">
          <a href="/" className="am-nav-brand" aria-label="Retour à l'accueil EBN Network">
            <img src="/assets/Progress business logo.png" alt="" aria-hidden />
            <span className="am-nav-name">TechShop <span>Ambassadeur</span></span>
          </a>
          <div className="am-nav-links">
            <button className="am-nav-link" onClick={() => document.getElementById('programme')?.scrollIntoView({ behavior: 'smooth' })}>
              Comment ça marche
            </button>
            <button className="am-nav-link" onClick={() => document.getElementById('parcours')?.scrollIntoView({ behavior: 'smooth' })}>
              Parcours
            </button>
            <button className="am-nav-link" onClick={() => document.getElementById('faq')?.scrollIntoView({ behavior: 'smooth' })}>
              FAQ
            </button>
            <button className="am-nav-cta am-nav-cta-main" onClick={scrollToForm}>Devenir Ambassadeur</button>
          </div>
          <button className="am-nav-cta am-nav-cta-mobile" onClick={scrollToForm}>Candidater</button>
        </nav>

        {/* ── HERO ── */}
        <header className="am-hero">
          <div className="am-hero-copy">
            <p className="am-kicker am-a0">Programme relationnel TechShop · RDC</p>
            <h1 className="am-h1 am-a1">
              Ton réseau vaut<br />
              plus que ton<br />
              <em>salaire.</em>
            </h1>
            <p className="am-hero-sub am-a2">
              Deviens Ambassadeur TechShop : chaque personne que tu parraines
              t’ouvre une commission en USD. Monte les 8 niveaux de carrière,
              débloque un salaire mensuel et vise le bonus retraite de 50 000 $.
            </p>
            <div className="am-hero-actions am-a3">
              <button className="am-btn-primary" onClick={scrollToForm}>Poser ma candidature</button>
              <button className="am-btn-ghost" onClick={() => document.getElementById('parcours')?.scrollIntoView({ behavior: 'smooth' })}>
                Voir les 8 niveaux
              </button>
            </div>
          </div>
          <figure className="am-hero-figure am-a2" style={{ margin: 0 }}>
            <img
              src="/assets/hero-banner.jpg"
              alt="Entrepreneur congolais dans une boutique TechShop, tablette en main, devant une bannière Congo RDC"
            />
            <figcaption className="am-hero-tag">
              <span className="am-hero-tag-dot" aria-hidden />
              Goma · Bukavu · Kinshasa
            </figcaption>
          </figure>
        </header>

        {/* ── CHIFFRES ── */}
        <section className="am-stats" role="region" aria-label="Le programme en chiffres">
          <div className="am-stat">
            <div className="am-stat-v">8</div>
            <div className="am-stat-l">Niveaux de carrière</div>
          </div>
          <div className="am-stat">
            <div className="am-stat-v">4<small> filleuls</small></div>
            <div className="am-stat-l">Par matrice pour monter</div>
          </div>
          <div className="am-stat">
            <div className="am-stat-v">5 000<small> $</small></div>
            <div className="am-stat-l">Commission au rang Crown</div>
          </div>
          <div className="am-stat">
            <div className="am-stat-v">50 000<small> $</small></div>
            <div className="am-stat-l">Bonus retraite exceptionnel</div>
          </div>
        </section>

        {/* ── COMMENT ÇA MARCHE ── */}
        <section className="am-sec" id="programme" aria-labelledby="am-etapes-titre">
          <Reveal>
            <div className="am-sec-head">
              <h2 className="am-h2" id="am-etapes-titre">
                De candidat à Ambassadeur,<br /><em>en 4 étapes.</em>
              </h2>
              <p className="am-sec-sub">
                Pas de jargon, pas d’engagement flou. Tu sais à chaque instant où tu en es,
                combien tu as gagné et ce qu’il te manque pour le niveau suivant.
              </p>
            </div>
          </Reveal>
          <Reveal delay={90}>
            <div className="am-steps">
              {ETAPES.map((e) => (
                <article key={e.n} className="am-step">
                  <div className="am-step-n" aria-hidden>{e.n}</div>
                  <h3 className="am-step-titre">{e.titre}</h3>
                  <p className="am-step-desc">{e.desc}</p>
                </article>
              ))}
            </div>
          </Reveal>
        </section>

        {/* ── PARCOURS 8 NIVEAUX ── */}
        <section className="am-sec am-sec-gray" id="parcours" aria-labelledby="am-parcours-titre">
          <Reveal>
            <div className="am-sec-head">
              <h2 className="am-h2" id="am-parcours-titre">
                Huit niveaux.<br />Un <em>parcours clair.</em>
              </h2>
              <p className="am-sec-sub">
                Chaque niveau demande une matrice de 4 filleuls actifs. Matrice complète =
                commission versée + promotion. Les montants ci-dessous sont ceux configurés
                dans le système : rien n’est négocié à part, rien n’est caché.
              </p>
            </div>
          </Reveal>
          <Reveal delay={80}>
            <div className="am-ladder" role="table" aria-label="Barème des 8 niveaux de carrière">
              <div className="am-rung am-rung-head" role="row" aria-hidden>
                <span>N°</span>
                <span>Niveau</span>
                <span className="am-rung-mid">Commission</span>
                <span className="am-rung-sal">Salaire mensuel</span>
                <span style={{ textAlign: 'right' }}>Total niveau</span>
              </div>
              {NIVEAUX.map((n) => (
                <div key={n.ordre} className={`am-rung${n.ordre === 8 ? ' am-rung-crown' : ''}`} role="row">
                  <span className="am-rung-n" role="cell">{String(n.ordre).padStart(2, '0')}</span>
                  <div role="cell">
                    <div className="am-rung-nom">
                      {n.nom}
                      {n.ordre === 8 && <span className="am-crown-flag">Rang ultime</span>}
                    </div>
                    <div className="am-rung-note">{n.note}</div>
                  </div>
                  <span className="am-rung-mid" role="cell">
                    <strong>{fmtUSD(n.parFilleul)}</strong> × {n.filleuls} filleuls
                  </span>
                  <span className="am-rung-sal" role="cell">
                    {n.salaire ? `${fmtUSD(n.salaire)} / mois` : '—'}
                  </span>
                  <span className="am-rung-total" role="cell">{fmtUSD(n.totale)}</span>
                </div>
              ))}
            </div>
            <p className="am-ladder-footnote">
              Commission totale = ce que tu touches quand ta matrice du niveau est complète.
              Les paiements passent par ton portefeuille USD, après validation de chaque
              commission par l’équipe TechShop.
            </p>
          </Reveal>
        </section>

        {/* ── MATRICE 4 POSITIONS ── */}
        <section className="am-sec" aria-labelledby="am-matrice-titre">
          <div className="am-matrix-wrap">
            <Reveal>
              <div className="am-matrix-diagram" role="img" aria-label="Schéma d'une matrice de 4 positions autour du membre">
                <div className="am-slot am-slot-full">
                  <svg className="am-slot-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  <span className="am-slot-label">Position 1</span>
                  <span className="am-slot-sub">+40 $</span>
                </div>
                <div className="am-slot am-slot-full">
                  <svg className="am-slot-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  <span className="am-slot-label">Position 2</span>
                  <span className="am-slot-sub">+40 $</span>
                </div>
                <div className="am-matrix-center" aria-hidden>
                  <strong>TOI</strong>
                </div>
                <div className="am-slot">
                  <svg className="am-slot-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
                  <span className="am-slot-label">Position 3</span>
                  <span className="am-slot-sub">à pourvoir</span>
                </div>
                <div className="am-slot">
                  <svg className="am-slot-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
                  <span className="am-slot-label">Position 4</span>
                  <span className="am-slot-sub">à pourvoir</span>
                </div>
              </div>
            </Reveal>
            <Reveal delay={90}>
              <div className="am-sec-head" style={{ marginBottom: 28 }}>
                <h2 className="am-h2" id="am-matrice-titre">
                  Une matrice simple :<br /><em>4 places, pas plus.</em>
                </h2>
              </div>
              <ul className="am-matrix-points">
                <li>
                  <span className="am-point-bullet" aria-hidden>4</span>
                  <div>
                    <p className="am-point-titre">Quatre positions par niveau</p>
                    <p className="am-point-desc">
                      Ta matrice compte exactement 4 positions. Chaque filleul direct activé
                      en occupe une — pas de structure infinie ni de calculs obscurs.
                    </p>
                  </div>
                </li>
                <li>
                  <span className="am-point-bullet" aria-hidden>$</span>
                  <div>
                    <p className="am-point-titre">Payé à chaque filleul</p>
                    <p className="am-point-desc">
                      Dès la première position occupée, la commission par filleul est générée
                      sur ton portefeuille. La matrice complète débloque le total du niveau.
                    </p>
                  </div>
                </li>
                <li>
                  <span className="am-point-bullet" aria-hidden>↑</span>
                  <div>
                    <p className="am-point-titre">Promotion automatique</p>
                    <p className="am-point-desc">
                      Matrice complète = passage au niveau supérieur, avec un barème plus élevé
                      et — à partir d’Or — un salaire mensuel qui s’ajoute.
                    </p>
                  </div>
                </li>
              </ul>
            </Reveal>
          </div>
        </section>

        {/* ── AU-DELÀ DES COMMISSIONS ── */}
        <section className="am-sec am-sec-gray" aria-labelledby="am-extra-titre">
          <Reveal>
            <div className="am-sec-head">
              <h2 className="am-h2" id="am-extra-titre">
                Et quand tu montes,<br /><em>ça change la vie.</em>
              </h2>
            </div>
          </Reveal>
          <Reveal delay={80}>
            <div className="am-extra-grid">
              <div className="am-extra-cell">
                <div className="am-extra-val">1 000<small> $/mois</small></div>
                <h3 className="am-extra-titre">Salaire Crown Ambassadeur</h3>
                <p className="am-extra-desc">
                  Au rang ultime, ton salaire mensuel tombe tous les mois, en plus des
                  commissions de ton réseau qui continuent de tourner.
                </p>
              </div>
              <div className="am-extra-cell">
                <div className="am-extra-val">50 000<small> $</small></div>
                <h3 className="am-extra-titre">Bonus retraite</h3>
                <p className="am-extra-desc">
                  Un de tes filleuls atteint le rang Crown ? Tu touches 50 000 $.
                  Former un leader rapporte autant que le devenir.
                </p>
              </div>
              <div className="am-extra-cell">
                <div className="am-extra-val">100<small> % traçable</small></div>
                <h3 className="am-extra-titre">Portefeuille transparent</h3>
                <p className="am-extra-desc">
                  Chaque commission, promotion, salaire et bonus est journalisé dans ton
                  portefeuille USD. Tu vois tout, ligne par ligne, à tout moment.
                </p>
              </div>
            </div>
          </Reveal>
        </section>

        {/* ── FAQ ── */}
        <section className="am-sec" id="faq" aria-labelledby="am-faq-titre">
          <Reveal>
            <div className="am-sec-head">
              <h2 className="am-h2" id="am-faq-titre">Les questions<br />qu'on nous pose <em>vraiment.</em></h2>
            </div>
          </Reveal>
          <Reveal delay={70}>
            <div className="am-faq">
              {FAQ.map((f, i) => (
                <div key={i} className="am-faq-item">
                  <button
                    className="am-faq-q"
                    aria-expanded={openFaq === i}
                    aria-controls={`am-faq-a-${i}`}
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  >
                    {f.q}
                    <svg className="am-faq-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="6 9 12 15 18 9"/></svg>
                  </button>
                  <div className={`am-faq-a${openFaq === i ? ' open' : ''}`} id={`am-faq-a-${i}`} role="region">
                    <p>{f.a}</p>
                  </div>
                </div>
              ))}
            </div>
          </Reveal>
        </section>

        {/* ── CANDIDATURE ── */}
        <section className="am-sec am-apply" id="candidature" aria-labelledby="am-apply-titre">
          <div className="am-apply-copy">
            <Reveal>
              <h2 className="am-h2" id="am-apply-titre">
                Prêt à faire tourner<br /><em>ton réseau ?</em>
              </h2>
              <p className="am-sec-sub" style={{ color: '#b6c2d9' }}>
                Remplis le formulaire — c’est gratuit et sans engagement.
                Un conseiller TechShop te rappelle sous 24h pour répondre
                à tes questions et planifier ton passage en boutique.
              </p>
              <ul className="am-apply-points">
                <li>Rappel garanti sous 24h ouvrées</li>
<li>Inscription officielle dans l’une de nos boutiques</li>
<li>Formation incluse avant l’activation de ton compte</li>
<li>Ton code parrain TSG est généré à l’activation</li>
              </ul>
            </Reveal>
          </div>
          <Reveal delay={90}>
            <div className="am-form-card">
              <h3 className="am-form-title">Candidature Ambassadeur</h3>
              <p className="am-form-intro">2 minutes pour remplir. Réponse sous 24h.</p>
              <CandidatureForm />
            </div>
          </Reveal>
        </section>

        {/* ── FOOTER ── */}
        <footer className="am-footer">
          <div className="am-footer-brand">
            <img src="/assets/Progress business logo.png" alt="" aria-hidden />
            <span>TechShop Ambassadeur</span>
          </div>
          <div className="am-footer-links">
            <button onClick={() => navigate('/')}>Accueil</button>
            <button onClick={() => navigate('/login')}>Espace Agent</button>
            <button onClick={() => navigate('/portal/login')}>Portail Client</button>
          </div>
          <span className="am-footer-copy">EBN Network RDC © {new Date().getFullYear()}</span>
        </footer>
      </div>
    </>
  );
}