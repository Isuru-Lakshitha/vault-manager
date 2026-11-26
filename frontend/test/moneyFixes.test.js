// Edge cases from the money-correctness review: internal moves in reports,
// month-end dates, statement import (day/month order, signs, duplicates).
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { isInternalMove, summarizePayments } from '../src/utils/ledgerReporting.js';
import { monthCloseReport } from '../src/utils/monthClose.js';
import { addMonthsClamped, toYMD } from '../src/utils/dates.js';
import { getRuleUrgency } from '../src/pages/recurring/model.js';
import { parseStatementDate, parseStatementAmount, rowsToTransactions, withoutDuplicates } from '../src/utils/statementImport.js';

const cardCharge = { type: 'Expense', amount: 10000, date: '2026-10-03', category: 'Shopping', credit_card_charge_id: 'c1' };
const cardPayment = { type: 'Expense', amount: 10000, date: '2026-10-20', category: 'Credit Card Payment', credit_card_id: 'c1', from_account_id: 'bank' };
const goalSave = { type: 'Expense', amount: 50000, date: '2026-10-21', category: 'Goal Contribution', goal_id: 'g1', from_account_id: 'bank' };
const goalBack = { type: 'Income', amount: 2000, date: '2026-10-22', category: 'Goal Deduction', goal_id: 'g1', to_account_id: 'bank' };
const goalSpent = { type: 'Expense', amount: 700, date: '2026-10-23', category: 'Goal Deduction', goal_id: 'g1' };
const salary = { type: 'Income', amount: 150000, date: '2026-10-01', category: 'Salary', to_account_id: 'bank' };

test('card payments and goal moves are not income or spending', () => {
  assert.equal(isInternalMove(cardPayment), true);
  assert.equal(isInternalMove(goalSave), true);
  assert.equal(isInternalMove(goalBack), true);
  assert.equal(isInternalMove(cardCharge), false, 'the card charge itself is spending');
  assert.equal(isInternalMove(goalSpent), false, 'goal money spent directly is spending');
  assert.equal(isInternalMove(null), false);
});

test('a card charge plus paying the card counts the spend once', () => {
  const rows = [salary, cardCharge, cardPayment, goalSave, goalBack, goalSpent];
  const s = summarizePayments(rows);
  assert.equal(s.income, 150000);
  assert.equal(s.expense, 10700);
  const close = monthCloseReport({ transactions: rows, month: '2026-10' });
  assert.equal(close.expense, 10700);
  assert.equal(close.income, 150000);
});

test('adding a month clamps to the month end', () => {
  assert.equal(toYMD(addMonthsClamped(new Date(2026, 0, 31), 1)), '2026-02-28');
  assert.equal(toYMD(addMonthsClamped(new Date(2028, 0, 31), 1)), '2028-02-29');
  assert.equal(toYMD(addMonthsClamped(new Date(2026, 2, 31), 1)), '2026-04-30');
  assert.equal(toYMD(addMonthsClamped(new Date(2026, 11, 15), 1)), '2027-01-15');
  assert.equal(toYMD(addMonthsClamped(new Date(2026, 4, 31), -3)), '2026-02-28');
});

test('a day-31 recurring rule is due on the last day of a short month', (t) => {
  t.after(() => mock.timers.reset());
  const rule = { id: 'r', schedule_mode: 'fixed', day_of_month: 31, amount: 1000 };
  mock.timers.enable({ apis: ['Date'], now: new Date(2026, 1, 28, 9, 0) });
  assert.equal(getRuleUrgency(rule, '2026-02').level, 'today');
  mock.timers.reset();
  mock.timers.enable({ apis: ['Date'], now: new Date(2026, 3, 30, 9, 0) });
  assert.equal(getRuleUrgency(rule, '2026-04').level, 'today');
});

