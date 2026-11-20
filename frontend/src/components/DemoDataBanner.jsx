import { useState } from 'react';
import toast from 'react-hot-toast';
import { FlaskConical } from 'lucide-react';
import { removeDemoPortfolio } from '../utils/demoData';

/*
 * Shown on the Dashboard while demo records exist, so sample data is never
 * mistaken for the user's own and can be removed in one tap.
 */
export default function DemoDataBanner({ accounts = [], transactions = [] }) {
  const [busy, setBusy] = useState(false);
  const count = accounts.filter((a) => a?.is_demo === true).length + transactions.filter((t) => t?.is_demo === true).length;
  if (count === 0) return null;

  const remove = async () => {
    setBusy(true);
    const id = toast.loading('Removing demo data…');
    try {
      const { removed, kept } = await removeDemoPortfolio();
      if (kept.length) toast.error(`Removed ${removed}. Kept ${kept.length}: ${kept[0]}`, { id, duration: 8000 });
      else toast.success(`Demo data removed (${removed} records)`, { id });
    } catch (err) {
      toast.error(err?.message || 'Could not remove demo data', { id });
    } finally { setBusy(false); }
  };

  return (
    <div className="ui-banner ui-banner-info" role="status">
      <FlaskConical size={20} aria-hidden="true" style={{ color: 'var(--mm-accent, #818cf8)', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 180 }}>
        <strong>You're looking at demo data</strong>
        <p>Sample accounts and transactions are mixed in with yours. Remove them when you're done exploring.</p>
      </div>
      <div className="ui-banner-actions">
        <button type="button" className="btn btn-primary" onClick={remove} disabled={busy}>{busy ? 'Removing…' : 'Remove demo data'}</button>
      </div>
    </div>
  );
}
