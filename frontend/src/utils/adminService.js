import { auth, db } from './firebase';
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, onSnapshot, serverTimestamp, query, orderBy, limit } from 'firebase/firestore';
import {
  fetchAccounts,
  fetchTransactions,
  fetchBudgets,
  fetchGoals,
  fetchLoans,
  fetchBills,
  fetchInvestments
} from './api';
import { todayYMD } from './dates';

import { SUPER_ADMIN_EMAIL, isSuperAdminUser, CONFIG_CACHE_KEY, readConfigCache, getMaintenanceMode } from './adminLite.js';

export { SUPER_ADMIN_EMAIL, getMaintenanceMode };

/**
 * Checks whether the currently authenticated user (or provided user) is the Super Admin.
 * NOTE: this only controls what the UI shows. Real enforcement for global writes
 * (system_config, user_directory) lives in firestore.rules.
 */
export const isSuperAdmin = (user = auth.currentUser) => isSuperAdminUser(user);

// ─── GLOBAL SYSTEM CONFIG (announcement + maintenance) ─────────────
// Stored in Firestore at system_config/global so it reaches every signed-in
// user, and mirrored to localStorage so the UI can read it synchronously.
const configRef = () => doc(db, 'system_config', 'global');


const writeConfigCache = (config) => {
  const prev = readConfigCache();
  try { localStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify(config)); } catch {}
  if (JSON.stringify(prev.announcement ?? null) !== JSON.stringify(config.announcement ?? null)) {
    window.dispatchEvent(new CustomEvent('vm:system-announcement-updated', { detail: config.announcement ?? null }));
  }
  if (JSON.stringify(prev.maintenance ?? null) !== JSON.stringify(config.maintenance ?? null)) {
    window.dispatchEvent(new CustomEvent('vm:maintenance-mode-changed', { detail: config.maintenance ?? { active: false, reason: '' } }));
  }
};

let _configUnsub = null;
/** Subscribes to system_config/global in real time. Safe to call repeatedly. */
export const startSystemConfigSync = () => {
  if (_configUnsub) return _configUnsub;
  try {
    _configUnsub = onSnapshot(configRef(), snap => {
      const data = snap.exists() ? snap.data() : {};
      writeConfigCache({ announcement: data.announcement ?? null, maintenance: data.maintenance ?? null });
    }, err => console.warn('System config sync unavailable', err));
  } catch (err) {
    console.warn('System config sync failed to start', err);
  }
  return _configUnsub;
};

export const stopSystemConfigSync = () => {
  if (_configUnsub) { try { _configUnsub(); } catch {} }
  _configUnsub = null;
};

const writeConfig = async (patch) => {
  if (!isSuperAdmin()) throw new Error('Super Admin clearance required');
  const next = { ...readConfigCache(), ...patch };
  await setDoc(configRef(), { ...patch, updated_at: new Date().toISOString() }, { merge: true });
  writeConfigCache(next);
  return next;
};

/**
 * System Announcement Banner Management
 */
export const getSystemAnnouncement = () => readConfigCache().announcement || null;

export const setSystemAnnouncement = async ({ message, level = 'info', active = true }) => {
  const announcement = {
    message: String(message || '').slice(0, 500),
    level,
    active,
    updatedAt: new Date().toISOString(),
    author: auth.currentUser?.email || SUPER_ADMIN_EMAIL
  };
  await writeConfig({ announcement });
  logAdminAction('ANNOUNCEMENT_PUBLISH', 'Global Banner', `Published: "${announcement.message}" (${level})`);
  return announcement;
};

export const clearSystemAnnouncement = async () => {
  await writeConfig({ announcement: null });
  logAdminAction('ANNOUNCEMENT_CLEAR', 'Global Banner', 'Cleared system announcement banner');
};

/**
 * Maintenance Mode Management
 */

export const setMaintenanceMode = async (active, reason = 'Scheduled system maintenance in progress.') => {
  const maintenance = {
    active: !!active,
    reason: String(reason || '').slice(0, 500),
    updatedAt: new Date().toISOString(),
    setBy: auth.currentUser?.email || SUPER_ADMIN_EMAIL
  };
  await writeConfig({ maintenance });
  logAdminAction('MAINTENANCE_TOGGLE', 'System Core', `Maintenance mode: ${active ? 'ENABLED' : 'DISABLED'} - ${maintenance.reason}`);
  return maintenance;
};

// ─── USER DIRECTORY (real sign-ins, user_directory/{uid}) ──────────
/**
 * Records the signed-in user in the directory so the Super Admin can see
 * real accounts. Called once per session after sign-in.
 */
