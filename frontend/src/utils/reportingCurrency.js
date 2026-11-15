import { currencyRate } from './exchangeRates.js';
export function transactionCurrency(transaction, accounts, base) {
  const targetId = transaction.from_account_id || transaction.to_account_id;
  const account = targetId != null ? accounts.find(a => String(a.id) === String(targetId)) : null;
  return transaction.currency || account?.currency || base;
}
// Reports are current-reference-rate estimates, not historical booked exchange values.
export function reportingTransactions(transactions, accounts, base, rates) {
  return transactions.filter(t => !t.reversed_at && !t.reversal_of).map(transaction => {
    const currency = transactionCurrency(transaction, accounts, base);
    const rate = currencyRate(currency, base, rates);
    if (!Number.isFinite(rate)) throw new Error(`Cannot calculate report: ${currency}/${base} rates unavailable. Reconnect and retry.`);
    const convert = amount => Math.round(Number(amount) * rate * 100) / 100;
    return { ...transaction, original_amount: transaction.amount, original_currency: currency,
      currency: base, amount: convert(transaction.amount), fee_amount: convert(transaction.fee_amount || 0),
      ...(transaction.splits ? { splits: transaction.splits.map(split => ({ ...split, amount: convert(split.amount) })) } : {}) };
  });
}
