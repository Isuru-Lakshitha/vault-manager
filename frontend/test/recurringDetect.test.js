import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectRecurring } from '../src/utils/recurringDetect.js';
const tx = (date, amount, extra = {}) => ({ id: date + amount, type: 'Expense', category: 'Bills', notes: 'Netflix', date, amount, ...extra });
const today = '2026-04-10';
const monthly = [tx('2026-01-05', 100), tx('2026-02-05', 105), tx('2026-03-07', 98), tx('2026-04-06', 102)];
test('detects a monthly series with amounts within 10%', () => {
  const [hit] = detectRecurring(monthly, [], { today });
  assert.equal(hit.count, 4);
  assert.equal(hit.category, 'Bills');
  assert.equal(hit.day_of_month, 6);
  assert.equal(hit.amount, 101.25);
});
test('needs three occurrences ~25-35 days apart', () => {
  assert.equal(detectRecurring(monthly.slice(0, 2), [], { today }).length, 0);
  const weekly = [tx('2026-03-01', 50), tx('2026-03-08', 50), tx('2026-03-15', 50), tx('2026-03-22', 50)];
  assert.equal(detectRecurring(weekly, [], { today }).length, 0);
});
test('rejects amounts that vary by more than 10%', () => {
  const varied = [tx('2026-01-05', 100), tx('2026-02-05', 150), tx('2026-03-05', 100)];
  assert.equal(detectRecurring(varied, [], { today }).length, 0);
});
test('ignores reversed rows, transfers and stale series', () => {
  assert.equal(detectRecurring(monthly.map(t => ({ ...t, reversed_at: 'x' })), [], { today }).length, 0);
  assert.equal(detectRecurring(monthly.map(t => ({ ...t, type: 'Transfer' })), [], { today }).length, 0);
  assert.equal(detectRecurring(monthly, [], { today: '2026-09-01' }).length, 0);
});
test('skips series covered by an existing rule or dismissed', () => {
  assert.equal(detectRecurring(monthly, [{ type: 'Expense', category: 'Bills', notes: 'Netflix', amount: 100 }], { today }).length, 0);
  assert.equal(detectRecurring(monthly, [{ type: 'Expense', name: 'netflix', amount: 101 }], { today }).length, 0);
  const [hit] = detectRecurring(monthly, [], { today });
  assert.equal(detectRecurring(monthly, [], { today, dismissed: [hit.id] }).length, 0);
});
