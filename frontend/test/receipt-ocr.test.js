import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseReceiptText } from '../src/utils/receiptOcr.js';
test('receipt parser selects explicit totals instead of subtotal or tax',()=>{
 assert.deepEqual(parseReceiptText('Corner Shop\n2026-10-21\nSubtotal 1,000.00\nTax 100.00\nTOTAL 1,100.00'),{merchant:'Corner Shop',date:'2026-10-21',amount:1100});
});
test('ambiguous totals and dates remain blank for user review',()=>{
 const result=parseReceiptText('Shop\nTotal USD 10.00\nTotal LKR 3000.00\n21/10/26');assert.equal(result.amount,'');assert.equal(result.date,'');
 assert.equal(parseReceiptText('Shop\nSubtotal 100.00\n2026-02-31').date,'');assert.equal(parseReceiptText('Shop\nSubtotal 100.00').amount,'');
});
