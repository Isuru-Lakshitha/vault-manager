import { auth } from '../utils/firebaseApp';
import { readDrafts, syncDrafts, removeDraft } from '../utils/offlineDrafts.js';
import { useState, useEffect } from 'react';
import { WifiOff } from 'lucide-react';
import { getSyncQueueState, createTransaction } from '../utils/api';

export default function OfflineBanner() {
  const [syncError, setSyncError] = useState('');
  const [drafts, setDrafts] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [offline, setOffline] = useState(!navigator.onLine);
  const [pendingCount, setPendingCount] = useState(() => getSyncQueueState().pendingCount);

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = () => {
      setOffline(false);
      try {
        import('react-hot-toast').then(({ default: toast }) => {
          toast.success('Back online — checking cloud sync. Retry any failed payments.', { icon: '☁️', duration: 3000 });
        });
      } catch {}
    };
    const onSyncState = (e) => {
      setPendingCount(e.detail?.pendingCount || 0);
    };

    const updateDrafts = () => { try { setDrafts(readDrafts(auth.currentUser?.uid)); } catch { setDrafts([]); } };
    updateDrafts();
    const unsubscribe = auth.onAuthStateChanged(updateDrafts);
    window.addEventListener('vm:drafts-changed', updateDrafts);
    window.addEventListener('storage', updateDrafts);
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    window.addEventListener('vm:sync-state', onSyncState);
    return () => {
      unsubscribe();
      window.removeEventListener('vm:drafts-changed', updateDrafts);
      window.removeEventListener('storage', updateDrafts);
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
      window.removeEventListener('vm:sync-state', onSyncState);
    };
  }, []);

  if (!offline && pendingCount === 0 && drafts.length === 0) return null;

  return (
    <div className={`offline-banner ${offline || pendingCount > 0 || drafts.length ? 'visible' : ''}`}>
      <WifiOff size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
      {pendingCount > 0 ? (
        <span>
          Sync pending · <strong>{pendingCount}</strong> {pendingCount === 1 ? 'collection' : 'collections'} with pending writes — waiting for cloud confirmation
        </span>
      ) : (
        <span>{offline ? "You're offline — balances may be cached. Quick Add can save local drafts. Other payments require a connection." : 'Local drafts are waiting for your review and sync.'}</span>
      )}
      {syncError && <span role="alert">{syncError}</span>}
      {drafts.length > 0 && <span> · {drafts.length} payment draft(s) on this device.
        <details><summary>Review saved drafts</summary>{drafts.map(draft => <span key={draft.id} style={{ display: 'block' }}>{draft.data.date} · {draft.data.type} · {draft.data.amount} · {draft.data.notes || draft.data.category}<button type="button" className="btn btn-secondary" disabled={syncing} onClick={() => removeDraft(auth.currentUser?.uid, draft.id)}>Discard draft</button></span>)}</details>
        {drafts.find(d => d.error)?.error && <span role="alert"> {drafts.find(d => d.error).error}</span>}
        <button className="btn btn-secondary" disabled={offline || syncing} onClick={async () => {
          const uid = auth.currentUser?.uid;
          setSyncing(true); setSyncError('');
          try { await syncDrafts(uid, (data, id) => {
            if (auth.currentUser?.uid !== uid) throw new Error('Account changed. Sign in again to sync these drafts.');
            return createTransaction(data, id, uid);
          }); } catch (error) { setSyncError(error.message || 'Could not sync drafts'); } finally { setSyncing(false); }
        }}>{syncing ? 'Syncing…' : 'Sync drafts'}</button>
      </span>}
    </div>
  );
}
