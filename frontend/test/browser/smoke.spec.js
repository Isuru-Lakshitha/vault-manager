import { test, expect } from '@playwright/test';

// One quick check per page: renders its heading, throws nothing, logs no
// errors, and (on phones) never scrolls sideways.
const PAGES = [
  ['dashboard', 'Dashboard'],
  ['accounts', 'Accounts'],
  ['transactions', 'Transactions'],
  ['cards', /Credit Cards/],
  ['budgets', /Budgets/],
  ['goals', /Goals/],
  ['bills', /Bills/],
  ['recurring', /Recurring/],
  ['loans', /Loans/],
  ['investments', /Investments/],
  ['analytics', /Analytics/],
  ['settings', /Settings/],
];

// Noise that isn't an app error (dev-server / PWA stub chatter).
const IGNORED = [/Download the React DevTools/i, /\[vite\]/i, /favicon/i];

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORED.some((r) => r.test(m.text()))) errors.push(`console: ${m.text()}`);
  });
  return errors;
}

test.beforeEach(async ({ page }) => {
  await page.route('https://api.frankfurter.dev/**', (route) => route.fulfill({ json: [{ base: 'LKR', quote: 'USD', rate: 0.003, date: '2026-10-21' }] }));
});

for (const [path, heading] of PAGES) {
  test(`smoke: ${path}`, async ({ page }, info) => {
    const errors = watchErrors(page);
    await page.goto(`/test/browser/${path}`);
    await expect(page.locator('main h1').first()).toBeVisible();
    await expect(page.locator('main h1').first()).toHaveText(heading);
    await page.waitForTimeout(400); // let async loads settle
    if (info.project.name === 'mobile') {
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, 'page scrolls sideways').toBeLessThanOrEqual(1);
    }
    expect(errors).toEqual([]);
  });
}

test('bills and recurring switch tabs and keep their URLs', async ({ page }) => {
  await page.goto('/test/browser/bills');
  const tabs = page.getByRole('tablist', { name: 'Bills and recurring' });
  await expect(tabs.getByRole('tab', { name: 'Bills' })).toHaveAttribute('aria-selected', 'true');
  await tabs.getByRole('tab', { name: 'Recurring' }).click();
  await expect(page).toHaveURL(/\/recurring$/);
  await expect(page.locator('main h1').first()).toHaveText(/Recurring/);
});

test('dashboard shows the get started checklist with real progress', async ({ page }) => {
  await page.goto('/test/browser/dashboard');
  const card = page.getByRole('region', { name: 'Get started' });
  await expect(card).toBeVisible();
  await expect(card).toContainText('2 of 5 done');
  await card.getByRole('button', { name: /Choose your currency/ }).click();
  await page.getByRole('dialog', { name: 'Your currency' }).getByRole('button', { name: /^USD/ }).click();
  await expect(card).toContainText('3 of 5 done');
  await card.getByRole('button', { name: 'Hide get started' }).click();
  await expect(card).toBeHidden();
});

test('language switch: Settings changes menus and headings to Sinhala, then Tamil', async ({ page }) => {
  await page.goto('/test/browser/settings');
  const picker = page.getByRole('tablist', { name: 'Language' });
  await picker.getByRole('tab', { name: 'සිංහල' }).click();
  await expect(page.locator('main h1').first()).toHaveText('සැකසුම්');
  await expect(page.locator('html')).toHaveAttribute('lang', 'si');
  await page.getByRole('tablist', { name: 'භාෂාව' }).getByRole('tab', { name: 'தமிழ்' }).click();
  await expect(page.locator('main h1').first()).toHaveText('அமைப்புகள்');
  await page.getByRole('tablist', { name: 'மொழி' }).getByRole('tab', { name: 'English' }).click();
  await expect(page.locator('main h1').first()).toHaveText('Settings');
});
