/*
 * Closed months: synced in user_prefs.closed_months, mirrored in
 * localStorage so the dashboard prompt doesn't flash before prefs load.
 */
const KEY = 'vm_closed_months';

export function localClosedMonths() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; }
}

export function rememberClosedMonth(month, record) {
  try {
    const all = localClosedMonths();
    all[month] = record;
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch { /* private mode */ }
}

/** Merge synced months into the local copy and return the union. */
export function mergeClosedMonths(synced) {
  const all = { ...localClosedMonths(), ...(synced || {}) };
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* private mode */ }
  return all;
}
