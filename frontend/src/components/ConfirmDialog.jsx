import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';

/**
 * Beautiful in-app confirmation dialog to replace window.confirm().
 */
const ConfirmDialog = ({
  open = false,
  title = 'Confirm Action',
  message = 'Are you sure?',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  danger = false,
}) => {
  return createPortal(
    <AnimatePresence mode="wait">
      {open && (
        <div style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: '1rem',
        }}>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onCancel}
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0,0,0,0.75)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
            }}
          />

          {/* Dialog Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 10 }}
            transition={{ type: 'spring', damping: 26, stiffness: 380 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'relative',
              background: 'var(--bg-surface)',
              border: `1px solid ${danger ? 'rgba(248,113,113,0.35)' : 'rgba(255,255,255,0.1)'}`,
              borderRadius: 20,
              padding: '1.5rem',
              width: '100%',
              maxWidth: 400,
              boxShadow: `0 24px 60px rgba(0,0,0,0.6), ${danger ? '0 0 40px rgba(248,113,113,0.12)' : '0 0 40px rgba(129,140,248,0.1)'}`,
              zIndex: 100000,
            }}
          >
            {/* Top accent line */}
            <div style={{
              position: 'absolute',
              top: 0, left: '20%', right: '20%', height: 2,
              background: danger
                ? 'linear-gradient(90deg, transparent, #f87171, transparent)'
                : 'linear-gradient(90deg, transparent, #818cf8, transparent)',
              borderRadius: '0 0 4px 4px',
            }} />

            {/* Icon */}
            <div style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              background: danger ? 'rgba(248,113,113,0.12)' : 'rgba(129,140,248,0.12)',
              border: `1px solid ${danger ? 'rgba(248,113,113,0.25)' : 'rgba(129,140,248,0.25)'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '1rem',
            }}>
              <AlertTriangle size={24} color={danger ? '#f87171' : '#818cf8'} />
            </div>

            <h3 style={{
              margin: '0 0 0.5rem',
              fontFamily: 'Inter, sans-serif',
              fontSize: '1.1rem',
              fontWeight: 700,
              color: 'var(--text-primary)',
            }}>
              {title}
            </h3>
            <p style={{
              margin: '0 0 1.5rem',
              color: 'var(--text-secondary)',
              fontSize: '0.88rem',
              lineHeight: 1.5,
              fontFamily: 'Inter, sans-serif',
            }}>
              {message}
            </p>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={onCancel}
                style={{
                  flex: 1,
                  minHeight: 42,
                  padding: '0.65rem 1rem',
                  borderRadius: 12,
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: 'rgba(255,255,255,0.05)',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  fontFamily: 'Inter, sans-serif',
                  fontWeight: 600,
                  fontSize: '0.88rem',
                  transition: 'background 0.15s ease',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                style={{
                  flex: 1,
                  minHeight: 42,
                  padding: '0.65rem 1.25rem',
                  borderRadius: 12,
                  border: 'none',
                  background: danger
                    ? 'linear-gradient(135deg, #f87171, #ef4444)'
                    : 'linear-gradient(135deg, #818cf8, #a78bfa)',
                  color: 'white',
                  cursor: 'pointer',
                  fontFamily: 'Inter, sans-serif',
                  fontWeight: 700,
                  fontSize: '0.88rem',
                  boxShadow: danger ? '0 4px 16px rgba(248,113,113,0.35)' : '0 4px 16px rgba(129,140,248,0.35)',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default ConfirmDialog;
