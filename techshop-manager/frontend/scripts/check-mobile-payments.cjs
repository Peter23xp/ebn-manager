const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const origin = process.env.MOBILE_TEST_URL || 'http://127.0.0.1:5187';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(origin).hostname), 'Use a local frontend, never production');
const notice = 'Le paiement Mobile Money est en cours de développement. Veuillez utiliser le paiement en espèces.';
const site = { id: 'site-test', nom: 'Site de test', ville: 'Goma' };
const client = {
  id: 'client-test', prenom: 'Aline', nom: 'Test', telephone: '+243999000101', statut: 'EN_COURS', site,
  onboardingEtapes: [{ etape: 'RECIT', statut: 'COMPLETE', montant: 5000 }, { etape: 'FICHE', statut: 'EN_ATTENTE' }],
};
const wallet = { soldeDisponible: 100, soldeDisponibleRetrait: 100, soldeReserve: 0, soldeReinvesti: 0, totalGagne: 100 };
const routes = ['/clients/new/recit', '/clients/client-test/recit', '/clients/client-test/fiche', '/sales/pos', '/portal/commissions', '/portal/points'];

async function run() {
  const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}) });
  const failures = [];
  let passed = 0;
  try {
    for (const [width, height] of [[320, 844], [390, 844], [768, 844], [1440, 844], [390, 420], [844, 390]]) {
      for (const pathname of routes) {
        const touch = width < 1024;
        const context = await browser.newContext({ viewport: { width, height }, isMobile: touch, hasTouch: touch, reducedMotion: 'reduce' });
        const errors = [];
        const writes = [];
        const portal = pathname.startsWith('/portal/');
        await context.addInitScript(({ portal, site }) => {
          localStorage.setItem('ebn_auth_v1', JSON.stringify({
            user: { id: 'user-test', name: 'Compte test', role: portal ? 'CLIENT' : 'CAISSIER', siteId: site.id, site },
            accessToken: 'synthetic-local-only',
          }));
        }, { portal, site });
        await context.route('**/*', async route => {
          const request = route.request();
          const url = new URL(request.url());
          if (!url.pathname.startsWith('/api/')) return url.origin === origin ? route.continue() : route.abort();
          if (request.method() !== 'GET') {
            writes.push(`${request.method()} ${url.pathname}`);
            return route.abort();
          }
          let data = {};
          if (url.pathname.endsWith('/config')) data = { montantRecit: 5000, montantFiche: 5000 };
          else if (url.pathname.endsWith('/clients/client-test')) data = client;
          else if (url.pathname.includes('/notifications')) data = { notifications: [], unreadCount: 0 };
          else if (url.pathname.endsWith('/sites')) data = { data: [site] };
          else if (url.pathname.endsWith('/produits/search')) data = { produits: [] };
          else if (url.pathname.endsWith('/produits/categories')) data = { categories: [] };
          else if (url.pathname.endsWith('/portal/me')) data = { client };
          else if (url.pathname.endsWith('/portal/wallet')) data = { wallet, reinvestLots: [] };
          else if (url.pathname.endsWith('/portal/wallet/transactions')) data = { transactions: [], meta: { page: 1, totalPages: 1 } };
          else if (url.pathname.endsWith('/portal/withdrawal-requests')) data = { requests: [], meta: { page: 1, totalPages: 1 } };
          else errors.push(`Unexpected GET ${url.pathname}`);
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
        });
        const page = await context.newPage();
        page.setDefaultTimeout(15000);
        page.on('pageerror', error => errors.push(error.message));
        const defects = [];
        try {
          await page.goto(`${origin}${pathname}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
          if (pathname === '/sales/pos' && width < 768) await page.getByRole('button', { name: /^Panier/ }).click();
          if (pathname.startsWith('/clients/')) await page.getByText('Paiement mobile', { exact: true }).click();
          else if (pathname === '/sales/pos') await page.getByRole('button', { name: 'M-Pesa', exact: true }).click();
          else if (pathname === '/portal/commissions') await page.getByRole('button', { name: 'Mobile Money', exact: true }).click();
          await page.getByText(notice, { exact: true }).filter({ visible: true }).waitFor();

          const phone = page.getByLabel(pathname === '/portal/commissions' ? 'Numéro de téléphone' : 'Numéro Mobile Money', { exact: true }).filter({ visible: true });
          await phone.fill('243900000001');
          const mobileSubmit = page.getByRole('button', { name: pathname === '/portal/points' ? 'Demander le retrait' : pathname === '/portal/commissions' ? 'Soumettre la demande' : 'Payer par Mobile Money', exact: true }).filter({ visible: true });
          assert.equal(await mobileSubmit.isDisabled(), true, 'Mobile payments must remain unavailable');
          const layout = await page.evaluate(() => ({
            overflow: document.documentElement.scrollWidth > innerWidth + 1,
            main: [...document.querySelectorAll('main')].map(element => ({ height: element.clientHeight, scrollHeight: element.scrollHeight })),
            smallFields: [...document.querySelectorAll('input:not([type=radio]):not([type=checkbox]), select, textarea')]
              .filter(element => element.getBoundingClientRect().width > 0 && parseFloat(getComputedStyle(element).fontSize) < 16)
              .map(element => element.labels?.[0]?.textContent || element.getAttribute('aria-label') || element.placeholder || element.tagName),
          }));
          if (layout.overflow) defects.push('Horizontal page overflow');
          if (touch && layout.smallFields.length) defects.push(`Fields can trigger iOS focus zoom: ${layout.smallFields.join(', ')}`);
          if (pathname === '/sales/pos' && layout.main.some(element => element.scrollHeight > element.height + 1)) defects.push('POS exceeds its parent viewport and scrolls the whole page');

          if (pathname.startsWith('/clients/')) await page.getByText('Cash', { exact: true }).click();
          else if (pathname === '/sales/pos' || pathname === '/portal/commissions') await page.getByRole('button', { name: 'Espèces', exact: true }).click();
          else {
            await page.getByRole('link', { name: 'Demander un retrait en espèces' }).click();
            await page.waitForURL(`${origin}/portal/commissions`);
            await page.getByRole('button', { name: 'Espèces', exact: true }).waitFor();
          }
          assert.equal(await page.getByText(notice, { exact: true }).filter({ visible: true }).count(), 0, 'Explicit cash selection should restore the page without a reload');
          if (pathname === '/sales/pos') {
            await page.getByRole('button', { name: 'Airtel Money', exact: true }).click();
            await page.getByText(notice, { exact: true }).filter({ visible: true }).waitFor();
            assert.equal(await page.getByRole('button', { name: 'Payer par Mobile Money', exact: true }).filter({ visible: true }).isDisabled(), true);
            await page.getByRole('button', { name: 'Espèces', exact: true }).click();
          }
          if (pathname === '/sales/pos' && width < 768) {
            await page.getByRole('button', { name: 'Produits', exact: true }).click();
            await page.getByPlaceholder('Rechercher un produit...').filter({ visible: true }).waitFor();
            await page.getByRole('button', { name: /^Panier/ }).click();
            assert.equal(await page.getByRole('button', { name: 'Espèces', exact: true }).isVisible(), true);
          }
          if (!portal) {
            if (width < 1024) {
              await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
              await page.getByRole('button', { name: 'Fermer le menu' }).click();
            }
            assert.equal(await page.getByTitle('Se déconnecter', { exact: true }).isVisible(), true, 'Staff header remains available');
          }
          assert.deepEqual(errors, [], 'No browser errors or unexpected API reads');
          assert.deepEqual(writes, [], 'Switching payment modes must never initiate a payment');
          assert.deepEqual(defects, []);
          passed += 1;
          console.log(`PASS ${width}x${height} ${pathname}`);
        } catch (error) {
          failures.push({ width, height, pathname, message: error.message });
          console.error(`FAIL ${width}x${height} ${pathname}: ${error.message}`);
        } finally { await context.close(); }
      }
    }
  } finally { await browser.close(); }
  console.log(`${passed} passed; ${failures.length} failed`);
  if (failures.length) process.exitCode = 1;
}

run().catch(error => { console.error(error); process.exitCode = 1; });
