import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
let records, sequence, failCommit, failReads;
const storage = new Map();
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) }, configurable: true });
const snapshot = (path, source = records) => ({ exists:()=>source.has(path), data:()=>structuredClone(source.get(path)), id:path.split('/').at(-1) });
const adapter = {
 db:{}, auth:{currentUser:{uid:'alice'}},
 collection:(_, ...parts)=>({path:parts.join('/')}),
 doc:(base,...parts)=>{ const path=base.path ? `${base.path}/${parts[0] || `id${++sequence}`}` : parts.join('/'); return {path,id:path.split('/').at(-1)}; },
 getDoc:async ref=>snapshot(ref.path), where:(field,operator,value)=>({field,value}),
 query:(base,...filters)=>({...base,filters}),
 getDocs:async ref=>{
  if (failReads) throw new Error('Offline');
  const docs=[...records.keys()].filter(key=>key.startsWith(ref.path+'/') && !key.slice(ref.path.length+1).includes('/'))
    .filter(key=>(ref.filters||[]).every(f=>records.get(key)[f.field]===f.value)).map(key=>snapshot(key));
  return {docs,empty:docs.length===0};
 },
 runTransaction:async (_,callback)=>{
  for(let attempt=0;attempt<10;attempt++){
  const original=records;const staged=structuredClone(records);let writing=false;
  const transaction={
   get:async ref=>{if(writing)throw new Error('Reads must precede writes');return snapshot(ref.path,staged)},
   update:(ref,data)=>{writing=true;if(!staged.has(ref.path))throw new Error('Missing document');staged.set(ref.path,{...staged.get(ref.path),...structuredClone(data)})},
   set:(ref,data)=>{writing=true;staged.set(ref.path,structuredClone(data))},
   delete:ref=>{writing=true;staged.delete(ref.path)}
  };
  const result=await callback(transaction);if(failCommit)throw new Error('Permission denied');if(records!==original)continue;records=staged;return result;
  }
  throw new Error('Concurrent retry limit');
 }
};
globalThis.__vaultTest=adapter;globalThis.window={dispatchEvent(){}};globalThis.CustomEvent=class {};
const modules={
 './firebase':`export const {db,auth}=globalThis.__vaultTest;`,
 'firebase/firestore':`export const {collection,doc,getDoc,getDocs,query,where,runTransaction}=globalThis.__vaultTest; export const deleteField=()=>null; export const setDoc=()=>{},addDoc=()=>{},updateDoc=()=>{},deleteDoc=()=>{},orderBy=()=>{},writeBatch=()=>{},serverTimestamp=()=>{},onSnapshot=()=>{};`,
 './rulesEngine':`export const DEFAULT_RULES=[]; export const executeRulesOnTransaction=(_,transaction)=>({transaction});`,
 './dates':`export const todayYMD=()=> '2026-10-21';`, './format':`export const formatCurrency=String; export const getCurrency=()=> 'LKR';`
};
const hooks=registerHooks({resolve(specifier,context,next){if(context.parentURL?.endsWith('/utils/api.js') && modules[specifier])return {url:'data:text/javascript,'+encodeURIComponent(modules[specifier]),shortCircuit:true};return next(specifier,context)}});
const api=await import('../src/utils/api.js');hooks.deregister();
beforeEach(()=>{records=new Map([['accounts/bank',{uid:'alice',balance:1000}],['accounts/cash',{uid:'alice',balance:200}]]);sequence=0;failCommit=false;failReads=false;adapter.auth.currentUser={uid:'alice'};storage.clear();api.invalidateCache()});
const transfer={type:'Transfer',amount:100,fee_amount:5,date:'2026-10-21',from_account_id:'bank',to_account_id:'cash'};
const txs=()=>[...records.entries()].filter(([k])=>k.startsWith('transactions/'));
test('API links fees through transfer create, edit and delete',async()=>{
 const {item}=await api.createTransaction(transfer);assert.equal(txs().length,2);assert.equal(records.get('accounts/bank').balance,895);
 await api.updateTransaction(item.id,{amount:60,fee_amount:3});assert.equal(txs().length,2);assert.equal(records.get('transactions/'+item.fee_transaction_id).amount,3);assert.equal(records.get('accounts/bank').balance,937);
 await api.deleteTransaction(item.id);assert.equal(txs().length,0);assert.equal(records.get('accounts/bank').balance,1000);assert.equal(records.get('accounts/cash').balance,200);
});
test('API removes reporting fee when fee is removed or type changes',async()=>{
 const {item}=await api.createTransaction(transfer);await api.updateTransaction(item.id,{fee_amount:0});assert.equal(txs().length,1);
 await api.updateTransaction(item.id,{type:'Income',amount:20,to_account_id:'bank'});assert.equal(records.get('accounts/bank').balance,1020);assert.equal(records.get('accounts/cash').balance,200);
});
test('failed commits and cross-user references never alter balances',async()=>{
 failCommit=true;await assert.rejects(api.createTransaction(transfer));assert.equal(records.get('accounts/bank').balance,1000);assert.equal(txs().length,0);
 failCommit=false;records.set('accounts/cash',{uid:'bob',balance:200});await assert.rejects(api.createTransaction(transfer));assert.equal(txs().length,0);
});
test('generated fees cannot be deleted independently',async()=>{
 const {item}=await api.createTransaction(transfer);await assert.rejects(api.deleteTransaction(item.fee_transaction_id),/parent transfer/);assert.equal(txs().length,2);
});
test('legacy fee matching is safe and refuses ambiguous duplicates',async()=>{
 records.set('transactions/old',{...transfer,uid:'alice'});
 const fee={type:'Expense',amount:5,date:transfer.date,from_account_id:'bank',notes:'Transfer fee for transfer',is_transfer_fee:true,uid:'alice'};
 records.set('transactions/fee1',fee);records.set('transactions/fee2',fee);
 await assert.rejects(api.deleteTransaction('old'),/ambiguous/);assert.equal(txs().length,3);
 records.delete('transactions/fee2');records.get('accounts/bank').balance=895;records.get('accounts/cash').balance=300;
 await api.deleteTransaction('old');assert.equal(txs().length,0);assert.equal(records.get('accounts/bank').balance,1000);
});
test('card payment atomically updates card, account and transaction',async()=>{
 records.set('credit_cards/card',{uid:'alice',name:'Visa',balance:80});
 await api.recordCardPayment({id:'card'},25,'bank');assert.equal(records.get('credit_cards/card').balance,55);assert.equal(records.get('accounts/bank').balance,975);assert.equal(txs().length,1);
 await assert.rejects(api.recordCardPayment({id:'card'},100,'bank'));assert.equal(records.get('accounts/bank').balance,975);
 failCommit=true;await assert.rejects(api.recordCardPayment({id:'card'},10,'bank'));assert.equal(records.get('credit_cards/card').balance,55);
});
test('card charge atomically updates card balance and optionally logs category expense without bank deduction',async()=>{
 records.set('credit_cards/card',{uid:'alice',name:'Visa',balance:80});
 await api.recordCardCharge({id:'card',name:'Visa'},{amount:45,date:'2026-10-21',category:'Groceries',notes:'Keells',logTransaction:true});
 assert.equal(records.get('credit_cards/card').balance,125);
 assert.equal(records.get('accounts/bank').balance,1000);
 assert.equal(txs().length,1);
 assert.equal(txs()[0][1].category,'Groceries');
 assert.equal(txs()[0][1].from_account_id,null);
});
test('loan payment rejects invalid dates and overpayment before commit',async()=>{
 records.set('loans/loan',{uid:'alice',item_name:'Loan',principal_amount:100,annual_interest_rate:0,unpaid_interest:0,start_date:'2026-10-01',last_interest_calc_date:'2026-10-01'});
 await assert.rejects(api.payLoan('loan',{amount:101,date:'2026-10-21',account_id:'bank'}));assert.equal(records.get('accounts/bank').balance,1000);
 await assert.rejects(api.payLoan('loan',{amount:1,date:'2026-09-21',account_id:'bank'}));
 await api.payLoan('loan',{amount:25,date:'2026-10-21',account_id:'bank'});assert.equal(records.get('loans/loan').principal_amount,75);assert.equal(records.get('accounts/bank').balance,975);
});
test('failed edit and delete keep the parent, fee and balances intact',async()=>{
 const {item}=await api.createTransaction(transfer);const previous=structuredClone(records);failCommit=true;
 await assert.rejects(api.updateTransaction(item.id,{amount:200}));assert.deepEqual(records,previous);
 await assert.rejects(api.deleteTransaction(item.id));assert.deepEqual(records,previous);
});
test('accounts with transaction history cannot be deleted from the app',async()=>{
 await api.createTransaction(transfer);await assert.rejects(api.deleteAccount('bank'),/transaction history/);assert.ok(records.has('accounts/bank'));
});
test('bill payment commits debit, transaction and next due date together',async()=>{
 const bill={id:'bill',name:'Rent',amount:100,frequency:'Monthly',due_date:'2026-01-31',paid:false};
 records.set('users/alice/bills/bill',bill);
 await api.payBill(bill,{amount:100,account_id:'bank',date:'2026-01-31'});
 assert.equal(records.get('accounts/bank').balance,900);assert.equal(records.get('users/alice/bills/bill').due_date,'2026-02-28');assert.equal(txs().length,1);
 await assert.rejects(api.payBill(bill,{amount:100,account_id:'bank',date:'2026-01-31'}),/already changed/);assert.equal(txs().length,1);
});
test('failed bill commit leaves the account, bill and ledger unchanged',async()=>{
 const bill={id:'bill',name:'Rent',amount:100,frequency:'Once',due_date:'2026-01-31',paid:false};records.set('users/alice/bills/bill',bill);
 failCommit=true;await assert.rejects(api.payBill(bill,{amount:100,account_id:'bank',date:'2026-01-31'}));
 assert.equal(records.get('accounts/bank').balance,1000);assert.equal(records.get('users/alice/bills/bill').paid,false);assert.equal(txs().length,0);
});
test('bulk rules cannot mutate monetary fields',async()=>{
 await assert.rejects(api.batchUpdateTransactions([{id:'x',changes:{amount:20}}]),/descriptive/);
});
test('offline invoices and rules are isolated between signed-in users',async()=>{
 failReads=true;
 storage.set('vm_invoices:alice',JSON.stringify([{id:'private-alice'}]));
 storage.set('vm_transaction_rules:alice',JSON.stringify([{id:'alice-rule'}]));
 assert.equal((await api.fetchInvoices())[0].id,'private-alice');
 assert.equal((await api.fetchRules())[0].id,'alice-rule');
 adapter.auth.currentUser={uid:'bob'};api.invalidateCache();
 assert.deepEqual(await api.fetchInvoices(),[]);assert.deepEqual(await api.fetchRules(),[]);
});
test('first invoice save initializes the local cache before storing its offline copy',async()=>{
 await api.saveInvoice({id:'first',customer:'Client',total:50});
 const local=JSON.parse(storage.get('vm_invoices:alice'));
 assert.equal(local.length,1);assert.equal(local[0].id,'first');
});

