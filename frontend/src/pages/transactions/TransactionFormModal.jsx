import { TYPE_COLOR, TYPE_BG } from './constants';
import { getCategories, autoCategorize } from './categories';
import { Repeat, X, Brain, Zap } from 'lucide-react';
import Modal from '../../components/Modal';
import FuturisticDropdown from '../../components/FuturisticDropdown';
import CurrencyInput from '../../components/CurrencyInput';
import ReceiptUpload from '../../components/ReceiptUpload';
import SMSParserBox from '../../components/SMSParserBox';
import getCategoryEmoji from '../../utils/categoryEmoji';
import { getFrequentTemplates } from '../../utils/noteMemory';
import toast from 'react-hot-toast';
import { haptic } from '../../utils/format';
import { formatCurrency, getCurrencyLabel } from '../../utils/format';

// Transactions → add / edit form (amount, accounts, category with auto-suggest, note memory, tags, splits, receipt, SMS paste, recurring).
export default function TransactionFormModal({ accountOptions, accounts, catContainerRef, catDropOpen, editMode, formData, handleApplySMS, handleSubmit, isModalOpen, isRecurring, noteContainerRef, noteDropOpen, rememberedNotes, saveTemplate, setCatDropOpen, setFormData, setIsModalOpen, setIsRecurring, setNoteDropOpen, toAccountOptions, transactions, uniqueCategories }) {
  return (
    <Modal isOpen={isModalOpen} onClose={()=>setIsModalOpen(false)} title={editMode ? '✏️ Edit Transaction' : '+ New Transaction'}>
      <datalist id="cat-options">{uniqueCategories.map(c=><option key={c} value={c}/>)}</datalist>
      <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
        {!editMode && <SMSParserBox accounts={accounts} onApply={handleApplySMS} />}
        {!editMode && (() => {
          const freqList = getFrequentTemplates(transactions, 6);
          if (!freqList.length) return null;
          return (
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
              <div style={{ display: 'flex', gap: '0.4rem', overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 2 }}>
                {freqList.map(tpl => (
                  <button
                    key={tpl.key}
                    type="button"
                    onClick={() => {
                      haptic(15);
                      setFormData(f => ({
                        ...f,
                        type: tpl.type || 'Expense',
                        amount: tpl.amount || f.amount,
                        category: tpl.category || f.category,
                        notes: tpl.notes || tpl.label || '',
                        from_account_id: tpl.from_account_id || f.from_account_id,
                        to_account_id: tpl.to_account_id ? `account_${tpl.to_account_id}` : f.to_account_id,
                      }));
                      toast.success(`⚡ Filled: ${tpl.label} · ${formatCurrency(tpl.amount)}`, { duration: 2200 });
                    }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      padding: '0.32rem 0.65rem',
                      borderRadius: 999,
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.09)',
                      color: 'var(--text-primary)',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}
                  >
                    <span>{getCategoryEmoji(tpl.category)}</span>
                    <span>{tpl.label}</span>
                    <span style={{ color: tpl.type === 'Income' ? 'var(--mm-success)' : 'var(--mm-warning)', fontWeight: 700, fontSize: '0.68rem' }}>
                      {formatCurrency(tpl.amount)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Type selector */}
        <div>
          <label style={{ display:'block', marginBottom:'0.5rem', fontSize:'0.82rem', color:'var(--text-secondary)' }}>Type</label>
          <div style={{ display:'flex', gap:'0.5rem' }}>
            {['Expense','Income','Transfer'].map(t=>(
              <button key={t} type="button" onClick={()=>setFormData(f=>{
                let nextTo = f.to_account_id || '';
                if (t === 'Transfer') {
                  const rawId = String(nextTo).replace(/^account_/, '');
                  if (!String(nextTo).startsWith('loan_')) {
                    const fallbackAcc = accounts.find(a => String(a.id) !== String(f.from_account_id)) || accounts[0];
                    const chosenId = (rawId && String(rawId) !== String(f.from_account_id)) ? rawId : (fallbackAcc?.id || rawId);
                    nextTo = chosenId ? `account_${chosenId}` : '';
                  }
                } else if (t === 'Income') {
                  if (String(nextTo).startsWith('loan_')) nextTo = accounts[0]?.id || '';
                  else nextTo = String(nextTo).replace(/^account_/, '') || accounts[0]?.id || '';
                }
                return { ...f, type: t, to_account_id: nextTo };
              })}
                style={{ flex:1, padding:'0.6rem', borderRadius:8, border:'none', cursor:'pointer', fontSize:'0.78rem', fontWeight:600, transition:'all 0.15s',
                  background: formData.type===t ? TYPE_BG[t] : 'rgba(255,255,255,0.04)',
                  color: formData.type===t ? TYPE_COLOR[t] : '#555',
                  borderBottom: formData.type===t ? `2px solid ${TYPE_COLOR[t]}` : '2px solid transparent' }}>
                {t==='Expense'?'💸':t==='Income'?'💰':'🔄'} {t}
              </button>
            ))}
          </div>
        </div>

        {/* Amount + Date row */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.875rem' }}>
          <div>
            <label style={{ display:'block', marginBottom:'0.45rem', fontSize:'0.82rem', color:'var(--text-secondary)' }}>{`Amount (${getCurrencyLabel()})`}</label>
            <CurrencyInput required value={formData.amount} onChange={v=>setFormData(f=>({...f,amount:v}))}/>
          </div>
          {!isRecurring && (
            <div>
              <label style={{ display:'block', marginBottom:'0.45rem', fontSize:'0.82rem', color:'var(--text-secondary)' }}>Date</label>
              <input type="date" required value={formData.date} onChange={e=>setFormData(f=>({...f,date:e.target.value}))} style={{ width:'100%' }}/>
            </div>
          )}
          {isRecurring && (
            <div>
              <label style={{ display:'block', marginBottom:'0.45rem', fontSize:'0.82rem', color:'var(--text-secondary)' }}>Day of Month (1–28)</label>
              <input type="number" inputMode="numeric" min="1" max="28" required value={formData.day_of_month} onChange={e=>setFormData(f=>({...f,day_of_month:parseInt(e.target.value)||1}))} style={{ width:'100%' }}/>
            </div>
          )}
        </div>

        {/* Foreign currency converter (optional) */}
        {!isRecurring && (
          <div style={{ background:'rgba(0,245,255,0.04)', border:'1px solid rgba(0,245,255,0.12)', borderRadius:10, padding:'0.75rem 1rem' }}>
            <div style={{ fontSize:'0.72rem', letterSpacing:'1.5px', color:'var(--text-muted)', marginBottom:'0.5rem' }}>💱 FOREIGN CURRENCY (optional)</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.5rem' }}>
              <div>
                <label style={{ display:'block', marginBottom:'0.3rem', fontSize:'0.78rem', color:'var(--text-secondary)' }}>Foreign Amount</label>
                <input type="number" inputMode="decimal" min="0" step="any" placeholder="e.g. 100"
                  value={formData._foreignAmt || ''}
                  onChange={e => {
                    const famt = parseFloat(e.target.value) || 0;
                    const cur = formData._foreignCur || 'USD';
                    // Try to get rate from cached exchange rates
                    try {
                      const rates = JSON.parse(localStorage.getItem('vm_fx_rates') || '{}');
                      const baseCur = (localStorage.getItem('vm_currency') || 'LKR').toUpperCase();
                      const baseRate = rates[baseCur] || 1;
                      const fRate = rates[cur] || 1;
                      const converted = famt > 0 ? parseFloat(((famt / fRate) * baseRate).toFixed(2)) : 0;
                      setFormData(f => ({ ...f, _foreignAmt: e.target.value, _foreignCur: cur, amount: converted || f.amount }));
                    } catch { setFormData(f => ({ ...f, _foreignAmt: e.target.value })); }
                  }}
                  style={{ width:'100%', fontSize:'0.85rem' }}
                />
              </div>
              <div>
                <label style={{ display:'block', marginBottom:'0.3rem', fontSize:'0.78rem', color:'var(--text-secondary)' }}>Currency</label>
                <select value={formData._foreignCur || 'USD'}
                  onChange={e => setFormData(f => ({ ...f, _foreignCur: e.target.value }))}
                  style={{ width:'100%', background:'rgba(0,0,0,0.3)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, padding:'0.5rem', color:'var(--text-primary)', fontSize:'0.85rem' }}>
                  {['USD','EUR','GBP','AUD','CAD','SGD','JPY','INR','AED','MYR','CHF','CNY'].map(c => <option key={c} value={c} style={{ background:'#0a0a1a' }}>{c}</option>)}
                </select>
              </div>
            </div>
            {formData._foreignAmt > 0 && <div style={{ fontSize:'0.7rem', color:'var(--cyan,#00f5ff)', marginTop:'0.3rem' }}>→ Converted: {getCurrencyLabel()} {formData.amount?.toLocaleString()}</div>}
          </div>
        )}

        {/* From / To accounts */}
        {formData.type !== 'Income' && (
          <div>
            <label style={{ display:'block', marginBottom:'0.45rem', fontSize:'0.82rem', color:'var(--text-secondary)' }}>From Account</label>
            <FuturisticDropdown options={accountOptions} value={formData.from_account_id} onChange={v=>setFormData(f=>({...f,from_account_id:v}))}/>
          </div>
        )}
        {formData.type === 'Income' && (
          <div>
            <label style={{ display:'block', marginBottom:'0.45rem', fontSize:'0.82rem', color:'var(--text-secondary)' }}>To Account</label>
            <FuturisticDropdown options={accountOptions} value={formData.to_account_id} onChange={v=>setFormData(f=>({...f,to_account_id:v}))}/>
          </div>
        )}
        {formData.type === 'Transfer' && (
          <div>
            <label style={{ display:'block', marginBottom:'0.45rem', fontSize:'0.82rem', color:'var(--text-secondary)' }}>To (Account or Loan)</label>
            <FuturisticDropdown options={toAccountOptions} value={formData.to_account_id} onChange={v=>setFormData(f=>({...f,to_account_id:v}))}/>
          </div>
        )}
        {formData.type === 'Transfer' && (
          <div>
            <label style={{ display:'block', marginBottom:'0.45rem', fontSize:'0.82rem', color:'var(--text-secondary)' }}>{`Transfer Fee (${getCurrencyLabel()})`}</label>
            <CurrencyInput value={formData.fee_amount} onChange={v=>setFormData(f=>({...f,fee_amount:v}))}/>
            <label style={{ display: 'block', marginTop: 12 }}>Amount received in destination currency (required for different currencies)</label>
            <CurrencyInput value={formData.destination_amount || ''} onChange={v => setFormData(f => ({ ...f, destination_amount: v }))} />
          </div>
        )}

        {/* Category */}

        {formData.type === 'Expense' && (
          <label style={{ display:'flex', alignItems:'center', gap:'0.75rem', padding:'0.75rem 1rem', background:'rgba(255,255,255,0.03)', borderRadius:10, cursor:'pointer' }}>
            <input type="checkbox" checked={formData.isSplit} onChange={e=>setFormData(f=>({...f, isSplit: e.target.checked}))}/>
            <span style={{ fontSize:'0.85rem' }}>Split Transaction</span>
          </label>
        )}

        {formData.isSplit && formData.type === 'Expense' ? (
          <div style={{ display:'flex', flexDirection:'column', gap:'0.75rem' }}>
            <label style={{ display:'block', fontSize:'0.82rem', color:'var(--text-secondary)' }}>Splits</label>
            {formData.splits.map((split, idx) => (
              <div key={idx} style={{ display:'flex', gap:'0.5rem', alignItems:'center' }}>
                <div style={{ flex:2, position:'relative' }}>
                  <input value={split.category} onChange={e => {
                    const newSplits = [...formData.splits];
                    newSplits[idx].category = e.target.value;
                    setFormData({...formData, splits: newSplits});
                  }} placeholder="Category" style={{ width:'100%', padding:'0.6rem' }} />
                </div>
                <div style={{ flex:1 }}>
                  <input type="number" inputMode="decimal" value={split.amount} onChange={e => {
                    const newSplits = [...formData.splits];
                    newSplits[idx].amount = Number(e.target.value);
                    setFormData({...formData, splits: newSplits});
                  }} placeholder="Amount" style={{ width:'100%', padding:'0.6rem' }} />
                </div>
                {formData.splits.length > 2 && (
                  <button type="button" onClick={() => {
                    const newSplits = formData.splits.filter((_, i) => i !== idx);
                    setFormData({...formData, splits: newSplits});
                  }} style={{ background:'none', border:'none', color:'var(--mm-danger)', cursor:'pointer' }}><X size={16}/></button>
                )}
              </div>
            ))}
            <button type="button" onClick={() => {
              setFormData({...formData, splits: [...formData.splits, {category:'', amount:0}]});
            }} style={{ alignSelf:'flex-start', padding:'0.4rem 0.8rem', background:'rgba(255,255,255,0.1)', color:'#fff', border:'none', borderRadius:8, cursor:'pointer' }}>+ Add Split</button>
            {(() => {
              const total = Math.round(formData.splits.reduce((s, c) => s + (Number(c.amount) || 0), 0) * 100) / 100;
              const isMatch = Math.abs(total - Number(formData.amount)) < 0.01;
              return (
                <div style={{ color: isMatch ? 'var(--mm-success)' : 'var(--mm-danger)', fontSize:'0.8rem' }}>
                  Splits total: {total} / {formData.amount}
                  {!isMatch && ' (Amounts must match)'}
                </div>
              );
            })()}
          </div>
        ) : (
          <div style={{ position:'relative' }} ref={catContainerRef}>

          <label style={{ display:'block', marginBottom:'0.45rem', fontSize:'0.82rem', color:'var(--text-secondary)' }}>Category</label>
          <div style={{ position:'relative' }}>
            <input
              value={formData.category}
              onChange={e => { setFormData(f => ({...f, category: e.target.value})); setCatDropOpen(true); }}
              onFocus={() => setCatDropOpen(true)}
              placeholder="e.g. Food, Rent, Salary…"
              autoComplete="off"
              style={{ width:'100%', paddingRight: formData.category ? '2.5rem' : undefined }}
            />
            {formData.category && (
              <span style={{ position:'absolute', right:'0.75rem', top:'50%', transform:'translateY(-50%)', fontSize:'1.2rem', pointerEvents:'none' }}>
                {getCategoryEmoji(formData.category)}
              </span>
            )}
          </div>
          {/* Autocomplete dropdown */}
          {catDropOpen && (() => {
            const q = (formData.category || '').toLowerCase();
            const used = uniqueCategories.filter(c => c.toLowerCase().includes(q) && c !== formData.category);
            const suggested = getCategories()
              .map(c => c.split(' ').slice(1).join(' '))
              .filter(c => c.toLowerCase().includes(q) && c !== formData.category && !used.includes(c));
            const all = [...used, ...suggested].slice(0, 8);
            if (all.length === 0) return null;
            return (
              <div style={{
                position:'absolute', left:0, right:0, top:'100%', zIndex:20,
                marginTop:4, background:'var(--hud-bg, var(--bg-surface))', border:'1px solid var(--border-subtle, rgba(255,255,255,0.08))',
                borderRadius:10, overflow:'hidden', boxShadow:'0 8px 24px rgba(0,0,0,0.4)',
                maxHeight:200, overflowY:'auto', WebkitOverflowScrolling:'touch'
              }}>
                {all.map(c => (
                  <button key={c} type="button"
                    onClick={() => { setFormData(f => ({...f, category: c})); setCatDropOpen(false); }}
                    style={{
                      display:'flex', alignItems:'center', gap:'0.5rem', width:'100%',
                      padding:'0.65rem 0.875rem', border:'none', background:'transparent',
                      color:'var(--text-primary, #f0f0f5)', fontSize:'0.85rem', cursor:'pointer',
                      textAlign:'left', fontFamily:'inherit', minHeight:44,
                      borderBottom:'1px solid rgba(255,255,255,0.04)'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(74,222,128,0.08)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <span style={{ fontSize:'1.1rem', flexShrink:0 }}>{getCategoryEmoji(c) || '📋'}</span>
                    {c}
                    {used.includes(c) && <span style={{ marginLeft:'auto', fontSize:'0.65rem', color:'var(--text-muted)', opacity:0.7 }}>used before</span>}
                  </button>
                ))}
              </div>
            );
          })()}
          {/* Quick-pick chips */}
          <div style={{ display:'flex', flexWrap:'wrap', gap:'0.35rem', marginTop:'0.5rem' }}>
            {getCategories().filter(c => formData.type==='Income' ? ['💰 Salary','💼 Business','🐷 Savings'].includes(c) : !['💰 Salary','💼 Business'].includes(c)).slice(0,8).map(c=>(
              <button key={c} type="button" onClick={()=>{ setFormData(f=>({...f,category:c.split(' ').slice(1).join(' ')})); setCatDropOpen(false); }}
                style={{ padding:'0.2rem 0.65rem', borderRadius:20, border:`1px solid ${formData.category===c.split(' ').slice(1).join(' ')?'rgba(74,222,128,0.5)':'rgba(255,255,255,0.07)'}`, background: formData.category===c.split(' ').slice(1).join(' ')?'rgba(74,222,128,0.1)':'rgba(255,255,255,0.03)', cursor:'pointer', fontSize:'0.72rem', color:'var(--text-secondary)', transition:'all 0.12s' }}>
                {c}
              </button>
            ))}
          </div>
        </div>
        )}

        {/* Notes / Memo with Note Memory & Autocomplete */}
        <div ref={noteContainerRef} style={{ position:'relative' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.45rem' }}>
            <label style={{ margin:0, fontSize:'0.82rem', color:'var(--text-secondary)', display:'flex', alignItems:'center', gap:'0.35rem' }}>
              <Brain size={13} style={{ color:'var(--cyan, #4ade80)' }} />
              <span>Notes / Memo</span>
              <span style={{ fontSize:'0.68rem', color:'var(--text-muted)' }}>(with memory)</span>
            </label>
            {formData.notes && (
              <span style={{ fontSize:'0.7rem', color:'var(--text-muted)' }}>{formData.notes.length} chars</span>
            )}
          </div>

          <div style={{ position:'relative' }}>
            <input
              type="text"
              value={formData.notes}
              onChange={e => {
                const val = e.target.value;
                setNoteDropOpen(true);
                setFormData(f => {
                  const suggested = autoCategorize(val);
                  if (suggested && (!f.category || f.category === '')) {
                    return { ...f, notes: val, category: suggested, _autoCat: suggested };
                  }
                  return { ...f, notes: val };
                });
              }}
              onFocus={() => setNoteDropOpen(true)}
              placeholder="Type or pick remembered note (e.g. Keells, Uber, Rent)..."
              autoComplete="off"
              style={{ width:'100%', paddingRight: formData.notes ? '2rem' : undefined }}
            />
            {formData.notes && (
              <button
                type="button"
                onClick={() => setFormData(f => ({ ...f, notes: '' }))}
                style={{ position:'absolute', right:'0.75rem', top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', padding:2 }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Live Autocomplete Dropdown from Note Memory */}
          {noteDropOpen && (() => {
            const q = (formData.notes || '').toLowerCase().trim();
            const matches = rememberedNotes.filter(n => (!q || n.text.toLowerCase().includes(q)) && n.text.toLowerCase() !== q).slice(0, 6);
            if (matches.length === 0) return null;
            return (
              <div style={{
                position:'absolute', left:0, right:0, top:'100%', zIndex:30,
                marginTop:4, background:'var(--hud-bg, #252540)', border:'1px solid rgba(74,222,128,0.25)',
                borderRadius:10, overflow:'hidden', boxShadow:'0 8px 30px rgba(0,0,0,0.5)',
                maxHeight:220, overflowY:'auto', WebkitOverflowScrolling:'touch'
              }}>
                <div style={{ padding:'0.4rem 0.75rem', fontSize:'0.65rem', letterSpacing:'1.5px', color:'var(--text-muted)', textTransform:'uppercase', background:'rgba(255,255,255,0.02)', borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
                  🧠 Remembered Notes
                </div>
                {matches.map(item => (
                  <button
                    key={item.text}
                    type="button"
                    onClick={() => {
                      haptic();
                      setFormData(f => ({
                        ...f,
                        notes: item.text,
                        category: (!f.category || f.category === '') && item.category ? item.category : f.category,
                        _autoCat: item.category || null,
                      }));
                      setNoteDropOpen(false);
                    }}
                    style={{
                      display:'flex', alignItems:'center', justifyContent:'space-between', width:'100%',
                      padding:'0.6rem 0.85rem', border:'none', background:'transparent',
                      color:'var(--text-primary, #f0f0f5)', fontSize:'0.82rem', cursor:'pointer',
                      textAlign:'left', fontFamily:'inherit', minHeight:40,
                      borderBottom:'1px solid rgba(255,255,255,0.04)',
                      transition:'background 0.12s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(74,222,128,0.08)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      <span style={{ fontSize:'0.9rem' }}>📝</span>
                      <span style={{ fontWeight:500 }}>{item.text}</span>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:'0.4rem', flexShrink:0 }}>
                      {item.category && (
                        <span style={{ fontSize:'0.68rem', padding:'0.1rem 0.45rem', borderRadius:6, background:'rgba(255,255,255,0.05)', color:'var(--text-secondary)' }}>
                          {item.category}
                        </span>
                      )}
                      <span style={{ fontSize:'0.65rem', color:'var(--cyan, #4ade80)' }}>
                        {item.count}x
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            );
          })()}

          {/* Auto-category suggestion badge */}
          {formData._autoCat && formData.category === formData._autoCat && (
            <div style={{ display:'flex', alignItems:'center', gap:'0.4rem', marginTop:'0.35rem' }}>
              <span style={{ fontSize:'0.7rem', color:'var(--cyan, #4ade80)' }}>
                ✨ Auto-categorized as <b>{formData._autoCat}</b>
              </span>
              <button type="button" onClick={() => setFormData(f => ({ ...f, category: '', _autoCat: null }))}
                style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', fontSize:'0.7rem' }}>✕ clear</button>
            </div>
          )}

          {/* Quick-pick Note Memory Chips */}
          {rememberedNotes.length > 0 && (
            <div style={{ marginTop:'0.5rem' }}>
              <div style={{ fontSize:'0.68rem', color:'var(--text-muted)', marginBottom:'0.3rem', display:'flex', alignItems:'center', gap:'0.25rem' }}>
                <span>Quick memory notes:</span>
              </div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:'0.35rem' }}>
                {rememberedNotes.slice(0, 8).map(n => (
                  <button
                    key={n.text}
                    type="button"
                    onClick={() => {
                      haptic();
                      setFormData(f => ({
                        ...f,
                        notes: n.text,
                        category: (!f.category || f.category === '') && n.category ? n.category : f.category,
                        _autoCat: n.category || null,
                      }));
                      setNoteDropOpen(false);
                    }}
                    style={{
                      padding:'0.2rem 0.65rem', borderRadius:20,
                      border:`1px solid ${formData.notes === n.text ? 'rgba(74,222,128,0.5)' : 'rgba(255,255,255,0.07)'}`,
                      background: formData.notes === n.text ? 'rgba(74,222,128,0.12)' : 'rgba(255,255,255,0.03)',
                      cursor:'pointer', fontSize:'0.72rem', color: formData.notes === n.text ? '#4ade80' : 'var(--text-secondary)',
                      transition:'all 0.12s'
                    }}
                  >
                    {n.text}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Tags */}
        <div>
          <label style={{ display:'block', marginBottom:'0.45rem', fontSize:'0.82rem', color:'var(--text-secondary)' }}>Tags (comma separated)</label>
          <input 
            value={(formData.tags || []).join(', ')} 
            onChange={e=>setFormData(f=>({ ...f, tags: e.target.value.split(',').map(t=>t.trim()).filter(Boolean) }))} 
            placeholder="e.g. vacation, gift, tax-deductible" 
            style={{ width:'100%' }}
          />
        </div>

        {/* Tax Deductible / Business Expense Toggle */}
        <label
          style={{
            display:'flex', alignItems:'center', gap:'0.75rem', padding:'0.65rem 1rem',
            background: formData.tax_deductible ? 'rgba(74,222,128,0.1)' : 'rgba(255,255,255,0.03)',
            borderRadius:10, border:`1px solid ${formData.tax_deductible ? 'rgba(74,222,128,0.35)' : 'rgba(255,255,255,0.08)'}`,
            cursor:'pointer', fontSize:'0.82rem', color: formData.tax_deductible ? '#4ade80' : 'var(--text-secondary)' }}
        >
          <input
            type="checkbox"
            checked={!!formData.tax_deductible}
            onChange={e => setFormData(f => ({ ...f, tax_deductible: e.target.checked }))}
            style={{ width:16, height:16, accentColor:'var(--mm-success)' }}
          />
          <span>🧾 Mark as Tax-Deductible / Business Expense</span>
        </label>

        {/* Receipt Photo */}
        {!isRecurring && (
          <ReceiptUpload
            existingUrl={formData.receipt_url || null}
            existingThumb={formData.receipt_thumb || null}
            onUploaded={(url, thumb) => setFormData(f => ({ ...f, receipt_url: url || '', receipt_thumb: thumb || '' }))}
          />
        )}

        {/* Recurring toggle */}
        {!editMode && (
          <label style={{ display:'flex', alignItems:'center', gap:'0.75rem', padding:'0.75rem 1rem', background:'rgba(129,140,248,0.07)', borderRadius:10, border:'1px solid rgba(129,140,248,0.18)', cursor:'pointer' }}>
            <input type="checkbox" checked={isRecurring} onChange={e=>setIsRecurring(e.target.checked)}/>
            <Repeat size={15} color="#818cf8"/>
            <span style={{ fontSize:'0.85rem' }}>Set as Recurring (auto-creates monthly)</span>
          </label>
        )}

        {/* Buttons */}
        <div style={{ display:'flex', justifyContent:'space-between', gap:'0.75rem', marginTop:'0.25rem', flexWrap:'wrap' }}>
          <button type="button" onClick={saveTemplate}
            style={{ background:'rgba(0,245,255,0.07)', border:'1px solid rgba(0,245,255,0.2)', borderRadius:8, padding:'0.45rem 0.875rem', color:'#00f5ff', cursor:'pointer', fontSize:'0.78rem' }}>
            ⭐ Save as Template
          </button>
          <div style={{ display:'flex', gap:'0.75rem' }}>
            <button type="button" className="btn btn-secondary" onClick={()=>setIsModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary">
              {isRecurring ? '💾 Save Rule' : editMode ? '✓ Update' : '+ Save'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
