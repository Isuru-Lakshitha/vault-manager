import { test, expect } from '@playwright/test';

// The Three.js scenes (sign-in vault, Dashboard coin stacks, Analytics bars)
// render, or fall back cleanly where WebGL isn't available, with no errors.
const watch = (page) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/DevTools|\[vite\]|favicon|WebGL|GPU stall/i.test(m.text())) errors.push(m.text()); });
  return errors;
};
const settled = (loc) => expect.poll(async () => loc.getAttribute('data-status'), { timeout: 15000 }).toMatch(/ready|unsupported/);

test.beforeEach(async ({ page }) => {
  await page.route('https://api.frankfurter.dev/**', (route) => route.fulfill({ json: [{ base: 'LKR', quote: 'USD', rate: 0.003, date: '2026-10-21' }] }));
});

test('sign-in vault loads on wide screens and the form still works', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'brand panel (and the 3D vault) is hidden on phones');
  const errors = watch(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/test/browser/login');
  const stage = page.locator('.login-vault');
  await settled(stage);
  await expect(page.getByRole('button', { name: /sign in/i }).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('Dashboard coin stacks and Analytics bars render with real data', async ({ page }, info) => {
  const errors = watch(page);
  await page.goto('/test/browser/accounts');
  await page.evaluate(async () => {
    const api = await import('/src/utils/api.js');
    const now = new Date();
    for (let k = 0; k < 3; k++) {
      const d = new Date(now.getFullYear(), now.getMonth() - k, 10).toISOString().slice(0, 10);
      await api.createTransaction({ type: 'Income', amount: 4000 + k * 100, category: 'Salary', notes: 'Salary', date: d, to_account_id: 'bank' });
      await api.createTransaction({ type: 'Expense', amount: 1500 + k * 200, category: 'Rent', notes: 'Rent', date: d, from_account_id: 'bank' });
    }
    api.invalidateCache();
  });
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
  if (info.project.name === 'mobile') {
    // Small phones (<= 420px): no room beside the numbers, so no 3D is loaded.
    await expect(page.locator('.dash-nw-value')).toBeVisible();
    await expect(page.locator('.dash-nw-3d')).toHaveCount(0);
  } else {
    await settled(page.locator('.dash-nw-3d'));
  }
  await page.getByRole('link', { name: 'Analytics', exact: true }).click();
  const bars = page.locator('.an3d-stage.three-stage');
  await settled(bars);
  await expect(page.locator('.an3d-card .sr-only li')).toHaveCount(3); // text version for screen readers
  expect(errors).toEqual([]);
});