test('recurring payment retries create one debit and one monthly history entry', async () => {
 const rule={id:'rent',uid:'alice',name:'Rent',type:'Expense',amount:100,from_account_id:'bank'};
 records.set('recurring_transactions/rent',rule);
 await api.payRecurringRule(rule); const repeat=await api.payRecurringRule(rule);
 assert.equal(repeat.alreadyPaid,true);assert.equal(records.get('accounts/bank').balance,900);assert.equal(txs().length,1);
 assert.equal(records.get('recurring_transactions/rent').payment_history.length,1);
});
test('recurring failed commit leaves payment, history and loan unchanged',async()=>{
 const rule={id:'loan-rule',uid:'alice',name:'Loan',loan_id:'loan',amount:25,from_account_id:'bank'};
 records.set('recurring_transactions/loan-rule',rule);records.set('loans/loan',{uid:'alice',principal_amount:100,start_date:'2026-10-01',annual_interest_rate:0});
 const before=structuredClone(records);failCommit=true;await assert.rejects(api.payRecurringRule(rule));assert.deepEqual(records,before);
 failCommit=false;await api.payRecurringRule(rule);assert.equal(records.get('loans/loan').principal_amount,75);
});
test('archive preserves history and blocks new payments until restored',async()=>{
 await api.setAccountArchived('bank',true);await assert.rejects(api.createTransaction(transfer),/archived/);
 assert.equal(records.get('accounts/bank').balance,1000);await api.setAccountArchived('bank',false);await api.createTransaction(transfer);assert.equal(txs().length,2);
});
test('cross-currency transfers require received amount and reverse both actual amounts',async()=>{
 records.get('accounts/bank').currency='USD';records.get('accounts/cash').currency='LKR';
 await assert.rejects(api.createTransaction(transfer),/actual amount received/);
 const {item}=await api.createTransaction({...transfer,destination_amount:30000});assert.equal(records.get('accounts/cash').balance,30200);
 await api.deleteTransaction(item.id);assert.equal(records.get('accounts/cash').balance,200);assert.equal(records.get('accounts/bank').balance,1000);
});
test('card reversal restores balances, retains audit and cannot be repeated',async()=>{
 records.set('credit_cards/card',{uid:'alice',name:'Visa',balance:80});await api.recordCardPayment({id:'card'},25,'bank');
 const id=txs()[0][0].split('/')[1];await api.reversePayment(id,'Wrong payment');
 assert.equal(records.get('accounts/bank').balance,1000);assert.equal(records.get('credit_cards/card').balance,80);assert.equal(txs().length,2);
 assert.ok(records.get('transactions/'+id).reversed_at);await assert.rejects(api.reversePayment(id,'Repeat'),/already reversed/);
 await assert.rejects(api.deleteTransaction(id+'_reversal'),/audit/);
});
test('reversal rejects later linked changes and failed commit rolls back',async()=>{
 records.set('credit_cards/card',{uid:'alice',name:'Visa',balance:80});await api.recordCardPayment({id:'card'},25,'bank');
 const id=txs()[0][0].split('/')[1];records.get('credit_cards/card').balance=40;
 await assert.rejects(api.reversePayment(id,'Correction'),/later change/);assert.equal(records.get('accounts/bank').balance,975);
 records.get('credit_cards/card').balance=55;const before=structuredClone(records);failCommit=true;await assert.rejects(api.reversePayment(id,'Correction'));assert.deepEqual(records,before);
});
test('recurring reversal permits a corrected payment in the same cycle',async()=>{
 const rule={id:'rent',uid:'alice',name:'Rent',type:'Expense',amount:100,from_account_id:'bank'};records.set('recurring_transactions/rent',rule);
 await api.payRecurringRule(rule);await api.reversePayment(txs()[0][0].split('/')[1],'Wrong amount');await api.payRecurringRule(rule,{amount:80});
 assert.equal(records.get('accounts/bank').balance,920);assert.equal(records.get('recurring_transactions/rent').payment_history.length,1);
});
test('offline draft submission IDs remain idempotent across retries',async()=>{
 await api.createTransaction(transfer,'draft-123');await api.createTransaction(transfer,'draft-123');
 assert.equal(records.get('accounts/bank').balance,895);assert.equal(txs().length,2);
});
test('receipt content is deduplicated per user and never served from another user cache',async()=>{
 const image='data:image/png;base64,AAAA';const first=await api.saveReceipt(image);const second=await api.saveReceipt(image);assert.equal(first,second);
 assert.equal([...records.keys()].filter(key=>key.startsWith('receipts/')).length,1);assert.equal(await api.resolveReceipt('receipt:'+first),image);
 adapter.auth.currentUser={uid:'bob'};assert.equal(await api.resolveReceipt('receipt:'+first),null);
});
test('draft sync rejects an account switch and account currency cannot rewrite history',async()=>{
 await assert.rejects(api.createTransaction(transfer,'pending-draft','bob'),/Account changed/);assert.equal(txs().length,0);
 await api.createTransaction(transfer);await assert.rejects(api.updateAccount('bank',{currency:'USD'}),/transaction history/);
});
test('cross-currency linked payments fail without changing either balance',async()=>{
 records.get('accounts/bank').currency='USD';records.set('credit_cards/card',{uid:'alice',name:'Card',currency:'LKR',balance:100});
 const before=structuredClone(records);await assert.rejects(api.recordCardPayment({id:'card'},25,'bank'),/Transfer into a LKR account/);assert.deepEqual(records,before);
 records.set('loans/loan',{uid:'alice',currency:'LKR',principal_amount:100,start_date:'2026-10-01',annual_interest_rate:0});
 await assert.rejects(api.payLoan('loan',{amount:25,date:'2026-10-21',account_id:'bank'}),/Transfer into/);
 records.set('goals/goal',{uid:'alice',currency:'LKR',current_amount:50,target_amount:100});
 await assert.rejects(api.contributeGoal('goal',{amount:10,account_id:'bank'}),/Transfer into/);
});
test('linked entities cannot be deleted and failed deletion leaves caches intact',async()=>{
 for(const [section,field,remove] of [['loans','loan_id',api.deleteLoan],['goals','goal_id',api.deleteGoal],['credit_cards','credit_card_id',api.deleteCreditCard]]) {
  records.set(section+'/linked',{uid:'alice'});records.set('transactions/ref',{uid:'alice',[field]:'linked'});
  await assert.rejects(remove('linked'),/payment history/);assert.ok(records.has(section+'/linked'));records.delete('transactions/ref');
  records.get(section+'/linked').has_payment_history=true;await assert.rejects(remove('linked'),/payment history/);
 }
 records.set('loans/empty',{uid:'alice'});await api.deleteLoan('empty');assert.equal(records.has('loans/empty'),false);
});
test('reconciliation atomically records correction and rejects stale balance',async()=>{
 await api.reconcileBalance('bank',1000,980,'Statement check');assert.equal(records.get('accounts/bank').balance,980);assert.equal(txs()[0][1].amount,20);
 const before=structuredClone(records);await assert.rejects(api.reconcileBalance('bank',1000,990,'Old form'),/balance changed/);assert.deepEqual(records,before);
 failCommit=true;await assert.rejects(api.reconcileBalance('bank',980,900,'Denied'));assert.deepEqual(records,before);
});

