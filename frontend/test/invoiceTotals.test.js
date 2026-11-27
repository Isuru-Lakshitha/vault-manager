import test from 'node:test';
import assert from 'node:assert/strict';
import { invoiceTotals, lineAmount } from '../src/utils/invoiceTotals.js';

test('invoice total is summed in cents and tax rounded once', () => {
  const t = invoiceTotals({ items: [{ quantity: 3, unitPrice: 0.1 }, { quantity: 1, unitPrice: 0.2 }], taxRate: 15 });
  assert.equal(t.subtotal, 0.5);
  assert.equal(t.taxAmount, 0.08);
  assert.equal(t.total, 0.58);
  assert.equal(t.valid, true);
});

test('a blank or zero quantity is invalid, never counted as 1', () => {
  assert.ok(Number.isNaN(lineAmount({ quantity: '', unitPrice: 100 })));
  assert.ok(Number.isNaN(lineAmount({ quantity: 0, unitPrice: 100 })));
  const t = invoiceTotals({ items: [{ quantity: '', unitPrice: 100 }, { quantity: 2, unitPrice: 5 }] });
  assert.equal(t.valid, false);
  assert.equal(t.error, 'Invalid invoice line item');
  assert.equal(t.total, 10);
});

test('bad tax rates and empty invoices are invalid', () => {
  assert.equal(invoiceTotals({ items: [{ quantity: 1, unitPrice: 1 }], taxRate: 150 }).valid, false);
  assert.equal(invoiceTotals({ items: [] }).error, 'Invoice needs line items');
});

test('unit prices with more than two decimals are multiplied before rounding', () => {
  assert.equal(lineAmount({ quantity: 1000, unitPrice: 0.125 }), 125);
  assert.equal(invoiceTotals({ items: [{ quantity: 3, unitPrice: 0.335 }] }).total, 1.01);
});
