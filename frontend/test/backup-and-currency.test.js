import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backupFingerprint, planBackupImport } from '../src/utils/backupPlan.js';
import { parseExchangeRates, currencyRate } from '../src/utils/exchangeRates.js';
import { reportingTransactions } from '../src/utils/reportingCurrency.js';
const backup = () => ({ version: 2, accounts: [{ id: 'bank', balance: 100 }, { id: 'cash', balance: 50 }], receipts: [{ id: 'receipt', data: 'data:image/png;base64,AA' }], transactions: [
 { id: 'transfer', type: 'Transfer', amount: 20, fee_amount: 2, date: '2026-10-21', from_account_id: 'bank', to_account_id: 'cash', fee_transaction_id: 'fee', receipt_url: 'receipt:receipt' },
 { id: 'fee', type: 'Expense', amount: 2, date: '2026-10-21', from_account_id: 'bank', is_transfer_fee: true, parent_transaction_id: 'transfer' },
] });
test('backup planning deterministically remaps accounts, receipts and atomic fee groups', async () => {
 const input=backup(), hash=await backupFingerprint(input), plan=planBackupImport(input,'alice',hash);
 assert.deepEqual(plan,planBackupImport(input,'alice',await backupFingerprint(input)));
 const group=plan.groups.at(-1);assert.equal(group.length,2);assert.equal(group[0].data.fee_transaction_id,group[1].path[1]);assert.equal(group[1].data.parent_transaction_id,group[0].path[1]);
 assert.ok(group[0].data.receipt_url.includes('import_'));assert.equal(input.transactions[0].from_account_id,'bank');
});
test('backup validation rejects missing references, duplicate IDs and missing fee records',()=>{
 const input=backup();input.accounts=[];assert.throws(()=>planBackupImport(input,'alice','x'),/reference/);
 const duplicate=backup();duplicate.accounts.push(duplicate.accounts[0]);assert.throws(()=>planBackupImport(duplicate,'alice','x'),/duplicate/);
 const missing=backup();missing.transactions.pop();delete missing.transactions[0].fee_transaction_id;assert.throws(()=>planBackupImport(missing,'alice','x'),/fee record missing/);
});
test('backup remaps reversal audit targets and links to restored records',()=>{
 const input=backup();input.transactions[0].reversal_context=[{path:'accounts/bank',before:{balance:120},after:{balance:100},absent:[]}];
 const plan=planBackupImport(input,'alice','x');assert.equal(plan.groups.at(-1)[0].data.reversal_context[0].path,plan.groups[0][0].path.join('/'));
});
test('rates preserve source/date and calculate both directions without guessed fallback',()=>{
 const rates=parseExchangeRates([{base:'LKR',quote:'USD',rate:0.004,date:'2026-10-20'},{base:'LKR',quote:'EUR',rate:0.002,date:'2026-10-19'}]);
 assert.equal(currencyRate('USD','LKR',rates),250);assert.equal(currencyRate('LKR','USD',rates),0.004);assert.equal(currencyRate('USD','EUR',rates),0.5);assert.equal(rates._date,'2026-10-19');
 assert.ok(Number.isNaN(currencyRate('GBP','LKR',rates)));assert.ok(Number.isNaN(currencyRate('USD','LKR',{USD:302,LKR:1})));assert.equal(currencyRate('USD','USD',null),1);assert.throws(()=>parseExchangeRates({rates:{USD:1}}));
});
test('mixed-currency reporting converts split expenses and refuses incomplete rates',()=>{
 const accounts=[{id:'bank',currency:'USD'}],txs=[{type:'Expense',amount:10,from_account_id:'bank',splits:[{category:'Food',amount:6},{category:'Travel',amount:4}]}];
 const rates=parseExchangeRates([{base:'LKR',quote:'USD',rate:0.004,date:'2026-10-20'}]);
 const report=reportingTransactions(txs,accounts,'LKR',rates);assert.equal(report[0].amount,2500);assert.equal(report[0].splits[0].amount,1500);assert.equal(report[0].original_currency,'USD');assert.equal(txs[0].amount,10);
 assert.throws(()=>reportingTransactions(txs,accounts,'LKR',null),/rates unavailable/);
 assert.deepEqual(reportingTransactions([{...txs[0],reversed_at:'today'}],accounts,'LKR',null),[]);
});