const invoiceFixture = {uid:'alice',status:'Sent',currency:'LKR',invoiceNumber:'TEST-1',items:[{quantity:2,unitPrice:25}],taxRate:10};
test('invoice settlement retries and concurrent submissions create exactly one deposit',async()=>{
 records.set('users/alice/invoices/inv',invoiceFixture);
 await Promise.all([api.settleInvoice('inv','bank'),api.settleInvoice('inv','bank')]);
 await api.settleInvoice('inv','bank');
 assert.equal(records.get('accounts/bank').balance,1055);assert.equal(txs().length,1);
 const inv=records.get('users/alice/invoices/inv');assert.equal(inv.status,'Paid');assert.equal(txs()[0][1].invoice_id,'inv');
 await assert.rejects(api.updateTransaction(inv.payment_transaction_id,{amount:1}),/Invoice settlements/);
 await assert.rejects(api.deleteTransaction(inv.payment_transaction_id),/Invoice settlements/);
 await assert.rejects(api.saveInvoice({id:'inv',status:'Sent'}),/cannot be overwritten/);
 await assert.rejects(api.deleteInvoice('inv'),/Keep settled/);
});
test('interrupted invoice settlement and invalid accounts leave all records unchanged',async()=>{
 records.set('users/alice/invoices/inv',invoiceFixture);const before=structuredClone(records);
 failCommit=true;await assert.rejects(api.settleInvoice('inv','bank'));assert.deepEqual(records,before);failCommit=false;
 records.get('accounts/bank').currency='USD';await assert.rejects(api.settleInvoice('inv','bank'),/uses USD/);
 records.get('accounts/bank').currency='LKR';records.get('accounts/bank').archived=true;await assert.rejects(api.settleInvoice('inv','bank'),/active account/);
 records.get('accounts/bank').archived=false;records.get('accounts/bank').uid='bob';await assert.rejects(api.settleInvoice('inv','bank'),/Account not found/);
 assert.equal(txs().length,0);assert.equal(records.get('users/alice/invoices/inv').status,'Sent');
 records.get('accounts/bank').uid='alice';await api.settleInvoice('inv','bank');assert.equal(records.get('accounts/bank').balance,1055);
});
test('concurrent account details edits preserve payment balance and block direct adjustments',async()=>{
 await Promise.all([api.updateAccount('bank',{name:'Renamed Bank'}),api.createTransaction({type:'Expense',amount:10,date:'2026-10-21',from_account_id:'bank'})]);
 assert.equal(records.get('accounts/bank').balance,990);assert.equal(records.get('accounts/bank').name,'Renamed Bank');
 await assert.rejects(api.updateAccount('bank',{name:'Stale',balance:1000}),/reconciliation/);
 assert.equal(records.get('accounts/bank').balance,990);
});
test('legacy opening baseline is explicit, one-time and rejects stale account balances',async()=>{
 await assert.rejects(api.setOpeningBalance('bank',100,999),/Balance changed/);
 await assert.rejects(api.setOpeningBalance('bank',NaN,1000),/opening balance/);
 await api.setOpeningBalance('bank',900,1000);assert.equal(records.get('accounts/bank').balance,1000);assert.equal(txs().length,0);
 await assert.rejects(api.setOpeningBalance('bank',950,1000),/already set/);
});
test('legacy numeric IDs, unlinked loan payments, and non-split transactions work end-to-end',async()=>{
 records.set('accounts/1',{id:1,uid:'alice',name:'Wallet',balance:500});
 const accs=await api.fetchAccounts();
 assert.equal(accs.find(a=>a.name==='Wallet').id,'1');
 await api.createTransaction({type:'Expense',amount:100,date:'2026-10-21',category:'Food',from_account_id:1,isSplit:false,splits:[{category:'',amount:0},{category:'',amount:0}]});
 const anl=await api.fetchAnalytics();
 assert.equal(anl.categoryData.find(c=>c.category==='Food')?.total,100);
 records.set('loans/1',{id:1,uid:'alice',item_name:'Gold',principal_amount:100.0049,annual_interest_rate:0,unpaid_interest:0,start_date:'2026-10-01',last_interest_calc_date:'2026-10-01',status:'Active'});
 await api.payLoan(1,{amount:100,date:'2026-10-21',account_id:''});
 assert.equal(records.get('loans/1').principal_amount,0);
 assert.equal(records.get('loans/1').status,'Paid');
 records.set('recurring_transactions/spotify',{uid:'alice',category:'Spotify',type:'Expense',amount:50,from_account_id:1});
 await api.payRecurringRule({id:'spotify'});
 assert.equal(records.get('accounts/1').balance,350);
 assert.equal(records.get('recurring_transactions/spotify').name,'Spotify');
});
test('recurring reminders support mark-only without deducting default account, standalone loan payments, and estimate lock',async()=>{
 records.set('loans/gold',{uid:'alice',item_name:'Chain',principal_amount:1000,annual_interest_rate:12,unpaid_interest:0,start_date:'2026-10-01',last_interest_calc_date:'2026-10-01',status:'Active'});
 records.set('recurring_transactions/gold_rule',{uid:'alice',name:'Gold Interest',type:'Loan Payment',loan_id:'gold',amount:100,is_variable:true,from_account_id:'bank'});
 await api.payRecurringRule({id:'gold_rule'},{amount:120,date:'2026-10-21',account_id:'',updateEstimate:false,force:true});
 assert.equal(records.get('accounts/bank').balance,1000);
 assert.equal(records.get('recurring_transactions/gold_rule').last_paid_marked_only,true);
 assert.equal(records.get('recurring_transactions/gold_rule').amount,100);
 assert.equal(records.get('loans/gold').last_paid_month,'2026-10');
 records.set('recurring_transactions/standalone_loan',{uid:'alice',name:'Standalone EMI',type:'Loan Payment',loan_id:null,amount:50,from_account_id:'bank'});
 await api.payRecurringRule({id:'standalone_loan'},{amount:50,date:'2026-10-21',account_id:'bank',force:true});
 assert.equal(records.get('accounts/bank').balance,950);
});
test('payLoan syncs linked recurring reminder and user-scoped IOUs stay isolated',async()=>{
 records.set('loans/car',{uid:'alice',item_name:'Car Loan',principal_amount:500,annual_interest_rate:0,unpaid_interest:0,start_date:'2026-10-01',last_interest_calc_date:'2026-10-01',status:'Active'});
 records.set('recurring_transactions/car_emi',{uid:'alice',name:'Car EMI',type:'Loan Payment',loan_id:'car',amount:100,is_variable:false,from_account_id:'bank'});
 await api.payLoan('car',{amount:100,date:'2026-10-21',account_id:'bank'});
 assert.equal(records.get('loans/car').principal_amount,400);
 assert.equal(records.get('recurring_transactions/car_emi').last_applied_month,'2026-10');
 assert.equal(records.get('recurring_transactions/car_emi').last_paid_amount,100);
 assert.equal(records.get('recurring_transactions/car_emi').payment_history.length,1);
 await api.saveIou({id:'iou_1',person:'Kasun',amount:250,direction:'owed_to_me'});
 assert.equal((await api.fetchIous()).length,1);
 adapter.auth.currentUser={uid:'bob'};api.invalidateCache();
 assert.deepEqual(await api.fetchIous(),[]);
});

