/*
 * Deferred deletes with Undo.
 *
 * A delete is scheduled, not run: the UI hides the item immediately and the
 * real delete (`commit`) only runs once the undo window ends. Undo simply
 * cancels the timer — nothing was deleted, so nothing needs rebuilding
 * (balances, links and audit rows are untouched).
 *
 * If the page is closed during the window, pending deletes are flushed so
 * the user's intent is honoured.
 *
 * No React or toast code here, so it is unit-testable; see
 * components/undoToast.jsx for the UI.
 */
const pending = new Map();

export function scheduleUndoable({
  key,
  delay = 5000,
  commit,
  onUndo,
  onError,
  timers = { setTimeout: globalThis.setTimeout.bind(globalThis), clearTimeout: globalThis.clearTimeout.bind(globalThis) },
}) {
  // A second delete of the same item replaces the first (never runs twice).
  pending.get(key)?.cancelSilently();

  const entry = { key, state: 'pending' };

  entry.run = async () => {
    if (entry.state !== 'pending') return false;
    entry.state = 'committed';
    pending.delete(key);
    try {
      await commit();
      return true;
    } catch (err) {
      entry.state = 'failed';
      onError?.(err);
      return false;
    }
  };

  entry.undo = () => {
    if (entry.state !== 'pending') return false;
    entry.state = 'undone';
    timers.clearTimeout(entry.timer);
    pending.delete(key);
    onUndo?.();
    return true;
  };

  entry.flush = () => {
    timers.clearTimeout(entry.timer);
    return entry.run();
  };

  entry.cancelSilently = () => {
    if (entry.state !== 'pending') return;
    entry.state = 'replaced';
    timers.clearTimeout(entry.timer);
    pending.delete(key);
  };

  entry.timer = timers.setTimeout(entry.run, delay);
  pending.set(key, entry);
  return entry;
}

export const isPendingDelete = (key) => pending.has(key);

export const flushPendingDeletes = () =>
  Promise.all([...pending.values()].map((entry) => entry.flush()));

// Honour pending deletes if the tab is closed or the app is backgrounded for good.
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('pagehide', () => { flushPendingDeletes(); });
}
