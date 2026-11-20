import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Automated WCAG 2.1 AA check (axe-core) for every page, in both themes.
// Fails on serious or critical problems: missing labels, low contrast,
// invalid ARIA, etc.
const PAGES = ['dashboard', 'accounts', 'transactions', 'cards', 'budgets', 'goals', 'bills', 'recurring', 'loans', 'investments', 'analytics', 'settings', 'login', 'shell'];

test.beforeEach(async ({ page }) => {
  await page.route('https://api.frankfurter.dev/**', (route) => route.fulfill({ json: [{ base: 'LKR', quote: 'USD', rate: 0.003, date: '2026-10-21' }] }));
});

for (const theme of ['dark', 'light']) {
  for (const path of PAGES) {
    test(`a11y ${theme}: ${path}`, async ({ page }) => {
      await page.goto(`/test/browser/${path}`);
      await page.locator('main h1, h1').first().waitFor();
      await page.evaluate((t) => document.body.classList.toggle('light-mode', t === 'light'), theme);
      // Open collapsed sections so their controls are checked too.
      await page.evaluate(() => document.querySelectorAll('main details').forEach((d) => { d.open = true; }));
      await page.waitForTimeout(500);
      await page.evaluate(() => document.getAnimations().forEach((a) => { try { a.finish(); } catch { /* infinite */ } }));
      const result = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .exclude('#root > header') // the harness's own link bar, not app UI
        .analyze();
      const serious = result.violations
        .filter((v) => v.impact === 'serious' || v.impact === 'critical')
        .map((v) => `${v.id} (${v.nodes.length}): ${v.help}\n    ${v.nodes.slice(0, 6).map((n) => `${n.target.join(' ')} :: ${(n.any[0]?.message || n.failureSummary || '').split('\n')[0].slice(0, 140)} :: ${n.html.slice(0, 120)}`).join('\n    ')}`);
      expect(serious, serious.join('\n')).toEqual([]);
    });
  }
}
