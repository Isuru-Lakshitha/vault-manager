import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupProgress } from '../src/utils/onboarding.js';

test('a brand-new user has nothing done', () => {
  const p = setupProgress({});
  assert.equal(p.completed, 0);
  assert.equal(p.finished, false);
  assert.deepEqual(p.steps.map(s => s.done), [false, false, false, false, false]);
});

test('steps tick off from real data', () => {
  const p = setupProgress({
    accounts: [{ id: 'a', balance: 0, opening_balance: 0 }],
    transactions: [{ id: 't' }],
  });
  assert.deepEqual(p.steps.map(s => [s.id, s.done]), [
    ['currency', true], ['account', true], ['balance', false], ['transaction', true], ['budget', false],
  ]);
});

test('archived accounts do not count; everything done finishes', () => {
  assert.equal(setupProgress({ accounts: [{ archived: true, balance: 5 }] }).completed, 0);
  const p = setupProgress({
    accounts: [{ balance: '1200' }], transactions: [{}], budgets: [{}],
  });
  assert.equal(setupProgress({ currencyChosen: true }).steps[0].done, true);
  assert.equal(p.finished, true);
});
