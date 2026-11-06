/// <reference types="node" />
/**
 * Point d'entrée du pré-rendu (build uniquement, jamais chargé dans le
 * navigateur). scripts/prerender.mjs l'importe après `vite build --ssr`
 * pour produire le HTML complet des pages publiques.
 */
import { renderToPipeableStream } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { Writable } from 'node:stream';
import type { HelmetServerState } from 'react-helmet-async';
import { AppRoutes } from './App';
import { Root } from './Root';
import { LEGAL_DOCS } from './pages/legal/LegalPage';
import { SITE_URL, SITE_NAME, SITE_DESCRIPTION, SIEGE } from './lib/site';

export { SITE_URL, SITE_NAME, SITE_DESCRIPTION, SIEGE };

/** Pages publiques indexables, dans l'ordre du sitemap. */
export const PUBLIC_PAGES = [
  { path: '/', title: 'Accueil', priority: '1.0', changefreq: 'monthly' },
  ...LEGAL_DOCS.map((d) => ({
    path: `/legal/${d.slug}`,
    title: d.titre,
    priority: '0.3',
    changefreq: 'yearly',
  })),
];

export const LEGAL_SUMMARIES = LEGAL_DOCS.map((d) => ({ slug: d.slug, titre: d.titre, description: d.description }));

export function render(url: string): Promise<{ html: string; head: string }> {
  const helmetContext: { helmet?: HelmetServerState } = {};

  return new Promise((resolve, reject) => {
    let html = '';
    const sink = new Writable({
      write(chunk, _enc, cb) {
        html += chunk.toString();
        cb();
      },
    });
    sink.on('finish', () => {
      const h = helmetContext.helmet;
      const head = h
        ? [h.title, h.meta, h.link, h.script].map((x) => x.toString()).filter(Boolean).join('\n    ')
        : '';
      resolve({ html, head });
    });

    const stream = renderToPipeableStream(
      <Root helmetContext={helmetContext}>
        <StaticRouter location={url}>
          <AppRoutes />
        </StaticRouter>
      </Root>,
      {
        // On attend que toutes les pages chargées en lazy soient résolues :
        // le HTML final contient le contenu réel, pas le spinner.
        onAllReady() {
          stream.pipe(sink);
        },
        onShellError: reject,
        onError(err) {
          reject(err);
        },
      },
    );
  });
}
