import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeBudgetAlerts,
  computeBillAlerts,
  computeRecurringAlerts,
  computeCardAlerts,
  computeBackupAlert,
  computeAlerts,
  dismissAlert,
  snoozeAlert,
  filterVisible,
  loadAlertState,
  saveAlertState,
  DAY_MS
} from '../src/utils/alertEngine.js';

const now = new Date('2026-11-10T10:00:00Z');

test('computeBudgetAlerts emits warning at >=80% and danger at >=100%', () => {
  const budgets = [
    { category: 'Dining', amount: 1000, month: '2026-11' },
    { category: 'Groceries', amount: 500, month: '2026-11' },
    { category: 'Travel', amount: 2000, month: '2026-11' }
  ];
  const transactions = [
    { type: 'Expense', category: 'Dining', amount: 850, date: '2026-11-05' },
    { type: 'Expense', category: 'Groceries', amount: 520, date: '2026-11-07' },
    { type: 'Expense', category: 'Travel', amount: 300, date: '2026-11-08' }
  ];

  const alerts = computeBudgetAlerts({ budgets, transactions, now });
  assert.equal(alerts.length, 2);
  const dining = alerts.find(a => a.id.includes('dining'));
  const groceries = alerts.find(a => a.id.includes('groceries'));
  assert.equal(dining.type, 'warning');
  assert.match(dining.title, /85%/);
  assert.equal(groceries.type, 'danger');
  assert.match(groceries.title, /exceeded/i);
});

test('computeBillAlerts finds overdue, due today, and due within 3 days', () => {
  const bills = [
    { id: 'b1', name: 'Internet', amount: 2500, due_date: '2026-11-08', paid: false },
    { id: 'b2', name: 'Electricity', amount: 4200, due_date: '2026-11-10', paid: false },
    { id: 'b3', name: 'Water', amount: 900, due_date: '2026-11-12', paid: false },
    { id: 'b4', name: 'Insurance', amount: 12000, due_date: '2026-11-25', paid: false },
    { id: 'b5', name: 'Phone', amount: 1500, due_date: '2026-11-09', paid: true }
  ];

  const alerts = computeBillAlerts({ bills, now });
  assert.equal(alerts.length, 3);
  assert.equal(alerts[0].type, 'danger'); // overdue
  assert.match(alerts[0].title, /Overdue bill: Internet/);
  assert.equal(alerts[1].type, 'danger'); // due today
  assert.match(alerts[1].title, /Bill due today: Electricity/);
  assert.equal(alerts[2].type, 'warning'); // due in 2d
  assert.match(alerts[2].title, /Bill due in 2d: Water/);
});

test('computeBackupAlert warns when backup is missing or older than reminder interval', () => {
  assert.equal(computeBackupAlert({ lastBackupTs: null, everyDays: 7, now }).length, 1);
  const recent = now.getTime() - 2 * DAY_MS;
  assert.equal(computeBackupAlert({ lastBackupTs: recent, everyDays: 7, now }).length, 0);
  const stale = now.getTime() - 9 * DAY_MS;
  const [alert] = computeBackupAlert({ lastBackupTs: stale, everyDays: 7, now });
  assert.match(alert.title, /9 days old/);
});

test('computeAlerts deduplicates and dismiss/snooze state isolates per uid', () => {
  const mem = new Map();
  const mockStorage = {
    getItem: k => mem.get(k) ?? null,
    setItem: (k, v) => mem.set(k, String(v))
  };

  const all = computeAlerts({
    budgets: [{ category: 'Rent', amount: 100, month: '2026-11' }],
    transactions: [{ type: 'Expense', category: 'Rent', amount: 100, date: '2026-11-01' }],
    bills: [{ id: '1', name: 'Rent Bill', amount: 100, due_date: '2026-11-11', paid: false }],
    lastBackupTs: null,
    backupEveryDays: 7,
    now
  });
  assert.equal(all.length, 3);

  let state = loadAlertState('u1', mockStorage);
  state = dismissAlert(state, all[0].id);
  state = snoozeAlert(state, all[1].id, 1, now.getTime());
  saveAlertState('u1', state, mockStorage);

  const visibleNow = filterVisible(all, loadAlertState('u1', mockStorage), now.getTime() + 1000);
  assert.equal(visibleNow.length, 1);
  assert.equal(visibleNow[0].id, all[2].id);

  // Snooze expires after 1 day
  const visibleTomorrow = filterVisible(all, loadAlertState('u1', mockStorage), now.getTime() + 2 * DAY_MS);
  assert.equal(visibleTomorrow.length, 2);

  // Another user sees all 3
  assert.equal(filterVisible(all, loadAlertState('u2', mockStorage), now.getTime()).length, 3);
});

