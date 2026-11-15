const sameId = (a, b) => a != null && b != null && String(a) === String(b);
export const isActivePayment = tx => Boolean(tx && !tx.reversed_at && !tx.reversal_of);
export const isEditableTransaction = tx => Boolean(tx && !tx.reversed_at && !tx.reversal_of && !tx.is_transfer_fee && !tx.invoice_id);
export function auditStatus(tx) {
  return tx.reversal_of ? 'Reversal' : tx.reversed_at ? 'Reversed' : 'Active';
}
export function summarizePayments(rows) {
  const active = rows.filter(isActivePayment);
  const income = active.filter(t => t.type === 'Income').reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  const expense = active.filter(t => ['Expense', 'Loan Payment'].includes(t.type)).reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  return { income: Math.round(income * 100) / 100, expense: Math.round(expense * 100) / 100, net: Math.round((income - expense) * 100) / 100, count: rows.length };
}
export function reconcileAccount(account, transactions) {
  // Audit rows are real compensating balance movements; generated fees are already in their parent.
  const delta = transactions.reduce((sum, tx) => sum + accountMovement(account.id, tx), 0);
  const known = Number.isFinite(account.opening_balance);
  const expected = known ? Math.round((account.opening_balance + delta)*100)/100 : null;
  return { known, delta: Math.round(delta*100)/100, expected,
    difference: known ? Math.round((account.balance-expected)*100)/100 : null };
}
/** Summarize signed inflows, outflows, and reconciliation status for one account ledger. */
export function summarizeAccountHistory(account, accountTransactions, allTransactions = accountTransactions) {
  const rows = Array.isArray(accountTransactions) ? accountTransactions : [];
  let inflows = 0;
  let outflows = 0;
  for (const tx of rows) {
    const mov = accountMovement(account.id, tx);
    if (mov > 0) inflows += mov;
    else if (mov < 0) outflows += Math.abs(mov);
  }
  const recon = reconcileAccount(account, Array.isArray(allTransactions) ? allTransactions : rows);
  return {
    inflows: Math.round(inflows * 100) / 100,
    outflows: Math.round(outflows * 100) / 100,
    ...recon,
  };
}
export function requireMatchingCurrency(record, account) {
  const target = record.currency || 'LKR', source = account.currency || 'LKR';
  if (target !== source) throw new Error(`This payment is in ${target}, but the selected account uses ${source}. Transfer into a ${target} account first, then pay from that account.`);
}

export function accountMovement(accountId, tx) {
  if (tx.is_transfer_fee) return 0;
  const amt = Number(tx.amount) || 0;
  const fee = Number(tx.fee_amount) || 0;
  const destAmt = tx.destination_amount != null ? (Number(tx.destination_amount) || 0) : amt;
  if (tx.type === 'Transfer') return (sameId(tx.to_account_id, accountId) ? destAmt : 0) - (sameId(tx.from_account_id, accountId) ? amt + fee : 0);
  if (tx.type === 'Income' && sameId(tx.to_account_id, accountId)) return amt;
  if (['Expense','Loan Payment'].includes(tx.type) && sameId(tx.from_account_id, accountId)) return -amt;
  return 0;
}
