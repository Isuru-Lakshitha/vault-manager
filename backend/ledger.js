const { transaction: validate, fail } = require('./validation');
function apply(db, tx, direction = 1) {
  const adjust = (id, amount) => db.prepare('UPDATE accounts SET balance = ROUND(balance + ?, 2) WHERE id = ?').run(amount * direction, id);
  if (tx.type === 'Income') adjust(tx.to_account_id, tx.amount);
  else if (tx.type === 'Expense') adjust(tx.from_account_id, -tx.amount);
  else if (tx.type === 'Transfer') {
    adjust(tx.from_account_id, -(tx.amount + (tx.fee_amount || 0)));
    adjust(tx.to_account_id, tx.amount);
  } else fail('Loan payments must be managed through the loan workflow');
}
function saveTransaction(db, data, id) {
  return db.transaction(() => {
    validate(db, data);
    if (id) {
      const old = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
      if (!old) fail('Transaction not found', 404);
      apply(db, old, -1);
    }
    apply(db, data);
    const values = [data.type, data.amount, data.date, data.category || null, data.notes || null, data.from_account_id || null, data.to_account_id || null, data.fee_amount || 0];
    if (id) {
      db.prepare('UPDATE transactions SET type=?,amount=?,date=?,category=?,notes=?,from_account_id=?,to_account_id=?,fee_amount=? WHERE id=?').run(...values,id);
      return id;
    }
    return db.prepare('INSERT INTO transactions(type,amount,date,category,notes,from_account_id,to_account_id,fee_amount) VALUES (?,?,?,?,?,?,?,?)').run(...values).lastInsertRowid;
  })();
}
function deleteTransaction(db, id) {
  db.transaction(() => {
    const old = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
    if (!old) fail('Transaction not found', 404);
    apply(db, old, -1);
    db.prepare('DELETE FROM transactions WHERE id = ?').run(id);
  })();
}
module.exports = { saveTransaction, deleteTransaction };
