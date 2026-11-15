const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'vault-isolation-'));
process.env.MONEY_MANAGER_DATA_DIR=root;
const db=require('../db');
test('per-user databases isolate identical record IDs and backups',async t=>{
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 assert.throws(()=>db.prepare('SELECT 1'));
 await Promise.all(['alice','bob'].map(uid=>db.withUserDatabase(uid,async connection=>{
  try {
   db.prepare('INSERT INTO accounts(name,type,balance) VALUES (?,?,?)').run(uid,'Cash',uid==='alice'?100:200);
   await Promise.resolve();
   assert.equal(db.prepare('SELECT name FROM accounts WHERE id=1').get().name,uid);
   await db.backup(path.join(root,uid+'.sqlite'));
  } finally {connection.close()}
 })));
 for(const uid of ['alice','bob']){
  const backup=db.openDatabase(path.join(root,uid+'.sqlite'));
  assert.equal(backup.prepare('SELECT name FROM accounts').get().name,uid);backup.close();
 }
 assert.throws(()=>db.withUserDatabase('',()=>{}));
});
