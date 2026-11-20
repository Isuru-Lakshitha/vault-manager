import { useT } from '../i18n';
import { removeItemWithUndo, itemLabel } from '../components/undoToast';
import { PageHeader, StatGrid, StatCard, Segmented, Button, EmptyState } from '../components/ui';
import MoreSection from '../components/MoreSection';
import { advanceBill } from '../utils/billSchedule';
import { InsightBills } from '../components/InsightPanels';
import { useState, useEffect } from 'react';
import useLiveData from '../utils/useLiveData';
import { motion } from 'framer-motion';
import { Plus, Trash2, Bell, CheckCircle, Edit2, Zap } from 'lucide-react';
import PageWrapper from '../components/PageWrapper';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import SkeletonLoader from '../components/SkeletonLoader';
import CurrencyInput from '../components/CurrencyInput';
import getCategoryEmoji from '../utils/categoryEmoji';
import toast from 'react-hot-toast';
import { fetchBills, createBill, updateBill, deleteBill, payBill, fetchAccounts, fetchTransactions, getCache } from '../utils/api';
import { detectUnmanagedSubscriptions } from '../utils/subscriptionDetector';
import { formatCurrency, getCurrencyLabel } from '../utils/format';
import { toYMD, todayYMD } from '../utils/dates';


const daysUntil = (dateStr) => {
  const today = new Date(); today.setHours(0,0,0,0);
  const due = new Date(dateStr); due.setHours(0,0,0,0);
  return Math.ceil((due - today) / (1000*60*60*24));
};

const urgencyColor = (days) => {
  if (days < 0) return '#f87171';
  if (days <= 3) return '#fbbf24';
  if (days <= 7) return '#06b6d4';
  return '#4ade80';
};

const FREQUENCIES = ['Once', 'Weekly', 'Monthly', 'Yearly'];
const CATEGORIES = ['Rent/Housing', 'Utilities', 'Insurance', 'Subscriptions', 'Loan EMI', 'Phone/Internet', 'Groceries', 'Education', 'Other'];

