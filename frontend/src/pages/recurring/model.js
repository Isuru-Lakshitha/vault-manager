/*
 * Recurring reminders: constants and pure helpers (no React, no I/O).
 * Shared by the Recurring page and its sub-components.
 */
import { formatCurrency } from '../../utils/format.js';

export const FREQUENCIES = ['Monthly', 'Weekly', 'Yearly'];
export const TYPES = ['Expense', 'Loan Payment', 'Income', 'Transfer'];
export const EXPENSE_CATS = ['Utilities', 'Phone/Internet', 'Gold Loan', 'Loan EMI', 'Rent/Housing', 'Food', 'Transport', 'Insurance', 'Subscriptions', 'Groceries', 'Education', 'Entertainment', 'Health', 'Shopping', 'Other'];
export const INCOME_CATS = ['Salary', 'Freelance', 'Business', 'Dividends', 'Rental Income', 'Other Income'];

export const QUICK_PRESETS = [
  { label: '⚡ Electricity', name: 'Electricity Bill', type: 'Expense', category: 'Utilities', schedule_mode: 'flexible', flexible_window: 'Anytime', is_variable: true, notes: 'Monthly Electricity (Variable)' },
  { label: '🌐 Internet / Wi-Fi', name: 'Internet / Fibre Bill', type: 'Expense', category: 'Phone/Internet', schedule_mode: 'flexible', flexible_window: 'Anytime', is_variable: true, notes: 'Monthly Internet / Data (Variable)' },
  { label: '💧 Water Bill', name: 'Water Bill', type: 'Expense', category: 'Utilities', schedule_mode: 'flexible', flexible_window: 'Anytime', is_variable: true, notes: 'Monthly Water Bill (Variable)' },
  { label: '📱 Mobile Package', name: 'Mobile Postpaid / Reload', type: 'Expense', category: 'Phone/Internet', schedule_mode: 'flexible', flexible_window: 'Anytime', is_variable: true, notes: 'Monthly Mobile Package' },
  { label: '🪙 Gold Loan', name: 'Gold Loan Monthly Interest', type: 'Loan Payment', category: 'Gold Loan', schedule_mode: 'flexible', flexible_window: 'Anytime', is_variable: true, notes: 'Monthly Gold Loan Interest / Part-Payment' },
  { label: '🏠 Monthly Rent', name: 'Monthly Rent', type: 'Expense', category: 'Rent/Housing', schedule_mode: 'fixed', day_of_month: 1, is_variable: false, notes: 'Fixed Monthly Rent' },
  { label: '💰 Monthly Salary', name: 'Monthly Salary', type: 'Income', category: 'Salary', schedule_mode: 'fixed', day_of_month: 25, is_variable: false, notes: 'Primary Monthly Income' },
];

export const freqLabel = (f) => f === 'Weekly' ? '/ wk' : f === 'Yearly' ? '/ yr' : '/ mo';

export const getRuleEffectiveAmount = (rule) => {
  const direct = parseFloat(rule.amount) || parseFloat(rule.avg_amount) || 0;
  if (direct > 0) return direct;
  if (rule.is_variable && Array.isArray(rule.payment_history) && rule.payment_history.length > 0) {
    const recent3 = rule.payment_history.slice(-3);
    const avg = recent3.reduce((s, h) => s + (parseFloat(h.amount) || 0), 0) / recent3.length;
    if (avg > 0) return Math.round(avg);
  }
  return 0;
};

export const freqMonthly = (rule) => {
  const amt = getRuleEffectiveAmount(rule);
  if (rule.frequency === 'Weekly') return amt * 4.33;
  if (rule.frequency === 'Yearly') return amt / 12;
  return amt;
};

