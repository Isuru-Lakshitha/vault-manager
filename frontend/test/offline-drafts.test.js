import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saveDraft, readDrafts, syncDrafts } from '../src/utils/offlineDrafts.js';
const values=new Map();
Object.defineProperty(globalThis,'localStorage',{value:{getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key),key:index=>[...values.keys()][index],get length(){return values.size}},configurable:true});
globalThis.window={dispatchEvent(){}};globalThis.CustomEvent=class {};
test('offline drafts are isolated and retained after failed sync, then removed after confirmed retry',async()=>{
 saveDraft('alice',{type:'Expense',amount:10,from_account_id:'bank',date:'2026-10-21'});
 assert.equal(readDrafts('bob').length,0);
 const draftId=readDrafts('alice')[0].id;
 const failed=await syncDrafts('alice',async()=>{throw new Error('Offline')});assert.equal(failed.remaining.length,1);assert.equal(failed.remaining[0].error,'Offline');
 const success=await syncDrafts('alice',async(data,id)=>{assert.equal(id,draftId);assert.equal(data.amount,10)});
 assert.equal(success.completed,1);assert.equal(readDrafts('alice').length,0);
});
test('sync preserves a draft created while another draft is being submitted',async()=>{
 values.clear();saveDraft('alice',{type:'Expense',amount:10,from_account_id:'bank',date:'2026-10-21'});
 await syncDrafts('alice',async()=>{saveDraft('alice',{type:'Expense',amount:20,from_account_id:'bank',date:'2026-10-21'})});
 assert.equal(readDrafts('alice').length,1);assert.equal(readDrafts('alice')[0].data.amount,20);
});
