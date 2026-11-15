// Explicit, dry-run-first import of the legacy local database into Firebase.
const Database = require('better-sqlite3');
const path = require('node:path');
const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
async function migrate() {
  const uid = process.env.MIGRATION_OWNER_UID;
  if (!uid) throw new Error('Set MIGRATION_OWNER_UID to the verified owner of the legacy database');
  const source = new Database(process.env.LEGACY_SQLITE_PATH || path.join(__dirname, 'money_manager.sqlite'), { readonly: true, fileMustExist: true });
  try {
    const tables = ['accounts','transactions','loans','budgets','goals'];
    const rows = Object.fromEntries(tables.map(table => [table, source.prepare(`SELECT * FROM ${table}`).all()]));
    for (const table of tables) console.log(`${table}: ${rows[table].length} records`);
    if (process.env.APPLY_MIGRATION !== '1') {
      console.log('Dry run only. Review the owner and source, then set APPLY_MIGRATION=1 to import.');
      return;
    }
    initializeApp({credential:applicationDefault(),projectId:process.env.FIREBASE_PROJECT_ID || 'money-manager-isuru'});
    await getAuth().getUser(uid); // A real Firebase user must exist.
    const firestore=getFirestore();
    const prefix=Buffer.from(uid).toString('base64url')+'_legacy_';
    for (const table of tables) {
      // Create, never overwrite. A rerun stops on existing IDs instead of changing data.
      for (let offset=0;offset<rows[table].length;offset+=400) {
        const batch=firestore.batch();
        for (const record of rows[table].slice(offset,offset+400)) {
          const {id,...data}=record;
          for (const field of ['from_account_id','to_account_id','loan_id'])
            if (field in data) data[field]=data[field] == null ? null : prefix+data[field];
          batch.create(firestore.collection(table).doc(prefix+id),{...data,uid});
        }
        await batch.commit();
      }
    }
    console.log('Legacy import complete. Review balances and fee history before using the imported records.');
  } finally { source.close(); }
}
if(require.main===module)migrate().catch(error=>{console.error(error.message);process.exitCode=1});
