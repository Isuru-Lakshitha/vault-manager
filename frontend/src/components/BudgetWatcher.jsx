import { useEffect } from 'react';
import toast from 'react-hot-toast';
import { fetchBudgets, fetchTransactions } from '../utils/api';
import { budgetAnnouncements, BUDGET_ANNOUNCED_KEY } from '../utils/alertEngine';
import { getNotificationPermission, sendNotification } from '../utils/notificationService';

const load = () => { try { return JSON.parse(localStorage.getItem(BUDGET_ANNOUNCED_KEY) || '[]'); } catch { return []; } };
const save = (ids) => { try { localStorage.setItem(BUDGET_ANNOUNCED_KEY, JSON.stringify(ids)); } catch { /* private mode */ } };

/*
 * Tells the user the moment a budget passes 80% or 100% this month: a toast
 * in the app and, if allowed, a system notification. Each level is announced
 * once per category per month. On start-up, crossings that already happened
 * are only sent as notifications (the Alert Center lists them anyway).
 */
export default function BudgetWatcher() {
  useEffect(() => {
    let started = false;
    let running = false;

    const check = async () => {
      if (running) return;
      running = true;
      try {
        const [budgets, transactions] = await Promise.all([fetchBudgets(), fetchTransactions()]);
        const { fresh, announced } = budgetAnnouncements({ budgets, transactions, announced: load() });
        save(announced);
        const notify = getNotificationPermission() === 'granted';
        for (const a of fresh) {
          if (started) {
            const show = a.type === 'danger' ? toast.error : toast;
            show(`${a.title}. ${a.body}`, { id: a.id, duration: 6000, ...(a.type === 'danger' ? {} : { icon: '⚠️' }) });
          }
          if (notify) sendNotification(a.title, { body: a.body, tag: a.id });
        }
      } catch { /* offline or signed out: try again on the next change */ }
      finally { started = true; running = false; }
    };

    const onChange = (e) => {
      const key = e?.detail?.key;
      if (!key || key === 'transactions' || key === 'budgets') check();
    };
    check();
    window.addEventListener('vm:data-changed', onChange);
    return () => window.removeEventListener('vm:data-changed', onChange);
  }, []);
  return null;
}
