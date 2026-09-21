const assert = require('node:assert/strict');
const path = require('node:path');
const { mkdir } = require('node:fs/promises');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'node_modules/.cache/progressive-ui');
const origin = 'http://127.0.0.1:5196';
const builder = { id: 1, ordre: 1, nom: 'Builder', couleur: '#f59e0b', requiredPositions: 4, immediateAmount: '24.00', heldAmount: '16.00', totalAmount: '40.00', bonusDescription: '2 pagnes', salaireMensuel: '0.00', salaireActif: false, isActive: true };
const member = { id: 'synthetic-member', matricule: 'TEST-001', statut: 'ACTIF', client: { id: 'synthetic-client', prenom: 'Aline', nom: 'Démonstration', telephone: '243900000001' }, level: builder, recruiter: null, matrixParent: null, position: null };
const row = { matrixId: 'synthetic-matrix', generation: 1, levelName: 'Builder', capacity: 4, currentValidPositions: 1, accountedPositions: 2, budgetTotal: '40.00', budgetImmediate: '24.00', budgetHeld: '16.00', generatedTotal: '20.00', pendingTotal: '10.00', validatedTotal: '0.00', cancelledTotal: '10.00', immediateCredited: '0.00', heldAmount: '0.00', releasableAmount: '0.00', releasedAmount: '0.00', remainingTotal: '20.00', suspendedReason: null };
const summaries = [
  row,
  { ...row, matrixId: 'synthetic-sapphire', generation: 2, levelName: 'Sapphire', capacity: 16, accountedPositions: 1, budgetTotal: '83.33', budgetImmediate: '50.00', budgetHeld: '33.33', generatedTotal: '5.21', pendingTotal: '0.00', validatedTotal: '5.21', cancelledTotal: '0.00', immediateCredited: '3.13', heldAmount: '2.08', remainingTotal: '78.12' },
  ...[['Ruby', 64], ['Emerald', 256], ['Diamond', 1024], ['Crown Diamond', 4096], ['Ambassadeur', 16384], ['Crown Ambassadeur', 65536]].map(([levelName, capacity], index) => ({ ...row, matrixId: `synthetic-${index}`, generation: index + 3, levelName, capacity, suspendedReason: index === 5 ? 'Niveau désactivé — vérification administrative nécessaire.' : null })),
];
const wallet = { id: 'synthetic-wallet', membreId: member.id, membre: member, soldeDisponible: '9.00', soldeDisponibleRetrait: '7.00', soldeReserve: '2.00', soldeReinvesti: '2.08', totalGagne: '5.21', financialSummary: { generatedTotal: '25.21', validatedTotal: '5.21', immediateAmount: '3.13', heldAmount: '2.08', releasableAmount: '0.00', releasedAmount: '0.00' }, reinvestLots: [], progressiveCommissions: summaries };
const commissions = [
  { id: 'synthetic-progress', membre: member, filleul: member, level: builder, montant: '10.00', montantSysteme: '6.00', montantRetour: '4.00', progressFrom: 0, progressTo: 1, origin: 'PROGRESSIVE', calculationVersion: 'v1', statut: 'EN_ATTENTE', createdAt: '2026-09-21T08:00:00Z' },
  { id: 'synthetic-catchup', membre: member, filleul: null, level: builder, montant: '20.00', montantSysteme: '12.00', montantRetour: '8.00', progressFrom: 1, progressTo: 3, origin: 'CATCH_UP', calculationVersion: 'v1', statut: 'EN_ATTENTE', createdAt: '2026-09-21T08:00:00Z' },
  { id: 'synthetic-legacy', membre: member, filleul: member, level: builder, montant: '40.00', montantSysteme: '24.00', montantRetour: '16.00', statut: 'PAYEE', createdAt: '2026-09-17T08:00:00Z' },
];
const progress = { membre: member, progression: { currentLevel: null, nextLevel: builder, currentGeneration: 1, completedPositions: 1, requiredPositions: 4, remainingPositions: 3, progressPercentage: 25, highestLevelAchieved: 0 }, portefeuille: wallet, financialSummary: wallet.financialSummary, progressiveCommissions: summaries, matrices: [], filleuls: [], commissions, reinvestLots: [] };
const meta = { page: 1, limit: 20, total: 0, totalPages: 1 };

