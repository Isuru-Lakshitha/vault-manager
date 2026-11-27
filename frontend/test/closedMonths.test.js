import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map([['vm_closed_months', JSON.stringify({ '2026-01': { closed_at: 'x' } })]]);
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
};
const cm = await import('../src/utils/closedMonths.js');

test('the old shared copy is removed and months are kept per user', () => {
  assert.equal(store.has('vm_closed_months'), false);
  cm.rememberClosedMonth('alice', '2026-05', { closed_at: '2026-06-01' });
  assert.deepEqual(Object.keys(cm.localClosedMonths('alice')), ['2026-05']);
  assert.deepEqual(cm.localClosedMonths('bob'), {});
});

test('only really closed, not skipped or reopened, months are locked', () => {
  assert.equal(cm.isMonthLocked({ closed_at: 'x' }), true);
  assert.equal(cm.isMonthLocked({ skipped: true, closed_at: 'x' }), false);
  assert.equal(cm.isMonthLocked({ closed_at: 'x', reopened_at: 'y' }), false);
  assert.equal(cm.isMonthLocked(undefined), false);
});

test('changes dated in a closed month are refused', () => {
  cm.rememberClosedMonth('alice', '2026-05', { closed_at: '2026-06-01' });
  assert.throws(() => cm.assertMonthsOpen('alice', '2026-05-14'), /2026-05 is closed/);
  assert.throws(() => cm.assertMonthsOpen('alice', '2026-07-01', '2026-05-02'), /closed/);
  assert.doesNotThrow(() => cm.assertMonthsOpen('alice', '2026-06-01', null));
  assert.doesNotThrow(() => cm.assertMonthsOpen('bob', '2026-05-14'));
  cm.rememberClosedMonth('alice', '2026-05', { closed_at: '2026-06-01', reopened_at: '2026-06-02' });
  assert.doesNotThrow(() => cm.assertMonthsOpen('alice', '2026-05-14'));
});

test('merge keeps synced months and lists locked months newest first', () => {
  const all = cm.mergeClosedMonths('carol', { '2026-03': { closed_at: 'a' }, '2026-04': { closed_at: 'b' }, '2026-02': { skipped: true } });
  assert.deepEqual(cm.lockedMonths(all), ['2026-04', '2026-03']);
});
