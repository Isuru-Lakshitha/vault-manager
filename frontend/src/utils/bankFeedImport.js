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
