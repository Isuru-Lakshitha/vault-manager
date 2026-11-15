import { recognizeReceipt } from '../utils/receiptOcr.js';
import React, { useState, useRef, useEffect } from 'react';
import 'framer-motion';
import { Camera, X } from 'lucide-react';
import Modal from './Modal';
import { fetchTransactions, fetchAccounts, createTransaction, updateTransaction, saveReceipt } from '../utils/api';
import { formatCurrency, getCurrencyLabel, haptic } from '../utils/format';
import toast from 'react-hot-toast';
import { todayYMD } from '../utils/dates';

export default function ReceiptScannerModal({ isOpen, onClose, onReceiptProcessed }) {
  const [imageUri, setImageUri] = useState(null);
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [ocrStatus, setOcrStatus] = useState('');
  const [ocrText, setOcrText] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [saving, setSaving] = useState(false);
  const scanGeneration = useRef(0);

// Extracted data
  
  // Extracted data
  const [extractedData, setExtractedData] = useState({
    amount: '',
    merchant: '',
    date: todayYMD(),
    category: 'Shopping',
    isTaxDeductible: false,
    taxCategory: 'None'
  });

  const [mode, setMode] = useState('new'); // 'new' | 'existing'
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [selectedTxId, setSelectedTxId] = useState('');
  const [accounts, setAccounts] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');

  const fileInputRef = useRef(null);

  useEffect(() => {
    const scanToken = scanGeneration;
    if (isOpen) {
      setIsProcessing(false);
      fetchTransactions().then(txs => {
        const sorted = (txs || []);
        setRecentTransactions(sorted);
        if (sorted.length > 0) setSelectedTxId(sorted[0].id);
      }).catch(() => {});

      fetchAccounts().then(all => {
        const accs = all.filter(a => !a.archived);
        setAccounts(accs || []);
        if (accs && accs.length > 0) setSelectedAccountId(accs[0].id);
      }).catch(() => {});
    }
    return () => { scanToken.current++; };
  }, [isOpen]);

  // Compress image to light base64 string
  const handleFileProcess = (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > 25 * 1024 * 1024) { toast.error('Choose an image smaller than 25 MB'); return; }
    const generation = ++scanGeneration.current;
    setReviewed(false); setOcrText(''); setOcrStatus('');
    setFileName(file.name);
    setFileSize((file.size / 1024).toFixed(1) + ' KB');
    setIsProcessing(true);

    const reader = new FileReader();
    reader.onload = (e) => {
      if (generation !== scanGeneration.current) return;
      const img = new Image();
      img.onload = () => {
        if (generation !== scanGeneration.current) return;
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 900;
        const scale = Math.min(1, MAX_WIDTH / Math.max(img.width, img.height));
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        let compressed = canvas.toDataURL('image/jpeg', 0.72);
        if (compressed.length > 700000) compressed = canvas.toDataURL('image/jpeg', 0.4);
        if (compressed.length > 700000) { setIsProcessing(false); toast.error('Image is too detailed. Crop to the receipt and retry.'); return; }
        setImageUri(compressed);

        // Attach the image; details must be entered from the receipt.
        extractSmartReceiptData(file.name);
        setIsProcessing(false);
      };
      img.onerror = () => { setIsProcessing(false); toast.error('Could not read this image. Choose a JPG or PNG.'); };
      img.src = e.target.result;
    };
    reader.onerror = () => { setIsProcessing(false); toast.error('Could not read the selected file'); };
    reader.readAsDataURL(file);
  };

  const extractSmartReceiptData = () => {
    // Image upload is not OCR: never fabricate financial or tax values.
    setExtractedData({ amount: '', merchant: '', category: 'Shopping', date: todayYMD(),
      isTaxDeductible: false, taxCategory: 'None' });
  };

  const handleCreateTransaction = async () => {
    if (!extractedData.amount || isNaN(extractedData.amount)) {
      toast.error('Please enter a valid receipt amount');
      return;
    }
    if (!reviewed || saving) return;
    const duplicate = recentTransactions.some(tx => tx.receipt_uri === imageUri || (tx.date === extractedData.date && Number(tx.amount) === Number(extractedData.amount) && (tx.notes || '').toLowerCase() === extractedData.merchant.toLowerCase()));
    if (duplicate) { toast.error('Possible duplicate receipt. Review and attach to the existing transaction instead.'); setMode('existing'); return; }
    setSaving(true);
    try {
      const receiptId = await saveReceipt(imageUri);
      if (recentTransactions.some(tx => tx.receipt_url === `receipt:${receiptId}`)) { toast.error('This receipt is already attached to a transaction'); setMode('existing'); return; }
      await createTransaction({
        type: 'Expense',
        amount: parseFloat(extractedData.amount),
        date: extractedData.date,
        category: extractedData.category,
        notes: extractedData.merchant,
        from_account_id: selectedAccountId || (accounts[0] ? accounts[0].id : ''),
        to_account_id: '',
        receipt_url: `receipt:${receiptId}`,
        receipt_name: fileName,
        is_tax_deductible: extractedData.isTaxDeductible,
        tax_category: extractedData.isTaxDeductible ? extractedData.taxCategory : ''
      });
      toast.success('Receipt saved & transaction created!');
      haptic();
      if (onReceiptProcessed) onReceiptProcessed();
      onClose();
    } catch (error) {
      toast.error(error.message || 'Failed to create transaction from receipt');
    } finally { setSaving(false); }
  };

  const handleAttachExisting = async () => {
    if (!selectedTxId) {
      toast.error('Select a transaction to attach to');
      return;
    }
    try {
      const tx = recentTransactions.find(t => t.id === selectedTxId);
      if (tx) {
        const receiptId = await saveReceipt(imageUri);
        await updateTransaction(selectedTxId, {
          receipt_url: `receipt:${receiptId}`,
          receipt_name: fileName,
        });
        toast.success(`Receipt attached to "${tx.notes || tx.category}"!`);
        haptic();
        if (onReceiptProcessed) onReceiptProcessed();
        onClose();
      }
    } catch {
      toast.error('Failed to attach receipt');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Receipt attachment & entry" maxWidth="760px">
      <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>Attach your receipt and enter its details below. Use Read receipt to recognize English text on this device. Review every field before saving. The OCR engine and language model need internet on first use.</p>
      {imageUri && <div style={{ marginBottom: 16 }}>
        <button className="btn btn-secondary" disabled={isProcessing || saving} onClick={async () => {
          const generation = ++scanGeneration.current;
          setIsProcessing(true); setReviewed(false);
          try {
            const result = await recognizeReceipt(imageUri, (status, progress) => { if (generation === scanGeneration.current) setOcrStatus(`${status} ${Math.round((progress || 0) * 100)}%`); });
            if (generation !== scanGeneration.current) return;
            setOcrText(result.text); setExtractedData(current => ({ ...current, amount: result.amount, merchant: result.merchant, date: result.date || current.date }));
            setOcrStatus(`Recognition complete (${Math.round(result.confidence)}% confidence). Check the amount, date and merchant.`);
          } catch { if (generation === scanGeneration.current) setOcrStatus('Recognition unavailable. Reconnect and retry, or enter the receipt details manually.'); }
          finally { if (generation === scanGeneration.current) setIsProcessing(false); }
        }}>Read receipt</button>
        <p role="status">{ocrStatus}</p>
        {ocrText && <details><summary>Recognized text</summary><pre style={{ whiteSpace: 'pre-wrap' }}>{ocrText}</pre></details>}
        <label><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} /> I checked the amount, date, merchant and account against the receipt.</label>
      </div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        
        {/* Upload Zone */}
        {!imageUri ? (
          <div
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault();
              if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                handleFileProcess(e.dataTransfer.files[0]);
              }
            }}
            onClick={() => fileInputRef.current && fileInputRef.current.click()}
            style={{
              padding: '2.5rem 1.5rem',
              borderRadius: 16,
              border: '2px dashed rgba(129,140,248,0.3)',
              background: 'rgba(129,140,248,0.03)',
              textAlign: 'center',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.85rem',
              transition: 'all 0.2s'
            }}
          >
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(129,140,248,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Camera size={26} style={{ color: '#818cf8' }} />
            </div>
            <div>
              <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'Inter, sans-serif' }}>
                Upload or Drop Receipt Image
              </div>
              <div style={{ fontSize: '0.75rem', color: '#888', marginTop: 4 }}>
                Supports PNG, JPG, WebP. Compressed on-device for light storage.
              </div>
            </div>
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              style={{ display: 'none' }}
              onChange={e => {
                if (e.target.files && e.target.files[0]) {
                  handleFileProcess(e.target.files[0]);
                }
              }}
            />
          </div>
        ) : (
          /* Image Preview & Details Grid */
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.2fr)', gap: '1.25rem' }}>
            {/* Left: Thumbnail & Retake */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{
                position: 'relative',
                borderRadius: 12,
                overflow: 'hidden',
                border: '1px solid rgba(255,255,255,0.1)',
                background: '#000',
                maxHeight: 340,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <img
                  src={imageUri}
                  alt="Receipt Preview"
                  style={{ width: '100%', height: 'auto', maxHeight: 340, objectFit: 'contain' }}
                />
                <button
                  onClick={() => { setImageUri(null); }}
                  style={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    background: 'rgba(0,0,0,0.7)',
                    border: 'none',
                    borderRadius: '50%',
                    padding: 6,
                    color: '#fff',
                    cursor: 'pointer'
                  }}
                >
                  <X size={16} />
                </button>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#777' }}>
                <span>{fileName}</span>
                <span>{fileSize}</span>
              </div>
            </div>

            {/* Right: Mode & Form */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {/* Mode Toggle */}
              <div style={{ display: 'flex', gap: '0.5rem', background: 'rgba(255,255,255,0.03)', padding: 3, borderRadius: 10 }}>
                <button
                  type="button"
                  onClick={() => setMode('new')}
                  style={{
                    flex: 1,
                    padding: '0.45rem',
                    borderRadius: 8,
                    border: 'none',
                    background: mode === 'new' ? 'rgba(74,222,128,0.15)' : 'transparent',
                    color: mode === 'new' ? '#4ade80' : '#888',
                    fontWeight: 600,
                    fontSize: '0.78rem',
                    cursor: 'pointer'
                  }}
                >
                  Create New
                </button>
                <button
                  type="button"
                  onClick={() => setMode('existing')}
                  style={{
                    flex: 1,
                    padding: '0.45rem',
                    borderRadius: 8,
                    border: 'none',
                    background: mode === 'existing' ? 'rgba(129,140,248,0.15)' : 'transparent',
                    color: mode === 'existing' ? '#818cf8' : '#888',
                    fontWeight: 600,
                    fontSize: '0.78rem',
                    cursor: 'pointer'
                  }}
                >
                  Link to Existing
                </button>
              </div>

              {mode === 'new' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', fontSize: '0.72rem', color: '#888', marginBottom: 2 }}>Amount ({getCurrencyLabel()})</label>
                      <input
                        type="number"
                        step="0.01"
                        value={extractedData.amount}
                        onChange={e => setExtractedData({ ...extractedData, amount: e.target.value })}
                        style={{ width: '100%', padding: '0.55rem', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#4ade80', fontWeight: 700 }}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', fontSize: '0.72rem', color: '#888', marginBottom: 2 }}>Date</label>
                      <input
                        type="date"
                        value={extractedData.date}
                        onChange={e => setExtractedData({ ...extractedData, date: e.target.value })}
                        style={{ width: '100%', padding: '0.55rem', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.72rem', color: '#888', marginBottom: 2 }}>Merchant / Note</label>
                    <input
                      type="text"
                      value={extractedData.merchant}
                      onChange={e => setExtractedData({ ...extractedData, merchant: e.target.value })}
                      style={{ width: '100%', padding: '0.55rem', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', fontSize: '0.72rem', color: '#888', marginBottom: 2 }}>Category</label>
                      <input
                        type="text"
                        value={extractedData.category}
                        onChange={e => setExtractedData({ ...extractedData, category: e.target.value })}
                        style={{ width: '100%', padding: '0.55rem', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', fontSize: '0.72rem', color: '#888', marginBottom: 2 }}>Account</label>
                      <select
                        value={selectedAccountId}
                        onChange={e => setSelectedAccountId(e.target.value)}
                        style={{ width: '100%', padding: '0.55rem', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
                      >
                        {accounts.map(a => (
                          <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Tax Deductible Checkbox */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: 4 }}>
                    <input
                      type="checkbox"
                      id="taxDedCheck"
                      checked={extractedData.isTaxDeductible}
                      onChange={e => setExtractedData({ ...extractedData, isTaxDeductible: e.target.checked })}
                      style={{ accentColor: '#4ade80' }}
                    />
                    <label htmlFor="taxDedCheck" style={{ fontSize: '0.78rem', color: '#ddd', cursor: 'pointer' }}>
                      Mark as Tax Deductible (Auditable)
                    </label>
                  </div>

                  <button
                    onClick={handleCreateTransaction}
                    disabled={!reviewed || saving || isProcessing}
                    style={{
                      marginTop: '0.5rem',
                      padding: '0.75rem',
                      borderRadius: 10,
                      background: 'linear-gradient(135deg, #4ade80, #22c55e)',
                      border: 'none',
                      color: 'var(--bg-void)',
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontFamily: 'Inter, sans-serif'
                    }}
                  >
                    + Save Transaction with Receipt
                  </button>
                </div>
              ) : (
                /* Mode: Link to Existing */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <label style={{ fontSize: '0.75rem', color: '#aaa' }}>Choose a recent transaction:</label>
                  <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {recentTransactions.map(tx => (
                      <div
                        key={tx.id}
                        onClick={() => setSelectedTxId(tx.id)}
                        style={{
                          padding: '0.6rem 0.75rem',
                          borderRadius: 8,
                          background: selectedTxId === tx.id ? 'rgba(129,140,248,0.18)' : 'rgba(255,255,255,0.02)',
                          border: `1px solid ${selectedTxId === tx.id ? '#818cf8' : 'rgba(255,255,255,0.06)'}`,
                          cursor: 'pointer',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}
                      >
                        <div>
                          <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>{tx.notes || tx.category}</div>
                          <div style={{ fontSize: '0.68rem', color: '#777' }}>{tx.date} • {tx.category}</div>
                        </div>
                        <div style={{ fontSize: '0.84rem', fontWeight: 700, color: tx.type === 'Income' ? '#4ade80' : '#f0f0f5' }}>
                          {formatCurrency(tx.amount)}
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={handleAttachExisting}
                    style={{
                      padding: '0.75rem',
                      borderRadius: 10,
                      background: 'linear-gradient(135deg, #818cf8, #a78bfa)',
                      border: 'none',
                      color: '#fff',
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontFamily: 'Inter, sans-serif'
                    }}
                  >
                    Attach to Selected Transaction
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </Modal>
  );
}
