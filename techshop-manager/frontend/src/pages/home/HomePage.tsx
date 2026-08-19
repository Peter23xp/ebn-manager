import { useNavigate } from 'react-router-dom';
import { useEffect, useRef } from 'react';
import { Helmet } from 'react-helmet-async';
import { PageSEO } from '@/components/seo/PageSEO';

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
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          el.style.opacity = '1';
          el.style.transform = 'translateY(0)';
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

const STATS = [
  { v: '42', l: 'Écrans' },
  { v: '10', l: 'Modules' },
  { v: '6',  l: 'Rôles' },
  { v: '3',  l: 'Villes' },
];

const MODULES = [
  { n: '01', label: 'Caisse POS',  desc: 'Ventes en moins de 90 s, même hors-ligne' },
  { n: '02', label: 'Clients',     desc: 'Onboarding 4 étapes, historique complet' },
  { n: '03', label: 'Stocks',      desc: 'Inventaire multi-sites, alertes de seuil' },
  { n: '04', label: 'Parrainage',  desc: 'Arbre de filleuls, récompenses configurables' },
  { n: '05', label: 'Fidélité',    desc: 'Points Bronze → Platine, remises automatiques' },
  { n: '06', label: 'Rapports',    desc: 'Export Excel/PDF, tableau de bord régional' },
];

const SITES = [
  { n: '01', name: 'Goma',     role: 'Siège national',  sub: 'Nord-Kivu' },
  { n: '02', name: 'Bukavu',   role: 'Site régional',   sub: 'Sud-Kivu' },
  { n: '03', name: 'Kinshasa', role: 'Site national',   sub: 'Kinshasa-Gombe' },
];

