import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

const storage = new Map();
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key),
    clear: () => storage.clear(),
    key: index => [...storage.keys()][index],
    get length() { return storage.size; }
  },
  configurable: true
});

const dispatchedEvents = [];
globalThis.window = {
  dispatchEvent: (e) => dispatchedEvents.push(e),
  location: { reload: () => {} }
};
globalThis.CustomEvent = class {
  constructor(type, init) {
    this.type = type;
    this.detail = init?.detail;
  }
};
Object.defineProperty(globalThis, 'navigator', {
  value: { onLine: true },
  configurable: true
});

const firestoreDocs = new Map();
const testAuth = { currentUser: { email: 'isuru@moneymanager.app', uid: 'admin_uid' } };

const adminAdapter = {
  db: {},
  auth: testAuth,
  doc: (_, ...parts) => ({ path: parts.join('/') }),
  collection: (_, ...parts) => ({ path: parts.join('/') }),
  getDoc: async ref => ({
    exists: () => firestoreDocs.has(ref.path),
    data: () => structuredClone(firestoreDocs.get(ref.path))
  }),
  getDocs: async ref => {
    const basePath = ref.path;
    let docs = [...firestoreDocs.entries()]
      .filter(([k]) => k.startsWith(basePath + '/'))
      .map(([k, v]) => ({ id: k.split('/').pop(), data: () => structuredClone(v) }));
    if (typeof ref.limit === 'number') docs = docs.slice(0, ref.limit);
    return { docs, empty: docs.length === 0 };
  },
  setDoc: async (ref, data, options) => {
    if (options?.merge && firestoreDocs.has(ref.path)) {
      firestoreDocs.set(ref.path, { ...firestoreDocs.get(ref.path), ...structuredClone(data) });
    } else {
      firestoreDocs.set(ref.path, structuredClone(data));
    }
  },
  updateDoc: async (ref, data) => {
    if (!firestoreDocs.has(ref.path)) throw new Error('Not found');
    firestoreDocs.set(ref.path, { ...firestoreDocs.get(ref.path), ...structuredClone(data) });
  },
  deleteDoc: async ref => {
    firestoreDocs.delete(ref.path);
  },
  onSnapshot: () => () => {},
  serverTimestamp: () => new Date().toISOString(),
  query: (collRef, ...constraints) => {
    const out = { ...collRef };
    for (const c of constraints) {
      if (c?.type === 'limit') out.limit = c.n;
      if (c?.type === 'orderBy') out.orderBy = c;
    }
    return out;
  },
  orderBy: (field, dir = 'asc') => ({ type: 'orderBy', field, dir }),
  limit: (n) => ({ type: 'limit', n })
};

globalThis.__adminTest = adminAdapter;

const modules = {
  './firebase': `export const { db, auth } = globalThis.__adminTest;`,
  'firebase/firestore': `export const { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, onSnapshot, serverTimestamp, query, orderBy, limit } = globalThis.__adminTest;`,
  './api': `
    export const fetchAccounts = async () => [];
    export const fetchTransactions = async () => [];
    export const fetchBudgets = async () => [];
    export const fetchGoals = async () => [];
    export const fetchLoans = async () => [];
    export const fetchBills = async () => [];
    export const fetchInvestments = async () => [];
  `,
  './dates': `export const todayYMD = () => '2026-10-31';`
};

const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.endsWith('/utils/adminService.js') && modules[specifier]) {
      return { url: 'data:text/javascript,' + encodeURIComponent(modules[specifier]), shortCircuit: true };
    }
    return next(specifier, context);
  }
});

const admin = await import('../src/utils/adminService.js');
hooks.deregister();

// Admin is an `admin: true` custom claim on the ID token, not an email.
const tokenUser = (uid, email, claims = {}) => ({ uid, email, getIdTokenResult: async () => ({ claims }) });

beforeEach(async () => {
  storage.clear();
  firestoreDocs.clear();
  dispatchedEvents.length = 0;
  testAuth.currentUser = tokenUser('admin_uid', 'isuru@moneymanager.app', { admin: true });
  await admin.loadAdminClaim(testAuth.currentUser);
});

