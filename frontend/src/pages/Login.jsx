import React, { useState, useRef } from 'react';
import useTilt3D from '../motion/useTilt3D';
import './login.css';
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
import { Eye, EyeOff, ShieldCheck, Landmark, Cloud, TrendingUp } from 'lucide-react';
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
  const sceneRef = useRef(null);
  useTilt3D(sceneRef, { max: 12 });

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
    <div className="login" ref={sceneRef}>
      <div className="login-ambient" aria-hidden="true" />

      {/* Brand side: floating 3D vault card */}
      <aside className="login-brand" aria-hidden="true">
        <div className="login-logo"><Landmark size={22} /> Vault Manager</div>
        <div className="login-stage">
          <div className="login-card3d" data-tilt>
            <div className="login-card3d-bg"><span className="orb" /><span className="orb is-alt" /><span className="grid" /></div>
            <div className="z1 login-card3d-top"><span>Net worth</span><Landmark size={18} /></div>
            <div className="z3 login-card3d-value">Your money,<br />in one place</div>
            <div className="z2 login-card3d-bars"><i style={{ '--w': '72%' }} /><i style={{ '--w': '46%' }} /><i style={{ '--w': '88%' }} /></div>
            <div className="z1 login-card3d-foot"><span>Accounts · Budgets · Goals</span><ShieldCheck size={15} /></div>
          </div>
        </div>
        <ul className="login-points">
          <li><ShieldCheck size={16} /> Two-factor sign-in &amp; encrypted backups</li>
          <li><Cloud size={16} /> Syncs across your devices, works offline</li>
          <li><TrendingUp size={16} /> Budgets, goals and forecasts that update live</li>
        </ul>
      </aside>

      {/* Form side */}
      <main className="login-panel">
        <div className="login-form-card">
          <div className="login-head">
            <span className="login-mark"><Landmark size={24} /></span>
            <h1>{mfaResolver ? 'Two-step verification' : isSignUp ? 'Create your vault' : 'Welcome back'}</h1>
            <p>{mfaResolver ? 'Enter the 6-digit code from your authenticator app' : isSignUp ? 'Set up your personal finance vault' : 'Sign in to continue to your vault'}</p>
          </div>

          {mfaResolver ? (
            <form onSubmit={handleMfaResolve} className="login-form" key="mfa">
              <div className="login-field">
                <label htmlFor="login-mfa">Authenticator code</label>
                <input
                  id="login-mfa"
                  className="login-input login-input--code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  autoFocus
                  required
                />
              </div>
              {error && <div className="login-error" role="alert">{error}</div>}
              <button type="submit" className="login-submit" disabled={isLoading}>
                {isLoading ? <span className="login-spinner" aria-hidden="true" /> : null}
                {isLoading ? 'Verifying…' : 'Verify & unlock'}
              </button>
              <button type="button" className="login-link" onClick={() => { setMfaResolver(null); setMfaCode(''); setError(''); }}>
                ← Back to sign in
              </button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="login-form" key={isSignUp ? 'up' : 'in'}>
              <div className="login-field">
                <label htmlFor="login-email">Username or email</label>
                <input
                  id="login-email"
                  className="login-input"
                  type="text"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g., Isuru or you@email.com"
                  required
                />
              </div>

              <div className="login-field">
                <div className="login-field-row">
                  <label htmlFor="login-password">Password</label>
                  {!isSignUp && (
                    <button type="button" className="login-link login-link--small" onClick={handleForgotPassword}>
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="login-input-wrap">
                  <input
                    id="login-password"
                    className="login-input"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={isSignUp ? 'new-password' : 'current-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    required
                  />
                  <button
                    type="button"
                    className="login-eye"
                    onClick={() => setShowPassword(s => !s)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>

                {isSignUp && password.length > 0 && (
                  <div className="login-strength" aria-live="polite">
                    <div className="login-strength-bars">
                      {[1, 2, 3, 4].map(n => (
                        <span key={n} style={{ background: n <= strength.score ? strength.color : undefined }} />
                      ))}
                    </div>
                    <span style={{ color: strength.color }}>{strength.label}</span>
                  </div>
                )}
              </div>

              {error && <div className="login-error" role="alert">{error}</div>}

              <button type="submit" className="login-submit" disabled={isLoading}>
                {isLoading ? <span className="login-spinner" aria-hidden="true" /> : null}
                {isLoading ? 'Signing in…' : (isSignUp ? 'Create account' : 'Sign in')}
              </button>
            </form>
          )}

          {!mfaResolver && (
            <div className="login-switch">
              {isSignUp ? 'Already have an account?' : 'New here?'}{' '}
              <button type="button" className="login-link" onClick={() => { setIsSignUp(!isSignUp); setError(''); }}>
                {isSignUp ? 'Sign in' : 'Create an account'}
              </button>
            </div>
          )}

          <div className="login-foot">
            <span><ShieldCheck size={13} /> Secure sign-in · Cloud sync · Offline viewing</span>
            <Link to="/privacy">Privacy policy &amp; data rights</Link>
          </div>
        </div>
      </main>
    </div>
  );
}

export default Login;
