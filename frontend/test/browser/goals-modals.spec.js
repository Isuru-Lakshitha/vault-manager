import { test, expect } from '@playwright/test';

// Goals deposit/withdraw modals (pages/goals/) move real money.
test('goals: deposit moves money from an account into the goal', async ({ page }) => {
  await page.route('https://api.frankfurter.dev/**', (route) => route.fulfill({ json: [{ base: 'LKR', quote: 'USD', rate: 0.003, date: '2026-10-21' }] }));
  await page.goto('/test/browser/goals');
  await page.evaluate(async () => {
    const api = await import('/src/utils/api.js');
    await api.createGoal({ name: 'Trip', target_amount: 1000, current_amount: 0, deadline: '2027-12-31' });
    api.invalidateCache();
    window.dispatchEvent(new CustomEvent('vm:data-changed', { detail: { key: 'goals' } }));
  });
  await page.getByRole('button', { name: /Deposit/ }).first().click();
  const dialog = page.getByRole('dialog', { name: /Deposit into "Trip"/ });
  await expect(dialog).toBeVisible();
  await dialog.getByPlaceholder(/0\.00/).fill('100');
  await dialog.getByRole('button', { name: '+ Add Deposit' }).click();
  await expect(dialog).toBeHidden();
  const goal = await page.evaluate(async () => {
    const api = await import('/src/utils/api.js');
    api.invalidateCache();
    return (await api.fetchGoals()).find((g) => g.name === 'Trip');
  });
  expect(Number(goal.current_amount)).toBe(100);
});
