// Second money-correctness round: recurring auto-apply timing, bulk rules on
// system rows, balance corrections, loan payments and transfer fees in totals.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pendingRecurringRules } from '../src/utils/recurringDue.js';
import { executeRulesOnTransaction, isSystemTransaction, DEFAULT_RULES } from '../src/utils/rulesEngine.js';
import { summarizePayments, isInternalMove } from '../src/utils/ledgerReporting.js';
import { monthCloseReport } from '../src/utils/monthClose.js';

test('auto-apply only posts monthly rules whose day has arrived', () => {
  const rules = [
    { id: 'rent', day_of_month: 28, frequency: 'Monthly' },
    { id: 'phone', day_of_month: 5 },
    { id: 'flex' },
    { id: 'paused', day_of_month: 1, paused: true },
    { id: 'done', day_of_month: 1, last_applied_month: '2026-11' },
    { id: 'paidHist', day_of_month: 1, payment_history: [{ month: '2026-11', marked_only: false }] },
    { id: 'yearly', day_of_month: 1, frequency: 'Yearly' },
    { id: 'weekly', day_of_month: 1, frequency: 'Weekly' },
  ];
  assert.deepEqual(pendingRecurringRules(rules, '2026-11-10').map(r => r.id), ['phone', 'flex']);
  assert.deepEqual(pendingRecurringRules(rules, '2026-11-28').map(r => r.id), ['rent', 'phone', 'flex']);
});

test('a day-31 rule is due on the last day of a short month', () => {
  const rules = [{ id: 'eom', day_of_month: 31 }];
  assert.equal(pendingRecurringRules(rules, '2026-11-29').length, 0);
  assert.equal(pendingRecurringRules(rules, '2026-11-30').length, 1);
  assert.equal(pendingRecurringRules(rules, '2027-02-28').length, 1);
});

test('bulk rules never re-label card payments, goal moves or system rows', () => {
  const cardPayment = { type: 'Expense', amount: 5000, category: 'Credit Card Payment', credit_card_id: 'c1', notes: 'Payment to Apple' };
  const goalSave = { type: 'Expense', amount: 1000, category: 'Goal Contribution', goal_id: 'g1', notes: 'Netflix fund' };
  const fee = { type: 'Expense', amount: 30, category: 'Bank Fees', is_transfer_fee: true, notes: 'Transfer fee for apple' };
  for (const tx of [cardPayment, goalSave, fee]) {
    assert.equal(isSystemTransaction(tx), true);
    const { transaction, matchedRules } = executeRulesOnTransaction(DEFAULT_RULES, tx);
    assert.equal(matchedRules.length, 0);
    assert.equal(transaction.category, tx.category);
  }
  const normal = { type: 'Expense', amount: 1500, category: 'Other', notes: 'Apple Music' };
  assert.notEqual(executeRulesOnTransaction(DEFAULT_RULES, normal).transaction.category, 'Other');
});

test('balance corrections are not income; transfer fees and loan payments are spending', () => {
  const rows = [
    { type: 'Income', amount: 100000, date: '2026-11-01', category: 'Salary' },
    { type: 'Income', amount: 5000, date: '2026-11-02', category: 'Reconciliation', reconciliation: true },
    { type: 'Expense', amount: 30, date: '2026-11-03', category: 'Bank Fees', is_transfer_fee: true },
    { type: 'Loan Payment', amount: 25000, date: '2026-11-04', category: 'Loan EMI' },
    { type: 'Transfer', amount: 20000, date: '2026-11-03', fee_amount: 30 },
  ];
  assert.equal(isInternalMove(rows[1]), true);
  const s = summarizePayments(rows);
  assert.equal(s.income, 100000);
  assert.equal(s.expense, 25030);
  const close = monthCloseReport({ transactions: rows, month: '2026-11' });
  assert.equal(close.income, 100000);
  assert.equal(close.expense, 25030);
});