export const registerUserPresence = async (user = auth.currentUser) => {
  if (!user?.uid || !user.email) return null;
  const ref = doc(db, 'user_directory', user.uid);
  const now = new Date().toISOString();
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, { email: user.email, last_active: now });
      return { ...snap.data(), last_active: now };
    }
    const created = user.metadata?.creationTime ? new Date(user.metadata.creationTime).toISOString() : now;
    const entry = { uid: user.uid, email: user.email, created_at: created, last_active: now };
    await setDoc(ref, entry);
    return entry;
  } catch (err) {
    console.warn('Could not update user directory', err);
    return null;
  }
};

const toDisplayUser = (row) => {
  const isOwner = (row.email || '').toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();
  return {
    ...row,
    role: isOwner ? 'Super Admin' : 'Member',
    badge: isOwner ? '👑 Owner' : '👤 Member',
    status: row.status || 'Active',
    createdAt: row.created_at,
    lastActive: row.last_active,
  };
};

/**
 * Retrieves the real user directory from Firestore (Super Admin only).
 */
export const getRegisteredUsers = async () => {
  const snap = await getDocs(collection(db, 'user_directory'));
  const rows = snap.docs.map(d => toDisplayUser({ uid: d.id, ...d.data() }));
  return rows.sort((a, b) => {
    const aOwner = a.role === 'Super Admin' ? 0 : 1;
    const bOwner = b.role === 'Super Admin' ? 0 : 1;
    if (aOwner !== bOwner) return aOwner - bOwner;
    return String(b.last_active || '').localeCompare(String(a.last_active || ''));
  });
};

/**
 * Updates admin-managed fields (status, notes, verified_by_admin) of a directory entry.
 */
export const updateRegisteredUser = async (uid, changes) => {
  const allowed = {};
  for (const key of ['status', 'notes', 'verified_by_admin']) if (key in changes) allowed[key] = changes[key];
  await updateDoc(doc(db, 'user_directory', String(uid)), allowed);
  logAdminAction('USER_DIRECTORY_UPDATE', uid, `Updated directory entry ${uid}: ${Object.keys(allowed).join(', ')}`);
};

/**
 * Removes a user's directory entry. This does NOT delete their Firebase Auth
 * account or financial data; the entry is re-created if they sign in again.
 */
export const deleteRegisteredUser = async (user) => {
  if ((user.email || '').toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase()) {
    throw new Error('Cannot remove the root Super Admin account.');
  }
  await deleteDoc(doc(db, 'user_directory', String(user.uid)));
  logAdminAction('USER_DIRECTORY_DELETE', user.email, `Removed ${user.email} from directory`);
};

/**
 * Diagnostic ping to Firestore to measure real-time API latency & connectivity.
 */
export const getSystemHealth = async () => {
  const start = performance.now();
  let firestoreStatus = 'Connected';
  let latencyMs = 0;
  try {
    await getDoc(doc(db, 'system_health', 'ping'));
    latencyMs = Math.round(performance.now() - start);
  } catch {
    firestoreStatus = 'Degraded';
    latencyMs = Math.round(performance.now() - start);
  }

  return {
    firebaseProject: 'money-manager-isuru',
    firestoreStatus,
    latencyMs,
    storageQuota: 'Spark Free Tier (Active)',
    securityRulesVersion: 'v2.0 (Strict Per-UID Isolation)',
    appVersion: '2.5.0-Enterprise',
    isOnline: navigator.onLine,
    indexedDbStorage: typeof window !== 'undefined' && 'indexedDB' in window ? 'Online & Persistent' : 'Unavailable',
    webAuthnStatus: typeof window !== 'undefined' && window.PublicKeyCredential ? 'Hardware Supported' : 'Unsupported'
  };
};

/**
 * Record counts for the signed-in admin's own vault. Firestore rules isolate
 * every user's financial data, so other users' records are never readable here.
 */
export const getPlatformStats = async () => {
  const [accounts, transactions, budgets, goals, loans, bills, investments] = await Promise.all([
    fetchAccounts().catch(() => []),
    fetchTransactions().catch(() => []),
    fetchBudgets().catch(() => []),
    fetchGoals().catch(() => []),
    fetchLoans().catch(() => []),
    fetchBills().catch(() => []),
    fetchInvestments().catch(() => [])
  ]);
  return {
    accountsCount: accounts.length,
    transactionsCount: transactions.length,
    budgetsCount: budgets.length,
    goalsCount: goals.length,
    loansCount: loans.length,
    billsCount: bills.length,
    investmentsCount: investments.length,
  };
};

