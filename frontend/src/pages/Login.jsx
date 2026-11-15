import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { auth } from '../utils/firebase';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  getMultiFactorResolver,
  TotpMultiFactorGenerator,
} from 'firebase/auth';
import { Eye, EyeOff, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { registerUserPresence } from '../utils/adminService';

function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [mfaResolver, setMfaResolver] = useState(null);
  const [mfaCode, setMfaCode] = useState('');

  const getPasswordStrength = (pwd) => {
    if (!pwd) return { score: 0, label: '', color: 'transparent' };
    let score = 0;
    if (pwd.length >= 6) score++;
    if (pwd.length >= 10) score++;
    if (/[A-Z]/.test(pwd) && /[0-9]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;
    const map = [
      { score: 1, label: 'Weak', color: '#f87171' },
      { score: 2, label: 'Fair', color: '#fbbf24' },
      { score: 3, label: 'Good', color: '#38bdf8' },
      { score: 4, label: 'Strong', color: '#4ade80' },
    ];
    return map[Math.max(0, score - 1)] || { score: 1, label: 'Too short', color: '#f87171' };
  };

  const strength = getPasswordStrength(password);

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      toast.error('Enter your email or username above first');
      return;
    }
    if (!email.includes('@')) {
      toast.error('Password reset requires a valid email address');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      toast.success('Password reset link sent! Check your inbox.');
    } catch (err) {
      toast.error(err.message || 'Could not send reset email');
    }
  };

  const handleMfaResolve = async (e) => {
    e.preventDefault();
    if (!mfaResolver) return;
    const cleaned = mfaCode.trim();
    if (!/^\d{6}$/.test(cleaned)) {
      setError('Enter the 6-digit code from your authenticator app.');
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      const factor = mfaResolver.hints?.find((h) => h.factorId === TotpMultiFactorGenerator.FACTOR_ID) || mfaResolver.hints?.[0];
      if (!factor) {
        setError('No TOTP authenticator factor found.');
        setIsLoading(false);
        return;
      }
      const assertion = TotpMultiFactorGenerator.assertionForSignIn(factor.uid, cleaned);
      const cred = await mfaResolver.resolveSignIn(assertion);
      try {
        localStorage.setItem('vm_onboarded', 'true');
        localStorage.setItem('vm_never_show_onboarding', 'true');
        if (cred?.user?.uid) {
          localStorage.setItem('vm_onboarded_' + cred.user.uid, 'true');
          localStorage.removeItem('vm_first_time_user_' + cred.user.uid);
        }
      } catch {}
      setMfaResolver(null);
      setMfaCode('');
      toast.success('2FA verified — welcome back to your vault.');
      onLogin(true);
    } catch (err) {
      setError(err?.message || 'Invalid 2FA verification code.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const trimmedEmail = email.trim();

      if (isSignUp) {
        if (!trimmedEmail.includes('@') || !trimmedEmail.includes('.')) {
          setError('Please enter a valid email address to receive your activation link.');
          setIsLoading(false);
          return;
        }
      }

      const formattedEmail = trimmedEmail.includes('@') ? trimmedEmail : `${trimmedEmail}@moneymanager.app`;

      if (isSignUp) {
        const userCredential = await createUserWithEmailAndPassword(auth, formattedEmail, password);
        try {
          localStorage.setItem('vm_first_time_user_' + userCredential.user.uid, 'true');
        } catch {}
        registerUserPresence(userCredential.user).catch(() => {});
        try {
          await sendEmailVerification(userCredential.user);
          toast.success("Verification link sent! Please check your inbox.");
        } catch (verr) {
          console.warn("Could not send verification email immediately", verr);
        }
      } else {
        const cred = await signInWithEmailAndPassword(auth, formattedEmail, password);
        try {
          localStorage.setItem('vm_onboarded', 'true');
          localStorage.setItem('vm_never_show_onboarding', 'true');
          if (cred?.user?.uid) {
            localStorage.setItem('vm_onboarded_' + cred.user.uid, 'true');
            localStorage.removeItem('vm_first_time_user_' + cred.user.uid);
          }
        } catch {}
        toast.success("Welcome back to your vault.");
      }
      onLogin(true);
    } catch (err) {
      console.error(err);
      const code = err?.code || '';
      if (code === 'auth/multi-factor-auth-required') {
        try {
          const resolver = getMultiFactorResolver(auth, err);
          setMfaResolver(resolver);
          setMfaCode('');
          setError('');
        } catch (mfaErr) {
          setError(mfaErr?.message || 'Multi-factor authentication required.');
        }
      } else if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
        setError('Invalid username/email or password. Please try again.');
      } else if (code === 'auth/email-already-in-use') {
        setError('This username or email is already registered.');
      } else if (code === 'auth/weak-password') {
        setError('Password must be at least 6 characters long.');
      } else {
        setError(err.message || 'Authentication failed');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem',
      background: 'linear-gradient(135deg, var(--bg-void), var(--bg-deep), var(--bg-surface))',
      fontFamily: "'Inter', sans-serif"
    }}>
      <div style={{
        background: 'var(--bg-surface)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid var(--border-glass)',
        borderRadius: '24px',
        padding: '40px 36px',
        width: '100%',
        maxWidth: '420px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
        color: 'var(--text-primary)',
        animation: 'fadeIn 0.6s ease-out'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{
            width: '72px',
            height: '72px',
            background: 'var(--gradient-primary)',
            borderRadius: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px',
            boxShadow: '0 10px 20px rgba(129, 140, 248, 0.25)',
            transform: 'none'
          }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-primary)', transform: 'none' }}>
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
            </svg>
          </div>
          <h2 style={{ fontSize: '26px', fontWeight: 'bold', margin: '0 0 6px 0', letterSpacing: '-0.5px', fontFamily: 'Inter, sans-serif' }}>
            {isSignUp ? 'Create Your Vault' : 'Welcome Back'}
          </h2>
          <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '14px' }}>
            {isSignUp ? 'Setup your encrypted personal finance vault' : 'Enter your credentials to access your vault'}
          </p>
        </div>

        {mfaResolver ? (
          <form onSubmit={handleMfaResolve} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: 600 }}>
                6-Digit Authenticator Code
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                autoFocus
                required
                style={{
                  width: '100%',
                  padding: '14px 16px',
                  background: 'var(--bg-deep)',
                  border: '1px solid var(--border-glass)',
                  borderRadius: '12px',
                  color: 'var(--text-primary)',
                  fontSize: '18px',
                  letterSpacing: '4px',
                  textAlign: 'center',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            {error && (
              <div style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#f87171',
                padding: '12px',
                borderRadius: '10px',
                fontSize: '13px',
                textAlign: 'center',
              }}>
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={isLoading}
              style={{
                width: '100%',
                padding: '15px',
                background: 'var(--gradient-primary)',
                color: '#fff',
                border: 'none',
                borderRadius: '12px',
                fontSize: '15px',
                fontWeight: 700,
                cursor: isLoading ? 'not-allowed' : 'pointer',
              }}
            >
              {isLoading ? 'Verifying 2FA...' : 'Verify & Unlock Vault'}
            </button>
            <button
              type="button"
              onClick={() => { setMfaResolver(null); setMfaCode(''); setError(''); }}
              style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '13px' }}
            >
              ← Back to Sign In
            </button>
          </form>
        ) : (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: 600 }}>Username or Email</label>
            <input 
              type="text" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                width: '100%',
                padding: '14px 16px',
                background: 'var(--bg-deep)',
                border: '1px solid var(--border-glass)',
                borderRadius: '12px',
                color: 'var(--text-primary)',
                fontSize: '15px',
                outline: 'none',
                transition: 'all 0.3s ease',
                boxSizing: 'border-box'
              }}
              placeholder="e.g., Isuru or you@email.com"
              required
            />
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <label style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-secondary)', fontWeight: 600 }}>Password</label>
              {!isSignUp && (
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  style={{ background: 'none', border: 'none', color: '#818cf8', fontSize: '12px', cursor: 'pointer', padding: 0 }}
                >
                  Forgot password?
                </button>
              )}
            </div>
            <div style={{ position: 'relative' }}>
              <input 
                type={showPassword ? 'text' : 'password'} 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  width: '100%',
                  padding: '14px 44px 14px 16px',
                  background: 'var(--bg-deep)',
                  border: '1px solid var(--border-glass)',
                  borderRadius: '12px',
                  color: 'var(--text-primary)',
                  fontSize: '15px',
                  outline: 'none',
                  transition: 'all 0.3s ease',
                  boxSizing: 'border-box'
                }}
                placeholder="Enter your password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(s => !s)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            {isSignUp && password.length > 0 && (
              <div style={{ marginTop: '8px' }}>
                <div style={{ display: 'flex', gap: '4px', height: '4px', marginBottom: '4px' }}>
                  {[1, 2, 3, 4].map(n => (
                    <div
                      key={n}
                      style={{
                        flex: 1,
                        borderRadius: '2px',
                        background: n <= strength.score ? strength.color : 'rgba(255,255,255,0.08)',
                        transition: 'background 0.25s',
                      }}
                    />
                  ))}
                </div>
                <div style={{ fontSize: '11px', color: strength.color, textAlign: 'right', fontWeight: 600 }}>
                  {strength.label}
                </div>
              </div>
            )}
          </div>

          {error && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#f87171',
              padding: '12px',
              borderRadius: '10px',
              fontSize: '13px',
              textAlign: 'center',
              animation: 'shake 0.5s'
            }}>
              {error}
            </div>
          )}

          <button 
            type="submit"
            disabled={isLoading}
            style={{
              width: '100%',
              padding: '15px',
              background: 'var(--gradient-primary)',
              color: '#fff',
              border: 'none',
              borderRadius: '12px',
              fontSize: '15px',
              fontWeight: 700,
              fontFamily: 'Inter, sans-serif',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              marginTop: '4px',
              transition: 'all 0.3s ease',
              boxShadow: isLoading ? 'none' : '0 10px 20px rgba(74, 222, 128, 0.2)',
            }}
          >
            {isLoading ? 'Authenticating...' : (isSignUp ? 'Create Vault Account' : 'Unlock Vault')}
          </button>
        </form>
        )}

        <div style={{ textAlign: 'center', marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button 
            onClick={() => { setIsSignUp(!isSignUp); setError(''); }}
            style={{
              background: 'none',
              border: 'none',
              color: '#a78bfa',
              cursor: 'pointer',
              fontSize: '13.5px',
              textDecoration: 'underline'
            }}
          >
            {isSignUp ? 'Already have an account? Sign In' : 'New here? Create an account'}
          </button>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', fontSize: '11px', color: 'var(--text-muted)' }}>
            <ShieldCheck size={13} color="#4ade80" /> Secure sign-in · Cloud sync · Offline viewing
          </div>
          <div>
            <Link to="/privacy" style={{ color: 'var(--text-muted)', fontSize: '11.5px', textDecoration: 'underline' }}>
              Privacy Policy &amp; Data Rights
            </Link>
          </div>
        </div>
      </div>

      <style>
        {`
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes shake {
            0%, 100% { transform: translateX(0); }
            25% { transform: translateX(-5px); }
            75% { transform: translateX(5px); }
          }
          input:focus {
            border-color: rgba(74, 222, 128, 0.4) !important;
            box-shadow: 0 0 0 4px rgba(74, 222, 128, 0.08);
          }
          button[type="submit"]:hover:not(:disabled) {
            transform: translateY(-2px);
            box-shadow: 0 15px 25px rgba(74, 222, 128, 0.3) !important;
          }
        `}
      </style>
    </div>
  );
}

export default Login;
