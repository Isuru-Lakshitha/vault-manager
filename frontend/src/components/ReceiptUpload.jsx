import { useState, useRef, useEffect } from 'react';
import { Camera, Image as ImageIcon, X, Loader } from 'lucide-react';
import toast from 'react-hot-toast';
import { saveReceipt } from '../utils/api';
import ReceiptImage from './ReceiptImage';

// Firestore docs max out at 1 MiB — keep the stored data URL comfortably below that
const MAX_DATAURL_CHARS = 700_000;

// Decode any phone photo (respecting EXIF rotation) into a drawable source
async function decodeImage(file) {
  if ('createImageBitmap' in window) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch {/* fall back */}
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('unsupported')); };
    img.src = url;
  });
}

function renderJpeg(source, maxSide, quality) {
  const w = source.width, h = source.height;
  const ratio = Math.min(1, maxSide / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * ratio));
  canvas.height = Math.max(1, Math.round(h * ratio));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; // flatten transparent PNGs onto white
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}

// Shrink until it fits in a Firestore document; receipts stay readable at these sizes
function compressToFit(source) {
  for (const side of [1600, 1280, 1024, 800]) {
    for (const q of [0.82, 0.7, 0.58, 0.46]) {
      const url = renderJpeg(source, side, q);
      if (url.length <= MAX_DATAURL_CHARS) return url;
    }
  }
  return renderJpeg(source, 640, 0.4);
}

const ReceiptUpload = ({ existingUrl, existingThumb, onUploaded }) => {
  const [uploading, setUploading] = useState(false);
  const [stage, setStage] = useState('');
  const [value, setValue] = useState(existingUrl || null);
  const [thumb, setThumb] = useState(existingThumb || null);
  const cameraRef = useRef(null);
  const galleryRef = useRef(null);

  // Keep in sync when the form opens a different transaction
  useEffect(() => { setValue(existingUrl || null); setThumb(existingThumb || null); }, [existingUrl, existingThumb]);

  const handleFile = async (file) => {
    if (!file) return;
    if (file.type && !file.type.startsWith('image/')) { toast.error('Please choose an image file'); return; }
    if (file.size > 25 * 1024 * 1024) { toast.error('Image is too large (max 25 MB)'); return; }

    setUploading(true);
    try {
      setStage('Optimizing…');
      const source = await decodeImage(file);
      const full = compressToFit(source);
      const tiny = renderJpeg(source, 160, 0.6);
      source.close?.();

      setStage('Saving…');
      const id = await saveReceipt(full);
      const ref = `receipt:${id}`;
      setValue(ref);
      setThumb(tiny);
      onUploaded?.(ref, tiny);
      toast.success('Receipt attached');
    } catch (err) {
      console.error('Receipt upload failed:', err);
      if (err?.message === 'unsupported') toast.error('This image format isn\'t supported — try a JPG or PNG');
      else if (err?.code === 'permission-denied') toast.error('Permission denied — please sign in again');
      else if (!navigator.onLine) toast.error('You\'re offline — receipt will save when you reconnect');
      else toast.error('Couldn\'t save receipt. Please try again.');
    } finally {
      setUploading(false);
      setStage('');
      if (cameraRef.current) cameraRef.current.value = '';
      if (galleryRef.current) galleryRef.current.value = '';
    }
  };

  const handleRemove = () => {
    setValue(null);
    setThumb(null);
    onUploaded?.(null, null);
  };

  const btn = {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.45rem',
    padding: '0.65rem 0.75rem', borderRadius: 10, border: '1px dashed rgba(255,255,255,0.15)',
    background: 'rgba(255,255,255,0.03)', color: 'var(--text-secondary)', fontSize: '0.82rem',
    fontFamily: 'Inter, sans-serif', minHeight: 44, cursor: uploading ? 'wait' : 'pointer',
  };

  return (
    <div>
      <label style={{ display: 'block', marginBottom: '0.45rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
        Receipt Photo
      </label>

      {!value ? (
        uploading ? (
          <div style={{ ...btn, cursor: 'wait' }}>
            <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> {stage}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" style={btn} onClick={() => cameraRef.current?.click()}>
              <Camera size={16} /> Camera
            </button>
            <button type="button" style={btn} onClick={() => galleryRef.current?.click()}>
              <ImageIcon size={16} /> Gallery
            </button>
          </div>
        )
      ) : (
        <div>
          <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(74,222,128,0.25)', background: 'rgba(0,0,0,0.35)' }}>
            <ReceiptImage value={value} thumb={thumb}
              style={{ width: '100%', maxHeight: 160, objectFit: 'contain', display: 'block', minHeight: 60 }} />
          </div>
          <div style={{ display: 'flex', gap: '1rem', marginTop: '0.4rem' }}>
            <button type="button" onClick={handleRemove}
              style={{ fontSize: '0.75rem', color: '#f87171', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'Inter, sans-serif', display: 'flex', alignItems: 'center', gap: 4 }}>
              <X size={12} /> Remove
            </button>
            <button type="button" onClick={() => galleryRef.current?.click()} disabled={uploading}
              style={{ fontSize: '0.75rem', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'Inter, sans-serif' }}>
              {uploading ? stage : 'Replace'}
            </button>
          </div>
        </div>
      )}

      {/* Camera: opens the rear camera directly on phones */}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment"
        style={{ display: 'none' }} onChange={(e) => handleFile(e.target.files?.[0])} />
      {/* Gallery: no `capture`, so Android/iOS show the photo picker */}
      <input ref={galleryRef} type="file" accept="image/*"
        style={{ display: 'none' }} onChange={(e) => handleFile(e.target.files?.[0])} />

      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </div>
  );
};

export default ReceiptUpload;