/**
 * Super Admin Action Audit Log (kept on this device)
 */
export const logAdminAction = (action, target, details) => {
  const admin = auth.currentUser?.email || SUPER_ADMIN_EMAIL;
  try {
    const logItem = {
      id: `admin_act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      admin,
      action,
      target,
      details
    };
    const updated = [logItem, ...getAdminAuditLog()].slice(0, 100);
    localStorage.setItem('vm_admin_audit_log', JSON.stringify(updated));
  } catch (err) {
    console.warn('Could not log admin action', err);
  }
  return writeRemoteAudit(action, target, details);
};

/**
 * Append-only record in Firestore admin_audit (create-only per firestore.rules).
 * Never throws; resolves true when written.
 */
export const writeRemoteAudit = async (action, target, details) => {
  try {
    const user = auth.currentUser;
    if (!user || !isSuperAdmin(user)) return false;
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    await setDoc(doc(db, 'admin_audit', id), {
      admin: String(user.email || SUPER_ADMIN_EMAIL).slice(0, 200),
      uid: String(user.uid || ''),
      action: String(action || 'UNKNOWN').slice(0, 64),
      target: String(target ?? '').slice(0, 300),
      details: String(details ?? '').slice(0, 1000),
      timestamp: serverTimestamp()
    });
    return true;
  } catch (err) {
    console.warn('Could not write admin audit record', err);
    return false;
  }
};

/** Latest remote audit entries (Super Admin only), newest first. */
export const fetchRemoteAuditLog = async (max = 50) => {
  const snap = await getDocs(query(collection(db, 'admin_audit'), orderBy('timestamp', 'desc'), limit(max)));
  return snap.docs.map(d => {
    const data = d.data();
    const ts = data.timestamp;
    const date = ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : null);
    return { id: d.id, ...data, timestamp: date && !Number.isNaN(date.getTime()) ? date.toISOString() : '' };
  }).sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp))).slice(0, max);
};

export const getAdminAuditLog = () => {
  try {
    const raw = localStorage.getItem('vm_admin_audit_log');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

/**
 * JSON export of the admin's own vault, the user directory and the audit trail.
 */
export const exportPlatformDump = async () => {
  const [accounts, transactions, budgets, goals, loans, bills, investments, users] = await Promise.all([
    fetchAccounts().catch(() => []),
    fetchTransactions().catch(() => []),
    fetchBudgets().catch(() => []),
    fetchGoals().catch(() => []),
    fetchLoans().catch(() => []),
    fetchBills().catch(() => []),
    fetchInvestments().catch(() => []),
    getRegisteredUsers().catch(() => [])
  ]);

  const dump = {
    platform: 'Vault Manager Enterprise',
    version: '2.5.0',
    exportTimestamp: new Date().toISOString(),
    exportedBy: auth.currentUser?.email || SUPER_ADMIN_EMAIL,
    systemConfig: readConfigCache(),
    userDirectory: users,
    adminVault: { accounts, transactions, budgets, goals, loans, bills, investments },
    auditTrail: getAdminAuditLog()
  };

  const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `vault_manager_master_dump_${todayYMD()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  logAdminAction('PLATFORM_DUMP_EXPORT', 'Master Database', 'Exported JSON system snapshot');
};

/**
 * Flushes volatile caches and reloads. Keeps security settings and anything that
 * may hold data not yet synced to the cloud (offline payment drafts, local copies).
 */
const PRESERVED_KEYS = ['vm_admin_audit_log', 'vm_pin_hash', 'vm_webauthn_cred_id', 'vm_theme', 'vm_currency', 'vm_custom_categories'];
const PRESERVED_PREFIXES = ['vm_payment_draft', 'vm_ious:', 'vm_shared_tabs:', 'vm_transaction_rules:', 'vm_invoices:'];

export const flushSystemCache = async () => {
  try {
    const preserved = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (PRESERVED_KEYS.includes(key) || PRESERVED_PREFIXES.some(p => key.startsWith(p)))) {
        preserved[key] = localStorage.getItem(key);
      }
    }
    const audited = logAdminAction('CACHE_FLUSH', 'Local Client Cache', 'Flushed volatile caches (offline drafts preserved)');
    await Promise.race([audited, new Promise(r => setTimeout(r, 3000))]);
    localStorage.clear();
    Object.entries(preserved).forEach(([k, v]) => localStorage.setItem(k, v));
    window.location.reload();
  } catch (e) {
    console.error('Failed flushing cache', e);
  }
};
