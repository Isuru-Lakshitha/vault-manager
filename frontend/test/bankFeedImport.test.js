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
