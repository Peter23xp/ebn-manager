/**
 * Configuration SEO centralisée — source unique du domaine.
 *
 * Domaine officiel : https://www.ebnsarl.com (ebnsarl.com redirige vers www).
 * VITE_SITE_URL peut le surcharger, mais il doit rester le domaine public réel :
 * il alimente les canonicals, Open Graph, JSON-LD, robots.txt, sitemap.xml et
 * llms.txt (ces trois fichiers sont générés au build par scripts/prerender.mjs).
 */
export const SITE_NAME = 'EBN Network';

export const SITE_URL = (import.meta.env.VITE_SITE_URL || 'https://www.ebnsarl.com').replace(/\/+$/, '');

export const OG_IMAGE = `${SITE_URL}/og-image.png`;

export const SITE_DESCRIPTION =
  "Entreprise Bénie Network (EBN) : réseau de marketing relationnel avec boutiques à Goma, Bukavu et Kinshasa (RDC) et plan de rémunération publié à 8 niveaux.";

/** Siège social. Modifier ici l'adresse exacte : elle est reprise sur l'accueil, les pages de connexion et le JSON-LD. */
export const SIEGE = {
  ville: 'Moscou',
  pays: 'Russie',
  codePays: 'RU',
  libelle: 'Moscou, Russie',
};