test('computeRecurringAlerts and computeCardAlerts emit actionable alerts with hrefs', () => {
  const recAlerts = computeRecurringAlerts({
    recurring: [
      { id: 'r1', name: 'Rent', amount: 45000, schedule_mode: 'fixed', day_of_month: 8, last_applied_month: null },
      { id: 'r2', name: 'Fibre', amount: 3800, schedule_mode: 'fixed', day_of_month: 12, last_applied_month: null },
      { id: 'r3', name: 'PaidItem', amount: 1500, schedule_mode: 'fixed', day_of_month: 9, last_applied_month: '2026-11' }
    ],
    now
  });
  assert.equal(recAlerts.length, 2);
  assert.equal(recAlerts[0].href, '/recurring');
  assert.match(recAlerts[0].title, /Overdue reminder: Rent/);
  assert.equal(recAlerts[1].type, 'warning');
  assert.match(recAlerts[1].title, /Reminder due in 2d: Fibre/);

  const cardAlerts = computeCardAlerts({
    cards: [
      { id: 'c1', name: 'Platinum Visa', current_balance: 92000, credit_limit: 100000, payment_due_day: 13 }
    ],
    now
  });
  assert.equal(cardAlerts.length, 2);
  assert.ok(cardAlerts.every(a => a.href === '/cards'));
});

test('computeBudgetAlerts ignores reversed/reversal/fee transactions and attributes split categories', () => {
  const now = new Date(2026, 10, 15, 12, 0, 0); // 2026-11-15
  const budgets = [
    { id: 'b_food', category: 'Food', month: '2026-11', amount: 1000 },
    { id: 'b_util', category: 'Utilities', month: '2026-11', amount: 500 },
    { id: 'b_loan', category: 'Gold Loan', month: '2026-11', amount: 200 },
  ];
  const transactions = [
    // Reversed expense + its reversal should both be excluded
    { id: 'rev1', type: 'Expense', category: 'Food', date: '2026-11-05', amount: 900, reversed_at: '2026-11-06' },
    { id: 'rev2', type: 'Income', category: 'Food', date: '2026-11-06', amount: 900, reversal_of: 'rev1' },
    // Transfer fee excluded
    { id: 'fee1', type: 'Expense', category: 'Food', date: '2026-11-07', amount: 100, is_transfer_fee: true },
    // Split transaction attributing 850 to Food (85% -> warning) and 450 to Utilities (90% -> warning)
    {
      id: 'split1',
      type: 'Expense',
      category: 'Mixed',
      date: '2026-11-08',
      amount: 1300,
      splits: [
        { category: 'Food', amount: 850 },
        { category: 'Utilities', amount: 450 },
      ],
    },
    // Loan Payment included against its category budget (105% -> danger)
    { id: 'lp1', type: 'Loan Payment', category: 'Gold Loan', date: '2026-11-10', amount: 210 },
  ];

  const alerts = computeBudgetAlerts({ budgets, transactions, now });
  assert.equal(alerts.length, 3);
  const food = alerts.find(a => a.id === 'budget-food-2026-11-80');
  const util = alerts.find(a => a.id === 'budget-utilities-2026-11-80');
  const loan = alerts.find(a => a.id === 'budget-goldloan-2026-11-100');
  assert.equal(food?.type, 'warning');
  assert.match(food?.title || '', /85%/);
  assert.equal(util?.type, 'warning');
  assert.match(util?.title || '', /90%/);
  assert.equal(loan?.type, 'danger');
  assert.match(loan?.title || '', /Budget exceeded: Gold Loan/);
});

test('computeBackupAlert builds local-date IDs rather than shifting across UTC day boundaries', () => {
  const localNow = new Date(2026, 10, 15, 0, 30, 0);
  // Late-night UTC timestamp stays on local Nov 2 for UTC+05:30 instead of Nov 1 in UTC
  const stale = Date.UTC(2026, 10, 1, 20, 0, 0);
  const d = new Date(stale);
  const expectedLocal = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const [alert] = computeBackupAlert({ lastBackupTs: stale, everyDays: 7, now: localNow });
  assert.equal(alert.id, `backup-${expectedLocal}`);
});

import { budgetAnnouncements } from '../src/utils/alertEngine.js';

test('budget crossings are announced once per level per month', () => {
  const now = new Date(2026, 10, 19);
  const budgets = [{ id: 'b', category: 'Food', amount: 100, month: '2026-11' }];
  const spend = (amt) => [{ type: 'Expense', category: '🍔 Food', amount: amt, date: '2026-11-03' }];

  const first = budgetAnnouncements({ budgets, transactions: spend(85), now });
  assert.deepEqual(first.fresh.map(a => a.type), ['warning']);

  const again = budgetAnnouncements({ budgets, transactions: spend(90), now, announced: first.announced });
  assert.equal(again.fresh.length, 0);

  const over = budgetAnnouncements({ budgets, transactions: spend(120), now, announced: again.announced });
  assert.deepEqual(over.fresh.map(a => a.type), ['danger']);

  const after = budgetAnnouncements({ budgets, transactions: spend(130), now, announced: over.announced });
  assert.equal(after.fresh.length, 0);
});

test('jumping straight past 100% announces once and old months are pruned', () => {
  const now = new Date(2026, 10, 19);
  const budgets = [{ id: 'b', category: 'Fun', amount: 50, month: '2026-11' }];
  const tx = [{ type: 'Expense', category: 'Fun', amount: 70, date: '2026-11-02' }];
  const r = budgetAnnouncements({ budgets, transactions: tx, now, announced: ['budget-food-2026-10-80'] });
  assert.equal(r.fresh.length, 1);
  assert.ok(!r.announced.some(id => id.includes('2026-10')));
  assert.equal(budgetAnnouncements({ budgets, transactions: tx, now, announced: r.announced }).fresh.length, 0);
});
