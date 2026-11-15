import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizePayments, reconcileAccount, auditStatus, accountMovement, summarizeAccountHistory, isEditableTransaction, auditLedger } from '../src/utils/ledgerReporting.js';
import { planBackupImport } from '../src/utils/backupPlan.js';
test('reversed payments and compensating entries remain visible but do not inflate summaries',()=>{
 const entries=[{type:'Expense',amount:25,reversed_at:'today',from_account_id:'bank'},{type:'Income',amount:25,reversal_of:'old',to_account_id:'bank'}];
 assert.deepEqual(summarizePayments(entries),{income:0,expense:0,net:0,count:2});assert.equal(auditStatus(entries[0]),'Reversed');
 assert.equal(reconcileAccount({id:'bank',balance:100,opening_balance:100},entries).difference,0);
});
test('reconciliation counts native transfer receipts and fees once, flags absent baselines',()=>{
 const entries=[{type:'Transfer',amount:10,destination_amount:3000,fee_amount:2,from_account_id:'usd',to_account_id:'lkr'},{type:'Expense',amount:2,from_account_id:'usd',is_transfer_fee:true}];
 assert.equal(reconcileAccount({id:'usd',balance:88,opening_balance:100},entries).difference,0);
 assert.equal(reconcileAccount({id:'lkr',balance:3010,opening_balance:10},entries).difference,0);
 assert.equal(reconcileAccount({id:'old',balance:500},[]).known,false);
});
test('backup import identities are isolated between users and can resume legacy IDs',()=>{
 const backup={version:2,accounts:[{id:'a',balance:100}]};
 const alice=planBackupImport(backup,'alice','hash'),bob=planBackupImport(backup,'bob','hash');
 assert.notDeepEqual(alice.groups[0][0].path,bob.groups[0][0].path);
 assert.equal(planBackupImport(backup,'alice','hash',{legacyIds:true}).groups[0][0].path[1],'import_hash_accounts_a');
});

test('chart movements use native transfer receipts, include fees once and retain compensation',()=>{
 const tx={type:'Transfer',amount:10,destination_amount:3000,fee_amount:2,from_account_id:'usd',to_account_id:'lkr'};
 assert.equal(accountMovement('usd',tx),-12);assert.equal(accountMovement('lkr',tx),3000);
 assert.equal(accountMovement('usd',{type:'Expense',amount:2,from_account_id:'usd',is_transfer_fee:true}),0);
 assert.equal(accountMovement('usd',{type:'Income',amount:12,to_account_id:'usd',reversal_of:'old'}),12);
});
test('backup restores invoice settlement links together and rejects broken payment linkage',()=>{
 const backup={version:2,accounts:[{id:'a',balance:50}],invoices:[{id:'i',status:'Paid',payment_transaction_id:'p',account_id:'a'}],transactions:[{id:'p',type:'Income',amount:50,to_account_id:'a',invoice_id:'i'}]};
 const plan=planBackupImport(backup,'alice','hash');const group=plan.groups.find(g=>g.some(r=>r.data.invoice_id));
 assert.equal(group.length,2);assert.equal(group[0].data.invoice_id,group[1].path.at(-1));assert.equal(group[1].data.payment_transaction_id,group[0].path.at(-1));
 backup.invoices[0].payment_transaction_id='missing';assert.throws(()=>planBackupImport(backup,'alice','hash'),/missing transactions reference/);
});
test('accountMovement and reconcileAccount match legacy numeric and string account IDs',()=>{
 assert.equal(accountMovement('1',{type:'Expense',amount:40,from_account_id:1}),-40);
 assert.equal(accountMovement(1,{type:'Income',amount:60,to_account_id:'1'}),60);
 assert.equal(reconcileAccount({id:'1',balance:120,opening_balance:100},[{type:'Expense',amount:40,from_account_id:1},{type:'Income',amount:60,to_account_id:'1'}]).difference,0);
});
test('summarizeAccountHistory separates inflows, outflows, fees, and drift',()=>{
 const cash={id:'cash',balance:1750,opening_balance:500};
 const txs=[
  {type:'Transfer',amount:2000,fee_amount:25,from_account_id:'bank',to_account_id:'cash'},
  {type:'Expense',amount:25,from_account_id:'bank',is_transfer_fee:true},
  {type:'Expense',amount:450,from_account_id:'cash'},
  {type:'Expense',amount:200,from_account_id:'cash',reversed_at:'2026-11-10T00:00:00Z'},
  {type:'Income',amount:200,to_account_id:'cash',reversal_of:'tx_old'},
 ];
 const res=summarizeAccountHistory(cash,txs);
 assert.equal(res.inflows,2200);
 assert.equal(res.outflows,650);
 assert.equal(res.delta,1550);
 assert.equal(res.expected,2050);
 assert.equal(res.difference,-300);
});
test('isEditableTransaction excludes reversed, reversal, transfer fee, and invoice rows',()=>{
 assert.equal(isEditableTransaction({id:'t1',type:'Expense',amount:50}),true);
 assert.equal(isEditableTransaction({id:'t2',type:'Expense',amount:50,reversed_at:'2026-11-10'}),false);
 assert.equal(isEditableTransaction({id:'t3',type:'Income',amount:50,reversal_of:'t2'}),false);
 assert.equal(isEditableTransaction({id:'t4',type:'Expense',amount:5,is_transfer_fee:true}),false);
 assert.equal(isEditableTransaction({id:'t5',type:'Income',amount:100,invoice_id:'inv1'}),false);
});
test('auditLedger reports drifted accounts and unknown baselines using cents math',()=>{
 const accounts=[
  {id:'bank',name:'Bank',currency:'LKR',balance:900,opening_balance:1000},
  {id:'cash',name:'Cash Wallet',currency:'LKR',balance:500,opening_balance:200},
  {id:'legacy',name:'Legacy',currency:'LKR',balance:300},
 ];
 const txs=[
  {type:'Expense',amount:100,from_account_id:'bank'},
  {type:'Income',amount:200,to_account_id:'cash'},
 ];
 const audit=auditLedger(accounts,txs);
 assert.equal(audit.knownCount,2);
 assert.equal(audit.driftedCount,1);
 assert.equal(audit.unknownBaselineCount,1);
 assert.equal(audit.accounts.find(a=>a.id==='bank').drifted,false);
 assert.equal(audit.accounts.find(a=>a.id==='cash').difference,100);
});
