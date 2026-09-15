/**
 * Configuration SEO centralisée — source unique du domaine.
 *
 * En production, définir VITE_SITE_URL (ex: https://ebnnetwork.onrender.com).
 * Le défaut reprend le domaine canonique déjà utilisé dans tout le projet
 * (index.html, PageSEO, JSON-LD) — aucune invention.
 *
 * NOTE: les fichiers statiques public/robots.txt et public/sitemap.xml
 * ne peuvent pas lire les variables d'env (copiés tels quels). Ils sont
 * alignés manuellement sur ce même domaine — à mettre à jour ensemble.
 */
export const SITE_NAME = 'EBN Network';

export const SITE_URL = (import.meta.env.VITE_SITE_URL ?? 'https://ebnnetwork.onrender.com').replace(/\/+$/, '');

export const OG_IMAGE = `${SITE_URL}/og-image.svg`;

export const SITE_DESCRIPTION =
  'Caisse POS, gestion des stocks, réseau MLM à 8 niveaux pour commerçants à Goma, Bukavu et Kinshasa — RDC.';
