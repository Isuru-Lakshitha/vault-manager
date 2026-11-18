import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freqLabel, getRuleEffectiveAmount, freqMonthly, getRuleUrgency, defaultForm, QUICK_PRESETS } from '../src/pages/recurring/model.js';

test('freqLabel maps frequencies to short suffixes', () => {
  assert.equal(freqLabel('Weekly'), '/ wk');
  assert.equal(freqLabel('Yearly'), '/ yr');
  assert.equal(freqLabel('Monthly'), '/ mo');
  assert.equal(freqLabel(undefined), '/ mo');
});

test('effective amount prefers the fixed amount, then avg, then recent history', () => {
  assert.equal(getRuleEffectiveAmount({ amount: '1200' }), 1200);
  assert.equal(getRuleEffectiveAmount({ amount: 0, avg_amount: 450 }), 450);
  const variable = { is_variable: true, payment_history: [{ amount: 100 }, { amount: 900 }, { amount: 200 }, { amount: 400 }] };
  assert.equal(getRuleEffectiveAmount(variable), 500); // average of the last three
  assert.equal(getRuleEffectiveAmount({ is_variable: true, payment_history: [] }), 0);
  assert.equal(getRuleEffectiveAmount({}), 0);
});

test('freqMonthly normalises weekly and yearly amounts to a monthly figure', () => {
  assert.equal(freqMonthly({ amount: 100, frequency: 'Monthly' }), 100);
  assert.equal(freqMonthly({ amount: 100, frequency: 'Weekly' }), 433);
  assert.equal(freqMonthly({ amount: 1200, frequency: 'Yearly' }), 100);
});

test('urgency: paid this month outranks nothing and is labelled settled', () => {
  const u = getRuleUrgency({ last_applied_month: '2026-11', type: 'Expense' }, '2026-11');
  assert.equal(u.level, 'paid');
  assert.equal(u.rank, 50);
});

test('urgency: fixed-day rules are overdue / today / soon / upcoming relative to today', () => {
  const today = new Date().getDate();
  const level = (day) => getRuleUrgency({ schedule_mode: 'fixed', day_of_month: day }, 'never').level;
  if (today > 1) assert.equal(level(today - 1), 'overdue');
  assert.equal(level(today), 'today');
  if (today + 3 <= 28) assert.equal(level(today + 3), 'soon');
  if (today + 10 <= 31) assert.equal(level(today + 10), 'upcoming');
});

test('urgency: flexible rules report their window', () => {
  const u = getRuleUrgency({ schedule_mode: 'flexible', flexible_window: 'Week 1' }, 'never');
  assert.equal(u.level, 'flexible');
  assert.match(u.label, /Week 1/);
});

test('presets and default form are well-formed', () => {
  assert.ok(QUICK_PRESETS.length > 0);
  for (const p of QUICK_PRESETS) {
    assert.ok(p.label && p.name && p.type && p.category, `preset ${p.label} has required fields`);
  }
  assert.equal(typeof defaultForm, 'object');
});