test('transactions linked to recurring, goals, loans and bills can be edited and deleted with balance correction', async () => {
 // 1. Goal transaction edit and delete
 records.set('goals/g1', { uid: 'alice', name: 'Car', current_amount: 500, target_amount: 1000 });
 records.set('transactions/tx_goal', { uid: 'alice', type: 'Expense', amount: 100, date: '2026-10-21', from_account_id: 'bank', goal_id: 'g1' });
 records.get('accounts/bank').balance = 900;
 // Edit goal payment
 await api.updateTransaction('tx_goal', { amount: 150 });
 assert.equal(records.get('accounts/bank').balance, 850);
 assert.equal(records.get('goals/g1').current_amount, 550);
 // Delete goal payment
 await api.deleteTransaction('tx_goal');
 assert.equal(records.get('accounts/bank').balance, 1000);
 assert.equal(records.get('goals/g1').current_amount, 400);

 // 2. Recurring rule transaction edit and delete
 records.set('recurring_transactions/rec1', { uid: 'alice', name: 'Internet', type: 'Expense', amount: 50 });
 records.set('transactions/tx_rec', { uid: 'alice', type: 'Expense', amount: 50, date: '2026-10-21', from_account_id: 'bank', recurring_rule_id: 'rec1' });
 records.get('accounts/bank').balance = 950;
 await api.updateTransaction('tx_rec', { category: 'Utilities', notes: 'Fiber broadband' });
 assert.equal(records.get('transactions/tx_rec').category, 'Utilities');
 await api.deleteTransaction('tx_rec');
 assert.equal(records.get('accounts/bank').balance, 1000);

 // 3. Orphaned transaction with deleted/missing account can be deleted without error
 records.set('transactions/tx_orphan', { uid: 'alice', type: 'Expense', amount: 40, date: '2026-10-21', from_account_id: 'deleted_acc' });
 await api.deleteTransaction('tx_orphan');
 assert.equal(records.has('transactions/tx_orphan'), false);
});

