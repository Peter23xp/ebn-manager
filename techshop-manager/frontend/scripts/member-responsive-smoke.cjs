const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const puppeteer = require('../../backend/node_modules/puppeteer');

// Reuse the existing synthetic financial fixture without running its harness.
const fixture = fs.readFileSync(path.join(__dirname, 'progressive-ui-smoke.cjs'), 'utf8');
const { progress, member, summaries } = new Function(fixture.slice(fixture.indexOf('const builder ='), fixture.indexOf('async function run()')) + '\nreturn { progress, member, summaries };')();
progress.matrices = summaries.map(s => ({ id: s.matrixId, niveau: { id: s.generation, ordre: s.generation, nom: s.levelName }, filleulsValides: s.accountedPositions, requiredPositions: s.capacity, positions: [] }));
progress.filleuls = [{ ...member, id: 'referral', dateActivation: '2026-09-21', progression: progress.progression }];
progress.commissionsByStatut = { EN_ATTENTE: { count: 2 }, PAYEE: { count: 1 } };
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'node_modules/.cache/member-responsive');

async function run() {
  const { createServer } = await import('vite');
  const { default: react } = await import('@vitejs/plugin-react');
  const server = await createServer({ root, configFile: false, envFile: false, plugins: [react()], resolve: { alias: { '@': path.join(root, 'src') } }, define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/api/v1') }, server: { host: '127.0.0.1', port: 5197, strictPort: true, hmr: false }, logLevel: 'error' });
  await server.listen();
  let browser;
  try {
    fs.mkdirSync(output, { recursive: true });
    browser = await puppeteer.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
    for (const width of [320, 390, 768, 1024, 1440]) {
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.setViewport({ width, height: 900 });
      await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
      await page.evaluateOnNewDocument(() => localStorage.setItem('ebn_auth_v1', JSON.stringify({ user: { id: 'synthetic-client', role: 'SUPER_ADMIN', prenom: 'Aline', nom: 'Démonstration', siteId: 'synthetic-site' }, accessToken: 'synthetic-only' })));
      await page.setRequestInterception(true);
      page.on('request', request => {
        const url = new URL(request.url());
        if (url.origin !== 'http://127.0.0.1:5197') return request.abort();
        if (!url.pathname.startsWith('/api/')) return request.continue();
        if (request.method() !== 'GET') { errors.push('Unexpected mutation'); return request.abort(); }
        const data = url.pathname.endsWith('/progress') ? progress : { total: 0, notifications: [], unreadCount: 0 };
        return request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
      });
      await page.goto(`http://127.0.0.1:5197/mlm/members/${member.id}`);
      await page.waitForSelector('[aria-label="Niveau de matrice"]');
      await page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {}))));
      await page.screenshot({ path: path.join(output, `member-${width}.png`), fullPage: true });
      const dimensions = await page.evaluate(() => {
        const main = document.querySelector('main');
        return { width: main.clientWidth, content: main.scrollWidth };
      });
      console.log(width, dimensions);
      assert.ok(dimensions.content <= dimensions.width + 1, `Page overflow at ${width}px`);
      await page.evaluate(() => [...document.querySelectorAll('h2')].find(h => h.textContent.includes('Parcours de carrière')).scrollIntoView());
      await page.screenshot({ path: path.join(output, `career-${width}.png`) });
      const buttons = await page.$$('[aria-label="Niveau de matrice"] button');
      assert.equal(buttons.length, 8);
      await buttons[7].click();
      await page.waitForFunction(() => [...document.querySelectorAll('h2')].some(h => h.textContent.includes('Génération 8')));
      assert.deepEqual(errors, []);
      console.log(`PASS ${width}px: no page overflow, all eight generations selectable`);
      await page.close();
    }
  } finally { if (browser) await browser.close(); await server.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
