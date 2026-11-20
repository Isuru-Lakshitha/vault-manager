import { saveDraft } from '../utils/offlineDrafts.js';
import { auth } from '../utils/firebase';
import { useState, useEffect, useRef, useMemo } from 'react';
import { createTransaction, fetchAccounts, fetchTransactions, getCache } from '../utils/api';
import Modal from './Modal';
import CurrencyInput from './CurrencyInput';
import SMSParserBox from './SMSParserBox';
import getCategoryEmoji from '../utils/categoryEmoji';
import { formatCurrency, getCurrencyLabel, haptic } from '../utils/format';
import { predictCategory, learnMerchantRule } from '../utils/autoCategorize';
import { getRememberedNotes, getFrequentTemplates } from '../utils/noteMemory';
import { Brain, Sparkles, Zap } from 'lucide-react';
import toast from 'react-hot-toast';
import { todayYMD } from '../utils/dates';
import { getLastAccountId, rememberAccountId } from '../utils/lastAccount';

const TYPE_COLOR = { Income: 'var(--success)', Expense: 'var(--danger)', Transfer: '#818cf8' };
const TYPE_BG    = { Income: 'rgba(16,185,129,0.12)', Expense: 'rgba(244,63,94,0.12)', Transfer: 'rgba(129,140,248,0.14)' };
const QUICK_CATS = ['🍔 Food','🚗 Transport','🏠 Rent','⚡ Utilities','🛍️ Shopping','💊 Health','💰 Salary','💼 Business','📱 Phone','🎭 Entertainment','✈️ Travel','🐷 Savings'];

