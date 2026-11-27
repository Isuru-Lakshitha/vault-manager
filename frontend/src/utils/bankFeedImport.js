/*
 * Which parsed bank-feed rows may be written to the ledger.
 *
 * Rows parsed from a real statement file (OFX / QFX / QIF) are importable,
 * minus detected duplicates. Rows from the demo feed are sample data and
 * must never be written to a user's accounts.
 */
export const FEED_SOURCE = Object.freeze({ STATEMENT: 'statement', DEMO: 'demo' });

export function importableEntries(feed, source) {
  if (source !== FEED_SOURCE.STATEMENT || !Array.isArray(feed)) return [];
  return feed.filter(entry => entry && !entry.isDuplicate);
}

// Sample rows shown by the demo preview. Before Nov 2026 the demo could write
// these into real accounts, so they double as the fingerprint for cleanup.
export const DEMO_FEED = Object.freeze([
  { notes: 'Whole Foods Market', amount: 54.30, type: 'Expense', category: '🍔 Food', status: 'cleared' },
  { notes: 'Uber Technologies Inc', amount: 19.50, type: 'Expense', category: 'Transport', status: 'cleared' },
  { notes: 'Apple Store Digital Services', amount: 9.99, type: 'Expense', category: 'Bills', status: 'cleared' },
  { notes: 'Chevron Fuel Station #402', amount: 42.00, type: 'Expense', category: 'Transport', status: 'pending' },
  { notes: 'Client Consulting Retainer', amount: 1500.00, type: 'Income', category: 'Salary', status: 'cleared' },
].map(Object.freeze));

const norm = (s) => String(s || '').trim().toLowerCase();

/*
 * Transactions that were written by the old demo feed: same description,
 * amount and type as a sample row. All three must match, so a real
 * "Uber" or "Whole Foods" purchase is never picked up.
 */
export function findDemoFeedLeftovers(transactions) {
  if (!Array.isArray(transactions)) return [];
  return transactions.filter((t) => t && DEMO_FEED.some((d) => (
    norm(t.notes) === norm(d.notes)
    && Math.abs((parseFloat(t.amount) || 0) - d.amount) < 0.005
    && norm(t.type) === norm(d.type)
  )));
}

// 53-bit string hash (cyrb53). Two seeds together give ~106 bits, so two
// different bank rows practically never share an import id.
function cyrb53(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/*
 * A stable reference for each statement row: the bank's own transaction id
 * (OFX FITID) when it has one, otherwise date + amount + description plus a
 * counter, so two genuine identical purchases on one day stay separate.
 * The same file always gives the same references.
 */
export function bankRowRefs(rows) {
  const seen = new Map();
  return (rows || []).map((tx) => {
    if (tx?.fitId) return `fitid:${String(tx.fitId).trim().slice(0, 200)}`;
    const base = `${tx?.date || ''}|${Number(tx?.amount) || 0}|${norm(tx?.notes).slice(0, 200)}|${tx?.type || ''}`;
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    return `row:${base}|${n}`;
  });
}

/** Import id for createTransaction: the same row into the same account is saved once. */
export function bankImportRequestId(accountId, ref) {
  const key = `${accountId}|${ref}`;
  return `bank-${cyrb53(key, 1)}-${cyrb53(key, 2)}`;
}

/*
 * Is this statement row already in the ledger? Earlier imports carry their
 * bank_ref, so they match exactly. Entries typed in by hand have none, so
 * they are matched on amount plus the same date or the same description.
 */
export function isAlreadyImported(existingTxs, row, ref, accountId) {
  return (existingTxs || []).some((t) => {
    if (t?.bank_ref) return t.bank_ref === ref && String(t.from_account_id || t.to_account_id || '') === String(accountId || '');
    const sameAmount = Math.abs((parseFloat(t?.amount) || 0) - (parseFloat(row?.amount) || 0)) < 0.005;
    if (!sameAmount) return false;
    return t?.date === row?.date || norm(t?.notes) === norm(row?.notes);
  });
}