test('credit card charges set card currency, update debt on edit/delete, and Goal Deduction adjusts goal safely', async () => {
 records.set('credit_cards/card', { uid: 'alice', name: 'Amex', currency: 'USD', balance: 100 });
 await api.recordCardCharge({ id: 'card', name: 'Amex', currency: 'USD' }, { amount: 60, date: '2026-10-21', category: 'Travel', notes: 'Hotel', logTransaction: true });
 const [chargeKey, chargeTx] = txs().find(([, t]) => t.credit_card_charge_id === 'card');
 const chargeId = chargeKey.split('/')[1];
 assert.equal(chargeTx.currency, 'USD');
 assert.equal(records.get('credit_cards/card').balance, 160);

 await api.updateTransaction(chargeId, { amount: 90 });
 assert.equal(records.get('credit_cards/card').balance, 190);

 await api.deleteTransaction(chargeId);
 assert.equal(records.get('credit_cards/card').balance, 100);
 assert.equal(records.has('transactions/' + chargeId), false);

 // Goal Deduction (withdrawal) edit/delete reverses in the right direction without breaking newer deposits
 records.set('goals/g2', { uid: 'alice', name: 'Emergency', currency: 'LKR', current_amount: 500, target_amount: 500, is_achieved: true });
 await api.withdrawGoal('g2', { amount: 100, account_id: 'bank', reason: 'Car repair' });
 const wdId = txs().find(([, t]) => t.goal_id === 'g2' && t.category === 'Goal Deduction')[0].split('/')[1];
 assert.equal(records.get('goals/g2').current_amount, 400);
 assert.equal(records.get('accounts/bank').balance, 1100);

 await api.updateTransaction(wdId, { amount: 150 });
 assert.equal(records.get('goals/g2').current_amount, 350);
 assert.equal(records.get('accounts/bank').balance, 1150);

 await api.deleteTransaction(wdId);
 assert.equal(records.get('goals/g2').current_amount, 500);
 assert.equal(records.get('goals/g2').is_achieved, true);
 assert.equal(records.get('accounts/bank').balance, 1000);
});

