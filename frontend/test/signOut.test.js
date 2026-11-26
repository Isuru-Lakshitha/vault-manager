import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
};
let dbs = [];
let blocked = false;
const deleted = [];
globalThis.indexedDB = {
  databases: async () => dbs.map(name => ({ name })),
  deleteDatabase: name => {
    const req = {};
    setTimeout(() => {
      if (blocked) { req.onblocked?.(); return; }
      deleted.push(name); dbs = dbs.filter(n => n !== name); req.onsuccess?.();
    }, 0);
    return req;
  },
};

const { deleteOfflineDatabases, retryPendingOfflineWipe, cachedFinancialKeys, WIPE_PENDING_KEY } = await import('../src/utils/signOut.js');
const settle = () => new Promise(r => setTimeout(r, 20));

test('deletes only Firestore offline databases', async () => {
  dbs = ['firestore/[DEFAULT]/demo/main', 'firebaseLocalStorageDb', 'other'];
  deleted.length = 0; blocked = false;
  assert.equal(await deleteOfflineDatabases(), true);
  assert.deepEqual(deleted, ['firestore/[DEFAULT]/demo/main']);
  assert.deepEqual(dbs, ['firebaseLocalStorageDb', 'other']);
});

test('a pending wipe is retried at start-up only when nobody is signed in', async () => {
  dbs = ['firestore/[DEFAULT]/demo/main']; deleted.length = 0; blocked = false;
  store.clear(); store.set(WIPE_PENDING_KEY, '1'); store.set('vm_signed_in', '1');
  retryPendingOfflineWipe(); await settle();
  assert.equal(deleted.length, 0, 'must not delete while a user is signed in');

  store.delete('vm_signed_in');
  retryPendingOfflineWipe(); await settle();
  assert.equal(deleted.length, 1);
  assert.equal(store.has(WIPE_PENDING_KEY), false);
});

test('the start-up retry keeps the pending flag when another tab blocks the delete', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  dbs = ['firestore/[DEFAULT]/demo/main']; blocked = true;
  store.clear(); store.set(WIPE_PENDING_KEY, '1');
  retryPendingOfflineWipe();
  for (let i = 0; i < 5; i++) await Promise.resolve();
  t.mock.timers.tick(10);
  for (let i = 0; i < 5; i++) await Promise.resolve();
  t.mock.timers.tick(3000);
  for (let i = 0; i < 5; i++) await Promise.resolve();
  assert.equal(store.get(WIPE_PENDING_KEY), '1');
  blocked = false;
});

test('cached financial keys are scoped to the user and skip unsynced copies', () => {
  const keys = cachedFinancialKeys('u1');
  assert.ok(keys.every(k => k.endsWith('u1')));
  assert.ok(keys.includes('vm_dash_snapshot_u1'));
  assert.ok(!keys.some(k => /ious|rules|shared_tabs|draft/.test(k)));
});
