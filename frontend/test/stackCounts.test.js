import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stackCounts, TOTAL_COINS } from '../src/three/stackCounts.js';

test('coins split by share and always add up', () => {
  assert.deepEqual(stackCounts(750, 250), { a: 11, d: 3 }); // 10.5 rounds up
  const { a, d } = stackCounts(1234.56, 789.01);
  assert.equal(a + d, TOTAL_COINS);
});

test('a tiny non-zero side still gets one coin; empty or negative gives none', () => {
  assert.deepEqual(stackCounts(1_000_000, 1), { a: 13, d: 1 });
  assert.deepEqual(stackCounts(1, 1_000_000), { a: 1, d: 13 });
  assert.deepEqual(stackCounts(500, 0), { a: 14, d: 0 });
  assert.deepEqual(stackCounts(0, 0), { a: 0, d: 0 });
  assert.deepEqual(stackCounts(-5, 'x'), { a: 0, d: 0 });
});
