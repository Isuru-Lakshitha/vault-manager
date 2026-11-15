// @ts-check

export const SESSION_TIMEOUT_OPTIONS = [
  { value: 5, label: '5 minutes' },
  { value: 15, label: '15 minutes' },
  { value: 30, label: '30 minutes (Default)' },
  { value: 60, label: '60 minutes' },
  { value: 0, label: 'Never' },
];

const DEFAULT_TIMEOUT_MINUTES = 30;
const KEY_PREFIX = 'vm_session_timeout_mins:';

/**
 * Get the configured inactivity timeout (in minutes) for a user.
 * Returns 0 when disabled ("Never").
 * @param {string | null | undefined | { getItem: (k: string) => string | null }} [uidOrStorage]
 * @param {{ getItem: (k: string) => string | null }} [customStorage]
 * @returns {number}
 */
export function getSessionTimeoutMinutes(uidOrStorage, customStorage) {
  try {
    const isStorageObj =
      uidOrStorage && typeof uidOrStorage === 'object' && typeof uidOrStorage.getItem === 'function';
    const uid = isStorageObj ? 'anon' : /** @type {string | null | undefined} */ (uidOrStorage);
    const store = isStorageObj
      ? /** @type {{ getItem: (k: string) => string | null }} */ (uidOrStorage)
      : customStorage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!store || typeof store.getItem !== 'function') return DEFAULT_TIMEOUT_MINUTES;
    const raw = store.getItem(`${KEY_PREFIX}${uid || 'anon'}`);
    if (raw === null || raw === '') return DEFAULT_TIMEOUT_MINUTES;
    const parsed = Number(raw);
    if ([0, 5, 15, 30, 60].includes(parsed)) return parsed;
    return DEFAULT_TIMEOUT_MINUTES;
  } catch {
    return DEFAULT_TIMEOUT_MINUTES;
  }
}

/**
 * Persist the inactivity timeout setting (in minutes) for a user.
 * Supports both `setSessionTimeoutMinutes(uid, minutes)` and `setSessionTimeoutMinutes(minutes, storage)`.
 * @param {string | number | null | undefined} uidOrMinutes
 * @param {number | { setItem: (k: string, v: string) => void }} [minutesOrStorage]
 * @param {{ setItem: (k: string, v: string) => void }} [customStorage]
 */
export function setSessionTimeoutMinutes(uidOrMinutes, minutesOrStorage, customStorage) {
  const isFirstArgMinutes = typeof uidOrMinutes === 'number';
  const uid = isFirstArgMinutes ? 'anon' : (uidOrMinutes || 'anon');
  const rawMinutes = isFirstArgMinutes ? uidOrMinutes : Number(minutesOrStorage);
  const valid = [0, 5, 15, 30, 60].includes(Number(rawMinutes)) ? Number(rawMinutes) : DEFAULT_TIMEOUT_MINUTES;

  const store =
    isFirstArgMinutes && minutesOrStorage && typeof minutesOrStorage === 'object'
      ? minutesOrStorage
      : customStorage || (typeof localStorage !== 'undefined' ? localStorage : null);

  try {
    if (store && typeof store.setItem === 'function') {
      store.setItem(`${KEY_PREFIX}${uid}`, String(valid));
    }
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('vm:session-timeout-changed', { detail: { minutes: valid } }));
    }
  } catch {}
  return valid;
}

/**
 * Evaluate elapsed idle time against the configured timeout and warning threshold.
 * @param {number} idleMs
 * @param {number} timeoutMinutes
 * @returns {'active' | 'warning' | 'expired'}
 */
export function evaluateIdleState(idleMs, timeoutMinutes) {
  if (!timeoutMinutes || timeoutMinutes <= 0) return 'active';
  const limitMs = timeoutMinutes * 60_000;
  if (idleMs >= limitMs) return 'expired';
  const warnAtMs = Math.max(0, limitMs - 60_000);
  if (idleMs >= warnAtMs) return 'warning';
  return 'active';
}
