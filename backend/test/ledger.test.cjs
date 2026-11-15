const { test } = require('node:test');
const assert = require('node:assert/strict');
const { openDatabase } = require('../db');
const { saveTransaction, deleteTransaction } = require('../ledger');
const { authenticate } = require('../auth');
function fixture(t) {
  const db = openDatabase(':memory:');
  t.after(() => db.close());
  db.prepare('INSERT INTO accounts(name,type,balance) VALUES (?,?,?)').run('Bank','Bank',1000);
  db.prepare('INSERT INTO accounts(name,type,balance) VALUES (?,?,?)').run('Cash','Cash',200);
  return db;
}
const transfer = { type:'Transfer', amount:100, fee_amount:5, date:'2026-10-21', from_account_id:1, to_account_id:2 };
const balances = db => db.prepare('SELECT balance FROM accounts ORDER BY id').all().map(x=>x.balance);
test('transfer create, edit, and delete reconcile both accounts including fees', t => {
 const db=fixture(t); const id=saveTransaction(db,transfer);
 assert.deepEqual(balances(db),[895,300]);
 saveTransaction(db,{...transfer,amount:50,fee_amount:2},id);
 assert.deepEqual(balances(db),[948,250]);
 deleteTransaction(db,id); assert.deepEqual(balances(db),[1000,200]);
 assert.equal(db.prepare('SELECT count(*) n FROM transactions').get().n,0);
});
test('changing a transfer into income reverses the original fee and principal',t=>{
 const db=fixture(t);const id=saveTransaction(db,transfer);
 saveTransaction(db,{type:'Income',amount:25,date:'2026-10-21',to_account_id:2},id);
 assert.deepEqual(balances(db),[1000,225]);deleteTransaction(db,id);assert.deepEqual(balances(db),[1000,200]);
});
test('invalid writes leave both the ledger and balances unchanged',t=>{
 const db=fixture(t); const id=saveTransaction(db,transfer);
 for(const patch of [{amount:-5},{amount:NaN},{amount:Infinity},{amount:'50'},{fee_amount:-1},{amount:.001},{to_account_id:99},{to_account_id:1},{date:'2026-02-30'}]) {
  assert.throws(()=>saveTransaction(db,{...transfer,...patch},id));assert.deepEqual(balances(db),[895,300]);
 }
 assert.equal(db.prepare('SELECT amount FROM transactions WHERE id=?').get(id).amount,100);
});
test('SQL write failure rolls back earlier balance changes',t=>{
 const db=fixture(t);
 db.exec("CREATE TRIGGER reject_transaction BEFORE INSERT ON transactions BEGIN SELECT RAISE(ABORT, 'test failure'); END;");
 assert.throws(()=>saveTransaction(db,transfer)); assert.deepEqual(balances(db),[1000,200]);
});
test('decimal transactions do not accumulate floating point drift',t=>{
 const db=fixture(t);for(let n=0;n<100;n++)saveTransaction(db,{type:'Expense',amount:.01,date:'2026-10-21',from_account_id:1});
 assert.deepEqual(balances(db),[999,200]);
});
test('accounts with ledger references cannot be deleted',t=>{
 const db=fixture(t);saveTransaction(db,transfer);assert.throws(()=>db.prepare('DELETE FROM accounts WHERE id=1').run());
});
test('loan payments cannot be edited as ordinary transactions',t=>{
 const db=fixture(t);const id=db.prepare("INSERT INTO transactions(type,amount,date,from_account_id) VALUES ('Loan Payment',10,'2026-10-21',1)").run().lastInsertRowid;
 assert.throws(()=>deleteTransaction(db,id));assert.deepEqual(balances(db),[1000,200]);
});
test('authentication rejects missing, malformed, invalid, and revoked tokens',async()=>{
 for(const header of [undefined,'Basic abc','Bearer bad','Bearer revoked']) {
  let status=0, called=false;
  await authenticate(async()=>{throw new Error('invalid')})({headers:{authorization:header}},{status(n){status=n;return this},json(){}},()=>{called=true});
  assert.equal(status,401);assert.equal(called,false);
 }
});
test('verified token determines identity, not a body UID',async()=>{
 const req={headers:{authorization:'Bearer valid'},body:{uid:'victim'}};let called=false;
 await authenticate(async token=>{assert.equal(token,'valid');return {uid:'actual-user'}})(req,{},()=>{called=true});
 assert.equal(req.user.uid,'actual-user');assert.ok(called);
});