const Bills = () => {
  const t = useT();
  const [bills, setBills] = useState(() => getCache('bills') || []);
  const [loading, setLoading] = useState(() => !getCache('bills'));
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [currentId, setCurrentId] = useState(null);
  const [confirm, setConfirm] = useState({ open: false, id: null });
  const [formData, setFormData] = useState({ name: '', amount: 0, due_date: '', frequency: 'Monthly', category: 'Other', paid: false });
  const [quickPayingId, setQuickPayingId] = useState(null);
  const [billsView, setBillsView] = useState('list'); // 'list' | 'calendar'
  const [billFilter, setBillFilter] = useState('all'); // 'all' | 'overdue' | 'soon' | 'paid'
  const [billSearch, setBillSearch] = useState('');

  useEffect(() => { load(!!getCache('bills')); }, []);
  useLiveData(() => load(true));

  const [accounts, setAccounts] = useState(() => getCache('accounts') || []);
  const [transactions, setTransactions] = useState(() => getCache('transactions') || []);

  const load = async (silent) => {
    try {
      if (silent !== true) setLoading(true);
      const [data, accs, txs] = await Promise.all([fetchBills(), fetchAccounts(), fetchTransactions().catch(() => [])]);
      setBills(data.sort((a,b) => new Date(a.due_date) - new Date(b.due_date)));
      setAccounts(accs);
      setTransactions(txs || []);
    } catch { toast.error('Failed to load bills'); }
    finally { setLoading(false); }
  };

  const detectedSubs = detectUnmanagedSubscriptions(transactions, bills, []);

  const handleAddDetectedBill = async (sub) => {
    try {
      const today = new Date();
      const nextDue = new Date(sub.lastDate || today);
      if (sub.cadence === 'Weekly') nextDue.setDate(nextDue.getDate() + 7);
      else nextDue.setMonth(nextDue.getMonth() + 1);

      await createBill({
        name: sub.name,
        amount: Number(sub.amount),
        due_date: toYMD(nextDue),
        frequency: sub.cadence,
        category: sub.category || 'Subscriptions',
        paid: false,
      });
      toast.success(`Tracked ${sub.name} in Bills!`);
      load();
    } catch {
      toast.error('Failed to add detected bill');
    }
  };

  const [payModalBill, setPayModalBill] = useState(null);
  const [payModalData, setPayModalData] = useState({ amount: 0, account_id: '', date: todayYMD(), notes: '' });

  const openPayBillModal = (bill) => {
    setPayModalBill(bill);
    setPayModalData({
      amount: parseFloat(bill.amount) || 0,
      account_id: accounts[0]?.id || '',
      date: todayYMD(),
      notes: `Bill: ${bill.name}`,
    });
  };

  const advanceBillDueDate = bill => ({ ...bill, ...advanceBill(bill) });

  const handleConfirmPayBill = async (e) => {
    e.preventDefault();
    if (!payModalBill) return;
    if (quickPayingId) return;
    setQuickPayingId(payModalBill.id);
    try {
      const payAmt = Number(payModalData.amount);
      await payBill(payModalBill, { ...payModalData, amount: payAmt, force: true });
      const selAcc = accounts.find(a => String(a.id) === String(payModalData.account_id));
      if (selAcc) {
        const afterBal = (parseFloat(selAcc.balance) || 0) - payAmt;
        toast.success(`✅ Deducted ${formatCurrency(payAmt)} from "${selAcc.name}"! (New balance: ${formatCurrency(afterBal)})`);
      } else {
        toast.success(`✅ ${payModalBill.name} marked paid for this cycle (no account deduction)`);
      }
      setPayModalBill(null);
      load();
    } catch {
      toast.error('Payment failed');
    } finally {
      setQuickPayingId(null);
    }
  };

  const openAdd = () => {
    setEditMode(false); setCurrentId(null);
    const nextMonth = new Date(); nextMonth.setMonth(nextMonth.getMonth() + 1);
    setFormData({ name: '', amount: 0, due_date: toYMD(nextMonth), frequency: 'Monthly', category: 'Other', paid: false });
    setIsModalOpen(true);
  };

  const openEdit = (bill) => {
    setEditMode(true); setCurrentId(bill.id);
    setFormData({ name: bill.name, amount: bill.amount, due_date: bill.due_date, frequency: bill.frequency || 'Monthly', category: bill.category || 'Other', paid: bill.paid || false });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editMode) { await updateBill(currentId, formData); toast.success('Bill updated'); }
      else { await createBill(formData); toast.success('Bill added'); }
      setIsModalOpen(false); load();
    } catch { toast.error('Failed to save bill'); }
  };

  const togglePaid = async (bill) => {
    const becomingPaid = !bill.paid;
    try {
      if (becomingPaid && bill.frequency && bill.frequency !== 'Once') {
        const nextBillState = advanceBillDueDate(bill);
        await updateBill(bill.id, nextBillState);
        toast.success(`🔕 ${bill.name} marked paid — next due: ${nextBillState.due_date} (no account deduction)`);
        load();
      } else {
        await updateBill(bill.id, { ...bill, paid: becomingPaid });
        toast.success(becomingPaid ? `🔕 ${bill.name} marked paid (no account deduction)` : `🔔 ${bill.name} marked unpaid`);
        load();
      }
    } catch { toast.error('Failed to update bill'); }
  };

  const doDelete = () => {
    const id = confirm.id;
    const item = bills.find(x => String(x.id) === String(id));
    setConfirm({ open: false, id: null });
    removeItemWithUndo({
      key: `bill:${id}`,
      label: itemLabel(item, 'Bill deleted'),
      setItems: setBills,
      id,
      commit: () => deleteBill(id),
      onCommitted: () => load(),
    });
  };

  const totalUpcoming = bills.filter(b => !b.paid).reduce((s, b) => s + b.amount, 0);
  const overdue = bills.filter(b => !b.paid && daysUntil(b.due_date) < 0).length;

  const paidCount = bills.filter(b => b.paid).length;

  const markAllPaid = async () => {
    const unpaid = bills.filter(b => !b.paid);
    if (unpaid.length === 0) { toast('All bills already marked paid ✓'); return; }
    try {
      await Promise.all(
        unpaid.map(b =>
          updateBill(
            b.id,
            b.frequency && b.frequency !== 'Once' ? advanceBillDueDate(b) : { ...b, paid: true }
          )
        )
      );
      toast.success(`✅ ${unpaid.length} bill${unpaid.length > 1 ? 's' : ''} marked paid & recurring cycles advanced`);
      load();
    } catch { toast.error('Failed to mark all paid'); }
  };

  return (
    <PageWrapper>
      <div>
        <PageHeader title={t('page.bills')} subtitle="Upcoming due dates, subscription burn rate, and 1-tap payments">
          <Segmented
            label="Bills view"
            value={billsView}
            onChange={setBillsView}
            options={[{ value: 'list', label: 'List' }, { value: 'calendar', label: 'Calendar' }]}
          />
          {bills.some(b => !b.paid) && <Button icon={CheckCircle} onClick={markAllPaid}>Mark all paid</Button>}
          <Button variant="primary" icon={Plus} onClick={openAdd}>Add bill</Button>
        </PageHeader>

        {!loading && <InsightBills bills={bills} />}

        {/* Summary strip + Subscription Burn-Rate Auditor */}
        {!loading && bills.length > 0 && (() => {
          const getAnnualAmount = (b) => {
            if (b.frequency === 'Weekly')  return b.amount * 52;
            if (b.frequency === 'Monthly') return b.amount * 12;
            if (b.frequency === 'Yearly')  return b.amount;
            return b.amount;
          };
          const monthlyCommit = bills.filter(b => !b.paid).reduce((s, b) => {
            if (b.frequency === 'Weekly')  return s + b.amount * 4.33;
            if (b.frequency === 'Monthly') return s + b.amount;
            if (b.frequency === 'Yearly')  return s + b.amount / 12;
            return s + b.amount; // Once
          }, 0);
          const yearlyCommit = bills.reduce((s, b) => s + getAnnualAmount(b), 0);
          const dailyBurn = yearlyCommit / 365;
          const r10 = 0.10 / 12;
          const tenYearOpportunityCost = (yearlyCommit / 12) * ((Math.pow(1 + r10, 120) - 1) / r10);
          const sortedByAnnual = [...bills].sort((a, b) => getAnnualAmount(b) - getAnnualAmount(a));
          const topDrain = sortedByAnnual[0];

          return (
            <>
              <StatGrid>
                <StatCard label="Unpaid total" value={formatCurrency(totalUpcoming)} tone="accent" />
                <StatCard label="Monthly (approx.)" value={formatCurrency(parseFloat(monthlyCommit.toFixed(2)))} tone="warn" />
                <StatCard label="Annual cost" value={formatCurrency(parseFloat(yearlyCommit.toFixed(2)))} />
                <StatCard label="Daily cost" value={`${formatCurrency(parseFloat(dailyBurn.toFixed(2)))}/day`} />
                <StatCard label="Overdue" value={overdue > 0 ? `${overdue} overdue` : 'None'} tone={overdue > 0 ? 'neg' : 'pos'} />
                <StatCard label="Paid" value={`${paidCount} / ${bills.length}`} tone={paidCount === bills.length && bills.length > 0 ? 'pos' : 'neutral'} />
              </StatGrid>

              {/* Subscription Burn-Rate & Opportunity Cost Summary */}
              <div style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--mm-border-subtle, rgba(255,255,255,0.08))',
                borderRadius: 10,
                padding: '0.7rem 1rem',
                marginBottom: '1.15rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.75rem',
                fontSize: '0.78rem'
              }}>
                <div style={{ color: 'var(--text-secondary)' }}>
                  <strong style={{ color: 'var(--text-primary)' }}>Annual commitment:</strong> {formatCurrency(yearlyCommit)}/yr · 10-yr opportunity value (10% APY): <strong style={{ color: 'var(--success)' }}>{formatCurrency(tenYearOpportunityCost)}</strong>
                </div>
                {topDrain && (
                  <span style={{ padding: '0.18rem 0.55rem', borderRadius: 6, background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.22)', color: 'var(--danger)', fontSize: '0.72rem', fontWeight: 600 }}>
                    Largest: {topDrain.name} ({formatCurrency(getAnnualAmount(topDrain))}/yr)
                  </span>
                )}
              </div>
            </>
          );
        })()}

        <MoreSection title="Detected subscriptions" hint={`${detectedSubs.length} found`}>
        {/* Smart Subscription Pattern Detector */}
        {!loading && detectedSubs.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              marginBottom: '1.5rem',
              padding: '1.25rem',
              borderRadius: 16,
              background: 'rgba(167,139,250,0.06)',
              border: '1px solid rgba(167,139,250,0.25)',
              backdropFilter: 'blur(8px)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '1.2rem' }}>🤖</span>
                <span style={{ fontWeight: 700, fontSize: '0.82rem', color: '#a78bfa', letterSpacing: '1px' }}>
                  SMART RECURRING DETECTOR • {detectedSubs.length} Unmanaged Subscriptions
                </span>
              </div>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                Identified from recurring transaction cadence
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.65rem' }}>
              {detectedSubs.map(sub => (
                <div key={sub.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', borderRadius: 12, background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)' }}>{sub.name}</span>
                      {sub.priceHike && (
                        <span style={{ fontSize: '0.62rem', fontWeight: 700, padding: '0.1rem 0.45rem', borderRadius: 6, background: 'rgba(248,113,113,0.16)', border: '1px solid rgba(248,113,113,0.35)', color: 'var(--mm-danger)' }}>
                          📈 +{formatCurrency(sub.priceHike.diff)} (+{sub.priceHike.pct}%) Hike
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      {sub.cadence} cadence • Last paid: {sub.lastDate}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ fontWeight: 700, color: '#a78bfa', fontSize: '0.95rem' }}>
                      {formatCurrency(sub.amount)}
                    </span>
                    <button
                      onClick={() => handleAddDetectedBill(sub)}
                      style={{
                        padding: '0.4rem 0.75rem',
                        borderRadius: 8,
                        background: 'linear-gradient(135deg, rgba(167,139,250,0.25), rgba(129,140,248,0.25))',
                        border: '1px solid rgba(167,139,250,0.4)',
                        color: '#c4b5fd',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      + Track
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        </MoreSection>
        {loading ? <SkeletonLoader rows={4} height={90} /> : billsView === 'calendar' ? (() => {
          // Build calendar for current month
          const today = new Date();
          const year = today.getFullYear();
          const month = today.getMonth();
          const firstDay = new Date(year, month, 1).getDay();
          const daysInMonth = new Date(year, month + 1, 0).getDate();
          const cells = [];
          for (let i = 0; i < firstDay; i++) cells.push(null);
          for (let d = 1; d <= daysInMonth; d++) cells.push(d);
          const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
          const billsByDay = {};
          bills.forEach(b => {
            if (b.due_date?.startsWith(monthStr)) {
              const day = parseInt(b.due_date.split('-')[2]);
              if (!billsByDay[day]) billsByDay[day] = [];
              billsByDay[day].push(b);
            }
          });
          const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
          return (
            <motion.div initial={{ opacity:0,y:8 }} animate={{ opacity:1,y:0 }}>
              <div style={{ textAlign:'center', marginBottom:'1rem', fontWeight:700, color:'var(--cyan, #00f5ff)', fontSize:'1rem' }}>
                {today.toLocaleString('default', { month:'long', year:'numeric' })}
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:'2px', marginBottom:'0.5rem' }}>
                {dayNames.map(d => <div key={d} style={{ textAlign:'center', fontSize:'0.7rem', color:'var(--mm-text-3)', padding:'0.4rem' }}>{d}</div>)}
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:'4px' }}>
                {cells.map((day, i) => {
                  if (!day) return <div key={`e${i}`} />;
                  const dayBills = billsByDay[day] || [];
                  const isToday = day === today.getDate();
                  return (
                    <div key={day} style={{ minHeight:64, border:'1px solid rgba(255,255,255,0.06)', borderRadius:8,
                      background: isToday ? 'rgba(0,245,255,0.06)' : 'rgba(255,255,255,0.02)',
                      borderColor: isToday ? 'rgba(0,245,255,0.3)' : 'rgba(255,255,255,0.06)', padding:'0.3rem' }}>
                      <div style={{ fontSize:'0.75rem', fontWeight: isToday ? 700 : 400, color: isToday ? 'var(--cyan,#00f5ff)' : 'var(--mm-text-3)', marginBottom:'0.2rem' }}>{day}</div>
                      {dayBills.map(b => (
                        <div key={b.id} title={`${b.name} — ${formatCurrency(b.amount)}`}
                          style={{ fontSize:'0.62rem', background: b.paid ? 'rgba(74,222,128,0.15)' : `${urgencyColor(daysUntil(b.due_date))}22`,
                            border:`1px solid ${b.paid ? 'rgba(74,222,128,0.3)' : urgencyColor(daysUntil(b.due_date)) + '44'}`,
                            borderRadius:4, padding:'1px 4px', marginBottom:'1px', color: b.paid ? '#4ade80' : urgencyColor(daysUntil(b.due_date)),
                            whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', cursor:'pointer' }}
                          onClick={() => openEdit(b)}>
                          {getCategoryEmoji(b.category)} {b.name}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </motion.div>
          );
        })() : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
            {bills.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.35rem' }}>
                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                  {[
                    { id: 'all', label: `All (${bills.length})` },
                    { id: 'overdue', label: `Overdue (${overdue})` },
                    { id: 'soon', label: `Due in 7d (${bills.filter(b => !b.paid && daysUntil(b.due_date) >= 0 && daysUntil(b.due_date) <= 7).length})` },
                    { id: 'paid', label: `Paid (${paidCount})` },
                  ].map(tab => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setBillFilter(tab.id)}
                      style={{
                        padding: '0.32rem 0.7rem',
                        borderRadius: 8,
                        fontSize: '0.74rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        background: billFilter === tab.id ? 'var(--mm-accent-soft, rgba(59,130,246,0.15))' : 'rgba(255,255,255,0.03)',
                        color: billFilter === tab.id ? 'var(--mm-accent-text, #60a5fa)' : 'var(--text-secondary)',
                        border: billFilter === tab.id ? '1px solid rgba(59,130,246,0.35)' : '1px solid rgba(255,255,255,0.07)',
                      }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                <input
                  type="search"
                  value={billSearch}
                  onChange={e => setBillSearch(e.target.value)}
                  placeholder="Filter bills by name or category…"
                  aria-label="Filter bills"
                  style={{ minWidth: 220, maxWidth: 280, padding: '0.38rem 0.75rem', fontSize: '0.78rem', borderRadius: 8 }}
                />
              </div>
            )}
            {bills.length === 0 && (
              <div className="bento-item col-span-12">
                <EmptyState icon={Bell} title="No bills yet" action={<Button variant="primary" icon={Plus} onClick={openAdd}>Add your first bill</Button>}>
                  Add rent, utilities and subscriptions to see what's due and pay them in one tap.
                </EmptyState>
              </div>
            )}
            {bills
              .filter(bill => {
                const days = daysUntil(bill.due_date);
                if (billFilter === 'overdue' && (bill.paid || days >= 0)) return false;
                if (billFilter === 'soon' && (bill.paid || days < 0 || days > 7)) return false;
                if (billFilter === 'paid' && !bill.paid) return false;
                if (billSearch.trim()) {
                  const q = billSearch.trim().toLowerCase();
                  const matchName = (bill.name || '').toLowerCase().includes(q);
                  const matchCat = (bill.category || '').toLowerCase().includes(q);
                  if (!matchName && !matchCat) return false;
                }
                return true;
              })
              .map((bill) => {
                const days = daysUntil(bill.due_date);
                const color = bill.paid ? '#555' : urgencyColor(days);
                return (
                  <div key={bill.id}
                    style={{ display:'flex', alignItems:'center', padding:'0.9rem 1.15rem', background:'var(--bg-surface)', border:'1px solid var(--mm-border-subtle, rgba(255,255,255,0.08))', borderLeft:`3px solid ${color}`, borderRadius:10, gap:'0.9rem', opacity: bill.paid ? 0.55 : 1 }}
                  >
                    <button onClick={() => togglePaid(bill)} style={{ background:'none', border:'none', cursor:'pointer', flexShrink:0, color: bill.paid ? 'var(--mm-success)' : '#444', transition:'color 0.2s' }}>
                      <CheckCircle size={20} />
                    </button>
                    <span style={{ fontSize:'1.35rem', flexShrink:0 }}>{getCategoryEmoji(bill.category)}</span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:600, fontSize:'0.92rem', color: bill.paid ? 'var(--text-muted)' : 'var(--text-primary)', textDecoration: bill.paid ? 'line-through' : 'none', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{bill.name}</div>
                      <div style={{ fontSize:'0.74rem', color:'var(--text-secondary)', marginTop:2 }}>
                        {bill.frequency} · {bill.due_date}
                        {!bill.paid && <span style={{ marginLeft:'0.75rem', color, fontWeight: 600 }}>{days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Due today' : `${days}d left`}</span>}
                      </div>
                    </div>
                    <div style={{ fontWeight:700, fontSize:'0.98rem', color: bill.paid ? 'var(--text-muted)' : 'var(--text-primary)', flexShrink:0 }}>{formatCurrency(bill.amount)}</div>
                    {!bill.paid && (
                      <div style={{ display:'flex', gap:'0.4rem', flexShrink:0, flexWrap:'wrap', alignItems:'center' }}>
                        <button
                          onClick={() => openPayBillModal(bill)}
                          disabled={quickPayingId === bill.id}
                          title="Pay & Choose Account to Deduct From"
                          className="btn btn-primary"
                          style={{
                            padding:'0.38rem 0.78rem',
                            borderRadius:8,
                            fontSize:'0.73rem',
                            fontWeight:600,
                            flexShrink:0,
                            display:'flex',
                            alignItems:'center',
                            gap:'0.3rem'
                          }}
                        >
                          <Zap size={13} />
                          {quickPayingId === bill.id ? '…' : `Pay (${formatCurrency(bill.amount)})`}
                        </button>
                        <button
                          onClick={() => togglePaid(bill)}
                          title="Mark as already paid without deducting from any account"
                          className="btn btn-secondary"
                          style={{
                            padding:'0.38rem 0.65rem',
                            borderRadius:8,
                            fontSize:'0.72rem',
                            fontWeight:500
                          }}
                        >
                          Mark Paid Only
                        </button>
                      </div>
                    )}
                    <div style={{ display:'flex', gap:'0.25rem', flexShrink:0 }}>
                      <button className="icon-btn" aria-label={`Edit bill ${bill.name}`} onClick={() => openEdit(bill)}><Edit2 size={14} /></button>
                      <button className="icon-btn" aria-label={`Delete bill ${bill.name}`} style={{ color:'var(--danger)' }} onClick={() => setConfirm({ open:true, id:bill.id })}><Trash2 size={14} /></button>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editMode ? 'Edit Bill' : 'Add Bill'}>
        <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
          <div><label style={{ display:'block', marginBottom:'0.4rem' }}>Bill Name</label><input required value={formData.name} onChange={e => setFormData({...formData, name:e.target.value})} placeholder="e.g. Electricity Bill" /></div>
          <div><label style={{ display:'block', marginBottom:'0.4rem' }}>{`Amount (${getCurrencyLabel()})`}</label><CurrencyInput required value={formData.amount} onChange={v => setFormData({...formData, amount:v})} /></div>
          <div><label style={{ display:'block', marginBottom:'0.4rem' }}>Due Date</label><input type="date" required value={formData.due_date} onChange={e => setFormData({...formData, due_date:e.target.value})} /></div>
          <div>
            <label style={{ display:'block', marginBottom:'0.4rem' }}>Frequency</label>
            <div style={{ display:'flex', gap:'0.5rem', flexWrap:'wrap' }}>
              {FREQUENCIES.map(f => (
                <button key={f} type="button" onClick={() => setFormData({...formData, frequency:f})}
                  style={{ padding:'0.4rem 1rem', borderRadius:8, border:'none', cursor:'pointer', fontSize:'0.78rem',
                    background: formData.frequency===f ? 'linear-gradient(135deg,#818cf8,#a78bfa)' : 'rgba(255,255,255,0.05)',
                    color: formData.frequency===f ? '#fff' : 'var(--mm-text-3)' }}>{f}</button>
              ))}
            </div>
          </div>
          <div>
            <label style={{ display:'block', marginBottom:'0.4rem' }}>Category</label>
            <select value={formData.category} onChange={e => setFormData({...formData, category:e.target.value})} style={{ width:'100%' }}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div style={{ display:'flex', justifyContent:'flex-end', gap:'0.75rem', marginTop:'0.5rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary">{editMode ? 'Update' : 'Add Bill'}</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={Boolean(payModalBill)} onClose={() => setPayModalBill(null)} title={payModalBill ? `💳 Pay Bill: ${payModalBill.name}` : 'Pay Bill'}>
        {payModalBill && (
          <form onSubmit={handleConfirmPayBill} style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
            <div>
              <label style={{ display:'block', marginBottom:'0.4rem', fontSize:'0.82rem' }}>{`Exact Bill Amount (${getCurrencyLabel()})`}</label>
              <CurrencyInput required value={payModalData.amount} onChange={v => setPayModalData({ ...payModalData, amount: v })} />
            </div>
            <div>
              <label style={{ display:'block', marginBottom:'0.4rem', fontSize:'0.82rem' }}>Payment Date</label>
              <input type="date" required value={payModalData.date} onChange={e => setPayModalData({ ...payModalData, date: e.target.value })} style={{ width:'100%' }} />
            </div>
            <div style={{ padding:'0.75rem', borderRadius:12, background:'rgba(6,182,212,0.06)', border:'1px solid rgba(6,182,212,0.22)' }}>
              <label style={{ display:'block', marginBottom:'0.4rem', fontSize:'0.82rem', fontWeight:700, color:'#06b6d4' }}>
                🏦 Choose Account to Deduct From
              </label>
              <select
                value={payModalData.account_id}
                onChange={e => setPayModalData({ ...payModalData, account_id: e.target.value })}
                style={{ width:'100%', padding:'0.65rem', borderRadius:10 }}
              >
                <option value="">🔕 Do not deduct from any account (Mark paid only)</option>
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>
                    💳 {a.name} — Avl: {formatCurrency(a.balance || 0)}
                  </option>
                ))}
              </select>
              {(() => {
                const selAcc = accounts.find(a => String(a.id) === String(payModalData.account_id));
                if (!selAcc) {
                  return (
                    <div style={{ marginTop:'0.45rem', fontSize:'0.72rem', color:'var(--mm-warning)' }}>
                      ℹ️ Reminder-only mode: marks bill paid / advances due date without deducting from any account.
                    </div>
                  );
                }
                const curBal = parseFloat(selAcc.balance) || 0;
                const afterBal = curBal - (parseFloat(payModalData.amount) || 0);
                return (
                  <div style={{ marginTop:'0.5rem', display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:'0.74rem', padding:'0.4rem 0.6rem', borderRadius:8, background:'rgba(0,0,0,0.25)' }}>
                    <span style={{ color:'var(--text-secondary)' }}>
                      Current: <strong style={{ color:'var(--text-primary)' }}>{formatCurrency(curBal)}</strong>
                    </span>
                    <span style={{ color: afterBal < 0 ? 'var(--mm-danger)' : 'var(--mm-success)', fontWeight:700 }}>
                      After Payment: {formatCurrency(afterBal)}
                    </span>
                  </div>
                );
              })()}
            </div>
            <div style={{ display:'flex', justifyContent:'flex-end', gap:'0.75rem', marginTop:'0.5rem' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setPayModalBill(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary">
                {payModalData.account_id ? '💳 Confirm & Deduct Payment' : '✅ Mark Paid Only'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmDialog open={confirm.open} title="Delete Bill" message="Remove this bill reminder?" confirmLabel="Delete" danger onConfirm={doDelete} onCancel={() => setConfirm({ open:false, id:null })} />
    </PageWrapper>
  );
};

export default Bills;