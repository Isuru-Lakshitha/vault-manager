import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toCents, fromCents, roundMoney, addMoney, subMoney, mulMoney, isValidMoney } from '../src/utils/money.js';

test('toCents and fromCents eliminate classic IEEE-754 float drift', () => {
  assert.equal(toCents(0.1) + toCents(0.2), 30);
  assert.equal(addMoney(0.1, 0.2), 0.3);
  assert.equal(subMoney(1.0, 0.9), 0.1);
  assert.equal(toCents(1.005), 101);
  assert.equal(roundMoney(1.005), 1.01);
  assert.equal(roundMoney(-1.005), -1.01);
  assert.equal(fromCents(-0), 0);
});

test('addMoney, subMoney, and mulMoney handle multiple operands and large balances accurately', () => {
  assert.equal(addMoney(10.55, 20.45, 0.01, -5.01), 26);
  assert.equal(subMoney(50000.1, 12345.67), 37654.43);
  assert.equal(mulMoney(19.99, 3), 59.97);
  assert.equal(mulMoney(100, 0.125), 12.5);
});

test('isValidMoney validates precision, bounds, and sign options', () => {
  assert.equal(isValidMoney(125.5), true);
  assert.equal(isValidMoney(0), true);
  assert.equal(isValidMoney(0, { allowZero: false }), false);
  assert.equal(isValidMoney(-10, { allowNegative: false }), false);
  assert.equal(isValidMoney(12.345), false);
  assert.equal(isValidMoney(1e13), false);
  assert.equal(isValidMoney(NaN), false);
});
