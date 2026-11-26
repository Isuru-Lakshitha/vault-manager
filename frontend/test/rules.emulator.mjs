// Integration gate: run only against the local demo project, never production.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, doc, setDoc, getDoc, deleteDoc, writeBatch } from 'firebase/firestore';
const host = process.env.FIRESTORE_EMULATOR_HOST;
if (!host || !/^(127\.0\.0\.1|localhost):\d+$/.test(host)) throw new Error('Start the local Firestore emulator and set FIRESTORE_EMULATOR_HOST=127.0.0.1:8080');
await fetch(`http://${host}`, { signal: AbortSignal.timeout(2000) });
const apps = [];
function client(uid) {
 const app=initializeApp({projectId:'demo-money-manager',apiKey:'demo-key'},uid||'anonymous');apps.push(app);
 const db=getFirestore(app);const [hostname,port]=host.split(':');
 connectFirestoreEmulator(db,hostname,Number(port),uid?{mockUserToken:{sub:uid,user_id:uid,email:`${uid}@example.com`}}:{});return db;
}
const alice=client('alice'),bob=client('bob'),anonymous=client();
const prefix=String(Date.now());
const account=id=>`${prefix}-${id}`;
const tx={uid:'alice',type:'Transfer',amount:100,date:'2026-10-21',fee_amount:0,from_account_id:account('bank'),to_account_id:account('cash')};
await setDoc(doc(alice,'accounts',account('bank')),{uid:'alice',name:'Bank',type:'Bank',balance:1000});
await setDoc(doc(alice,'accounts',account('cash')),{uid:'alice',name:'Cash',type:'Cash',balance:200});
await setDoc(doc(bob,'accounts',account('bob')),{uid:'bob',name:'Private',type:'Bank',balance:50});
const denied=promise=>assert.rejects(promise,error=>error.code==='permission-denied');
after(async()=>{await Promise.all(apps.map(deleteApp))});
test('unauthenticated and foreign users cannot read accounts',async()=>{
 await denied(getDoc(doc(anonymous,'accounts',account('bank'))));await denied(getDoc(doc(bob,'accounts',account('bank'))));
});
test('valid financial records succeed while negative, invalid-type and cross-owner records fail',async()=>{
 await setDoc(doc(alice,'transactions',account('valid')),tx);
 for(const [index,patch] of [{amount:-1},{amount:'100'},{fee_amount:-1},{type:'invalid'},{to_account_id:account('bob')},{from_account_id:account('bank'),to_account_id:account('bank')},{uid:'bob'}].entries())
  await denied(setDoc(doc(alice,'transactions',account('bad'+index)),{...tx,...patch}));
});
test('account ownership is immutable',async()=>{
 await denied(setDoc(doc(alice,'accounts',account('bank')),{uid:'bob',name:'Bank',type:'Bank',balance:1000}));
});
test('user subcollections cannot bypass financial validation',async()=>{
 await denied(setDoc(doc(alice,'users','alice','bills',account('invalid')),{name:'Bill',amount:-1,due_date:'2026-10-21'}));
 await setDoc(doc(alice,'users','alice','bills',account('valid')),{name:'Bill',amount:20,due_date:'2026-10-21'});
 await denied(setDoc(doc(alice,'users','bob','bills',account('other')),{name:'Bill',amount:20,due_date:'2026-10-21'}));
});
test('fee reporting rows require a matching parent in the same atomic write',async()=>{
 const parent=account('parent'),feeId=account('fee');
 const fee={uid:'alice',type:'Expense',amount:5,date:tx.date,from_account_id:tx.from_account_id,is_transfer_fee:true,parent_transaction_id:parent};
 await denied(setDoc(doc(alice,'transactions',feeId),fee));
 const batch=writeBatch(alice);batch.set(doc(alice,'transactions',parent),{...tx,fee_amount:5,fee_transaction_id:feeId});batch.set(doc(alice,'transactions',feeId),fee);await batch.commit();
});

test('authenticated absent-document reads support idempotent creation without exposing existing foreign records',async()=>{
 assert.equal((await getDoc(doc(alice,'transactions',account('not-created')))).exists(),false);
 await denied(getDoc(doc(anonymous,'transactions',account('not-created'))));
});

