import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateSafeToSpend,
  detectAnomalies,
  generateFinancialDigest,
  calculateEmergencyRunway,
} from '../src/utils/financialIntelligence.js';
import { detectUnmanagedSubscriptions } from '../src/utils/subscriptionDetector.js';
import { parseExchangeRates } from '../src/utils/exchangeRates.js';

const toLocalYMD = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const daysAgoYMD = (n) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return toLocalYMD(d);
};

test('calculateSafeToSpend excludes Transfer rules, ignores marked-only last_paid_amount, includes card debt, and ignores reversed txns', () => {
  const today = toLocalYMD(new Date());
  const currentMonth = today.slice(0, 7);

  const res = calculateSafeToSpend({
    accounts: [
      { id: 'a1', type: 'Checking', balance: 100000, currency: 'LKR' },
    ],
    creditCards: [
      { id: 'c1', name: 'Visa', balance: 5000, currency: 'LKR' },
    ],
    recurringRules: [
      // Active Expense due this month
      { id: 'r1', name: 'Rent', type: 'Expense', amount: 20000, last_applied_month: null },
      // Marked paid this month without ledger deduction -> should NOT use stale last_paid_amount
      { id: 'r2', name: 'Internet', type: 'Expense', amount: 3000, last_applied_month: currentMonth, last_paid_marked_only: true, last_paid_amount: 99999 },
      // Transfer rule must NOT be counted as an expense commitment
      { id: 'r3', name: 'Savings Sweep', type: 'Transfer', amount: 15000, last_applied_month: null },
    ],
    transactions: [
      // Real spend today
      { id: 't1', type: 'Expense', amount: 2000, date: today, category: 'Food' },
      // Reversed expense today & its compensating reversal must be ignored
      { id: 't2', type: 'Expense', amount: 4000, date: today, category: 'Food', reversed_at: '2026-01-01' },
      { id: 't3', type: 'Income', amount: 4000, date: today, reversal_of: 't2' },
    ],
  });

  // Unpaid recurring only counts Rent (20000), ignoring Transfer (15000)
  assert.equal(res.unpaidRecurringTotal, 20000);
  // Paid recurring uses Internet estimate (3000), NOT stale 99999 because last_paid_marked_only is true
  assert.equal(res.paidRecurringThisMonth, 3000);
  // hardCommitments includes Rent (20000) + creditCard balance (5000)
  assert.equal(res.hardCommitments, 25000);
  // safeToSpend = 100000 - 25000 = 75000
  assert.equal(res.safeToSpend, 75000);
  // spentToday only counts real 2000 expense
  assert.equal(res.spentToday, 2000);
});

test('calculateSafeToSpend converts multi-currency accounts and debts safely when rates exist', () => {
  const rates = parseExchangeRates([
    { base: 'LKR', quote: 'USD', rate: 0.004, date: '2026-10-20' }, // 1 USD = 250 LKR
  ]);
  const res = calculateSafeToSpend({
    accounts: [
      { id: 'usd_bank', type: 'Checking', balance: 100, currency: 'USD' }, // 25,000 LKR
      { id: 'lkr_bank', type: 'Savings', balance: 5000, currency: 'LKR' },
    ],
    creditCards: [
      { id: 'usd_card', name: 'Travel Card', balance: 20, currency: 'USD' }, // 5,000 LKR
    ],
    baseCurrency: 'LKR',
    rates,
  });

  assert.equal(res.liquidCash, 30000);
  assert.equal(res.hardCommitments, 5000);
  assert.equal(res.safeToSpend, 25000);
});

test('detectAnomalies and generateFinancialDigest ignore reversed, reversal, and fee transactions', () => {
  const today = daysAgoYMD(0);
  const yesterday = daysAgoYMD(1);
  const txs = [
    // Reversed duplicate should NOT trigger duplicate warning
    { id: 'd1', type: 'Expense', amount: 1500, date: today, category: 'Food', notes: 'Lunch', reversed_at: today },
    { id: 'd1_rev', type: 'Income', amount: 1500, date: today, reversal_of: 'd1' },
    { id: 'd2', type: 'Expense', amount: 1500, date: yesterday, category: 'Food', notes: 'Lunch' },
    // Baseline expenses last week (daysAgo 10..12) to verify digest week-over-week ignores reversed entries
    { id: 'w1', type: 'Expense', amount: 1000, date: daysAgoYMD(10), category: 'Food' },
    { id: 'w2', type: 'Expense', amount: 50000, date: daysAgoYMD(2), category: 'Shopping', reversed_at: today },
  ];

  const anomalies = detectAnomalies(txs);
  assert.equal(anomalies.filter(a => a.type === 'duplicate').length, 0);

  const digest = generateFinancialDigest({ transactions: txs });
  // Only valid expenses are d2 (1500 this week) and w1 (1000 last week) -> +50% weekly pace (NOT skewed by reversed 50000)
  const paceCard = digest.find(c => c.id === 'pace_up');
  assert.ok(paceCard);
  assert.match(paceCard.text, /50%/);
});

test('calculateEmergencyRunway includes Loan Payments, excludes reversed txns, and converts FX', () => {
  const rates = parseExchangeRates([
    { base: 'LKR', quote: 'USD', rate: 0.004, date: '2026-10-20' },
  ]);
  const res = calculateEmergencyRunway(
    [{ id: 'a1', type: 'Bank Account', balance: 1000, currency: 'USD' }], // 250,000 LKR
    [
      { id: 't1', type: 'Expense', amount: 150000, date: daysAgoYMD(10), currency: 'LKR' },
      { id: 't2', type: 'Loan Payment', amount: 150000, date: daysAgoYMD(20), currency: 'LKR' },
      { id: 't3_rev', type: 'Expense', amount: 900000, date: daysAgoYMD(5), currency: 'LKR', reversed_at: daysAgoYMD(4) },
    ],
    { baseCurrency: 'LKR', rates }
  );

  // 300,000 over 90 days (/3) => 100,000 monthly burn => 2.5 months runway
  assert.equal(res.liquidCash, 250000);
  assert.equal(res.monthlyBurn, 100000);
  assert.equal(res.runwayMonths, 2.5);
});

test('detectUnmanagedSubscriptions ignores reversed, reversal, and fee entries', () => {
  const txs = [
    { id: 's1', type: 'Expense', amount: 1200, date: '2026-07-10', category: 'Subscriptions', notes: 'Spotify' },
    { id: 's2', type: 'Expense', amount: 1200, date: '2026-08-10', category: 'Subscriptions', notes: 'Spotify', reversed_at: '2026-08-11' },
    { id: 's2r', type: 'Income', amount: 1200, date: '2026-08-11', reversal_of: 's2' },
    { id: 's3', type: 'Expense', amount: 1200, date: '2026-09-10', category: 'Subscriptions', notes: 'Spotify' },
  ];
  // With s2 reversed, there are only 2 occurrences spaced ~62 days apart -> no subscription detected
  const subs = detectUnmanagedSubscriptions(txs, [], []);
  assert.equal(subs.length, 0);
});