test('deleting an older linked goal contribution preserves subsequent contributions and payLoan accrues daily interest accurately', async () => {
 records.set('goals/g3', { uid: 'alice', name: 'House', currency: 'LKR', current_amount: 0, target_amount: 1000 });
 await api.contributeGoal('g3', { amount: 100, account_id: 'bank', note: 'First' });
 await api.contributeGoal('g3', { amount: 250, account_id: 'bank', note: 'Second' });
 assert.equal(records.get('goals/g3').current_amount, 350);
 assert.equal(records.get('accounts/bank').balance, 650);

 const firstId = txs().find(([, t]) => (t.notes || '').includes('First'))[0].split('/')[1];
 await api.deleteTransaction(firstId);
 // Deleting the first contribution must retain the second 250 contribution!
 assert.equal(records.get('goals/g3').current_amount, 250);
 assert.equal(records.get('accounts/bank').balance, 750);

 // payLoan with 20 days accrued interest at 36.5% APR on 1000 => ~20.00 interest
 records.set('loans/gold2', {
  uid: 'alice',
  item_name: 'Gold Ring',
  principal_amount: 1000,
  annual_interest_rate: 36.5,
  unpaid_interest: 0,
  start_date: '2026-10-01',
  last_interest_calc_date: '2026-10-01',
  status: 'Active',
 });
 await api.payLoan('gold2', { amount: 120, date: '2026-10-21', account_id: 'bank' });
 const updatedLoan = records.get('loans/gold2');
 assert.equal(updatedLoan.principal_amount, 900);
 assert.equal(updatedLoan.unpaid_interest, 0);
 assert.equal(records.get('accounts/bank').balance, 630);
});