async function run() {
  const { createServer } = await import('vite');
  const { default: react } = await import('@vitejs/plugin-react');
  const server = await createServer({ root, configFile: false, envFile: false, plugins: [react()], resolve: { alias: { '@': path.join(root, 'src') } }, define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/api/v1') }, server: { host: '127.0.0.1', port: 5196, strictPort: true, hmr: false }, logLevel: 'error' });
  await server.listen();
  let browser;
  try {
    await mkdir(output, { recursive: true });
    browser = await chromium.launch({ headless: true, channel: 'msedge' });
    for (const width of [320, 390, 768, 1440]) {
      for (const role of ['SUPER_ADMIN', 'CLIENT']) {
        const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
        const errors = [];
        const unexpected = [];
        const apiRequests = [];
        await context.addInitScript(role => localStorage.setItem('ebn_auth_v1', JSON.stringify({ user: { id: 'synthetic-client', role, name: 'Aline Démonstration', prenom: 'Aline', nom: 'Démonstration', siteId: 'synthetic-site', siteName: 'Site synthétique' }, accessToken: 'synthetic-only' })), role);
        await context.route('**/*', async route => {
          const request = route.request();
          const url = new URL(request.url());
          if (!url.pathname.startsWith('/api/')) return url.origin === origin ? route.continue() : route.abort();
          apiRequests.push(url.pathname);
          if (request.method() !== 'GET') { unexpected.push(`${request.method()} ${url.pathname}`); return route.abort(); }
          const endpoint = url.pathname.replace('/api/v1', '');
          let data;
          if (endpoint.endsWith('/notifications/counts')) data = { total: 0 };
          else if (endpoint.startsWith('/notifications')) data = { notifications: [], unreadCount: 0 };
          else if (endpoint === `/mlm/members/${member.id}/progress`) data = progress;
          else if (endpoint === '/mlm/members') data = { membres: [member], meta };
          else if (endpoint === `/mlm/wallet/${member.id}`) data = wallet;
          else if (endpoint.endsWith('/wallet/transactions')) data = { transactions: [], meta };
          else if (endpoint === '/mlm/commissions') data = { commissions, summary: {}, meta };
          else if (endpoint === '/mlm/config') data = [builder];
          else if (endpoint === '/mlm/config/calendar') data = [{ year: 2026, holidays: ['2026-06-30'], version: 'synthetic-v1', source: 'Calendrier synthétique', timezone: 'Africa/Lubumbashi' }];
          else if (endpoint === '/mlm/stats') data = {};
          else if (endpoint === '/portal/wallet') data = { wallet, financialSummary: wallet.financialSummary, progressiveCommissions: summaries, reinvestLots: [], stats: { gainsTotaux: '5.21' } };
          else if (endpoint === '/portal/me') data = { client: member.client, prochainNiveau: null, niveauxConfig: [], nbFilleulsActifs: 1, nbFilleulsTotal: 1, dernierAchats: [] };
          else { unexpected.push(endpoint); return route.abort(); }
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
        });
        const page = await context.newPage();
        page.on('pageerror', error => errors.push(error.message));
        const routes = role === 'CLIENT' ? ['/portal/home', '/portal/points'] : [`/mlm/members/${member.id}`, '/mlm/wallet'];
        for (const route of routes) {
          await page.goto(`${origin}${route}`, { waitUntil: 'domcontentloaded' });
          if (route === '/mlm/wallet') await page.getByLabel('Filtrer les transactions par membre').selectOption(member.id);
          const section = page.getByRole('region', { name: 'Progression financière par génération' });
          const sapphire = section.getByRole('group', { name: 'Génération 2 — Sapphire' });
          await sapphire.waitFor();
          assert.equal(await section.getByRole('group').count(), 8);
          const disclosure = sapphire.locator('summary');
          await disclosure.focus();
          await page.keyboard.press('Enter');
          await sapphire.getByText('Budget total', { exact: true }).waitFor({ state: 'visible' });
          assert.match(await sapphire.innerText(), /83,33 USD/);
          assert.match(await sapphire.innerText(), /3,13 USD/);
          assert.match(await sapphire.innerText(), /78,12 USD/);
          assert.equal(await section.evaluate(element => element.scrollWidth > element.clientWidth + 1), false, `${route}: financial section overflow at ${width}`);
          assert.equal(await disclosure.evaluate(element => element.getBoundingClientRect().height >= 44), true);
          await section.scrollIntoViewIfNeeded();
          await page.screenshot({ path: path.join(output, `${role}-${route.split('/').pop()}-${width}.png`) });
          await page.keyboard.press('Enter');
        }
        if (role === 'SUPER_ADMIN') {
          await page.goto(`${origin}/mlm/commissions`);
          const catchup = page.getByRole('row').filter({ hasText: 'Rattrapage de génération' });
          await catchup.waitFor();
          assert.match(await catchup.innerText(), /1 → 3/);
          assert.equal(await catchup.getByRole('cell').nth(1).getByText(/Aline/).count(), 0);
          await page.screenshot({ path: path.join(output, `commissions-${width}.png`) });
          await page.goto(`${origin}/mlm/config`);
          await page.getByText(/Le budget de chaque membre et génération est figé/).waitFor();
          await page.getByRole('button', { name: 'Modifier', exact: true }).click();
          await page.getByRole('dialog').getByText(/uniquement pour les budgets non encore commencés/).waitFor();
          await page.screenshot({ path: path.join(output, `config-${width}.png`) });
        } else {
          assert.equal(apiRequests.every(endpoint => endpoint.startsWith('/api/v1/portal/')), true);
          await page.goto(`${origin}/mlm/commissions`);
          await page.waitForURL('**/portal/home');
          assert.equal(apiRequests.some(endpoint => endpoint.includes('/mlm/commissions')), false);
        }
        assert.deepEqual(unexpected, []);
        assert.deepEqual(errors, []);
        console.log(`PASS ${role} ${width}px: synthetic summaries, keyboard disclosure, no section overflow, no unexpected API, no page errors`);
        await context.close();
      }
    }
  } finally {
    await browser?.close();
    await server.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