export const getRuleUrgency = (rule, currentMonth) => {
  const isPaid = rule.last_applied_month === currentMonth;
  if (isPaid) {
    return {
      level: 'paid',
      rank: 50,
      label: rule.last_paid_marked_only
        ? '☑️ MARKED PAID · THIS MONTH'
        : `✅ ${rule.type === 'Income' ? 'RECEIVED' : 'PAID'} THIS MONTH${rule.last_paid_amount ? ` · ${formatCurrency(rule.last_paid_amount)}` : ''}`,
      subLabel: rule.last_paid_date ? `Settled on ${rule.last_paid_date}` : 'Settled for current cycle',
      color: '#10b981',
      bg: 'rgba(16, 185, 129, 0.14)',
      border: 'rgba(16, 185, 129, 0.42)',
      cardBg: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(16, 185, 129, 0.015) 100%)',
      cardBorder: 'rgba(16, 185, 129, 0.34)',
      accentColor: '#10b981',
    };
  }

  const isFlexible = (rule.schedule_mode || (rule.day_of_month ? 'fixed' : 'flexible')) === 'flexible';
  const now = new Date();
  const todayDom = now.getDate();
  // A rule on day 29-31 falls on the month's last day in shorter months.
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dom = Math.min(parseInt(rule.day_of_month, 10) || 1, daysInMonth);

  if (!isFlexible && rule.day_of_month) {
    const diff = dom - todayDom;
    if (diff < 0) {
      return {
        level: 'overdue',
        rank: 1,
        daysDiff: diff,
        label: `🚨 OVERDUE · Day ${dom} (${Math.abs(diff)}d ago)`,
        subLabel: `Was scheduled for Day ${dom} of this month`,
        color: '#f87171',
        bg: 'rgba(239, 68, 68, 0.16)',
        border: 'rgba(239, 68, 68, 0.48)',
        cardBg: 'linear-gradient(135deg, rgba(239, 68, 68, 0.08) 0%, rgba(245, 158, 11, 0.02) 100%)',
        cardBorder: 'rgba(239, 68, 68, 0.36)',
        accentColor: '#ef4444',
      };
    }
    if (diff === 0) {
      return {
        level: 'today',
        rank: 2,
        daysDiff: 0,
        label: `⚡ DUE TODAY · Day ${dom}`,
        subLabel: 'Scheduled for today',
        color: '#fbbf24',
        bg: 'rgba(245, 158, 11, 0.18)',
        border: 'rgba(245, 158, 11, 0.52)',
        cardBg: 'linear-gradient(135deg, rgba(245, 158, 11, 0.09) 0%, rgba(245, 158, 11, 0.02) 100%)',
        cardBorder: 'rgba(245, 158, 11, 0.38)',
        accentColor: '#f59e0b',
      };
    }
    if (diff <= 5) {
      return {
        level: 'soon',
        rank: 3,
        daysDiff: diff,
        label: `⏰ DUE IN ${diff}d · Day ${dom}`,
        subLabel: `Upcoming in ${diff} day${diff === 1 ? '' : 's'}`,
        color: '#f59e0b',
        bg: 'rgba(245, 158, 11, 0.14)',
        border: 'rgba(245, 158, 11, 0.38)',
        cardBg: 'linear-gradient(135deg, rgba(245, 158, 11, 0.06) 0%, rgba(255, 255, 255, 0.015) 100%)',
        cardBorder: 'rgba(245, 158, 11, 0.28)',
        accentColor: '#f59e0b',
      };
    }
    return {
      level: 'upcoming',
      rank: 4,
      daysDiff: diff,
      label: `⏳ UNPAID · Due Day ${dom} (in ${diff}d)`,
      subLabel: `Fixed monthly on Day ${dom}`,
      color: '#fbbf24',
      bg: 'rgba(245, 158, 11, 0.11)',
      border: 'rgba(245, 158, 11, 0.3)',
      cardBg: 'linear-gradient(135deg, rgba(245, 158, 11, 0.045) 0%, rgba(255, 255, 255, 0.015) 100%)',
      cardBorder: 'rgba(245, 158, 11, 0.22)',
      accentColor: '#f59e0b',
    };
  }

  return {
    level: 'flexible',
    rank: 5,
    label: `⏳ UNPAID · Due (${rule.flexible_window || 'Anytime This Month'})`,
    subLabel: `Flexible window · ${rule.flexible_window || 'Anytime'}`,
    color: '#fbbf24',
    bg: 'rgba(245, 158, 11, 0.12)',
    border: 'rgba(245, 158, 11, 0.32)',
    cardBg: 'linear-gradient(135deg, rgba(245, 158, 11, 0.05) 0%, rgba(255, 255, 255, 0.015) 100%)',
    cardBorder: 'rgba(245, 158, 11, 0.24)',
    accentColor: '#f59e0b',
  };
};

export const defaultForm = {
  name: '',
  type: 'Expense',
  amount: 0,
  min_amount: 0,
  max_amount: 0,
  category: 'Utilities',
  frequency: 'Monthly',
  schedule_mode: 'flexible',
  flexible_window: 'Anytime',
  day_of_month: 1,
  is_variable: true,
  start_next_month: true,
  loan_id: '',
  notes: '',
  from_account_id: '',
  to_account_id: '',
  paused: false,
};
