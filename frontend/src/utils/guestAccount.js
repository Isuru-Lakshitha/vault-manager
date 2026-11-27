// Guest profiles: use the app without signing up (Firebase anonymous sign-in).
// The guest's data lives in the cloud under its own id, like any account, so
// rules, sync and offline work unchanged.
//
// Two ways to keep a guest's data in a real account:
//  - upgradeGuest(): turn the guest into an email/password account. Same id,
//    so nothing is copied and the data shows in the browser at once.
//  - stashGuestData() + importStashInto(): for an account that already exists.
//    A copy is kept on this device (IndexedDB), the user signs in normally
//    (MFA included), then the copy is imported with the backup-restore plan
//    (new ids, linked records kept together, safe to retry).
import { auth } from './firebaseApp.js';
import { signInAnonymously, linkWithCredential, EmailAuthProvider, sendEmailVerification } from 'firebase/auth';

export const isGuest = (user = auth.currentUser) => !!user?.isAnonymous;

export const GUEST_SIGN_OUT_WARNING = 'You are using a guest profile. Signing out permanently deletes this guest data from this device and the cloud, because a guest cannot sign back in. To keep it, go to Settings and create an account first.\n\nDelete the guest data and sign out?';

// A saved guest copy is offered only to the account it was meant for, and only for a week.
const STASH_DAYS = 7;
const normEmail = (e) => String(e || '').trim().toLowerCase();

/** Delete the guest's cloud data and guest login, then return to sign-in. */
export async function deleteGuestAndSignOut() {
  if (!isGuest()) throw new Error('Only a guest profile can be deleted this way.');
  const [{ deleteAccountAndData }, { signOutAndClear }] = await Promise.all([import('./accountService.js'), import('./signOut.js')]);
  try {
    await deleteAccountAndData({});
  } catch (err) {
    // The records are deleted first; if only removing the guest login fails
    // (e.g. "requires recent login"), still sign out.
    if (!/recent|auth\//i.test(String(err?.code || err?.message))) throw err;
  }
  if (auth.currentUser) await signOutAndClear({ redirectTo: '/' });
}

export async function startGuest() {
  return signInAnonymously(auth);
}

/** Turn the signed-in guest into an email/password account, keeping all data. */
export async function upgradeGuest(email, password) {
  const user = auth.currentUser;
  if (!user?.isAnonymous) throw new Error('Only a guest profile can be turned into an account.');
  const { user: upgraded } = await linkWithCredential(user, EmailAuthProvider.credential(email.trim(), password));
  await sendEmailVerification(upgraded).catch(() => {});
  // Now a normal (unverified) account: no fast-start as "verified", no leftover guest copy.
  const { rememberSession } = await import('./lastSession.js');
  rememberSession(upgraded.uid, false);
  await clearStash().catch(() => {});
  return upgraded;
}

// ── Device-only copy of guest data, kept until it's imported or discarded ──
const DB = 'vm-guest-transfer', STORE = 'pending', KEY = 'data';
function withStore(mode, fn) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => { db.close(); resolve(req?.result); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  });
}
export const readStash = () => withStore('readonly', s => s.get(KEY)).catch(() => null);
export const clearStash = () => withStore('readwrite', s => s.delete(KEY));

/** Copy the guest's data to this device so it can follow them into an existing account. */
export async function stashGuestData(forEmail) {
  if (!isGuest()) throw new Error('Only a guest profile can be moved.');
  if (!normEmail(forEmail).includes('@')) throw new Error('Enter the email of the account you will sign in to.');
  const { buildVaultBackup } = await import('./backupCrypto.js');
  const { payload, counts } = await buildVaultBackup('');
  await withStore('readwrite', s => s.put({ payload, counts, from: auth.currentUser.uid, forEmail: normEmail(forEmail), at: new Date().toISOString() }, KEY));
  return counts;
}

/** The saved copy if it's meant for this signed-in user; expired copies are deleted. */
export async function stashForCurrentUser() {
  const stash = await readStash();
  if (!stash?.payload) return null;
  const ageDays = (Date.now() - Date.parse(stash.at || 0)) / 86400000;
  if (!(ageDays <= STASH_DAYS)) { await clearStash().catch(() => {}); return null; }
  const user = auth.currentUser;
  if (!user || user.isAnonymous) return null;
  if (stash.from === user.uid) { await clearStash().catch(() => {}); return null; }
  return normEmail(user.email) === stash.forEmail ? stash : null;
}

/**
 * Import the stashed guest data into the signed-in (non-guest) account.
 * Resumable: records already imported from this copy are skipped.
 * @param {(done: number, total: number) => void} [onProgress]
 */
export async function importStashInto(onProgress) {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) throw new Error('Sign in to your account first.');
  const stash = await stashForCurrentUser();
  if (!stash) return { total: 0 };
  const [{ db }, { doc, runTransaction }, { backupFingerprint, planBackupImport }, api] = await Promise.all([
    import('./firebase.js'), import('firebase/firestore'), import('./backupPlan.js'), import('./api.js'),
  ]);
  const uid = user.uid;
  const plan = planBackupImport(stash.payload, uid, await backupFingerprint(stash.payload));
  let done = 0;
  for (const group of plan.groups) {
    await runTransaction(db, async txn => {
      const refs = group.map(op => doc(db, ...op.path));
      const snaps = await Promise.all(refs.map(ref => txn.get(ref)));
      if (snaps.some(s => s.exists() && (s.data().uid !== uid || s.data().import_id !== plan.fingerprint))) throw new Error('Import ID conflict. No existing record was overwritten.');
      if (snaps.every(s => s.exists())) return;
      if (snaps.some(s => s.exists())) throw new Error('A linked group was half imported. Try again to finish it.');
      group.forEach((op, i) => txn.set(refs[i], op.data));
    });
    done += group.length;
    onProgress?.(done, plan.total);
  }
  await clearStash();
  api.invalidateCache();
  return { total: plan.total };
}
