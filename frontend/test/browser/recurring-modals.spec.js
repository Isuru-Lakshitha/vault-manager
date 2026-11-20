import { test, expect } from '@playwright/test';

// The Recurring page's loan and pay modals (extracted into pages/recurring/)
// open, close with Escape, and the pay flow records the payment.
test('recurring: track-loan modal opens and closes; pay modal records a payment', async ({ page }) => {
  await page.route('https://api.frankfurter.dev/**', (route) => route.fulfill({ json: [{ base: 'LKR', quote: 'USD', rate: 0.003, date: '2026-10-21' }] }));
  await page.goto('/test/browser/recurring');
  await expect(page.locator('main h1').first()).toHaveText(/Recurring/);

  await page.getByRole('button', { name: 'Track loan' }).click();
  const loan = page.getByRole('dialog', { name: 'Track Loan as Monthly Payment' });
  await expect(loan).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(loan).toBeHidden();

  await page.evaluate(async () => {
    const api = await import('/src/utils/api.js');
    await api.createRecurringTransaction({ type: 'Expense', amount: 45, notes: 'Internet', category: 'Bills', day_of_month: 25, from_account_id: 'bank' });
    api.invalidateCache();
    window.dispatchEvent(new CustomEvent('vm:data-changed', { detail: { key: 'recurring' } }));
  });
  await page.getByRole('button', { name: 'Pay Now' }).first().click();
  const pay = page.getByRole('dialog', { name: /Pay This Month/ });
  await expect(pay).toBeVisible();
  await pay.getByRole('button', { name: /Confirm & Deduct/ }).click();
  await expect(pay).toBeHidden();
  const balance = await page.evaluate(async () => {
    const api = await import('/src/utils/api.js');
    api.invalidateCache();
    return (await api.fetchAccounts()).find((a) => a.id === 'bank').balance;
  });
  expect(balance).toBe(955);
});
