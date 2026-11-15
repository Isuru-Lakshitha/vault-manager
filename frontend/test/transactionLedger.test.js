import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateTransaction, mutateBalances, transferFee } from '../src/utils/transactionLedger.js';
const tx={type:'Transfer',amount:100,fee_amount:5,date:'2026-10-21',from_account_id:'bank',to_account_id:'cash'};
const accounts=()=>({bank:{balance:1000},cash:{balance:200}});
test('transfer fee is deducted once and reverses completely',()=>{
 const a=accounts();mutateBalances(a,tx);const fee=transferFee(tx,'parent','owner');mutateBalances(a,fee);
 assert.deepEqual(a,{bank:{balance:895},cash:{balance:300}});
 assert.equal(fee.parent_transaction_id,'parent');assert.equal(fee.uid,'owner');
 mutateBalances(a,fee,true);mutateBalances(a,tx,true);assert.deepEqual(a,accounts());
});
test('editing amount, fee, direction and type reconciles balances',()=>{
 for(const next of [{...tx,amount:30,fee_amount:2},{...tx,from_account_id:'cash',to_account_id:'bank'}, {type:'Income',amount:50,to_account_id:'bank'}]){
  const actual=accounts();mutateBalances(actual,tx);mutateBalances(actual,tx,true);mutateBalances(actual,next);
  const expected=accounts();mutateBalances(expected,next);assert.deepEqual(actual,expected);
 }
 assert.equal(transferFee({...tx,fee_amount:0},'parent','owner'),null);
 assert.equal(transferFee({type:'Income',amount:10},'parent','owner'),null);
});
test('reject malformed values and account selections before writes',()=>{
 for(const patch of [{amount:NaN},{amount:Infinity},{amount:-1},{amount:0},{amount:'1'},{amount:.001},{fee_amount:-2},{date:'2026-02-30'},{from_account_id:null},{to_account_id:'bank'},{type:'Unknown'}]) assert.throws(()=>validateTransaction({...tx,...patch}));
 validateTransaction(tx);
 assert.throws(()=>mutateBalances({bank:{balance:10}},tx));
});
test('cents remain stable across repeated debits and reversals',()=>{
 const a=accounts();const expense={type:'Expense',amount:.01,from_account_id:'bank'};
 for(let n=0;n<100;n++)mutateBalances(a,expense);
 assert.equal(a.bank.balance,999);
 for(let n=0;n<100;n++)mutateBalances(a,expense,true);
 assert.equal(a.bank.balance,1000);
});