test('isSuperAdmin follows the admin claim, never the email address', async () => {
  assert.equal(admin.isSuperAdmin(testAuth.currentUser), true);
  const sameEmailNoClaim = tokenUser('new_uid', 'isuru@moneymanager.app');
  await admin.loadAdminClaim(sameEmailNoClaim);
  assert.equal(admin.isSuperAdmin(sameEmailNoClaim), false, 'a re-registered admin email must not be admin');
  const other = tokenUser('other_uid', 'other@example.com', { admin: true });
  assert.equal(admin.isSuperAdmin(other), false, 'unknown until the claim is loaded');
  await admin.loadAdminClaim(other);
  assert.equal(admin.isSuperAdmin(other), true);
  assert.equal(admin.isSuperAdmin(null), false);
});

test('system announcement publish, get, and clear', async () => {
  await admin.setSystemAnnouncement({ message: 'Scheduled Upgrade', level: 'warning' });
  const ann = admin.getSystemAnnouncement();
  assert.equal(ann.message, 'Scheduled Upgrade');
  assert.equal(ann.level, 'warning');
  assert.equal(ann.active, true);

  await admin.clearSystemAnnouncement();
  assert.equal(admin.getSystemAnnouncement(), null);
});

test('maintenance mode enable, get, and disable', async () => {
  await admin.setMaintenanceMode(true, 'Server maintenance');
  let maint = admin.getMaintenanceMode();
  assert.equal(maint.active, true);
  assert.equal(maint.reason, 'Server maintenance');

  await admin.setMaintenanceMode(false);
  maint = admin.getMaintenanceMode();
  assert.equal(maint.active, false);
});

test('registerUserPresence creates and updates presence in user directory', async () => {
  await admin.registerUserPresence({ uid: 'user_1', email: 'user@example.com', metadata: { creationTime: '2026-10-01' } });
  assert.ok(firestoreDocs.has('user_directory/user_1'));
  assert.equal(firestoreDocs.get('user_directory/user_1').email, 'user@example.com');

  const users = await admin.getRegisteredUsers();
  assert.equal(users.length, 1);
  assert.equal(users[0].role, 'Member');

  await admin.updateRegisteredUser('user_1', { status: 'Suspended', verified_by_admin: true });
  assert.equal(firestoreDocs.get('user_directory/user_1').status, 'Suspended');
  assert.equal(firestoreDocs.get('user_directory/user_1').verified_by_admin, true);

  await admin.deleteRegisteredUser({ uid: 'user_1', email: 'user@example.com' });
  assert.equal(firestoreDocs.has('user_directory/user_1'), false);
});

test('flushSystemCache preserves critical offline drafts and security keys', async () => {
  storage.set('vm_payment_draft:user_1:d1', JSON.stringify({ id: 'd1' }));
  storage.set('vm_pin_hash', 'hash123');
  storage.set('vm_theme', 'dark');
  storage.set('random_volatile_cache', 'temp_data');

  await admin.flushSystemCache();

  assert.equal(storage.get('vm_payment_draft:user_1:d1'), JSON.stringify({ id: 'd1' }));
  assert.equal(storage.get('vm_pin_hash'), 'hash123');
  assert.equal(storage.get('vm_theme'), 'dark');
  assert.equal(storage.has('random_volatile_cache'), false);
});

test('admin actions record append-only entries in admin_audit and fetchRemoteAuditLog retrieves them', async () => {
  await admin.setSystemAnnouncement({ message: 'Audit check', level: 'info' });
  await admin.setMaintenanceMode(true, 'Testing audit');

  const entries = await admin.fetchRemoteAuditLog(50);
  assert.ok(entries.length >= 2);
  const actions = entries.map(e => e.action);
  assert.ok(actions.includes('ANNOUNCEMENT_PUBLISH'));
  assert.ok(actions.includes('MAINTENANCE_TOGGLE'));
  assert.equal(entries[0].admin, 'isuru@moneymanager.app');
  assert.equal(entries[0].uid, 'admin_uid');

  // Non-super-admin cannot write remote audit entries
  testAuth.currentUser = { email: 'member@example.com', uid: 'member_1' };
  const ok = await admin.writeRemoteAudit('UNAUTHORIZED_TRY', 'System', 'Should be blocked');
  assert.equal(ok, false);
});
