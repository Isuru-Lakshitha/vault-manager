/**
 * Smart Notification Service (Zero Cost)
 * Leverages native Web Notifications API and Service Worker Push
 * Works on Desktop (Chrome, Safari, Edge, Firefox) and Mobile PWAs.
 */

import { haptic } from './format';
import { toYMD } from './dates';

export const isNotificationSupported = () => {
  return typeof window !== 'undefined' && 'Notification' in window;
};

export const getNotificationPermission = () => {
  if (!isNotificationSupported()) return 'unsupported';
  return Notification.permission; // 'granted', 'denied', 'default'
};

export const requestNotificationPermission = async () => {
  if (!isNotificationSupported()) return 'unsupported';
  try {
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      localStorage.setItem('vm_notifications_enabled', 'true');
      sendNotification('🔔 Notifications Enabled', {
        body: 'Vault Manager will alert you for upcoming bills and budget warnings.',
        icon: '/pwa-192x192.png'
      });
      haptic();
    }
    return perm;
  } catch (err) {
    console.warn('Failed requesting notification permission', err);
    return 'denied';
  }
};

export const sendNotification = async (title, options = {}) => {
  if (!isNotificationSupported() || Notification.permission !== 'granted') return false;

  const defaultOptions = {
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: options.tag || 'vm-alert',
    vibrate: [200, 100, 200],
    ...options
  };

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready.catch(() => null);
      if (reg && reg.showNotification) {
        await reg.showNotification(title, defaultOptions);
        return true;
      }
    }
    new Notification(title, defaultOptions);
    return true;
  } catch (err) {
    console.warn('Error firing system notification', err);
    return false;
  }
};

/**
 * Evaluates user financial state and sends smart contextual reminders
 * Guaranteed to never spam: each alert has a cooldown key in localStorage
 */
export const checkFinancialTriggers = async ({ bills = [], budgets = [], transactions = [] }) => {
  if (getNotificationPermission() !== 'granted') return;
  const now = new Date();
  const todayStr = toYMD(now);

  // 1. Check Upcoming Bills (Due within 72 hours)
  const threeDaysFromNow = toYMD(new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000));
  for (const bill of bills) {
    if (bill.paid) continue;
    if (bill.due_date && bill.due_date >= todayStr && bill.due_date <= threeDaysFromNow) {
      const alertKey = `vm_notif_bill_${bill.id}_${bill.due_date}`;
      if (!localStorage.getItem(alertKey)) {
        const isToday = bill.due_date === todayStr;
        sendNotification(
          isToday ? `⚠️ Bill Due Today: ${bill.name}` : `📅 Upcoming Bill: ${bill.name}`,
          {
            body: `Amount: ${bill.amount} · Due on ${bill.due_date}. Tap to review and pay.`,
            tag: `bill-${bill.id}`
          }
        );
        localStorage.setItem(alertKey, '1');
      }
    }
  }

  // 2. Check Over-Budget Categories (> 90% or > 100%)
  const currentMonth = todayStr.substring(0, 7); // YYYY-MM
  const monthExpenses = transactions.filter(t => t.type === 'Expense' && (t.date || '').startsWith(currentMonth));
  
  for (const budget of budgets) {
    if (budget.month && budget.month !== currentMonth) continue;
    const spent = monthExpenses
      .filter(t => (t.category || '').toLowerCase() === (budget.category || '').toLowerCase())
      .reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);

    const limit = parseFloat(budget.amount) || 0;
    if (limit <= 0) continue;

    const pct = (spent / limit) * 100;
    if (pct >= 90) {
      const alertKey = `vm_notif_budget_${budget.id}_${currentMonth}_${pct >= 100 ? '100' : '90'}`;
      if (!localStorage.getItem(alertKey)) {
        sendNotification(
          pct >= 100 ? `🚨 Budget Exceeded: ${budget.category}` : `⚠️ Budget Warning: ${budget.category}`,
          {
            body: `You've spent ${pct.toFixed(0)}% of your ${budget.category} budget this month.`,
            tag: `budget-${budget.id}`
          }
        );
        localStorage.setItem(alertKey, '1');
      }
    }
  }
};
