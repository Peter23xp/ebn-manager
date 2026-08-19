import { Helmet } from 'react-helmet-async';

const SITE_NAME = 'EBN Network';
const SITE_URL  = 'https://ebnnetwork.onrender.com';
const OG_IMAGE  = `${SITE_URL}/og-image.svg`;

interface PageSEOProps {
  title?: string;
  description?: string;
  canonical?: string;
  noindex?: boolean;
  ogType?: 'website' | 'article';
}

export function PageSEO({
  title,
  description = 'Caisse POS, gestion des stocks, réseau MLM à 8 niveaux pour commerçants à Goma, Bukavu et Kinshasa — RDC.',
  canonical,
  noindex = false,
  ogType = 'website',
}: PageSEOProps) {
  const fullTitle = title
    ? `${title} | ${SITE_NAME}`
    : `${SITE_NAME} — Gestion Commerciale Multi-Sites | RDC`;
  const canonicalUrl = canonical ? `${SITE_URL}${canonical}` : undefined;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      {noindex && <meta name="robots" content="noindex, nofollow" />}
      {!noindex && <meta name="robots" content="index, follow" />}
      {canonicalUrl && <link rel="canonical" href={canonicalUrl} />}

      {/* Open Graph */}
      <meta property="og:type"         content={ogType} />
      <meta property="og:title"        content={fullTitle} />
      <meta property="og:description"  content={description} />
      <meta property="og:site_name"    content={SITE_NAME} />
      {canonicalUrl && <meta property="og:url" content={canonicalUrl} />}
      <meta property="og:image"        content={OG_IMAGE} />
      <meta property="og:image:width"  content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:locale"       content="fr_CD" />

      {/* Twitter Card */}
      <meta name="twitter:card"        content="summary_large_image" />
      <meta name="twitter:title"       content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image"       content={OG_IMAGE} />
    </Helmet>
  );
}
