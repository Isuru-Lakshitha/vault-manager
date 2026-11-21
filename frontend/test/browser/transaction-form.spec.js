import { test, expect } from '@playwright/test';

// The Transactions page's own add/edit form (pages/transactions/TransactionFormModal).
test('transactions: adding through the form saves it and debits the account', async ({ page }) => {
  await page.route('https://api.frankfurter.dev/**', (route) => route.fulfill({ json: [{ base: 'LKR', quote: 'USD', rate: 0.003, date: '2026-10-21' }] }));
  await page.goto('/test/browser/transactions');
  await page.getByRole('button', { name: 'New transaction' }).click();
  const form = page.getByRole('dialog', { name: /New Transaction/ });
  await expect(form).toBeVisible();
  await form.getByPlaceholder(/0\.00/).first().fill('250');
  await form.getByPlaceholder(/remembered note/).fill('Groceries test');
  await form.getByRole('button', { name: '+ Save' }).click();
  await expect(form).toBeHidden();
  await expect(page.getByText('Groceries test').filter({ visible: true }).first()).toBeVisible();

  const balance = () => page.evaluate(async () => {
    const api = await import('/src/utils/api.js');
    api.invalidateCache();
    return (await api.fetchAccounts()).find((a) => a.id === 'bank').balance;
  });
  expect(await balance()).toBe(750);

});
