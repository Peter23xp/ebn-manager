import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { PageSEO } from '@/components/seo/PageSEO';
import { SIEGE, SITE_URL } from '@/lib/site';
import { usePageScroll } from '@/hooks/usePageScroll';
import { photo } from '@/lib/photos';

/* ── helpers ──────────────────────────────────────────────────────────────── */


function Photo({ src, alt, eager }: { src: string; alt: string; eager?: boolean }) {
  return (
    <img
      src={src}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      onError={e => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }}
    />
  );
}

/* ── siège & implantations ────────────────────────────────────────────────── */


const IMPLANTATIONS = [
  { lieu: SIEGE.ville, pays: SIEGE.pays, type: 'Siège social', desc: 'Direction générale, partenariats internationaux, conformité.' },
  { lieu: 'Goma', pays: 'Nord-Kivu, RDC', type: 'Direction des opérations', desc: 'Pilotage des boutiques et du réseau en RDC.' },
  { lieu: 'Bukavu', pays: 'Sud-Kivu, RDC', type: 'Boutique', desc: 'Inscription, formation et activation des membres.' },
  { lieu: 'Kinshasa', pays: 'Kinshasa, RDC', type: 'Boutique', desc: 'Inscription, formation et développement du réseau.' },
];

/* ── données ──────────────────────────────────────────────────────────────── */

const FAITS = [
  { k: 'Siège social', v: SIEGE.libelle },
  { k: 'Boutiques', v: 'Goma · Bukavu · Kinshasa' },
  { k: 'Plan de carrière', v: '8 niveaux publiés' },
];

const VALEURS = [
  { titre: 'Intégrité', desc: 'Plan de rémunération publié, montants configurés dans le système, aucune promesse irréaliste.' },
  { titre: 'Ancrage local', desc: `Une direction à ${SIEGE.ville}, des équipes qui connaissent le terrain à Goma, Bukavu et Kinshasa.` },
  { titre: 'Croissance réelle', desc: "La vente de produits et services concrets d'abord. Le réseau amplifie la valeur, il ne la remplace pas." },
  { titre: 'Conformité', desc: 'Une structure juridique claire en Russie et en RDC, des registres tenus et vérifiables.' },
];

const OFFRE_PHOTOS = [
  { img: photo('1488459716781-31db52582fe9'), alt: 'Étal de fruits et légumes frais', legende: 'Des produits du quotidien' },
  { img: photo('1531058020387-3be344556be6'), alt: 'Salle de formation remplie de participants', legende: 'Des formations en boutique' },
  { img: photo('1521791136064-7986c2920216'), alt: 'Poignée de main entre deux partenaires', legende: 'Un parrainage encadré' },
];

const PRODUITS = [
  { num: '01', nom: 'Produits et services réels', desc: 'Des solutions utiles et concrètes qui créent une vraie valeur pour vos clients.' },
  { num: '02', nom: 'Formation et accompagnement', desc: 'Démarrez avec les bons outils, des conseils pratiques et un suivi à chaque étape.' },
  { num: '03', nom: 'Une communauté locale', desc: 'Des partenaires engagés à Goma, Bukavu et Kinshasa, qui avancent ensemble.' },
  { num: '04', nom: 'Parrainage transparent', desc: 'Développez votre réseau dans un cadre clair, fondé sur la confiance et le partage.' },
  { num: '05', nom: 'Commissions évolutives', desc: 'Des revenus qui progressent selon votre activité, votre engagement et votre réseau.' },
  { num: '06', nom: 'Un parcours de réussite', desc: 'Évoluez de Builder vers les niveaux Ambassadeur grâce à un plan de carrière structuré.' },
];

const OPPORTUNITE = [
  { niveau: 'Builder',           filleuls: 4, commission: '40 USD',        systeme: '24 USD',     retour: '16 USD',     bonus: '2 pagnes' },
  { niveau: 'Sapphire',          filleuls: 4, commission: '83.32 USD',     systeme: '50 USD',     retour: '33.32 USD',  bonus: '1er kit alimentaire' },
  { niveau: 'Ruby',              filleuls: 4, commission: '133.32 USD',    systeme: '80 USD',     retour: '53.32 USD',  bonus: '2e kit alimentaire' },
  { niveau: 'Emerald',           filleuls: 4, commission: '333.32 USD',    systeme: '200 USD',    retour: '133.32 USD', bonus: 'Écran plat 52 pouces' },
  { niveau: 'Diamond',           filleuls: 4, commission: '1 666.68 USD',  systeme: '1 000 USD',  retour: '666.68 USD', bonus: 'Moto de luxe de 2 000 USD' },
  { niveau: 'Crown Diamond',     filleuls: 4, commission: '3 333.32 USD',  systeme: '2 000 USD',  retour: '1 333.32 USD', bonus: '1re voiture de 6 000 USD' },
  { niveau: 'Ambassadeur',       filleuls: 4, commission: '33 333.32 USD', systeme: '20 000 USD', retour: '13 333.32 USD', bonus: '1re maison de 30 000 USD + 2e voiture de 15 000 USD' },
  { niveau: 'Crown Ambassadeur', filleuls: 4, commission: '83 333.32 USD', systeme: '50 000 USD', retour: '33 333.32 USD', bonus: '2e maison + 3e voiture' },
];

