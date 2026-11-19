import { lazy, Suspense, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CalendarCheck } from 'lucide-react';
import { fetchUserPrefs, getUserId, saveUserPrefs } from '../utils/api';
import { previousMonth, monthLabel, shouldOfferClose } from '../utils/monthClose';
import { localClosedMonths, mergeClosedMonths, rememberClosedMonth } from '../utils/closedMonths';
import { spring } from '../motion/presets';

const MonthCloseModal = lazy(() => import('./MonthCloseModal'));

/*
 * Dashboard prompt to close last month. Appears once a month (when the
 * previous month has transactions and hasn't been closed or skipped).
 * Also opens on the vm:open-month-close event (Dashboard tools menu).
 */
export default function MonthClosePrompt({ accounts, transactions, budgets }) {
  const month = previousMonth();
  const [closed, setClosed] = useState(localClosedMonths);
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState(month);

  useEffect(() => {
    let alive = true;
    getUserId()
      .then((uid) => (uid ? fetchUserPrefs(uid) : null))
      .then((prefs) => { if (alive) setClosed(mergeClosedMonths(prefs?.closed_months)); })
      .catch(() => {});
    const openIt = (e) => { setTarget(e?.detail?.month || month); setOpen(true); };
    window.addEventListener('vm:open-month-close', openIt);
    return () => { alive = false; window.removeEventListener('vm:open-month-close', openIt); };
  }, [month]);

  const offer = shouldOfferClose({ month, closedMonths: closed, transactions });

  const skip = async () => {
    const record = { skipped: true, closed_at: new Date().toISOString() };
    rememberClosedMonth(month, record);
    setClosed((c) => ({ ...c, [month]: record }));
    const uid = await getUserId().catch(() => null);
    if (uid) saveUserPrefs(uid, { closed_months: { [month]: record } });
  };

  return (
    <>
      <AnimatePresence initial={false}>
        {offer && (
          <motion.div
            className="ui-banner ui-banner-info month-close-prompt"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8, height: 0, marginBottom: 0, paddingBlock: 0 }}
            transition={spring.liquid}
          >
            <CalendarCheck size={22} className="month-close-icon" aria-hidden="true" />
            <div style={{ flex: 1, minWidth: 180 }}>
              <strong>{monthLabel(month)} is over</strong>
              <p>Check balances and review the month. It takes about two minutes.</p>
            </div>
            <div className="ui-banner-actions">
              <button type="button" className="btn btn-secondary" onClick={skip}>Skip</button>
              <button type="button" className="btn btn-primary" onClick={() => { setTarget(month); setOpen(true); }}>Close month</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {open && (
        <Suspense fallback={null}>
          <MonthCloseModal
            isOpen={open}
            onClose={() => setOpen(false)}
            month={target}
            accounts={accounts}
            transactions={transactions}
            budgets={budgets}
            onClosed={(m, record) => setClosed((c) => ({ ...c, [m]: record }))}
          />
        </Suspense>
      )}
    </>
  );
}
