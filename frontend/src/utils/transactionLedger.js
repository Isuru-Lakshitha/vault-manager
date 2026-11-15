export function roundMoney(value) { return Math.round((value + Number.EPSILON) * 100) / 100; }
export function validateTransaction(data) {
  if (!['Income', 'Expense', 'Transfer', 'Loan Payment'].includes(data.type)) throw new Error('Invalid transaction type');
  for (const [name, value, positive] of [['amount', data.amount, true], ['fee', data.fee_amount ?? 0, false]]) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value > 1e12 || (positive ? value <= 0 : value < 0) || Math.abs(value * 100 - Math.round(value * 100)) > .001)
      throw new Error(`Enter a valid ${name} with at most two decimals`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date || '') || !Number.isFinite(Date.parse(data.date)) || new Date(data.date).toISOString().slice(0, 10) !== data.date) throw new Error('Enter a valid date');
  if (data.type !== 'Income' && !data.from_account_id) throw new Error('Choose a source account');
  if (['Income', 'Transfer'].includes(data.type) && !data.to_account_id) throw new Error('Choose a destination account');
  if (data.type === 'Transfer' && String(data.from_account_id) === String(data.to_account_id)) throw new Error('Choose two different accounts');
  if (data.destination_amount != null && (data.type !== 'Transfer' || !Number.isFinite(data.destination_amount) || data.destination_amount <= 0 || data.destination_amount > 1e12 || Math.abs(data.destination_amount * 100 - Math.round(data.destination_amount * 100)) > .001)) throw new Error('Enter a valid received amount with at most two decimals');
  if (data.type !== 'Transfer' && data.fee_amount) throw new Error('Fees are only supported on transfers');
}
export function mutateBalances(accounts, data, reverse = false) {
  const sign = reverse ? -1 : 1;
  const getAcct = id => id != null ? (accounts[id] || accounts[String(id)]) : null;
  const adjust = (id, delta) => {
    if (reverse && (id == null || id === '' || id === 'mark-only')) return;
    const acct = getAcct(id);
    if (!acct || !Number.isFinite(acct.balance)) {
      if (reverse) return;
      throw new Error('Account is missing or has an invalid balance');
    }
    acct.balance = roundMoney(acct.balance + delta * sign);
  };
  if (data.is_transfer_fee) return; // Reporting entry; its parent already includes the debit.
  if (data.type === 'Income') adjust(data.to_account_id, data.amount);
  else if (data.type === 'Expense' || data.type === 'Loan Payment') adjust(data.from_account_id, -data.amount);
  else if (data.type === 'Transfer') {
    adjust(data.from_account_id, -(data.amount + (data.fee_amount || 0)));
    const from = getAcct(data.from_account_id), to = getAcct(data.to_account_id);
    if (!reverse && ((from?.currency || 'LKR') !== (to?.currency || 'LKR')) && data.destination_amount == null) throw new Error('Enter the actual amount received for a transfer between different currencies');
    adjust(data.to_account_id, data.destination_amount ?? data.amount);
  } else throw new Error('Invalid transaction type');
}
export function transferFee(data, parentId, uid) {
  if (data.type !== 'Transfer' || !data.fee_amount) return null;
  return { type: 'Expense', amount: data.fee_amount, date: data.date, category: 'Bank Fees',
    notes: `Transfer fee for ${data.notes || 'transfer'}`, from_account_id: data.from_account_id,
    is_transfer_fee: true, parent_transaction_id: parentId, uid };
}
