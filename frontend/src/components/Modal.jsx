import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import { X } from 'lucide-react';

const backdropVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

// Liquid Glass: dialogs open like a droplet — they swell past full size,
// sharpen from a soft blur and settle, while the corners tighten.
const modalVariants = {
  hidden: { opacity: 0, scale: 0.86, y: 18, filter: 'blur(10px)', borderRadius: 44 },
  visible: {
    opacity: 1, scale: 1, y: 0, filter: 'blur(0px)', borderRadius: 28,
    transition: { type: 'spring', stiffness: 360, damping: 24, mass: 0.9, filter: { duration: 0.25 }, opacity: { duration: 0.2 } },
    // Drop the filter once settled: a lingering filter would re-anchor
    // position:fixed children (dropdowns) to the panel and clip them.
    transitionEnd: { filter: 'none' },
  },
  exit: {
    opacity: 0, scale: 0.92, y: 10, filter: 'blur(8px)',
    transition: { duration: 0.2, ease: [0.4, 0, 1, 1] }
  }
};

const sheetVariants = {
  hidden: { opacity: 0, y: '100%' },
  visible: {
    opacity: 1, y: 0,
    transition: { type: 'spring', damping: 30, stiffness: 320 }
  },
  exit: {
    opacity: 0, y: '100%',
    transition: { duration: 0.22, ease: 'easeIn' }
  }
};

const Modal = ({ isOpen, onClose, title, children }) => {
  const dragControls = useDragControls();
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 680);

  // Responsive breakpoint tracking
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 680px)');
    const onChange = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Lock background scroll safely without breaking mobile keyboard focus
  useEffect(() => {
    if (isOpen) {
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prevOverflow;
      };
    }
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape' && isOpen) onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  return createPortal(
    <AnimatePresence mode="wait">
      {isOpen && (
        <div
          className="modal-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            display: 'flex',
            justifyContent: 'center',
            alignItems: isMobile ? 'flex-end' : 'center',
            zIndex: 9999,
          }}
        >
          {/* Backdrop */}
          <motion.div
            variants={backdropVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            transition={{ duration: 0.2 }}
            onClick={onClose}
            style={{
              position: 'absolute',
              inset: 0,
              background: 'var(--lg-scrim, rgba(0, 0, 0, 0.5))',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
            }}
          />

          {/* Modal / Bottom-Sheet panel */}
          <motion.div
            className="modal-panel modal-sheet"
            role="dialog" aria-modal="true" aria-label={title}
            variants={isMobile ? sheetVariants : modalVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            drag={isMobile ? "y" : false}
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={(_, info) => {
              if (isMobile && (info.offset.y > 80 || info.velocity.y > 500)) {
                onClose();
              }
            }}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'relative',
              width: isMobile ? '100%' : '90%',
              maxWidth: isMobile ? '100%' : 560,
              maxHeight: isMobile ? '92dvh' : '90vh',
              display: 'flex',
              flexDirection: 'column',
              borderRadius: isMobile ? '24px 24px 0 0' : 20,
              background: 'var(--bg-surface)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderBottom: isMobile ? 'none' : '1px solid rgba(255, 255, 255, 0.08)',
              boxShadow: '0 24px 80px rgba(0,0,0,0.7), 0 0 40px rgba(74,222,128,0.06)',
              zIndex: 10000,
              overflow: 'hidden',
            }}
          >
            {/* Mobile drag handle bar (only this bar triggers drag-to-dismiss) */}
            {isMobile && (
              <div
                onPointerDown={(e) => dragControls.start(e)}
                style={{
                  width: '100%',
                  padding: '0.75rem 0 0.35rem',
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  cursor: 'grab',
                  touchAction: 'none',
                  flexShrink: 0,
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <div style={{
                  width: 38,
                  height: 4,
                  borderRadius: 2,
                  background: 'rgba(255,255,255,0.25)',
                }} />
              </div>
            )}

            {/* Fixed Header */}
            <div
              className="modal-header"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: isMobile ? '0.5rem 1.25rem 0.85rem' : '1.5rem 2rem 1.25rem',
                flexShrink: 0,
                borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
              }}
            >
              <h2 style={{
                margin: 0,
                fontSize: isMobile ? '1.05rem' : '1.2rem',
                fontWeight: 700,
                letterSpacing: '0.8px',
                color: 'var(--text-primary)',
              }}>
                {title}
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 10,
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  width: 36,
                  height: 36,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.15s ease',
                  WebkitTapHighlightColor: 'transparent',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = '#f0f0f5'; e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = '#9191ab'; e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Smoothly Scrollable Body (touch scrolls content cleanly without accidental dismiss) */}
            <div
              className="modal-body"
              style={{
                flex: '1 1 auto',
                overflowY: 'auto',
                WebkitOverflowScrolling: 'touch',
                overscrollBehavior: 'contain',
                padding: isMobile ? '1rem 1.25rem calc(1.75rem + env(safe-area-inset-bottom, 16px))' : '1.5rem 2rem 2rem',
              }}
            >
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default Modal;
