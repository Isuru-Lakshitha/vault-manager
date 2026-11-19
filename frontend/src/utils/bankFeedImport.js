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