const QuickAdd = ({ open, onClose }) => {
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [saving, setSaving] = useState(false);
  const [autoCatSuggestion, setAutoCatSuggestion] = useState(null);
  const [noteDropOpen, setNoteDropOpen] = useState(false);
  const noteContainerRef = useRef(null);

  const [form, setForm] = useState({
    type: 'Expense', amount: 0,
    date: todayYMD(),
    category: '', notes: '', from_account_id: '', to_account_id: '',
    fee_amount: 0, destination_amount: ''
  });

  useEffect(() => {
    if (!open) return;
    fetchAccounts().then(all => {
      const a = all.filter(account => !account.archived);
      setAccounts(a);
      if (a.length > 0) setForm(f => ({
        ...f,
        from_account_id: getLastAccountId('quickadd:from', a),
        to_account_id: getLastAccountId('quickadd:to', a),
      }));
    }).catch(() => {});

    const cached = getCache('transactions');
    if (cached && cached.length) {
      setTransactions(cached);
    } else {
      fetchTransactions().then(txs => setTransactions(txs || [])).catch(() => {});
    }

    setForm(f => ({ ...f, date: todayYMD() }));
    setAutoCatSuggestion(null);
    setNoteDropOpen(false);
  }, [open]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (noteContainerRef.current && !noteContainerRef.current.contains(e.target)) {
        setNoteDropOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  const rememberedNotes = useMemo(() => {
    return getRememberedNotes(transactions, form.type);
  }, [transactions, form.type]);

  const frequentTemplates = useMemo(() => {
    return getFrequentTemplates(transactions, 6);
  }, [transactions]);

  // Live Duplicate & Spend Spike Guard
  const { duplicateWarning, spikeWarning } = useMemo(() => {
    const amt = parseFloat(form.amount) || 0;
    if (amt <= 0 || !transactions.length) return { duplicateWarning: null, spikeWarning: null };

    const activeTxs = transactions.filter(tx => !tx.reversed_at && !tx.reversal_of && !tx.is_transfer_fee);

    const sameDayDupe = activeTxs.find(tx =>
      tx.date === form.date &&
      tx.type === form.type &&
      Math.abs((parseFloat(tx.amount) || 0) - amt) < 0.01 &&
      (
        !form.category ||
        (tx.category || '').toLowerCase() === form.category.toLowerCase() ||
        (form.notes && (tx.notes || '').toLowerCase() === form.notes.toLowerCase())
      )
    );

    let spike = null;
    if (form.type === 'Expense' && form.category && amt >= 3000) {
      const catTxns = activeTxs.filter(
        tx => tx.type === 'Expense' && (tx.category || '').toLowerCase() === form.category.toLowerCase() && tx.amount > 0
      );
      if (catTxns.length >= 3) {
        const avg = catTxns.reduce((s, t) => s + Number(t.amount), 0) / catTxns.length;
        if (avg > 0 && amt >= avg * 3.5) {
          spike = { avg: Math.round(avg), ratio: (amt / avg).toFixed(1) };
        }
      }
    }

    return { duplicateWarning: sameDayDupe || null, spikeWarning: spike };
  }, [transactions, form.amount, form.date, form.type, form.category, form.notes]);

  const matchingNotes = useMemo(() => {
    if (!form.notes.trim()) return rememberedNotes.slice(0, 8);
    const q = form.notes.toLowerCase().trim();
    return rememberedNotes.filter(n => n.text.toLowerCase().includes(q)).slice(0, 8);
  }, [rememberedNotes, form.notes]);

  const handleSelectNote = (item) => {
    haptic();
    setNoteDropOpen(false);
    const nextForm = { ...form, notes: item.text };
    if (item.category) {
      nextForm.category = item.category;
      setAutoCatSuggestion(item.category);
    }
    if (!form.amount && item.lastAmount > 0) {
      nextForm.amount = item.lastAmount;
    }
    setForm(nextForm);
  };

  const handleSelectTemplate = (tpl) => {
    haptic(15);
    setForm(f => ({
      ...f,
      type: tpl.type || 'Expense',
      amount: tpl.amount || f.amount,
      category: tpl.category || f.category,
      notes: tpl.notes || tpl.label || '',
      from_account_id: tpl.from_account_id || f.from_account_id,
      to_account_id: tpl.to_account_id || f.to_account_id,
    }));
    if (tpl.category) setAutoCatSuggestion(tpl.category);
    toast.success(`⚡ Filled: ${tpl.label} · ${formatCurrency(tpl.amount)}`, { duration: 2200 });
  };

  const handleNotesChange = (e) => {
    const val = e.target.value;
    const prediction = predictCategory(val, form.type);
    if (prediction && (!form.category || form.category === autoCatSuggestion)) {
      // Strip emoji from category name for form.category
      const catName = prediction.category.split(' ').slice(1).join(' ') || prediction.category;
      setForm(f => ({ ...f, notes: val, category: catName }));
      setAutoCatSuggestion(catName);
    } else {
      setForm(f => ({ ...f, notes: val }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.amount) { toast.error('Enter an amount'); return; }
    if (form.type === 'Transfer' && String(form.from_account_id) === String(form.to_account_id)) {
      toast.error('Select different source and destination accounts');
      return;
    }
    setSaving(true);
    try {
      const { destination_amount, fee_amount, ...restForm } = form;
      const data = {
        ...restForm,
        category: form.type === 'Transfer' ? (form.category || 'Transfer') : form.category,
        ...(form.type === 'Transfer' && Number(fee_amount) > 0 ? { fee_amount: Number(fee_amount) } : {}),
        ...(form.type === 'Transfer' && destination_amount !== '' && Number(destination_amount) > 0 ? { destination_amount: Number(destination_amount) } : {}),
        is_tax_deductible: form.type !== 'Transfer' && !!form.tax_deductible,
        tax_category: form.type !== 'Transfer' ? (form.tax_category || (form.tax_deductible ? 'Business' : null)) : null
      };
      const offline = !navigator.onLine;
      if (offline) saveDraft(auth.currentUser?.uid, data);
      else await createTransaction(data);
      if (form.notes && form.category && form.type !== 'Transfer') {
        learnMerchantRule(form.notes, form.category);
      }
      if (form.type !== 'Income') rememberAccountId('quickadd:from', form.from_account_id);
      if (form.type !== 'Expense') rememberAccountId('quickadd:to', form.to_account_id);
      toast.success(offline ? 'Draft saved on this device. Sync it when online.' : 'Transaction saved!');
      haptic();
      onClose();
      setForm(f => ({ ...f, amount: 0, category: '', notes: '', fee_amount: 0, destination_amount: '' }));
      setAutoCatSuggestion(null);
    } catch (error) { toast.error(error.message || 'Failed to save'); }
    finally { setSaving(false); }
  };

  const handleApplySMS = (data) => {
    setForm(f => ({
      ...f,
      type: data.type || 'Expense',
      amount: data.amount || 0,
      notes: data.merchant || '',
      category: data.category || '',
      date: data.date || f.date,
      ...(data.matchedAccountId ? (data.type === 'Income' ? { to_account_id: data.matchedAccountId } : { from_account_id: data.matchedAccountId }) : {})
    }));
    if (data.category) setAutoCatSuggestion(data.category);
  };

  return (
    <Modal isOpen={open} onClose={onClose} title="⚡ Quick Add">
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        {/* Bank SMS & Voice 1-Tap Parser */}
        <SMSParserBox accounts={accounts} onApply={handleApplySMS} />

        {/* 1-Tap Frequent Transactions Quick-Repeat Chips */}
        {frequentTemplates.length > 0 && (
          <div style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 11,
            padding: '0.5rem 0.65rem',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '0.35rem',
              fontSize: '0.68rem',
              color: 'var(--text-muted)',
              fontWeight: 700,
              letterSpacing: '0.4px'
            }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--mm-warning)' }}>
                <Zap size={11} /> 1-TAP FREQUENT REPEAT
              </span>
              <span>Tap to fill all fields</span>
            </div>
            <div style={{
              display: 'flex',
              gap: '0.4rem',
              overflowX: 'auto',
              WebkitOverflowScrolling: 'touch',
              paddingBottom: 2
            }}>
              {frequentTemplates.map((tpl) => {
                const active = form.notes === tpl.notes && Number(form.amount) === Number(tpl.amount);
                return (
                  <button
                    key={tpl.key}
                    type="button"
                    onClick={() => handleSelectTemplate(tpl)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      padding: '0.32rem 0.65rem',
                      borderRadius: 999,
                      background: active ? 'rgba(74,222,128,0.16)' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${active ? 'rgba(74,222,128,0.5)' : 'rgba(255,255,255,0.09)'}`,
                      color: active ? '#4ade80' : '#f0f0f5',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <span>{getCategoryEmoji(tpl.category)}</span>
                    <span>{tpl.label}</span>
                    <span style={{
                      color: tpl.type === 'Income' ? 'var(--mm-success)' : 'var(--mm-warning)',
                      fontWeight: 700,
                      fontSize: '0.68rem'
                    }}>
                      {formatCurrency(tpl.amount)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Type */}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {['Expense','Income','Transfer'].map(t => (
            <button key={t} type="button" onClick={() => setForm(f => ({
              ...f,
              type: t,
              ...(t === 'Transfer' && accounts.length > 1 && String(f.from_account_id) === String(f.to_account_id)
                ? { to_account_id: accounts.find(a => String(a.id) !== String(f.from_account_id))?.id || f.to_account_id }
                : {})
            }))}
              style={{ flex: 1, padding: '0.6rem', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600,
                background: form.type === t ? TYPE_BG[t] : 'rgba(255,255,255,0.04)',
                color: form.type === t ? TYPE_COLOR[t] : '#555',
                borderBottom: form.type === t ? `2px solid ${TYPE_COLOR[t]}` : '2px solid transparent' }}
            >{t === 'Expense' ? '💸 Expense' : t === 'Income' ? '💰 Income' : '🔄 Transfer'}</button>
          ))}
        </div>

        {/* Amount + Date */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{`Amount (${getCurrencyLabel()})`}</label>
            <CurrencyInput aria-label="Transaction amount" required value={form.amount} onChange={v => setForm(f => ({ ...f, amount: v }))} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Date</label>
            <input type="date" required value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} style={{ width: '100%' }} />
          </div>
        </div>

        {/* Smart Duplicate / Spike Guard Alerts */}
        {duplicateWarning && (
          <div style={{
            padding: '0.55rem 0.75rem',
            borderRadius: 10,
            background: 'rgba(251,191,36,0.12)',
            border: '1px solid rgba(251,191,36,0.4)',
            color: 'var(--mm-warning)',
            fontSize: '0.73rem',
            lineHeight: 1.4
          }}>
            ⚠️ <strong>Possible Duplicate:</strong> You already logged {formatCurrency(duplicateWarning.amount)} for{' '}
            <strong>{duplicateWarning.notes || duplicateWarning.category || duplicateWarning.type}</strong> on {duplicateWarning.date}.
          </div>
        )}
        {spikeWarning && !duplicateWarning && (
          <div style={{
            padding: '0.55rem 0.75rem',
            borderRadius: 10,
            background: 'rgba(248,113,113,0.1)',
            border: '1px solid rgba(248,113,113,0.35)',
            color: 'var(--mm-danger)',
            fontSize: '0.73rem',
            lineHeight: 1.4
          }}>
            📈 <strong>Unusual Spend Spike ({spikeWarning.ratio}× usual):</strong> Your average {form.category} expense is{' '}
            {formatCurrency(spikeWarning.avg)}. Double-check for an extra zero!
          </div>
        )}

        {/* Account */}
        {accounts.length > 0 && (
          form.type === 'Transfer' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>From Account</label>
                  <select
                    aria-label="From Account"
                    value={form.from_account_id}
                    onChange={e => setForm(f => ({ ...f, from_account_id: e.target.value }))}
                    style={{ width: '100%' }}
                  >
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({formatCurrency(a.balance, a.currency ? { currency: a.currency } : undefined)})</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>To Account</label>
                  <select
                    aria-label="To Account"
                    value={form.to_account_id}
                    onChange={e => setForm(f => ({ ...f, to_account_id: e.target.value }))}
                    style={{ width: '100%' }}
                  >
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({formatCurrency(a.balance, a.currency ? { currency: a.currency } : undefined)})</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>Transfer Fee (optional)</label>
                  <CurrencyInput aria-label="Transfer fee" value={form.fee_amount} onChange={v => setForm(f => ({ ...f, fee_amount: v }))} />
                </div>
                {(() => {
                  const fromAcc = accounts.find(a => String(a.id) === String(form.from_account_id));
                  const toAcc = accounts.find(a => String(a.id) === String(form.to_account_id));
                  if (fromAcc && toAcc && fromAcc.currency && toAcc.currency && fromAcc.currency !== toAcc.currency) {
                    return (
                      <div>
                        <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.75rem', color: '#818cf8' }}>{`Received (${toAcc.currency})`}</label>
                        <CurrencyInput aria-label="Received amount" required value={form.destination_amount} onChange={v => setForm(f => ({ ...f, destination_amount: v }))} />
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
            </div>
          ) : (
            <div>
              <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{form.type === 'Income' ? 'To Account' : 'From Account'}</label>
              <select
                value={form.type === 'Income' ? form.to_account_id : form.from_account_id}
                onChange={e => setForm(f => form.type === 'Income' ? { ...f, to_account_id: e.target.value } : { ...f, from_account_id: e.target.value })}
                style={{ width: '100%' }}
              >
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({formatCurrency(a.balance, a.currency ? { currency: a.currency } : undefined)})</option>)}
              </select>
            </div>
          )
        )}

        {/* Notes / Merchant (with Note Memory & auto-category prediction) */}
        <div ref={noteContainerRef} style={{ position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              <span>Merchant / Note</span>
              <Brain size={13} style={{ color: 'var(--mm-success)' }} />
            </label>
            {rememberedNotes.length > 0 && (
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                {rememberedNotes.length} remembered
              </span>
            )}
          </div>

          {/* Quick-pick chips from memory */}
          {rememberedNotes.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: '4px', marginBottom: '0.45rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', fontSize: '0.68rem', color: 'var(--text-muted)', flexShrink: 0 }}>
                <Sparkles size={11} style={{ color: 'var(--mm-success)' }} />
                <span>Quick:</span>
              </div>
              {rememberedNotes.slice(0, 7).map(item => {
                const isSelected = form.notes.toLowerCase().trim() === item.text.toLowerCase().trim();
                return (
                  <button
                    key={item.text}
                    type="button"
                    onClick={() => handleSelectNote(item)}
                    style={{
                      padding: '0.2rem 0.55rem',
                      borderRadius: 14,
                      border: `1px solid ${isSelected ? 'rgba(74,222,128,0.5)' : 'rgba(255,255,255,0.08)'}`,
                      background: isSelected ? 'rgba(74,222,128,0.15)' : 'rgba(255,255,255,0.03)',
                      color: isSelected ? '#4ade80' : 'var(--text-secondary)',
                      fontSize: '0.72rem',
                      fontWeight: isSelected ? 600 : 400,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                      transition: 'all 0.12s ease',
                    }}
                    title={`${item.text} (${item.count}×)`}
                  >
                    {item.text}
                  </button>
                );
              })}
            </div>
          )}

          <div style={{ position: 'relative' }}>
            <input
              value={form.notes}
              onChange={handleNotesChange}
              onFocus={() => setNoteDropOpen(true)}
              placeholder="e.g. Uber, Keells, Starbucks, Netflix..."
              style={{ width: '100%', paddingRight: form.notes ? '2rem' : undefined }}
            />
            {form.notes && (
              <button
                type="button"
                onClick={() => { setForm(f => ({ ...f, notes: '' })); setNoteDropOpen(false); }}
                style={{
                  position: 'absolute',
                  right: 8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: 4,
                  fontSize: '0.8rem',
                }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Autocomplete Dropdown */}
          {noteDropOpen && matchingNotes.length > 0 && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                marginTop: 4,
                background: 'rgba(26,26,46,0.98)',
                border: '1px solid rgba(74,222,128,0.3)',
                borderRadius: 12,
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                zIndex: 60,
                maxHeight: 200,
                overflowY: 'auto',
                backdropFilter: 'blur(16px)',
                padding: '0.35rem',
              }}
            >
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', padding: '0.25rem 0.5rem', letterSpacing: '0.5px' }}>
                SUGGESTED FROM MEMORY
              </div>
              {matchingNotes.map(item => (
                <div
                  key={item.text}
                  onClick={() => handleSelectNote(item)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.45rem 0.65rem',
                    borderRadius: 8,
                    cursor: 'pointer',
                    transition: 'background 0.12s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', minWidth: 0 }}>
                    <Brain size={13} style={{ color: 'var(--mm-success)', flexShrink: 0 }} />
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.text}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
                    {item.category && (
                      <span style={{ fontSize: '0.68rem', padding: '0.1rem 0.4rem', borderRadius: 6, background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}>
                        {item.category}
                      </span>
                    )}
                    <span style={{ fontSize: '0.68rem', color: 'var(--mm-success)', fontWeight: 600 }}>
                      {item.count}×
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {autoCatSuggestion && form.category === autoCatSuggestion && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.35rem' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--mm-success)' }}>
                ✨ Auto-categorized as <strong>{form.category}</strong>
              </span>
              <button
                type="button"
                onClick={() => { setForm(f => ({ ...f, category: '' })); setAutoCatSuggestion(null); }}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.7rem' }}
              >
                ✕ clear
              </button>
            </div>
          )}
        </div>

        {form.type !== 'Transfer' && (
          <>
            {/* Category */}
            <div>
              <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Category</label>
              <input value={form.category} onChange={e => { setForm(f => ({ ...f, category: e.target.value })); setAutoCatSuggestion(null); }}
                placeholder="Type or pick below…" style={{ width: '100%', marginBottom: '0.5rem' }} />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                {QUICK_CATS.map(c => {
                  const name = c.split(' ').slice(1).join(' ');
                  return (
                    <button key={c} type="button" onClick={() => { setForm(f => ({ ...f, category: name })); setAutoCatSuggestion(null); }}
                      style={{ padding: '0.2rem 0.6rem', borderRadius: 20, border: `1px solid ${form.category === name ? 'rgba(74,222,128,0.5)' : 'rgba(255,255,255,0.07)'}`, background: form.category === name ? 'rgba(74,222,128,0.1)' : 'rgba(255,255,255,0.03)', cursor: 'pointer', fontSize: '0.72rem', color: 'var(--text-secondary)', transition: 'all 0.1s' }}
                    >{c}</button>
                  );
                })}
              </div>
            </div>

            {/* Tax Deductible / Business Expense Toggle */}
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                padding: '0.55rem 0.75rem',
                borderRadius: 10,
                background: form.tax_deductible ? 'rgba(129,140,248,0.12)' : 'rgba(255,255,255,0.025)',
                border: `1px solid ${form.tax_deductible ? 'rgba(129,140,248,0.35)' : 'rgba(255,255,255,0.06)'}`,
                cursor: 'pointer',
                fontSize: '0.78rem',
                color: form.tax_deductible ? '#818cf8' : 'var(--text-secondary)' }}
            >
              <input
                type="checkbox"
                checked={!!form.tax_deductible}
                onChange={e => setForm(f => ({ ...f, tax_deductible: e.target.checked }))}
                style={{ width: 15, height: 15, accentColor: '#818cf8' }}
              />
              <span>🧾 Mark as Tax-Deductible / Business Expense</span>
            </label>
          </>
        )}

        <button type="submit" disabled={saving} className="btn btn-primary" style={{ marginTop: '0.5rem' }}>
          {saving ? 'Saving…' : '+ Save Transaction'}
        </button>
      </form>
    </Modal>
  );
};

export default QuickAdd;
