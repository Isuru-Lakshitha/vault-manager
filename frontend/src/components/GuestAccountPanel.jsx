import { useState } from 'react';
import toast from 'react-hot-toast';
import { isGuest, upgradeGuest, stashGuestData, deleteGuestAndSignOut } from '../utils/guestAccount';

// Shown in Settings while using a guest profile: keep the data by turning the
// guest into an account, or carry it into an account that already exists.
export default function GuestAccountPanel() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [targetEmail, setTargetEmail] = useState('');
  if (!isGuest()) return null;

  const create = async (e) => {
    e.preventDefault();
    if (!email.includes('@')) return toast.error('Enter a valid email address');
    if (password.length < 8) return toast.error('Use a password of at least 8 characters');
    if (password !== confirmPw) return toast.error('The passwords do not match');
    setBusy(true);
    try {
      await upgradeGuest(email, password);
      toast.success('Account created. All your data is kept. Check your inbox to verify your email.');
      window.location.reload();
    } catch (err) {
      const code = err?.code || '';
      toast.error(code === 'auth/email-already-in-use' || code === 'auth/credential-already-in-use'
        ? 'That email already has an account. Use "Sign in to an account I already have" below.'
        : code === 'auth/weak-password' ? 'Choose a stronger password.'
          : (err?.message || 'Could not create the account'));
    } finally { setBusy(false); }
  };

  const moveToExisting = async () => {
    if (!targetEmail.includes('@')) return toast.error('Enter the email of the account you will sign in to');
    if (!window.confirm(`Your guest data will be saved on this phone for ${targetEmail.trim()} only (for 7 days), and the guest profile is deleted from the cloud. Then sign in to that account and choose to add it. Continue?`)) return;
    setBusy(true);
    const id = toast.loading('Saving your guest data on this phone…');
    try {
      const counts = await stashGuestData(targetEmail);
      toast.success(`Saved ${counts.accounts} accounts and ${counts.transactions} transactions. Now sign in as ${targetEmail.trim()}.`, { id });
      await deleteGuestAndSignOut();
    } catch (err) {
      toast.error(err?.message || 'Could not save the guest data', { id });
      setBusy(false);
    }
  };

  const field = { width: '100%', marginBottom: '0.6rem' };
  return (
    <section id="guest-account" className="quiet-section" style={{ padding: '1rem 1.1rem', marginBottom: '1rem', border: '1px solid rgba(96,165,250,0.3)', borderRadius: 12, background: 'rgba(96,165,250,0.06)' }}>
      <h2 style={{ fontSize: '1.05rem', margin: '0 0 0.35rem' }}>You're using a guest profile</h2>
      <p style={{ margin: '0 0 0.9rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
        Your data is saved, but only while you stay signed in on this device. Create an account to keep it for good and see it in the browser too.
      </p>
      <form onSubmit={create}>
        <input type="email" autoComplete="email" placeholder="Email" aria-label="Email" value={email} onChange={e => setEmail(e.target.value)} style={field} />
        <input type="password" autoComplete="new-password" placeholder="Password (8+ characters)" aria-label="Password" value={password} onChange={e => setPassword(e.target.value)} style={field} />
        <input type="password" autoComplete="new-password" placeholder="Confirm password" aria-label="Confirm password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} style={field} />
        <button type="submit" className="btn btn-primary" disabled={busy} style={{ width: '100%' }}>{busy ? 'Working…' : 'Create account and keep my data'}</button>
      </form>
      <div style={{ marginTop: '1rem', paddingTop: '0.9rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <p style={{ margin: '0 0 0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Already have an account? Your guest data can be added to it.</p>
        <input type="email" autoComplete="email" placeholder="Your account's email" aria-label="Email of your existing account" value={targetEmail} onChange={e => setTargetEmail(e.target.value)} style={field} />
        <button type="button" className="btn btn-secondary" onClick={moveToExisting} disabled={busy} style={{ width: '100%' }}>
          Sign in to an account I already have
        </button>
      </div>
    </section>
  );
}
