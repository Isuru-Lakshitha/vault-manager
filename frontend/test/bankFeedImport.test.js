import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FEED_SOURCE, importableEntries } from '../src/utils/bankFeedImport.js';

const feed = [
  { item: { notes: 'A', amount: 10 }, isDuplicate: false },
  { item: { notes: 'B', amount: 20 }, isDuplicate: true },
  { item: { notes: 'C', amount: 30 }, isDuplicate: false },
];

test('statement rows are importable, duplicates excluded', () => {
  assert.deepEqual(importableEntries(feed, FEED_SOURCE.STATEMENT).map(e => e.item.notes), ['A', 'C']);
});

test('demo rows are never importable', () => {
  assert.deepEqual(importableEntries(feed, FEED_SOURCE.DEMO), []);
});

test('unknown or missing source is treated as not importable', () => {
  assert.deepEqual(importableEntries(feed, undefined), []);
  assert.deepEqual(importableEntries(feed, 'sandbox'), []);
  assert.deepEqual(importableEntries(null, FEED_SOURCE.STATEMENT), []);
});

import { findDemoFeedLeftovers } from '../src/utils/bankFeedImport.js';

test('finds rows written by the old demo feed', () => {
  const txs = [
    { id: 1, notes: 'Whole Foods Market', amount: 54.3, type: 'Expense' },
    { id: 2, notes: '  client consulting retainer ', amount: '1500', type: 'Income' },
    { id: 3, notes: 'Coffee', amount: 4, type: 'Expense' },
  ];
  assert.deepEqual(findDemoFeedLeftovers(txs).map(t => t.id), [1, 2]);
});

test('real purchases with similar names are never matched', () => {
  const txs = [
    { id: 1, notes: 'Whole Foods Market', amount: 61.2, type: 'Expense' }, // different amount
    { id: 2, notes: 'Uber', amount: 19.5, type: 'Expense' },               // different description
    { id: 3, notes: 'Uber Technologies Inc', amount: 19.5, type: 'Income' }, // different type
  ];
  assert.deepEqual(findDemoFeedLeftovers(txs), []);
  assert.deepEqual(findDemoFeedLeftovers(null), []);
});

import { bankRowRefs, bankImportRequestId, isAlreadyImported } from '../src/utils/bankFeedImport.js';

test('row references are stable and keep identical same-day purchases apart', () => {
  const rows = [
    { fitId: 'F123', date: '2026-11-01', amount: 5, notes: 'Coffee', type: 'Expense' },
    { fitId: '', date: '2026-11-01', amount: 5, notes: 'Coffee', type: 'Expense' },
    { fitId: '', date: '2026-11-01', amount: 5, notes: 'coffee ', type: 'Expense' },
  ];
  const a = bankRowRefs(rows), b = bankRowRefs(structuredClone(rows));
  assert.deepEqual(a, b);
  assert.equal(a[0], 'fitid:F123');
  assert.notEqual(a[1], a[2]);
});

test('import ids are deterministic, valid for createTransaction and differ by account', () => {
  const id = bankImportRequestId('acc1', 'fitid:F123');
  assert.equal(id, bankImportRequestId('acc1', 'fitid:F123'));
  assert.notEqual(id, bankImportRequestId('acc2', 'fitid:F123'));
  assert.match(id, /^[a-zA-Z0-9-]{1,80}$/);
});

test('earlier imports match exactly; hand-typed entries match on amount and date or description', () => {
  const row = { date: '2026-11-02', amount: 5, notes: 'Coffee' };
  const imported = [{ bank_ref: 'fitid:OTHER', from_account_id: 'acc1', date: '2026-11-02', amount: 5, notes: 'Coffee' }];
  assert.equal(isAlreadyImported(imported, row, 'fitid:NEW', 'acc1'), false, 'a second real purchase is not a duplicate');
  assert.equal(isAlreadyImported(imported, row, 'fitid:OTHER', 'acc1'), true);
  assert.equal(isAlreadyImported([{ date: '2026-11-02', amount: 5, notes: 'cafe' }], row, 'x', 'acc1'), true);
  assert.equal(isAlreadyImported([{ date: '2026-11-03', amount: 5.5, notes: 'Coffee' }], row, 'x', 'acc1'), false);
});
