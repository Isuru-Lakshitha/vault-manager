import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Smartphone, Share, Plus, Download, Copy, Check, EyeOff, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import { isIOS, isSafari, isAndroid, isMobileDevice, isStandalone } from '../utils/pwaInstall';

// Fresh keys so any older broken-layout snooze doesn't hide the new full install popup
const NEVER_SHOW_KEY = 'vm_pwa_never_show_v2';
const LATER_KEY      = 'vm_pwa_later_ts_v2';
const LATER_DELAY_MS = 2 * 24 * 60 * 60 * 1000; // 2 days

const InstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState(
    () => (typeof window !== 'undefined' ? window.__deferredPwaPrompt || null : null)
  );
  const [open, setOpen] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [copied, setCopied] = useState(false);
  const [dontShowChecked, setDontShowChecked] = useState(false);

  useEffect(() => {
    if (isStandalone()) {
      setInstalled(true);
      return;
    }

    // Capture Android / Chrome beforeinstallprompt event
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      window.__deferredPwaPrompt = e;
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Track successful installation
    const handleAppInstalled = () => {
      setInstalled(true);
      setOpen(false);
      localStorage.setItem(NEVER_SHOW_KEY, 'true');
      toast.success('🎉 Vault Manager installed to your home screen!', { duration: 5000 });
    };
    window.addEventListener('appinstalled', handleAppInstalled);

    // Manual trigger from mobile header "App" button or Settings page
    const handleManualOpen = () => {
      if (isStandalone()) {
        toast('Vault Manager is already running as an installed full-screen web app!', { icon: '✅' });
        return;
      }
      setOpen(true);
    };
    window.addEventListener('vm:open-install', handleManualOpen);

    // Auto-show on smartphones if not permanently disabled or snoozed
    const neverShow = localStorage.getItem(NEVER_SHOW_KEY) === 'true';
    const laterTs = parseInt(localStorage.getItem(LATER_KEY) || '0', 10);
    const isSnoozed = neverShow || (laterTs && Date.now() < laterTs);

    let timer = null;
    if (!isSnoozed && isMobileDevice()) {
      timer = setTimeout(() => {
        if (localStorage.getItem(NEVER_SHOW_KEY) !== 'true' && !isStandalone()) {
          setOpen(true);
        }
      }, 1800);
    }

    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('vm:open-install', handleManualOpen);
    };
  }, []);

  const promptNativeInstall = async () => {
    const promptEvent = deferredPrompt || window.__deferredPwaPrompt;
    if (!promptEvent) {
      toast('Follow the 3 steps shown below to add Vault Manager to your Home Screen.', { icon: '📲' });
      return;
    }
    setInstalling(true);
    try {
      promptEvent.prompt();
      const { outcome } = await promptEvent.userChoice;
      if (outcome === 'accepted') {
        setInstalled(true);
        setOpen(false);
        localStorage.setItem(NEVER_SHOW_KEY, 'true');
      }
      setDeferredPrompt(null);
      window.__deferredPwaPrompt = null;
    } catch (err) {
      console.warn('Install prompt error:', err);
    } finally {
      setInstalling(false);
    }
  };

  const handleClose = () => {
    setOpen(false);
    if (dontShowChecked) {
      localStorage.setItem(NEVER_SHOW_KEY, 'true');
      toast('Install popup won’t show again. You can still install anytime from Settings.', { icon: '👌', duration: 3500 });
    } else {
      localStorage.setItem(LATER_KEY, String(Date.now() + LATER_DELAY_MS));
    }
  };

  const handleNeverShowAgain = () => {
    setOpen(false);
    localStorage.setItem(NEVER_SHOW_KEY, 'true');
    toast('Install popup disabled permanently. You can still install anytime from Settings.', { icon: '👌', duration: 3500 });
  };

  const copyUrl = () => {
    navigator.clipboard.writeText(window.location.origin).then(() => {
      setCopied(true);
      toast.success('Link copied! Open Safari and paste to install.');
      setTimeout(() => setCopied(false), 3000);
    });
  };

  if (installed) return null;

  const hasNativePrompt = !!(deferredPrompt || (typeof window !== 'undefined' && window.__deferredPwaPrompt));

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) handleClose();
          }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10050,
            background: 'rgba(8, 10, 22, 0.82)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            padding: 0,
            boxSizing: 'border-box',
          }}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            style={{
              width: '100%',
              maxWidth: 480,
              maxHeight: '92dvh',
              overflowY: 'auto',
              WebkitOverflowScrolling: 'touch',
              background: 'linear-gradient(180deg, #22223b 0%, #16162a 100%)',
              borderTop: '1.5px solid rgba(74, 222, 128, 0.38)',
              borderLeft: '1px solid rgba(255, 255, 255, 0.08)',
              borderRight: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '24px 24px 0 0',
              padding: '0.9rem 1.15rem calc(1.25rem + env(safe-area-inset-bottom, 12px))',
              boxShadow: '0 -16px 48px rgba(0, 0, 0, 0.75)',
              boxSizing: 'border-box',
              color: 'var(--text-primary)',
            }}
          >
            {/* Top Grab Handle */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.75rem' }}>
              <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(255, 255, 255, 0.22)' }} />
            </div>

            {/* Header Row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.9rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 13,
                    background: 'linear-gradient(135deg, #4ade80 0%, #06b6d4 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    boxShadow: '0 4px 16px rgba(74, 222, 128, 0.35)',
                  }}
                >
                  <Smartphone size={23} color="#0a1628" strokeWidth={2.4} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                      Install Vault Manager App
                    </h3>
                    <span style={{
                      fontSize: '0.62rem',
                      padding: '2px 6px',
                      borderRadius: 6,
                      background: 'rgba(74, 222, 128, 0.16)',
                      color: 'var(--mm-success)',
                      fontWeight: 700,
                    }}>
                      100% FREE
                    </span>
                  </div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                    {isIOS()
                      ? (isSafari() ? 'iPhone / iPad Home Screen Web App' : 'Open in Safari for iPhone Home Screen App')
                      : (isAndroid() ? 'Android Full-Screen Web App' : 'Install Full-Screen Web App')}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleClose}
                aria-label="Close install popup"
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: '50%',
                  background: 'rgba(255, 255, 255, 0.07)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: 'var(--text-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                <X size={17} />
              </button>
            </div>

            {/* 2x2 Compact Benefits Grid (Optimized for all smartphone widths) */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: '0.45rem',
              marginBottom: '0.95rem',
            }}>
              {[
                { icon: '⚡', title: 'Instant Launch', sub: 'Opens in <0.3s from Home' },
                { icon: '📡', title: 'Offline Ready', sub: 'Add txns without internet' },
                { icon: '📱', title: 'Full Screen', sub: 'No browser address bar' },
                { icon: '🔐', title: 'Biometric Lock', sub: 'Face ID / Fingerprint PIN' },
              ].map((b) => (
                <div
                  key={b.title}
                  style={{
                    background: 'rgba(255, 255, 255, 0.035)',
                    border: '1px solid rgba(255, 255, 255, 0.07)',
                    borderRadius: 11,
                    padding: '0.55rem 0.65rem',
                    minWidth: 0,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span style={{ fontSize: '0.92rem' }}>{b.icon}</span>
                    <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {b.title}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.66rem', color: '#8e8ea8', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {b.sub}
                  </div>
                </div>
              ))}
            </div>

            {/* ── PLATFORM-SPECIFIC FULL INSTALL LAYOUT ── */}

            {/* 1. Native 1-Tap Install Button (Android Chrome / Edge / Supported Browsers) */}
            {hasNativePrompt && (
              <button
                type="button"
                onClick={promptNativeInstall}
                disabled={installing}
                style={{
                  width: '100%',
                  padding: '0.85rem 1rem',
                  marginBottom: '0.85rem',
                  borderRadius: 13,
                  background: 'linear-gradient(135deg, #4ade80 0%, #22c55e 100%)',
                  border: 'none',
                  color: '#081420',
                  fontSize: '0.92rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  boxShadow: '0 6px 20px rgba(74, 222, 128, 0.35)',
                }}
              >
                <Download size={18} strokeWidth={2.5} />
                <span>{installing ? 'Installing Web App…' : 'Install Web App Now (1-Tap)'}</span>
              </button>
            )}

            {/* 2. iOS Safari Step-by-Step Visual Layout */}
            {isIOS() && isSafari() && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', marginBottom: '0.85rem' }}>
                <div style={{ fontSize: '0.75rem', color: '#c4b5fd', fontWeight: 600 }}>
                  How to install on your iPhone / iPad in 3 quick taps:
                </div>
                {[
                  {
                    step: '1',
                    icon: <Share size={16} color="#818cf8" strokeWidth={2.4} />,
                    title: 'Tap the Share button in Safari',
                    desc: 'Look at the bottom toolbar of Safari and tap the Share icon (square with arrow ↑).',
                  },
                  {
                    step: '2',
                    icon: <Plus size={16} color="#4ade80" strokeWidth={2.4} />,
                    title: 'Tap "Add to Home Screen"',
                    desc: 'Scroll down the share menu and select "Add to Home Screen".',
                  },
                  {
                    step: '3',
                    icon: <Check size={16} color="#38bdf8" strokeWidth={2.4} />,
                    title: 'Tap "Add" in the top-right corner',
                    desc: 'Vault Manager will appear on your Home Screen like a native iOS app!',
                  },
                ].map((s) => (
                  <div
                    key={s.step}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.7rem',
                      padding: '0.65rem 0.75rem',
                      borderRadius: 12,
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.07)',
                    }}
                  >
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 9,
                        background: 'rgba(255, 255, 255, 0.06)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {s.icon}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--text-primary)' }}>
                        Step {s.step}: {s.title}
                      </div>
                      <div style={{ fontSize: '0.71rem', color: 'var(--text-secondary)', lineHeight: 1.35, marginTop: 1 }}>
                        {s.desc}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 3. iOS Non-Safari (Chrome on iOS / In-App Browser) */}
            {isIOS() && !isSafari() && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginBottom: '0.85rem' }}>
                <div style={{ padding: '0.75rem', borderRadius: 12, background: 'rgba(251, 191, 36, 0.1)', border: '1px solid rgba(251, 191, 36, 0.3)' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--mm-warning)' }}>
                    ⚠️ Open in Safari to Install on iPhone
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#d1d5db', marginTop: 3, lineHeight: 1.4 }}>
                    Copy the app link below, open <strong>Safari</strong>, paste it, and tap <strong>Share → Add to Home Screen</strong>.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={copyUrl}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: 12,
                    background: 'linear-gradient(135deg, #4ade80, #22c55e)',
                    border: 'none',
                    color: '#0a1628',
                    fontWeight: 800,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.45rem',
                  }}
                >
                  {copied ? <Check size={17} /> : <Copy size={17} />}
                  <span>{copied ? 'Copied! Now Paste in Safari' : 'Copy App Link for Safari'}</span>
                </button>
              </div>
            )}

            {/* 4. Android / Other Browsers Step-by-Step Guide */}
            {!isIOS() && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.85rem' }}>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  {hasNativePrompt ? 'Or install via your browser menu:' : 'Install in 3 quick taps from your browser menu:'}
                </div>
                {[
                  { step: '1', title: 'Tap Browser Menu (⋮)', desc: 'Tap the three dots (⋮) in the top-right or bottom-right corner of Chrome/browser.' },
                  { step: '2', title: 'Tap "Install app" or "Add to Home screen"', desc: 'Select "Install app" from the menu options.' },
                  { step: '3', title: 'Tap "Install" to confirm', desc: 'Vault Manager will be added to your phone’s app drawer & home screen!' },
                ].map((s) => (
                  <div
                    key={s.step}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.65rem',
                      padding: '0.6rem 0.75rem',
                      borderRadius: 11,
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                    }}
                  >
                    <div
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 7,
                        background: 'rgba(74, 222, 128, 0.16)',
                        color: 'var(--mm-success)',
                        fontWeight: 800,
                        fontSize: '0.76rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {s.step}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.79rem', color: 'var(--text-primary)' }}>
                        {s.title}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', lineHeight: 1.3 }}>
                        {s.desc}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* "Don't show this popup again" Checkbox Row */}
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.55rem',
                padding: '0.55rem 0.7rem',
                marginBottom: '0.75rem',
                borderRadius: 10,
                background: dontShowChecked ? 'rgba(248, 113, 113, 0.1)' : 'rgba(255, 255, 255, 0.025)',
                border: `1px solid ${dontShowChecked ? 'rgba(248, 113, 113, 0.35)' : 'rgba(255, 255, 255, 0.06)'}`,
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              <input
                type="checkbox"
                checked={dontShowChecked}
                onChange={(e) => setDontShowChecked(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: 'var(--mm-success)', cursor: 'pointer', margin: 0 }}
              />
              <span style={{ fontSize: '0.76rem', color: dontShowChecked ? '#fca5a5' : '#cbd5e1', fontWeight: 600 }}>
                Don&apos;t show this install popup again
              </span>
            </label>

            {/* Bottom Action Buttons: Remind Later & Don't Show Again */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.55rem' }}>
              <button
                type="button"
                onClick={handleClose}
                style={{
                  padding: '0.7rem 0.75rem',
                  borderRadius: 11,
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: '#e2e8f0',
                  fontWeight: 700,
                  fontSize: '0.79rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.35rem',
                }}
              >
                <Clock size={14} />
                <span>{dontShowChecked ? 'Save & Close' : 'Remind Later'}</span>
              </button>

              <button
                type="button"
                onClick={handleNeverShowAgain}
                style={{
                  padding: '0.7rem 0.75rem',
                  borderRadius: 11,
                  background: 'rgba(248, 113, 113, 0.12)',
                  border: '1px solid rgba(248, 113, 113, 0.3)',
                  color: 'var(--mm-danger)',
                  fontWeight: 700,
                  fontSize: '0.79rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.35rem',
                }}
              >
                <EyeOff size={14} />
                <span>Don&apos;t Show Again</span>
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default InstallPrompt;