test('statement dates are read day-first by default', () => {
  assert.equal(parseStatementDate('05/03/2026'), '2026-03-05');
  assert.equal(parseStatementDate('05/03/2026', 'MDY'), '2026-05-03');
  assert.equal(parseStatementDate('13/03/2026', 'MDY'), '2026-03-13', 'unambiguous dates ignore the order');
  assert.equal(parseStatementDate('05-03-26'), '2026-03-05');
  assert.equal(parseStatementDate('2026-03-05'), '2026-03-05');
  assert.equal(parseStatementDate('20260305'), '2026-03-05');
  assert.equal(parseStatementDate('5 Mar 2026'), '2026-03-05');
  assert.equal(parseStatementDate('05-Mar-26'), '2026-03-05');
  assert.equal(parseStatementDate('Mar 5, 2026'), '2026-03-05');
  assert.equal(parseStatementDate('31/02/2026'), '', 'impossible dates are rejected');
  assert.equal(parseStatementDate('not a date'), '');
});

test('statement amounts keep their sign', () => {
  assert.equal(parseStatementAmount('1,234.50'), 1234.5);
  assert.equal(parseStatementAmount('-1,234.50'), -1234.5);
  assert.equal(parseStatementAmount('(99.10)'), -99.1);
  assert.equal(parseStatementAmount('250.00-'), -250);
  assert.equal(parseStatementAmount('Rs. 1,000'), 1000);
  assert.equal(parseStatementAmount('.50'), 0.5);
  assert.ok(Number.isNaN(parseStatementAmount('')));
});

test('signed CSVs import refunds as income; unreadable dates are skipped, not dated today', () => {
  const rows = [
    ['05/03/2026', 'Keells', '-2,500.00'],
    ['06/03/2026', 'Refund', '500.00'],
    ['??', 'Broken', '-10'],
    ['07/03/2026', 'Zero', '0'],
  ];
  const mapping = { date: 0, description: 1, amount: 2, type: -1 };
  const { transactions, skipped } = rowsToTransactions(rows, mapping, { accountId: 'bank' });
  assert.deepEqual(skipped, [3]);
  assert.equal(transactions.length, 2);
  assert.deepEqual(transactions.map((t) => [t.date, t.type, t.amount]), [['2026-03-05', 'Expense', 2500], ['2026-03-06', 'Income', 500]]);
  assert.equal(transactions[0].from_account_id, 'bank');
  assert.equal(transactions[1].to_account_id, 'bank');
});

test('unsigned CSVs use the default type, and there is no 50-row cap', () => {
  const rows = Array.from({ length: 120 }, (_, i) => [`${(i % 28) + 1}/01/2026`, `Item ${i}`, '100']);
  const { transactions } = rowsToTransactions(rows, { date: 0, description: 1, amount: 2, type: -1 }, { defaultType: 'Expense' });
  assert.equal(transactions.length, 120);
  assert.ok(transactions.every((t) => t.type === 'Expense'));
});

test('re-importing the same rows skips the ones already in the ledger', () => {
  const tx = { date: '2026-03-05', amount: 2500, type: 'Expense', notes: 'Keells' };
  const twin = { ...tx };
  const other = { ...tx, amount: 2500.01 };
  const { fresh, duplicates } = withoutDuplicates([tx, twin, other], [{ ...tx, notes: ' keells ' }]);
  assert.equal(duplicates, 2);
  assert.deepEqual(fresh, [other]);
  assert.equal(withoutDuplicates([tx, twin], []).fresh.length, 2, 'identical rows in one file are kept');
  assert.equal(withoutDuplicates([tx], [{ ...tx, notes: 'Keells', reversed_at: 'x' }]).fresh.length, 1, 'reversed rows do not block');
});

test('a rule that rewrites the note still counts as a duplicate via import_key', () => {
  const { transactions } = rowsToTransactions([['05/03/2026', 'KEELLS 123', '-2,500']], { date: 0, description: 1, amount: 2, type: -1 });
  const saved = { ...transactions[0], notes: 'Groceries (auto-rule)', category: 'Groceries' };
  assert.equal(withoutDuplicates(transactions, [saved]).duplicates, 1);
});
