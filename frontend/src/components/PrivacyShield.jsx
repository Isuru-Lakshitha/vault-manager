import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck, Landmark } from 'lucide-react';

export default function PrivacyShield() {
  const [isShieldActive, setIsShieldActive] = useState(false);
  const [shieldEnabled, setShieldEnabled] = useState(() => {
    return localStorage.getItem('vm_privacy_shield') !== 'false';
  });

  useEffect(() => {
    const handleStorage = () => {
      setShieldEnabled(localStorage.getItem('vm_privacy_shield') !== 'false');
    };
    window.addEventListener('storage', handleStorage);
    window.addEventListener('vm:privacy-shield-toggled', handleStorage);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('vm:privacy-shield-toggled', handleStorage);
    };
  }, []);

  useEffect(() => {
    if (!shieldEnabled) {
      setIsShieldActive(false);
      return;
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        setIsShieldActive(true);
      } else {
        // Delay slightly for smooth transition on app return
        setTimeout(() => setIsShieldActive(false), 80);
      }
    };

    const handleBlur = () => {
      // Trigger shield when app switcher is opened on mobile
      setIsShieldActive(true);
    };

    const handleFocus = () => {
      setTimeout(() => setIsShieldActive(false), 80);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
    };
  }, [shieldEnabled]);

  return (
    <AnimatePresence>
      {isShieldActive && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 99998,
            background: 'rgba(26, 26, 46, 0.94)',
            backdropFilter: 'blur(30px) saturate(180%)',
            WebkitBackdropFilter: 'blur(30px) saturate(180%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-primary)',
            padding: '2rem',
            textAlign: 'center',
            userSelect: 'none',
            pointerEvents: 'auto'
          }}
        >
          <motion.div
            initial={{ scale: 0.9, y: 10 }}
            animate={{ scale: 1, y: 0 }}
            transition={{ type: 'spring', damping: 20 }}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '1rem'
            }}
          >
            <div style={{
              width: 72,
              height: 72,
              borderRadius: 24,
              background: 'linear-gradient(135deg, rgba(74, 222, 128, 0.2), rgba(129, 140, 248, 0.2))',
              border: '1px solid rgba(74, 222, 128, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 30px rgba(74, 222, 128, 0.25)'
            }}>
              <Landmark size={36} color="#4ade80" />
            </div>

            <div>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
                fontSize: '1.25rem',
                fontWeight: 800,
                color: 'var(--text-primary)'
              }}>
                <ShieldCheck size={20} color="#4ade80" /> Vault Secured
              </div>
              <p style={{
                margin: '0.4rem 0 0',
                fontSize: '0.82rem',
                color: 'var(--text-secondary)' }}>
                Multitasking Privacy Shield active · Tap or return to resume session
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
