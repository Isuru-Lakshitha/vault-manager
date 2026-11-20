// Regenerates README screenshots from the isolated test harness (fake data).
//   cd frontend && npm run dev:test        (in one terminal)
//   npm run screenshots                    (in another, from frontend/)
import { chromium, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const BASE = process.env.HARNESS_URL || 'http://127.0.0.1:5177';
const OUT = fileURLToPath(new URL('../../docs/screenshots/', import.meta.url));

// Hide one-off prompts so shots show the everyday UI.
const CLEAN = '#root > header, .ui-banner, .getting-started, .month-close-prompt, [data-rht-toaster] { display: none !important; }';

async function prepare(page, path, { theme = 'dark' } = {}) {
  await page.addInitScript((t) => { try { localStorage.setItem('vm_theme', t); } catch {} }, theme);
  // Start on another page so the target mounts fresh after data is loaded.
  await page.goto(`${BASE}/test/browser/shell?page=${path.includes('accounts') ? 'analytics' : 'accounts'}`);
  await page.waitForSelector('main h1');
  await page.evaluate(async () => {
    const demo = await import('/src/utils/demoData.js');
    await demo.loadDemoPortfolio();
    const api = await import('/src/utils/api.js');
    const accounts = await api.fetchAccounts();
    const checking = accounts.find((a) => a.name === 'Apex Premier Checking');
    const today = new Date();
    const ymd = (d) => d.toISOString().slice(0, 10);
    await api.createBudget({ category: 'Food', amount: 400, month: ymd(today).slice(0, 7) });
    await api.createBudget({ category: 'Transport', amount: 150, month: ymd(today).slice(0, 7) });
    await api.createBudget({ category: 'Entertainment', amount: 200, month: ymd(today).slice(0, 7) });
    for (const [days, amount, category, notes] of [[1, 42.5, 'Food', 'Farmers market'], [6, 18, 'Transport', 'Metro card top-up'], [9, 64, 'Food', 'Dinner with friends'], [11, 120, 'Shopping', 'Running shoes']]) {
      const d = new Date(today); d.setDate(d.getDate() - days);
      await api.createTransaction({ type: 'Expense', amount, category, notes, date: ymd(d), from_account_id: checking.id, is_demo: true });
    }
    api.invalidateCache();
  });
  // Client-side route change keeps the in-memory data.
  await page.evaluate((p) => { history.pushState({}, '', p); dispatchEvent(new PopStateEvent('popstate')); }, path);
  await page.waitForTimeout(400);
}

async function shot(browser, name, path, ctx, opts) {
  const context = await browser.newContext(ctx);
  const page = await context.newPage();
  await page.route('https://api.frankfurter.dev/**', (r) => r.fulfill({ json: [{ base: 'LKR', quote: 'USD', rate: 0.0033, date: '2026-11-20' }] }));
  await page.addInitScript(() => { try { localStorage.setItem('vm_currency', 'USD'); localStorage.setItem('vm_getting_started_hidden', '1'); } catch {} });
  await prepare(page, path, opts);
  await page.evaluate(async () => { (await import('/src/utils/theme.js')).applyTheme(); });
  await page.addStyleTag({ content: CLEAN });
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.getAnimations().forEach((a) => { try { a.finish(); } catch {} }));
  await page.screenshot({ path: `${OUT}${name}.png` });
  await context.close();
  console.log('saved', name);
}

const browser = await chromium.launch();
const desktop = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: 'dark' };
const phone = { ...devices['iPhone 13'], colorScheme: 'dark' };
await shot(browser, 'dashboard-desktop', '/test/browser/shell?page=dashboard', desktop);
await shot(browser, 'dashboard-light', '/test/browser/shell?page=dashboard', { ...desktop, colorScheme: 'light' }, { theme: 'light' });
await shot(browser, 'transactions-desktop', '/test/browser/shell?page=transactions', desktop);
await shot(browser, 'dashboard-phone', '/test/browser/shell?page=dashboard', phone);
await shot(browser, 'budgets-phone', '/test/browser/shell?page=budgets', phone);
await browser.close();
