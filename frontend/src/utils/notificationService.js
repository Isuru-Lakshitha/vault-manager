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
export const checkFinancialTriggers = async ({ bills = [] }) => {
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

  // Budget thresholds are announced by components/BudgetWatcher (shared
  // logic with the Alert Center in utils/alertEngine).

};