const TEMOIGNAGES = [
  { nom: 'Marie K.', ville: 'Goma', role: 'Ambassadrice Niveau Or', texte: "Grâce à EBN, j'ai pu bâtir un réseau de plus de 20 partenaires en 6 mois. La transparence du système m'a convaincue dès le départ." },
  { nom: 'Patrick M.', ville: 'Bukavu', role: 'Distributeur Bronze', texte: 'Le système de caisse a changé la gestion de ma boutique. Je vois mes ventes en temps réel, même depuis mon téléphone.' },
  { nom: 'Sarah N.', ville: 'Kinshasa', role: 'Ambassadrice Argent', texte: "Ce qui m'a convaincue, c'est la clarté : chaque commission est visible dans mon portefeuille. Aucune surprise." },
];

const ETAPES = [
  { n: '1', titre: 'Contactez-nous', desc: 'Par WhatsApp ou via le formulaire. Un conseiller EBN vous répond sous 24h.' },
  { n: '2', titre: 'Inscription en boutique', desc: "Rendez-vous dans l'une de nos boutiques à Goma, Bukavu ou Kinshasa : formation et activation du compte." },
  { n: '3', titre: 'Parrainez 4 personnes', desc: 'Chaque personne que vous amenez occupe une position dans votre matrice et génère une commission.' },
  { n: '4', titre: 'Montez les niveaux', desc: 'Matrice complète = commission versée et promotion au niveau suivant.' },
];

const WHATSAPP_LINK = 'https://wa.me/243974752784?text=Bonjour%20EBN%20!%20Je%20souhaite%20en%20savoir%20plus%20sur%20votre%20programme.';
const WHATSAPP_NUMBER = '+243 974 752 784';

const WA_PATH = 'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z';

function WhatsAppIcon({ size = 22 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d={WA_PATH} /></svg>;
}

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
        <h3 className="lp-success-title">Message reçu</h3>
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
          <label htmlFor="lp-tel">Téléphone *</label>
          <input id="lp-tel" type="tel" value={form.telephone} onChange={set('telephone')} placeholder="+243 9XX XXX XXX" autoComplete="tel" />
        </div>
      </div>
      <div className="lp-field">
        <label htmlFor="lp-ville">Ville</label>
        <select id="lp-ville" value={form.ville} onChange={set('ville')}>
          <option value="">Choisir votre ville</option>
          {['Goma', 'Bukavu', 'Kinshasa', SIEGE.ville, 'Autre'].map(v => <option key={v} value={v}>{v}</option>)}
        </select>
      </div>
      <div className="lp-field">
        <label htmlFor="lp-message">Message</label>
        <textarea id="lp-message" rows={4} value={form.message} onChange={set('message')} placeholder="Dites-nous en quoi nous pouvons vous aider..." />
      </div>
      {state === 'error' && (
        <p className="lp-form-error" role="alert">Merci de remplir votre nom et votre téléphone.</p>
      )}
      <button type="submit" className="lp-btn lp-btn-dark lp-btn-block" disabled={state === 'sending'}>
        {state === 'sending' ? 'Envoi en cours...' : 'Envoyer le message'}
      </button>
      <p className="lp-form-note">
        Réponse sous 24h ouvrées. Vos données servent uniquement à traiter votre demande
        (voir notre <Link to="/legal/confidentialite">politique de confidentialité</Link>).
      </p>
    </form>
  );
}

/* ── styles ───────────────────────────────────────────────────────────────── */

