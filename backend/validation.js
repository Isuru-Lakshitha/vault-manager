function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
function money(value, field = 'amount', allowZero = false, signed = false) {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 1e12 ||
      (!signed && (allowZero ? value < 0 : value <= 0)) || Math.abs(value * 100 - Math.round(value * 100)) > .001)
    fail(`${field} must be a valid ${signed ? '' : allowZero ? 'non-negative ' : 'positive '}amount with at most two decimals`);
  return value;
}
function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) fail('Invalid date');
}
function reference(db, table, id) {
  if (!/^\d+$/.test(String(id)) || !db.prepare(`SELECT id FROM ${table} WHERE id = ?`).get(id)) fail(`${table} record not found`, 404);
}
function transaction(db, data) {
  if (!['Income','Expense','Transfer'].includes(data.type)) fail('Use the loan payment endpoint for loan payments');
  money(data.amount); money(data.fee_amount ?? 0, 'fee_amount', true); date(data.date);
  if (data.type !== 'Income') reference(db, 'accounts', data.from_account_id);
  if (data.type !== 'Expense') reference(db, 'accounts', data.to_account_id);
  if (data.type === 'Transfer' && String(data.from_account_id) === String(data.to_account_id)) fail('Choose two different accounts');
  if (data.type !== 'Transfer' && data.fee_amount) fail('Only transfers can have fees');
}
module.exports = { fail, money, date, reference, transaction };
