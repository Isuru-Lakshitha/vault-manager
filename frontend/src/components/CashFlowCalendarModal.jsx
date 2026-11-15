import React, { useState, useEffect, useMemo, useCallback } from 'react';
import 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Modal from './Modal';
import { fetchAccounts, fetchTransactions, fetchBills, fetchLoans, fetchRecurringTransactions, fetchExchangeRates, updateBill } from '../utils/api';
import { advanceBill } from '../utils/billSchedule';
import { convertCurrency, formatCurrency, getCurrency, haptic } from '../utils/format';
import toast from 'react-hot-toast';
import { toYMD, todayYMD } from '../utils/dates';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function CashFlowCalendarModal({ isOpen, onClose }) {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDateStr, setSelectedDateStr] = useState(() => todayYMD());
  
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [bills, setBills] = useState([]);
  const [loans, setLoans] = useState([]);
  const [recurring, setRecurring] = useState([]);
  const [rates, setRates] = useState(null);
  const baseCur = getCurrency();
  const [, setLoading] = useState(true);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      const [accs, txs, bls, lns, recs, fx] = await Promise.all([
        fetchAccounts(),
        fetchTransactions(),
        fetchBills(),
        fetchLoans(),
        fetchRecurringTransactions().catch(() => []),
        fetchExchangeRates().catch(() => null),
      ]);
      setAccounts(accs || []);
      setTransactions(txs || []);
      setBills(bls || []);
      setLoans(lns || []);
      setRecurring(recs || []);
      if (fx) setRates(fx);
    } catch (err) {
      console.error('Failed to load cash flow calendar data:', err);
      toast.error('Failed to load calendar data');
    } finally {
      setLoading(false);
    }
  }, []);

  const toBase = useCallback((amt, cur) => {
    const val = Number(amt) || 0;
    const c = cur || baseCur;
    if (c === baseCur || !rates) return val;
    const conv = convertCurrency(val, c, baseCur, rates);
    return Number.isFinite(conv) ? conv : val;
  }, [baseCur, rates]);

  useEffect(() => {
    if (isOpen) {
      loadAll();
    }
  }, [isOpen, loadAll]);

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const goToToday = () => {
    const now = new Date();
    setCurrentDate(now);
    setSelectedDateStr(toYMD(now));
  };

  // Calendar Day generation
  const calendarDays = useMemo(() => {
    const firstDayIndex = new Date(year, month, 1).getDay();
    const daysInCurrentMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const days = [];

    // Prev month padding
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const dayNum = daysInPrevMonth - i;
      const prevDate = new Date(year, month - 1, dayNum);
      const dateStr = toYMD(prevDate);
      days.push({ day: dayNum, dateStr, isCurrentMonth: false });
    }

    // Current month days
    for (let i = 1; i <= daysInCurrentMonth; i++) {
      const d = new Date(year, month, i);
      const dateStr = toYMD(d);
      days.push({ day: i, dateStr, isCurrentMonth: true });
    }

    // Next month padding to make complete weeks (multiples of 7)
    const remaining = (7 - (days.length % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
      const nextDate = new Date(year, month + 1, i);
      const dateStr = toYMD(nextDate);
      days.push({ day: i, dateStr, isCurrentMonth: false });
    }

    return days;
  }, [year, month]);

  // Aggregate items by dateStr
  const itemsByDate = useMemo(() => {
    const map = {};

    const add = (dateStr, item) => {
      if (!dateStr) return;
      if (!map[dateStr]) {
        map[dateStr] = {
          transactions: [],
          bills: [],
          loans: [],
          recurring: [],
          totalInflow: 0,
          totalOutflow: 0,
        };
      }
      if (item.kind === 'tx') {
        map[dateStr].transactions.push(item);
        const amtBase = toBase(item.amount, item.currency);
        if (item.type === 'Income') map[dateStr].totalInflow += amtBase;
        else if (['Expense', 'Loan Payment'].includes(item.type)) map[dateStr].totalOutflow += amtBase;
      } else if (item.kind === 'bill') {
        map[dateStr].bills.push(item);
        if (!item.paid && item.status !== 'Paid') {
          map[dateStr].totalOutflow += toBase(item.amount, item.currency);
        }
      } else if (item.kind === 'loan') {
        map[dateStr].loans.push(item);
        map[dateStr].totalOutflow += toBase(item.amount, item.currency);
      } else if (item.kind === 'recurring') {
        map[dateStr].recurring.push(item);
        const amtBase = toBase(item.amount, item.currency);
        if (item.type === 'Income') map[dateStr].totalInflow += amtBase;
        else if (['Expense', 'Loan Payment'].includes(item.type)) map[dateStr].totalOutflow += amtBase;
      }
    };

    // 1. Active non-reversed Transactions
    transactions.forEach(t => {
      if (!t || t.reversed_at || t.reversal_of || t.is_transfer_fee) return;
      const dStr = (t.date || '').split('T')[0];
      if (dStr) add(dStr, { ...t, kind: 'tx' });
    });

    // 2. Bills (upcoming and historical by due_date)
    bills.forEach(b => {
      if (b.due_date) {
        const dStr = b.due_date.split('T')[0];
        add(dStr, { ...b, kind: 'bill' });
      }
    });

    const viewMonthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
    const lastDayOfViewMonth = new Date(year, month + 1, 0).getDate();
    const activeRecurring = (recurring || []).filter(r => r && !r.paused);
    const linkedLoanIds = new Set(activeRecurring.map(r => r.loan_id ? String(r.loan_id) : null).filter(Boolean));

    // 3. Loans (estimate monthly interest / installment on 25th or due_day, skipping months already paid or linked to recurring)
    loans.forEach(l => {
      if ((l.status || 'Active') === 'Active' && !linkedLoanIds.has(String(l.id))) {
        if (l.last_paid_month === viewMonthStr) return; // Already paid for this month (starts next month)
        const p = parseFloat(l.principal_amount) || 0;
        const apr = parseFloat(l.annual_interest_rate) || 0;
        const moInt = Math.round((p * (apr / 100)) / 12);
        const amt = Math.max(moInt, Number(l.monthly_installment || l.monthly_payment || l.emi || 0));
        if (amt > 0) {
          const dayOfMonth = l.due_day ? Math.min(lastDayOfViewMonth, Math.max(1, parseInt(l.due_day, 10))) : Math.min(25, lastDayOfViewMonth);
          const loanDateStr = `${viewMonthStr}-${String(dayOfMonth).padStart(2, '0')}`;
          add(loanDateStr, {
            ...l,
            kind: 'loan',
            name: l.item_name || l.name || l.loan_name || 'Gold Loan Payment',
            amount: amt
          });
        }
      }
    });

    // 4. Recurring rules (fixed day_of_month + flexible no-fixed-date rules, skipping months already paid)
    activeRecurring.forEach(r => {
      if (r.last_applied_month === viewMonthStr) return; // Already paid for this month (starts next month)
      let dStr = null;
      if (r.next_date && r.next_date.startsWith(viewMonthStr)) {
        dStr = r.next_date.split('T')[0];
      } else {
        let dom = parseInt(r.day_of_month, 10) || 0;
        if (!dom || r.schedule_mode === 'flexible') {
          const win = (r.flexible_window || '').toLowerCase();
          if (win.includes('early')) dom = 5;
          else if (win.includes('end')) dom = Math.min(25, lastDayOfViewMonth);
          else dom = 15;
        }
        dom = Math.min(dom, lastDayOfViewMonth);
        dStr = `${viewMonthStr}-${String(dom).padStart(2, '0')}`;
      }
      const estAmt = parseFloat(r.avg_amount || r.amount) || 0;
      add(dStr, {
        ...r,
        name: r.name || r.notes || r.category || 'Recurring Payment',
        amount: estAmt,
        kind: 'recurring'
      });
    });

    return map;
  }, [transactions, bills, loans, recurring, year, month, toBase]);

  // Liquid balance starting point & monthly projection
  const { totalInflowMonth, totalOutflowMonth, netCashFlowMonth, initialLiquid } = useMemo(() => {
    const liquid = (accounts || [])
      .filter(a => !['Credit Card', 'Loan', 'Mortgage', 'Liability', 'Credit', 'Investment'].includes(a.type) && !a.is_liability)
      .reduce((s, a) => s + Math.max(0, toBase(parseFloat(a.balance) || 0, a.currency)), 0);

    let inflow = 0;
    let outflow = 0;

    Object.entries(itemsByDate).forEach(([dStr, data]) => {
      const [y, m] = dStr.split('-').map(Number);
      if (y === year && m === month + 1) {
        inflow += data.totalInflow;
        outflow += data.totalOutflow;
      }
    });

    return {
      totalInflowMonth: inflow,
      totalOutflowMonth: outflow,
      netCashFlowMonth: inflow - outflow,
      initialLiquid: liquid,
    };
  }, [accounts, itemsByDate, year, month, toBase]);

  // Selected Day Details
  const selectedDayData = itemsByDate[selectedDateStr] || {
    transactions: [],
    bills: [],
    loans: [],
    recurring: [],
    totalInflow: 0,
    totalOutflow: 0
  };

  const handlePayBill = async (bill) => {
    try {
      const wasPaid = bill.paid;
      if (!wasPaid && bill.frequency && bill.frequency !== 'Once' && bill.due_date) {
        const nextBillState = advanceBill(bill);
        await updateBill(bill.id, { ...bill, ...nextBillState });
        toast.success(`✅ "${bill.name}" marked paid — next due: ${nextBillState.due_date} (no account deduction)`);
      } else {
        await updateBill(bill.id, { ...bill, paid: !wasPaid });
        toast.success(!wasPaid ? `✅ "${bill.name}" marked paid (no account deduction)` : `🔔 "${bill.name}" marked unpaid`);
      }
      haptic();
      loadAll();
    } catch {
      toast.error('Failed to update bill');
    }
  };

  const todayStr = todayYMD();

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="📅 Cash Flow Calendar" maxWidth="960px">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        
        {/* Top KPI Banner */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '0.75rem',
          padding: '1rem',
          background: 'rgba(255,255,255,0.02)',
          borderRadius: 14,
          border: '1px solid rgba(255,255,255,0.06)'
        }}>
          <div>
            <div style={{ fontSize: '0.72rem', color: '#777', fontFamily: 'Inter, sans-serif' }}>LIQUID RESERVES</div>
            <div style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: 2 }}>{formatCurrency(initialLiquid)}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', color: '#4ade80', fontFamily: 'Inter, sans-serif' }}>PROJECTED INFLOW</div>
            <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#4ade80', marginTop: 2 }}>+{formatCurrency(totalInflowMonth)}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', color: '#f87171', fontFamily: 'Inter, sans-serif' }}>COMMITTED OUTFLOW</div>
            <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#f87171', marginTop: 2 }}>-{formatCurrency(totalOutflowMonth)}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', color: netCashFlowMonth >= 0 ? '#38bdf8' : '#fbbf24', fontFamily: 'Inter, sans-serif' }}>NET MONTHLY DELTA</div>
            <div style={{
              fontSize: '1.15rem',
              fontWeight: 700,
              color: netCashFlowMonth >= 0 ? '#38bdf8' : '#fbbf24',
              marginTop: 2
            }}>
              {netCashFlowMonth >= 0 ? '+' : ''}{formatCurrency(netCashFlowMonth)}
            </div>
          </div>
        </div>

        {/* Navigation & Month Selector */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              onClick={prevMonth}
              style={{ padding: '0.45rem', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#ccc', cursor: 'pointer' }}
            >
              <ChevronLeft size={18} />
            </button>
            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'Inter, sans-serif', minWidth: 160, textAlign: 'center' }}>
              {MONTH_NAMES[month]} {year}
            </h3>
            <button
              onClick={nextMonth}
              style={{ padding: '0.45rem', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#ccc', cursor: 'pointer' }}
            >
              <ChevronRight size={18} />
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            {/* Legend chips */}
            <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.68rem', color: '#888' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: '#4ade80' }} /> Inflow</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: '#f87171' }} /> Bill</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: '#fbbf24' }} /> Loan</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: '#c084fc' }} /> Recurring</span>
            </div>
            <button
              onClick={goToToday}
              style={{
                padding: '0.35rem 0.8rem',
                borderRadius: 8,
                background: 'rgba(129,140,248,0.15)',
                border: '1px solid rgba(129,140,248,0.3)',
                color: '#818cf8',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Today
            </button>
          </div>
        </div>

        {/* Main Grid + Sidebar Split View */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.8fr) minmax(280px, 1.2fr)', gap: '1.25rem' }}>
          
          {/* Calendar Grid */}
          <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 14, border: '1px solid rgba(255,255,255,0.06)', padding: '0.75rem' }}>
            {/* Weekday headers */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', textAlign: 'center', marginBottom: '0.4rem' }}>
              {DAYS_OF_WEEK.map(d => (
                <div key={d} style={{ fontSize: '0.72rem', color: '#666', fontWeight: 600, padding: '0.25rem 0', fontFamily: 'Inter, sans-serif' }}>
                  {d}
                </div>
              ))}
            </div>

            {/* Days Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
              {calendarDays.map((cd, idx) => {
                const isSelected = cd.dateStr === selectedDateStr;
                const isToday = cd.dateStr === todayStr;
                const dData = itemsByDate[cd.dateStr];
                const hasInflow = dData && dData.totalInflow > 0;
                const hasBills = dData && dData.bills.length > 0;
                const hasLoans = dData && dData.loans.length > 0;
                const hasRecurring = dData && dData.recurring.length > 0;
                const hasExpenses = dData && dData.transactions.some(t => t.type === 'Expense');

                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => { setSelectedDateStr(cd.dateStr); haptic(5); }}
                    style={{
                      height: 58,
                      borderRadius: 10,
                      padding: '4px 6px',
                      background: isSelected
                        ? 'rgba(129,140,248,0.22)'
                        : isToday
                        ? 'rgba(74,222,128,0.08)'
                        : cd.isCurrentMonth
                        ? 'rgba(255,255,255,0.02)'
                        : 'rgba(255,255,255,0.005)',
                      border: isSelected
                        ? '1.5px solid #818cf8'
                        : isToday
                        ? '1.5px solid rgba(74,222,128,0.5)'
                        : '1px solid rgba(255,255,255,0.03)',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      cursor: 'pointer',
                      opacity: cd.isCurrentMonth ? 1 : 0.35,
                      transition: 'all 0.12s',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                      <span style={{
                        fontSize: '0.78rem',
                        fontWeight: isSelected || isToday ? 700 : 500,
                        color: isSelected ? '#818cf8' : isToday ? '#4ade80' : '#ddd',
                        fontFamily: 'Inter, sans-serif'
                      }}>
                        {cd.day}
                      </span>
                      {isToday && (
                        <span style={{ fontSize: '0.55rem', background: '#4ade80', color: 'var(--bg-void)', padding: '1px 3px', borderRadius: 4, fontWeight: 700 }}>
                          NOW
                        </span>
                      )}
                    </div>

                    {/* Indicator dots */}
                    <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap', marginTop: 2 }}>
                      {hasInflow && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80' }} />}
                      {hasBills && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f87171' }} />}
                      {hasLoans && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fbbf24' }} />}
                      {hasRecurring && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#c084fc' }} />}
                      {!hasBills && !hasLoans && !hasRecurring && hasExpenses && (
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444' }} />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected Day Agenda Drawer */}
          <div style={{
            background: 'rgba(255,255,255,0.02)',
            borderRadius: 14,
            border: '1px solid rgba(255,255,255,0.06)',
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            maxHeight: 460,
            overflowY: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', paddingBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div>
                <div style={{ fontSize: '0.7rem', color: '#777', textTransform: 'uppercase', letterSpacing: 1 }}>Selected Date</div>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'Inter, sans-serif' }}>
                  {new Date(selectedDateStr + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
              </div>

              {(selectedDayData.totalInflow > 0 || selectedDayData.totalOutflow > 0) && (
                <div style={{ textAlign: 'right' }}>
                  {selectedDayData.totalInflow > 0 && (
                    <div style={{ fontSize: '0.75rem', color: '#4ade80', fontWeight: 600 }}>+{formatCurrency(selectedDayData.totalInflow)}</div>
                  )}
                  {selectedDayData.totalOutflow > 0 && (
                    <div style={{ fontSize: '0.75rem', color: '#f87171', fontWeight: 600 }}>-{formatCurrency(selectedDayData.totalOutflow)}</div>
                  )}
                </div>
              )}
            </div>

            {/* List of items on this day */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', flex: 1, overflowY: 'auto' }}>
              {/* Bills Due */}
              {selectedDayData.bills.map(b => (
                <div
                  key={b.id}
                  style={{
                    padding: '0.75rem',
                    borderRadius: 10,
                    background: b.paid ? 'rgba(74,222,128,0.06)' : 'rgba(248,113,113,0.08)',
                    border: `1px solid ${b.paid ? 'rgba(74,222,128,0.2)' : 'rgba(248,113,113,0.25)'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.5rem'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <span style={{ fontSize: '1.1rem' }}>🧾</span>
                    <div>
                      <div style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)' }}>{b.name}</div>
                      <div style={{ fontSize: '0.7rem', color: '#888' }}>Bill • {b.category || 'General'}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.86rem', fontWeight: 700, color: '#f87171' }}>-{formatCurrency(b.amount)}</div>
                      <div style={{ fontSize: '0.68rem', color: b.paid ? '#4ade80' : '#fbbf24' }}>{b.paid ? 'Paid' : 'Unpaid'}</div>
                    </div>
                    <button
                      onClick={() => handlePayBill(b)}
                      title={b.paid ? 'Mark Unpaid' : 'Mark as Paid'}
                      style={{
                        padding: '0.3rem 0.5rem',
                        borderRadius: 6,
                        border: 'none',
                        background: b.paid ? 'rgba(255,255,255,0.06)' : 'rgba(74,222,128,0.2)',
                        color: b.paid ? '#888' : '#4ade80',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      {b.paid ? 'Undo' : 'Pay'}
                    </button>
                  </div>
                </div>
              ))}

              {/* Loans */}
              {selectedDayData.loans.map(l => (
                <div
                  key={l.id}
                  style={{
                    padding: '0.75rem',
                    borderRadius: 10,
                    background: 'rgba(251,191,36,0.08)',
                    border: '1px solid rgba(251,191,36,0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <span style={{ fontSize: '1.1rem' }}>🏛️</span>
                    <div>
                      <div style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)' }}>{l.name}</div>
                      <div style={{ fontSize: '0.7rem', color: '#888' }}>Loan Installment</div>
                    </div>
                  </div>
                  <div style={{ fontSize: '0.86rem', fontWeight: 700, color: '#fbbf24' }}>
                    -{formatCurrency(l.amount)}
                  </div>
                </div>
              ))}

              {/* Recurring */}
              {selectedDayData.recurring.map(r => (
                <div
                  key={r.id}
                  style={{
                    padding: '0.75rem',
                    borderRadius: 10,
                    background: 'rgba(192,132,252,0.08)',
                    border: '1px solid rgba(192,132,252,0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <span style={{ fontSize: '1.1rem' }}>🔄</span>
                    <div>
                      <div style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)' }}>{r.notes || r.category || 'Recurring Item'}</div>
                      <div style={{ fontSize: '0.7rem', color: '#888' }}>{r.frequency || 'Monthly'} Cycle</div>
                    </div>
                  </div>
                  <div style={{ fontSize: '0.86rem', fontWeight: 700, color: r.type === 'Income' ? '#4ade80' : '#c084fc' }}>
                    {r.type === 'Income' ? '+' : '-'}{formatCurrency(r.amount)}
                  </div>
                </div>
              ))}

              {/* Actual Transactions */}
              {selectedDayData.transactions.map(t => (
                <div
                  key={t.id}
                  style={{
                    padding: '0.75rem',
                    borderRadius: 10,
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.05)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <span style={{ fontSize: '1.1rem' }}>{t.type === 'Income' ? '💰' : '💸'}</span>
                    <div>
                      <div style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)' }}>{t.notes || t.category || 'Transaction'}</div>
                      <div style={{ fontSize: '0.7rem', color: '#888' }}>{t.category} • {t.type}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: '0.86rem', fontWeight: 700, color: t.type === 'Income' ? '#4ade80' : '#f0f0f5' }}>
                    {t.type === 'Income' ? '+' : '-'}{formatCurrency(t.amount)}
                  </div>
                </div>
              ))}

              {/* Empty state */}
              {selectedDayData.bills.length === 0 &&
               selectedDayData.loans.length === 0 &&
               selectedDayData.recurring.length === 0 &&
               selectedDayData.transactions.length === 0 && (
                <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#666', fontSize: '0.82rem' }}>
                  No scheduled bills, recurring cycles, or recorded transactions on this date.
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </Modal>
  );
}
