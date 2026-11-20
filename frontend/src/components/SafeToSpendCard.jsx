import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { formatCurrency, haptic } from '../utils/format';

export default function SafeToSpendCard({ safeToSpendData, hideNavLinks = false }) {
  const navigate = useNavigate();
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [editingPayday, setEditingPayday] = useState(false);
  const [spendMode, setSpendMode] = useState(() => {
    return localStorage.getItem('vm_safe_spend_mode') || 'strict';
  });
  const [paydayDay, setPaydayDay] = useState(() => {
    const saved = parseInt(localStorage.getItem('vm_payday_day') || '0', 10);
    return saved >= 1 && saved <= 31 ? saved : 0; // 0 = End of Month
  });

  if (!safeToSpendData) return null;

  const {
    liquidCash = 0,
    upcomingBillsTotal = 0,
    upcomingBillsCount = 0,
    unpaidRecurringTotal = 0,
    paidRecurringThisMonth = 0,
    unpaidRecurringCount = 0,
    paidRecurringCount = 0,
    unpaidRecurringItems = [],
    monthlyLoanEMIs = 0,
    unlinkedLoanEMIs = 0,
    paidLoansThisMonth = 0,
    loanItems = [],
    remainingGoalQuotaThisMonth = 0,
    contributedToGoalsThisMonth = 0,
    dailyGoalSavingNeeded = 0,
    goalItems = [],
    creditCardDebt = 0,
    safeToSpend = 0,
    strictSafeToSpend = 0,
    essentialsSafeToSpend = 0,
    daysRemainingInMonth = 1,
    spentToday = 0,
    status = 'healthy'
  } = safeToSpendData;

  const handleModeChange = (m) => {
    setSpendMode(m);
    try { localStorage.setItem('vm_safe_spend_mode', m); } catch {}
    haptic(8);
  };

  // Calculate exact days until next Payday (or End of Month if paydayDay === 0)
  const computeDaysUntilPayday = () => {
    if (!paydayDay || paydayDay <= 0) return Math.max(1, daysRemainingInMonth);
    const now = new Date();
    const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const daysInCurrMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const targetDayThisMonth = Math.min(paydayDay, daysInCurrMonth);
    let nextPayday = new Date(now.getFullYear(), now.getMonth(), targetDayThisMonth);
    if (nextPayday <= todayDate) {
      const daysInNextMonth = new Date(now.getFullYear(), now.getMonth() + 2, 0).getDate();
      const targetDayNextMonth = Math.min(paydayDay, daysInNextMonth);
      nextPayday = new Date(now.getFullYear(), now.getMonth() + 1, targetDayNextMonth);
    }
    const diffDays = Math.ceil((nextPayday - todayDate) / (1000 * 60 * 60 * 24));
    return Math.max(1, diffDays);
  };

  const activeDaysLeft = computeDaysUntilPayday();
  const activeSafePool = spendMode === 'strict'
    ? strictSafeToSpend
    : spendMode === 'essentials'
      ? essentialsSafeToSpend
      : safeToSpend;

  const goalReservedAmount = spendMode === 'strict'
    ? remainingGoalQuotaThisMonth
    : spendMode === 'balanced'
      ? remainingGoalQuotaThisMonth * 0.5
      : 0;

  const activeDailyAllowance = activeSafePool > 0 ? Math.round(activeSafePool / activeDaysLeft) : 0;
  const remainingToday = Math.max(0, activeDailyAllowance - spentToday);
  const overspentToday = Math.max(0, spentToday - activeDailyAllowance);
  const daysLeftAfterToday = Math.max(1, activeDaysLeft - 1);
  const tomorrowAllowance = activeSafePool > 0 ? Math.round(activeSafePool / daysLeftAfterToday) : 0;
  const weeklyAllowance = activeDailyAllowance * Math.min(7, activeDaysLeft);

  const handleSavePayday = (val) => {
    const num = parseInt(val, 10) || 0;
    const clamped = num >= 1 && num <= 31 ? num : 0;
    setPaydayDay(clamped);
    if (clamped > 0) localStorage.setItem('vm_payday_day', String(clamped));
    else localStorage.removeItem('vm_payday_day');
    setEditingPayday(false);
    haptic(10);
  };

  const effectiveStatus = liquidCash <= 0 || activeSafePool <= 0
    ? 'critical'
    : activeSafePool < liquidCash * 0.25
      ? 'tight'
      : status;

  const statusConfig = {
    healthy: {
      color: '#4ade80',
      bg: 'rgba(74, 222, 128, 0.08)',
      border: 'rgba(74, 222, 128, 0.25)',
      badge: '🟢 Safe & Liquid',
      subtext: 'Recurring bills, Gold Loan monthly payments & goal quotas are reserved.'
    },
    tight: {
      color: '#fbbf24',
      bg: 'rgba(251, 191, 36, 0.08)',
      border: 'rgba(251, 191, 36, 0.25)',
      badge: '🟡 Tight Runway',
      subtext: 'Commitments, Gold Loans & goals consume most cash. Keep daily spend lean.'
    },
    critical: {
      color: '#f87171',
      bg: 'rgba(248, 113, 113, 0.08)',
      border: 'rgba(248, 113, 113, 0.25)',
      badge: '🔴 Overcommitted',
      subtext: 'Unpaid bills, Gold Loan obligations & goals exceed liquid cash. Switch mode or pause spend.'
    }
  };

  const current = statusConfig[effectiveStatus] || statusConfig.healthy;
  const pctDiscretionary = liquidCash > 0 ? Math.min(100, Math.round((activeSafePool / liquidCash) * 100)) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      style={{
        background: 'rgba(255, 255, 255, 0.02)',
        borderRadius: 18,
        border: `1px solid ${current.border}`,
        boxShadow: '0 8px 32px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.06)',
        padding: '1.25rem 1.5rem',
        marginBottom: '1.5rem',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      {/* Background soft ambient glow */}
      <div style={{
        position: 'absolute',
        top: -40,
        right: -40,
        width: 140,
        height: 140,
        borderRadius: '50%',
        background: current.color,
        filter: 'blur(70px)',
        opacity: 0.15,
        pointerEvents: 'none'
      }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ flex: '1 1 320px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: 6, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: '0.72rem',
              letterSpacing: '1.5px',
              fontWeight: 800,
              color: 'var(--text-secondary)'
            }}>
              DAILY SPEND & GOAL SAVINGS ENGINE
            </span>
            <span style={{
              fontSize: '0.68rem',
              padding: '2px 8px',
              borderRadius: 20,
              background: current.bg,
              border: `1px solid ${current.border}`,
              color: current.color,
              fontWeight: 700 }}>
              {current.badge}
            </span>
            <button
              type="button"
              onClick={() => setEditingPayday(v => !v)}
              style={{
                fontSize: '0.66rem',
                padding: '2px 8px',
                borderRadius: 20,
                background: 'rgba(56,189,248,0.12)',
                border: '1px solid rgba(56,189,248,0.3)',
                color: '#38bdf8',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              📅 {paydayDay > 0 ? `Payday: ${paydayDay}th (${activeDaysLeft}d left)` : `Payday: Month-End (${activeDaysLeft}d left)`} ⚙
            </button>
          </div>

          {/* 3-Mode Selector Pills */}
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.65rem' }}>
            {[
              { id: 'strict', label: '🛡️ Strict (Bills + Gold Loans + 100% Goals)', color: '#4ade80' },
              { id: 'balanced', label: '⚖️ Balanced (50% Goals)', color: '#38bdf8' },
              { id: 'essentials', label: '🚨 Bills & Loans Only', color: '#fbbf24' },
            ].map(m => {
              const active = spendMode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => handleModeChange(m.id)}
                  style={{
                    padding: '0.24rem 0.65rem',
                    borderRadius: 20,
                    fontSize: '0.67rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    border: `1px solid ${active ? m.color : 'rgba(255,255,255,0.08)'}`,
                    background: active ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.02)',
                    color: active ? m.color : 'var(--text-muted)',
                    transition: 'all 0.18s ease',
                  }}
                >
                  {m.label}
                </button>
              );
            })}
          </div>

          {editingPayday && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              flexWrap: 'wrap',
              margin: '0.45rem 0',
              padding: '0.45rem 0.65rem',
              borderRadius: 10,
              background: 'rgba(0,0,0,0.35)',
              border: '1px solid rgba(56,189,248,0.25)'
            }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                Select monthly payday:
              </span>
              {[
                { label: 'Month-End', val: 0 },
                { label: '1st', val: 1 },
                { label: '10th', val: 10 },
                { label: '15th', val: 15 },
                { label: '25th', val: 25 },
                { label: '28th', val: 28 },
              ].map(p => (
                <button
                  key={p.val}
                  type="button"
                  onClick={() => handleSavePayday(p.val)}
                  style={{
                    padding: '0.2rem 0.55rem',
                    borderRadius: 8,
                    border: `1px solid ${paydayDay === p.val ? '#38bdf8' : 'rgba(255,255,255,0.1)'}`,
                    background: paydayDay === p.val ? 'rgba(56,189,248,0.2)' : 'rgba(255,255,255,0.04)',
                    color: paydayDay === p.val ? '#38bdf8' : '#f0f0f5',
                    fontSize: '0.68rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}

          <div style={{
            fontSize: '2.15rem',
            fontWeight: 800,
            color: current.color,
            letterSpacing: '-0.5px',
            display: 'flex',
            alignItems: 'baseline',
            gap: '0.4rem',
            flexWrap: 'wrap'
          }}>
            {formatCurrency(activeDailyAllowance)}
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>/ day safe to spend</span>
            {dailyGoalSavingNeeded > 0 && (
              <span style={{
                fontSize: '0.72rem',
                padding: '0.2rem 0.6rem',
                borderRadius: 20,
                background: 'rgba(167,139,250,0.14)',
                border: '1px solid rgba(167,139,250,0.35)',
                color: '#c4b5fd',
                fontWeight: 700,
              }}>
                🎯 +{formatCurrency(Math.round(dailyGoalSavingNeeded))}/day reserved for Goals
              </span>
            )}
          </div>

          <p style={{
            margin: '0.25rem 0 0',
            fontSize: '0.78rem',
            color: '#cbd5e1',
            lineHeight: 1.4
          }}>
            {current.subtext}
          </p>
        </div>

        {/* Quick Metrics Badges */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <div style={{
            padding: '0.5rem 0.85rem',
            borderRadius: 12,
            background: 'rgba(0,0,0,0.3)',
            border: '1px solid rgba(255,255,255,0.06)',
            textAlign: 'right'
          }}>
            <div style={{ fontSize: '0.63rem', color: 'var(--mm-text-3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {overspentToday > 0 ? 'Overspent Today' : 'Left For Today'}
            </div>
            <div style={{
              fontSize: '0.95rem',
              fontWeight: 800,
              color: overspentToday > 0 ? 'var(--mm-danger)' : 'var(--mm-success)' }}>
              {overspentToday > 0 ? `-${formatCurrency(overspentToday)}` : formatCurrency(remainingToday)}
            </div>
            <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>
              Spent today: {formatCurrency(spentToday)}
            </div>
          </div>

          <div style={{
            padding: '0.5rem 0.85rem',
            borderRadius: 12,
            background: 'rgba(0,0,0,0.3)',
            border: '1px solid rgba(255,255,255,0.06)',
            textAlign: 'right'
          }}>
            <div style={{ fontSize: '0.63rem', color: 'var(--mm-text-3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              7-Day Safe Budget
            </div>
            <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#38bdf8' }}>
              {formatCurrency(weeklyAllowance)}
            </div>
            <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>
              Tomorrow: {formatCurrency(tomorrowAllowance)}/d
            </div>
          </div>

          <div style={{
            padding: '0.5rem 0.85rem',
            borderRadius: 12,
            background: 'rgba(0,0,0,0.3)',
            border: '1px solid rgba(255,255,255,0.06)',
            textAlign: 'right'
          }}>
            <div style={{ fontSize: '0.63rem', color: 'var(--mm-text-3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              True Safe Pool ({activeDaysLeft}d)
            </div>
            <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              {formatCurrency(activeSafePool)}
            </div>
            <div style={{ fontSize: '0.62rem', color: '#a78bfa' }}>
              Goals: {formatCurrency(remainingGoalQuotaThisMonth)}/mo
            </div>
          </div>
        </div>
      </div>

      {/* Progress Breakdown Bar */}
      <div style={{ marginTop: '0.95rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: 5, flexWrap: 'wrap', gap: '0.4rem' }}>
          <span>Free Discretionary Pool ({pctDiscretionary}%)</span>
          <span>
            Reserved: Recurring ({formatCurrency(unpaidRecurringTotal)}) • Gold Loans ({formatCurrency(monthlyLoanEMIs)}) • Goals ({formatCurrency(Math.round(goalReservedAmount))})
          </span>
        </div>
        <div style={{
          height: 7,
          borderRadius: 4,
          background: 'rgba(255,255,255,0.06)',
          overflow: 'hidden',
          display: 'flex'
        }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pctDiscretionary}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            style={{ background: current.color, height: '100%' }}
          />
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${100 - pctDiscretionary}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            style={{ background: 'rgba(255,255,255,0.15)', height: '100%' }}
          />
        </div>
      </div>

      {/* Bottom Action & Breakdown Toggle Bar */}
      <div style={{ marginTop: '0.85rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        {!hideNavLinks ? (
          <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => navigate('/recurring')}
              style={{
                padding: '0.28rem 0.65rem',
                borderRadius: 8,
                background: 'rgba(74,222,128,0.1)',
                border: '1px solid rgba(74,222,128,0.28)',
                color: 'var(--mm-success)',
                fontSize: '0.7rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              🔁 Recurring & Variable Bills ({unpaidRecurringCount} unpaid) ↗
            </button>
            <button
              type="button"
              onClick={() => navigate('/loans')}
              style={{
                padding: '0.28rem 0.65rem',
                borderRadius: 8,
                background: 'rgba(251,191,36,0.1)',
                border: '1px solid rgba(251,191,36,0.28)',
                color: 'var(--mm-warning)',
                fontSize: '0.7rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              🪙 Gold Loans ({loanItems.filter(l => !l.isPaidThisMonth).length} due) ↗
            </button>
          </div>
        ) : <div />}

        <button
          type="button"
          onClick={() => { setShowBreakdown(b => !b); haptic(5); }}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#818cf8',
            cursor: 'pointer',
            fontSize: '0.74rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '0.3rem'
          }}
        >
          {showBreakdown ? 'Hide Full Daily Spend & Goal Math' : 'View Full Bills, Gold Loans & Goal Math'}
          {showBreakdown ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {/* Expandable Breakdown Drawer */}
      <AnimatePresence>
        {showBreakdown && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            style={{
              overflow: 'hidden',
              marginTop: '0.75rem',
              paddingTop: '0.75rem',
              borderTop: '1px solid rgba(255,255,255,0.06)'
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))', gap: '0.65rem', marginBottom: '0.85rem' }}>
              <div style={{ padding: '0.75rem', borderRadius: 10, background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.04)' }}>
                <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', display: 'block' }}>1. Liquid Cash (Bank + Cash)</span>
                <strong style={{ color: 'var(--mm-success)', fontSize: '0.92rem' }}>+{formatCurrency(liquidCash)}</strong>
              </div>

              <div style={{ padding: '0.75rem', borderRadius: 10, background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.04)' }}>
                <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', display: 'block' }}>
                  2. Unpaid Recurring ({unpaidRecurringCount} due, {paidRecurringCount} paid)
                </span>
                <strong style={{ color: 'var(--mm-danger)', fontSize: '0.92rem' }}>-{formatCurrency(unpaidRecurringTotal)}</strong>
                {paidRecurringThisMonth > 0 && (
                  <span style={{ fontSize: '0.63rem', color: 'var(--mm-success)', display: 'block', marginTop: 2 }}>
                    ✅ {formatCurrency(paidRecurringThisMonth)} already paid this month
                  </span>
                )}
              </div>

              <div style={{ padding: '0.75rem', borderRadius: 10, background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.04)' }}>
                <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', display: 'block' }}>
                  3. Gold Loans & Debt Due This Month
                </span>
                <strong style={{ color: 'var(--mm-warning)', fontSize: '0.92rem' }}>-{formatCurrency(unlinkedLoanEMIs + creditCardDebt)}</strong>
                {paidLoansThisMonth > 0 && (
                  <span style={{ fontSize: '0.63rem', color: 'var(--mm-success)', display: 'block', marginTop: 2 }}>
                    ✅ {formatCurrency(paidLoansThisMonth)} loan interest/EMI paid
                  </span>
                )}
              </div>

              <div style={{ padding: '0.75rem', borderRadius: 10, background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.04)' }}>
                <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', display: 'block' }}>
                  4. Upcoming Bills ({upcomingBillsCount} due)
                </span>
                <strong style={{ color: 'var(--mm-danger)', fontSize: '0.92rem' }}>-{formatCurrency(upcomingBillsTotal)}</strong>
              </div>

              <div style={{ padding: '0.75rem', borderRadius: 10, background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.04)' }}>
                <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', display: 'block' }}>
                  5. Goal Savings Quota ({spendMode === 'strict' ? '100%' : spendMode === 'balanced' ? '50%' : '0%'})
                </span>
                <strong style={{ color: '#a78bfa', fontSize: '0.92rem' }}>-{formatCurrency(Math.round(goalReservedAmount))}</strong>
                {contributedToGoalsThisMonth > 0 && (
                  <span style={{ fontSize: '0.63rem', color: 'var(--mm-success)', display: 'block', marginTop: 2 }}>
                    ✅ {formatCurrency(contributedToGoalsThisMonth)} saved this month
                  </span>
                )}
              </div>

              <div style={{ padding: '0.75rem', borderRadius: 10, background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.04)' }}>
                <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', display: 'block' }}>
                  6. Safe Pool ÷ {activeDaysLeft} Days
                </span>
                <strong style={{ color: current.color, fontSize: '0.92rem' }}>={formatCurrency(activeDailyAllowance)} / day</strong>
              </div>
            </div>

            {/* Itemized Lists for Unpaid Recurring, Active Gold Loans & Goals */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.75rem' }}>
              {unpaidRecurringItems.length > 0 && (
                <div style={{ padding: '0.75rem', borderRadius: 10, background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#38bdf8', marginBottom: '0.45rem', letterSpacing: '0.5px' }}>
                    🔁 UNPAID RECURRING BILLS THIS MONTH
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    {unpaidRecurringItems.map(item => (
                      <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.74rem' }}>
                        <span style={{ color: 'var(--text-primary)' }}>
                          {item.name}{' '}
                          <span style={{ fontSize: '0.63rem', color: 'var(--text-muted)' }}>
                            ({item.scheduleMode === 'flexible' ? 'Anytime this mo' : `Day ${item.dayOfMonth}`}{item.isVariable ? ' • ~Avg' : ''})
                          </span>
                        </span>
                        <strong style={{ color: 'var(--mm-danger)' }}>{formatCurrency(item.amount)}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {loanItems.length > 0 && (
                <div style={{ padding: '0.75rem', borderRadius: 10, background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--mm-warning)', marginBottom: '0.45rem', letterSpacing: '0.5px' }}>
                    🪙 GOLD LOANS & DEBT MONTHLY CHECK-IN
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    {loanItems.map(loan => (
                      <div key={loan.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.74rem' }}>
                        <span style={{ color: 'var(--text-primary)' }}>
                          {loan.name}{' '}
                          <span style={{ fontSize: '0.63rem', color: loan.isPaidThisMonth ? 'var(--mm-success)' : 'var(--mm-warning)' }}>
                            ({loan.isPaidThisMonth ? '✅ Paid this mo' : `⏳ Interest ~${formatCurrency(Math.round(loan.monthlyInterest))}/mo`})
                          </span>
                        </span>
                        <strong style={{ color: loan.isPaidThisMonth ? 'var(--mm-success)' : 'var(--mm-warning)' }}>
                          {loan.isPaidThisMonth ? 'Paid' : formatCurrency(Math.round(loan.remainingThisMonth))}
                        </strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {goalItems.length > 0 && (
                <div style={{ padding: '0.75rem', borderRadius: 10, background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#a78bfa', marginBottom: '0.45rem', letterSpacing: '0.5px' }}>
                    🎯 SAVINGS GOALS DAILY & MONTHLY QUOTA
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    {goalItems.map(g => (
                      <div key={g.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.74rem' }}>
                        <span style={{ color: 'var(--text-primary)' }}>
                          {g.name}{' '}
                          <span style={{ fontSize: '0.63rem', color: 'var(--text-muted)' }}>
                            ({formatCurrency(Math.round(g.dailyNeeded))}/day)
                          </span>
                        </span>
                        <strong style={{ color: '#c4b5fd' }}>
                          {formatCurrency(Math.round(g.monthlyNeeded))}/mo
                        </strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
