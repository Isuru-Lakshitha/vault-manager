// Remembers who was signed in last on this device, so the app can open
// straight into their (cached) screens while Firebase re-checks the session
// with Google in the background. Removed whenever the session ends.
const SIGNED_IN = 'vm_signed_in';
const LAST_UID = 'vm_last_uid';
const LAST_VERIFIED = 'vm_last_verified';

export function rememberSession(uid, verified) {
  try {
    localStorage.setItem(SIGNED_IN, '1');
    localStorage.setItem(LAST_UID, String(uid));
    localStorage.setItem(LAST_VERIFIED, verified ? '1' : '0');
  } catch { /* private mode */ }
}

export function forgetSession() {
  try { for (const k of [SIGNED_IN, LAST_UID, LAST_VERIFIED]) localStorage.removeItem(k); } catch { /* private mode */ }
}

/** The last signed-in user's id when their session is still expected, else null. */
export function optimisticUid() {
  try {
    if (localStorage.getItem(SIGNED_IN) !== '1') return null;
    return localStorage.getItem(LAST_UID) || null;
  } catch { return null; }
}

/** Whether that user had a verified email last time (so no verification screen flashes). */
export const optimisticVerified = () => {
  try { return localStorage.getItem(LAST_VERIFIED) === '1'; } catch { return false; }
};