test('account balance updates require a matching ledger transaction while non-balance metadata edits succeed directly',async()=>{
 // Updating name without changing balance succeeds without last_ledger_ref
 await setDoc(doc(alice,'accounts',account('bank')),{uid:'alice',name:'Primary Bank',type:'Bank',balance:1000});
 // Direct balance tamper without last_ledger_ref / last_ledger_op is denied
 await denied(setDoc(doc(alice,'accounts',account('bank')),{uid:'alice',name:'Primary Bank',type:'Bank',balance:999999}));
 // Atomic batch with mismatched delta is denied
 const badTxId=account('bad-ledger-tx');
 const badBatch=writeBatch(alice);
 badBatch.set(doc(alice,'transactions',badTxId),{uid:'alice',type:'Expense',amount:50,date:'2026-10-21',fee_amount:0,from_account_id:account('bank')});
 badBatch.set(doc(alice,'accounts',account('bank')),{uid:'alice',name:'Primary Bank',type:'Bank',balance:800,last_ledger_ref:badTxId,last_ledger_op:'create'});
 await denied(badBatch.commit());
 // Atomic batch with matching new transaction succeeds
 const okTxId=account('ok-ledger-tx');
 const okBatch=writeBatch(alice);
 okBatch.set(doc(alice,'transactions',okTxId),{uid:'alice',type:'Expense',amount:50,date:'2026-10-21',fee_amount:0,from_account_id:account('bank')});
 okBatch.set(doc(alice,'accounts',account('bank')),{uid:'alice',name:'Primary Bank',type:'Bank',balance:950,last_ledger_ref:okTxId,last_ledger_op:'create'});
 await okBatch.commit();
});

test('error_logs subcollection accepts valid owner entries and rejects oversized or foreign writes',async()=>{
 await setDoc(doc(alice,'users','alice','error_logs',account('log1')),{message:'Unhandled error',stack:'at app.js:1',url:'https://app.local',ua:'Mozilla/5.0',ts:'2026-10-21T00:00:00Z',level:'error',app_version:'1.0.0',context:'window.onerror'});
 await denied(setDoc(doc(alice,'users','alice','error_logs',account('log-big')),{message:'x'.repeat(1001),level:'error'}));
 await denied(setDoc(doc(bob,'users','alice','error_logs',account('log-foreign')),{message:'Foreign write',level:'error'}));
});

test('users can delete their own user_directory entry while foreign users cannot',async()=>{
 await setDoc(doc(alice,'user_directory','alice'),{uid:'alice',email:'alice@example.com'});
 await denied(deleteDoc(doc(bob,'user_directory','alice')));
 await deleteDoc(doc(alice,'user_directory','alice'));
});
test('nobody can create or take over another user\'s prefs doc', async () => {
 await denied(setDoc(doc(bob, 'user_prefs', 'alice'), { uid: 'bob', currency: 'USD' }));
 await denied(setDoc(doc(bob, 'user_prefs', 'alice'), { currency: 'USD' }));
 await setDoc(doc(alice, 'user_prefs', 'alice'), { currency: 'LKR' }, { merge: true });
 await denied(getDoc(doc(bob, 'user_prefs', 'alice')));
 await denied(setDoc(doc(alice, 'user_prefs', 'alice'), { uid: 'bob' }, { merge: true }));
});
test('draft transaction ids belong to their owner only', async () => {
 await denied(setDoc(doc(bob, 'transactions', `alice_draft_${prefix}`), { ...tx, uid: 'bob', from_account_id: account('bob'), to_account_id: null, type: 'Expense' }));
 await setDoc(doc(alice, 'transactions', `alice_draft_${prefix}`), { ...tx });
});
test('net worth snapshots must be numeric and use the owner id', async () => {
 const today = '2026-11-26';
 await setDoc(doc(alice, 'net_worth_snapshots', `alice_${prefix}`), { uid: 'alice', date: today, netWorth: 10, assets: 20, liabilities: 10 });
 await denied(setDoc(doc(alice, 'net_worth_snapshots', `bob_${prefix}`), { uid: 'alice', date: today, netWorth: 10, assets: 20, liabilities: 10 }));
 await denied(setDoc(doc(alice, 'net_worth_snapshots', `alice_${prefix}x`), { uid: 'alice', date: today, netWorth: 'lots', assets: 20, liabilities: 10 }));
});
test('a suspended user cannot read or write their data or remove the suspension', async () => {
 const carol = client('carol');
 await setDoc(doc(carol, 'user_directory', 'carol'), { uid: 'carol', email: 'carol@example.com', created_at: '2026-11-26', last_active: '2026-11-26' });
 await setDoc(doc(carol, 'accounts', account('carol')), { uid: 'carol', name: 'Bank', type: 'Bank', balance: 10 });
 // Suspend as the emulator admin (rules bypass), the same effect as the admin panel.
 const res = await fetch(`http://${host}/v1/projects/demo-money-manager/databases/(default)/documents/user_directory/carol?updateMask.fieldPaths=status`, {
  method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
  body: JSON.stringify({ fields: { status: { stringValue: 'Suspended' } } }),
 });
 assert.equal(res.ok, true);
 await denied(getDoc(doc(carol, 'accounts', account('carol'))));
 await denied(setDoc(doc(carol, 'accounts', account('carol2')), { uid: 'carol', name: 'New', type: 'Bank', balance: 0 }));
 await denied(setDoc(doc(carol, 'users', 'carol', 'ious', 'x'), { amount: 1 }));
 await denied(deleteDoc(doc(carol, 'user_directory', 'carol')));
});
