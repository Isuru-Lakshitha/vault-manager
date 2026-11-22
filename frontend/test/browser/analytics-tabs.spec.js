import { test, expect } from '@playwright/test';

// The Analytics tabs split into pages/analytics/ all render with real data.
test('analytics: overview, cash flow, categories, trends and weekday tabs render without errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/DevTools|\[vite\]|favicon/i.test(m.text())) errors.push(m.text()); });
  await page.route('https://api.frankfurter.dev/**', (route) => route.fulfill({ json: [{ base: 'LKR', quote: 'USD', rate: 0.003, date: '2026-10-21' }] }));
  await page.goto('/test/browser/accounts');
  await page.evaluate(async () => {
    const api = await import('/src/utils/api.js');
    const d = (n) => { const x = new Date(); x.setDate(x.getDate() - n); return x.toISOString().slice(0, 10); };
    for (const [n, type, amount, category] of [[1, 'Income', 5000, 'Salary'], [2, 'Expense', 420, '🍔 Food'], [5, 'Expense', 120, 'Transport'], [12, 'Expense', 900, 'Rent'], [40, 'Expense', 300, '🍔 Food']]) {
      await api.createTransaction({ type, amount, category, notes: category, date: d(n), ...(type === 'Income' ? { to_account_id: 'bank' } : { from_account_id: 'bank' }) });
    }
    api.invalidateCache();
  });
  await page.getByRole('link', { name: 'Analytics', exact: true }).click();
  await expect(page.locator('main h1').first()).toHaveText('Analytics');
  await page.getByRole('tablist', { name: 'Analytics sections' }).getByRole('tab', { name: /All views/ }).click();
  for (const label of ['OVERVIEW', 'CASH FLOW', 'CATEGORIES', 'TRENDS', 'WEEKDAY']) {
    await page.getByRole('button', { name: label, exact: true }).first().click();
    await page.waitForTimeout(300);
  }
  expect(errors).toEqual([]);
});