export default function HomePage() {
  const navigate = useNavigate();
  usePageScroll();

  return (
    <>
      <PageSEO canonical="/" ogType="website" />
      <Helmet>
        <script type="application/ld+json">{JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'Organization',
          'name': 'EBN Network',
          'url': 'https://ebnnetwork.onrender.com',
          'logo': 'https://ebnnetwork.onrender.com/assets/Progress business logo.png',
          'description': 'Système de gestion commerciale multi-sites pour EBN Network — Goma, Bukavu, Kinshasa (RDC).',
          'address': {
            '@type': 'PostalAddress',
            'addressCountry': 'CD',
            'addressLocality': 'Goma',
          },
          'areaServed': ['Goma', 'Bukavu', 'Kinshasa'],
          'contactPoint': {
            '@type': 'ContactPoint',
            'contactType': 'customer service',
            'availableLanguage': ['French'],
          },
        })}</script>
      </Helmet>
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700&display=swap');

        .lp { background: #f1f5f9; color: #0f172a; font-family: "Plus Jakarta Sans", system-ui, sans-serif; }

        /* ── NAV ── */
        .lp-nav {
          position: fixed; top: 0; left: 0; right: 0; z-index: 50;
          height: 60px;
          display: flex; align-items: center; justify-content: space-between;
          padding: 0 6vw;
          background: rgba(255,255,255,0.92);
          backdrop-filter: blur(14px);
          border-bottom: 1px solid #e2e8f0;
        }
        .lp-nav-brand {
          display: flex; align-items: center; gap: 10px;
          text-decoration: none;
        }
        .lp-nav-brand img { height: 44px; width: 44px; object-fit: contain; }
        .lp-nav-name {
          font-family: 'Playfair Display', Georgia, serif;
          font-size: 17px; font-weight: 700;
          color: #0A1628; letter-spacing: -0.01em;
        }
        .lp-nav-btn {
          font-size: 13px; font-weight: 600;
          color: #ffffff; background: #0A1628;
          border: none; border-radius: 7px;
          padding: 0 20px; height: 36px; min-height: 36px;
          cursor: pointer; letter-spacing: 0.01em;
          transition: background .18s;
        }
        .lp-nav-btn:hover { background: #1a3260; }
        .lp-nav-btn:focus-visible { outline: 2px solid #2563eb; outline-offset: 3px; }

        /* ── HERO ── */
        .lp-hero {
          min-height: 100vh;
          padding-top: 60px;
          display: flex; flex-direction: column;
          background: #ffffff;
        }

        .lp-hero-inner {
          padding: 80px 6vw 72px;
          max-width: 900px;
        }
        @media (max-width: 640px) { .lp-hero-inner { padding: 60px 20px 56px; } }

        .lp-eyebrow {
          display: inline-flex; align-items: center; gap: 8px;
          font-size: 11px; font-weight: 600;
          letter-spacing: 0.18em; text-transform: uppercase;
          color: #64748b; margin-bottom: 28px;
        }
        .lp-eyebrow-dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: #15803d; flex-shrink: 0;
          animation: lp-pulse 2s ease-in-out infinite;
        }
        @keyframes lp-pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }

        .lp-h1 {
          font-family: 'Playfair Display', Georgia, serif;
          font-size: clamp(46px, 8vw, 88px);
          font-weight: 900; line-height: 0.95;
          letter-spacing: -0.03em;
          color: #0A1628;
          margin: 0 0 32px;
        }
        .lp-h1 em {
          font-style: italic;
          color: #2563eb;
        }

        .lp-hero-sub {
          font-size: clamp(15px, 1.6vw, 18px);
          font-weight: 400; line-height: 1.65;
          color: #64748b;
          max-width: 520px; margin: 0 0 48px;
        }

        .lp-actions { display: flex; gap: 12px; flex-wrap: wrap; }

        .lp-btn-agent {
          font-size: 14px; font-weight: 700;
          background: #0A1628; color: #fff;
          border: none; border-radius: 8px;
          padding: 14px 30px; cursor: pointer; min-height: 48px;
          letter-spacing: 0.01em;
          transition: background .18s, box-shadow .18s;
        }
        .lp-btn-agent:hover {
          background: #1a3260;
          box-shadow: 0 8px 24px rgba(10,22,40,0.2);
        }
        .lp-btn-agent:focus-visible { outline: 2px solid #0A1628; outline-offset: 3px; }

        .lp-btn-client {
          font-size: 14px; font-weight: 600;
          background: #f0fdf4; color: #15803d;
          border: 1.5px solid #bbf7d0;
          border-radius: 8px; padding: 14px 30px;
          cursor: pointer; min-height: 48px;
          transition: background .18s, border-color .18s;
          letter-spacing: 0.01em;
        }
        .lp-btn-client:hover {
          background: #dcfce7; border-color: #86efac;
        }
        .lp-btn-client:focus-visible { outline: 2px solid #15803d; outline-offset: 3px; }

        /* hero image */
        .lp-hero-img-wrap {
          margin: 0 6vw 0;
          height: 360px; border-radius: 12px; overflow: hidden;
          background: #0A1628;
          border: 1px solid #e2e8f0;
          position: relative;
          display: flex; align-items: center; justify-content: center;
        }
        @media (max-width: 640px) { .lp-hero-img-wrap { height: 200px; margin: 0 20px; } }

        .lp-hero-img {
          width: 100%; height: 100%;
          object-fit: cover; object-position: center;
          display: block;
        }

        .lp-hero-placeholder {
          position: absolute; inset: 0;
          background: linear-gradient(135deg, #0A1628 0%, #1a3260 55%, #0f3320 100%);
        }
        .lp-hero-placeholder::after {
          content: '';
          position: absolute; inset: 0;
          background-image:
            repeating-linear-gradient(0deg, transparent, transparent 47px, rgba(255,255,255,0.025) 47px, rgba(255,255,255,0.025) 48px),
            repeating-linear-gradient(90deg, transparent, transparent 47px, rgba(255,255,255,0.025) 47px, rgba(255,255,255,0.025) 48px);
        }
        .lp-img-label {
          position: relative; z-index: 2;
          font-size: 11px; letter-spacing: 0.15em; text-transform: uppercase;
          color: rgba(255,255,255,0.2); text-align: center;
        }
        .lp-img-badge {
          position: absolute; bottom: 18px; right: 18px; z-index: 3;
          display: flex; align-items: center; gap: 7px;
          padding: 6px 13px;
          background: rgba(255,255,255,0.09);
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 20px;
          font-size: 11px; color: rgba(255,255,255,0.45);
          letter-spacing: 0.05em;
        }
        .lp-badge-dot {
          width: 5px; height: 5px; border-radius: 50%;
          background: #22c55e; flex-shrink: 0;
          animation: lp-pulse 2s ease-in-out infinite;
        }

        /* ── STATS BAND ── */
        .lp-stats {
          background: #0A1628;
          padding: 44px 6vw;
          display: grid; grid-template-columns: repeat(4,1fr);
          margin-top: 0;
        }
        @media (max-width: 600px) {
          .lp-stats { grid-template-columns: repeat(2,1fr); gap: 32px 0; }
        }
        .lp-stat {
          padding-right: 28px;
          border-right: 1px solid rgba(255,255,255,0.08);
        }
        .lp-stat:last-child { border-right: none; }
        @media (max-width: 600px) {
          .lp-stat:nth-child(2) { border-right: none; }
          .lp-stat:nth-child(3) { border-right: 1px solid rgba(255,255,255,0.08); }
        }
        .lp-stat-v {
          font-family: 'Playfair Display', Georgia, serif;
          font-size: 48px; font-weight: 900;
          color: #ffffff; line-height: 1; margin-bottom: 6px;
        }
        .lp-stat-l {
          font-size: 11px; font-weight: 600;
          letter-spacing: 0.14em; text-transform: uppercase;
          color: #94a8c7;
        }

        /* ── SECTIONS ── */
        .lp-sec { padding: 88px 6vw; background: #f1f5f9; }
        @media (max-width: 640px) { .lp-sec { padding: 64px 20px; } }

        .lp-sec-white { background: #ffffff; }

        .lp-sec-eyebrow {
          font-size: 10px; font-weight: 700;
          letter-spacing: 0.25em; text-transform: uppercase;
          color: #94a3b8; margin-bottom: 14px;
        }
        .lp-sec-title {
          font-family: 'Playfair Display', Georgia, serif;
          font-size: clamp(26px, 3.5vw, 40px);
          font-weight: 700; line-height: 1.1;
          letter-spacing: -0.02em;
          color: #0A1628; margin: 0 0 52px; max-width: 520px;
        }

        /* ── MODULES ── */
        .lp-mod-grid {
          display: grid; grid-template-columns: repeat(3,1fr); gap: 1px;
          background: #e2e8f0;
          border: 1px solid #e2e8f0;
          border-radius: 10px; overflow: hidden;
        }
        @media (max-width: 900px) { .lp-mod-grid { grid-template-columns: repeat(2,1fr); } }
        @media (max-width: 500px) { .lp-mod-grid { grid-template-columns: 1fr; } }

        .lp-mod-cell {
          background: #ffffff;
          padding: 28px 26px;
          transition: background .15s;
        }
        .lp-mod-cell:hover { background: #f8fafc; }

        .lp-mod-n {
          font-family: 'Playfair Display', Georgia, serif;
          font-size: 11px; color: #cbd5e1;
          margin-bottom: 16px;
        }
        .lp-mod-name {
          font-size: 15px; font-weight: 700;
          color: #0f172a; margin-bottom: 8px; letter-spacing: -0.01em;
        }
        .lp-mod-desc {
          font-size: 13px; font-weight: 400;
          color: #64748b; line-height: 1.6;
        }

        /* ── SITES ── */
        .lp-sites-wrap { padding: 0 6vw 88px; background: #f1f5f9; }
        @media (max-width: 640px) { .lp-sites-wrap { padding: 0 20px 64px; } }

        .lp-rule { height: 1px; background: #e2e8f0; margin-bottom: 52px; }

        .lp-sites-grid {
          display: grid; grid-template-columns: repeat(3,1fr); gap: 2px;
          background: #e2e8f0; border: 1px solid #e2e8f0;
          border-radius: 10px; overflow: hidden;
        }
        @media (max-width: 700px) { .lp-sites-grid { grid-template-columns: 1fr; } }

        .lp-site-cell {
          background: #ffffff; padding: 32px 28px;
        }
        .lp-site-n {
          font-family: 'Playfair Display', Georgia, serif;
          font-size: 28px; font-weight: 400;
          color: #e2e8f0; margin-bottom: 14px; line-height: 1;
        }
        .lp-site-name {
          font-family: 'Playfair Display', Georgia, serif;
          font-size: 22px; font-weight: 700;
          color: #0A1628; margin-bottom: 4px; letter-spacing: -0.01em;
        }
        .lp-site-role {
          font-size: 11px; font-weight: 600;
          letter-spacing: 0.1em; text-transform: uppercase;
          color: #94a3b8; margin-bottom: 6px;
        }
        .lp-site-sub { font-size: 13px; color: #64748b; }

        /* ── PORTALS ── */
        .lp-portals-wrap {
          background: #ffffff;
          padding: 88px 6vw;
          border-top: 1px solid #e2e8f0;
        }
        @media (max-width: 640px) { .lp-portals-wrap { padding: 64px 20px; } }

        .lp-portals-grid {
          display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 0;
        }
        @media (max-width: 640px) { .lp-portals-grid { grid-template-columns: 1fr; } }

        .lp-portal-card {
          border-radius: 12px; padding: 36px 32px;
          cursor: pointer; text-align: left;
          border: none; display: flex; flex-direction: column; gap: 10px;
          min-height: 44px; transition: box-shadow .2s, transform .2s;
        }
        .lp-portal-card:hover { transform: translateY(-2px); }
        .lp-portal-card:focus-visible { outline: 2px solid #2563eb; outline-offset: 3px; }

        .lp-portal-card.agent {
          background: #0A1628;
          box-shadow: 0 4px 20px rgba(10,22,40,0.15);
        }
        .lp-portal-card.agent:hover {
          box-shadow: 0 12px 40px rgba(10,22,40,0.25);
        }
        .lp-portal-card.client {
          background: #f0fdf4;
          border: 1.5px solid #bbf7d0;
          box-shadow: 0 4px 20px rgba(21,128,61,0.07);
        }
        .lp-portal-card.client:hover {
          box-shadow: 0 12px 40px rgba(21,128,61,0.13);
        }

        .lp-portal-label {
          font-size: 10px; font-weight: 700;
          letter-spacing: 0.2em; text-transform: uppercase;
        }
        .agent .lp-portal-label { color: #94a8c7; }
        .client .lp-portal-label { color: #86efac; }

        .lp-portal-title {
          font-family: 'Playfair Display', Georgia, serif;
          font-size: 28px; font-weight: 700; line-height: 1.0;
          letter-spacing: -0.015em;
        }
        .agent .lp-portal-title { color: #ffffff; }
        .client .lp-portal-title { color: #14532d; }

        .lp-portal-desc { font-size: 13px; line-height: 1.6; }
        .agent .lp-portal-desc { color: #94a8c7; }
        .client .lp-portal-desc { color: #166534; }

        .lp-portal-cta {
          font-size: 13px; font-weight: 700;
          margin-top: 12px; letter-spacing: 0.02em;
          display: inline-flex; align-items: center; gap: 6px;
        }
        .agent .lp-portal-cta { color: #93c5fd; }
        .client .lp-portal-cta { color: #15803d; }

        /* ── FOOTER ── */
        .lp-footer {
          background: #0A1628;
          padding: 28px 6vw;
          display: flex; align-items: center; justify-content: space-between;
          gap: 12px; flex-wrap: wrap;
          border-top: 1px solid rgba(255,255,255,0.05);
        }
        @media (max-width: 640px) { .lp-footer { padding: 24px 20px; } }

        .lp-footer-brand {
          display: flex; align-items: center; gap: 9px;
        }
        .lp-footer-brand img { height: 32px; width: 32px; object-fit: contain; opacity: 0.85; }
        .lp-footer-brand span {
          font-family: 'Playfair Display', Georgia, serif;
          font-size: 13px; font-weight: 700; color: #94a8c7;
        }
        .lp-footer-mid {
          display: flex; align-items: center; gap: 7px;
          font-size: 11px; color: #94a8c7; letter-spacing: 0.06em;
        }
        .lp-footer-copy { font-size: 11px; color: #94a8c7; }

        /* ── hero entry animations ── */
        @keyframes lp-up {
          from { opacity:0; transform:translateY(18px); }
          to   { opacity:1; transform:translateY(0); }
        }
        .lp-a0 { animation: lp-up .6s cubic-bezier(0.25,1,0.5,1) 0ms   both; }
        .lp-a1 { animation: lp-up .6s cubic-bezier(0.25,1,0.5,1) 100ms  both; }
        .lp-a2 { animation: lp-up .6s cubic-bezier(0.25,1,0.5,1) 190ms  both; }
        .lp-a3 { animation: lp-up .6s cubic-bezier(0.25,1,0.5,1) 280ms  both; }
        .lp-a4 { animation: lp-up .6s cubic-bezier(0.25,1,0.5,1) 390ms  both; }
      `}} />

      <div className="lp">

        {/* ── NAV ── */}
        <nav className="lp-nav">
          <div className="lp-nav-brand">
            <img src="/assets/Progress business logo.png" alt="EBN Network" />
            <span className="lp-nav-name">EBN Network</span>
          </div>
          <button className="lp-nav-btn" onClick={() => navigate('/login')}>
            Se connecter
          </button>
        </nav>

        {/* ── HERO ── */}
        <section className="lp-hero">
          <div className="lp-hero-inner">
            <p className="lp-eyebrow lp-a0">
              <span className="lp-eyebrow-dot" aria-hidden />
              EBN Network · RDC
            </p>
            <h1 className="lp-h1 lp-a1">
              La gestion<br />
              commerciale<br />
              <em>en ordre.</em>
            </h1>
            <p className="lp-hero-sub lp-a2">
              Caisse POS, stocks multi-sites et réseau MLM à 8 niveaux —
              centralisés, fiables et disponibles même sans réseau.
            </p>
            <div className="lp-actions lp-a3">
              <button className="lp-btn-agent" onClick={() => navigate('/login')}>
                Espace Agent
              </button>
              <button className="lp-btn-client" onClick={() => navigate('/portal/login')}>
                Portail Client
              </button>
            </div>
          </div>

          <div className="lp-hero-img-wrap lp-a4">
            <img
              src="/assets/hero-banner.jpg"
              alt="EBN Network — commerce en RDC"
              className="lp-hero-img"
            />
            <div className="lp-img-badge">
              <span className="lp-badge-dot" />
              Hors-ligne natif
            </div>
          </div>
        </section>

        {/* ── STATS ── */}
        <div className="lp-stats" role="region" aria-label="Chiffres clés">
          {STATS.map(({ v, l }) => (
            <div key={l} className="lp-stat">
              <div className="lp-stat-v">{v}</div>
              <div className="lp-stat-l">{l}</div>
            </div>
          ))}
        </div>

        {/* ── MODULES ── */}
        <section className="lp-sec" aria-labelledby="lp-mod-title">
          <Reveal>
            <p className="lp-sec-eyebrow">Fonctionnalités</p>
            <h2 id="lp-mod-title" className="lp-sec-title">
              Tout ce dont votre<br />commerce a besoin.
            </h2>
          </Reveal>
          <Reveal delay={80}>
            <div className="lp-mod-grid">
              {MODULES.map(({ n, label, desc }) => (
                <div key={label} className="lp-mod-cell">
                  <div className="lp-mod-n">{n}</div>
                  <div className="lp-mod-name">{label}</div>
                  <div className="lp-mod-desc">{desc}</div>
                </div>
              ))}
            </div>
          </Reveal>
        </section>

        {/* ── SITES ── */}
        <div className="lp-sites-wrap">
          <Reveal>
            <div className="lp-rule" />
            <p className="lp-sec-eyebrow">Présence RDC</p>
            <h2 className="lp-sec-title">Trois villes,<br />un seul système.</h2>
          </Reveal>
          <Reveal delay={60}>
            <div className="lp-sites-grid">
              {SITES.map(({ n, name, role, sub }) => (
                <div key={name} className="lp-site-cell">
                  <div className="lp-site-n">{n}</div>
                  <div className="lp-site-name">{name}</div>
                  <div className="lp-site-role">{role}</div>
                  <div className="lp-site-sub">{sub}</div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>

        {/* ── PORTAILS ── */}
        <div className="lp-portals-wrap">
          <Reveal>
            <p className="lp-sec-eyebrow">Accès</p>
            <h2 className="lp-sec-title" style={{ marginBottom: 36 }}>
              Choisissez votre espace.
            </h2>
            <div className="lp-portals-grid">
              <button
                className="lp-portal-card agent"
                onClick={() => navigate('/login')}
              >
                <span className="lp-portal-label">Personnel</span>
                <span className="lp-portal-title">Espace Agent</span>
                <span className="lp-portal-desc">
                  Gérants · Agents · Superviseurs<br />
                  POS · Clients · Stocks · Rapports
                </span>
                <span className="lp-portal-cta">Se connecter →</span>
              </button>

              <button
                className="lp-portal-card client"
                onClick={() => navigate('/portal/login')}
              >
                <span className="lp-portal-label">Clients</span>
                <span className="lp-portal-title">Portail Client</span>
                <span className="lp-portal-desc">
                  Achats · Points fidélité · Filleuls<br />
                  Programme Bronze → Platine
                </span>
                <span className="lp-portal-cta">Accéder →</span>
              </button>
            </div>
          </Reveal>
        </div>

        {/* ── FOOTER ── */}
        <footer className="lp-footer">
          <div className="lp-footer-brand">
            <img src="/assets/Progress business logo.png" alt="" aria-hidden />
            <span>EBN Network</span>
          </div>
          <div className="lp-footer-mid">
            <span className="lp-badge-dot" style={{ width: 5, height: 5 }} aria-hidden />
            Hors-ligne natif · Sync automatique
          </div>
          <span className="lp-footer-copy">v1.0 · EBN Network RDC © {new Date().getFullYear()}</span>
        </footer>

      </div>
    </>
  );
}
