import { removeItemWithUndo, itemLabel } from '../components/undoToast';
import { PageHeader, StatCard, StatGrid } from '../components/ui';
import { InsightLoans } from '../components/InsightPanels';
import { useState, useEffect } from 'react';
import useLiveData from '../utils/useLiveData';
import { fetchLoans, createLoan, payLoan, updateLoan, deleteLoan, fetchAccounts, fetchTransactions, createTransaction, fetchRecurringTransactions, createRecurringTransaction, updateRecurringTransaction, fetchIous, saveIou, deleteIou, getCache } from '../utils/api';
import { Plus, Edit2, Trash2, Landmark, Wallet, ChevronDown, ChevronUp, History, Users, Share2, Check } from 'lucide-react';
import PageWrapper from '../components/PageWrapper';
import TiltWrapper from '../components/TiltWrapper';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import SkeletonLoader from '../components/SkeletonLoader';
import FuturisticDropdown from '../components/FuturisticDropdown';
import DebtPayoffPlanner from '../components/DebtPayoffPlanner';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import CurrencyInput from '../components/CurrencyInput';
import { formatCurrency, getCurrencyLabel, haptic } from '../utils/format';
import { todayYMD } from '../utils/dates';

const IouTrackerTab = ({ accounts = [], onReload }) => {
  const [ious, setIous] = useState(() => getCache('ious') || []);
  const [person, setPerson] = useState('');
  const [amount, setAmount] = useState(0);
  const [direction, setDirection] = useState('owed_to_me'); // 'owed_to_me' | 'i_owe'
  const [reason, setReason] = useState('');
  const [splitTotal, setSplitTotal] = useState(0);
  const [splitCount, setSplitCount] = useState(2);
  const [selectedAccountId, setSelectedAccountId] = useState(accounts[0]?.id || '');
  const [iouViewFilter, setIouViewFilter] = useState('active'); // 'active' | 'all' | 'settled' | 'people'
  const [partPayId, setPartPayId] = useState(null);
  const [partPayAmt, setPartPayAmt] = useState(0);

  useEffect(() => {
    fetchIous().then(setIous).catch(() => {});
  }, []);

  useLiveData(() => {
    fetchIous().then(setIous).catch(() => {});
  });

  const handleAddIou = async (e) => {
    e.preventDefault();
    if (!person.trim() || amount <= 0) {
      toast.error('Enter friend name and amount');
      return;
    }
    const newItem = {
      id: `iou_${Date.now()}`,
      person: person.trim(),
      amount: parseFloat(amount),
      direction,
      reason: reason.trim() || 'Shared Expense',
      date: todayYMD(),
      settled: false
    };
    setIous(prev => [newItem, ...prev]);
    setPerson('');
    setAmount(0);
    setReason('');
    setSplitTotal(0);
    haptic();
    await saveIou(newItem);
    toast.success('IOU added & synced!');
  };

  const handleSettle = async (item) => {
    const updatedItem = { ...item, settled: true };
    const targetAccId = selectedAccountId || accounts[0]?.id || '';
    if (targetAccId) {
      try {
        await createTransaction({
          type: item.direction === 'owed_to_me' ? 'Income' : 'Expense',
          amount: item.amount,
          date: todayYMD(),
          category: item.direction === 'owed_to_me' ? 'IOU Repayment' : 'Shared Bill',
          notes: `Settled IOU with ${item.person}: ${item.reason}`,
          from_account_id: item.direction === 'i_owe' ? targetAccId : '',
          to_account_id: item.direction === 'owed_to_me' ? targetAccId : ''
        });
      } catch (err) {
        toast.error(err?.message || 'Failed to log settlement transaction');
        return;
      }
    }
    setIous(prev => prev.map(x => x.id === item.id ? updatedItem : x));
    haptic();
    await saveIou(updatedItem);
    if (targetAccId) {
      toast.success(`Settled & logged ${formatCurrency(item.amount)} in account!`);
      if (onReload) onReload();
    } else {
      toast.success(`Marked settled with ${item.person}`);
    }
  };

  const handlePartialSettle = async (item) => {
    const payAmt = parseFloat(partPayAmt);
    if (!Number.isFinite(payAmt) || payAmt <= 0 || payAmt >= item.amount) {
      toast.error('Enter a partial amount less than the full balance');
      return;
    }
    const remainingAmt = parseFloat((item.amount - payAmt).toFixed(2));
    const updatedItem = {
      ...item,
      amount: remainingAmt,
      reason: `${item.reason} (Part-paid ${formatCurrency(payAmt)})`,
    };
    const targetAccId = selectedAccountId || accounts[0]?.id || '';
    if (targetAccId) {
      try {
        await createTransaction({
          type: item.direction === 'owed_to_me' ? 'Income' : 'Expense',
          amount: payAmt,
          date: todayYMD(),
          category: item.direction === 'owed_to_me' ? 'IOU Repayment' : 'Shared Bill',
          notes: `Partial IOU settlement with ${item.person}: ${item.reason}`,
          from_account_id: item.direction === 'i_owe' ? targetAccId : '',
          to_account_id: item.direction === 'owed_to_me' ? targetAccId : '',
        });
      } catch (err) {
        toast.error(err?.message || 'Failed to log partial settlement transaction');
        return;
      }
    }
    setIous(prev => prev.map(x => x.id === item.id ? updatedItem : x));
    setPartPayId(null);
    setPartPayAmt(0);
    haptic();
    await saveIou(updatedItem);
    if (targetAccId) {
      toast.success(`Logged ${formatCurrency(payAmt)} partial settlement (${formatCurrency(remainingAmt)} remaining)`);
      if (onReload) onReload();
    } else {
      toast.success(`Recorded ${formatCurrency(payAmt)} partial settlement (${formatCurrency(remainingAmt)} left)`);
    }
  };

  const handleDeleteIou = (id) => {
    const item = ious.find(x => String(x.id) === String(id));
    removeItemWithUndo({
      key: `iou:${id}`,
      label: item?.person ? `IOU with ${item.person} deleted` : 'IOU deleted',
      setItems: setIous,
      id,
      commit: () => deleteIou(id),
    });
  };

  const handleShareReminder = (item) => {
    const msg = item.direction === 'owed_to_me'
      ? `Hey ${item.person}! 👋 Quick reminder about ${formatCurrency(item.amount)} for "${item.reason}" (${item.date}). Let me know when you settle up, thanks! 🙏`
      : `Hey ${item.person}! 👋 Just noting I owe you ${formatCurrency(item.amount)} for "${item.reason}" (${item.date}). Will settle up soon!`;
    const waUrl = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(msg).catch(() => {});
    }
    window.open(waUrl, '_blank', 'noopener,noreferrer');
    toast.success('Reminder copied & opening WhatsApp!');
  };

  const activeIous = ious.filter(x => !x.settled);
  const owedToMe = activeIous.filter(x => x.direction === 'owed_to_me').reduce((s, x) => s + x.amount, 0);
  const iOwe = activeIous.filter(x => x.direction === 'i_owe').reduce((s, x) => s + x.amount, 0);

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Summary KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.85rem' }}>
        <div style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.25)', borderRadius: 14, padding: '1rem 1.2rem' }}>
          <div style={{ fontSize: '0.7rem', color: '#4ade80', fontFamily: 'Inter, sans-serif', fontWeight: 700 }}>🟢 FRIENDS OWE ME</div>
          <div style={{ fontSize: '1.55rem', fontWeight: 800, color: '#4ade80', fontFamily: 'Inter, sans-serif', marginTop: '0.2rem' }}>{formatCurrency(owedToMe)}</div>
        </div>
        <div style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)', borderRadius: 14, padding: '1rem 1.2rem' }}>
          <div style={{ fontSize: '0.7rem', color: '#f87171', fontFamily: 'Inter, sans-serif', fontWeight: 700 }}>🔴 I OWE FRIENDS</div>
          <div style={{ fontSize: '1.55rem', fontWeight: 800, color: '#f87171', fontFamily: 'Inter, sans-serif', marginTop: '0.2rem' }}>{formatCurrency(iOwe)}</div>
        </div>
        <div style={{ background: 'rgba(129,140,248,0.08)', border: '1px solid rgba(129,140,248,0.25)', borderRadius: 14, padding: '1rem 1.2rem' }}>
          <div style={{ fontSize: '0.7rem', color: '#818cf8', fontFamily: 'Inter, sans-serif', fontWeight: 700 }}>⚖️ NET IOU BALANCE</div>
          <div style={{ fontSize: '1.55rem', fontWeight: 800, color: owedToMe - iOwe >= 0 ? '#4ade80' : '#f87171', fontFamily: 'Inter, sans-serif', marginTop: '0.2rem' }}>
            {owedToMe - iOwe >= 0 ? '+' : ''}{formatCurrency(owedToMe - iOwe)}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))', gap: '1.5rem' }}>
        {/* Left: Add IOU & Bill Splitter */}
        <form onSubmit={handleAddIou} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '1.35rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          <h3 style={{ margin: 0, fontFamily: 'Inter, sans-serif', fontSize: '0.8rem', letterSpacing: '1.5px', color: 'var(--text-secondary)' }}>
            🤝 NEW IOU OR SPLIT BILL
          </h3>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {[
              { id: 'owed_to_me', label: '🟢 They Owe Me', color: '#4ade80', bg: 'rgba(74,222,128,0.12)' },
              { id: 'i_owe', label: '🔴 I Owe Them', color: '#f87171', bg: 'rgba(248,113,113,0.12)' }
            ].map(opt => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setDirection(opt.id)}
                style={{
                  flex: 1, padding: '0.55rem', borderRadius: 10, cursor: 'pointer',
                  fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: '0.78rem',
                  background: direction === opt.id ? opt.bg : 'rgba(255,255,255,0.03)',
                  color: direction === opt.id ? opt.color : 'var(--text-muted)',
                  border: `1px solid ${direction === opt.id ? opt.color : 'rgba(255,255,255,0.07)'}`
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Quick Bill Splitter helper */}
          <div style={{ background: 'rgba(129,140,248,0.06)', border: '1px dashed rgba(129,140,248,0.25)', borderRadius: 10, padding: '0.75rem' }}>
            <div style={{ fontSize: '0.7rem', color: '#818cf8', fontFamily: 'Inter, sans-serif', fontWeight: 700, marginBottom: '0.45rem' }}>
              🧮 QUICK BILL SPLITTER (OPTIONAL)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: '0.5rem', alignItems: 'center' }}>
              <CurrencyInput
                value={splitTotal}
                onChange={v => {
                  setSplitTotal(v);
                  if (v > 0 && splitCount > 0) setAmount(parseFloat((v / splitCount).toFixed(2)));
                }}
                placeholder="Total Bill"
              />
              <input
                type="number"
                min="2"
                max="50"
                value={splitCount}
                onChange={e => {
                  const cnt = Math.max(2, parseInt(e.target.value) || 2);
                  setSplitCount(cnt);
                  if (splitTotal > 0) setAmount(parseFloat((splitTotal / cnt).toFixed(2)));
                }}
                title="Number of people"
                style={{ width: '100%' }}
              />
            </div>
            {splitTotal > 0 && (
              <div style={{ fontSize: '0.72rem', color: '#4ade80', marginTop: '0.35rem', fontFamily: 'Inter, sans-serif' }}>
                ÷ {splitCount} people = <strong>{formatCurrency(splitTotal / splitCount)}</strong> per person
              </div>
            )}
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>Friend / Colleague Name</label>
            <input required value={person} onChange={e => setPerson(e.target.value)} placeholder="e.g. Kasun, Nimal" style={{ width: '100%' }} />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>{`Share Amount (${getCurrencyLabel()})`}</label>
            <CurrencyInput required value={amount} onChange={v => setAmount(v)} />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>For What? (Reason)</label>
            <input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Dinner at Pizza Hut, Trip Fuel" style={{ width: '100%' }} />
          </div>

          <button type="submit" className="btn btn-primary" style={{ marginTop: '0.25rem' }}>
            + Save IOU Record
          </button>
        </form>

        {/* Right: Active & Settled IOUs List */}
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '1.35rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h3 style={{ margin: 0, fontFamily: 'Inter, sans-serif', fontSize: '0.8rem', letterSpacing: '1.5px', color: 'var(--text-secondary)' }}>
              📋 IOU LEDGER ({activeIous.length} ACTIVE)
            </h3>
            {accounts.length > 0 && (
              <select
                value={selectedAccountId}
                onChange={e => setSelectedAccountId(e.target.value)}
                style={{ fontSize: '0.74rem', padding: '0.3rem 0.5rem', borderRadius: 8, background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)', border: '1px solid rgba(255,255,255,0.1)' }}
                title="Account for Settle Up"
              >
                {accounts.map(a => <option key={a.id} value={a.id}>Settle via: {a.name}</option>)}
              </select>
            )}
          </div>

          {ious.length > 0 && (
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
              {[
                { id: 'active', label: `Active (${activeIous.length})` },
                { id: 'all', label: `All (${ious.length})` },
                { id: 'settled', label: `Settled (${ious.length - activeIous.length})` },
                { id: 'people', label: '👥 By Person' },
              ].map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setIouViewFilter(tab.id)}
                  style={{
                    padding: '0.26rem 0.65rem',
                    borderRadius: 8,
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    fontFamily: 'Inter, sans-serif',
                    cursor: 'pointer',
                    background: iouViewFilter === tab.id ? 'rgba(129,140,248,0.16)' : 'rgba(255,255,255,0.03)',
                    color: iouViewFilter === tab.id ? '#818cf8' : 'var(--text-muted)',
                    border: iouViewFilter === tab.id ? '1px solid rgba(129,140,248,0.4)' : '1px solid rgba(255,255,255,0.07)',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}

          {ious.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif', fontSize: '0.85rem' }}>
              <Users size={36} style={{ opacity: 0.25, marginBottom: '0.5rem' }} />
              <div>No shared bills or IOUs yet. Split a bill on the left!</div>
            </div>
          ) : iouViewFilter === 'people' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
              {Object.entries(
                activeIous.reduce((acc, item) => {
                  const key = item.person.trim();
                  if (!acc[key]) acc[key] = { net: 0, count: 0 };
                  acc[key].net += item.direction === 'owed_to_me' ? item.amount : -item.amount;
                  acc[key].count += 1;
                  return acc;
                }, {})
              ).map(([personName, info]) => (
                <div key={personName} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{personName}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{info.count} active IOU{info.count > 1 ? 's' : ''}</div>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: '0.95rem', color: info.net >= 0 ? '#4ade80' : '#f87171', fontFamily: 'Inter, sans-serif' }}>
                    {info.net >= 0 ? `Owes you ${formatCurrency(info.net)}` : `You owe ${formatCurrency(Math.abs(info.net))}`}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: 420, overflowY: 'auto' }}>
              {ious
                .filter(item => {
                  if (iouViewFilter === 'active') return !item.settled;
                  if (iouViewFilter === 'settled') return item.settled;
                  return true;
                })
                .map(item => {
                const isOwed = item.direction === 'owed_to_me';
                return (
                  <div
                    key={item.id}
                    style={{
                      padding: '0.85rem 1rem',
                      borderRadius: 12,
                      background: item.settled ? 'rgba(255,255,255,0.015)' : (isOwed ? 'rgba(74,222,128,0.06)' : 'rgba(248,113,113,0.06)'),
                      border: `1px solid ${item.settled ? 'rgba(255,255,255,0.05)' : (isOwed ? 'rgba(74,222,128,0.22)' : 'rgba(248,113,113,0.22)')}`,
                      opacity: item.settled ? 0.55 : 1,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '0.75rem',
                      flexWrap: 'wrap'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-primary)', textDecoration: item.settled ? 'line-through' : 'none' }}>
                          {item.person}
                        </span>
                        <span style={{
                          fontSize: '0.62rem', fontFamily: 'Inter, sans-serif', fontWeight: 700,
                          padding: '0.12rem 0.45rem', borderRadius: 6,
                          background: isOwed ? 'rgba(74,222,128,0.16)' : 'rgba(248,113,113,0.16)',
                          color: isOwed ? '#4ade80' : '#f87171'
                        }}>
                          {item.settled ? 'SETTLED' : (isOwed ? 'OWES YOU' : 'YOU OWE')}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                        {item.reason} · <span style={{ color: 'var(--text-muted)' }}>{item.date}</span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'Inter, sans-serif', fontWeight: 800, fontSize: '0.98rem', color: isOwed ? '#4ade80' : '#f87171' }}>
                        {formatCurrency(item.amount)}
                      </span>
                      {!item.settled && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleShareReminder(item)}
                            title="Send WhatsApp / Copy Reminder"
                            style={{ padding: '0.38rem', borderRadius: 8, background: 'rgba(129,140,248,0.14)', border: '1px solid rgba(129,140,248,0.3)', color: '#818cf8', cursor: 'pointer', display: 'flex' }}
                          >
                            <Share2 size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setPartPayId(partPayId === item.id ? null : item.id);
                              setPartPayAmt(parseFloat((item.amount / 2).toFixed(2)));
                            }}
                            title="Record a partial repayment"
                            style={{ padding: '0.35rem 0.55rem', borderRadius: 8, background: 'rgba(56,189,248,0.14)', border: '1px solid rgba(56,189,248,0.35)', color: '#38bdf8', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: '0.7rem', fontWeight: 700 }}
                          >
                            Part-Pay
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSettle(item)}
                            title="Settle Up & Log Transaction"
                            style={{ padding: '0.35rem 0.65rem', borderRadius: 8, background: 'rgba(74,222,128,0.18)', border: '1px solid rgba(74,222,128,0.4)', color: '#4ade80', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: '0.72rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                          >
                            <Check size={13} /> Settle
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        onClick={() => handleDeleteIou(item.id)}
                        style={{ padding: '0.38rem', borderRadius: 8, background: 'rgba(248,113,113,0.1)', border: 'none', color: '#f87171', cursor: 'pointer', display: 'flex' }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    {partPayId === item.id && !item.settled && (
                      <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.5rem', paddingTop: '0.45rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                        <input
                          type="number"
                          step="any"
                          min="1"
                          max={item.amount - 0.01}
                          value={partPayAmt}
                          onChange={e => setPartPayAmt(e.target.value)}
                          placeholder="Partial amount"
                          style={{ flex: 1, padding: '0.3rem 0.6rem', fontSize: '0.78rem', borderRadius: 8 }}
                        />
                        <button type="button" className="btn btn-primary" style={{ padding: '0.3rem 0.65rem', fontSize: '0.74rem' }} onClick={() => handlePartialSettle(item)}>
                          Save Part-Pay
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

const EmiTab = () => {
  const [p, setP] = useState(0);
  const [r, setR] = useState(0);
  const [years, setYears] = useState(1);
  const [months, setMonths] = useState(0);

  const n = years * 12 + months;
  const rate = r / 100 / 12;
  const hasInput = p > 0 && n > 0;
  const emi = !hasInput ? 0 : rate === 0 ? p / n : p * rate * Math.pow(1 + rate, n) / (Math.pow(1 + rate, n) - 1);
  const total = emi * n;
  const interest = total - p;
  const interestPct = total > 0 ? (interest / total) * 100 : 0;

  const row = (label, value, color) => (
    <div key={label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'0.75rem 0', borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
      <span style={{ fontFamily:'Inter, sans-serif', fontSize:'0.8rem', color:'var(--text-secondary)' }}>{label}</span>
      <span style={{ fontFamily:'Inter, sans-serif', fontWeight:700, fontSize:'1rem', color }}>{value}</span>
    </div>
  );

  return (
    <motion.div initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.3 }}>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', gap:'2rem' }}>
        <div style={{ background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:16, padding:'1.5rem', display:'flex', flexDirection:'column', gap:'1rem' }}>
          <h3 style={{ fontFamily:'Inter, sans-serif', fontSize:'0.72rem', letterSpacing:'2px', color:'var(--text-secondary)', margin:0 }}>LOAN DETAILS</h3>
          <div><label style={{ display:'block', marginBottom:'0.4rem', fontSize:'0.82rem', color:'var(--text-secondary)' }}>{`Principal (${getCurrencyLabel()})`}</label>
            <CurrencyInput value={p} onChange={v => setP(v)} /></div>
          <div><label style={{ display:'block', marginBottom:'0.4rem', fontSize:'0.82rem', color:'var(--text-secondary)' }}>Annual Interest Rate (%)</label>
            <input type="number" inputMode="decimal" step="0.1" min="0" max="100" value={r} onChange={e => setR(parseFloat(e.target.value)||0)} style={{ width:'100%' }} /></div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.75rem' }}>
            <div><label style={{ display:'block', marginBottom:'0.4rem', fontSize:'0.82rem', color:'var(--text-secondary)' }}>Years</label>
              <input type="number" inputMode="numeric" min="0" max="30" value={years} onChange={e => setYears(parseInt(e.target.value)||0)} style={{ width:'100%' }} /></div>
            <div><label style={{ display:'block', marginBottom:'0.4rem', fontSize:'0.82rem', color:'var(--text-secondary)' }}>Months</label>
              <input type="number" inputMode="numeric" min="0" max="11" value={months} onChange={e => setMonths(parseInt(e.target.value)||0)} style={{ width:'100%' }} /></div>
          </div>
        </div>

        <div style={{ background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:16, padding:'1.5rem', display:'flex', flexDirection:'column', gap:'0.25rem' }}>
          <h3 style={{ fontFamily:'Inter, sans-serif', fontSize:'0.72rem', letterSpacing:'2px', color:'var(--text-secondary)', margin:'0 0 1rem' }}>RESULTS</h3>
          {!hasInput ? (
            <div style={{ color:'var(--text-muted)', fontFamily:'Inter, sans-serif', fontSize:'0.82rem', marginTop:'2rem', textAlign:'center' }}>Enter loan details to calculate</div>
          ) : (<>
            {row('Monthly EMI', formatCurrency(emi), '#4ade80')}
            {row('Total Payment', formatCurrency(total), '#f0f0f5')}
            {row('Total Interest', formatCurrency(interest), '#f87171')}
            {row('Loan Tenure', `${n} months`, '#818cf8')}
            <div style={{ marginTop:'1rem' }}>
              <div style={{ fontSize:'0.7rem', color:'var(--text-muted)', fontFamily:'Inter, sans-serif', marginBottom:'0.4rem' }}>Principal vs Interest</div>
              <div style={{ height:8, borderRadius:4, overflow:'hidden', background:'rgba(255,255,255,0.05)', display:'flex' }}>
                <motion.div initial={{ width:0 }} animate={{ width:`${100-interestPct}%` }} transition={{ duration:1 }} style={{ height:'100%', background:'#4ade80' }} />
                <motion.div initial={{ width:0 }} animate={{ width:`${interestPct}%` }} transition={{ duration:1 }} style={{ height:'100%', background:'#f87171' }} />
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.68rem', color:'var(--text-muted)', fontFamily:'Inter, sans-serif', marginTop:'0.3rem' }}>
                <span style={{ color:'#4ade80' }}>Principal {(100-interestPct).toFixed(1)}%</span>
                <span style={{ color:'#f87171' }}>Interest {interestPct.toFixed(1)}%</span>
              </div>
            </div>
          </>)}
        </div>
      </div>
    </motion.div>
  );
};

const Loans = () => {
  const [loans, setLoans] = useState(() => getCache('loans') || []);
  const [accounts, setAccounts] = useState(() => getCache('accounts') || []);
  const [transactions, setTransactions] = useState(() => getCache('transactions') || []);
  const [recurringRules, setRecurringRules] = useState(() => getCache('recurring') || []);
  const [loading, setLoading] = useState(() => !getCache('loans'));
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [currentId, setCurrentId] = useState(null);
  const [payLoanId, setPayLoanId] = useState(null);
  const [confirm, setConfirm] = useState({ open: false, id: null });
  const [activeTab, setActiveTab] = useState('loans');
  const [expandedLoanId, setExpandedLoanId] = useState(null);

  const [isOldLoan, setIsOldLoan] = useState(false);
  const [formData, setFormData] = useState({
    item_name: '', type: 'Gold Loan', principal_amount: 0, annual_interest_rate: 0,
    monthly_payment: 0,
    start_date: todayYMD(),
    last_interest_calc_date: todayYMD(),
    total_interest_paid: 0, unpaid_interest: 0
  });
  const [paymentData, setPaymentData] = useState({ amount: 0, account_id: '', date: todayYMD() });

  useEffect(() => { loadData(!!getCache('loans')); }, []);
  useLiveData(() => loadData(true));

  const loadData = async (silent) => {
    try {
      if (silent !== true) setLoading(true);
      const [lData, aData, tData, rData] = await Promise.all([
        fetchLoans(), fetchAccounts(), fetchTransactions(), fetchRecurringTransactions().catch(() => [])
      ]);
      setLoans(lData);
      setAccounts(aData);
      setTransactions(tData);
      setRecurringRules(rData || []);
      if (aData.length > 0) setPaymentData(prev => ({ ...prev, account_id: aData[0].id }));
    } catch { toast.error('Failed to load loans'); }
    finally { setLoading(false); }
  };

  const openAddModal = () => {
    setEditMode(false); setIsOldLoan(false);
    setFormData({ item_name:'', type:'Gold Loan', principal_amount:0, annual_interest_rate:0, monthly_payment:0,
      start_date:todayYMD(), last_interest_calc_date:todayYMD(), total_interest_paid:0, unpaid_interest:0, start_next_month:true });
    setIsModalOpen(true);
  };
  const openEditModal = (loan) => {
    setEditMode(true); setIsOldLoan(false); setCurrentId(loan.id);
    const curMo = todayYMD().substring(0, 7);
    setFormData({ item_name:loan.item_name, type:loan.type, principal_amount:loan.principal_amount, annual_interest_rate:loan.annual_interest_rate, monthly_payment:loan.monthly_payment||0, start_date:loan.start_date,
      last_interest_calc_date:loan.last_interest_calc_date||loan.start_date, total_interest_paid:loan.total_interest_paid||0, unpaid_interest:loan.unpaid_interest||0, start_next_month: loan.last_paid_month === curMo });
    setIsModalOpen(true);
  };

  const handleAddLoanToRecurring = async (loan) => {
    try {
      const curMo = todayYMD().substring(0, 7);
      const moInt = Math.round(((parseFloat(loan.principal_amount) || 0) * (parseFloat(loan.annual_interest_rate) || 0) / 100) / 12);
      const targetAmt = parseFloat(loan.monthly_payment) > 0 ? parseFloat(loan.monthly_payment) : moInt;
      await createRecurringTransaction({
        name: `🪙 ${loan.item_name} (${loan.type || 'Gold Loan'})`,
        type: 'Loan Payment',
        amount: targetAmt > 0 ? targetAmt : 5000,
        category: 'Gold Loan',
        frequency: 'Monthly',
        schedule_mode: 'flexible',
        flexible_window: 'Anytime',
        day_of_month: null,
        is_variable: true,
        loan_id: loan.id,
        last_applied_month: curMo,
        from_account_id: accounts[0]?.id || '',
        notes: `Monthly ${loan.type || 'Gold Loan'} payment for ${loan.item_name}`,
        paused: false,
      });
      await updateLoan(loan.id, { last_paid_month: curMo }).catch(() => {});
      haptic();
      toast.success(`🔁 Added ${loan.item_name} (Starts Next Month — marked paid for this month)!`);
      loadData(true);
    } catch {
      toast.error('Failed to add to recurring rules');
    }
  };

  const toggleLoanPaidThisMonth = async (loan, isCurrentlyPaidThisMo) => {
    try {
      const curMo = todayYMD().substring(0, 7);
      const nextVal = isCurrentlyPaidThisMo ? null : curMo;
      await updateLoan(loan.id, { last_paid_month: nextVal });
      const linkedRule = recurringRules.find(r => String(r.loan_id) === String(loan.id));
      if (linkedRule) {
        await updateRecurringTransaction(linkedRule.id, { last_applied_month: nextVal }).catch(() => {});
      }
      haptic();
      toast.success(
        isCurrentlyPaidThisMo
          ? `🔔 ${loan.item_name} marked as Due This Month`
          : `🔕 ${loan.item_name} marked as Paid (No account deduction)`
      );
      loadData(true);
    } catch {
      toast.error('Failed to update status');
    }
  };
  const openPaymentModal = (loan, presetAmount = null) => {
    setPayLoanId(loan.id);
    const interest = loan.current_accrued_interest || loan.unpaid_interest || 0;
    const defaultAmt = presetAmount !== null && presetAmount > 0 ? presetAmount : (interest > 0 ? parseFloat(interest.toFixed(2)) : 0);
    setPaymentData({ amount: defaultAmt, account_id: accounts.length > 0 ? accounts[0].id : '', date: todayYMD() });
    setIsPaymentModalOpen(true);
  };
  const quickPayLoan = (loan, amount) => {
    // Always open the manual Payment Modal so the user can choose which account to deduct from and adjust the amount
    openPaymentModal(loan, amount ? parseFloat(amount.toFixed(2)) : null);
  };
  const doDelete = () => {
    const id = confirm.id;
    const item = loans.find(x => String(x.id) === String(id));
    setConfirm({ open: false, id: null });
    removeItemWithUndo({
      key: `loan:${id}`,
      label: itemLabel(item, 'Loan deleted'),
      setItems: setLoans,
      id,
      commit: () => deleteLoan(id),
      onCommitted: () => loadData(),
    });
  };
  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    try {
      const curMo = todayYMD().substring(0, 7);
      const { start_next_month, ...rest } = formData;
      const payload = {
        ...rest,
        last_paid_month: start_next_month ? curMo : null,
      };
      if (editMode) {
        await updateLoan(currentId, payload);
        toast.success('Loan updated');
      } else {
        await createLoan(payload);
        toast.success(
          start_next_month
            ? '✅ Loan created (Marked paid this month — starts Next Month)'
            : 'Loan created'
        );
      }
      setIsModalOpen(false);
      loadData();
    } catch (err) { toast.error(err?.message || (editMode ? 'Failed to update loan' : 'Failed to create loan')); }
  };
  const handlePaymentSubmit = async (e) => {
    e.preventDefault();
    try {
      await payLoan(payLoanId, paymentData);
      const acc = accounts.find(a => String(a.id) === String(paymentData.account_id));
      toast.success(
        acc
          ? `✅ Paid ${formatCurrency(paymentData.amount)} from "${acc.name}"`
          : `✅ Recorded ${formatCurrency(paymentData.amount)} payment (no account deduction)`
      );
      setIsPaymentModalOpen(false);
      setPayLoanId(null);
      loadData();
      haptic();
    } catch (err) { toast.error(err?.message || 'Failed to record payment'); }
  };

    const accountOptions = [{ value:'', label:'Do not deduct from account' }, ...accounts.map(acc => ({ value:acc.id, label:`${acc.name} (${formatCurrency(acc.balance)})` }))];
  const uniqueLoanNames = [...new Set(loans.map(l => l.item_name).filter(Boolean))];

  const totalOwed = loans.reduce((s, l) => s + l.principal_amount + (l.current_accrued_interest || l.unpaid_interest || 0), 0);
  const totalInterest = loans.reduce((s, l) => s + (l.current_accrued_interest || l.unpaid_interest || 0), 0);

  const TABS = [
    { id:'loans', label:'MY LOANS' },
    { id:'ious', label:'🤝 SPLIT & IOUs' },
    { id:'planner', label:'DEBT PAYOFF PLANNER' },
    { id:'emi', label:'EMI CALCULATOR' }
  ];

  return (
    <PageWrapper>
      <div>
        <PageHeader title="Loans & Liabilities" subtitle="Principal tracking, accrued interest, and payoff schedules">
          <button className="btn btn-primary" onClick={openAddModal}><Plus size={16}/> New Liability</button>
        </PageHeader>

        {/* Summary strip */}
        {!loading && loans.length > 0 && (
          <StatGrid>
            <StatCard label="Total owed" value={formatCurrency(totalOwed)} tone="neg" />
            <StatCard label="Total interest" value={formatCurrency(totalInterest)} tone="warn" />
            <StatCard label="Active loans" value={loans.filter(l=>l.status==='Active').length} />
          </StatGrid>
        )}

        {!loading && activeTab === 'loans' && <InsightLoans loans={loans} />}

        {/* Tabs */}
        <div style={{ display:'flex', gap:'0.35rem', marginBottom:'1.5rem', borderBottom:'1px solid var(--mm-border-subtle, rgba(255,255,255,0.08))', paddingBottom:'0.65rem', flexWrap:'wrap' }}>
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              style={{ padding:'0.45rem 0.95rem', borderRadius:8, cursor:'pointer', fontFamily:'Inter, sans-serif', fontSize:'0.76rem', fontWeight: activeTab===tab.id ? 600 : 500,
                background: activeTab===tab.id ? 'var(--mm-accent-soft, rgba(59,130,246,0.14))' : 'transparent',
                color: activeTab===tab.id ? 'var(--mm-accent-text, #60a5fa)' : 'var(--text-secondary)',
                border: activeTab===tab.id ? '1px solid rgba(59,130,246,0.35)' : '1px solid transparent',
                transition:'all 0.15s' }}>
              {tab.label}
            </button>
          ))}
        </div>

        {loading ? <SkeletonLoader rows={2} height={280}/> : (
          <>
            {activeTab === 'loans' && (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(min(380px, 100%), 1fr))', gap:'1.25rem' }}>
                {loans.map((loan) => {
                  const interest = loan.current_accrued_interest || loan.unpaid_interest || 0;
                  const totalOwedLoan = loan.principal_amount + interest;
                  const interestRatio = totalOwedLoan > 0 ? (interest / totalOwedLoan) * 100 : 0;
                  const isExpanded = expandedLoanId === loan.id;
                  
                  // Broader matching for older transactions (excluding reversed & reversal records)
                  const loanPayments = transactions.filter(t => {
                    if (!t || t.reversed_at || t.reversal_of || t.is_transfer_fee) return false;
                    if (t.loan_id != null && String(t.loan_id) === String(loan.id)) return true;
                    const isLoanTx = t.type === 'Loan Payment' || (t.category && t.category.toLowerCase().includes('loan'));
                    if (isLoanTx && t.notes && loan.item_name && t.notes.toLowerCase().includes(loan.item_name.toLowerCase())) return true;
                    return false;
                  });

                  return (
                    <TiltWrapper key={loan.id}>
                      <div className="hud-panel"
                        style={{ padding:'1.5rem', background:'var(--bg-surface)', borderRadius:14, border:'1px solid var(--mm-border-subtle, rgba(255,255,255,0.08))', position:'relative', overflow:'hidden', display:'flex', flexDirection:'column' }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'1.25rem' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:'0.75rem' }}>
                            <div style={{ padding:'0.65rem', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:10 }}><Landmark className="text-cyan" size={20}/></div>
                            <div>
                              <h3 style={{ margin:'0 0 0.2rem', fontFamily:'Inter, sans-serif', fontSize:'1.02rem', fontWeight:600 }}>{loan.item_name}</h3>
                              <span className="text-muted" style={{ fontSize:'0.76rem', textTransform:'uppercase', letterSpacing:'0.04em' }}>{loan.type}</span>
                            </div>
                          </div>
                          <div className="text-danger" style={{ fontWeight:700, fontFamily:'Inter, sans-serif', fontSize:'0.95rem', background:'rgba(239,68,68,0.1)', padding:'0.35rem 0.75rem', borderRadius:8, border:'1px solid rgba(239,68,68,0.2)' }}>
                            {loan.annual_interest_rate}% APR
                          </div>
                        </div>
                        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(140px, 1fr))', gap:'0.85rem', marginBottom:'1.25rem', padding:'1rem', background:'rgba(0,0,0,0.25)', borderRadius:10, border:'1px solid rgba(255,255,255,0.06)' }}>
                          <div><div className="text-secondary" style={{ fontSize:'0.75rem', marginBottom:'0.2rem', fontFamily:'Inter, sans-serif' }}>PRINCIPAL</div><div style={{ fontWeight:600, color:'var(--text-primary)' }}>{formatCurrency(loan.principal_amount)}</div></div>
                          <div><div className="text-secondary" style={{ fontSize:'0.75rem', marginBottom:'0.2rem', fontFamily:'Inter, sans-serif' }}>INTEREST (UP TO DATE)</div><div className="text-warning glow-text" style={{ fontWeight:600 }}>{formatCurrency(interest)}</div></div>
                          <div>
                            <div className="text-secondary" style={{ fontSize:'0.75rem', marginBottom:'0.2rem', fontFamily:'Inter, sans-serif' }}>MONTHLY INTEREST / TARGET</div>
                            <div style={{ fontWeight:600, color:'#fbbf24' }}>
                              {formatCurrency(Math.round(loan.monthly_payment > 0 ? loan.monthly_payment : ((loan.principal_amount || 0) * (loan.annual_interest_rate || 0) / 100 / 12)))}/mo
                            </div>
                          </div>
                          {loan.next_payment_date && (
                            <div><div className="text-secondary" style={{ fontSize:'0.75rem', marginBottom:'0.2rem', fontFamily:'Inter, sans-serif' }}>NEXT PAYMENT</div>
                              <div style={{ fontWeight:600, color:'var(--cyan)' }}>{loan.next_payment_date}
                                {loan.days_until_payment !== undefined && <span style={{ fontSize:'0.75rem', color:loan.days_until_payment<5?'var(--danger)':'var(--text-muted)', marginLeft:'0.5rem' }}>({loan.days_until_payment} days)</span>}
                              </div>
                            </div>
                          )}
                          {/* Payoff date estimate */}
                          {(() => {
                            const monthlyRate = (loan.annual_interest_rate || 0) / 100 / 12;
                            const principal = loan.principal_amount || 0;
                            const avgPayment = loanPayments.length > 0
                              ? loanPayments.reduce((s, p) => s + (p.amount || 0), 0) / loanPayments.length
                              : 0;
                            const estPayment = avgPayment > 0 ? avgPayment : (parseFloat(loan.monthly_payment) || 0);
                            if (estPayment <= 0 || principal <= 0) return null;
                            // Months to payoff: n = -log(1 - i*P/pmt) / log(1+i)
                            let months;
                            if (monthlyRate === 0) {
                              months = Math.ceil(principal / estPayment);
                            } else {
                              const ratio = monthlyRate * principal / estPayment;
                              if (ratio >= 1) return <div><div className="text-secondary" style={{ fontSize:'0.75rem', marginBottom:'0.2rem', fontFamily:'Inter, sans-serif' }}>PAYOFF DATE</div><div style={{ fontWeight:600, color:'var(--danger)', fontSize:'0.85rem' }}>Payment too low</div></div>;
                              months = Math.ceil(-Math.log(1 - ratio) / Math.log(1 + monthlyRate));
                            }
                            const payoffDate = new Date();
                            payoffDate.setMonth(payoffDate.getMonth() + months);
                            const yrs = Math.floor(months / 12);
                            const mos = months % 12;
                            const label = yrs > 0 ? `${yrs}y ${mos}m` : `${mos} months`;
                            return (
                              <div><div className="text-secondary" style={{ fontSize:'0.75rem', marginBottom:'0.2rem', fontFamily:'Inter, sans-serif' }}>EST. PAYOFF</div>
                                <div style={{ fontWeight:600, color:'#4ade80', fontSize:'0.85rem' }}>{payoffDate.toLocaleDateString('en-US',{month:'short',year:'numeric'})}</div>
                                <div style={{ fontSize:'0.7rem', color:'#555', fontFamily:'Inter, sans-serif' }}>~{label} away</div>
                              </div>
                            );
                          })()}
                          <div style={{ gridColumn:'1/-1', marginTop:'0.5rem' }}>
                            <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.75rem', marginBottom:'0.25rem', fontFamily:'Inter, sans-serif' }}>
                              <span className="text-muted">DEBT COMPOSITION</span>
                              <span className="text-danger">TOTAL OWED: {formatCurrency(totalOwedLoan)}</span>
                            </div>
                            <div style={{ width:'100%', height:6, background:'rgba(255,255,255,0.1)', borderRadius:3, overflow:'hidden', display:'flex' }}>
                              <div style={{ width:`${100-interestRatio}%`, background:'var(--text-primary)' }} title="Principal"/>
                              <div style={{ width:`${interestRatio}%`, background:'var(--warning)' }} title="Interest"/>
                            </div>
                          </div>
                        </div>

                        {/* Total paid + progress ring */}
                        {loanPayments.length > 0 && (() => {
                          const totalPaid = loanPayments.reduce((s, p) => s + (p.amount || 0), 0);
                          const totalDebt = loan.principal_amount + (loan.current_accrued_interest || loan.unpaid_interest || 0);
                          const paidPct = totalDebt > 0 ? Math.min((totalPaid / (totalPaid + totalDebt)) * 100, 100) : 0;
                          return (
                            <div style={{ padding:'0.875rem 1rem', background:'rgba(0,245,255,0.04)', border:'1px solid rgba(0,245,255,0.12)', borderRadius:10, marginBottom:'0.75rem', transform:'translateZ(20px)' }}>
                              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.5rem' }}>
                                <div style={{ fontFamily:'Inter, sans-serif', fontSize:'0.72rem', letterSpacing:'1px', color:'var(--text-muted)' }}>REPAYMENT PROGRESS</div>
                                <div style={{ fontFamily:'Inter, sans-serif', fontSize:'0.75rem', color:'#00f5ff', fontWeight:600 }}>{paidPct.toFixed(1)}% paid off</div>
                              </div>
                              <div style={{ height:6, background:'rgba(255,255,255,0.06)', borderRadius:3, overflow:'hidden', marginBottom:'0.5rem' }}>
                                <motion.div initial={{ width:0 }} animate={{ width:`${paidPct}%` }} transition={{ duration:1, ease:'easeOut' }}
                                  style={{ height:'100%', background:'linear-gradient(90deg,#00f5ff,#4ade80)', borderRadius:3, boxShadow:'0 0 6px rgba(0,245,255,0.4)' }}/>
                              </div>
                              <div style={{ display:'flex', justifyContent:'space-between', fontFamily:'Inter, sans-serif', fontSize:'0.72rem' }}>
                                <span style={{ color:'#4ade80' }}>Paid: {formatCurrency(totalPaid)}</span>
                                <span style={{ color:'var(--text-muted)' }}>Remaining: {formatCurrency(totalDebt)}</span>
                              </div>
                            </div>
                          );
                        })()}

                        {/* History Toggle */}
                        <div style={{ transform:'translateZ(20px)', marginBottom:'1rem' }}>
                          <button 
                            className="btn" 
                            style={{ width:'100%', display:'flex', justifyContent:'space-between', background:'rgba(255,255,255,0.05)', padding:'0.75rem 1rem', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, transition:'all 0.2s ease', cursor:'pointer' }}
                            onClick={() => setExpandedLoanId(isExpanded ? null : loan.id)}
                            onMouseOver={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                            onMouseOut={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                          >
                            <span style={{ display:'flex', alignItems:'center', gap:'0.5rem', fontSize:'0.9rem', fontWeight:600, color:'var(--cyan)' }}><History size={18}/> Payment History ({loanPayments.length})</span>
                            {isExpanded ? <ChevronUp size={18} className="text-cyan"/> : <ChevronDown size={18} className="text-cyan"/>}
                          </button>
                          
                          <AnimatePresence>
                            {isExpanded && (
                              <motion.div
                                initial={{ opacity:0, height:0 }}
                                animate={{ opacity:1, height:'auto' }}
                                exit={{ opacity:0, height:0 }}
                                style={{ overflow:'hidden', marginTop:'0.5rem' }}
                              >
                                <div style={{ background:'rgba(0,0,0,0.5)', borderRadius:8, border:'1px solid rgba(0,255,255,0.2)', padding:'1rem', maxHeight:'200px', overflowY:'auto', boxShadow:'inset 0 2px 10px rgba(0,0,0,0.5)' }}>
                                  {loanPayments.length === 0 ? (
                                    <p className="text-muted" style={{ fontSize:'0.85rem', textAlign:'center', margin:0, padding:'1rem 0' }}>No payments recorded for this loan yet.</p>
                                  ) : (
                                    <div style={{ display:'flex', flexDirection:'column', gap:'0.75rem' }}>
                                      {loanPayments.map(tx => (
                                        <div key={tx.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom:'1px solid rgba(255,255,255,0.05)', paddingBottom:'0.5rem' }}>
                                          <div>
                                            <div style={{ fontSize:'0.85rem', color:'var(--text-primary)' }}>{tx.date}</div>
                                            {tx.from_account_id && <div className="text-muted" style={{ fontSize:'0.75rem' }}>From: {accounts.find(a=>a.id===tx.from_account_id)?.name || 'Account'}</div>}
                                          </div>
                                          <div className="text-success glow-text" style={{ fontWeight:700 }}>{formatCurrency(tx.amount)}</div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>

                        {/* Amortization Schedule Toggle */}
                        {(() => {
                          const monthlyRate = (loan.annual_interest_rate || 0) / 100 / 12;
                          const principal = loan.principal_amount || 0;
                          const avgPayment = loanPayments.length > 0
                            ? loanPayments.reduce((s, p) => s + (p.amount || 0), 0) / loanPayments.length
                            : 0;
                          const minPayment = monthlyRate > 0 ? principal * monthlyRate * 1.01 : principal / 120;
                          const pmt = Math.max(avgPayment, minPayment);
                          if (pmt <= 0 || principal <= 0) return null;

                          const schedule = [];
                          let balance = principal;
                          for (let m = 1; m <= 360 && balance > 0.01; m++) {
                            const intCharge = balance * monthlyRate;
                            const prinPart = Math.min(pmt - intCharge, balance);
                            if (prinPart <= 0) break;
                            const closing = Math.max(0, balance - prinPart);
                            schedule.push({ m, opening: balance, payment: intCharge + prinPart, interest: intCharge, principal: prinPart, closing });
                            balance = closing;
                          }
                          const schedKey = `sched_${loan.id}`;

                          return (
                            <div style={{ transform:'translateZ(20px)', marginBottom:'1rem' }}>
                              <button className="btn"
                                style={{ width:'100%', display:'flex', justifyContent:'space-between', background:'rgba(168,85,247,0.08)', padding:'0.75rem 1rem', border:'1px solid rgba(168,85,247,0.2)', borderRadius:8, cursor:'pointer' }}
                                onClick={() => setExpandedLoanId(expandedLoanId === schedKey ? null : schedKey)}>
                                <span style={{ display:'flex', alignItems:'center', gap:'0.5rem', fontSize:'0.9rem', fontWeight:600, color:'#c084fc' }}>📊 Amortization Schedule ({schedule.length}mo)</span>
                                {expandedLoanId === schedKey ? <ChevronUp size={18} style={{ color:'#c084fc' }}/> : <ChevronDown size={18} style={{ color:'#c084fc' }}/>}
                              </button>
                              <AnimatePresence>
                                {expandedLoanId === schedKey && (
                                  <motion.div initial={{ opacity:0, height:0 }} animate={{ opacity:1, height:'auto' }} exit={{ opacity:0, height:0 }} style={{ overflow:'hidden', marginTop:'0.5rem' }}>
                                    <div style={{ background:'rgba(0,0,0,0.5)', borderRadius:8, border:'1px solid rgba(168,85,247,0.2)', overflow:'auto', maxHeight:280 }}>
                                      <table style={{ width:'100%', borderCollapse:'collapse', fontFamily:'Inter, sans-serif', fontSize:'0.72rem' }}>
                                        <thead style={{ position:'sticky', top:0, background:'rgba(14,14,30,0.98)' }}>
                                          <tr>{['#','Opening','Payment','Principal','Interest','Closing'].map(h => (
                                            <th key={h} style={{ padding:'0.5rem 0.6rem', textAlign:'right', color:'var(--text-muted)', fontWeight:600, borderBottom:'1px solid rgba(255,255,255,0.06)', whiteSpace:'nowrap' }}>{h}</th>
                                          ))}</tr>
                                        </thead>
                                        <tbody>
                                          {schedule.map((r, i) => (
                                            <tr key={r.m} style={{ background: i%2===0?'rgba(255,255,255,0.01)':'transparent' }}>
                                              <td style={{ padding:'0.35rem 0.6rem', color:'var(--text-muted)', textAlign:'right' }}>{r.m}</td>
                                              <td style={{ padding:'0.35rem 0.6rem', textAlign:'right' }}>{formatCurrency(r.opening)}</td>
                                              <td style={{ padding:'0.35rem 0.6rem', color:'#4ade80', fontWeight:600, textAlign:'right' }}>{formatCurrency(r.payment)}</td>
                                              <td style={{ padding:'0.35rem 0.6rem', color:'#00f5ff', textAlign:'right' }}>{formatCurrency(r.principal)}</td>
                                              <td style={{ padding:'0.35rem 0.6rem', color:'#f87171', textAlign:'right' }}>{formatCurrency(r.interest)}</td>
                                              <td style={{ padding:'0.35rem 0.6rem', color: r.closing < principal*0.1?'#4ade80':'var(--text-primary)', fontWeight:600, textAlign:'right' }}>{formatCurrency(r.closing)}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                    <div style={{ fontSize:'0.65rem', color:'var(--text-muted)', fontFamily:'Inter, sans-serif', marginTop:'0.35rem' }}>
                                      💡 Based on avg payment {formatCurrency(pmt)}/mo · <span style={{ color:'#00f5ff' }}>Cyan = Principal</span> · <span style={{ color:'#f87171' }}>Red = Interest</span>
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          );
                        })()}

                        {/* Part-Payment Interest Saver Strip */}
                        {loan.status === 'Active' && (loan.principal_amount || 0) > 0 && (loan.annual_interest_rate || 0) > 0 && (() => {
                          const p = loan.principal_amount || 0;
                          const apr = loan.annual_interest_rate || 0;
                          const partAmt = Math.min(p, Math.max(5000, Math.round((p * 0.1) / 1000) * 1000));
                          const savedMo = Math.round((partAmt * (apr / 100)) / 12);
                          const savedYr = Math.round(partAmt * (apr / 100));
                          if (savedMo <= 0) return null;
                          return (
                            <div style={{
                              marginBottom: '0.85rem',
                              padding: '0.6rem 0.85rem',
                              borderRadius: 10,
                              background: 'rgba(16, 185, 129, 0.06)',
                              border: '1px solid rgba(16, 185, 129, 0.22)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              flexWrap: 'wrap',
                              gap: '0.5rem',
                              fontSize: '0.72rem',
                            }}>
                              <span style={{ color: 'var(--text-secondary)' }}>
                                💡 <strong>Part-Pay {formatCurrency(partAmt)}</strong> principal → saves <strong style={{ color: '#34d399' }}>{formatCurrency(savedMo)}/mo</strong> ({formatCurrency(savedYr)}/yr) in interest
                              </span>
                              <button
                                type="button"
                                onClick={() => quickPayLoan(loan, parseFloat(((interest || 0) + partAmt).toFixed(2)))}
                                style={{
                                  padding: '0.26rem 0.6rem',
                                  borderRadius: 6,
                                  border: '1px solid rgba(16, 185, 129, 0.35)',
                                  background: 'rgba(16, 185, 129, 0.14)',
                                  color: '#34d399',
                                  fontWeight: 700,
                                  fontSize: '0.68rem',
                                  cursor: 'pointer',
                                }}
                              >
                                ⚡ Pay Interest + {formatCurrency(partAmt)}
                              </button>
                            </div>
                          );
                        })()}

                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:'auto', transform:'translateZ(20px)' }}>
                          <div style={{ display:'flex', gap:'0.5rem' }}>
                            <button className="icon-btn" aria-label={`Edit loan ${loan.item_name}`} style={{ background:'rgba(255,255,255,0.05)' }} onClick={() => openEditModal(loan)}><Edit2 size={16}/></button>
                            <button className="icon-btn" aria-label={`Delete loan ${loan.item_name}`} style={{ background:'rgba(255,0,0,0.1)' }} onClick={() => setConfirm({ open:true, id:loan.id })}><Trash2 size={16} className="text-danger"/></button>
                          </div>
                        <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem', alignItems:'flex-end' }}>
                          {/* Quick pay EMI shortcut + Monthly Recurring Link */}
                          {(() => {
                            const interest = loan.current_accrued_interest || loan.unpaid_interest || 0;
                            const n = 12; const rate = (loan.annual_interest_rate||0)/100/12;
                            const p = loan.principal_amount || 0;
                            const emi = rate === 0 ? (p/n) : (p * rate * Math.pow(1+rate,n)) / (Math.pow(1+rate,n)-1);
                            const monthlyInt = Math.round(p * rate);
                            const isLinkedRecurring = recurringRules.some(r => String(r.loan_id) === String(loan.id));
                            const linkedRule = recurringRules.find(r => String(r.loan_id) === String(loan.id));
                            const curMo = todayYMD().substring(0, 7);
                            const paidViaTx = loanPayments
                              .filter(t => t.date && t.date.startsWith(curMo))
                              .reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
                            const isMarkedPaidMo = loan.last_paid_month === curMo || (linkedRule && linkedRule.last_applied_month === curMo) || paidViaTx > 0;
                            return (
                              <div style={{ display:'flex', gap:'0.4rem', alignItems:'center', flexWrap:'wrap', justifyContent:'flex-end' }}>
                                <span style={{
                                  fontSize:'0.66rem',
                                  fontFamily:'Inter, sans-serif',
                                  fontWeight:700,
                                  padding:'0.28rem 0.55rem',
                                  borderRadius:8,
                                  background: isMarkedPaidMo ? 'rgba(74,222,128,0.14)' : 'rgba(251,191,36,0.14)',
                                  border: `1px solid ${isMarkedPaidMo ? 'rgba(74,222,128,0.35)' : 'rgba(251,191,36,0.35)'}`,
                                  color: isMarkedPaidMo ? '#4ade80' : '#fbbf24'
                                }}>
                                  {paidViaTx > 0
                                    ? `✅ Paid ${formatCurrency(paidViaTx)} this mo`
                                    : isMarkedPaidMo
                                      ? '✅ Paid / Starts Next Mo'
                                      : `⏳ ~${formatCurrency(monthlyInt)}/mo due`}
                                </span>
                                {loan.status === 'Active' && (
                                  <button
                                    type="button"
                                    onClick={() => toggleLoanPaidThisMonth(loan, isMarkedPaidMo)}
                                    title={isMarkedPaidMo ? 'Mark as due for this month' : 'Mark as already paid without deducting from any account'}
                                    style={{ padding:'0.35rem 0.65rem', borderRadius:8, border: isMarkedPaidMo ? '1px solid rgba(255,255,255,0.14)' : '1px solid rgba(255,255,255,0.15)', background: isMarkedPaidMo ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.03)', color: isMarkedPaidMo ? 'var(--text-secondary)' : 'var(--text-muted)', cursor:'pointer', fontFamily:'Inter, sans-serif', fontSize:'0.7rem', fontWeight:600 }}>
                                    {isMarkedPaidMo ? '↩️ Mark Due' : '🔕 Mark Paid (No Account Deduction)'}
                                  </button>
                                )}
                                {!isLinkedRecurring && loan.status === 'Active' && (
                                  <button
                                    type="button"
                                    onClick={() => handleAddLoanToRecurring(loan)}
                                    style={{ padding:'0.35rem 0.65rem', borderRadius:8, border:'1px solid rgba(167,139,250,0.35)', background:'rgba(167,139,250,0.12)', color:'#c4b5fd', cursor:'pointer', fontFamily:'Inter, sans-serif', fontSize:'0.72rem', fontWeight:600 }}>
                                    🔁 Add to Monthly Recurring
                                  </button>
                                )}
                                {emi > 0 && (
                                  <button
                                    disabled={loan.status !== 'Active'}
                                    onClick={() => quickPayLoan(loan, parseFloat(emi.toFixed(2)))}
                                    style={{ padding:'0.35rem 0.65rem', borderRadius:8, border:'1px solid rgba(0,245,255,0.25)', background:'rgba(0,245,255,0.07)', color:'#00f5ff', cursor:'pointer', fontFamily:'Inter, sans-serif', fontSize:'0.72rem' }}>
                                    ⚡ EMI {formatCurrency(parseFloat(emi.toFixed(2)))}
                                  </button>
                                )}
                                {interest > 0 && (
                                  <button
                                    disabled={loan.status !== 'Active'}
                                    onClick={() => quickPayLoan(loan, parseFloat(interest.toFixed(2)))}
                                    style={{ padding:'0.35rem 0.65rem', borderRadius:8, border:'1px solid rgba(251,191,36,0.25)', background:'rgba(251,191,36,0.07)', color:'#fbbf24', cursor:'pointer', fontFamily:'Inter, sans-serif', fontSize:'0.72rem' }}>
                                    💰 Interest {formatCurrency(parseFloat(interest.toFixed(2)))}
                                  </button>
                                )}
                              </div>
                            );
                          })()}
                          <button className="btn btn-primary" disabled={loan.status !== 'Active'} onClick={() => openPaymentModal(loan)} style={{ fontSize:'0.8rem', padding:'0.55rem 0.95rem' }}>
                            <Wallet size={15}/> Record Payment
                          </button>
                        </div>
                        </div>
                      </div>
                    </TiltWrapper>
                  );
                })}
                {loans.length === 0 && (
                  <div className="bento-item col-span-12" style={{ alignItems:'center', justifyContent:'center', padding:'3rem', gridColumn:'1/-1' }}>
                    <p className="text-muted" style={{ fontFamily:'Inter, sans-serif' }}>NO ACTIVE LIABILITIES</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'planner' && (
              <div className="hud-panel" style={{ padding:'1.5rem' }}>
                <div style={{ fontFamily:'Inter, sans-serif', fontSize:'0.75rem', color:'var(--text-secondary)', letterSpacing:'0.3px', fontWeight:600, marginBottom:'1.25rem' }}>
                  DEBT PAYOFF PLANNER — AVALANCHE VS SNOWBALL
                </div>
                <DebtPayoffPlanner loans={loans}/>
              </div>
            )}
            {activeTab === 'ious' && <IouTrackerTab accounts={accounts} onReload={loadData} />}
            {activeTab === 'emi' && <EmiTab />}
          </>
        )}
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editMode ? 'Edit Liability' : 'New Liability'}>
        <datalist id="loan-item-names">{uniqueLoanNames.map(n => <option key={n} value={n}/>)}</datalist>
        <form onSubmit={handleCreateSubmit} style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
          <div><label style={{ display:'block', marginBottom:'0.5rem', fontSize:'0.85rem' }}>Loan Name/Item</label><input list="loan-item-names" required value={formData.item_name} onChange={e => setFormData({...formData, item_name:e.target.value})} placeholder="e.g. Camera Gold Loan"/></div>
          <div><label style={{ display:'block', marginBottom:'0.5rem', fontSize:'0.85rem' }}>Type</label><FuturisticDropdown options={['Gold Loan','Personal Loan','Device Loan']} value={formData.type} onChange={val => setFormData({...formData, type:val})}/></div>
          <div><label style={{ display:'block', marginBottom:'0.5rem', fontSize:'0.85rem' }}>{`Principal Amount (${getCurrencyLabel()})`}</label><CurrencyInput required value={formData.principal_amount} onChange={val => setFormData({...formData, principal_amount:val})}/></div>
          <div><label style={{ display:'block', marginBottom:'0.5rem', fontSize:'0.85rem' }}>Annual Interest Rate (%)</label><input type="number" inputMode="decimal" step="0.001" required value={formData.annual_interest_rate} onChange={e => setFormData({...formData, annual_interest_rate:parseFloat(e.target.value)||0})}/></div>
          <div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.4rem', flexWrap:'wrap', gap:'0.35rem' }}>
              <label style={{ fontSize:'0.85rem' }}>{`Planned Monthly Payment (${getCurrencyLabel()}) — Reserved in Daily Safe-to-Spend`}</label>
              {formData.principal_amount > 0 && formData.annual_interest_rate > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const moInt = Math.round((formData.principal_amount * (formData.annual_interest_rate / 100)) / 12);
                    setFormData({ ...formData, monthly_payment: moInt });
                  }}
                  style={{ padding:'0.18rem 0.55rem', borderRadius:12, border:'1px solid rgba(251,191,36,0.35)', background:'rgba(251,191,36,0.12)', color:'#fbbf24', fontSize:'0.68rem', fontFamily:'Inter, sans-serif', fontWeight:700, cursor:'pointer' }}
                >
                  Use Monthly Interest ({formatCurrency(Math.round((formData.principal_amount * (formData.annual_interest_rate / 100)) / 12))})
                </button>
              )}
            </div>
            <CurrencyInput value={formData.monthly_payment || 0} onChange={val => setFormData({...formData, monthly_payment:val})}/>
          </div>
          <div><label style={{ display:'block', marginBottom:'0.5rem', fontSize:'0.85rem' }}>Start Date</label>
            <input type="date" required value={formData.start_date} onChange={e => { const d=e.target.value; setFormData(prev => ({...prev, start_date:d, last_interest_calc_date:!isOldLoan?d:prev.last_interest_calc_date})); }}/>
          </div>
          {/* Start From Next Month Toggle (Default: Checked because current month is already paid) */}
          <div style={{
            padding: '0.8rem 0.95rem',
            borderRadius: 12,
            background: formData.start_next_month ? 'rgba(74,222,128,0.1)' : 'rgba(255,255,255,0.025)',
            border: `1px solid ${formData.start_next_month ? 'rgba(74,222,128,0.35)' : 'rgba(255,255,255,0.08)'}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '0.75rem'
          }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.82rem', color: formData.start_next_month ? '#4ade80' : '#f0f0f5' }}>
                ✅ Already Paid for This Month — Start From Next Month
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                {formData.start_next_month
                  ? 'Marked as PAID for this month (no account deduction). Monthly reminder & Safe-to-Spend reservation will begin next month.'
                  : 'Will be treated as UNPAID for this month and reserved in this month’s Safe-to-Spend.'}
              </div>
            </div>
            <input
              type="checkbox"
              checked={Boolean(formData.start_next_month)}
              onChange={e => setFormData({ ...formData, start_next_month: e.target.checked })}
              style={{ width: 20, height: 20, accentColor: '#4ade80', cursor: 'pointer', flexShrink: 0 }}
            />
          </div>
          {!editMode && (
            <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', marginTop:'0.5rem' }}>
              <input type="checkbox" id="oldLoanToggle" checked={isOldLoan} onChange={e => { setIsOldLoan(e.target.checked); if (!e.target.checked) setFormData(prev => ({...prev, last_interest_calc_date:prev.start_date, total_interest_paid:0, unpaid_interest:0})); }}/>
              <label htmlFor="oldLoanToggle" style={{ fontSize:'0.85rem', cursor:'pointer' }}>Old Loan Setup (Already Paid Interest)</label>
            </div>
          )}
          {(isOldLoan || editMode) && (
            <div style={{ padding:'1rem', background:'rgba(0,0,0,0.2)', borderRadius:8, border:'1px dashed var(--cyan)' }}>
              <div style={{ marginBottom:'1rem' }}><label style={{ display:'block', marginBottom:'0.5rem', fontSize:'0.85rem' }}>{`Up-to-date Interest / Unpaid (${getCurrencyLabel()})`}</label><CurrencyInput value={formData.unpaid_interest} onChange={val => setFormData({...formData, unpaid_interest:val})}/></div>
              <div style={{ marginBottom:'1rem' }}><label style={{ display:'block', marginBottom:'0.5rem', fontSize:'0.85rem' }}>Last Interest Calc Date</label><input type="date" required value={formData.last_interest_calc_date} onChange={e => setFormData({...formData, last_interest_calc_date:e.target.value})}/></div>
              <div><label style={{ display:'block', marginBottom:'0.5rem', fontSize:'0.85rem' }}>{`Historical Interest Already Paid (${getCurrencyLabel()})`}</label><CurrencyInput value={formData.total_interest_paid} onChange={val => setFormData({...formData, total_interest_paid:val})}/></div>
            </div>
          )}
          <div style={{ display:'flex', justifyContent:'flex-end', gap:'1rem', marginTop:'1rem' }}>
            <button type="button" className="btn" onClick={() => setIsModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary">{editMode ? 'Update' : 'Save'}</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={isPaymentModalOpen} onClose={() => setIsPaymentModalOpen(false)} title="💳 Manual Loan Payment & Account Selection">
        <form onSubmit={handlePaymentSubmit} style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
          {(() => {
            const targetLoan = loans.find(l => String(l.id) === String(payLoanId));
            if (!targetLoan) return null;
            const p = parseFloat(targetLoan.principal_amount) || 0;
            const r = (parseFloat(targetLoan.annual_interest_rate) || 0) / 100 / 12;
            const moInt = Math.round(p * r);
            const accInt = Math.round(targetLoan.current_accrued_interest || targetLoan.unpaid_interest || 0);
            const emi12 = r === 0 ? Math.round(p / 12) : Math.round((p * r * Math.pow(1 + r, 12)) / (Math.pow(1 + r, 12) - 1));
            return (
              <div style={{ padding:'0.75rem 0.9rem', borderRadius:10, background:'rgba(251,191,36,0.08)', border:'1px solid rgba(251,191,36,0.25)' }}>
                <div style={{ fontSize:'0.74rem', fontWeight:700, color:'#fbbf24', marginBottom:'0.4rem' }}>
                  🪙 {targetLoan.item_name} • Principal: {formatCurrency(p)} ({targetLoan.annual_interest_rate}% APR)
                </div>
                <div style={{ display:'flex', gap:'0.4rem', flexWrap:'wrap' }}>
                  {moInt > 0 && (
                    <button type="button" onClick={() => setPaymentData(prev => ({ ...prev, amount: moInt }))} style={{ padding:'0.25rem 0.6rem', borderRadius:8, border:'1px solid rgba(251,191,36,0.35)', background:'rgba(251,191,36,0.14)', color:'#fbbf24', fontSize:'0.7rem', fontWeight:700, cursor:'pointer' }}>
                      Monthly Interest ({formatCurrency(moInt)})
                    </button>
                  )}
                  {accInt > 0 && (
                    <button type="button" onClick={() => setPaymentData(prev => ({ ...prev, amount: accInt }))} style={{ padding:'0.25rem 0.6rem', borderRadius:8, border:'1px solid rgba(74,222,128,0.35)', background:'rgba(74,222,128,0.14)', color:'#4ade80', fontSize:'0.7rem', fontWeight:700, cursor:'pointer' }}>
                      Accrued Interest ({formatCurrency(accInt)})
                    </button>
                  )}
                  {emi12 > 0 && (
                    <button type="button" onClick={() => setPaymentData(prev => ({ ...prev, amount: emi12 }))} style={{ padding:'0.25rem 0.6rem', borderRadius:8, border:'1px solid rgba(6,182,212,0.35)', background:'rgba(6,182,212,0.14)', color:'#06b6d4', fontSize:'0.7rem', fontWeight:700, cursor:'pointer' }}>
                      12-mo EMI ({formatCurrency(emi12)})
                    </button>
                  )}
                </div>
              </div>
            );
          })()}
          <div><label style={{ display:'block', marginBottom:'0.5rem', fontSize:'0.85rem' }}>{`Payment Amount (${getCurrencyLabel()})`}</label><CurrencyInput required value={paymentData.amount} onChange={val => setPaymentData({...paymentData, amount:val})}/></div>
          <div><label style={{ display:'block', marginBottom:'0.5rem', fontSize:'0.85rem' }}>Payment Date</label><input type="date" required value={paymentData.date} onChange={e => setPaymentData({...paymentData, date:e.target.value})}/></div>
          <div style={{ padding:'0.75rem', borderRadius:12, background:'rgba(6,182,212,0.06)', border:'1px solid rgba(6,182,212,0.22)' }}>
            <label style={{ display:'block', marginBottom:'0.45rem', fontSize:'0.82rem', fontWeight:700, color:'#06b6d4' }}>
              🏦 Choose Account to Deduct From
            </label>
            <FuturisticDropdown options={accountOptions} value={paymentData.account_id} onChange={val => setPaymentData({...paymentData, account_id:val})}/>
            {(() => {
              const selAcc = accounts.find(a => String(a.id) === String(paymentData.account_id));
              if (!selAcc) {
                return (
                  <div style={{ marginTop:'0.45rem', fontSize:'0.72rem', color:'#fbbf24' }}>
                    ℹ️ No account selected — loan interest/principal will be updated without deducting from any bank account.
                  </div>
                );
              }
              const curBal = parseFloat(selAcc.balance) || 0;
              const afterBal = curBal - (parseFloat(paymentData.amount) || 0);
              return (
                <div style={{ marginTop:'0.5rem', display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:'0.74rem', padding:'0.4rem 0.6rem', borderRadius:8, background:'rgba(0,0,0,0.25)' }}>
                  <span style={{ color:'var(--text-secondary)' }}>
                    Current: <strong style={{ color:'var(--text-primary)' }}>{formatCurrency(curBal)}</strong>
                  </span>
                  <span style={{ color: afterBal < 0 ? '#f87171' : '#4ade80', fontWeight:700 }}>
                    After Payment: {formatCurrency(afterBal)}
                  </span>
                </div>
              );
            })()}
          </div>
          <div style={{ display:'flex', justifyContent:'flex-end', gap:'1rem', marginTop:'0.5rem' }}>
            <button type="button" className="btn" onClick={() => setIsPaymentModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary">
              {paymentData.account_id ? '💳 Confirm & Deduct Payment' : '✅ Record Payment Only'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog open={confirm.open} title="Delete Loan" message="Are you sure? Associated payment transactions will NOT be automatically deleted." confirmLabel="Delete" danger onConfirm={doDelete} onCancel={() => setConfirm({ open:false, id:null })}/>
    </PageWrapper>
  );
};

export default Loans;