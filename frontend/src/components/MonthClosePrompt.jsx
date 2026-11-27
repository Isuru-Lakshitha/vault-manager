import { lazy, Suspense, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CalendarCheck } from 'lucide-react';
import { fetchUserPrefs, getUserId, saveUserPrefs } from '../utils/api';
import { auth } from '../utils/firebaseApp';
import { previousMonth, monthLabel, shouldOfferClose } from '../utils/monthClose';
import { localClosedMonths, mergeClosedMonths, rememberClosedMonth } from '../utils/closedMonths';
import { spring } from '../motion/presets';
import { useT, useLang } from '../i18n';
import { optimisticUid } from '../utils/lastSession';

const MonthCloseModal = lazy(() => import('./MonthCloseModal'));

/*
 * Dashboard prompt to close last month. Appears once a month (when the
 * previous month has transactions and hasn't been closed or skipped).
 * Also opens on the vm:open-month-close event (Dashboard tools menu).
 */
export default function MonthClosePrompt({ accounts, transactions, budgets }) {
  const month = previousMonth();
  const t = useT();
  const lang = useLang();
  const [closed, setClosed] = useState(() => localClosedMonths(auth.currentUser?.uid || optimisticUid()));
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState(month);

  useEffect(() => {
    let alive = true;
    getUserId()
      .then(async (uid) => (uid ? { uid, prefs: await fetchUserPrefs(uid) } : null))
      .then((res) => { if (alive && res) setClosed(mergeClosedMonths(res.uid, res.prefs?.closed_months)); })
      .catch(() => {});
    const openIt = (e) => { setTarget(e?.detail?.month || month); setOpen(true); };
    window.addEventListener('vm:open-month-close', openIt);
    return () => { alive = false; window.removeEventListener('vm:open-month-close', openIt); };
  }, [month]);

  const offer = shouldOfferClose({ month, closedMonths: closed, transactions });

  const skip = async () => {
    const record = { skipped: true, closed_at: new Date().toISOString() };
    setClosed((c) => ({ ...c, [month]: record }));
    const uid = await getUserId().catch(() => null);
    if (uid) { rememberClosedMonth(uid, month, record); saveUserPrefs(uid, { closed_months: { [month]: record } }); }
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
              <strong>{t('mc.over', { month: monthLabel(month, lang) })}</strong>
              <p>{t('mc.body')}</p>
            </div>
            <div className="ui-banner-actions">
              <button type="button" className="btn btn-secondary" onClick={skip}>{t('common.skip')}</button>
              <button type="button" className="btn btn-primary" onClick={() => { setTarget(month); setOpen(true); }}>{t('mc.close')}</button>
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
