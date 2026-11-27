// @ts-check
import { db, auth } from './firebase.js';
import { collection, doc, getDocs, getDoc, query, where, writeBatch, deleteDoc } from 'firebase/firestore';
import { deleteUser, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';

export const USER_TOP_LEVEL_COLLECTIONS = [
  'accounts',
  'transactions',
  'budgets',
  'goals',
  'loans',
  'bills',
  'investments',
  'credit_cards',
  'recurring_transactions',
  'net_worth_history',
  'net_worth_snapshots',
  'receipts',
];

export const USER_SUBCOLLECTIONS = [
  'bills',
  'investments',
  'rules',
  'shared_tabs',
  'invoices',
  'ious',
  'error_logs',
];

/**
 * Export all user-owned documents across every collection and subcollection.
 * @param {string} uid
 */
export async function exportAllUserData(uid) {
  if (!uid) throw new Error('Sign in to export your data');
  /** @type {Record<string, any>} */
  const bundle = {
    version: 2,
    exportedAt: new Date().toISOString(),
    uid,
    email: auth?.currentUser?.email || null,
  };

  for (const collName of USER_TOP_LEVEL_COLLECTIONS) {
    const snap = await getDocs(query(collection(db, collName), where('uid', '==', uid)));
    bundle[collName] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  for (const subName of USER_SUBCOLLECTIONS) {
    const snap = await getDocs(collection(db, 'users', uid, subName));
    const key = subName === 'bills' || subName === 'investments' ? `user_${subName}` : subName;
    bundle[key] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  const prefSnap = await getDoc(doc(db, 'user_prefs', uid)).catch(() => null);
  bundle.user_prefs = prefSnap && prefSnap.exists() ? prefSnap.data() : null;

  return bundle;
}

/**
 * Delete an array of DocumentReferences in batches of <= 400.
 * @param {Array<any>} refs
 */
async function deleteRefsInBatches(refs) {
  const BATCH_LIMIT = 400;
  for (let i = 0; i < refs.length; i += BATCH_LIMIT) {
    const slice = refs.slice(i, i + BATCH_LIMIT);
    const batch = writeBatch(db);
    for (const ref of slice) batch.delete(ref);
    await batch.commit();
  }
}

/**
 * Permanently delete all Firestore data for the signed-in user and then delete their Firebase Auth account.
 * Re-authenticates with password first so we never delete Firestore data if re-auth fails.
 * @param {{ password: string, onProgress?: (step: string) => void }} options
 */
export async function deleteAccountAndData({ password, onProgress }) {
  const user = auth?.currentUser;
  if (!user || !user.uid) throw new Error('Sign in to continue');
  const uid = user.uid;

  if (user.email && password) {
    onProgress?.('Verifying your password…');
    const credential = EmailAuthProvider.credential(user.email, password);
    await reauthenticateWithCredential(user, credential);
  }

  const allRefs = [];
  onProgress?.('Scanning your ledger and collections…');
  for (const collName of USER_TOP_LEVEL_COLLECTIONS) {
    const snap = await getDocs(query(collection(db, collName), where('uid', '==', uid)));
    snap.docs.forEach(d => allRefs.push(d.ref));
  }

  for (const subName of USER_SUBCOLLECTIONS) {
    const snap = await getDocs(collection(db, 'users', uid, subName));
    snap.docs.forEach(d => allRefs.push(d.ref));
  }

  onProgress?.(`Deleting ${allRefs.length} records from cloud storage…`);
  if (allRefs.length > 0) {
    await deleteRefsInBatches(allRefs);
  }

  await deleteDoc(doc(db, 'user_prefs', uid)).catch(() => {});
  await deleteDoc(doc(db, 'users', uid)).catch(() => {});
  await deleteDoc(doc(db, 'user_directory', uid)).catch(() => {});

  // Clear user-scoped localStorage keys
  try {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.includes(uid) || k.startsWith('vm_'))) keysToRemove.push(k);
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
  } catch {}

  // A guest copy waiting on this device is part of the user's data too.
  try { const { clearStash } = await import('./guestAccount.js'); await clearStash(); } catch { /* none */ }

  onProgress?.('Deleting authentication account…');
  await deleteUser(user);
  return { deletedRecords: allRefs.length };
}
