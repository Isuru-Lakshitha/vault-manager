// Pure alert computation + per-user dismiss/snooze persistence for AlertCenter.
// No Firebase/React imports so it can be unit-tested directly.

export const DAY_MS = 24 * 60 * 60 * 1000;
export const BACKUP_DAYS_KEY = 'vm_backup_reminder_days';
export const LAST_BACKUP_KEY = 'vm_last_backup_ts';
export const DEFAULT_BACKUP_DAYS = 7;

const normCat = (c) => String(c || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const money = (n) => (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const monthKey = (now = new Date()) => ymd(now).slice(0, 7);

/** Budget usage alerts (80% warning, 100% exceeded) for the current month. */
export function computeBudgetAlerts({ budgets = [], transactions = [], now = new Date() } = {}) {
  const month = monthKey(now);
  const spendByCat = new Map();
  for (const t of transactions || []) {
    if (!t || t.reversed_at || t.reversal_of || t.is_transfer_fee) continue;
    if ((t.type !== 'Expense' && t.type !== 'Loan Payment') || typeof t.date !== 'string' || !t.date.startsWith(month)) continue;
    const validSplits = t.isSplit !== false && Array.isArray(t.splits)
      ? t.splits.filter(sp => (Number(sp?.amount) || 0) > 0)
      : [];
    if (validSplits.length > 0) {
      for (const sp of validSplits) {
        const k = normCat(sp.category || t.category);
        spendByCat.set(k, (spendByCat.get(k) || 0) + (Number(sp.amount) || 0));
      }
    } else {
      const k = normCat(t.category);
      spendByCat.set(k, (spendByCat.get(k) || 0) + (Number(t.amount) || 0));
    }
  }
  const seen = new Set();
  const alerts = [];
  for (const b of budgets || []) {
    const limit = Number(b?.amount);
    if (!b?.category || b.month !== month || !(limit > 0)) continue;
    const key = normCat(b.category);
    if (seen.has(key)) continue; // one alert per category even with duplicate budget docs
    seen.add(key);
    const spent = spendByCat.get(key) || 0;
    const pct = Math.floor((spent / limit) * 100);
    if (pct < 80) continue;
    const level = pct >= 100 ? 100 : 80;
    alerts.push({
      id: `budget-${key}-${month}-${level}`,
      kind: 'budget',
      href: '/budgets',
      type: level === 100 ? 'danger' : 'warning',
      title: level === 100 ? `Budget exceeded: ${b.category}` : `Budget at ${pct}%: ${b.category}`,
      body: `${money(spent)} of ${money(limit)} used this month.`
    });
  }
  return alerts;
}

/** Unpaid bills overdue, due today, or due within `windowDays` days. */
export function computeBillAlerts({ bills = [], now = new Date(), windowDays = 3 } = {}) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const seen = new Set();
  const rows = [];
  for (const b of bills || []) {
    if (!b || b.paid || typeof b.due_date !== 'string') continue;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(b.due_date);
    if (!m) continue;
    const due = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const days = Math.round((due - today) / DAY_MS);
    if (days > windowDays) continue;
    const id = `bill-${b.id ?? b.name}-${m[0]}-${days < 0 ? 'overdue' : 'due'}`;
    if (seen.has(id)) continue;
    seen.add(id);
    rows.push({ days, alert: {
      id,
      kind: 'bill',
      href: '/bills',
      type: days <= 0 ? 'danger' : 'warning',
      title: days < 0 ? `Overdue bill: ${b.name}` : days === 0 ? `Bill due today: ${b.name}` : `Bill due in ${days}d: ${b.name}`,
      body: `${b.name} (${money(b.amount)}) ${days < 0 ? `was due ${m[0]} (${Math.abs(days)} day(s) overdue)` : `is due ${m[0]}`}.`
    } });
  }
  return rows.sort((a, c) => a.days - c.days).map(r => r.alert);
}

/** Unpaid fixed-date recurring reminders overdue, due today, or due within `windowDays` days. */
export function computeRecurringAlerts({ recurring = [], now = new Date(), windowDays = 3 } = {}) {
  const month = monthKey(now);
  const todayDom = now.getDate();
  const seen = new Set();
  const rows = [];
  for (const r of recurring || []) {
    if (!r || r.paused || r.last_applied_month === month) continue;
    const isFlexible = (r.schedule_mode || (r.day_of_month ? 'fixed' : 'flexible')) === 'flexible';
    const dom = parseInt(r.day_of_month, 10);
    if (isFlexible || !Number.isFinite(dom) || dom < 1 || dom > 31) continue;
    const days = dom - todayDom;
    if (days > windowDays) continue;
    const label = r.name || r.category || 'Recurring Reminder';
    const amt = Number(r.amount) || Number(r.avg_amount) || 0;
    const id = `recurring-${r.id ?? label}-${month}-${days < 0 ? 'overdue' : 'due'}`;
    if (seen.has(id)) continue;
    seen.add(id);
    rows.push({
      days,
      alert: {
        id,
        kind: 'recurring',
        href: '/recurring',
        type: days <= 0 ? 'danger' : 'warning',
        title: days < 0
          ? `Overdue reminder: ${label}`
          : days === 0
            ? `Reminder due today: ${label}`
            : `Reminder due in ${days}d: ${label}`,
        body: `${label} (${money(amt)}) ${days < 0 ? `was scheduled for Day ${dom} (${Math.abs(days)}d ago)` : `is scheduled for Day ${dom}`}.`
      }
    });
  }
  return rows.sort((a, c) => a.days - c.days).map(r => r.alert);
}

/** Credit card high utilization (>=80%) and upcoming payment due dates. */
export function computeCardAlerts({ cards = [], now = new Date(), windowDays = 5 } = {}) {
  const month = monthKey(now);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayDom = now.getDate();
  const alerts = [];
  for (const c of cards || []) {
    if (!c) continue;
    const bal = Number(c.balance ?? c.current_balance) || 0;
    if (bal <= 0) continue;
    const limit = Number(c.credit_limit) || 0;
    const name = c.name || 'Credit Card';
    if (limit > 0) {
      const pct = Math.floor((bal / limit) * 100);
      if (pct >= 80) {
        alerts.push({
          id: `card-util-${c.id ?? name}-${month}`,
          kind: 'card',
          href: '/cards',
          type: pct >= 95 ? 'danger' : 'warning',
          title: `High card utilization (${pct}%): ${name}`,
          body: `${money(bal)} used of ${money(limit)} limit.`
        });
      }
    }
    let days = null;
    let dueLabel = '';
    if (typeof c.due_date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(c.due_date)) {
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(c.due_date);
      const due = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      days = Math.round((due - today) / DAY_MS);
      dueLabel = m[0];
    } else {
      const dueDom = parseInt(c.payment_due_day, 10);
      if (Number.isFinite(dueDom) && dueDom >= 1 && dueDom <= 31) {
        days = dueDom - todayDom;
        dueLabel = `Day ${dueDom}`;
      }
    }
    if (days !== null && days >= -7 && days <= windowDays) {
      alerts.push({
        id: `card-due-${c.id ?? name}-${month}`,
        kind: 'card',
        href: '/cards',
        type: days <= 0 ? 'danger' : 'warning',
        title: days < 0
          ? `Card payment overdue: ${name}`
          : days === 0
            ? `Card payment due today: ${name}`
            : `Card payment due in ${days}d: ${name}`,
        body: `${name} balance ${money(bal)} due on ${dueLabel}.`
      });
    }
  }
  return alerts;
}

export function getBackupReminderDays(storage = globalThis.localStorage) {
  try {
    const n = parseInt(storage.getItem(BACKUP_DAYS_KEY), 10);
    return Number.isFinite(n) && n >= 1 && n <= 365 ? n : DEFAULT_BACKUP_DAYS;
  } catch { return DEFAULT_BACKUP_DAYS; }
}

export function setBackupReminderDays(days, storage = globalThis.localStorage) {
  const n = Math.min(365, Math.max(1, Math.floor(Number(days)) || DEFAULT_BACKUP_DAYS));
  try { storage.setItem(BACKUP_DAYS_KEY, String(n)); } catch {}
  return n;
}

/** Reminder when the last backup (ms epoch, null = never) is older than `everyDays`. */
export function computeBackupAlert({ lastBackupTs = null, everyDays = DEFAULT_BACKUP_DAYS, now = new Date() } = {}) {
  const ts = Number(lastBackupTs);
  const never = !Number.isFinite(ts) || ts <= 0;
  const age = never ? Infinity : Math.floor((now.getTime() - ts) / DAY_MS);
  if (age < everyDays) return [];
  return [{
    id: `backup-${never ? 'never' : ymd(new Date(ts))}`,
    kind: 'backup',
    href: '/settings',
    type: 'warning',
    title: never ? 'No backup yet' : `Backup is ${age} days old`,
    body: `Export a full backup (JSON) — reminder interval is ${everyDays} day(s).`
  }];
}

export function computeAlerts({ budgets, transactions, bills, recurring, cards, lastBackupTs, backupEveryDays, now = new Date() } = {}) {
  const all = [
    ...computeBillAlerts({ bills, now }),
    ...computeRecurringAlerts({ recurring, now }),
    ...computeCardAlerts({ cards, now }),
    ...computeBudgetAlerts({ budgets, transactions, now }),
    ...computeBackupAlert({ lastBackupTs, everyDays: backupEveryDays, now })
  ];
  const ids = new Set();
  return all.filter(a => (ids.has(a.id) ? false : (ids.add(a.id), true)));
}

// ─── dismiss / snooze state, scoped by uid ───
export const alertStateKey = (uid) => `vm_alert_state_${uid || 'anon'}`;

export function loadAlertState(uid, storage = globalThis.localStorage) {
  try {
    const s = JSON.parse(storage.getItem(alertStateKey(uid)) || '{}');
    return { dismissed: s.dismissed && typeof s.dismissed === 'object' ? s.dismissed : {}, snoozed: s.snoozed && typeof s.snoozed === 'object' ? s.snoozed : {} };
  } catch { return { dismissed: {}, snoozed: {} }; }
}

export function saveAlertState(uid, state, storage = globalThis.localStorage) {
  try { storage.setItem(alertStateKey(uid), JSON.stringify(state)); } catch {}
}

export function dismissAlert(state, id) {
  return { ...state, dismissed: { ...state.dismissed, [id]: true } };
}

export function snoozeAlert(state, id, days = 1, now = Date.now()) {
  return { ...state, snoozed: { ...state.snoozed, [id]: now + days * DAY_MS } };
}

export function filterVisible(alerts, state, now = Date.now()) {
  return alerts.filter(a => !state.dismissed[a.id] && !(state.snoozed[a.id] > now));
}

// ── Budget threshold announcements ─────────────────────────────────────
// Each crossing (80%, 100%) is announced once per category per month.
export const BUDGET_ANNOUNCED_KEY = 'vm_budget_alerts_announced';

/** Budget alerts not announced yet, plus the id list to store afterwards. */
export function budgetAnnouncements({ budgets, transactions, now = new Date(), announced = [] } = {}) {
  const month = monthKey(now);
  // Keep only this month's ids so the stored list never grows.
  const kept = (announced || []).filter((id) => typeof id === 'string' && (id.endsWith(`-${month}-80`) || id.endsWith(`-${month}-100`)));
  const seen = new Set(kept);
  const fresh = computeBudgetAlerts({ budgets, transactions, now }).filter((a) => !seen.has(a.id));
  // Announcing 100% also covers 80% for that category.
  const ids = [...kept, ...fresh.flatMap((a) => (a.id.endsWith('-100') ? [a.id, a.id.replace(/-100$/, '-80')] : [a.id]))];
  return { fresh, announced: [...new Set(ids)] };
}
