import { convertCurrency } from './format.js';
import { addMoney, roundMoney, subMoney } from './money.js';

export const DEBT_ACCOUNT_TYPES = new Set(['Credit Card', 'Loan', 'Mortgage', 'Liability']);
const isInvestAccount = (a) => (a?.type || '').toLowerCase().includes('invest');

/*
 * Balance sheet in the base currency, counted the same way as the Dashboard:
 * - every amount is converted with the reference rates; money with no rate
 *   is left out and listed in `missingRateCurrencies` (never counted at face value)
 * - overdrawn asset accounts count as negative, not as 0
 * - an investment with quantity 0 is worth 0
 * - sums are done in integer cents
 */
/*
 * Converter into the base currency. Money with no reference rate counts as 0
 * and its currency is collected in `missing`, so reports can say what was
 * left out instead of adding foreign money at face value.
 */
export function baseConverter(baseCurrency, rates) {
  const missing = new Set();
  const toBase = (amount, currency) => {
    const v = Number(amount) || 0;
    const c = currency || baseCurrency;
    if (c === baseCurrency || v === 0) return v;
    const cv = convertCurrency(v, c, baseCurrency, rates);
    if (!Number.isFinite(cv)) { missing.add(c); return 0; }
    return cv;
  };
  return { toBase, missing };
}

export function computeBalanceSheet({ accounts = [], investments = [], loans = [], creditCards = [] } = {}, baseCurrency, rates) {
  const { toBase, missing } = baseConverter(baseCurrency, rates);
  const sum = (list, fn) => addMoney(...list.map(fn));

  const assetAccounts = accounts.filter(a => !DEBT_ACCOUNT_TYPES.has(a.type));
  const liquidAssets = sum(assetAccounts.filter(a => !isInvestAccount(a)), a => toBase(a.balance, a.currency));
  const investmentAccountAssets = sum(assetAccounts.filter(isInvestAccount), a => toBase(a.balance, a.currency));
  const holdingsAssets = sum(investments, i => {
    const price = Number(i.current_price ?? i.buy_price) || 0;
    const quantity = Number(i.quantity) || 0;
    // Multiply first, round once (a price like 0.004 must not round to 0).
    return toBase(Math.max(0, roundMoney(price * quantity)), i.currency);
  });
  const loanLiabilities = sum(loans.filter(l => (l.status || 'Active') === 'Active'), l =>
    toBase(addMoney(Number(l.principal_amount ?? l.amount) || 0, Number(l.current_accrued_interest ?? l.unpaid_interest) || 0), l.currency));
  const cardAccountLiabilities = sum(accounts.filter(a => DEBT_ACCOUNT_TYPES.has(a.type)), a => Math.abs(toBase(a.balance, a.currency)));
  const cardLiabilities = sum(creditCards, c => Math.max(0, toBase(c.balance ?? c.current_balance, c.currency)));

  const investmentAssets = addMoney(investmentAccountAssets, holdingsAssets);
  const totalAssets = addMoney(liquidAssets, investmentAssets);
  const totalLiabilities = addMoney(loanLiabilities, cardAccountLiabilities, cardLiabilities);
  return {
    liquidAssets, investmentAccountAssets, holdingsAssets, investmentAssets, totalAssets,
    loanLiabilities, cardAccountLiabilities, cardLiabilities, totalLiabilities,
    netWorth: subMoney(totalAssets, totalLiabilities),
    missingRateCurrencies: [...missing],
  };
}

/** Last reference rates saved by the Dashboard / Accounts pages (or null). */
export function readCachedRates() {
  try { return JSON.parse(localStorage.getItem('vm_fx_rates') || 'null'); } catch { return null; }
}

/** "Excludes USD (no exchange rate)" for a summary card, or undefined. */
export const missingRateNote = (missing) => (missing.size ? `Excludes ${[...missing].join(', ')} (no exchange rate)` : undefined);
