import { Download, RefreshCw, Upload, FileSpreadsheet, Zap, Camera, Calendar } from 'lucide-react';

// Transactions → 'Tools & Export' dropdown: export CSV / Excel, import CSV or a bank statement, automated rules.
export default function ToolsExportMenu({ handleExportCSV, handleExportExcel, setCsvModalOpen, setToolsMenuOpen }) {
  return (
    <>
      <div style={{
        position: 'absolute',
        right: 0,
        top: 'calc(100% + 6px)',
        zIndex: 999,
        minWidth: 200,
        background: 'var(--bg-surface, #131722)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: 12,
        boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
        padding: '0.4rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
      }}>
        <button
          type="button"
          onClick={() => { setToolsMenuOpen(false); window.dispatchEvent(new Event('vm:open-receipt-scanner')); }}
          style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.55rem 0.75rem', background: 'transparent', border: 'none', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.8rem', textAlign: 'left', cursor: 'pointer' }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <Camera size={14} color="#a78bfa" /> Scan Receipt
        </button>
        <button
          type="button"
          onClick={() => { setToolsMenuOpen(false); window.dispatchEvent(new Event('vm:open-cash-calendar')); }}
          style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.55rem 0.75rem', background: 'transparent', border: 'none', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.8rem', textAlign: 'left', cursor: 'pointer' }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <Calendar size={14} color="#38bdf8" /> Cash Flow Calendar
        </button>
        <button
          type="button"
          onClick={() => { setToolsMenuOpen(false); window.dispatchEvent(new Event('vm:open-rules-manager')); }}
          style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.55rem 0.75rem', background: 'transparent', border: 'none', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.8rem', textAlign: 'left', cursor: 'pointer' }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <Zap size={14} color="#4ade80" /> Automated Rules
        </button>
        <button
          type="button"
          onClick={() => { setToolsMenuOpen(false); window.dispatchEvent(new Event('vm:open-bank-sync')); }}
          style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.55rem 0.75rem', background: 'transparent', border: 'none', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.8rem', textAlign: 'left', cursor: 'pointer' }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <RefreshCw size={14} color="#818cf8" /> Import bank statement
        </button>
        <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '4px 0' }} />
        <button
          type="button"
          onClick={() => { setToolsMenuOpen(false); setCsvModalOpen(true); }}
          style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.55rem 0.75rem', background: 'transparent', border: 'none', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.8rem', textAlign: 'left', cursor: 'pointer' }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <Upload size={14} /> Import CSV
        </button>
        <button
          type="button"
          onClick={() => { setToolsMenuOpen(false); handleExportCSV(); }}
          style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.55rem 0.75rem', background: 'transparent', border: 'none', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.8rem', textAlign: 'left', cursor: 'pointer' }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <Download size={14} /> Export CSV
        </button>
        <button
          type="button"
          onClick={() => { setToolsMenuOpen(false); handleExportExcel(); }}
          style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.55rem 0.75rem', background: 'transparent', border: 'none', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.8rem', textAlign: 'left', cursor: 'pointer' }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <FileSpreadsheet size={14} /> Export Excel (.xlsx)
        </button>
      </div>
    </>
  );
}