const CSS = `
  .lp { --ink: #111827; --text: #374151; --muted: #6b7280; --line: #e5e7eb; --alt: #f1f5f9; --gold: #a17e36;
    background: #fff; color: var(--ink); font-family: "Plus Jakarta Sans", system-ui, sans-serif; font-size: 15px; line-height: 1.6; }
  .lp * { box-sizing: border-box; }
  .lp img { display: block; max-width: 100%; }
  .lp-wrap { max-width: 1180px; margin: 0 auto; padding: 0 32px; }
  @media (max-width: 640px) { .lp-wrap { padding: 0 20px; } }
  .lp-visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

  /* WHATSAPP */
  .lp-wa-float { position: fixed; bottom: 22px; right: 22px; z-index: 100; width: 54px; height: 54px; border-radius: 50%; background: #25D366; color: #fff; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 14px rgba(0,0,0,.18); }
  @media (max-width: 640px) { .lp-wa-float { bottom: 16px; right: 16px; width: 50px; height: 50px; } }

  /* NAV */
  .lp-nav { position: sticky; top: 0; z-index: 50; background: #fff; border-bottom: 1px solid var(--line); }
  .lp-nav-bar { height: 68px; display: flex; align-items: center; justify-content: space-between; }
  .lp-brand { display: flex; align-items: center; gap: 10px; text-decoration: none; }
  .lp-brand img { height: 42px; width: 42px; object-fit: contain; }
  .lp-brand-name { font-family: 'Playfair Display', Georgia, serif; font-size: 18px; font-weight: 700; color: var(--ink); }
  .lp-brand-name span { color: var(--gold); }
  .lp-nav-links { display: flex; align-items: center; gap: 26px; }
  @media (max-width: 960px) { .lp-nav-links { display: none; } }
  .lp-nav-link { font-family: inherit; font-size: 14px; font-weight: 500; color: var(--text); background: none; border: none; cursor: pointer; padding: 4px 0; }
  .lp-nav-link:hover { color: var(--ink); text-decoration: underline; text-underline-offset: 6px; }
  .lp-nav-link:focus-visible, .lp-btn:focus-visible, .lp-burger:focus-visible, .lp-menu-link:focus-visible, .lp-footer-link:focus-visible { outline: 2px solid var(--gold); outline-offset: 3px; }
  .lp-burger { display: none; width: 40px; height: 40px; border-radius: 6px; border: 1px solid var(--line); background: #fff; cursor: pointer; color: var(--ink); align-items: center; justify-content: center; }
  @media (max-width: 960px) { .lp-burger { display: flex; } }
  .lp-menu { border-top: 1px solid var(--line); background: #fff; padding: 4px 0 18px; }
  .lp-menu .lp-wrap { display: flex; flex-direction: column; }
  .lp-menu-link { font-family: inherit; text-align: left; font-size: 15px; font-weight: 500; color: var(--ink); background: none; border: 0; border-bottom: 1px solid var(--line); padding: 14px 0; cursor: pointer; }
  .lp-menu .lp-btn { margin-top: 16px; }

  /* BOUTONS */
  .lp-btn { font-family: inherit; font-size: 14.5px; font-weight: 600; border-radius: 6px; padding: 0 22px; min-height: 46px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 10px; text-decoration: none; border: 1px solid transparent; transition: background .15s, border-color .15s; }
  .lp-btn-dark { background: var(--ink); color: #fff; }
  .lp-btn-dark:hover { background: #374151; }
  .lp-btn-dark:disabled { opacity: .6; cursor: wait; }
  .lp-btn-line { background: #fff; color: var(--ink); border-color: #d1d5db; }
  .lp-btn-line:hover { border-color: var(--ink); }
  .lp-btn-sm { min-height: 38px; font-size: 13.5px; padding: 0 16px; }
  .lp-btn-block { width: 100%; }

  /* TYPO */
  .lp-label { font-size: 12px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: var(--gold); margin: 0 0 14px; }
  .lp-h1 { font-family: 'Playfair Display', Georgia, serif; font-size: clamp(38px, 5vw, 60px); font-weight: 700; line-height: 1.08; letter-spacing: -0.02em; margin: 0 0 22px; color: var(--ink); }
  .lp-h2 { font-family: 'Playfair Display', Georgia, serif; font-size: clamp(28px, 3.2vw, 40px); font-weight: 700; line-height: 1.15; letter-spacing: -0.01em; margin: 0 0 16px; color: var(--ink); }
  .lp-h3 { font-size: 16px; font-weight: 700; color: var(--ink); margin: 0 0 6px; }
  .lp-p { color: var(--text); margin: 0 0 16px; max-width: 62ch; }
  .lp-small { font-size: 13.5px; color: var(--muted); margin: 0; }

  /* SECTIONS */
  .lp-sec { padding: 96px 0; border-top: 1px solid var(--line); }
  .lp-sec-alt { background: var(--alt); border-top: 0; }
  @media (max-width: 640px) { .lp-sec { padding: 64px 0; } }
  .lp-intro { max-width: 680px; margin-bottom: 48px; }

  /* HERO */
  .lp-hero { padding: 72px 0 88px; }
  .lp-hero-grid { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, .9fr); gap: 64px; align-items: center; }
  @media (max-width: 900px) { .lp-hero { padding: 40px 0 64px; } .lp-hero-grid { grid-template-columns: 1fr; gap: 40px; } }
  .lp-hero-sub { font-size: 17px; color: var(--text); max-width: 54ch; margin: 0 0 32px; }
  .lp-actions { display: flex; gap: 12px; flex-wrap: wrap; }
  .lp-facts { display: grid; grid-template-columns: repeat(3, auto); justify-content: start; gap: 0 40px; margin: 44px 0 0; padding: 22px 0 0; border-top: 1px solid var(--line); }
  @media (max-width: 560px) { .lp-facts { grid-template-columns: 1fr; gap: 14px; } }
  .lp-facts dt { font-size: 12px; color: var(--muted); margin-bottom: 2px; }
  .lp-facts dd { margin: 0; font-size: 14.5px; font-weight: 600; color: var(--ink); }
  .lp-hero-photo { aspect-ratio: 4 / 5; border-radius: 8px; overflow: hidden; background: #eef0f3; }
  .lp-hero-photo img { width: 100%; height: 100%; object-fit: cover; object-position: center 25%; }
  @media (max-width: 900px) { .lp-hero-photo { aspect-ratio: 4 / 3; max-height: 460px; } }

  /* FIGURES */
  .lp-figure { margin: 0; }
  .lp-figure-img { border-radius: 8px; overflow: hidden; background: #e5e7eb; }
  .lp-figure-img img { width: 100%; height: 100%; object-fit: cover; }
  .lp-figure figcaption { font-size: 13px; color: var(--muted); margin-top: 10px; }
  .lp-ratio-43 { aspect-ratio: 4 / 3; }

  /* A PROPOS */
  .lp-two { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 64px; align-items: start; }
  @media (max-width: 900px) { .lp-two { grid-template-columns: 1fr; gap: 36px; } }
  .lp-values { display: grid; grid-template-columns: 1fr 1fr; gap: 28px 32px; margin-top: 32px; }
  @media (max-width: 520px) { .lp-values { grid-template-columns: 1fr; } }
  .lp-values > div { border-top: 2px solid var(--ink); padding-top: 14px; }
  .lp-values p { font-size: 14px; color: var(--text); margin: 0; }

  /* IMPLANTATIONS */
  .lp-place-list { list-style: none; margin: 8px 0 0; padding: 0; border-top: 1px solid var(--line); }
  .lp-place { display: grid; grid-template-columns: 170px 1fr; gap: 6px 24px; padding: 20px 0; border-bottom: 1px solid var(--line); }
  @media (max-width: 520px) { .lp-place { grid-template-columns: 1fr; } }
  .lp-place-name { font-family: 'Playfair Display', Georgia, serif; font-size: 22px; font-weight: 700; color: var(--ink); line-height: 1.2; }
  .lp-place-country { font-size: 13px; color: var(--muted); }
  .lp-place-type { font-size: 12px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--ink); margin-bottom: 2px; }
  .lp-place.hq .lp-place-type { color: var(--gold); }
  .lp-place p { font-size: 14px; color: var(--text); margin: 0; }

  /* OFFRE */
  .lp-photo-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-bottom: 56px; }
  @media (max-width: 760px) { .lp-photo-row { grid-template-columns: 1fr; } }
  .lp-photo-row .lp-figure-img { aspect-ratio: 4 / 3; }
  .lp-grid3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0 40px; }
  @media (max-width: 900px) { .lp-grid3 { grid-template-columns: 1fr 1fr; } }
  @media (max-width: 560px) { .lp-grid3 { grid-template-columns: 1fr; } }
  .lp-item { padding: 22px 0; border-top: 1px solid #d1d5db; }
  .lp-item-num { font-size: 12px; font-weight: 600; color: var(--gold); margin-bottom: 8px; }
  .lp-item p { font-size: 14px; color: var(--text); margin: 0; }

  /* OPPORTUNITE */
  .lp-table-wrap { position: relative; border: 1px solid var(--line); border-radius: 8px; overflow-x: auto; background: #fff; }
  .lp-table { width: 100%; border-collapse: collapse; }
  .lp-table th { text-align: left; font-size: 12px; font-weight: 600; color: var(--muted); padding: 12px 18px; background: #f9fafb; border-bottom: 1px solid var(--line); }
  .lp-table td { padding: 14px 18px; border-bottom: 1px solid var(--line); vertical-align: top; font-size: 14px; color: var(--text); }
  .lp-table tr:last-child td { border-bottom: 0; }
  .lp-table .num { text-align: right; font-variant-numeric: tabular-nums; }
  .lp-table .lvl, .lp-table .amount { font-weight: 700; color: var(--ink); }
  .lp-table .amount { white-space: nowrap; }
  .lp-table .split { font-size: 12px; color: var(--muted); }
  .lp-table tr.top td { background: #faf7ef; }
  @media (max-width: 640px) { .lp-table th, .lp-table td { padding: 12px 12px; } .lp-col-bonus { display: none; } }
  .lp-note { font-size: 14px; color: var(--text); margin: 20px 0 0; }
  .lp-legal { font-size: 12.5px; color: var(--muted); margin: 14px 0 0; max-width: 90ch; }

  /* TEMOIGNAGES */
  .lp-quotes { display: grid; grid-template-columns: minmax(0, .8fr) minmax(0, 1.2fr); gap: 64px; align-items: start; }
  @media (max-width: 900px) { .lp-quotes { grid-template-columns: 1fr; gap: 36px; } }
  .lp-quotes .lp-figure-img { aspect-ratio: 4 / 5; }
  @media (max-width: 900px) { .lp-quotes .lp-figure-img { aspect-ratio: 4 / 3; } .lp-quotes .lp-figure-img img { object-position: center 20%; } }
  .lp-quote { margin: 0; padding: 26px 0; border-bottom: 1px solid #d1d5db; }
  .lp-quote:first-of-type { padding-top: 0; }
  .lp-quote p { font-family: 'Playfair Display', Georgia, serif; font-size: 20px; line-height: 1.5; color: var(--ink); margin: 0 0 12px; }
  .lp-quote footer { font-size: 13.5px; color: var(--muted); }
  .lp-quote footer strong { color: var(--ink); font-weight: 600; }

  /* ETAPES */
  .lp-steps { display: grid; grid-template-columns: repeat(4, 1fr); gap: 32px; list-style: none; margin: 0; padding: 0; }
  @media (max-width: 900px) { .lp-steps { grid-template-columns: 1fr 1fr; } }
  @media (max-width: 520px) { .lp-steps { grid-template-columns: 1fr; gap: 24px; } }
  .lp-step { border-top: 2px solid var(--ink); padding-top: 16px; }
  .lp-step-n { font-size: 13px; font-weight: 600; color: var(--gold); margin-bottom: 6px; }
  .lp-step p { font-size: 14px; color: var(--text); margin: 0; }

  /* ACCES */
  .lp-access { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  @media (max-width: 720px) { .lp-access { grid-template-columns: 1fr; } }
  .lp-access-card { border: 1px solid var(--line); border-radius: 8px; padding: 28px; display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
  .lp-access-card .lp-btn { margin-top: 14px; }

  /* CONTACT */
  .lp-contact { display: grid; grid-template-columns: minmax(0, .9fr) minmax(0, 1.1fr); gap: 64px; align-items: start; }
  @media (max-width: 900px) { .lp-contact { grid-template-columns: 1fr; gap: 36px; } }
  .lp-info { margin: 28px 0 0; padding: 0; }
  .lp-info > div { padding: 16px 0; border-top: 1px solid #d1d5db; }
  .lp-info dt { font-size: 12px; color: var(--muted); margin-bottom: 2px; }
  .lp-info dd { margin: 0; font-weight: 600; color: var(--ink); }
  .lp-info a { color: var(--ink); }
  .lp-form-card { background: #fff; border: 1px solid var(--line); border-radius: 8px; padding: 32px; }
  @media (max-width: 520px) { .lp-form-card { padding: 22px; } }
  .lp-contact-form { display: flex; flex-direction: column; }
  .lp-form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  @media (max-width: 480px) { .lp-form-row { grid-template-columns: 1fr; } }
  .lp-field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
  .lp-field label { font-size: 13px; font-weight: 600; color: var(--ink); }
  .lp-field input, .lp-field select, .lp-field textarea { font-family: inherit; font-size: 14px; color: var(--ink); border: 1px solid #d1d5db; border-radius: 6px; padding: 10px 12px; background: #fff; min-height: 44px; width: 100%; }
  .lp-field textarea { resize: vertical; min-height: 100px; }
  .lp-field input:focus, .lp-field select:focus, .lp-field textarea:focus { outline: none; border-color: var(--gold); box-shadow: 0 0 0 3px rgba(161,126,54,.15); }
  .lp-field input::placeholder, .lp-field textarea::placeholder { color: #9ca3af; }
  .lp-form-note { font-size: 12.5px; color: var(--muted); margin: 12px 0 0; }
  .lp-form-error { font-size: 13px; font-weight: 600; color: #b91c1c; background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; padding: 10px 12px; margin: 0 0 14px; }
  .lp-form-success { padding: 24px 0; }
  .lp-success-title { font-family: 'Playfair Display', Georgia, serif; font-size: 24px; margin: 0 0 8px; color: var(--ink); }
  .lp-success-desc { color: var(--text); margin: 0; }

  /* FOOTER */
  .lp-footer { border-top: 1px solid var(--line); padding: 56px 0 28px; }
  .lp-footer-grid { display: grid; grid-template-columns: 1.6fr 1fr 1fr 1.2fr; gap: 40px; margin-bottom: 40px; }
  @media (max-width: 900px) { .lp-footer-grid { grid-template-columns: 1fr 1fr; } }
  @media (max-width: 520px) { .lp-footer-grid { grid-template-columns: 1fr; } }
  .lp-footer-title { font-size: 12px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: var(--ink); margin: 0 0 14px; }
  .lp-footer-links { display: flex; flex-direction: column; gap: 9px; align-items: flex-start; }
  .lp-footer-link { font-family: inherit; font-size: 14px; color: var(--muted); background: none; border: 0; padding: 0; cursor: pointer; text-decoration: none; text-align: left; }
  .lp-footer-link:hover { color: var(--ink); }
  .lp-legal-links { display: flex; flex-wrap: wrap; gap: 6px 18px; align-items: center; }
  .lp .lp-legal-links a, .lp .lp-form-note a { min-height: 0; color: inherit; text-decoration: underline; text-underline-offset: 3px; }
  .lp .lp-legal-links a:hover { color: var(--ink); }
  .lp-footer-legal { border-top: 1px solid var(--line); padding-top: 22px; display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; font-size: 12.5px; color: var(--muted); }
`;