test('transfer normalization strips same-currency destination_amount, enforces cross-currency updates, and edited transactions reverse/delete accurately', async () => {
 records.set('accounts/cash_lkr', { uid: 'alice', name: 'Cash Wallet', currency: 'LKR', balance: 500 });
 records.set('accounts/bank_lkr', { uid: 'alice', name: 'Bank LKR', currency: 'LKR', balance: 2000 });
 records.set('accounts/usd_acc', { uid: 'alice', name: 'USD Vault', currency: 'USD', balance: 100 });
 records.set('accounts/archived_acc', { uid: 'alice', name: 'Old Vault', currency: 'LKR', balance: 0, archived: true });

 // 1. Same-currency transfer ignores stray destination_amount
 const { item: { id: trId } } = await api.createTransaction({
  type: 'Transfer',
  amount: 300,
  destination_amount: 9999,
  date: '2026-10-22',
  from_account_id: 'bank_lkr',
  to_account_id: 'cash_lkr',
 });
 assert.equal(records.get('accounts/bank_lkr').balance, 1700);
 assert.equal(records.get('accounts/cash_lkr').balance, 800);
 assert.equal(records.get(`transactions/${trId}`).destination_amount, undefined);

 // 2. Cross-currency transfer edit requires updated destination_amount when amount changes
 const { item: { id: fxId } } = await api.createTransaction({
  type: 'Transfer',
  amount: 10,
  destination_amount: 3000,
  date: '2026-10-22',
  from_account_id: 'usd_acc',
  to_account_id: 'cash_lkr',
 });
 assert.equal(records.get('accounts/usd_acc').balance, 90);
 assert.equal(records.get('accounts/cash_lkr').balance, 3800);
 await assert.rejects(
  api.updateTransaction(fxId, { amount: 20, destination_amount: 3000 }),
  /Update the amount received in the other currency too/
 );
 await api.updateTransaction(fxId, { amount: 20, destination_amount: 6000 });
 assert.equal(records.get('accounts/usd_acc').balance, 80);
 assert.equal(records.get('accounts/cash_lkr').balance, 6800);

 // 3. Moving an existing payment into an archived account is blocked
 await assert.rejects(
  api.updateTransaction(trId, { to_account_id: 'archived_acc' }),
  /Restore the archived account/
 );

 // 4. Editing a transaction's amount updates its reversal_context so reversePayment refunds the edited amount
 const { item: { id: expId } } = await api.createTransaction({
  type: 'Expense',
  amount: 200,
  date: '2026-10-22',
  category: 'Food',
  from_account_id: 'cash_lkr',
 });
 assert.equal(records.get('accounts/cash_lkr').balance, 6600);
 await api.updateTransaction(expId, { amount: 350 });
 assert.equal(records.get('accounts/cash_lkr').balance, 6450);
 await api.reversePayment(expId, 'Wrong merchant charge');
 assert.equal(records.get('accounts/cash_lkr').balance, 6800);
});
