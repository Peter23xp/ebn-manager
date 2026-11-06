/**
 * Pré-rendu des pages publiques (exécuté par `npm run build`, après les deux
 * builds Vite client + SSR).
 *
 * Pourquoi : l'application est une SPA React. Sans ce script, chaque URL
 * renvoie `<div id="root"></div>` vide ; les robots qui n'exécutent pas le
 * JavaScript (ChatGPT/GPTBot, ClaudeBot, PerplexityBot, Bing en partie,
 * aperçus WhatsApp / Facebook / LinkedIn) ne voient alors ni texte ni balises.
 *
 * Produit dans dist/ :
 *   index.html                 accueil pré-rendu (texte + balises + JSON-LD)
 *   legal/<slug>/index.html    pages légales pré-rendues
 *   404.html                   page introuvable (servie avec un vrai statut 404 par Vercel)
 *   app.html                   coquille vide de l'application (connexion, tableau de bord…)
 *   robots.txt, sitemap.xml, llms.txt  générés à partir de SITE_URL (src/lib/site.ts)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const ssrDir = path.join(root, 'dist-ssr');

// Le code de l'application lit localStorage / navigator au chargement des
// stores ; on fournit des équivalents neutres pour Node.
const memory = new Map();
globalThis.localStorage ??= {
  getItem: (k) => (memory.has(k) ? memory.get(k) : null),
  setItem: (k, v) => memory.set(k, String(v)),
  removeItem: (k) => memory.delete(k),
  clear: () => memory.clear(),
  key: () => null,
  length: 0,
};
globalThis.sessionStorage ??= globalThis.localStorage;
if (typeof globalThis.navigator === 'undefined' || !('onLine' in globalThis.navigator)) {
  Object.defineProperty(globalThis, 'navigator', {
    value: { ...(globalThis.navigator ?? {}), onLine: true, userAgent: 'prerender' },
    configurable: true,
  });
}

const entry = fs.readdirSync(ssrDir).find((f) => /^entry-server\.(m?js)$/.test(f));
if (!entry) throw new Error(`entry-server introuvable dans ${ssrDir}`);
const server = await import(pathToFileURL(path.join(ssrDir, entry)).href);
const { render, PUBLIC_PAGES, LEGAL_SUMMARIES, SITE_URL, SITE_NAME, SIEGE } = server;

const template = fs.readFileSync(path.join(dist, 'index.html'), 'utf-8');
const SEO_BLOCK = /<!--seo-->[\s\S]*?<!--\/seo-->/;
if (!SEO_BLOCK.test(template) || !template.includes('<div id="root"></div>')) {
  throw new Error('index.html : repère <!--seo--> ou <div id="root"></div> manquant');
}

// Coquille de l'application, avant toute modification de index.html.
fs.writeFileSync(path.join(dist, 'app.html'), template);

function page(head, html) {
  return template
    .replace(SEO_BLOCK, head)
    .replace('<div id="root"></div>', `<div id="root">${html}</div>`);
}

function write(rel, content) {
  const file = path.join(dist, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  console.log(`  prerender  ${rel}  (${(Buffer.byteLength(content) / 1024).toFixed(1)} kB)`);
}

function check(url, head, html) {
  const problems = [];
  if (!/<title[^>]*>[^<]+<\/title>/.test(head)) problems.push('titre manquant');
  if (!html.includes('<h1')) problems.push('pas de <h1>');
  if (url !== '/404' && !head.includes(`rel="canonical" href="${SITE_URL}${url === '/' ? '/' : url}"`)) {
    problems.push('canonical incorrect');
  }
  if (problems.length) throw new Error(`Pré-rendu ${url} : ${problems.join(', ')}`);
}

for (const { path: url } of PUBLIC_PAGES) {
  const { html, head } = await render(url);
  check(url, head, html);
  write(url === '/' ? 'index.html' : `${url.slice(1)}/index.html`, page(head, html));
}

{
  const { html, head } = await render('/__page-introuvable__');
  check('/404', head, html);
  write('404.html', page(head, html));
}

const today = new Date().toISOString().slice(0, 10);

write(
  'sitemap.xml',
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${PUBLIC_PAGES.map(
  (p) => `  <url>
    <loc>${SITE_URL}${p.path}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`,
).join('\n')}
</urlset>
`,
);

// Les espaces privés sont exclus pour tous les robots ; les robots IA sont
// explicitement autorisés sur les pages publiques (citation par ChatGPT,
// Claude, Perplexity, Gemini…).
const PRIVATE = [
  '/app.html', '/login', '/reset-password', '/portal/', '/dashboard', '/clients', '/sales',
  '/stocks', '/mlm', '/reports', '/settings', '/support', '/api/',
];
const AI_BOTS = [
  'GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'Claude-User',
  'PerplexityBot', 'Perplexity-User', 'Google-Extended', 'Applebot-Extended', 'CCBot',
];
const rules = PRIVATE.map((p) => `Disallow: ${p}`).join('\n');
write(
  'robots.txt',
  `# Généré par scripts/prerender.mjs — ne pas éditer à la main.
User-agent: *
Allow: /
${rules}

# Robots d'IA : autorisés sur les pages publiques.
${AI_BOTS.map((b) => `User-agent: ${b}`).join('\n')}
Allow: /
${rules}

Sitemap: ${SITE_URL}/sitemap.xml
`,
);

// llms.txt (https://llmstxt.org) : résumé du site destiné aux assistants IA.
write(
  'llms.txt',
  `# ${SITE_NAME} — Entreprise Bénie Network

> Entreprise Bénie Network (EBN) est un réseau de marketing relationnel : boutiques à Goma, Bukavu et Kinshasa (République démocratique du Congo), siège social à ${SIEGE.libelle}. Les membres s'inscrivent en boutique, reçoivent une formation et progressent dans un plan de rémunération publié à 8 niveaux (de Builder à Crown Ambassadeur).

- Site officiel : ${SITE_URL}/
- Contact : WhatsApp +243 974 752 784
- Langue : français

## Pages

- [Accueil](${SITE_URL}/) : présentation d'EBN, implantations, offre, plan de carrière à 8 niveaux, témoignages, étapes d'adhésion et contact.
${LEGAL_SUMMARIES.map((d) => `- [${d.titre}](${SITE_URL}/legal/${d.slug}) : ${d.description}`).join('\n')}

## Espaces privés

Le portail membre (${SITE_URL}/portal/login) et l'espace employé (${SITE_URL}/login) exigent une connexion et ne contiennent pas d'information publique.
`,
);

fs.rmSync(ssrDir, { recursive: true, force: true });
console.log(`Pré-rendu terminé pour ${SITE_URL}`);
