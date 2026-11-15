import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Mail, CheckCircle2, RefreshCw, LogOut, Landmark, AlertCircle } from 'lucide-react';
import { sendEmailVerification } from 'firebase/auth';
import { auth } from '../utils/firebase';
import { haptic } from '../utils/format';
import toast from 'react-hot-toast';

export default function EmailVerification({ user, onVerified, onSignOut }) {
  const [checking, setChecking] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Cooldown countdown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown(c => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleCheckVerification = async () => {
    setChecking(true);
    try {
      if (auth.currentUser) {
        await auth.currentUser.reload();
        if (auth.currentUser.emailVerified) {
          toast.success('🎉 Email verified successfully! Welcome to your vault.');
          haptic();
          if (onVerified) onVerified();
          return;
        }
      }
      toast.error('Email not verified yet. Please click the link sent to your inbox.');
      haptic(50);
    } catch (err) {
      console.error(err);
      toast.error('Could not refresh verification status. Please try again.');
    } finally {
      setChecking(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0) return;
    setResending(true);
    try {
      if (auth.currentUser) {
        await sendEmailVerification(auth.currentUser);
        toast.success(`Verification link sent to ${auth.currentUser.email}`);
        setCooldown(60);
        haptic();
      }
    } catch (err) {
      console.error(err);
      const code = err?.code || '';
      if (code === 'auth/too-many-requests') {
        toast.error('Too many requests. Please wait a minute before trying again.');
        setCooldown(60);
      } else {
        toast.error(err.message || 'Failed to resend verification email.');
      }
    } finally {
      setResending(false);
    }
  };

  const email = user?.email || auth.currentUser?.email || 'your email';

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1.25rem',
      background: 'linear-gradient(135deg, var(--bg-void), var(--bg-deep), var(--bg-surface))',
      fontFamily: "'Inter', sans-serif"
    }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        style={{
          background: 'rgba(255, 255, 255, 0.04)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 24,
          padding: '2.5rem 2rem',
          width: '100%',
          maxWidth: 440,
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          color: 'var(--text-primary)',
          textAlign: 'center'
        }}
      >
        {/* Logo */}
        <div style={{
          width: 56,
          height: 56,
          borderRadius: 16,
          background: 'linear-gradient(135deg, #818cf8, #a78bfa)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 1.25rem',
          boxShadow: '0 0 24px rgba(129, 140, 248, 0.3)'
        }}>
          <Landmark size={28} color="#fff" />
        </div>

        {/* Email Icon with pulse */}
        <div style={{
          width: 72,
          height: 72,
          borderRadius: 24,
          background: 'rgba(74, 222, 128, 0.1)',
          border: '1px solid rgba(74, 222, 128, 0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 1.25rem',
          color: '#4ade80'
        }}>
          <Mail size={36} />
        </div>

        <h2 style={{
          margin: '0 0 0.5rem',
          fontSize: '1.4rem',
          fontWeight: 800,
          fontFamily: 'Inter, sans-serif',
          color: 'var(--text-primary)'
        }}>
          Verify Your Email
        </h2>

        <p style={{
          margin: '0 0 1.25rem',
          fontSize: '0.85rem',
          color: 'var(--text-secondary)',
          lineHeight: 1.5
        }}>
          We sent a verification link to:<br />
          <strong style={{ color: '#4ade80', wordBreak: 'break-all' }}>{email}</strong>
        </p>

        <div style={{
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          borderRadius: 12,
          padding: '0.75rem 1rem',
          fontSize: '0.78rem',
          color: '#aaa',
          marginBottom: '1.5rem',
          textAlign: 'left',
          lineHeight: 1.4
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#fbbf24', fontWeight: 600, marginBottom: 4 }}>
            <AlertCircle size={14} /> Action Required
          </div>
          Please open your inbox, click the verification link from Firebase, and return here to unlock your financial vault.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {/* Check Verification Button */}
          <button
            type="button"
            onClick={handleCheckVerification}
            disabled={checking}
            style={{
              width: '100%',
              padding: '0.85rem',
              borderRadius: 12,
              background: 'linear-gradient(135deg, #4ade80, #22c55e)',
              border: 'none',
              color: 'var(--bg-void)',
              fontFamily: 'Inter, sans-serif',
              fontWeight: 800,
              fontSize: '0.92rem',
              cursor: checking ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              boxShadow: '0 4px 20px rgba(74, 222, 128, 0.3)',
              transition: 'transform 0.15s ease'
            }}
          >
            <CheckCircle2 size={18} />
            {checking ? 'Checking Status...' : "I've Verified My Email"}
          </button>

          {/* Resend Link Button */}
          <button
            type="button"
            onClick={handleResend}
            disabled={resending || cooldown > 0}
            style={{
              width: '100%',
              padding: '0.75rem',
              borderRadius: 12,
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: cooldown > 0 ? '#666' : '#ddd',
              fontFamily: 'Inter, sans-serif',
              fontWeight: 600,
              fontSize: '0.82rem',
              cursor: resending || cooldown > 0 ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem'
            }}
          >
            <RefreshCw size={14} className={resending ? 'spin' : ''} />
            {cooldown > 0 ? `Resend link in ${cooldown}s` : resending ? 'Sending...' : 'Resend Verification Link'}
          </button>

          {/* Sign Out Button */}
          <button
            type="button"
            onClick={onSignOut}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#888',
              fontSize: '0.78rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.35rem',
              marginTop: '0.5rem',
              padding: '0.4rem',
              textDecoration: 'underline'
            }}
          >
            <LogOut size={13} /> Sign Out / Use Another Account
          </button>
        </div>
      </motion.div>
    </div>
  );
}
