import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('https://api.frankfurter.dev/**', route =>
    route.fulfill({ json: [{ base: 'LKR', quote: 'USD', rate: 0.003, date: '2026-10-21' }] })
  );
  await page.goto('/test/browser/index.html');
  await expect(page.getByRole('heading', { name: 'Accounts', exact: true })).toBeVisible();
});

test('transactions type tabs, keyboard shortcuts, compact toggle, bulk edit, and saved views work end-to-end', async ({ page }) => {
  // Add an Expense via Quick Add
  await page.getByRole('button', { name: 'Quick Add', exact: true }).click();
  const quickDialog = page.getByRole('dialog');
  await quickDialog.getByLabel('Transaction amount').fill('40');
  await quickDialog.getByRole('button', { name: '+ Save Transaction', exact: true }).click();
  await expect(quickDialog).toBeHidden();

  // Navigate to Transactions page
  await page.getByRole('link', { name: 'Transactions', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Transactions', exact: true })).toBeVisible();

  // Verify keyboard shortcut '/' focuses the search input
  await page.keyboard.press('/');
  const searchInput = page.getByLabel('Search transactions');
  await expect(searchInput).toBeFocused();
  await searchInput.blur();

  // Verify keyboard shortcut 'N' opens New Transaction modal, then close it
  await page.keyboard.press('n');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');

  // Verify Type tabs filter between Expense and Income
  await page.getByRole('tab', { name: /^Income/ }).click();
  await expect(page.getByText('NO TRANSACTIONS FOUND')).toBeVisible();
  await page.getByRole('tab', { name: /^Expense/ }).click();
  await expect(page.locator('[data-tx-row]')).toHaveCount(1);

  // Save the current Expense filter view, reset to All, and re-apply the saved view
  await page.getByRole('button', { name: '＋ Save view' }).click();
  await page.getByLabel('View name').fill('Only Expenses');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('tab', { name: /^All/ }).click();
  await page.getByRole('button', { name: 'Only Expenses', exact: true }).click();
  await expect(page.getByRole('tab', { name: /^Expense/ })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Delete view Only Expenses' }).click();

  // Compact mode toggle
  const compactBtn = page.getByRole('button', { name: '☰ Compact' });
  await compactBtn.click();
  await expect(compactBtn).toHaveAttribute('aria-pressed', 'true');
  await compactBtn.click();
  await expect(compactBtn).toHaveAttribute('aria-pressed', 'false');

  // Select All + Bulk Set Category & Add Tag
  await page.getByRole('button', { name: /^Select all/ }).click();
  await expect(page.getByText('1 selected')).toBeVisible();
  await page.getByRole('button', { name: 'Set category', exact: true }).click();
  await page.getByLabel('Bulk category').fill('Dining');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.locator('[data-tx-row]').first()).toContainText('Dining');

  await page.getByRole('button', { name: /^Select all/ }).click();
  await page.getByRole('button', { name: 'Add tag', exact: true }).click();
  await page.getByLabel('Bulk tag').fill('weekend');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.locator('[data-tx-row]').first()).toContainText('#weekend');

  // Inline Quick-Edit of category and notes right inside the transaction row
  await page.getByRole('button', { name: 'Inline quick edit', exact: true }).first().click();
  await page.getByLabel('Quick edit category', { exact: true }).fill('Groceries');
  await page.getByLabel('Quick edit notes', { exact: true }).fill('Fresh Market');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('[data-tx-row]').first()).toContainText('Groceries');
  await expect(page.locator('[data-tx-row]').first()).toContainText('Fresh Market');

  // Account filter + Bank-Statement Running Balance
  const accountSelect = page.getByLabel('Filter by account');
  await accountSelect.selectOption({ index: 1 });
  await expect(page.getByTestId('tx-running-balance').first()).toContainText('Bal:');
  await accountSelect.selectOption('All');
});