/* ── page ─────────────────────────────────────────────────────────────────── */

const NAV = [
  { id: 'a-propos', label: 'À propos' },
  { id: 'implantations', label: 'Implantations' },
  { id: 'produits', label: 'Notre offre' },
  { id: 'opportunite', label: 'Opportunité' },
  { id: 'contact', label: 'Contact' },
];

export default function HomePage() {
  const navigate = useNavigate();
  usePageScroll();
  const [menuOpen, setMenuOpen] = useState(false);

  const scrollTo = (id: string) => {
    setMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <>
      <PageSEO
        title="Entreprise Bénie Network — Réseau MLM & solutions de commerce"
        description={`Entreprise Bénie Network (EBN) — réseau de marketing relationnel avec siège social à ${SIEGE.libelle} et boutiques en RDC (Goma, Bukavu, Kinshasa). Plan de rémunération transparent à 8 niveaux.`}
        canonical="/"
        ogType="website"
      />
      <Helmet>
        <script type="application/ld+json">{JSON.stringify({
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'Organization',
              '@id': `${SITE_URL}/#organization`,
              'name': 'Entreprise Bénie Network sarl',
              'alternateName': 'EBN Network',
              'url': SITE_URL,
              'logo': `${SITE_URL}/assets/Progress business logo.png`,
              'description': `Réseau de marketing relationnel — siège social à ${SIEGE.libelle}, boutiques en RDC.`,
              'address': { '@type': 'PostalAddress', 'addressCountry': SIEGE.codePays, 'addressLocality': SIEGE.ville },
              'location': IMPLANTATIONS.slice(1).map(s => ({
                '@type': 'Place',
                'name': `EBN ${s.lieu}`,
                'address': { '@type': 'PostalAddress', 'addressCountry': 'CD', 'addressLocality': s.lieu },
              })),
              'areaServed': ['Russie', 'Goma', 'Bukavu', 'Kinshasa', 'Grands Lacs'],
              'contactPoint': { '@type': 'ContactPoint', 'contactType': 'customer service', 'availableLanguage': ['French'] },
              'sameAs': ['https://wa.me/243974752784'],
            },
            {
              '@type': 'WebSite',
              'name': 'EBN Network',
              'url': SITE_URL,
              'inLanguage': 'fr',
              'publisher': { '@id': `${SITE_URL}/#organization` },
            },
          ],
        })}</script>
      </Helmet>

      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="lp">
        <a href={WHATSAPP_LINK} target="_blank" rel="noopener noreferrer" className="lp-wa-float" aria-label="Contacter EBN sur WhatsApp">
          <WhatsAppIcon size={26} />
        </a>

        {/* NAV */}
        <header className="lp-nav">
          <div className="lp-wrap lp-nav-bar">
            <a href="/" className="lp-brand" aria-label="Entreprise Bénie Network - Accueil">
              <img src="/assets/Progress business logo.png" alt="" />
              <span className="lp-brand-name">EBN <span>Network</span></span>
            </a>
            <nav className="lp-nav-links" aria-label="Navigation principale">
              {NAV.map(n => <button key={n.id} className="lp-nav-link" onClick={() => scrollTo(n.id)}>{n.label}</button>)}
              <button className="lp-nav-link" onClick={() => navigate('/login')}>Staff</button>
              <button className="lp-btn lp-btn-dark lp-btn-sm" onClick={() => navigate('/portal/login')}>Connexion membre</button>
            </nav>
            <button className="lp-burger" onClick={() => setMenuOpen(o => !o)} aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'} aria-expanded={menuOpen} aria-controls="lp-menu">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                {menuOpen
                  ? <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>
                  : <><line x1="3" y1="7" x2="21" y2="7" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="17" x2="21" y2="17" /></>}
              </svg>
            </button>
          </div>
          {menuOpen && (
            <nav id="lp-menu" className="lp-menu" aria-label="Navigation mobile">
              <div className="lp-wrap">
                {NAV.map(n => <button key={n.id} className="lp-menu-link" onClick={() => scrollTo(n.id)}>{n.label}</button>)}
                <button className="lp-menu-link" onClick={() => { setMenuOpen(false); navigate('/login'); }}>Espace staff</button>
                <button className="lp-btn lp-btn-dark" onClick={() => { setMenuOpen(false); navigate('/portal/login'); }}>Connexion membre</button>
              </div>
            </nav>
          )}
        </header>

        <main>
          {/* HERO */}
          <section className="lp-hero" aria-labelledby="lp-hero-title">
            <div className="lp-wrap lp-hero-grid">
              <div>
                <p className="lp-label">Entreprise Bénie Network</p>
                <h1 id="lp-hero-title" className="lp-h1">Un réseau commercial bâti sur des produits réels.</h1>
                <p className="lp-hero-sub">
                  EBN accompagne commerçants et entrepreneurs en RDC : des boutiques à Goma, Bukavu
                  et Kinshasa, une formation à l'inscription et un plan de rémunération publié,
                  consultable à tout moment.
                </p>
                <div className="lp-actions">
                  <button className="lp-btn lp-btn-dark" onClick={() => scrollTo('contact')} id="hero-cta-contact">Devenir partenaire</button>
                  <button className="lp-btn lp-btn-line" onClick={() => scrollTo('opportunite')} id="hero-cta-produits">Voir le plan de carrière</button>
                </div>
                <dl className="lp-facts">
                  {FAITS.map(f => <div key={f.k}><dt>{f.k}</dt><dd>{f.v}</dd></div>)}
                </dl>
              </div>
              <div className="lp-hero-photo">
                <Photo src={photo('1611432579402-7037e3e2c1e4')} alt="Entrepreneure souriante tenant une tablette" eager />
              </div>
            </div>
          </section>

          {/* A PROPOS */}
          <section className="lp-sec lp-sec-alt" id="a-propos" aria-labelledby="lp-about-title">
            <div className="lp-wrap lp-two">
              <div>
                <p className="lp-label">À propos</p>
                <h2 id="lp-about-title" className="lp-h2">Une entreprise russe, au service du commerce en RDC.</h2>
                <p className="lp-p">
                  Entreprise Bénie Network est une société de marketing relationnel dont le siège social
                  est établi à {SIEGE.libelle}. Ses équipes opérationnelles travaillent en République
                  démocratique du Congo, au plus près des membres.
                </p>
                <p className="lp-p">
                  Notre mission : créer de la valeur réelle en combinant la vente de produits et services
                  avec un programme de développement de réseau transparent.
                </p>
                <div className="lp-values">
                  {VALEURS.map(v => (
                    <div key={v.titre}>
                      <h3 className="lp-h3">{v.titre}</h3>
                      <p>{v.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
              <figure className="lp-figure">
                <div className="lp-figure-img lp-ratio-43">
                  <Photo src={photo('1573496130407-57329f01f769')} alt="Réunion de travail autour d'une table" />
                </div>
                <figcaption>Chaque nouveau membre est reçu, formé et suivi par un conseiller.</figcaption>
              </figure>
            </div>
          </section>

          {/* IMPLANTATIONS */}
          <section className="lp-sec" id="implantations" aria-labelledby="lp-places-title">
            <div className="lp-wrap lp-two">
              <figure className="lp-figure">
                <div className="lp-figure-img lp-ratio-43">
                  <Photo src={photo('1541447271487-09612b3f49f7')} alt={`Tours du quartier d'affaires de ${SIEGE.ville}`} />
                </div>
                <figcaption>{SIEGE.ville}, siège social d'EBN.</figcaption>
              </figure>
              <div>
                <p className="lp-label">Implantations</p>
                <h2 id="lp-places-title" className="lp-h2">Siège à {SIEGE.ville}, boutiques en RDC.</h2>
                <p className="lp-p">
                  La direction est assurée depuis la Russie. Sur le terrain, nos boutiques accueillent
                  et accompagnent les membres au quotidien.
                </p>
                <ul className="lp-place-list">
                  {IMPLANTATIONS.map((s, i) => (
                    <li key={s.lieu} className={`lp-place${i === 0 ? ' hq' : ''}`}>
                      <div>
                        <div className="lp-place-name">{s.lieu}</div>
                        <div className="lp-place-country">{s.pays}</div>
                      </div>
                      <div>
                        <div className="lp-place-type">{s.type}</div>
                        <p>{s.desc}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          {/* OFFRE */}
          <section className="lp-sec lp-sec-alt" id="produits" aria-labelledby="lp-prod-title">
            <div className="lp-wrap">
              <div className="lp-intro">
                <p className="lp-label">Notre offre</p>
                <h2 id="lp-prod-title" className="lp-h2">Des produits, une formation, un réseau.</h2>
                <p className="lp-p">
                  Chez EBN, le marketing relationnel commence par une valeur réelle : des produits utiles,
                  une communauté engagée et un accompagnement pour grandir durablement.
                </p>
              </div>
              <div className="lp-photo-row">
                {OFFRE_PHOTOS.map(p => (
                  <figure key={p.legende} className="lp-figure">
                    <div className="lp-figure-img"><Photo src={p.img} alt={p.alt} /></div>
                    <figcaption>{p.legende}</figcaption>
                  </figure>
                ))}
              </div>
              <div className="lp-grid3">
                {PRODUITS.map(p => (
                  <div key={p.num} className="lp-item">
                    <div className="lp-item-num">{p.num}</div>
                    <h3 className="lp-h3">{p.nom}</h3>
                    <p>{p.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* OPPORTUNITE */}
          <section className="lp-sec" id="opportunite" aria-labelledby="lp-opp-title">
            <div className="lp-wrap">
              <div className="lp-intro">
                <p className="lp-label">Opportunité</p>
                <h2 id="lp-opp-title" className="lp-h2">8 niveaux de carrière, un barème public.</h2>
                <p className="lp-p">
                  Chaque niveau demande 4 filleuls actifs. Une matrice complète donne droit à la commission
                  (60 % retirable, 40 % réinvesti automatiquement) et à la promotion. Les montants sont
                  configurés dans le système : rien n'est négocié à part.
                </p>
              </div>
              <div className="lp-table-wrap">
                <table className="lp-table">
                  <caption className="lp-visually-hidden">Barème des 8 niveaux de carrière EBN</caption>
                  <thead>
                    <tr>
                      <th scope="col">Niveau</th>
                      <th scope="col" className="lp-col-bonus">Bonus d'incitation</th>
                      <th scope="col" className="num">Commission</th>
                    </tr>
                  </thead>
                  <tbody>
                    {OPPORTUNITE.map(o => (
                      <tr key={o.niveau} className={o.niveau === 'Crown Ambassadeur' ? 'top' : undefined}>
                        <td>
                          <div className="lvl">{o.niveau}</div>
                          <div className="split">{o.filleuls} filleuls par matrice</div>
                        </td>
                        <td className="lp-col-bonus">{o.bonus}</td>
                        <td className="num">
                          <div className="amount">{o.commission}</div>
                          <div className="split">{o.systeme} retirable · {o.retour} réinvesti</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="lp-note">
                Total des 8 niveaux : <strong>122 256.60 USD</strong>, dont 73 354 USD retirables
                et 48 902.60 USD réinvestis automatiquement dans le réseau.
              </p>
              <p className="lp-legal">
                Mention légale : les montants présentés sont les maximums par niveau. Les résultats réels
                dépendent de l'engagement et du développement du réseau de chaque participant. Aucune
                garantie de revenu n'est faite. La vente de produits et services est le fondement du programme.
              </p>
            </div>
          </section>

          {/* TEMOIGNAGES */}
          <section className="lp-sec lp-sec-alt" id="temoignages" aria-labelledby="lp-temo-title">
            <div className="lp-wrap lp-quotes">
              <figure className="lp-figure">
                <div className="lp-figure-img">
                  <Photo src="/assets/temoignage-900.jpg" alt="Partenaire EBN présentant des pagnes" />
                </div>
                <figcaption>Les pagnes, premier bonus du niveau Builder.</figcaption>
              </figure>
              <div>
                <p className="lp-label">Témoignages</p>
                <h2 id="lp-temo-title" className="lp-h2" style={{ marginBottom: 32 }}>Ils ont rejoint le réseau.</h2>
                {TEMOIGNAGES.map(t => (
                  <blockquote key={t.nom} className="lp-quote">
                    <p>« {t.texte} »</p>
                    <footer><strong>{t.nom}</strong>, {t.ville} — {t.role}</footer>
                  </blockquote>
                ))}
              </div>
            </div>
          </section>

          {/* COMMENT REJOINDRE */}
          <section className="lp-sec" id="comment-rejoindre" aria-labelledby="lp-steps-title">
            <div className="lp-wrap">
              <div className="lp-intro">
                <p className="lp-label">Comment rejoindre</p>
                <h2 id="lp-steps-title" className="lp-h2">De visiteur à partenaire, en 4 étapes.</h2>
              </div>
              <ol className="lp-steps">
                {ETAPES.map(e => (
                  <li key={e.n} className="lp-step">
                    <div className="lp-step-n">Étape {e.n}</div>
                    <h3 className="lp-h3">{e.titre}</h3>
                    <p>{e.desc}</p>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          {/* ACCES */}
          <section className="lp-sec" id="acces" aria-labelledby="lp-access-title">
            <div className="lp-wrap">
              <div className="lp-intro" style={{ marginBottom: 32 }}>
                <p className="lp-label">Accès</p>
                <h2 id="lp-access-title" className="lp-h2">Votre espace.</h2>
              </div>
              <div className="lp-access">
                <div className="lp-access-card">
                  <h3 className="lp-h3" style={{ fontSize: 19 }}>Portail membre</h3>
                  <p className="lp-small">Achats, points fidélité, filleuls et portefeuille.</p>
                  <button className="lp-btn lp-btn-dark" onClick={() => navigate('/portal/login')} id="portal-client">Accéder au portail</button>
                </div>
                <div className="lp-access-card">
                  <h3 className="lp-h3" style={{ fontSize: 19 }}>Espace employé</h3>
                  <p className="lp-small">Gérants, agents et superviseurs : caisse, stocks, clients, rapports.</p>
                  <button className="lp-btn lp-btn-line" onClick={() => navigate('/login')} id="portal-employe">Se connecter</button>
                </div>
              </div>
            </div>
          </section>

          {/* CONTACT */}
          <section className="lp-sec lp-sec-alt" id="contact" aria-labelledby="lp-contact-title">
            <div className="lp-wrap lp-contact">
              <div>
                <p className="lp-label">Contact</p>
                <h2 id="lp-contact-title" className="lp-h2">Parlons de votre projet.</h2>
                <p className="lp-p">WhatsApp reste le moyen le plus rapide de nous joindre. Un conseiller vous répond sous 24h.</p>
                <a href={WHATSAPP_LINK} target="_blank" rel="noopener noreferrer" className="lp-btn lp-btn-dark" id="contact-whatsapp">
                  <WhatsAppIcon size={18} /> Écrire sur WhatsApp
                </a>
                <dl className="lp-info">
                  <div><dt>Siège social</dt><dd>{SIEGE.libelle}</dd></div>
                  <div><dt>Boutiques</dt><dd>Goma · Bukavu · Kinshasa (RDC)</dd></div>
                  <div><dt>WhatsApp Business</dt><dd><a href={WHATSAPP_LINK} target="_blank" rel="noopener noreferrer">{WHATSAPP_NUMBER}</a></dd></div>
                </dl>
              </div>
              <div className="lp-form-card">
                <ContactForm />
              </div>
            </div>
          </section>
        </main>

        {/* FOOTER */}
        <footer className="lp-footer">
          <div className="lp-wrap">
            <div className="lp-footer-grid">
              <div>
                <div className="lp-brand" style={{ marginBottom: 14 }}>
                  <img src="/assets/Progress business logo.png" alt="" />
                  <span className="lp-brand-name">EBN <span>Network</span></span>
                </div>
                <p className="lp-small" style={{ maxWidth: 320 }}>
                  Entreprise Bénie Network — réseau de marketing relationnel. Produits et services
                  réels, plan de rémunération transparent.
                </p>
              </div>
              <div>
                <p className="lp-footer-title">Navigation</p>
                <div className="lp-footer-links">
                  {NAV.map(n => <button key={n.id} className="lp-footer-link" onClick={() => scrollTo(n.id)}>{n.label}</button>)}
                </div>
              </div>
              <div>
                <p className="lp-footer-title">Espaces</p>
                <div className="lp-footer-links">
                  <button className="lp-footer-link" onClick={() => navigate('/portal/login')}>Portail membre</button>
                  <button className="lp-footer-link" onClick={() => navigate('/login')}>Espace employé</button>
                  <a className="lp-footer-link" href={WHATSAPP_LINK} target="_blank" rel="noopener noreferrer">WhatsApp</a>
                </div>
              </div>
              <div>
                <p className="lp-footer-title">Adresses</p>
                <p className="lp-small">
                  <strong style={{ color: 'var(--ink)' }}>Siège social</strong><br />{SIEGE.libelle}<br /><br />
                  <strong style={{ color: 'var(--ink)' }}>Boutiques</strong><br />Goma · Bukavu · Kinshasa
                </p>
              </div>
            </div>
            <div className="lp-footer-legal">
              <span>Entreprise Bénie Network · Siège social : {SIEGE.libelle}. Les résultats varient selon l'engagement ; aucune garantie de revenu.</span>
              <nav className="lp-legal-links" aria-label="Informations légales">
                <Link to="/legal/mentions-legales">Mentions légales</Link>
                <Link to="/legal/confidentialite">Confidentialité</Link>
                <Link to="/legal/conditions">Conditions générales</Link>
                <Link to="/legal/cookies">Cookies</Link>
                <span>© {new Date().getFullYear()} EBN Network</span>
              </nav>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
