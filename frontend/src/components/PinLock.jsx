import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Landmark, Delete, Lock, LogOut, Fingerprint } from 'lucide-react';
import { haptic } from '../utils/format';

import { verifyPin as checkPin, MAX_PIN_ATTEMPTS } from '../utils/pinHash';

const readFails = () => { try { return Number(localStorage.getItem('vm_pin_fails')) || 0; } catch { return 0; } };

/* ─── Keypad layout ──────────────────────────────────────────────────────── */
const KEYS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['del', '0', 'ok'],
];

/* ─── Animation variants ─────────────────────────────────────────────────── */
const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.35, ease: 'easeOut' } },
  exit:   { opacity: 0, transition: { duration: 0.25, ease: 'easeIn' } },
};

const cardVariants = {
  hidden:  { opacity: 0, scale: 0.92, y: 32 },
  visible: {
    opacity: 1, scale: 1, y: 0,
    transition: { type: 'spring', stiffness: 340, damping: 30, mass: 0.9 },
  },
  exit: { opacity: 0, scale: 0.94, y: 20, transition: { duration: 0.22 } },
};

const dotVariants = {
  empty: { scale: 1,   backgroundColor: 'rgba(255,255,255,0.12)' },
  filled: {
    scale: [1, 1.4, 1],
    backgroundColor: '#4ade80',
    transition: { duration: 0.28, ease: 'easeOut' },
  },
};

const shakeVariants = {
  shake: {
    x: [0, -12, 12, -10, 10, -6, 6, 0],
    transition: { duration: 0.45, ease: 'easeInOut' },
  },
};

/* ─── Individual keypad button ───────────────────────────────────────────── */
function KeyButton({ label, onClick, disabled }) {
  const isSpecial = label === 'del' || label === 'ok';

  return (
    <motion.button
      whileHover={!disabled ? { scale: 1.07, backgroundColor: 'rgba(74,222,128,0.12)' } : {}}
      whileTap={!disabled ? { scale: 0.92 } : {}}
      transition={{ duration: 0.14 }}
      onClick={() => !disabled && onClick(label)}
      disabled={disabled}
      style={{
        width: 72,
        height: 72,
        borderRadius: '50%',
        border: isSpecial
          ? '1px solid rgba(167,139,250,0.35)'
          : '1px solid rgba(74,222,128,0.2)',
        background: isSpecial
          ? 'rgba(167,139,250,0.08)'
          : 'rgba(74,222,128,0.05)',
        color: isSpecial ? '#a78bfa' : '#f0f0f5',
        fontSize: isSpecial ? '0.75rem' : '1.5rem',
        fontFamily: isSpecial ? 'Outfit, sans-serif' : 'Outfit, sans-serif',
        fontWeight: 600,
        cursor: disabled ? 'default' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        letterSpacing: isSpecial ? '0.05em' : 0,
        boxShadow: isSpecial
          ? '0 0 14px rgba(167,139,250,0.12), inset 0 1px 0 rgba(255,255,255,0.05)'
          : '0 0 14px rgba(74,222,128,0.07), inset 0 1px 0 rgba(255,255,255,0.04)',
        transition: 'background 0.18s',
        WebkitTapHighlightColor: 'transparent',
        outline: 'none',
      }}
    >
      {label === 'del' ? <Delete size={22} /> : label === 'ok' ? <Lock size={22} /> : label}
    </motion.button>
  );
}

