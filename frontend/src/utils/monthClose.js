/*
 * Monthly close: a once-a-month review of the month that just ended.
 * Pure functions; amounts are expected in one (reporting) currency.
 */
const UNCATEGORISED = new Set(['', 'other', 'others', 'uncategorized', 'uncategorised', 'general', 'misc', 'miscellaneous']);

export const categoryKey = (cat) => String(cat || '')
  .replace(/^[\p{Emoji}\p{Emoji_Presentation}\p{Extended_Pictographic}️‍\s]+/gu, '')
  .trim()
  .toLowerCase();

export const isUncategorised = (tx) => UNCATEGORISED.has(categoryKey(tx?.category));

const pad = (n) => String(n).padStart(2, '0');

/** 'YYYY-MM' of the month before `date` (local time). */
export function previousMonth(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth() - 1, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function monthLabel(month, lang) {
  const [y, m] = String(month).split('-').map(Number);
  if (!y || !m) return String(month);
  const locale = lang === 'si' ? 'si-LK' : lang === 'ta' ? 'ta-LK' : undefined;
  return new Date(y, m - 1, 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' });
}

const cents = (v) => Math.round((Number.parseFloat(v) || 0) * 100);
const money = (c) => c / 100;

/*
 * Summary of one month. Transfers move money between your own accounts and
 * reversed/reversal rows cancel out, so neither counts as income or spending.
 * Reconciliation adjustments are listed separately rather than as spending.
 */
export function monthCloseReport({ transactions = [], budgets = [], month }) {
  const inMonth = (transactions || []).filter((t) => (
    t && String(t.date || '').startsWith(month) && !t.reversed_at && !t.reversal_of
  ));
  let income = 0;
  let expense = 0;
  let adjustments = 0;
  const byCategory = new Map();
  const uncategorised = [];
  for (const t of inMonth) {
    const c = cents(t.amount);
    if (t.reconciliation) { adjustments += t.type === 'Income' ? c : -c; continue; }
    if (t.type === 'Income') income += c;
    else if (t.type === 'Expense') {
      expense += c;
      const key = categoryKey(t.category) || 'uncategorised';
      const row = byCategory.get(key) || { category: t.category || 'Uncategorised', cents: 0 };
      row.cents += c;
      byCategory.set(key, row);
    } else continue;
    if (isUncategorised(t)) uncategorised.push(t);
  }
  const topCategories = [...byCategory.values()]
    .sort((a, b) => b.cents - a.cents)
    .slice(0, 5)
    .map((r) => ({ category: r.category, amount: money(r.cents), share: expense ? r.cents / expense : 0 }));

  const budgetResults = (budgets || [])
    .filter((b) => b && b.category && (!b.month || b.month === month))
    .map((b) => {
      const spent = byCategory.get(categoryKey(b.category))?.cents || 0;
      const limit = cents(b.amount);
      return { id: b.id, category: b.category, limit: money(limit), spent: money(spent), over: limit > 0 && spent > limit };
    })
    .sort((a, b) => Number(b.over) - Number(a.over) || b.spent - a.spent);

  return {
    month,
    count: inMonth.length,
    income: money(income),
    expense: money(expense),
    net: money(income - expense),
    savingsRate: income > 0 ? (income - expense) / income : null,
    adjustments: money(adjustments),
    topCategories,
    uncategorised,
    budgetResults,
    overBudget: budgetResults.filter((b) => b.over),
  };
}

/** Whether the closing prompt should be offered for `month`. */
export function shouldOfferClose({ month, closedMonths = {}, transactions = [] }) {
  if (!month || closedMonths?.[month]) return false;
  return (transactions || []).some((t) => String(t?.date || '').startsWith(month));
}
