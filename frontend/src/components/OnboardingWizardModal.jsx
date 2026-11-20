import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, ArrowLeft, Play, EyeOff } from 'lucide-react';
import Modal from './Modal';
import { createAccount } from '../utils/api';
import { loadDemoPortfolio } from '../utils/demoData';
import { SUPPORTED_CURRENCIES, haptic } from '../utils/format';
import toast from 'react-hot-toast';

export default function OnboardingWizardModal({ isOpen, onClose, onComplete }) {
  const [step, setStep] = useState(1);
  const [selectedCurrency, setSelectedCurrency] = useState(() => localStorage.getItem('vm_currency') || 'USD');
  const [loadingDemo, setLoadingDemo] = useState(false);

  // Manual account form if user prefers to create their own
  const [accountName, setAccountName] = useState('Main Checking');
  const [accountBalance, setAccountBalance] = useState('2500');
  const [accountType, setAccountType] = useState('Bank');

  // Guardrails
  const [dailyLimit, setDailyLimit] = useState('150');
  const [runwayTarget, setRunwayTarget] = useState('6');

  const handleNeverShowAgain = () => {
    try {
      localStorage.setItem('vm_onboarded', 'true');
      localStorage.setItem('vm_never_show_onboarding', 'true');
    } catch (e) {
      console.warn('Could not save to localStorage', e);
    }
    toast('Setup wizard dismissed. You can reopen it anytime from Settings.', { icon: 'ℹ️' });
    haptic();
    if (onComplete) onComplete();
    if (onClose) onClose();
  };

  const handleClose = () => {
    try {
      localStorage.setItem('vm_onboarded', 'true');
      localStorage.setItem('vm_never_show_onboarding', 'true');
    } catch (e) {
      console.warn('Could not save to localStorage', e);
    }
    if (onClose) onClose();
  };

  const handleFinishManual = async () => {
    try {
      localStorage.setItem('vm_currency', selectedCurrency);
      if (accountName && accountBalance) {
        await createAccount({
          name: accountName,
          type: accountType,
          balance: parseFloat(accountBalance) || 0,
          currency: selectedCurrency
        });
      }
      if (dailyLimit && parseFloat(dailyLimit) > 0) {
        localStorage.setItem('vm_daily_limit', dailyLimit);
      }
      localStorage.setItem('vm_onboarded', 'true');
      localStorage.setItem('vm_never_show_onboarding', 'true');
      toast.success('🎉 Welcome to Vault Manager!');
      haptic();
      if (onComplete) onComplete();
      onClose();
    } catch {
      toast.error('Failed to complete setup');
    }
  };

  const handleLoadDemo = async () => {
    try {
      setLoadingDemo(true);
      localStorage.setItem('vm_currency', selectedCurrency);
      await loadDemoPortfolio();
      localStorage.setItem('vm_onboarded', 'true');
      localStorage.setItem('vm_never_show_onboarding', 'true');
      toast.success('🚀 Demo portfolio loaded successfully!');
      haptic();
      if (onComplete) onComplete();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('Failed to load demo portfolio');
    } finally {
      setLoadingDemo(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="✨ Welcome to Vault Manager" maxWidth="620px">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        
        {/* Step indicator pills */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          {[
            { s: 1, label: 'Currency' },
            { s: 2, label: 'Accounts' },
            { s: 3, label: 'Guardrails' }
          ].map(it => (
            <div
              key={it.s}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.3rem 0.75rem',
                borderRadius: 20,
                background: step === it.s ? 'rgba(74,222,128,0.18)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${step === it.s ? '#4ade80' : 'rgba(255,255,255,0.08)'}`,
                color: step === it.s ? '#4ade80' : '#777',
                fontSize: '0.75rem',
                fontWeight: 600 }}
            >
              <span>{it.s}.</span> {it.label}
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {/* STEP 1: Select Currency */}
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
            >
              <div style={{ textAlign: 'center', marginBottom: '0.5rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-primary)' }}>
                  Choose Your Global Base Currency
                </h3>
                <p style={{ margin: '4px 0 0', color: 'var(--mm-text-3)', fontSize: '0.8rem' }}>
                  All portfolio valuations, net worth calculations, and digests will be converted to this currency.
                </p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '0.5rem', maxHeight: 240, overflowY: 'auto' }}>
                {SUPPORTED_CURRENCIES.map(c => (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => { setSelectedCurrency(c.code); haptic(5); }}
                    style={{
                      padding: '0.65rem 0.75rem',
                      borderRadius: 10,
                      background: selectedCurrency === c.code ? 'rgba(74,222,128,0.15)' : 'rgba(255,255,255,0.02)',
                      border: `1.5px solid ${selectedCurrency === c.code ? '#4ade80' : 'rgba(255,255,255,0.07)'}`,
                      color: selectedCurrency === c.code ? '#4ade80' : '#ddd',
                      textAlign: 'left',
                      cursor: 'pointer',
                      transition: 'all 0.15s'
                    }}
                  >
                    <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>
                      {c.symbol} {c.code}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--mm-text-3)', marginTop: 2 }}>{c.label}</div>
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem' }}>
                <button
                  type="button"
                  onClick={handleNeverShowAgain}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    padding: '0.6rem 0.95rem',
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 10,
                    color: 'var(--text-secondary)',
                    fontSize: '0.78rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#f87171'; e.currentTarget.style.borderColor = 'rgba(248,113,113,0.3)'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = '#9191ab'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
                  title="Dismiss setup and never show this again"
                >
                  <EyeOff size={15} /> Never Show Again
                </button>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.65rem 1.25rem',
                    borderRadius: 10,
                    background: 'linear-gradient(135deg, #4ade80, #22c55e)',
                    border: 'none',
                    color: 'var(--bg-void)',
                    fontWeight: 700,
                    cursor: 'pointer' }}
                >
                  Next Step <ArrowRight size={16} />
                </button>
              </div>
            </motion.div>
          )}

          {/* STEP 2: Choose Starter Account or Load Demo */}
          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
            >
              <div style={{ textAlign: 'center', marginBottom: '0.5rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-primary)' }}>
                  Fund Your Portfolio or Test Drive Sandbox
                </h3>
                <p style={{ margin: '4px 0 0', color: 'var(--mm-text-3)', fontSize: '0.8rem' }}>
                  Start with a clean personal account, or populate a realistic demo dataset to test every SaaS feature.
                </p>
              </div>

              {/* Demo Sandbox Option Card */}
              <div
                style={{
                  padding: '1rem 1.25rem',
                  borderRadius: 12,
                  background: 'linear-gradient(135deg, rgba(129,140,248,0.12), rgba(167,139,250,0.06))',
                  border: '1px solid rgba(129,140,248,0.3)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '1rem'
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#818cf8', fontWeight: 700, fontSize: '0.9rem' }}>
                    <Play size={16} /> Try Instant Demo Sandbox
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--mm-text-3)', marginTop: 2 }}>
                    Pre-populates 4 accounts, 15 categorized transactions, loan schedules & bills. Clearable anytime.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleLoadDemo}
                  disabled={loadingDemo}
                  style={{
                    padding: '0.55rem 1rem',
                    borderRadius: 8,
                    background: '#818cf8',
                    border: 'none',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {loadingDemo ? 'Loading...' : '⚡ Load Demo'}
                </button>
              </div>

              <div style={{ textAlign: 'center', fontSize: '0.72rem', color: 'var(--mm-text-3)', textTransform: 'uppercase', letterSpacing: 1 }}>
                — OR CREATE YOUR FIRST ACCOUNT —
              </div>

              {/* Manual Account Setup Inputs */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--mm-text-3)', marginBottom: 2 }}>Account Name</label>
                  <input
                    type="text"
                    value={accountName}
                    onChange={e => setAccountName(e.target.value)}
                    style={{ width: '100%', padding: '0.55rem', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--mm-text-3)', marginBottom: 2 }}>Account Type</label>
                    <select
                      value={accountType}
                      onChange={e => setAccountType(e.target.value)}
                      style={{ width: '100%', padding: '0.55rem', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
                    >
                      <option value="Bank">Bank Account</option>
                      <option value="Cash">Cash Wallet</option>
                      <option value="Mobile Wallet">Mobile Wallet</option>
                      <option value="Credit Card">Credit Card</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--mm-text-3)', marginBottom: 2 }}>Starting Balance ({selectedCurrency})</label>
                    <input
                      type="number"
                      value={accountBalance}
                      onChange={e => setAccountBalance(e.target.value)}
                      style={{ width: '100%', padding: '0.55rem', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--mm-success)', fontWeight: 700 }}
                    />
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.65rem 1rem', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: 'var(--mm-text-3)', cursor: 'pointer' }}
                >
                  <ArrowLeft size={16} /> Back
                </button>
                <button
                  type="button"
                  onClick={handleNeverShowAgain}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    padding: '0.6rem 0.95rem',
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 10,
                    color: 'var(--text-secondary)',
                    fontSize: '0.78rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#f87171'; e.currentTarget.style.borderColor = 'rgba(248,113,113,0.3)'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = '#9191ab'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
                  title="Dismiss setup and never show this again"
                >
                  <EyeOff size={15} /> Never Show Again
                </button>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.65rem 1.25rem', background: 'linear-gradient(135deg, #4ade80, #22c55e)', border: 'none', borderRadius: 10, color: 'var(--bg-void)', fontWeight: 700, cursor: 'pointer' }}
                >
                  Next Step <ArrowRight size={16} />
                </button>
              </div>
            </motion.div>
          )}

          {/* STEP 3: Guardrails & Launch */}
          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
            >
              <div style={{ textAlign: 'center', marginBottom: '0.5rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-primary)' }}>
                  Safety Guardrails & Discretionary Limits
                </h3>
                <p style={{ margin: '4px 0 0', color: 'var(--mm-text-3)', fontSize: '0.8rem' }}>
                  Set your daily spending tolerance and target emergency cash buffer.
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <div style={{ padding: '0.85rem 1rem', background: 'rgba(255,255,255,0.02)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)' }}>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                    Daily Expense Limit ({selectedCurrency})
                  </label>
                  <div style={{ fontSize: '0.7rem', color: 'var(--mm-text-3)', marginBottom: 6 }}>
                    Alerts you if your day-to-day spending exceeds this pace.
                  </div>
                  <input
                    type="number"
                    value={dailyLimit}
                    onChange={e => setDailyLimit(e.target.value)}
                    style={{ width: '100%', padding: '0.55rem', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--mm-warning)', fontWeight: 700 }}
                  />
                </div>

                <div style={{ padding: '0.85rem 1rem', background: 'rgba(255,255,255,0.02)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)' }}>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                    Target Emergency Runway (Months)
                  </label>
                  <div style={{ fontSize: '0.7rem', color: 'var(--mm-text-3)', marginBottom: 6 }}>
                    The Safe-to-Spend engine will protect this many months of fixed bills.
                  </div>
                  <input
                    type="number"
                    value={runwayTarget}
                    onChange={e => setRunwayTarget(e.target.value)}
                    style={{ width: '100%', padding: '0.55rem', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#38bdf8', fontWeight: 700 }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.65rem 1rem', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: 'var(--mm-text-3)', cursor: 'pointer' }}
                >
                  <ArrowLeft size={16} /> Back
                </button>
                <button
                  type="button"
                  onClick={handleNeverShowAgain}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    padding: '0.6rem 0.95rem',
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 10,
                    color: 'var(--text-secondary)',
                    fontSize: '0.78rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#f87171'; e.currentTarget.style.borderColor = 'rgba(248,113,113,0.3)'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = '#9191ab'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
                  title="Dismiss setup and never show this again"
                >
                  <EyeOff size={15} /> Never Show Again
                </button>
                <button
                  type="button"
                  onClick={handleFinishManual}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.75rem 1.5rem',
                    borderRadius: 10,
                    background: 'linear-gradient(135deg, #4ade80, #22c55e)',
                    border: 'none',
                    color: 'var(--bg-void)',
                    fontWeight: 800,
                    cursor: 'pointer',
                    fontSize: '0.88rem' }}
                >
                  🚀 Launch Vault Manager
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Global Persistent "Never show again" footer link */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          paddingTop: '0.75rem',
          marginTop: '0.25rem',
          borderTop: '1px solid rgba(255, 255, 255, 0.05)'
        }}>
          <button
            type="button"
            onClick={handleNeverShowAgain}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#71717a',
              fontSize: '0.74rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.3rem 0.6rem',
              borderRadius: 6,
              transition: 'color 0.15s ease'
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#f87171'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#71717a'; }}
          >
            <EyeOff size={13} />
            <span>Never show welcome & setup again (reopen anytime in Settings)</span>
          </button>
        </div>

      </div>
    </Modal>
  );
}
