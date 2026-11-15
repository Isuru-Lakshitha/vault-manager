import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getLastAccountId, rememberAccountId } from '../src/utils/lastAccount.js';

beforeEach(() => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  };
});

test('last-used account is restored per scope and falls back safely', () => {
  const accounts = [{ id: 'bank' }, { id: 'cash' }, { id: 'old', archived: true }];
  assert.equal(getLastAccountId('quickadd:from', accounts), 'bank');
  rememberAccountId('quickadd:from', 'cash');
  assert.equal(getLastAccountId('quickadd:from', accounts), 'cash');
  assert.equal(getLastAccountId('quickadd:to', accounts), 'bank');
  rememberAccountId('quickadd:to', 'old');
  assert.equal(getLastAccountId('quickadd:to', accounts), 'bank', 'archived accounts are never defaulted');
  rememberAccountId('quickadd:from', 'deleted');
  assert.equal(getLastAccountId('quickadd:from', accounts), 'bank', 'missing accounts fall back');
  assert.equal(getLastAccountId('x', []), '');
});
