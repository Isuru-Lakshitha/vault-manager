import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demoRecords } from '../src/utils/demoRecords.js';

test('only records explicitly tagged is_demo are selected', () => {
  const r = demoRecords({
    accounts: [{ id: 'a', is_demo: true }, { id: 'real' }, { id: 'x', is_demo: 'true' }],
    transactions: [{ id: 1, is_demo: true, date: '2026-11-01' }, { id: 2, date: '2026-11-02' }, { id: 3, is_demo: true, date: '2026-11-09' }],
    bills: [{ id: 'b', is_demo: true }],
    goals: null,
  });
  assert.deepEqual(r.accounts.map(a => a.id), ['a']);
  assert.deepEqual(r.transactions.map(t => t.id), [3, 1]);
  assert.equal(r.total, 4);
  assert.equal(demoRecords().total, 0);
});
