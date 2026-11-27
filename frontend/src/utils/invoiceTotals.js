import { addMoney, mulMoney, roundMoney } from './money.js';

/*
 * The one invoice total used everywhere: the editor, the invoice list, the
 * PDF sent to the client and the amount credited when the invoice is paid.
 * Line amounts are rounded to cents, then summed; tax is rounded once.
 * A blank or zero quantity is invalid (it is not treated as 1).
 */
export function lineAmount(item) {
  const quantity = Number(item?.quantity), price = Number(item?.unitPrice);
  if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(price) || price < 0) return NaN;
  // Multiply first, round once: a unit price like 0.125 must not be rounded to cents.
  return roundMoney(price * quantity);
}

export function invoiceTotals(inv) {
  const items = Array.isArray(inv?.items) ? inv.items : [];
  const lines = items.map(lineAmount);
  const taxRate = Number(inv?.taxRate || 0);
  const validTax = Number.isFinite(taxRate) && taxRate >= 0 && taxRate <= 100;
  const valid = items.length > 0 && lines.every(Number.isFinite) && validTax;
  const subtotal = addMoney(...lines.filter(Number.isFinite));
  const taxAmount = validTax ? mulMoney(subtotal, taxRate / 100) : 0;
  const total = addMoney(subtotal, taxAmount);
  let error = null;
  if (!items.length) error = 'Invoice needs line items';
  else if (!lines.every(Number.isFinite)) error = 'Invalid invoice line item';
  else if (!validTax) error = 'Invalid invoice tax rate';
  return { lines, subtotal, taxRate: validTax ? taxRate : 0, taxAmount, total, valid, error };
}
