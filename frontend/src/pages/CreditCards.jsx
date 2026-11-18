import { PageHeader, StatGrid, StatCard } from '../components/ui';
import MoreSection from '../components/MoreSection';
import { useState, useEffect, useMemo } from 'react';
import { InsightCreditCards } from '../components/InsightPanels';
import useLiveData from '../utils/useLiveData';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, Edit2, CreditCard, Zap, AlertTriangle, CheckCircle, Calculator } from 'lucide-react';
import PageWrapper from '../components/PageWrapper';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import SkeletonLoader from '../components/SkeletonLoader';
import CurrencyInput from '../components/CurrencyInput';
import toast from 'react-hot-toast';
import { fetchCreditCards, createCreditCard, updateCreditCard, deleteCreditCard, recordCardPayment, recordCardCharge, fetchAccounts, getCache } from '../utils/api';
import { formatCurrency, getCurrencyLabel } from '../utils/format';
import { predictCategory } from '../utils/autoCategorize';
import { todayYMD } from '../utils/dates';

const CARD_COLORS = ['#818cf8','#a855f7','#06b6d4','#f59e0b','#ef4444','#10b981','#f97316','#ec4899'];
const CARD_NETWORKS = ['Visa', 'Mastercard', 'Amex', 'Discover', 'UnionPay', 'Other'];

// Parse 'YYYY-MM-DD' as a LOCAL date (new Date('YYYY-MM-DD') is UTC and can shift a day)
const parseYMD = (dateStr) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr || '');
  if (!m) return null;
  return { y: +m[1], mo: +m[2] - 1, d: +m[3] };
};

const daysUntil = (dateStr) => {
  if (!dateStr) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const p = parseYMD(dateStr);
  const due = p ? new Date(p.y, p.mo, p.d) : new Date(dateStr);
  if (Number.isNaN(due.getTime())) return null;
  due.setHours(0, 0, 0, 0);
  return Math.round((due - today) / (1000 * 60 * 60 * 24));
};

const getCardMinPayment = (balance, minPct = 2) => {
  const b = Math.max(0, Number(balance) || 0);
  if (b <= 0) return 0;
  return parseFloat(Math.min(b, Math.max(10, b * (minPct || 2) / 100)).toFixed(2));
};

// +1 month, clamped to month end (Jan 31 → Feb 28/29, not Mar 3)
const rollDateNextMonth = (dateStr) => {
  const p = parseYMD(dateStr);
  if (!p) return dateStr || '';
  const ny = p.mo === 11 ? p.y + 1 : p.y;
  const nm = (p.mo + 1) % 12;
  const lastDay = new Date(ny, nm + 1, 0).getDate();
  const nd = Math.min(p.d, lastDay);
  return `${ny}-${String(nm + 1).padStart(2, '0')}-${String(nd).padStart(2, '0')}`;
};

// Computes interest-free float days if swiped today + cycle status
const computeCardGraceStats = (card) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayDay = today.getDate();
  const daysInThisMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();

  let stmtDay = null;
  const sd = parseYMD(card.statement_date);
  const dd = parseYMD(card.due_date);
  if (sd) {
    stmtDay = sd.d;
  } else if (dd) {
    stmtDay = dd.d - 20;
    if (stmtDay <= 0) stmtDay += 30;
  }
  if (stmtDay !== null) stmtDay = Math.min(stmtDay, daysInThisMonth);

  let daysToNextStmt = 18; // sensible fallback
  if (stmtDay !== null) {
    if (todayDay <= stmtDay) {
      daysToNextStmt = stmtDay - todayDay;
    } else {
      daysToNextStmt = (daysInThisMonth - todayDay) + stmtDay;
    }
  }

  const graceAfterStmt = 21; // standard 21-day grace period between statement close & payment due
  const floatDays = Math.max(20, Math.min(52, daysToNextStmt + graceAfterStmt));
  const util = card.credit_limit > 0 ? ((card.balance || 0) / card.credit_limit) * 100 : 0;
  const available = Math.max(0, (card.credit_limit || 0) - (card.balance || 0));

  // Composite score: prioritize cards with available credit, <30% utilization, and longest float days
  const utilBonus = util < 30 ? 25 : util < 50 ? 10 : -20;
  const score = available > 0 ? floatDays + utilBonus - (util * 0.25) : -999;

  return {
    floatDays,
    daysToNextStmt,
    stmtDay,
    util,
    available,
    score,
    cycleStatus: daysToNextStmt >= 24 ? 'New Cycle Just Started (Max Float!)' : daysToNextStmt <= 5 ? 'Statement Closing Soon' : 'Mid Billing Cycle'
  };
};

// Months to pay off at minimum payment
const calcPayoff = (balance, apr, minPct) => {
  if (balance <= 0) return { months: 0, totalInterest: 0 };
  const monthlyRate = (apr || 0) / 100 / 12;
  let bal = Number(balance) || 0, months = 0, totalInterest = 0;
  while (bal > 0 && months < 600) {
    const interest = parseFloat((bal * monthlyRate).toFixed(2));
    const minPayment = getCardMinPayment(bal + interest, minPct);
    const payment = Math.min(bal + interest, minPayment);
    if (payment <= interest && interest > 0) {
      months = 600;
      break;
    }
    totalInterest += interest;
    bal = parseFloat((bal + interest - payment).toFixed(2));
    months++;
    if (bal <= 0) break;
  }
  return { months, totalInterest: parseFloat(totalInterest.toFixed(2)) };
};

const UtilizationRing = ({ used, limit, color }) => {
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  const R = 28, circ = 2 * Math.PI * R;
  const ringColor = pct >= 90 ? '#f87171' : pct >= 70 ? '#fbbf24' : color || '#4ade80';
  return (
    <svg width={68} height={68} style={{ flexShrink: 0 }}>
      <circle cx={34} cy={34} r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={6}/>
      <circle cx={34} cy={34} r={R} fill="none" stroke={ringColor} strokeWidth={6}
        strokeDasharray={`${(pct/100)*circ} ${circ}`}
        strokeLinecap="round" transform="rotate(-90 34 34)"
        style={{ transition:'stroke-dasharray 1s ease, stroke 0.3s ease', filter:`drop-shadow(0 0 4px ${ringColor}80)` }}/>
      <text x={34} y={38} textAnchor="middle" fill={ringColor} fontSize={11} fontFamily="Outfit, sans-serif" fontWeight={700}>{Math.round(pct)}%</text>
    </svg>
  );
};

