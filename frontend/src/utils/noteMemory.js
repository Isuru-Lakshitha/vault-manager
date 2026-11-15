import { todayYMD } from './dates.js';
/**
 * Note Memory Utility
 * Remembers, indexes, and surfaces frequently and recently used transaction notes
 * for autocomplete, suggestions, and fast search filtering.
 */

const STORAGE_KEY = 'vm_custom_notes';

/**
 * Extract and score remembered notes from all user transactions
 * plus custom pinned notes from localStorage.
 *
 * @param {Array} transactions - All transactions
 * @param {string} [typeFilter] - Optional: 'Expense', 'Income', 'Transfer'
 * @returns {Array<{ text: string, count: number, lastDate: string, category: string, type: string, lastAmount: number }>}
 */
export const getRememberedNotes = (transactions = [], typeFilter = null) => {
  const noteMap = new Map();

  // 1. Scan transactions
  (transactions || []).forEach(tx => {
    if (!tx || !tx.notes) return;
    const clean = String(tx.notes).trim();
    if (clean.length < 2) return;
    if (typeFilter && tx.type && tx.type !== typeFilter) return;

    const lower = clean.toLowerCase();
    const existing = noteMap.get(lower);

    if (existing) {
      existing.count += 1;
      if (tx.date && (!existing.lastDate || tx.date > existing.lastDate)) {
        existing.lastDate = tx.date;
        if (tx.category) existing.category = tx.category;
        if (tx.amount) existing.lastAmount = tx.amount;
        if (tx.type) existing.type = tx.type;
        if (tx.from_account_id) existing.from_account_id = tx.from_account_id;
        if (tx.to_account_id) existing.to_account_id = tx.to_account_id;
      }
      // Track category frequency for this note
      if (tx.category) {
        existing.catCounts[tx.category] = (existing.catCounts[tx.category] || 0) + 1;
      }
    } else {
      noteMap.set(lower, {
        text: clean,
        count: 1,
        lastDate: tx.date || '',
        category: tx.category || '',
        type: tx.type || 'Expense',
        lastAmount: tx.amount || 0,
        from_account_id: tx.from_account_id || '',
        to_account_id: tx.to_account_id || '',
        catCounts: tx.category ? { [tx.category]: 1 } : {},
      });
    }
  });

  // Resolve highest frequency category for each note
  noteMap.forEach(item => {
    let topCat = item.category;
    let topCount = 0;
    Object.entries(item.catCounts || {}).forEach(([cat, cnt]) => {
      if (cnt > topCount) {
        topCount = cnt;
        topCat = cat;
      }
    });
    item.category = topCat;
    delete item.catCounts;
  });

  // 2. Merge with custom pinned notes from localStorage
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const customList = JSON.parse(raw);
      if (Array.isArray(customList)) {
        customList.forEach(custom => {
          const text = typeof custom === 'string' ? custom.trim() : custom.text?.trim();
          if (!text || text.length < 2) return;
          const lower = text.toLowerCase();
          if (noteMap.has(lower)) {
            const cur = noteMap.get(lower);
            cur.isPinned = true;
            cur.count += 10; // Boost pinned notes
          } else {
            noteMap.set(lower, {
              text,
              count: 10,
              lastDate: todayYMD(),
              category: (typeof custom === 'object' && custom.category) || '',
              type: (typeof custom === 'object' && custom.type) || 'Expense',
              lastAmount: (typeof custom === 'object' && custom.amount) || 0,
              isPinned: true,
            });
          }
        });
      }
    }
  } catch {}

  // 3. Sort: pinned/highest count first, then by recency
  return Array.from(noteMap.values()).sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return (b.lastDate || '').localeCompare(a.lastDate || '');
  });
};

/**
 * Extract top frequent complete transaction templates (Amount + Category + Merchant + Account)
 * for 1-Tap Quick-Repeat chips.
 */
export const getFrequentTemplates = (transactions = [], limit = 6) => {
  const tplMap = new Map();

  (transactions || []).forEach(tx => {
    if (!tx || !tx.amount || tx.amount <= 0) return;
    if (tx.type !== 'Expense' && tx.type !== 'Income') return;
    const label = String(tx.notes || tx.category || '').trim();
    if (!label) return;
    const key = `${tx.type}::${(tx.category || '').toLowerCase()}::${label.toLowerCase()}`;
    const existing = tplMap.get(key);
    if (existing) {
      existing.count += 1;
      if (!existing.lastDate || (tx.date && tx.date >= existing.lastDate)) {
        existing.lastDate = tx.date;
        existing.amount = tx.amount;
        existing.category = tx.category || existing.category;
        existing.notes = tx.notes || existing.notes;
        existing.from_account_id = tx.from_account_id || existing.from_account_id;
        existing.to_account_id = tx.to_account_id || existing.to_account_id;
      }
    } else {
      tplMap.set(key, {
        key,
        label,
        type: tx.type || 'Expense',
        amount: tx.amount,
        category: tx.category || (tx.type === 'Income' ? 'Salary' : 'Food'),
        notes: tx.notes || '',
        from_account_id: tx.from_account_id || '',
        to_account_id: tx.to_account_id || '',
        count: 1,
        lastDate: tx.date || '',
      });
    }
  });

  return Array.from(tplMap.values())
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return (b.lastDate || '').localeCompare(a.lastDate || '');
    })
    .slice(0, limit);
};

/**
 * Filter remembered notes matching a query string
 *
 * @param {string} query
 * @param {Array} transactions
 * @param {number} [limit=10]
 * @returns {Array}
 */
export const searchRememberedNotes = (query = '', transactions = [], limit = 10) => {
  const all = getRememberedNotes(transactions);
  const q = String(query || '').trim().toLowerCase();
  if (!q) return all.slice(0, limit);

  return all
    .filter(n => n.text.toLowerCase().includes(q))
    .slice(0, limit);
};

/**
 * Pin or save a custom note into localStorage
 */
export const saveCustomNote = (text, category = '', type = 'Expense') => {
  if (!text || !text.trim()) return;
  const clean = text.trim();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    const exists = list.some(item => (typeof item === 'string' ? item : item.text).toLowerCase() === clean.toLowerCase());
    if (!exists) {
      list.push({ text: clean, category, type, addedAt: new Date().toISOString() });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    }
  } catch {}
};

/**
 * Delete a custom note from localStorage
 */
export const deleteCustomNote = (text) => {
  if (!text) return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const list = JSON.parse(raw);
    const updated = list.filter(item => (typeof item === 'string' ? item : item.text).toLowerCase() !== text.toLowerCase());
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {}
};
