import toast from 'react-hot-toast';
import { scheduleUndoable } from '../utils/undoDelete';
import { translate, getLang } from '../i18n';

/*
 * Delete with an Undo toast.
 *
 *   deleteWithUndo({
 *     key: `txn:${id}`,
 *     label: 'Transaction deleted',
 *     hide: () => setRows(rows => rows.filter(r => r.id !== id)),
 *     restore: () => reload(),            // item was never deleted, just re-show it
 *     commit: () => deleteTransaction(id), // runs after the undo window
 *   });
 */
export function deleteWithUndo({ key, label, hide, restore, commit, onCommitted, delay = 5000 }) {
  const toastId = `undo-${key}`;
  hide?.();

  const entry = scheduleUndoable({
    key,
    delay,
    commit: async () => {
      toast.dismiss(toastId);
      await commit();
      onCommitted?.();
    },
    onUndo: () => {
      toast.dismiss(toastId);
      restore?.();
      toast.success(translate(getLang(), 'undo.restored'), { duration: 1600 });
    },
    onError: (err) => {
      restore?.();
      toast.error(err?.message || 'Could not delete — restored');
    },
  });

  toast(
    (t) => (
      <span className="undo-toast" role="status">
        <span className="undo-toast-label">{label}</span>
        <button
          type="button"
          className="undo-toast-btn"
          onClick={() => { entry.undo(); toast.dismiss(t.id); }}
        >
          {translate(getLang(), 'undo.undo')}
        </button>
        <span className="undo-toast-timer" style={{ animationDuration: `${delay}ms` }} aria-hidden="true" />
      </span>
    ),
    { id: toastId, duration: delay + 200, className: 'undo-toast-wrap' },
  );

  return entry;
}

/*
 * Common case: remove one item from a list state with Undo. On undo the item
 * is put back at its original position (no reload, no flicker).
 */
export function removeItemWithUndo({ key, label, setItems, id, commit, onCommitted, delay }) {
  const same = (x) => String(x?.id) === String(id);
  let removed = null;
  let index = -1;
  return deleteWithUndo({
    key,
    label,
    delay,
    commit,
    onCommitted,
    hide: () => setItems((prev) => {
      const i = prev.findIndex(same);
      if (i !== -1) { index = i; removed = prev[i]; }
      return prev.filter((x) => !same(x));
    }),
    restore: () => setItems((prev) => {
      if (!removed || prev.some(same)) return prev;
      const next = [...prev];
      next.splice(Math.min(Math.max(index, 0), next.length), 0, removed);
      return next;
    }),
  });
}

export const itemLabel = (item, fallback) => {
  const name = item?.name || item?.item_name || item?.category || item?.title;
  return name ? `“${name}” deleted` : fallback;
};
