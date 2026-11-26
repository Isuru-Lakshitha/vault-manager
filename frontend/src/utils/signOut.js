import { auth } from './firebaseApp.js';
import { apiIfLoaded } from './lazyData.js';
import { toast } from 'react-hot-toast';

// Set when the offline copy could not be removed (usually because another tab
// still had it open). The next start with nobody signed in retries the wipe.
export const WIPE_PENDING_KEY = 'vm_offline_wipe_pending';

// localStorage copies of cloud data that are rebuilt after sign-in, so they
// can be removed safely. Copies that may hold unsynced changes (rules, shared
// tabs, IOUs, offline drafts) are kept so nothing is lost.
/** @param {string} uid */
export const cachedFinancialKeys = uid => [`vm_dash_snapshot_${uid}`, `vm_invoices:${uid}`];

let signingOut = false;
// Set when the last clear kept the offline copy because changes hadn't synced.
let unsyncedKept = false;

/** @param {string | null | undefined} uid */
function removeCachedFinancialKeys(uid) {
  if (!uid) return;
  for (const key of cachedFinancialKeys(uid)) {
    try { localStorage.removeItem(key); } catch { /* private mode */ }
  }
}

/**
 * Delete Firestore's IndexedDB databases directly. Used when Firestore's own
 * clear failed or before Firestore has loaded. If another tab still has the
 * database open, the browser finishes the delete once that tab closes it.
 * @returns {Promise<boolean>} true when every database was deleted
 */
export async function deleteOfflineDatabases() {
  if (typeof indexedDB === 'undefined' || typeof indexedDB.databases !== 'function') return false;
  const names = (await indexedDB.databases()).map(d => d.name || '').filter(n => n.startsWith('firestore/'));
  const results = await Promise.all(names.map(name => new Promise(resolve => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = () => resolve(true);
    req.onerror = () => resolve(false);
    // Blocked by another open tab: report failure (the flag stays set), but
    // the browser keeps the delete queued and may still finish it later.
    req.onblocked = () => setTimeout(() => resolve(false), 3000);
  })));
  return results.every(Boolean);
}

/**
 * Remove the offline copy of the signed-in user's Firestore data. Changes
 * still waiting to sync are kept (copy not cleared) rather than lost.
 * @returns {Promise<boolean>} true when Firestore was shut down (reload needed)
 */
async function clearOfflineCopy() {
  unsyncedKept = false;
  if (!apiIfLoaded()) return false;
  let terminated = false;
  try {
    const [{ db }, fs] = await Promise.all([import('./firebase.js'), import('firebase/firestore')]);
    const synced = typeof fs.waitForPendingWrites === 'function'
      ? await Promise.race([fs.waitForPendingWrites(db).then(() => true), new Promise(r => setTimeout(() => r(false), 4000))])
      : false;
    if (!synced) {
      // Unsynced changes now live in the offline copy: an old pending wipe
      // must not delete them at the next start.
      try { localStorage.removeItem(WIPE_PENDING_KEY); } catch { /* private mode */ }
      unsyncedKept = true;
    }
    if (synced && typeof fs.terminate === 'function' && typeof fs.clearIndexedDbPersistence === 'function') {
      await fs.terminate(db);
      terminated = true;
      await fs.clearIndexedDbPersistence(db);
      try { localStorage.removeItem(WIPE_PENDING_KEY); } catch { /* private mode */ }
    }
  } catch (err) {
    // Usually another tab still has the app open.
    console.warn('Could not clear offline data:', err);
    if (terminated) {
      try { localStorage.setItem(WIPE_PENDING_KEY, '1'); } catch { /* private mode */ }
      // This tab has let go of the database, so the browser can finish the
      // delete as soon as the other tabs (also signing out) let go too.
      deleteOfflineDatabases()
        .then(ok => { if (ok) localStorage.removeItem(WIPE_PENDING_KEY); })
        .catch(() => {});
    }
  }
  return terminated;
}

/** @param {string | undefined} redirectTo */
function reloadPage(redirectTo) {
  if (redirectTo) window.location.assign(redirectTo);
  else window.location.reload();
}

/**
 * Sign out and remove this user's offline financial data from the device, so
 * the next person on a shared phone or computer can't read it.
 * Every sign-out button must use this instead of calling auth.signOut().
 * @param {{ redirectTo?: string }} [options] where to go after a cleared copy
 *   forces a page reload (default: reload the current page)
 * @returns {Promise<boolean>} true when the page is reloading
 * @throws when Firebase sign-out fails, so callers can tell the user
 */
export async function signOutAndClear({ redirectTo } = {}) {
  try { localStorage.removeItem('vm_pin_fails'); } catch { /* private mode */ }
  signingOut = true;
  try {
    removeCachedFinancialKeys(auth.currentUser?.uid);
    const terminated = await clearOfflineCopy();
    try {
      await auth.signOut();
    } catch (error) {
      console.error('Error signing out: ', error);
      // Firestore was shut down for the wipe; reload so the app recovers.
      if (terminated) window.location.reload();
      throw error;
    }
    if (unsyncedKept) {
      toast('Some changes have not synced yet, so your data is still saved on this device. Sign in again when online to sync them.', { duration: 8000 });
    }
    if (terminated) reloadPage(redirectTo);
    return terminated;
  } finally {
    signingOut = false;
  }
}

/**
 * The session ended without this tab's Sign out button: signed out in another
 * tab, login expired or revoked, or the account was deleted. Remove the same
 * offline data a normal sign-out does.
 * @param {string | null | undefined} previousUid the user who was signed in
 */
export async function clearAfterSessionEnded(previousUid) {
  if (signingOut || !previousUid) return;
  removeCachedFinancialKeys(previousUid);
  if (await clearOfflineCopy()) window.location.reload();
}

/** Someone signed in: their own sign-out decides about the offline copy now. */
export function cancelPendingOfflineWipe() {
  try { localStorage.removeItem(WIPE_PENDING_KEY); } catch { /* private mode */ }
}

/**
 * At start-up with nobody signed in, finish a wipe that failed last time.
 * Must run before Firestore loads (it only loads after sign-in).
 */
export function retryPendingOfflineWipe() {
  try {
    if (localStorage.getItem(WIPE_PENDING_KEY) !== '1' || localStorage.getItem('vm_signed_in') === '1') return;
  } catch { return; }
  deleteOfflineDatabases()
    .then(ok => { if (ok) localStorage.removeItem(WIPE_PENDING_KEY); })
    .catch(() => {});
}
