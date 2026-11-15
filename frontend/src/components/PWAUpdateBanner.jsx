import 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';

const PWAUpdateBanner = () => {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered() {},
    onRegisterError() {},
  });

  if (!needRefresh) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: -60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -60, opacity: 0 }}
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 10000,
          background: 'linear-gradient(135deg, #818cf8, #a78bfa)',
          color: '#fff', padding: '0.625rem 1rem',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: '0.75rem', fontFamily: 'Inter, sans-serif', fontSize: '0.82rem',
        }}
      >
        <span style={{ fontWeight: 500 }}>🆕 New version available</span>
        <button
          onClick={() => updateServiceWorker(true)}
          style={{
            background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.4)',
            borderRadius: 8, color: '#fff', cursor: 'pointer', padding: '0.3rem 0.75rem',
            fontFamily: 'Inter, sans-serif', fontSize: '0.78rem', fontWeight: 700,
            display: 'flex', alignItems: 'center', gap: '0.35rem'
          }}
        >
          <RefreshCw size={13}/> Update Now
        </button>
      </motion.div>
    </AnimatePresence>
  );
};

export default PWAUpdateBanner;
