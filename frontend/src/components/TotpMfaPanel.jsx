import React, { useState, useEffect } from 'react';
import { auth } from '../utils/firebase';
import {
  multiFactor,
  TotpMultiFactorGenerator,
  EmailAuthProvider,
  reauthenticateWithCredential,
  sendEmailVerification,
} from 'firebase/auth';
import { Shield, Key, Copy, Check, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

const TotpMfaPanel = () => {
  const user = auth.currentUser;
  const [enrolledFactors, setEnrolledFactors] = useState([]);
  const [enrolling, setEnrolling] = useState(false);
  const [totpSecret, setTotpSecret] = useState(null);
  const [qrUrl, setQrUrl] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [password, setPassword] = useState('');
  const [needsReauth, setNeedsReauth] = useState(false);
  const [copied, setCopied] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const refreshFactors = () => {
    try {
      if (!auth.currentUser) return;
      const mfUser = multiFactor(auth.currentUser);
      setEnrolledFactors(mfUser.enrolledFactors || []);
    } catch {
      setEnrolledFactors([]);
    }
  };

  useEffect(() => {
    refreshFactors();
  }, [user]);

  const startEnrollment = async () => {
    if (!auth.currentUser) return;
    setStatusMessage('');
    if (!auth.currentUser.emailVerified) {
      setStatusMessage('Verify your email address first before enabling two-factor authentication.');
      return;
    }
    setEnrolling(true);
    try {
      if (needsReauth && password && auth.currentUser.email) {
        const cred = EmailAuthProvider.credential(auth.currentUser.email, password);
        await reauthenticateWithCredential(auth.currentUser, cred);
        setNeedsReauth(false);
      }
      const mfSession = await multiFactor(auth.currentUser).getSession();
      const secret = await TotpMultiFactorGenerator.generateSecret(mfSession);
      const accountName = auth.currentUser.email || 'user@moneymanager.app';
      const url = secret.generateQrCodeUrl(accountName, 'VaultManager');
      setTotpSecret(secret);
      setQrUrl(url);
    } catch (err) {
      const code = err?.code || '';
      if (code === 'auth/requires-recent-login') {
        setNeedsReauth(true);
        toast('Enter your current password to confirm security setup', { icon: '🔐' });
      } else if (code === 'auth/operation-not-allowed' || code === 'auth/admin-restricted-operation') {
        setStatusMessage(
          'Two-factor TOTP must be enabled in Firebase Console → Authentication → Sign-in method → Multi-factor authentication (requires Identity Platform).'
        );
      } else {
        setStatusMessage(err?.message || 'Could not start 2FA enrollment');
      }
    } finally {
      setEnrolling(false);
    }
  };

  const confirmEnrollment = async (e) => {
    e.preventDefault();
    if (!totpSecret || !verifyCode.trim()) return;
    setEnrolling(true);
    try {
      const assertion = TotpMultiFactorGenerator.assertionForEnrollment(totpSecret, verifyCode.trim());
      await multiFactor(auth.currentUser).enroll(assertion, 'Authenticator App');
      toast.success('Two-factor authentication enabled!');
      setTotpSecret(null);
      setQrUrl('');
      setVerifyCode('');
      refreshFactors();
    } catch (err) {
      toast.error(err?.message || 'Invalid verification code');
    } finally {
      setEnrolling(false);
    }
  };

  const handleUnenroll = async (factor) => {
    try {
      await multiFactor(auth.currentUser).unenroll(factor);
      toast.success('Two-factor authentication removed');
      refreshFactors();
    } catch (err) {
      if (err?.code === 'auth/requires-recent-login') {
        setNeedsReauth(true);
        toast.error('Please re-enter your password below and try again');
      } else {
        toast.error(err?.message || 'Failed to remove 2FA factor');
      }
    }
  };

  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.02)',
        borderRadius: 12,
        border: '1px solid rgba(255,255,255,0.05)',
        padding: '1.1rem 1.5rem',
        marginBottom: '0.5rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              background: 'rgba(74,222,128,0.1)',
              border: '1px solid rgba(74,222,128,0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Key size={18} style={{ color: '#4ade80' }} />
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
              Two-Factor Authentication (TOTP)
            </div>
            <div style={{ fontSize: '0.78rem', color: '#666', fontFamily: 'Inter, sans-serif' }}>
              Protect sign-in with Google Authenticator, Authy, or 1Password
            </div>
          </div>
        </div>

        {enrolledFactors.length === 0 && !totpSecret && (
          <button
            type="button"
            onClick={startEnrollment}
            disabled={enrolling}
            style={{
              padding: '0.4rem 1rem',
              borderRadius: 8,
              border: '1px solid rgba(74,222,128,0.4)',
              background: 'rgba(74,222,128,0.12)',
              color: '#4ade80',
              cursor: enrolling ? 'wait' : 'pointer',
              fontSize: '0.84rem',
              fontWeight: 600,
            }}
          >
            {enrolling ? 'Preparing…' : 'Enable 2FA'}
          </button>
        )}
      </div>

      {needsReauth && (
        <div style={{ marginTop: '0.85rem', display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Confirm your account password"
            style={{
              flex: '1 1 200px',
              padding: '0.45rem 0.75rem',
              borderRadius: 8,
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.12)',
              color: 'var(--text-primary)',
              fontSize: '0.82rem',
            }}
          />
          <button
            type="button"
            onClick={startEnrollment}
            className="btn btn-primary"
            style={{ padding: '0.45rem 0.9rem', fontSize: '0.8rem' }}
          >
            Continue
          </button>
        </div>
      )}

      {statusMessage && (
        <div
          style={{
            marginTop: '0.75rem',
            padding: '0.65rem 0.85rem',
            borderRadius: 8,
            background: 'rgba(251,191,36,0.1)',
            border: '1px solid rgba(251,191,36,0.3)',
            color: '#fbbf24',
            fontSize: '0.78rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.5rem',
            flexWrap: 'wrap',
          }}
        >
          <span>{statusMessage}</span>
          {user && !user.emailVerified && (
            <button
              type="button"
              onClick={async () => {
                try {
                  await sendEmailVerification(user);
                  toast.success('Verification email sent!');
                } catch (e) {
                  toast.error(e?.message || 'Could not send email');
                }
              }}
              style={{
                padding: '0.3rem 0.65rem',
                borderRadius: 6,
                background: 'rgba(251,191,36,0.2)',
                border: '1px solid rgba(251,191,36,0.4)',
                color: '#fbbf24',
                fontSize: '0.74rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Resend Verification Email
            </button>
          )}
        </div>
      )}

      {totpSecret && (
        <form onSubmit={confirmEnrollment} style={{ marginTop: '0.9rem', padding: '0.9rem', borderRadius: 10, background: 'rgba(0,0,0,0.28)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
            Add this secret key to your authenticator app, then enter the 6-digit code:
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.65rem', flexWrap: 'wrap' }}>
            <code style={{ padding: '0.4rem 0.65rem', borderRadius: 6, background: 'rgba(255,255,255,0.06)', color: '#4ade80', fontSize: '0.82rem', wordBreak: 'break-all' }}>
              {totpSecret.secretKey}
            </code>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(totpSecret.secretKey);
                setCopied(true);
                setTimeout(() => setCopied(false), 1800);
              }}
              style={{ padding: '0.35rem 0.65rem', borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-primary)', fontSize: '0.75rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copied' : 'Copy Key'}
            </button>
            {qrUrl && (
              <a href={qrUrl} target="_blank" rel="noreferrer" style={{ fontSize: '0.75rem', color: '#38bdf8' }}>
                Open in Authenticator App
              </a>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={verifyCode}
              onChange={(e) => setVerifyCode(e.target.value)}
              placeholder="6-digit code"
              required
              style={{
                width: 140,
                padding: '0.45rem 0.7rem',
                borderRadius: 8,
                background: 'rgba(0,0,0,0.35)',
                border: '1px solid rgba(255,255,255,0.14)',
                color: 'var(--text-primary)',
                fontSize: '0.85rem',
                letterSpacing: '2px',
              }}
            />
            <button type="submit" disabled={enrolling} className="btn btn-primary" style={{ padding: '0.45rem 0.95rem', fontSize: '0.8rem' }}>
              Verify & Activate
            </button>
            <button
              type="button"
              onClick={() => { setTotpSecret(null); setQrUrl(''); setVerifyCode(''); }}
              className="btn btn-secondary"
              style={{ padding: '0.45rem 0.85rem', fontSize: '0.8rem' }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {enrolledFactors.length > 0 && (
        <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
          {enrolledFactors.map((f) => (
            <div
              key={f.uid}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.5rem 0.75rem',
                borderRadius: 8,
                background: 'rgba(74,222,128,0.08)',
                border: '1px solid rgba(74,222,128,0.25)',
                fontSize: '0.8rem',
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#4ade80', fontWeight: 600 }}>
                <Shield size={14} /> {f.displayName || 'Authenticator App'} · Active
              </span>
              <button
                type="button"
                onClick={() => handleUnenroll(f)}
                style={{
                  background: 'rgba(248,113,113,0.12)',
                  border: '1px solid rgba(248,113,113,0.3)',
                  color: '#f87171',
                  borderRadius: 6,
                  padding: '0.25rem 0.55rem',
                  fontSize: '0.74rem',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <Trash2 size={12} /> Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TotpMfaPanel;
