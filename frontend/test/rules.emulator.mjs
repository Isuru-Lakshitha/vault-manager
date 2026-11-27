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

function tokenClient(name, token) {
 const app=initializeApp({projectId:'demo-money-manager',apiKey:'demo-key'},name);apps.push(app);
 const db=getFirestore(app);const [hostname,port]=host.split(':');
 connectFirestoreEmulator(db,hostname,Number(port),{mockUserToken:token});return db;
}

test('admin access follows the admin claim, not the admin email address', async () => {
 const claimAdmin=tokenClient('claim-admin',{sub:'boss',user_id:'boss',email:'boss@example.com',admin:true});
 const emailOnly=tokenClient('email-only',{sub:'imposter',user_id:'imposter',email:'isuru@moneymanager.app',email_verified:true});
 await setDoc(doc(claimAdmin,'system_config','global'),{announcement:null,maintenance:null,updated_at:'2026-11-26'});
 await denied(setDoc(doc(emailOnly,'system_config','global'),{announcement:null,maintenance:null,updated_at:'2026-11-26'}));
});

test('card balances change only together with the transaction that explains them', async () => {
 const card=account('card'),cardRef=doc(alice,'credit_cards',card);
 const base={uid:'alice',name:'Visa',credit_limit:1000};
 await setDoc(cardRef,{...base,balance:100});
 // Renaming without touching the balance needs no proof; a bare balance write is refused.
 await setDoc(cardRef,{...base,name:'Visa Gold',balance:100});
 await denied(setDoc(cardRef,{...base,balance:0}));

 // Charge: +25 with its transaction.
 const charge=account('charge');
 const chargeTx={uid:'alice',type:'Expense',amount:25,date:'2026-11-20',category:'Shopping',from_account_id:null,to_account_id:null,credit_card_charge_id:card};
 let b=writeBatch(alice);b.set(doc(alice,'transactions',charge),chargeTx);b.set(cardRef,{...base,balance:125,last_ledger_ref:charge,last_ledger_op:'create'});await b.commit();
 // A charge whose amount doesn't match the balance change is refused.
 const lie=account('lie');
 b=writeBatch(alice);b.set(doc(alice,'transactions',lie),{...chargeTx,amount:1});b.set(cardRef,{...base,balance:999,last_ledger_ref:lie,last_ledger_op:'create'});await denied(b.commit());

 // Payment: -25 with its transaction (no account deducted).
 const pay=account('pay');
 const payTx={uid:'alice',type:'Expense',amount:25,date:'2026-11-21',category:'Credit Card Payment',from_account_id:null,to_account_id:null,credit_card_id:card};
 b=writeBatch(alice);b.set(doc(alice,'transactions',pay),payTx);b.set(cardRef,{...base,balance:100,last_ledger_ref:pay,last_ledger_op:'create'});await b.commit();

 // Editing the charge 25 -> 30 moves the card by +5 only.
 b=writeBatch(alice);b.set(doc(alice,'transactions',charge),{...chargeTx,amount:30});b.set(cardRef,{...base,balance:150,last_ledger_ref:charge,last_ledger_op:'update'});await denied(b.commit());
 b=writeBatch(alice);b.set(doc(alice,'transactions',charge),{...chargeTx,amount:30});b.set(cardRef,{...base,balance:105,last_ledger_ref:charge,last_ledger_op:'update'});await b.commit();

 // Reversing the payment puts its 25 back, once.
 const rev=account('rev');
 const reverse=(balance=130)=>{const w=writeBatch(alice);w.set(doc(alice,'transactions',pay),{...payTx,reversed_at:'2026-11-22T00:00:00Z',reversed_by:rev});
  w.set(doc(alice,'transactions',rev),{uid:'alice',type:'Income',amount:25,date:'2026-11-22',category:'Payment reversal',reversal_of:pay,from_account_id:null,to_account_id:null});
  w.set(cardRef,{...base,balance,last_ledger_ref:pay,last_ledger_op:'reverse_payment'});return w.commit();};
 await reverse();
 await denied(reverse(155)); // already reversed: can't add the 25 again
 // A reversed payment can't be deleted or un-reversed to add its 25 again.
 b=writeBatch(alice);b.delete(doc(alice,'transactions',pay));b.set(cardRef,{...base,balance:155,last_ledger_ref:pay,last_ledger_op:'delete'});await denied(b.commit());
 await denied(setDoc(doc(alice,'transactions',pay),{...payTx,reversed_at:null}));
 // A charge can't point at someone else's card.
 await setDoc(doc(bob,'credit_cards',account('bobcard')),{uid:'bob',name:'Bob',credit_limit:1,balance:0});
 await denied(setDoc(doc(alice,'transactions',account('junk')),{...chargeTx,credit_card_charge_id:account('bobcard')}));

 // Deleting the 30 charge takes 30 off; with less than that left it stops at 0.
 await setDoc(cardRef,{...base,balance:130,has_payment_history:true});
 b=writeBatch(alice);b.delete(doc(alice,'transactions',charge));b.set(cardRef,{...base,balance:0,last_ledger_ref:charge,last_ledger_op:'delete'});await denied(b.commit());
 b=writeBatch(alice);b.delete(doc(alice,'transactions',charge));b.set(cardRef,{...base,balance:100,last_ledger_ref:charge,last_ledger_op:'delete'});await b.commit();
 // A charge bigger than what's left: deleting it stops the card at 0.
 const big=account('big');
 b=writeBatch(alice);b.set(doc(alice,'transactions',big),{...chargeTx,amount:30});b.set(cardRef,{...base,balance:130,has_payment_history:true,last_ledger_ref:big,last_ledger_op:'create'});await b.commit();
 await setDoc(cardRef,{...base,balance:130,has_payment_history:true,last_ledger_ref:big,last_ledger_op:'create',note:'x'});
 const c2=account('c2');
 b=writeBatch(alice);b.set(doc(alice,'transactions',c2),{...payTx,amount:120});b.set(cardRef,{...base,balance:10,last_ledger_ref:c2,last_ledger_op:'create'});await b.commit();
 b=writeBatch(alice);b.delete(doc(alice,'transactions',big));b.set(cardRef,{...base,balance:0,last_ledger_ref:big,last_ledger_op:'delete'});await b.commit();
});

test('guest (anonymous) users get their own data and a directory entry without an email', async () => {
 const guest=tokenClient('guest',{sub:'guest1',user_id:'guest1',firebase:{sign_in_provider:'anonymous'}});
 await setDoc(doc(guest,'user_directory','guest1'),{uid:'guest1',email:null,created_at:'2026-11-27',last_active:'2026-11-27'});
 await denied(setDoc(doc(guest,'user_directory','guest1'),{uid:'guest1',email:'someone@example.com',created_at:'2026-11-27',last_active:'2026-11-27'}));
 const acc=account('guest-acc');
 await setDoc(doc(guest,'accounts',acc),{uid:'guest1',name:'Cash',type:'Cash',balance:0});
 await denied(getDoc(doc(alice,'accounts',acc)));
});
