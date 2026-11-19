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
