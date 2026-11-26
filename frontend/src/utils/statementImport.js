// Pure helpers for importing bank statements (CSV / QIF). Kept separate from
// the React component so they can be unit-tested.
import { roundMoney } from './money.js';

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

const valid = (y, m, d) => {
  if (!(y >= 1900 && y <= 2100 && m >= 1 && m <= 12 && d >= 1)) return false;
  return d <= new Date(y, m, 0).getDate();
};
const ymd = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/**
 * Parse a statement date to 'YYYY-MM-DD', or '' if it can't be read.
 * Numeric dates are read day-first (D/M/Y, as Sri Lankan and most non-US
 * banks write them) unless `order` is 'MDY'. If the first part is over 12
 * the date is unambiguous and read that way whatever the order.
 * Also handles YYYY-MM-DD, YYYYMMDD and "5 Mar 2026" / "Mar 5, 2026".
 */
export function parseStatementDate(raw, order = 'DMY') {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
  if (m) return valid(+m[1], +m[2], +m[3]) ? ymd(+m[1], +m[2], +m[3]) : '';
  m = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
  if (m) return valid(+m[1], +m[2], +m[3]) ? ymd(+m[1], +m[2], +m[3]) : '';
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})\b/.exec(s);
  if (m) {
    let [a, b] = [+m[1], +m[2]];
    let y = +m[3]; if (m[3].length === 2) y += 2000;
    let day = order === 'MDY' ? b : a;
    let month = order === 'MDY' ? a : b;
    if (month > 12 && day <= 12) [day, month] = [month, day];
    return valid(y, month, day) ? ymd(y, month, day) : '';
  }
  // Month names: "5 Mar 2026", "05-Mar-26", "Mar 5, 2026"
  m = /^(\d{1,2})[\s-]+([A-Za-z]{3})[A-Za-z]*[\s-,]+(\d{2}|\d{4})\b/.exec(s);
  if (m && MONTHS[m[2].toLowerCase()]) {
    let y = +m[3]; if (m[3].length === 2) y += 2000;
    const mo = MONTHS[m[2].toLowerCase()];
    return valid(y, mo, +m[1]) ? ymd(y, mo, +m[1]) : '';
  }
  m = /^([A-Za-z]{3})[A-Za-z]*\s+(\d{1,2}),?\s+(\d{4})\b/.exec(s);
  if (m && MONTHS[m[1].toLowerCase()]) {
    const mo = MONTHS[m[1].toLowerCase()];
    return valid(+m[3], mo, +m[2]) ? ymd(+m[3], mo, +m[2]) : '';
  }
  return '';
}

/** Parse "1,234.50", "(1,234.50)", "-1234.5 LKR", "Rs. 99" → signed number (NaN if none). */
export function parseStatementAmount(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return NaN;
  const negative = /^\(.*\)$/.test(s) || /-\s*[\d.,]/.test(s) || /[\d.,]\s*-$/.test(s) || /\bdr\b/i.test(s);
  // Take the first number, so a prefix like "Rs." can't add a stray dot.
  const match = /\d[\d,]*(?:\.\d+)?|\.\d+/.exec(s);
  if (!match) return NaN;
  const n = parseFloat(match[0].replace(/,/g, ''));
  return Number.isFinite(n) ? roundMoney(negative ? -n : n) : NaN;
}

/**
 * Turn mapped CSV rows into transactions. With no type column, the amount's
 * sign decides: negative = Expense, positive = Income when the file has any
 * negative amounts (a signed statement), otherwise `defaultType`.
 * Rows with an unreadable date are reported in `skipped` (never imported
 * with today's date by mistake).
 */
export function rowsToTransactions(rows, mapping, { defaultType = 'Expense', accountId = '', dateOrder = 'DMY' } = {}) {
  const col = (row, k) => (mapping[k] >= 0 ? String(row[mapping[k]] ?? '') : '');
  const hasType = mapping.type >= 0;
  const signed = !hasType && rows.some((r) => parseStatementAmount(col(r, 'amount')) < 0);
  const out = [];
  const skipped = [];
  rows.forEach((row, i) => {
    const amountSigned = parseStatementAmount(col(row, 'amount'));
    if (!Number.isFinite(amountSigned) || amountSigned === 0) return;
    const date = parseStatementDate(col(row, 'date'), dateOrder);
    if (!date) { skipped.push(i + 1); return; }
    const desc = (col(row, 'description') || 'Imported').trim();
    let type;
    if (hasType) type = /credit|\bcr\b|income|deposit/i.test(col(row, 'type')) ? 'Income' : 'Expense';
    else if (signed) type = amountSigned < 0 ? 'Expense' : 'Income';
    else type = defaultType;
    out.push({
      date, category: desc.substring(0, 30), amount: Math.abs(amountSigned), type,
      from_account_id: type === 'Expense' ? accountId : '',
      to_account_id: type === 'Income' ? accountId : '',
      notes: desc,
    });
    out[out.length - 1].import_key = importKey(out[out.length - 1]);
  });
  return { transactions: out, skipped };
}

/** Key used to spot a row that is already in the ledger (re-importing the same file). */
export const importKey = (tx) => `${tx.date}|${roundMoney(Number(tx.amount) || 0).toFixed(2)}|${tx.type}|${String(tx.notes || '').trim().toLowerCase()}`;

/**
 * Drop transactions already in `existing` (same date, amount, type and note).
 * Identical rows inside one file are kept: two same-day coffees are real.
 */
export function withoutDuplicates(transactions, existing = []) {
  // Imported rows carry the key of the file row they came from (import_key),
  // so a rule that later rewrites the note or type can't hide a duplicate.
  // Reversed rows don't count: re-importing them is allowed.
  const seen = new Set();
  for (const t of existing) {
    if (!t || t.reversed_at || t.reversal_of) continue;
    seen.add(t.import_key || importKey(t));
  }
  const fresh = transactions.filter((tx) => !seen.has(tx.import_key || importKey(tx)));
  return { fresh, duplicates: transactions.length - fresh.length };
}
