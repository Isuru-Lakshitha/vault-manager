/* Detects roughly-monthly repeated transactions that have no recurring rule yet. */
const DAY = 86400000;
const MIN_GAP = 25;
const MAX_GAP = 35;
const TOLERANCE = 0.1;

const dayNumber = ymd => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd || ''));
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY : NaN;
};
const normalize = s => String(s || '').toLowerCase().replace(/[0-9]+/g, ' ').replace(/[^\p{L}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
export const recurringKey = tx => `${normalize(tx.category)}|${normalize(tx.notes)}`;
const within = (a, b) => b > 0 && Math.abs(a - b) <= b * TOLERANCE;

const coveredBy = (rules, type, key, amount) => rules.some(rule => {
  if (rule.type && rule.type !== type) return false;
  const ruleKeys = [`${normalize(rule.category)}|${normalize(rule.notes)}`, normalize(rule.name)];
  const matches = ruleKeys[0] === key || (ruleKeys[1] && key.split('|').some(part => part && part === ruleKeys[1]));
  return matches && (!rule.amount || within(amount, Number(rule.amount)) || rule.is_variable);
});

/**
 * @param {Array} transactions
 * @param {Array} rules existing recurring rules
 * @param {{today?: string, dismissed?: string[]}} options
 * @returns {Array<{key, type, category, notes, amount, day_of_month, count, lastDate, from_account_id, to_account_id}>}
 */
export function detectRecurring(transactions = [], rules = [], { today, dismissed = [] } = {}) {
  const groups = new Map();
  for (const tx of transactions) {
    if (!['Expense', 'Income'].includes(tx.type) || tx.reversed_at || tx.reversal_of || tx.is_transfer_fee) continue;
    const amount = Number(tx.amount);
    if (!(amount > 0) || Number.isNaN(dayNumber(tx.date))) continue;
    const key = recurringKey(tx);
    if (key === '|') continue;
    const id = `${tx.type}|${key}`;
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push({ ...tx, amount, day: dayNumber(tx.date) });
  }
  const todayNum = today ? dayNumber(today) : Math.floor(Date.now() / DAY);
  const found = [];
  for (const [id, rows] of groups) {
    if (dismissed.includes(id)) continue;
    rows.sort((a, b) => a.day - b.day);
    let best = [];
    for (let i = 0; i < rows.length; i++) {
      const chain = [rows[i]];
      for (let j = i + 1; j < rows.length; j++) {
        const last = chain[chain.length - 1];
        const gap = rows[j].day - last.day;
        if (gap < MIN_GAP) continue;
        if (gap > MAX_GAP) break;
        if (within(rows[j].amount, chain[0].amount)) chain.push(rows[j]);
      }
      if (chain.length > best.length) best = chain;
    }
    if (best.length < 3) continue;
    const last = best[best.length - 1];
    if (todayNum - last.day > 45) continue;
    const amount = Math.round((best.reduce((s, r) => s + r.amount, 0) / best.length) * 100) / 100;
    if (coveredBy(rules, last.type, id.slice(last.type.length + 1), amount)) continue;
    found.push({
      id, key: id, type: last.type, category: last.category || '', notes: last.notes || '', amount,
      day_of_month: Number(String(last.date).slice(8, 10)) || 1, count: best.length, lastDate: last.date,
      from_account_id: last.from_account_id ?? null, to_account_id: last.to_account_id ?? null,
    });
  }
  return found.sort((a, b) => b.count - a.count || b.amount - a.amount);
}
