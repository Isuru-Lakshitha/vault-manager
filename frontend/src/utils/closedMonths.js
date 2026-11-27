/*
 * Closed months: synced in user_prefs.closed_months, mirrored in
 * localStorage (per user) so the dashboard prompt doesn't flash before prefs
 * load and so saving can check the lock without a network round trip.
 *
 * A record is { closed_at, ... } when closed, { skipped: true } when the
 * prompt was skipped, and gets reopened_at when the user reopens the month.
 */
const LEGACY_KEY = 'vm_closed_months';
const keyFor = (uid) => `vm_closed_months:${uid || 'anon'}`;

// The old copy wasn't tied to a user, so it could mix two people's months on
// one device. The synced prefs restore each user's own months.
try { localStorage.removeItem(LEGACY_KEY); } catch { /* private mode / tests */ }

export function localClosedMonths(uid) {
  try { return JSON.parse(localStorage.getItem(keyFor(uid)) || '{}') || {}; } catch { return {}; }
}

export function rememberClosedMonth(uid, month, record) {
  try {
    const all = localClosedMonths(uid);
    all[month] = record;
    localStorage.setItem(keyFor(uid), JSON.stringify(all));
  } catch { /* private mode */ }
}

/** Merge synced months into this user's local copy and return the union. */
export function mergeClosedMonths(uid, synced) {
  const all = { ...localClosedMonths(uid), ...(synced || {}) };
  try { localStorage.setItem(keyFor(uid), JSON.stringify(all)); } catch { /* private mode */ }
  return all;
}

/** True when the month was really closed (not skipped) and not reopened. */
export const isMonthLocked = (record) => !!record && !record.skipped && !!record.closed_at && !record.reopened_at;

/** Months that are locked, newest first. */
export function lockedMonths(all) {
  return Object.entries(all || {}).filter(([, r]) => isMonthLocked(r)).map(([m]) => m).sort().reverse();
}

/**
 * Throw if a change dated `date` (YYYY-MM-DD) would alter a closed month.
 * @param {string} uid
 * @param {...(string|null|undefined)} dates every date the change touches
 */
export function assertMonthsOpen(uid, ...dates) {
  const all = localClosedMonths(uid);
  for (const d of dates) {
    const month = typeof d === 'string' ? d.slice(0, 7) : '';
    if (month && isMonthLocked(all[month])) {
      const err = new Error(`${month} is closed, so its transactions can't change. Reopen it in Settings → Closed months first.`);
      err.code = 'month-closed';
      throw err;
    }
  }
}