/* ─── Main component ─────────────────────────────────────────────────────── */
export default function PinLock({ onUnlock, onSignOut }) {
  const [pin, setPin]           = useState('');
  const [error, setError]       = useState('');
  const [shaking, setShaking]   = useState(false);
  const [checking, setChecking] = useState(false);
  const [hasBiometric, setHasBiometric] = useState(false);

  // Helper to trigger biometric
  const triggerBiometric = useCallback(async () => {
    const credIdStr = localStorage.getItem('vm_webauthn_cred_id');
    if (!credIdStr) return;
    try {
      const credIdObj = JSON.parse(credIdStr);
      const credId = Uint8Array.from(atob(credIdObj.id), c => c.charCodeAt(0));
      
      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          allowCredentials: [{
            type: 'public-key',
            id: credId
          }],
          userVerification: 'required'
        }
      });
      if (assertion) {
        localStorage.removeItem('vm_pin_fails');
        onUnlock();
      }
    } catch (err) {
      console.warn("Biometric failed or cancelled", err);
      // Fallback to PIN
    }
  }, [onUnlock]);

  /* If no PIN is stored at all, unlock immediately */
  useEffect(() => {
    const stored = localStorage.getItem('vm_pin_hash');
    if (!stored) onUnlock();
    
    // Check if biometric exists
    const credId = localStorage.getItem('vm_webauthn_cred_id');
    if (credId) {
      setHasBiometric(true);
      triggerBiometric();
    }
  }, [onUnlock, triggerBiometric]);

  const verifyPin = useCallback(async (attempt) => {
    setChecking(true);
    const stored = localStorage.getItem('vm_pin_hash');
    const { ok, upgraded } = await checkPin(attempt, stored);

    if (ok) {
      if (upgraded) localStorage.setItem('vm_pin_hash', upgraded);
      localStorage.removeItem('vm_pin_fails');
      onUnlock();
    } else {
      const fails = readFails() + 1;
      localStorage.setItem('vm_pin_fails', String(fails));
      if (fails >= MAX_PIN_ATTEMPTS) {
        // Too many wrong tries: sign out, so the next person must log in again.
        localStorage.removeItem('vm_pin_fails');
        setChecking(false);
        onSignOut?.();
        return;
      }
      haptic(50);
      setShaking(true);
      const left = MAX_PIN_ATTEMPTS - fails;
      setError(`Incorrect PIN · ${left} ${left === 1 ? 'try' : 'tries'} left`);
      setTimeout(() => {
        setPin('');
        setError('');
        setShaking(false);
      }, 900);
    }
    setChecking(false);
  }, [onUnlock, onSignOut]);

  const handleKey = useCallback(async (label) => {
    if (checking) return;
    haptic();

    if (label === 'del') {
      setPin((p) => p.slice(0, -1));
      setError('');
      return;
    }

    if (label === 'ok') {
      if (pin.length < 4) return;
      await verifyPin(pin);
      return;
    }

    // digit
    if (pin.length < 4) {
      const next = pin + label;
      setPin(next);
      // auto-submit when 4 digits entered
      if (next.length === 4) {
        await verifyPin(next);
      }
    }
  }, [pin, checking, verifyPin]);

  /* Keyboard support */
  useEffect(() => {
    const handler = (e) => {
      if (e.key >= '0' && e.key <= '9') handleKey(e.key);
      else if (e.key === 'Backspace') handleKey('del');
      else if (e.key === 'Enter') handleKey('ok');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleKey]);

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="pin-lock-overlay"
        variants={overlayVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 99999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(6,8,16,0.96)',
          backdropFilter: 'blur(18px)',
          WebkitBackdropFilter: 'blur(18px)',
          backgroundImage: [
            'radial-gradient(ellipse at 20% 15%, rgba(129,140,248,0.12) 0%, transparent 55%)',
            'radial-gradient(ellipse at 80% 85%, rgba(167,139,250,0.09) 0%, transparent 55%)',
            'radial-gradient(ellipse at 50% 50%, rgba(74,222,128,0.05) 0%, transparent 65%)',
          ].join(', '),
        }}
      >
        <motion.div
          key="pin-lock-card"
          variants={cardVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '2rem',
            padding: '2.75rem 2.25rem 2rem',
            borderRadius: 24,
            background: 'linear-gradient(145deg, rgba(12,18,38,0.97) 0%, rgba(8,12,28,0.99) 100%)',
            border: '1px solid rgba(74,222,128,0.2)',
            boxShadow: '0 0 80px rgba(74,222,128,0.10), 0 40px 100px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.06)',
            width: '100%',
            maxWidth: 360,
            position: 'relative',
          }}
        >
          {/* Top accent line */}
          <div style={{
            position: 'absolute', top: 0, left: '18%', right: '18%', height: 2,
            background: 'linear-gradient(90deg, transparent, #4ade80, #a78bfa, transparent)',
            borderRadius: '0 0 4px 4px',
          }} />

          {/* ── Logo ── */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem' }}>
            <div style={{
              width: 60, height: 60, borderRadius: '50%',
              background: 'rgba(74,222,128,0.07)',
              border: '1px solid rgba(74,222,128,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 28px rgba(74,222,128,0.18)',
            }}>
              <Landmark size={28} color="#4ade80" />
            </div>
            <h1 style={{
              fontWeight: 800,
              fontSize: '1.4rem',
              letterSpacing: '0.5px',
              margin: 0,
              color: 'var(--text-primary)',
            }}>
              Vault<span style={{
                background: 'linear-gradient(135deg, #4ade80, #a78bfa)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}>Manager</span>
            </h1>
            <p style={{
              fontSize: '0.72rem',
              color: 'rgba(74,222,128,0.55)',
              letterSpacing: '2.5px',
              textTransform: 'uppercase',
              margin: 0,
            }}>
              Enter PIN to unlock
            </p>
          </div>

          {/* ── PIN dots ── */}
          <motion.div
            animate={shaking ? 'shake' : false}
            variants={shakeVariants}
            style={{ display: 'flex', gap: '1rem', alignItems: 'center', minHeight: 22 }}
          >
            {[0, 1, 2, 3].map((i) => (
              <motion.div
                key={i}
                variants={dotVariants}
                animate={i < pin.length ? 'filled' : 'empty'}
                initial="empty"
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  border: '1.5px solid rgba(74,222,128,0.35)',
                  boxShadow: i < pin.length ? '0 0 12px rgba(74,222,128,0.5)' : 'none',
                }}
              />
            ))}
          </motion.div>

          {/* ── Error message ── */}
          <div style={{ height: 20, marginTop: -16 }}>
            <AnimatePresence>
              {error && (
                <motion.p
                  key="err"
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  style={{
                    margin: 0,
                    fontSize: '0.75rem',
                    color: 'var(--mm-danger)',
                    letterSpacing: '1px',
                    textAlign: 'center',
                  }}
                >
                  {error}
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          {/* ── Keypad ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {KEYS.map((row, ri) => (
              <div key={ri} style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                {row.map((key) => (
                  <KeyButton
                    key={key}
                    label={key}
                    onClick={handleKey}
                    disabled={checking || (key === 'ok' && pin.length < 4)}
                  />
                ))}
              </div>
            ))}
          </div>
          
          {hasBiometric && (
            <motion.button
              whileHover={{ color: '#4ade80' }}
              onClick={triggerBiometric}
              style={{
                background: 'none',
                border: '1px solid rgba(74,222,128,0.3)',
                cursor: 'pointer',
                color: 'var(--mm-success)',
                fontSize: '0.85rem',
                letterSpacing: '0.5px',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                marginTop: '0.5rem',
                padding: '0.6rem 1rem',
                borderRadius: 12,
                transition: 'all 0.2s',
              }}
            >
              <Fingerprint size={16} />
              Use Fingerprint
            </motion.button>
          )}

          {/* ── Forgot PIN / Sign Out link ── */}
          <motion.button
            whileHover={{ color: '#f87171' }}
            onClick={onSignOut}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'rgba(255,255,255,0.3)',
              fontSize: '0.7rem',
              letterSpacing: '1px',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              marginTop: '-0.5rem',
              padding: '0.4rem 0.75rem',
              borderRadius: 8,
              transition: 'color 0.2s',
            }}
          >
            <LogOut size={13} />
            Forgot PIN? Sign Out
          </motion.button>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
