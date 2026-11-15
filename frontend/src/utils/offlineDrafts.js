import { validateTransaction } from './transactionLedger.js';
const prefix = uid => `vm_payment_draft:${uid}:`;
const changed = () => window.dispatchEvent(new CustomEvent('vm:drafts-changed'));
export function readDrafts(uid) {
  if (!uid) return [];
  const legacyKey = `vm_payment_drafts:${uid}`;
  const legacy = localStorage.getItem(legacyKey);
  if (legacy) {
    const rows = JSON.parse(legacy);
    if (!Array.isArray(rows)) throw new Error('Saved payment drafts are unreadable');
    for (const row of rows) if (!localStorage.getItem(prefix(uid) + row.id)) localStorage.setItem(prefix(uid) + row.id, JSON.stringify(row));
    localStorage.removeItem(legacyKey);
  }
  const rows = [];
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index);
    if (key?.startsWith(prefix(uid))) {
      const value = localStorage.getItem(key);
      if (value) rows.push(JSON.parse(value));
    }
  }
  return rows.sort((a,b) => a.created_at.localeCompare(b.created_at));
}
export function removeDraft(uid, id) {
  if (!uid) throw new Error('Sign in before changing drafts');
  localStorage.removeItem(prefix(uid) + id); changed();
}
export function saveDraft(uid, data) {
  if (!uid) throw new Error('Sign in before saving a draft');
  validateTransaction(data);
  if (!['Income','Expense','Transfer'].includes(data.type)) throw new Error('Linked payments require a connection');
  if (readDrafts(uid).length >= 100) throw new Error('Sync or remove existing drafts before adding more');
  const draft = { id: crypto.randomUUID(), data, created_at: new Date().toISOString(), error: null };
  localStorage.setItem(prefix(uid) + draft.id, JSON.stringify(draft)); changed();
  return draft;
}
// Each draft has its own storage key, so another tab's additions cannot be overwritten.
export async function syncDrafts(uid, submit) {
  let completed = 0;
  for (const draft of readDrafts(uid)) {
    if (!localStorage.getItem(prefix(uid) + draft.id)) continue;
    try {
      await submit(draft.data, draft.id);
      removeDraft(uid, draft.id); completed++;
    } catch (error) {
      if (localStorage.getItem(prefix(uid) + draft.id)) {
        localStorage.setItem(prefix(uid) + draft.id, JSON.stringify({ ...draft, error: error.message || 'Sync failed' })); changed();
      }
      break;
    }
  }
  return { completed, remaining: readDrafts(uid) };
}
