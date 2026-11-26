// @ts-check
import { toCents, fromCents, roundMoney } from './money.js';

/**
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
const sameId = (a, b) => a != null && b != null && String(a) === String(b);

/**
 * @param {Record<string, any> | null | undefined} tx
 * @returns {boolean}
 */
export const isActivePayment = tx => Boolean(tx && !tx.reversed_at && !tx.reversal_of);

/**
 * @param {Record<string, any> | null | undefined} tx
 * @returns {boolean}
 */
export const isEditableTransaction = tx => Boolean(tx && !tx.reversed_at && !tx.reversal_of && !tx.is_transfer_fee && !tx.invoice_id);

/**
 * @param {Record<string, any>} tx
 * @returns {'Reversal' | 'Reversed' | 'Active'}
 */
export function auditStatus(tx) {
  return tx.reversal_of ? 'Reversal' : tx.reversed_at ? 'Reversed' : 'Active';
}

/**
 * True for rows that only move money between the user's own places, so they
 * are not income or spending: paying a credit card (the card charges are
 * already counted as spending), saving into a goal, and taking goal money
 * back into an account. Counting them would double spending (charge +
 * payment) and make saving look like spending.
 * A goal withdrawal with no account (money spent straight from the goal)
 * is real spending and still counts.
 * @param {Record<string, any>} tx
 */
export function isInternalMove(tx) {
  if (!tx) return false;
  if (tx.internal_move === true) return true;
  if (tx.credit_card_id && tx.category === 'Credit Card Payment') return true;
  if (tx.goal_id && tx.category === 'Goal Contribution') return true;
  if (tx.goal_id && tx.category === 'Goal Deduction' && tx.type === 'Income') return true;
  return false;
}

/**
 * @param {Array<Record<string, any>>} rows
 */
export function summarizePayments(rows) {
  const active = rows.filter(t => isActivePayment(t) && !isInternalMove(t));
  const incomeCents = active.filter(t => t.type === 'Income').reduce((sum, t) => sum + toCents(t.amount), 0);
  const expenseCents = active.filter(t => ['Expense', 'Loan Payment'].includes(t.type)).reduce((sum, t) => sum + toCents(t.amount), 0);
  return {
    income: fromCents(incomeCents),
    expense: fromCents(expenseCents),
    net: fromCents(incomeCents - expenseCents),
    count: rows.length,
  };
}

/**
 * @param {Record<string, any>} account
 * @param {Array<Record<string, any>>} transactions
 */
export function reconcileAccount(account, transactions) {
  // Audit rows are real compensating balance movements; generated fees are already in their parent.
  const deltaCents = transactions.reduce((sum, tx) => sum + toCents(accountMovement(account.id, tx)), 0);
  const known = Number.isFinite(account.opening_balance);
  const openingCents = known ? toCents(account.opening_balance) : 0;
  const expectedCents = known ? openingCents + deltaCents : null;
  const balanceCents = toCents(account.balance);
  return {
    known,
    delta: fromCents(deltaCents),
    expected: expectedCents !== null ? fromCents(expectedCents) : null,
    difference: expectedCents !== null ? fromCents(balanceCents - expectedCents) : null,
  };
}

/**
 * Summarize signed inflows, outflows, and reconciliation status for one account ledger.
 * @param {Record<string, any>} account
 * @param {Array<Record<string, any>>} accountTransactions
 * @param {Array<Record<string, any>>} [allTransactions]
 */
export function summarizeAccountHistory(account, accountTransactions, allTransactions = accountTransactions) {
  const rows = Array.isArray(accountTransactions) ? accountTransactions : [];
  let inflowCents = 0;
  let outflowCents = 0;
  for (const tx of rows) {
    const movCents = toCents(accountMovement(account.id, tx));
    if (movCents > 0) inflowCents += movCents;
    else if (movCents < 0) outflowCents += Math.abs(movCents);
  }
  const recon = reconcileAccount(account, Array.isArray(allTransactions) ? allTransactions : rows);
  return {
    inflows: fromCents(inflowCents),
    outflows: fromCents(outflowCents),
    ...recon,
  };
}

/**
 * Audit all accounts against the transaction ledger in integer cents.
 * @param {Array<Record<string, any>>} accounts
 * @param {Array<Record<string, any>>} transactions
 */
export function auditLedger(accounts, transactions) {
  const accList = Array.isArray(accounts) ? accounts : [];
  const txList = Array.isArray(transactions) ? transactions : [];
  const rows = accList.map(acc => {
    const recon = reconcileAccount(acc, txList);
    return {
      id: String(acc.id),
      name: acc.name || String(acc.id),
      currency: acc.currency || 'LKR',
      balance: roundMoney(acc.balance),
      opening_balance: recon.known ? roundMoney(acc.opening_balance) : null,
      delta: recon.delta,
      expected: recon.expected,
      difference: recon.difference,
      known: recon.known,
      drifted: recon.known && recon.difference !== 0,
    };
  });
  return {
    accounts: rows,
    knownCount: rows.filter(r => r.known).length,
    driftedCount: rows.filter(r => r.drifted).length,
    unknownBaselineCount: rows.filter(r => !r.known).length,
  };
}

/**
 * @param {Record<string, any>} record
 * @param {Record<string, any>} account
 */
export function requireMatchingCurrency(record, account) {
  const target = record.currency || 'LKR', source = account.currency || 'LKR';
  if (target !== source) throw new Error(`This payment is in ${target}, but the selected account uses ${source}. Transfer into a ${target} account first, then pay from that account.`);
}

/**
 * Compute signed movement for a single account in major currency units using integer cents.
 * @param {string | number} accountId
 * @param {Record<string, any>} tx
 * @returns {number}
 */
export function accountMovement(accountId, tx) {
  if (!tx || tx.is_transfer_fee) return 0;
  const amtCents = toCents(tx.amount);
  const feeCents = toCents(tx.fee_amount);
  const destCents = tx.destination_amount != null ? toCents(tx.destination_amount) : amtCents;
  if (tx.type === 'Transfer') {
    const inCents = sameId(tx.to_account_id, accountId) ? destCents : 0;
    const outCents = sameId(tx.from_account_id, accountId) ? (amtCents + feeCents) : 0;
    return fromCents(inCents - outCents);
  }
  if (tx.type === 'Income' && sameId(tx.to_account_id, accountId)) return fromCents(amtCents);
  if (['Expense', 'Loan Payment'].includes(tx.type) && sameId(tx.from_account_id, accountId)) return fromCents(-amtCents);
  return 0;
}