const defaultForm = { name: '', bank: '', last4: '', network: 'Visa', credit_limit: 0, balance: 0, apr: 0, statement_date: '', due_date: '', min_payment_pct: 2, color: CARD_COLORS[0] };

const CreditCards = () => {
  const [cards, setCards] = useState(() => getCache('credit_cards') || []);
  const [accounts, setAccounts] = useState(() => getCache('accounts') || []);
  const [loading, setLoading] = useState(() => !getCache('credit_cards'));
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [currentId, setCurrentId] = useState(null);
  const [formData, setFormData] = useState(defaultForm);
  const [confirm, setConfirm] = useState({ open: false, id: null });
  const [payModal, setPayModal] = useState(null); // card object
  const [payAmount, setPayAmount] = useState(0);
  const [payAccountId, setPayAccountId] = useState('');
  const [rollDueNextMonth, setRollDueNextMonth] = useState(true);
  const [paying, setPaying] = useState(false);
  const [expandedId, setExpandedId] = useState(null); // card with payoff detail open
  const [chargeModal, setChargeModal] = useState(null); // card to add charge to
  const [chargeAmt, setChargeAmt] = useState(0);
  const [chargeCategory, setChargeCategory] = useState('Shopping');
  const [chargeNotes, setChargeNotes] = useState('');
  const [chargeDate, setChargeDate] = useState(() => todayYMD());
  const [chargeLogTx, setChargeLogTx] = useState(true);

  useEffect(() => { load(!!getCache('credit_cards')); }, []);
  useLiveData(() => load(true));

  const load = async (silent) => {
    try {
      if (silent !== true) setLoading(true);
      const [cds, accs] = await Promise.all([fetchCreditCards(), fetchAccounts()]);
      setCards(cds);
      setAccounts(accs);
      if (accs.length > 0) setPayAccountId(accs[0].id);
    } catch { toast.error('Failed to load credit cards'); }
    finally { setLoading(false); }
  };

  const openAdd = () => {
    setEditMode(false); setCurrentId(null);
    setFormData({ ...defaultForm, color: CARD_COLORS[cards.length % CARD_COLORS.length] });
    setIsModalOpen(true);
  };

  const openEdit = (card) => {
    setEditMode(true); setCurrentId(card.id);
    setFormData({ name: card.name || '', bank: card.bank || '', last4: card.last4 || '', network: card.network || 'Visa', credit_limit: card.credit_limit || 0, balance: card.balance || 0, apr: card.apr || 0, statement_date: card.statement_date || '', due_date: card.due_date || '', min_payment_pct: card.min_payment_pct || 2, color: card.color || CARD_COLORS[0] });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const data = {
        ...formData,
        credit_limit: parseFloat(parseFloat(formData.credit_limit).toFixed(2)),
        balance: parseFloat(parseFloat(formData.balance).toFixed(2)),
        apr: parseFloat(parseFloat(formData.apr).toFixed(2)),
        min_payment_pct: parseFloat(parseFloat(formData.min_payment_pct).toFixed(2)),
      };
      if (editMode) { await updateCreditCard(currentId, data); toast.success('Card updated'); }
      else { await createCreditCard(data); toast.success('Card added'); }
      setIsModalOpen(false); load();
    } catch { toast.error('Failed to save card'); }
  };

  const doDelete = async () => {
    try { await deleteCreditCard(confirm.id); toast.success('Card removed'); load(); }
    catch (error) { toast.error(error.message || 'Failed to delete'); }
    finally { setConfirm({ open: false, id: null }); }
  };

  const openPay = (card) => {
    setPayModal(card);
    setRollDueNextMonth(true);
    // Default to minimum payment
    const minAmt = parseFloat(Math.max(10, (card.balance || 0) * (card.min_payment_pct || 2) / 100).toFixed(2));
    setPayAmount(Math.min(minAmt, card.balance || 0));
    if (accounts.length > 0) setPayAccountId(accounts[0].id);
  };

  const handlePay = async () => {
    if (!payModal || payAmount <= 0) return;
    setPaying(true);
    try {
      await recordCardPayment(payModal, parseFloat(payAmount), payAccountId);
      if (rollDueNextMonth && (payModal.due_date || payModal.statement_date)) {
        const updates = {};
        if (payModal.due_date) updates.due_date = rollDateNextMonth(payModal.due_date);
        if (payModal.statement_date) updates.statement_date = rollDateNextMonth(payModal.statement_date);
        await updateCreditCard(payModal.id, updates);
      }
      const selAcc = accounts.find(a => String(a.id) === String(payAccountId));
      toast.success(
        selAcc
          ? `✅ Paid ${formatCurrency(payAmount)} from "${selAcc.name}"${rollDueNextMonth && payModal.due_date ? ' & cycle rolled +1 mo' : ''}`
          : `✅ Card balance reduced by ${formatCurrency(payAmount)} (no bank account deduction)`
      );
      setPayModal(null);
      load();
    } catch { toast.error('Payment failed'); }
    finally { setPaying(false); }
  };

  const handleCharge = async () => {
    if (!chargeModal || chargeAmt <= 0) return;
    try {
      const amt = parseFloat(chargeAmt);
      await recordCardCharge(chargeModal, {
        amount: amt,
        date: chargeDate || todayYMD(),
        category: chargeCategory || 'Shopping',
        notes: chargeNotes.trim(),
        logTransaction: chargeLogTx,
      });
      toast.success(
        chargeLogTx
          ? `💳 ${formatCurrency(amt)} charged to ${chargeModal.name} & logged in ${chargeCategory || 'Shopping'}`
          : `💳 ${formatCurrency(amt)} charged to ${chargeModal.name}`
      );
      setChargeModal(null);
      setChargeAmt(0);
      setChargeNotes('');
      load();
    } catch { toast.error('Failed to add charge'); }
  };

  // Aggregate stats
  const totalLimit = cards.reduce((s, c) => s + (c.credit_limit || 0), 0);
  const totalBalance = cards.reduce((s, c) => s + (c.balance || 0), 0);
  const totalAvailable = totalLimit - totalBalance;
  const overallUtil = totalLimit > 0 ? (totalBalance / totalLimit) * 100 : 0;
  const totalMinPayment = cards.reduce((s, c) => s + getCardMinPayment(c.balance, c.min_payment_pct), 0);
  const dueThisWeek = cards.filter(c => { const d = daysUntil(c.due_date); return d !== null && d >= 0 && d <= 7; });

  const rankedCards = useMemo(() => {
    return cards
      .map(c => ({ card: c, grace: computeCardGraceStats(c) }))
      .sort((a, b) => b.grace.score - a.grace.score);
  }, [cards]);

  const bestPick = rankedCards.length > 0 && rankedCards[0].grace.available > 0 ? rankedCards[0] : null;

  return (
    <PageWrapper>
      <div>
        {/* Header */}
        <PageHeader title="Credit Cards" subtitle="Utilization tracking, statement cycles, and payoff projections">
          <button className="btn btn-primary" onClick={openAdd}><Plus size={16}/> Add Card</button>
        </PageHeader>

        {loading ? <SkeletonLoader rows={3} height={140}/> : (
          <>
            {/* Summary strip */}
            {cards.length > 0 && (
              <StatGrid className="cc-stats">
                <StatCard label="Total limit" value={formatCurrency(totalLimit)} tone="accent" />
                <StatCard label="Total owed" value={formatCurrency(totalBalance)} tone="neg" />
                <StatCard label="Available credit" value={formatCurrency(totalAvailable)} tone="pos" />
                <StatCard label="Overall utilisation" value={`${overallUtil.toFixed(1)}%`} tone={overallUtil >= 70 ? 'neg' : overallUtil >= 30 ? 'warn' : 'pos'} />
                <StatCard label="Min payments due" value={formatCurrency(parseFloat(totalMinPayment.toFixed(2)))} tone="warn" />
                <StatCard label="Due this week" value={dueThisWeek.length > 0 ? `${dueThisWeek.length} card${dueThisWeek.length > 1 ? 's' : ''}` : 'None'} tone={dueThisWeek.length > 0 ? 'neg' : 'pos'} />
              </StatGrid>
            )}

            <MoreSection title="Card insights" hint="Utilisation, statements & best card to use">
            <InsightCreditCards cards={cards} />
            {/* 🏆 Best Card to Swipe Today & Grace-Period Advisor */}
            {bestPick && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                  background: 'linear-gradient(135deg, rgba(74,222,128,0.1) 0%, rgba(129,140,248,0.08) 100%)',
                  border: '1px solid rgba(74,222,128,0.32)',
                  borderRadius: 16,
                  padding: '1rem 1.25rem',
                  marginBottom: '1.5rem',
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '1rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flex: '1 1 280px' }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 12,
                    background: 'rgba(74,222,128,0.16)', border: '1px solid rgba(74,222,128,0.38)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.35rem', flexShrink: 0
                  }}>
                    🏆
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '1.2px', color: '#4ade80', textTransform: 'uppercase' }}>
                        Best Card to Swipe Today
                      </span>
                      <span style={{ fontSize: '0.66rem', fontFamily: 'Inter, sans-serif', fontWeight: 700, padding: '0.1rem 0.45rem', borderRadius: 6, background: 'rgba(6,182,212,0.16)', color: '#06b6d4', border: '1px solid rgba(6,182,212,0.35)' }}>
                        🛡️ ~{bestPick.grace.floatDays} Days Interest-Free Float
                      </span>
                    </div>
                    <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: 2 }}>
                      {bestPick.card.name} {bestPick.card.last4 ? `(··${bestPick.card.last4})` : ''}
                    </div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', fontFamily: 'Inter, sans-serif', marginTop: 2 }}>
                      {bestPick.grace.cycleStatus} · Next statement in <strong>{bestPick.grace.daysToNextStmt}d</strong> · Utilization <strong>{bestPick.grace.util.toFixed(0)}%</strong> ({formatCurrency(bestPick.grace.available)} available)
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => { setChargeModal(bestPick.card); setChargeAmt(0); }}
                    style={{
                      padding: '0.48rem 0.95rem', borderRadius: 10,
                      background: 'rgba(74,222,128,0.18)', border: '1px solid rgba(74,222,128,0.45)',
                      color: '#4ade80', fontFamily: 'Inter, sans-serif', fontSize: '0.78rem', fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    💳 Swipe / Charge {bestPick.card.name}
                  </button>
                </div>
              </motion.div>
            )}

            </MoreSection>
            {/* Credit health alert */}
            {overallUtil >= 30 && cards.length > 0 && (
              <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }}
                style={{ background: overallUtil >= 70 ? 'rgba(248,113,113,0.08)' : 'rgba(251,191,36,0.08)', border:`1px solid ${overallUtil >= 70 ? 'rgba(248,113,113,0.3)' : 'rgba(251,191,36,0.3)'}`, borderRadius:12, padding:'0.875rem 1.25rem', marginBottom:'1.5rem', display:'flex', alignItems:'center', gap:'0.75rem' }}>
                <AlertTriangle size={18} style={{ color: overallUtil >= 70 ? '#f87171' : '#fbbf24', flexShrink:0 }}/>
                <div style={{ fontFamily:'Inter, sans-serif', fontSize:'0.82rem' }}>
                  <span style={{ fontWeight:600, color: overallUtil >= 70 ? '#f87171' : '#fbbf24' }}>
                    {overallUtil >= 70 ? 'High utilization detected' : 'Moderate utilization'}
                  </span>
                  <span style={{ color:'var(--text-muted)', marginLeft:'0.5rem' }}>
                    — {overallUtil.toFixed(1)}% of total credit used. {overallUtil >= 70 ? 'This may hurt your credit score.' : 'Keep below 30% for best credit score.'}
                  </span>
                </div>
              </motion.div>
            )}

            {/* Empty state */}
            {cards.length === 0 && (
              <div className="bento-item col-span-12" style={{ alignItems:'center', justifyContent:'center', padding:'4rem', textAlign:'center', flexDirection:'column', gap:'1rem' }}>
                <CreditCard size={56} style={{ opacity:0.15 }}/>
                <p style={{ fontFamily:'Inter, sans-serif', color:'var(--text-muted)', margin:0 }}>NO CREDIT CARDS YET. ADD YOUR FIRST CARD.</p>
                <button className="btn btn-primary" onClick={openAdd}><Plus size={15}/> Add Card</button>
              </div>
            )}

            {/* Card list */}
              {cards.map((card) => {
                const util = card.credit_limit > 0 ? (card.balance / card.credit_limit) * 100 : 0;
                const utilColor = util >= 50 ? '#f87171' : util >= 30 ? '#fbbf24' : '#4ade80';
                const utilZoneLabel = util >= 50 ? 'High Risk (>50%)' : util >= 30 ? 'Elevated (30–50%)' : 'Optimal (<30%)';
                const target30Amt = Math.max(0, (card.balance || 0) - ((card.credit_limit || 0) * 0.3));
                const days = daysUntil(card.due_date);
                const daysColor = days === null ? '#555' : days < 0 ? '#f87171' : days <= 3 ? '#f87171' : days <= 7 ? '#fbbf24' : '#4ade80';
                const minPay = getCardMinPayment(card.balance, card.min_payment_pct);
                const available = (card.credit_limit || 0) - (card.balance || 0);
                const isExpanded = expandedId === card.id;
                const payoff = isExpanded ? calcPayoff(card.balance, card.apr, card.min_payment_pct) : null;
                const grace = computeCardGraceStats(card);

                return (
                  <div key={card.id} style={{ marginBottom:'0.875rem' }}>

                    {/* Card face */}
                    <div style={{ background:'var(--bg-surface)', border:'1px solid var(--mm-border-subtle, rgba(255,255,255,0.08))', borderLeft:`3px solid ${card.color || '#818cf8'}`, borderRadius:14, padding:'1.25rem 1.5rem', position:'relative', overflow:'hidden' }}>

                      {/* Card top row */}
                      <div style={{ display:'flex', alignItems:'center', gap:'1rem', marginBottom:'1rem' }}>
                        {/* Network badge */}
                        <div style={{ width:44, height:28, borderRadius:7, background:`${card.color || '#818cf8'}25`, border:`1px solid ${card.color || '#818cf8'}40`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                          <CreditCard size={16} style={{ color: card.color || '#818cf8' }}/>
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', flexWrap:'wrap' }}>
                            <span style={{ fontWeight:700, fontSize:'1rem', color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                              {card.name}
                            </span>
                            <span style={{ fontSize:'0.62rem', fontFamily:'Inter, sans-serif', fontWeight:700, padding:'0.12rem 0.45rem', borderRadius:6, background:`${utilColor}18`, color:utilColor, border:`1px solid ${utilColor}35` }}>
                              {utilZoneLabel}
                            </span>
                            <span style={{ fontSize:'0.62rem', fontFamily:'Inter, sans-serif', fontWeight:600, padding:'0.12rem 0.45rem', borderRadius:6, background:'rgba(6,182,212,0.14)', color:'#06b6d4', border:'1px solid rgba(6,182,212,0.3)' }}>
                              🛡️ ~{grace.floatDays}d Float
                            </span>
                            {(card.balance || 0) <= 0 ? (
                              <span style={{ fontSize:'0.62rem', fontFamily:'Inter, sans-serif', fontWeight:700, padding:'0.12rem 0.5rem', borderRadius:6, background:'rgba(16,185,129,0.14)', color:'#34d399', border:'1px solid rgba(16,185,129,0.35)' }}>
                                ✅ Paid in Full · 0% Interest
                              </span>
                            ) : days !== null && (
                              <span style={{ fontSize:'0.62rem', fontFamily:'Inter, sans-serif', fontWeight:700, padding:'0.12rem 0.5rem', borderRadius:6, background:`${daysColor}18`, color:daysColor, border:`1px solid ${daysColor}40` }}>
                                {days < 0 ? `🚨 ${Math.abs(days)}d Overdue` : days === 0 ? '⚡ Due Today' : `⏰ Due in ${days}d`}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize:'0.72rem', color:'var(--text-muted)', fontFamily:'Inter, sans-serif', marginTop:2 }}>
                            {card.bank && `${card.bank} · `}{card.network} {card.last4 && `·· ${card.last4}`}
                          </div>
                        </div>
                        {/* Utilization ring */}
                        <UtilizationRing used={card.balance || 0} limit={card.credit_limit || 0} color={card.color}/>
                      </div>

                      {/* Stats row */}
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:'0.75rem', marginBottom:'1rem' }}>
                        <div>
                          <div style={{ fontSize:'0.62rem', fontFamily:'Inter, sans-serif', color:'var(--text-muted)', letterSpacing:'1px', marginBottom:'0.2rem' }}>BALANCE</div>
                          <div style={{ fontFamily:'Inter, sans-serif', fontWeight:700, fontSize:'0.95rem', color:'#f87171' }}>{formatCurrency(card.balance || 0)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize:'0.62rem', fontFamily:'Inter, sans-serif', color:'var(--text-muted)', letterSpacing:'1px', marginBottom:'0.2rem' }}>LIMIT</div>
                          <div style={{ fontFamily:'Inter, sans-serif', fontWeight:700, fontSize:'0.95rem', color:'var(--text-primary)' }}>{formatCurrency(card.credit_limit || 0)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize:'0.62rem', fontFamily:'Inter, sans-serif', color:'var(--text-muted)', letterSpacing:'1px', marginBottom:'0.2rem' }}>AVAILABLE</div>
                          <div style={{ fontFamily:'Inter, sans-serif', fontWeight:700, fontSize:'0.95rem', color:'#4ade80' }}>{formatCurrency(available)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize:'0.62rem', fontFamily:'Inter, sans-serif', color:'var(--text-muted)', letterSpacing:'1px', marginBottom:'0.2rem' }}>APR</div>
                          <div style={{ fontFamily:'Inter, sans-serif', fontWeight:700, fontSize:'0.95rem', color:'var(--text-secondary)' }}>{(card.apr || 0).toFixed(1)}%</div>
                        </div>
                      </div>

                      {/* Utilization bar with 30% Credit Score Threshold Marker */}
                      <div style={{ marginBottom:'1rem' }}>
                        <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.68rem', fontFamily:'Inter, sans-serif', color:'var(--text-muted)', marginBottom:'0.35rem', flexWrap:'wrap', gap:'0.35rem' }}>
                          <span>
                            Utilization: <strong style={{ color: utilColor }}>{util.toFixed(1)}%</strong>
                            {target30Amt > 0 && (
                              <span style={{ color: '#fbbf24', marginLeft: '0.5rem' }}>
                                · Pay {formatCurrency(target30Amt)} to reach &lt;30% optimal zone
                              </span>
                            )}
                          </span>
                          {card.due_date && (
                            <span style={{ color: daysColor }}>
                              {days === null ? '' : days < 0 ? `⚠ ${Math.abs(days)}d overdue` : days === 0 ? '⚠ Due TODAY' : `Due in ${days}d`}
                            </span>
                          )}
                        </div>
                        <div style={{ height:7, background:'rgba(255,255,255,0.06)', borderRadius:4, overflow:'hidden', position:'relative' }}>
                          <motion.div initial={{ width:0 }} animate={{ width:`${Math.min(100,util)}%` }} transition={{ duration:0.8, ease:'easeOut' }}
                            style={{ height:'100%', background:utilColor, borderRadius:4, boxShadow:`0 0 6px ${utilColor}80` }}/>
                          {/* 30% Optimal Utilization Marker */}
                          <div
                            title="30% Optimal Credit Utilization Limit"
                            style={{ position:'absolute', left:'30%', top:0, bottom:0, width:2, background:'rgba(255,255,255,0.6)', zIndex:2 }}
                          />
                        </div>
                        {(card.balance || 0) > 0 && (card.apr || 0) > 0 && (
                          <div style={{ marginTop:'0.45rem', fontSize:'0.68rem', color:'var(--text-secondary)', display:'flex', justifyContent:'space-between', flexWrap:'wrap', gap:'0.35rem' }}>
                            <span>
                              🛡️ Interest Shield: Pay full <strong>{formatCurrency(card.balance)}</strong> before due date to avoid <strong style={{ color:'#f87171' }}>~{formatCurrency(Math.round((card.balance * (card.apr / 100)) / 12))}/mo</strong> interest
                            </span>
                            {card.statement_date && <span>Statement: {card.statement_date}</span>}
                          </div>
                        )}
                      </div>

                      {/* Action buttons */}
                      <div style={{ display:'flex', gap:'0.5rem', flexWrap:'wrap', alignItems:'center' }}>
                        {/* Pay min */}
                        {card.balance > 0 && (
                          <button onClick={() => { openPay(card); }}
                            style={{ padding:'0.4rem 0.875rem', borderRadius:8, border:'1px solid rgba(74,222,128,0.3)', background:'rgba(74,222,128,0.1)', color:'#4ade80', cursor:'pointer', fontFamily:'Inter, sans-serif', fontSize:'0.75rem', fontWeight:600, display:'flex', alignItems:'center', gap:'0.3rem' }}>
                            <Zap size={13}/> Pay {formatCurrency(minPay)}
                          </button>
                        )}
                        {/* Pay full */}
                        {card.balance > 0 && (
                          <button onClick={() => { setPayModal(card); setPayAmount(card.balance); if(accounts.length>0) setPayAccountId(accounts[0].id); }}
                            style={{ padding:'0.4rem 0.875rem', borderRadius:8, border:'1px solid rgba(129,140,248,0.3)', background:'rgba(129,140,248,0.1)', color:'#818cf8', cursor:'pointer', fontFamily:'Inter, sans-serif', fontSize:'0.75rem', fontWeight:600, display:'flex', alignItems:'center', gap:'0.3rem' }}>
                            <CheckCircle size={13}/> Pay Full
                          </button>
                        )}
                        {/* Add charge */}
                        <button onClick={() => { setChargeModal(card); setChargeAmt(0); }}
                          style={{ padding:'0.4rem 0.875rem', borderRadius:8, border:'1px solid rgba(251,191,36,0.25)', background:'rgba(251,191,36,0.07)', color:'#fbbf24', cursor:'pointer', fontFamily:'Inter, sans-serif', fontSize:'0.75rem', fontWeight:600, display:'flex', alignItems:'center', gap:'0.3rem' }}>
                          + Charge
                        </button>
                        {/* Payoff detail toggle */}
                        {card.balance > 0 && (
                          <button onClick={() => setExpandedId(isExpanded ? null : card.id)}
                            style={{ padding:'0.4rem 0.875rem', borderRadius:8, border:'1px solid rgba(255,255,255,0.08)', background:'transparent', color:'var(--text-muted)', cursor:'pointer', fontFamily:'Inter, sans-serif', fontSize:'0.75rem', display:'flex', alignItems:'center', gap:'0.3rem' }}>
                            <Calculator size={13}/> Payoff
                          </button>
                        )}
                        <div style={{ marginLeft:'auto', display:'flex', gap:'0.25rem' }}>
                          <button className="icon-btn" aria-label={`Edit card ${card.name}`} onClick={() => openEdit(card)}><Edit2 size={14}/></button>
                          <button className="icon-btn" aria-label={`Delete card ${card.name}`} style={{ color:'var(--danger)' }} onClick={() => setConfirm({ open:true, id:card.id })}><Trash2 size={14}/></button>
                        </div>
                      </div>

                      {/* Payoff detail panel */}
                      <AnimatePresence>
                        {isExpanded && payoff && (
                          <motion.div initial={{ height:0, opacity:0 }} animate={{ height:'auto', opacity:1 }} exit={{ height:0, opacity:0 }} transition={{ duration:0.22 }}
                            style={{ overflow:'hidden' }}>
                            <div style={{ marginTop:'1rem', paddingTop:'1rem', borderTop:'1px solid rgba(255,255,255,0.06)' }}>
                              <div style={{ fontFamily:'Inter, sans-serif', fontSize:'0.68rem', letterSpacing:'2px', color:'var(--text-muted)', marginBottom:'0.75rem' }}>
                                <Calculator size={12} style={{ verticalAlign:'middle', marginRight:4 }}/> PAYOFF PROJECTION (minimum payments only)
                              </div>
                              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'0.75rem' }}>
                                <div style={{ background:'rgba(248,113,113,0.06)', border:'1px solid rgba(248,113,113,0.15)', borderRadius:10, padding:'0.75rem', textAlign:'center' }}>
                                  <div style={{ fontSize:'0.6rem', fontFamily:'Inter, sans-serif', color:'var(--text-muted)', letterSpacing:'1px', marginBottom:'0.3rem' }}>TIME TO PAYOFF</div>
                                  <div style={{ fontFamily:'Inter, sans-serif', fontWeight:700, fontSize:'1.1rem', color:'#f87171' }}>
                                    {payoff.months >= 600 ? '50+ yrs' : payoff.months > 12 ? `${Math.floor(payoff.months/12)}y ${payoff.months%12}m` : `${payoff.months}mo`}
                                  </div>
                                </div>
                                <div style={{ background:'rgba(251,191,36,0.06)', border:'1px solid rgba(251,191,36,0.15)', borderRadius:10, padding:'0.75rem', textAlign:'center' }}>
                                  <div style={{ fontSize:'0.6rem', fontFamily:'Inter, sans-serif', color:'var(--text-muted)', letterSpacing:'1px', marginBottom:'0.3rem' }}>TOTAL INTEREST</div>
                                  <div style={{ fontFamily:'Inter, sans-serif', fontWeight:700, fontSize:'1.1rem', color:'#fbbf24' }}>{formatCurrency(payoff.totalInterest)}</div>
                                </div>
                                <div style={{ background:'rgba(74,222,128,0.06)', border:'1px solid rgba(74,222,128,0.15)', borderRadius:10, padding:'0.75rem', textAlign:'center' }}>
                                  <div style={{ fontSize:'0.6rem', fontFamily:'Inter, sans-serif', color:'var(--text-muted)', letterSpacing:'1px', marginBottom:'0.3rem' }}>TOTAL PAID</div>
                                  <div style={{ fontFamily:'Inter, sans-serif', fontWeight:700, fontSize:'1.1rem', color:'#4ade80' }}>{formatCurrency(parseFloat(((card.balance||0) + payoff.totalInterest).toFixed(2)))}</div>
                                </div>
                              </div>
                              <div style={{ marginTop:'0.625rem', fontFamily:'Inter, sans-serif', fontSize:'0.7rem', color:'var(--text-muted)', textAlign:'center' }}>
                                💡 Paying {formatCurrency(parseFloat((minPay * 2).toFixed(2)))} per month would cut payoff time roughly in half
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                );
              })}

            {/* Due this week warning */}
            {dueThisWeek.length > 0 && (
              <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }}
                style={{ background:'rgba(248,113,113,0.07)', border:'1px solid rgba(248,113,113,0.25)', borderRadius:14, padding:'1rem 1.25rem', marginTop:'0.5rem' }}>
                <div style={{ fontFamily:'Inter, sans-serif', fontSize:'0.68rem', letterSpacing:'2px', color:'#f87171', marginBottom:'0.625rem' }}>⚠ PAYMENTS DUE THIS WEEK</div>
                {dueThisWeek.map(c => (
                  <div key={c.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'0.4rem 0', borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
                    <span style={{ fontFamily:'Inter, sans-serif', fontSize:'0.82rem' }}>{c.name}</span>
                    <span style={{ display:'flex', gap:'0.75rem', alignItems:'center' }}>
                      <span style={{ color:'#f87171', fontFamily:'Inter, sans-serif', fontWeight:600 }}>{formatCurrency(c.balance)}</span>
                      <span style={{ color:'var(--text-muted)', fontSize:'0.72rem', fontFamily:'Inter, sans-serif' }}>due in {daysUntil(c.due_date)}d</span>
                      <button onClick={() => openPay(c)}
                        style={{ padding:'0.25rem 0.6rem', borderRadius:7, background:'rgba(248,113,113,0.15)', border:'1px solid rgba(248,113,113,0.3)', color:'#f87171', cursor:'pointer', fontFamily:'Inter, sans-serif', fontSize:'0.7rem' }}>
                        Pay Now
                      </button>
                    </span>
                  </div>
                ))}
              </motion.div>
            )}
          </>
        )}
      </div>

      {/* ── Add/Edit Modal ── */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editMode ? 'Edit Credit Card' : 'Add Credit Card'}>
        <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem' }}>
            <div><label style={{ display:'block', marginBottom:'0.4rem' }}>Card Name</label><input required value={formData.name} onChange={e => setFormData({...formData, name:e.target.value})} placeholder="e.g. Chase Sapphire"/></div>
            <div><label style={{ display:'block', marginBottom:'0.4rem' }}>Bank / Issuer</label><input value={formData.bank} onChange={e => setFormData({...formData, bank:e.target.value})} placeholder="e.g. HSBC"/></div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem' }}>
            <div><label style={{ display:'block', marginBottom:'0.4rem' }}>Last 4 Digits</label><input maxLength={4} value={formData.last4} onChange={e => setFormData({...formData, last4:e.target.value.replace(/\D/,'')})} placeholder="1234"/></div>
            <div>
              <label style={{ display:'block', marginBottom:'0.4rem' }}>Network</label>
              <select value={formData.network} onChange={e => setFormData({...formData, network:e.target.value})} style={{ width:'100%' }}>
                {CARD_NETWORKS.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem' }}>
            <div><label style={{ display:'block', marginBottom:'0.4rem' }}>{`Credit Limit (${getCurrencyLabel()})`}</label><CurrencyInput required value={formData.credit_limit} onChange={v => setFormData({...formData, credit_limit:v})}/></div>
            <div><label style={{ display:'block', marginBottom:'0.4rem' }}>{`Current Balance (${getCurrencyLabel()})`}</label><CurrencyInput required value={formData.balance} onChange={v => setFormData({...formData, balance:v})}/></div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem' }}>
            <div><label style={{ display:'block', marginBottom:'0.4rem' }}>APR (%)</label><input type="number" step="0.01" min="0" max="100" value={formData.apr} onChange={e => setFormData({...formData, apr:e.target.value})} placeholder="18.99"/></div>
            <div><label style={{ display:'block', marginBottom:'0.4rem' }}>Min Payment (%)</label><input type="number" step="0.1" min="1" max="100" value={formData.min_payment_pct} onChange={e => setFormData({...formData, min_payment_pct:e.target.value})} placeholder="2"/></div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem' }}>
            <div><label style={{ display:'block', marginBottom:'0.4rem' }}>Statement Date</label><input type="date" value={formData.statement_date} onChange={e => setFormData({...formData, statement_date:e.target.value})}/></div>
            <div><label style={{ display:'block', marginBottom:'0.4rem' }}>Payment Due Date</label><input type="date" value={formData.due_date} onChange={e => setFormData({...formData, due_date:e.target.value})}/></div>
          </div>
          <div>
            <label style={{ display:'block', marginBottom:'0.6rem' }}>Card Color</label>
            <div style={{ display:'flex', gap:'0.5rem', flexWrap:'wrap' }}>
              {CARD_COLORS.map(c => (
                <button key={c} type="button" onClick={() => setFormData({...formData, color:c})}
                  style={{ width:28, height:28, borderRadius:8, background:c, border: formData.color === c ? '2px solid #fff' : '2px solid transparent', cursor:'pointer', boxShadow: formData.color === c ? `0 0 10px ${c}` : 'none', transition:'all 0.15s' }}/>
              ))}
            </div>
          </div>
          <div style={{ display:'flex', justifyContent:'flex-end', gap:'0.75rem', marginTop:'0.5rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary">{editMode ? 'Update' : 'Add Card'}</button>
          </div>
        </form>
      </Modal>

      {/* ── Payment Modal ── */}
      <Modal isOpen={!!payModal} onClose={() => setPayModal(null)} title={`Pay — ${payModal?.name || ''}`}>
        <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
          <div style={{ background:'rgba(255,255,255,0.03)', borderRadius:10, padding:'0.875rem 1rem' }}>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.82rem', fontFamily:'Inter, sans-serif', marginBottom:'0.4rem' }}>
              <span style={{ color:'var(--text-muted)' }}>Current Balance</span>
              <span style={{ color:'#f87171', fontWeight:700 }}>{formatCurrency(payModal?.balance || 0)}</span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.82rem', fontFamily:'Inter, sans-serif' }}>
              <span style={{ color:'var(--text-muted)' }}>Minimum Payment</span>
              <span style={{ color:'#fbbf24', fontWeight:600 }}>{formatCurrency(parseFloat(Math.max(10, (payModal?.balance||0) * (payModal?.min_payment_pct||2) / 100).toFixed(2)))}</span>
            </div>
          </div>
          <div>
            <label style={{ display:'block', marginBottom:'0.4rem' }}>Quick amounts</label>
            <div style={{ display:'flex', gap:'0.5rem', flexWrap:'wrap' }}>
              {[
                { label:'Min', val: Math.min(payModal?.balance||0, parseFloat(Math.max(10,(payModal?.balance||0)*(payModal?.min_payment_pct||2)/100).toFixed(2))) },
                { label:'Half', val: parseFloat(((payModal?.balance||0)/2).toFixed(2)) },
                { label:'Full', val: payModal?.balance || 0 },
              ].map(({ label, val }) => (
                <button key={label} type="button" onClick={() => setPayAmount(val)}
                  style={{ padding:'0.35rem 0.8rem', borderRadius:8, border: parseFloat(payAmount) === val ? '1px solid #4ade80' : '1px solid rgba(255,255,255,0.1)', background: parseFloat(payAmount) === val ? 'rgba(74,222,128,0.12)' : 'rgba(255,255,255,0.04)', color: parseFloat(payAmount) === val ? '#4ade80' : '#aaa', cursor:'pointer', fontFamily:'Inter, sans-serif', fontSize:'0.78rem' }}>
                  {label} ({formatCurrency(val)})
                </button>
              ))}
            </div>
          </div>
          <div>
            <label style={{ display:'block', marginBottom:'0.4rem' }}>{`Payment Amount (${getCurrencyLabel()})`}</label>
            <CurrencyInput aria-label="Payment amount" value={payAmount} onChange={v => setPayAmount(v)}/>
          </div>
          <div style={{ padding:'0.75rem', borderRadius:12, background:'rgba(6,182,212,0.06)', border:'1px solid rgba(6,182,212,0.22)' }}>
            <label style={{ display:'block', marginBottom:'0.4rem', fontSize:'0.82rem', fontWeight:700, color:'#06b6d4' }}>
              🏦 Choose Account to Deduct From
            </label>
            <select value={payAccountId} onChange={e => setPayAccountId(e.target.value)} style={{ width:'100%', padding:'0.6rem', borderRadius:8 }}>
              <option value="">🔕 Do not deduct from any account (Update card balance only)</option>
              {accounts.map(a => <option key={a.id} value={a.id}>💳 {a.name} — Avl: {formatCurrency(a.balance)}</option>)}
            </select>
            {(() => {
              const selAcc = accounts.find(a => String(a.id) === String(payAccountId));
              if (!selAcc) {
                return (
                  <div style={{ marginTop:'0.45rem', fontSize:'0.72rem', color:'#fbbf24' }}>
                    ℹ️ Card balance will be reduced without deducting from any bank account.
                  </div>
                );
              }
              const curBal = parseFloat(selAcc.balance) || 0;
              const afterBal = curBal - (parseFloat(payAmount) || 0);
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
          {(payModal?.due_date || payModal?.statement_date) && (
            <label style={{ display:'flex', alignItems:'center', gap:'0.6rem', padding:'0.7rem 0.85rem', borderRadius:10, background:'rgba(129,140,248,0.08)', border:'1px solid rgba(129,140,248,0.25)', cursor:'pointer', fontFamily:'Inter, sans-serif', fontSize:'0.8rem' }}>
              <input type="checkbox" checked={rollDueNextMonth} onChange={e => setRollDueNextMonth(e.target.checked)} style={{ width:16, height:16, accentColor:'#818cf8' }} />
              <span>
                📅 Roll due date +1 month
                {payModal?.due_date && <span style={{ color:'var(--text-muted)' }}> ({payModal.due_date} → {rollDateNextMonth(payModal.due_date)})</span>}
              </span>
            </label>
          )}
          <div style={{ display:'flex', justifyContent:'flex-end', gap:'0.75rem', marginTop:'0.5rem' }}>
            <button className="btn btn-secondary" onClick={() => setPayModal(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={handlePay} disabled={paying || payAmount <= 0}>
              {paying ? 'Processing…' : `Pay ${formatCurrency(parseFloat(payAmount || 0))}`}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Add Charge Modal ── */}
      <Modal isOpen={!!chargeModal} onClose={() => setChargeModal(null)} title={`Add Charge — ${chargeModal?.name || ''}`}>
        <div style={{ display:'flex', flexDirection:'column', gap:'0.9rem' }}>
          <div style={{ fontFamily:'Inter, sans-serif', fontSize:'0.82rem', color:'var(--text-muted)' }}>
            Current balance: <strong style={{ color:'#f87171' }}>{formatCurrency(chargeModal?.balance||0)}</strong> / {formatCurrency(chargeModal?.credit_limit||0)}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.75rem' }}>
            <div>
              <label style={{ display:'block', marginBottom:'0.35rem', fontSize:'0.8rem' }}>{`Charge Amount (${getCurrencyLabel()})`}</label>
              <CurrencyInput value={chargeAmt} onChange={v => setChargeAmt(v)}/>
            </div>
            <div>
              <label style={{ display:'block', marginBottom:'0.35rem', fontSize:'0.8rem' }}>Date</label>
              <input type="date" value={chargeDate} onChange={e => setChargeDate(e.target.value)} style={{ width:'100%' }} />
            </div>
          </div>
          <div>
            <label style={{ display:'block', marginBottom:'0.35rem', fontSize:'0.8rem' }}>Merchant / Description</label>
            <input
              value={chargeNotes}
              onChange={e => {
                const v = e.target.value;
                setChargeNotes(v);
                const pred = predictCategory(v, 'Expense');
                if (pred?.category) {
                  const clean = pred.category.split(' ').slice(1).join(' ') || pred.category;
                  setChargeCategory(clean);
                }
              }}
              placeholder="e.g. Keells, Uber, Amazon, Dialog…"
              style={{ width:'100%' }}
            />
          </div>
          <div>
            <label style={{ display:'block', marginBottom:'0.35rem', fontSize:'0.8rem' }}>Category</label>
            <input value={chargeCategory} onChange={e => setChargeCategory(e.target.value)} placeholder="Category" style={{ width:'100%', marginBottom:'0.45rem' }} />
            <div style={{ display:'flex', flexWrap:'wrap', gap:'0.3rem' }}>
              {['Shopping', 'Food', 'Groceries', 'Transport', 'Utilities', 'Entertainment', 'Travel', 'Health', 'Other'].map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setChargeCategory(cat)}
                  style={{
                    padding:'0.2rem 0.55rem',
                    borderRadius:999,
                    fontSize:'0.72rem',
                    fontFamily:'Inter, sans-serif',
                    cursor:'pointer',
                    background: chargeCategory === cat ? 'rgba(74,222,128,0.14)' : 'rgba(255,255,255,0.04)',
                    color: chargeCategory === cat ? '#4ade80' : 'var(--text-secondary)',
                    border: chargeCategory === cat ? '1px solid rgba(74,222,128,0.4)' : '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
          <label style={{ display:'flex', alignItems:'center', gap:'0.55rem', padding:'0.6rem 0.75rem', borderRadius:10, background:'rgba(56,189,248,0.08)', border:'1px solid rgba(56,189,248,0.25)', fontSize:'0.76rem', color:'var(--text-secondary)', cursor:'pointer', fontFamily:'Inter, sans-serif' }}>
            <input type="checkbox" checked={chargeLogTx} onChange={e => setChargeLogTx(e.target.checked)} style={{ width:15, height:15, accentColor:'#38bdf8' }} />
            <span>📊 Also record in Transactions &amp; Category Budgets (no bank deduction until card payment)</span>
          </label>
          <div style={{ display:'flex', justifyContent:'flex-end', gap:'0.75rem' }}>
            <button className="btn btn-secondary" onClick={() => setChargeModal(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleCharge} disabled={chargeAmt <= 0}>Add Charge</button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog open={confirm.open} title="Delete Card" message="Remove this credit card? All local data will be deleted." confirmLabel="Delete" danger onConfirm={doDelete} onCancel={() => setConfirm({ open:false, id:null })}/>
    </PageWrapper>
  );
};

export default CreditCards;
