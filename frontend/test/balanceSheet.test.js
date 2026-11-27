import test from 'node:test';
import assert from 'node:assert/strict';
import { computeBalanceSheet } from '../src/utils/balanceSheet.js';

const rates = { _source: 'test', _date: '2026-11-26', LKR: 1, USD: 300 };

test('balance sheet converts currencies and lists money with no rate', () => {
  const sheet = computeBalanceSheet({
    accounts: [
      { type: 'Bank', balance: 3000, currency: 'LKR' },
      { type: 'Bank', balance: 10, currency: 'USD' },
      { type: 'Bank', balance: 999, currency: 'XYZ' },
    ],
  }, 'LKR', rates);
  assert.equal(sheet.liquidAssets, 6000);
  assert.deepEqual(sheet.missingRateCurrencies, ['XYZ']);
});

test('overdrawn accounts reduce assets and zero-quantity holdings are worth 0', () => {
  const sheet = computeBalanceSheet({
    accounts: [{ type: 'Bank', balance: 100 }, { type: 'Bank', balance: -40 }],
    investments: [{ current_price: 50, quantity: 0 }, { current_price: 10.1, quantity: 3 }],
  }, 'LKR', rates);
  assert.equal(sheet.liquidAssets, 60);
  assert.equal(sheet.holdingsAssets, 30.3);
  assert.equal(sheet.totalAssets, 90.3);
});

test('debts include loans with interest, card accounts and credit cards, in cents', () => {
  const sheet = computeBalanceSheet({
    accounts: [{ type: 'Bank', balance: 0.3 }, { type: 'Credit Card', balance: -0.1 }],
    loans: [{ principal_amount: 0.1, current_accrued_interest: 0.2 }, { principal_amount: 500, status: 'Paid' }],
    creditCards: [{ balance: 0.2 }, { balance: -5 }],
  }, 'LKR', rates);
  assert.equal(sheet.totalLiabilities, 0.6);
  assert.equal(sheet.netWorth, -0.3);
});

test('tiny unit prices are not rounded away before multiplying', () => {
  const sheet = computeBalanceSheet({ investments: [{ current_price: 0.004, quantity: 100000 }] }, 'LKR', rates);
  assert.equal(sheet.holdingsAssets, 400);
});
