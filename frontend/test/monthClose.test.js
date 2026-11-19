import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthCloseReport, previousMonth, shouldOfferClose, isUncategorised } from '../src/utils/monthClose.js';

const txs = [
  { id: 1, date: '2026-10-02', type: 'Income', amount: 1000, category: 'Salary' },
  { id: 2, date: '2026-10-05', type: 'Expense', amount: 120.1, category: '🍔 Food' },
  { id: 3, date: '2026-10-09', type: 'Expense', amount: 80.2, category: 'food' },
  { id: 4, date: '2026-10-11', type: 'Expense', amount: 50, category: '' },
  { id: 5, date: '2026-10-12', type: 'Transfer', amount: 300 },
  { id: 6, date: '2026-10-13', type: 'Expense', amount: 999, reversed_at: 'x' },
  { id: 7, date: '2026-10-20', type: 'Expense', amount: 7, category: 'Reconciliation', reconciliation: true },
  { id: 8, date: '2026-11-01', type: 'Expense', amount: 40, category: 'Food' },
];

test('totals ignore transfers, reversals and other months', () => {
  const r = monthCloseReport({ transactions: txs, month: '2026-10' });
  assert.equal(r.income, 1000);
  assert.equal(r.expense, 250.3);
  assert.equal(r.net, 749.7);
  assert.equal(r.adjustments, -7);
  assert.ok(Math.abs(r.savingsRate - 0.7497) < 1e-9);
});

test('categories merge across emoji/case and uncategorised rows are listed', () => {
  const r = monthCloseReport({ transactions: txs, month: '2026-10' });
  assert.equal(r.topCategories[0].amount, 200.3);
  assert.deepEqual(r.uncategorised.map(t => t.id), [4]);
  assert.equal(isUncategorised({ category: 'Other' }), true);
  assert.equal(isUncategorised({ category: '🛒 Groceries' }), false);
});

test('budget results flag overspending for that month', () => {
  const r = monthCloseReport({
    transactions: txs, month: '2026-10',
    budgets: [{ id: 'b1', category: 'Food', amount: 150, month: '2026-10' }, { id: 'b2', category: 'Fun', amount: 50 }, { id: 'b3', category: 'Food', amount: 10, month: '2026-11' }],
  });
  assert.deepEqual(r.budgetResults.map(b => [b.id, b.spent, b.over]), [['b1', 200.3, true], ['b2', 0, false]]);
  assert.equal(r.overBudget.length, 1);
});

test('previous month and when to offer closing', () => {
  assert.equal(previousMonth(new Date(2026, 0, 15)), '2025-12');
  assert.equal(previousMonth(new Date(2026, 10, 19)), '2026-10');
  assert.equal(shouldOfferClose({ month: '2026-10', transactions: txs }), true);
  assert.equal(shouldOfferClose({ month: '2026-10', transactions: txs, closedMonths: { '2026-10': {} } }), false);
  assert.equal(shouldOfferClose({ month: '2026-09', transactions: txs }), false);
});
