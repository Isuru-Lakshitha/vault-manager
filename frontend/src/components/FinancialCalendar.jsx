import React, { useState, useMemo } from 'react';
import 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Modal from './Modal';
import { formatCurrency, haptic } from '../utils/format';
import getCategoryEmoji from '../utils/categoryEmoji';
import { toYMD, todayYMD } from '../utils/dates';

export default function FinancialCalendar({
  isOpen,
  onClose,
  transactions = [],
  bills = [],
  loans: _loans = [],
  recurringRules = [],
}) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDayStr, setSelectedDayStr] = useState(todayYMD());

  // Year & Month navigation
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth(); // 0-indexed

  const monthName = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });

  const prevMonth = () => {
    haptic(10);
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    haptic(10);
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const goToToday = () => {
    haptic(10);
    const now = new Date();
    setCurrentDate(now);
    setSelectedDayStr(toYMD(now));
  };

  // Calendar calculation
  const calendarData = useMemo(() => {
    const firstDayIndex = new Date(year, month, 1).getDay(); // 0 = Sunday
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    // Map all data to date strings "YYYY-MM-DD"
    const dayMap = {};

    // 1. Transactions
    (transactions || []).forEach(tx => {
      if (!tx || !tx.date || tx.reversed_at || tx.reversal_of || tx.is_transfer_fee) return;
      const d = tx.date;
      if (!dayMap[d]) dayMap[d] = { income: 0, expense: 0, items: [] };
      const amt = parseFloat(tx.amount) || 0;
      if (tx.type === 'Income') {
        dayMap[d].income += amt;
      } else if (['Expense', 'Loan Payment'].includes(tx.type)) {
        dayMap[d].expense += amt;
      }
      dayMap[d].items.push({
        id: tx.id,
        kind: 'transaction',
        type: tx.type,
        title: tx.notes || tx.category || tx.type,
        category: tx.category,
        amount: amt,
        fee: tx.fee_amount || 0,
      });
    });

    // 2. Bills
    (bills || []).forEach(b => {
      if (!b || !b.due_date) return;
      const d = b.due_date;
      if (!dayMap[d]) dayMap[d] = { income: 0, expense: 0, items: [] };
      dayMap[d].items.push({
        id: b.id,
        kind: 'bill',
        title: `Bill: ${b.name}`,
        amount: parseFloat(b.amount) || 0,
        paid: !!b.paid,
        category: b.category,
      });
    });

    // 3. Recurring rules (projected for this month)
    const viewMonthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
    (recurringRules || []).forEach(r => {
      if (!r || r.paused || r.last_applied_month === viewMonthKey) return;
      const dayNum = Math.min(daysInMonth, Math.max(1, parseInt(r.day_of_month || 1, 10)));
      const dStr = `${viewMonthKey}-${String(dayNum).padStart(2, '0')}`;
      if (!dayMap[dStr]) dayMap[dStr] = { income: 0, expense: 0, items: [] };
      dayMap[dStr].items.push({
        id: `rec_${r.id}`,
        kind: 'recurring',
        type: r.type,
        title: `Recurring: ${r.name || r.category || r.type}`,
        amount: parseFloat(r.avg_amount || r.amount) || 0,
      });
    });

    // Build grid cells
    const cells = [];

    // Prev month padding
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i;
      const prevM = month === 0 ? 12 : month;
      const prevY = month === 0 ? year - 1 : year;
      const dateStr = `${prevY}-${String(prevM).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ dayNumber: d, dateStr, isCurrentMonth: false });
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayEvents = dayMap[dateStr] || { income: 0, expense: 0, items: [] };
      cells.push({
        dayNumber: d,
        dateStr,
        isCurrentMonth: true,
        ...dayEvents,
      });
    }

    // Next month padding to fill rows of 7
    const remaining = (7 - (cells.length % 7)) % 7;
    for (let d = 1; d <= remaining; d++) {
      const nextM = month === 11 ? 1 : month + 2;
      const nextY = month === 11 ? year + 1 : year;
      const dateStr = `${nextY}-${String(nextM).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ dayNumber: d, dateStr, isCurrentMonth: false });
    }

    return { cells, dayMap };
  }, [year, month, transactions, bills, recurringRules]);

  const selectedDayData = calendarData.dayMap[selectedDayStr] || { income: 0, expense: 0, items: [] };
  const todayStr = todayYMD();

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="📅 Financial Calendar">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: 460 }}>
        {/* Navigation Bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <button
              type="button"
              onClick={prevMonth}
              className="btn btn-secondary"
              style={{ padding: '0.35rem 0.55rem', borderRadius: 8 }}
            >
              <ChevronLeft size={16} />
            </button>
            <span style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)', minWidth: 140, textAlign: 'center' }}>
              {monthName}
            </span>
            <button
              type="button"
              onClick={nextMonth}
              className="btn btn-secondary"
              style={{ padding: '0.35rem 0.55rem', borderRadius: 8 }}
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <button
            type="button"
            onClick={goToToday}
            className="btn btn-secondary"
            style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
          >
            Today
          </button>
        </div>

        {/* Days of Week Header */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', textAlign: 'center' }}>
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} style={{ fontSize: '0.68rem', fontFamily: 'Inter, sans-serif', color: 'var(--text-muted)', fontWeight: 600, padding: '0.2rem 0' }}>
              {d}
            </div>
          ))}
        </div>

        {/* Calendar Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
          {calendarData.cells.map((cell, idx) => {
            const isSelected = cell.dateStr === selectedDayStr;
            const isToday = cell.dateStr === todayStr;
            const hasIncome = cell.income > 0;
            const hasExpense = cell.expense > 0;
            const hasBills = (cell.items || []).some(i => i.kind === 'bill');

            return (
              <div
                key={idx}
                onClick={() => {
                  haptic(5);
                  setSelectedDayStr(cell.dateStr);
                }}
                style={{
                  minHeight: 52,
                  padding: '0.3rem 0.25rem',
                  borderRadius: 10,
                  background: isSelected
                    ? 'rgba(74,222,128,0.18)'
                    : isToday
                    ? 'rgba(129,140,248,0.12)'
                    : cell.isCurrentMonth
                    ? 'rgba(255,255,255,0.02)'
                    : 'transparent',
                  border: isSelected
                    ? '1.5px solid #4ade80'
                    : isToday
                    ? '1px solid rgba(129,140,248,0.4)'
                    : '1px solid rgba(255,255,255,0.04)',
                  opacity: cell.isCurrentMonth ? 1 : 0.35,
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  transition: 'all 0.12s ease',
                }}
              >
                <span
                  style={{
                    fontSize: '0.74rem',
                    fontFamily: 'Inter, sans-serif',
                    fontWeight: isToday || isSelected ? 700 : 500,
                    color: isToday ? '#818cf8' : isSelected ? '#4ade80' : '#d1d1e0',
                  }}
                >
                  {cell.dayNumber}
                </span>

                {/* Event Dots */}
                <div style={{ display: 'flex', gap: '2px', alignItems: 'center', marginTop: 2 }}>
                  {hasIncome && <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#4ade80' }} />}
                  {hasExpense && <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#f87171' }} />}
                  {hasBills && <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#fbbf24' }} />}
                </div>

                {/* Day Net */}
                {(cell.income > 0 || cell.expense > 0) && (
                  <span
                    style={{
                      fontSize: '0.58rem',
                      fontFamily: 'Inter, sans-serif',
                      fontWeight: 600,
                      color: cell.income >= cell.expense ? '#4ade80' : '#f87171',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: '100%',
                    }}
                  >
                    {cell.income >= cell.expense ? '+' : '-'}{Math.round(Math.abs(cell.income - cell.expense) >= 1000 ? Math.abs(cell.income - cell.expense) / 1000 : Math.abs(cell.income - cell.expense))}
                    {Math.abs(cell.income - cell.expense) >= 1000 ? 'k' : ''}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Selected Day Details Panel */}
        <div
          style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 14,
            padding: '1rem',
            marginTop: '0.25rem',
            flex: 1,
            maxHeight: 220,
            overflowY: 'auto',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: '0.4rem' }}>
            <div style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)' }}>
              Events for {new Date(selectedDayStr + 'T00:00:00').toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' })}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.75rem', fontFamily: 'Inter, sans-serif' }}>
              {selectedDayData.income > 0 && <span style={{ color: '#4ade80' }}>+{formatCurrency(selectedDayData.income)}</span>}
              {selectedDayData.expense > 0 && <span style={{ color: '#f87171' }}>-{formatCurrency(selectedDayData.expense)}</span>}
            </div>
          </div>

          {selectedDayData.items.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)', fontSize: '0.8rem', fontFamily: 'Inter, sans-serif' }}>
              No transactions or bills scheduled for this date.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              {selectedDayData.items.map((item, idx) => (
                <div
                  key={`${item.id}_${idx}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.5rem 0.75rem',
                    background: 'rgba(255,255,255,0.02)',
                    borderRadius: 8,
                    border: '1px solid rgba(255,255,255,0.04)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '1rem' }}>
                      {item.kind === 'bill' ? '💳' : getCategoryEmoji(item.category) || '💸'}
                    </span>
                    <div>
                      <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {item.title}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                        {item.kind === 'bill' ? (item.paid ? 'Paid Bill' : 'Unpaid Bill') : item.type || 'Transaction'}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      fontFamily: 'Inter, sans-serif',
                      fontWeight: 700,
                      fontSize: '0.88rem',
                      color: item.type === 'Income' ? '#4ade80' : '#f87171',
                    }}
                  >
                    {item.type === 'Income' ? '+' : '-'}{formatCurrency(item.amount)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
