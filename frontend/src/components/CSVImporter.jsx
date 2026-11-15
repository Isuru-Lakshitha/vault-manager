import { useState, useRef } from 'react';
import 'framer-motion';
import { Upload, CheckCircle } from 'lucide-react';
import { createTransaction } from '../utils/api';
import getCategoryEmoji from '../utils/categoryEmoji';
import toast from 'react-hot-toast';
import { formatCurrency } from '../utils/format';
import { toYMD, todayYMD } from '../utils/dates';



const guessColumn = (headers, keywords) => {
  const h = headers.map(h => h.toLowerCase().trim());
  for (const kw of keywords) {
    const i = h.findIndex(col => col.includes(kw));
    if (i !== -1) return i;
  }
  return -1;
};

const parseCSV = (text) => {
  const lines = text.trim().split('\n').filter(l => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
  const rows = lines.slice(1).map(line => {
    const cols = line.match(/(".*?"|[^,]+)(?=,|$)/g) || line.split(',');
    return cols.map(c => (c || '').replace(/"/g, '').trim());
  });
  return { headers, rows };
};

const CSVImporter = ({ accounts, onImported, onClose }) => {
  const fileRef = useRef();
  const [step, setStep] = useState('upload'); // upload | map | preview | done
  const [parsed, setParsed] = useState(null);
  const [mapping, setMapping] = useState({ date: -1, description: -1, amount: -1, type: -1 });
  const [preview, setPreview] = useState([]);
  const [importing, setImporting] = useState(false);
  const [accountId, setAccountId] = useState(accounts[0]?.id || '');
  const [defaultType, setDefaultType] = useState('Expense');

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const { headers, rows } = parseCSV(ev.target.result);
      if (!headers.length) { toast.error('Could not parse CSV'); return; }
      setParsed({ headers, rows });
      // Auto-detect columns
      setMapping({
        date: guessColumn(headers, ['date', 'datetime', 'time', 'txn date']),
        description: guessColumn(headers, ['description', 'desc', 'narration', 'details', 'particulars', 'name']),
        amount: guessColumn(headers, ['amount', 'debit', 'credit', 'value', 'sum']),
        type: guessColumn(headers, ['type', 'txn type', 'transaction type', 'dr/cr']),
      });
      setStep('map');
    };
    reader.readAsText(file);
  };

  const buildPreview = () => {
    if (!parsed) return;
    const rows = parsed.rows.slice(0, 50).map(row => {
      const dateRaw = mapping.date >= 0 ? row[mapping.date] : '';
      const desc    = mapping.description >= 0 ? row[mapping.description] : 'Imported';
      const amtRaw  = mapping.amount >= 0 ? row[mapping.amount] : '0';
      const typeRaw = mapping.type >= 0 ? row[mapping.type] : defaultType;

      // Parse date
      let date = new Date(dateRaw);
      if (isNaN(date)) { const parts = dateRaw.split(/[/.-]/); date = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`); }
      const dateStr = isNaN(date) ? todayYMD() : toYMD(date);

      const amount = Math.abs(parseFloat(amtRaw.replace(/[^0-9.-]/g, '')) || 0);
      const txType = /credit|cr|income|deposit/i.test(typeRaw) ? 'Income' : 'Expense';

      return { date: dateStr, category: desc.substring(0, 30), amount, type: txType,
        from_account_id: txType === 'Expense' ? accountId : '',
        to_account_id: txType === 'Income' ? accountId : '',
        notes: desc };
    }).filter(r => r.amount > 0);
    setPreview(rows);
    setStep('preview');
  };

  const doImport = async () => {
    setImporting(true);
    let success = 0, fail = 0;
    for (const tx of preview) {
      try { await createTransaction(tx); success++; }
      catch { fail++; }
    }
    setImporting(false);
    setStep('done');
    toast.success(`Imported ${success} transactions${fail > 0 ? `, ${fail} failed` : ''}`);
    if (onImported) onImported();
  };

  
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'1.25rem' }}>
      {step === 'upload' && (
        <div>
          <div onClick={() => fileRef.current.click()}
            style={{ border:'2px dashed rgba(74,222,128,0.3)', borderRadius:12, padding:'3rem', textAlign:'center', cursor:'pointer', background:'rgba(74,222,128,0.03)', transition:'all 0.2s' }}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); fileRef.current.files = e.dataTransfer.files; handleFile({ target: e.dataTransfer }); }}>
            <Upload size={36} style={{ color:'#4ade80', marginBottom:'0.75rem', opacity:0.7 }}/>
            <p style={{ fontFamily:'Inter, sans-serif', color:'var(--text-secondary)', margin:0, fontSize:'0.85rem' }}>DRAG & DROP YOUR BANK CSV</p>
            <p style={{ fontFamily:'Inter, sans-serif', color:'var(--text-muted)', margin:'0.5rem 0 0', fontSize:'0.72rem' }}>OR CLICK TO BROWSE</p>
          </div>
          <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display:'none' }} onChange={handleFile}/>
          <p style={{ fontSize:'0.72rem', color:'var(--text-muted)', fontFamily:'Inter, sans-serif', marginTop:'0.75rem', textAlign:'center' }}>
            Supports most bank CSV exports. Expected columns: Date, Description, Amount.
          </p>
        </div>
      )}

      {step === 'map' && parsed && (
        <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
          <div style={{ fontFamily:'Inter, sans-serif', fontSize:'0.7rem', color:'#4ade80', letterSpacing:'2px' }}>
            DETECTED {parsed.headers.length} COLUMNS, {parsed.rows.length} ROWS
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.75rem' }}>
            {[
              { key:'date', label:'Date Column' },
              { key:'description', label:'Description Column' },
              { key:'amount', label:'Amount Column' },
              { key:'type', label:'Type Column (optional)' },
            ].map(({ key, label }) => (
              <div key={key}>
                <label style={{ display:'block', marginBottom:'0.4rem', fontSize:'0.8rem' }}>{label}</label>
                <select value={mapping[key]} onChange={e => setMapping({...mapping, [key]: +e.target.value})} style={{ width:'100%', padding:'0.6rem', fontSize:'0.82rem' }}>
                  <option value={-1}>— Not mapped —</option>
                  {parsed.headers.map((h, i) => <option key={i} value={i}>{h} (col {i+1})</option>)}
                </select>
              </div>
            ))}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.75rem' }}>
            <div>
              <label style={{ display:'block', marginBottom:'0.4rem', fontSize:'0.8rem' }}>Target Account</label>
              <select value={accountId} onChange={e => setAccountId(e.target.value)} style={{ width:'100%', padding:'0.6rem' }}>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display:'block', marginBottom:'0.4rem', fontSize:'0.8rem' }}>Default Type (if no type column)</label>
              <select value={defaultType} onChange={e => setDefaultType(e.target.value)} style={{ width:'100%', padding:'0.6rem' }}>
                <option value="Expense">Expense</option>
                <option value="Income">Income</option>
              </select>
            </div>
          </div>
          <div style={{ display:'flex', gap:'0.75rem', justifyContent:'flex-end' }}>
            <button className="btn btn-secondary" onClick={() => setStep('upload')}>Back</button>
            <button className="btn btn-primary" onClick={buildPreview} disabled={mapping.date < 0 || mapping.amount < 0}>Preview Import</button>
          </div>
        </div>
      )}

      {step === 'preview' && (
        <div>
          <div style={{ fontFamily:'Inter, sans-serif', fontSize:'0.7rem', color:'#4ade80', letterSpacing:'2px', marginBottom:'0.75rem' }}>
            PREVIEW — {preview.length} TRANSACTIONS TO IMPORT
          </div>
          <div style={{ maxHeight:300, overflowY:'auto', border:'1px solid rgba(255,255,255,0.07)', borderRadius:8 }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontFamily:'Inter, sans-serif', fontSize:'0.75rem' }}>
              <thead><tr style={{ borderBottom:'1px solid rgba(74,222,128,0.15)', background:'rgba(0,0,0,0.4)' }}>
                {['Date','Description','Amount','Type'].map(h => <th key={h} style={{ padding:'0.5rem 0.75rem', textAlign:'left', color:'var(--text-muted)', fontWeight:600 }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {preview.map((tx, i) => (
                  <tr key={i} style={{ borderBottom:'1px solid rgba(255,255,255,0.04)', background:i%2===0?'rgba(255,255,255,0.01)':'transparent' }}>
                    <td style={{ padding:'0.45rem 0.75rem', color:'var(--text-secondary)' }}>{tx.date}</td>
                    <td style={{ padding:'0.45rem 0.75rem', color:'#aaa', maxWidth:180, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{getCategoryEmoji(tx.category)} {tx.category}</td>
                    <td style={{ padding:'0.45rem 0.75rem', color: tx.type==='Income'?'#4ade80':'#f87171', fontWeight:600 }}>{tx.type==='Income'?'+':'-'}{formatCurrency(tx.amount)}</td>
                    <td style={{ padding:'0.45rem 0.75rem' }}><span style={{ fontSize:'0.68rem', background:tx.type==='Income'?'rgba(16,185,129,0.15)':'rgba(244,63,94,0.15)', color:tx.type==='Income'?'#4ade80':'#f87171', padding:'0.15rem 0.4rem', borderRadius:4 }}>{tx.type}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display:'flex', gap:'0.75rem', justifyContent:'flex-end', marginTop:'1rem' }}>
            <button className="btn btn-secondary" onClick={() => setStep('map')}>Back</button>
            <button className="btn btn-primary" onClick={doImport} disabled={importing || preview.length === 0}>
              {importing ? 'Importing...' : `Import ${preview.length} Transactions`}
            </button>
          </div>
        </div>
      )}

      {step === 'done' && (
        <div style={{ textAlign:'center', padding:'2rem' }}>
          <CheckCircle size={48} style={{ color:'#4ade80', marginBottom:'1rem' }}/>
          <div style={{ fontFamily:'Inter, sans-serif', color:'#4ade80', fontWeight:700, fontSize:'1.1rem' }}>IMPORT COMPLETE</div>
          <button className="btn btn-primary" style={{ marginTop:'1.5rem' }} onClick={onClose}>Done</button>
        </div>
      )}
    </div>
  );
};

export default CSVImporter;