import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import Modal from './Modal';
import { auth } from '../utils/firebaseApp';
import { stashForCurrentUser, clearStash, importStashInto } from '../utils/guestAccount';

// After signing in to an existing account, offer to bring in the guest data
// that was saved on this phone when the guest chose "Sign in to an account".
export default function GuestImportPrompt() {
  const [stash, setStash] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user || user.isAnonymous) return;
    stashForCurrentUser().then(s => { if (s) setStash(s); }).catch(() => {});
  }, []);

  if (!stash) return null;
  const c = stash.counts || {};

  const doImport = async () => {
    setBusy(true);
    const id = toast.loading('Adding your guest data…');
    try {
      const { total } = await importStashInto((done, all) => toast.loading(`Adding ${done} of ${all} records…`, { id }));
      toast.success(`Guest data added to your account (${total} records).`, { id });
      window.dispatchEvent(new Event('vm:data-changed'));
      setStash(null);
    } catch (err) {
      toast.error(`${err?.message || 'Import stopped'}. Your guest copy is kept; try again to finish.`, { id });
    } finally { setBusy(false); }
  };

  const discard = async () => {
    if (!window.confirm('Delete the guest data saved on this phone? It cannot be recovered.')) return;
    try { await clearStash(); setStash(null); } catch { toast.error('Could not delete the guest copy. Try again.'); }
  };

  return (
    <Modal isOpen onClose={() => { if (!busy) setStash(null); }} title="Add your guest data?">
      <p style={{ marginTop: 0 }}>
        This phone has data from your guest profile: {c.accounts || 0} accounts, {c.transactions || 0} transactions,
        {' '}{c.budgets || 0} budgets and {c.goals || 0} goals. Add it to the account you just signed in to?
      </p>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
        It's added alongside what's already in this account. Nothing existing is changed or replaced.
      </p>
      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', flexWrap: 'wrap', marginTop: '1rem' }}>
        <button type="button" className="btn btn-secondary" onClick={discard} disabled={busy}>Delete guest data</button>
        <button type="button" className="btn btn-secondary" onClick={() => setStash(null)} disabled={busy}>Later</button>
        <button type="button" className="btn btn-primary" onClick={doImport} disabled={busy}>{busy ? 'Adding…' : 'Add to my account'}</button>
      </div>
    </Modal>
  );
}
