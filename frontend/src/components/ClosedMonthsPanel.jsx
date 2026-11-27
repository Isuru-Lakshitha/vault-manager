import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { auth } from '../utils/firebaseApp';
import { fetchUserPrefs, saveUserPrefs } from '../utils/api';
import { localClosedMonths, mergeClosedMonths, rememberClosedMonth, lockedMonths } from '../utils/closedMonths';
import { monthLabel } from '../utils/monthClose';

/*
 * Closed months can't have their transactions added, edited or deleted, so
 * their reconciled totals stay true. Reopen one here to change it, then close
 * it again here.
 */
export default function ClosedMonthsPanel() {
  const uid = auth.currentUser?.uid;
  const [all, setAll] = useState(() => localClosedMonths(uid));
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    let alive = true;
    if (uid) fetchUserPrefs(uid).then(p => { if (alive) setAll(mergeClosedMonths(uid, p?.closed_months)); }).catch(() => {});
    return () => { alive = false; };
  }, [uid]);

  const reopen = async (month) => {
    if (!uid) return;
    setBusy(month);
    const record = { ...all[month], reopened_at: new Date().toISOString() };
    try {
      await saveUserPrefs(uid, { closed_months: { [month]: record } });
      rememberClosedMonth(uid, month, record);
      setAll(a => ({ ...a, [month]: record }));
      toast.success(`${monthLabel(month)} reopened. Close it again here when you're done.`);
    } catch (err) {
      toast.error(err?.message || 'Could not reopen the month');
    } finally { setBusy(null); }
  };

  const lockAgain = async (month) => {
    if (!uid) return;
    setBusy(month);
    const record = { ...all[month], closed_at: new Date().toISOString(), skipped: false, reopened_at: null };
    try {
      await saveUserPrefs(uid, { closed_months: { [month]: record } });
      rememberClosedMonth(uid, month, record);
      setAll(a => ({ ...a, [month]: record }));
      toast.success(`${monthLabel(month)} closed again`);
    } catch (err) {
      toast.error(err?.message || 'Could not close the month');
    } finally { setBusy(null); }
  };

  const months = lockedMonths(all);
  const reopened = Object.entries(all || {}).filter(([, r]) => r?.reopened_at).map(([m]) => m).sort().reverse();
  return (
    <div>
      <p style={{ margin: '0 0 0.75rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
        Transactions in a closed month can't be added, changed or deleted, so its totals stay as you checked them.
      </p>
      {reopened.length > 0 && (
        <ul style={{ listStyle: 'none', margin: '0 0 0.75rem', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {reopened.map(m => (
            <li key={m} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
              <span>{monthLabel(m)} <small style={{ color: 'var(--text-muted)' }}>(reopened)</small></span>
              <button type="button" className="btn btn-primary" disabled={busy === m} onClick={() => lockAgain(m)}>
                {busy === m ? 'Closing…' : 'Close again'}
              </button>
            </li>
          ))}
        </ul>
      )}
      {months.length === 0 ? (
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem' }}>No closed months yet.</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {months.map(m => (
            <li key={m} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
              <span>{monthLabel(m)}</span>
              <button type="button" className="btn btn-secondary" disabled={busy === m} onClick={() => reopen(m)}>
                {busy === m ? 'Reopening…' : 'Reopen'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
