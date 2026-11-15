import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader } from 'lucide-react';
import { resolveReceipt } from '../utils/api';

/**
 * Shows a receipt thumbnail; tap opens a full-screen viewer.
 * `value` may be "receipt:<id>" (Firestore), a data: URL, or a legacy https URL.
 * `thumb` is an optional tiny inline preview so lists render without extra reads.
 */
const ReceiptImage = ({ value, thumb, style, alt = 'Receipt' }) => {
  const [src, setSrc] = useState(thumb || (value && !value.startsWith('receipt:') ? value : null));
  const [full, setFull] = useState(null);
  const [open, setOpen] = useState(false);
  const [loadingFull, setLoadingFull] = useState(false);

  // No inline thumbnail → resolve the stored image for the preview
  useEffect(() => {
    let alive = true;
    if (thumb) { setSrc(thumb); return; }
    if (!value) { setSrc(null); return; }
    resolveReceipt(value).then(s => { if (alive) setSrc(s); }).catch(() => {});
    return () => { alive = false; };
  }, [value, thumb]);

  const openViewer = async (e) => {
    e?.stopPropagation?.();
    setOpen(true);
    if (full) return;
    setLoadingFull(true);
    try { setFull(await resolveReceipt(value)); } catch {}
    finally { setLoadingFull(false); }
  };

  if (!src && !value) return null;

  return (
    <>
      {src ? (
        <img src={src} alt={alt} loading="lazy" decoding="async" onClick={openViewer} title="View receipt"
          style={{ cursor: 'zoom-in', ...style }} />
      ) : (
        <div onClick={openViewer} style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', background:'rgba(255,255,255,0.04)', ...style }}>
          <Loader size={14} style={{ animation:'spin 1s linear infinite', color:'#666' }} />
        </div>
      )}

      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
              onClick={() => setOpen(false)}
              style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.94)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:99999, padding:'1rem', cursor:'zoom-out' }}>
              {(full || src) && (
                <motion.img src={full || src} alt={alt} initial={{ scale:0.9 }} animate={{ scale:1 }} exit={{ scale:0.9 }}
                  onClick={(e) => e.stopPropagation()}
                  style={{ maxWidth:'100%', maxHeight:'90vh', borderRadius:12, objectFit:'contain', filter: loadingFull ? 'blur(6px)' : 'none', transition:'filter 0.25s' }} />
              )}
              {loadingFull && <Loader size={28} style={{ position:'absolute', color:'#fff', animation:'spin 1s linear infinite' }} />}
              <button onClick={() => setOpen(false)} aria-label="Close"
                style={{ position:'absolute', top:'max(16px, env(safe-area-inset-top))', right:16, background:'rgba(255,255,255,0.12)', border:'none', borderRadius:'50%', width:40, height:40, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:'#fff' }}>
                <X size={20} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
};

export default ReceiptImage;
