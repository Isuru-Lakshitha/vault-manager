import { motion } from 'framer-motion';
import { ChevronDown, ChevronUp, CheckCircle2, Clock } from 'lucide-react';
import AnimatedCounter from '../../components/AnimatedCounter';
import { formatCurrency } from '../../utils/format';

// Recurring → this month's cycle: due vs paid counts, totals and the safe-to-spend planner toggle.
export default function CycleSummaryPanel({ currentMonth, cycleStats, filterTab, safeToSpendData, setFilterTab, setShowPlanner, showPlanner }) {
  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        style={{
          marginBottom: '1rem',
          padding: '1.15rem 1.35rem',
          borderRadius: 16,
          background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.88) 0%, rgba(15, 23, 42, 0.62) 100%)',
          border: '1px solid var(--mm-border, rgba(255,255,255,0.1))',
          boxShadow: '0 10px 30px rgba(0,0,0,0.22)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1.15rem' }}>
          {/* Animated Radial Settlement Ring */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: '1 1 250px' }}>
            <div style={{ position: 'relative', width: 74, height: 74, flexShrink: 0 }}>
              <svg width="74" height="74" viewBox="0 0 74 74" style={{ transform: 'rotate(-90deg)' }}>
                <circle
                  cx="37"
                  cy="37"
                  r="30"
                  fill="none"
                  stroke="rgba(255,255,255,0.08)"
                  strokeWidth="7"
                />
                <motion.circle
                  cx="37"
                  cy="37"
                  r="30"
                  fill="none"
                  stroke={cycleStats.paidPct === 100 ? '#10b981' : '#34d399'}
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 30}
                  initial={{ strokeDashoffset: 2 * Math.PI * 30 }}
                  animate={{ strokeDashoffset: (2 * Math.PI * 30) * (1 - cycleStats.paidPct / 100) }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                />
              </svg>
              <div style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <span style={{ fontSize: '0.95rem', fontWeight: 800, color: cycleStats.paidPct === 100 ? 'var(--mm-success)' : 'var(--text-primary)' }}>
                  {cycleStats.paidPct}%
                </span>
                <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Settled
                </span>
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                {currentMonth} Monthly Settlement Status
              </div>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: 2 }}>
                {cycleStats.paidCount} of {cycleStats.totalCount} Paid
                {cycleStats.unpaidCount > 0 ? (
                  <span style={{ color: 'var(--mm-warning)', fontWeight: 700, fontSize: '0.92rem', marginLeft: 8 }}>
                    · {cycleStats.unpaidCount} Still Due
                  </span>
                ) : (
                  <span style={{ color: 'var(--mm-success)', fontWeight: 700, fontSize: '0.92rem', marginLeft: 8 }}>
                    · 🎉 All Settled!
                  </span>
                )}
              </div>
              <div style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', marginTop: 4, display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                <span>Monthly Est: <strong>{formatCurrency(Math.round(safeToSpendData.nextMonthRecurringTotal || 0))}/mo</strong></span>
                <span>·</span>
                <span>Safe Daily: <strong style={{ color: 'var(--mm-accent, #5b8def)' }}>{formatCurrency(Math.round(safeToSpendData.strictDailySpend))}/d</strong></span>
              </div>
            </div>
          </div>

          {/* Two Giant High-Contrast Status Scorecards: UNPAID vs PAID */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', flex: '2 1 460px' }}>
            {/* UNPAID / DUE SCORECARD */}
            <div
              onClick={() => setFilterTab(filterTab === 'unpaid' ? 'all' : 'unpaid')}
              style={{
                cursor: 'pointer',
                padding: '0.85rem 1rem',
                borderRadius: 12,
                background: cycleStats.unpaidCount > 0
                  ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.14) 0%, rgba(239, 68, 68, 0.06) 100%)'
                  : 'rgba(255,255,255,0.02)',
                border: `1px solid ${filterTab === 'unpaid' ? '#f59e0b' : cycleStats.unpaidCount > 0 ? 'rgba(245, 158, 11, 0.38)' : 'rgba(255,255,255,0.08)'}`,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: 6,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.6px', color: cycleStats.unpaidCount > 0 ? 'var(--mm-warning)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Clock size={13} /> ⏳ UNPAID / DUE THIS MONTH
                </span>
                <span style={{
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  padding: '2px 8px',
                  borderRadius: 999,
                  background: cycleStats.unpaidCount > 0 ? 'rgba(245, 158, 11, 0.22)' : 'rgba(255,255,255,0.06)',
                  color: cycleStats.unpaidCount > 0 ? 'var(--mm-warning)' : 'var(--text-muted)',
                }}>
                  {cycleStats.unpaidCount} item{cycleStats.unpaidCount === 1 ? '' : 's'}
                </span>
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: cycleStats.unpaidCount > 0 ? 'var(--mm-warning)' : 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                <AnimatedCounter value={Math.round(safeToSpendData.unpaidRecurringTotal)} formatter={formatCurrency} />
              </div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                {cycleStats.overdueCount > 0 && (
                  <span style={{ color: 'var(--mm-danger)', fontWeight: 700 }}>🚨 {cycleStats.overdueCount} Overdue</span>
                )}
                {cycleStats.dueSoonCount > 0 && (
                  <span style={{ color: 'var(--mm-warning)', fontWeight: 600 }}>⚡ {cycleStats.dueSoonCount} Due Soon</span>
                )}
                {cycleStats.unpaidCount === 0 && (
                  <span style={{ color: 'var(--mm-success)', fontWeight: 600 }}>✓ Nothing left to pay this month</span>
                )}
                {cycleStats.unpaidCount > 0 && cycleStats.overdueCount === 0 && cycleStats.dueSoonCount === 0 && (
                  <span>Click to filter unpaid items</span>
                )}
              </div>
            </div>

            {/* PAID / SETTLED SCORECARD */}
            <div
              onClick={() => setFilterTab(filterTab === 'paid' ? 'all' : 'paid')}
              style={{
                cursor: 'pointer',
                padding: '0.85rem 1rem',
                borderRadius: 12,
                background: cycleStats.paidCount > 0
                  ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.14) 0%, rgba(16, 185, 129, 0.04) 100%)'
                  : 'rgba(255,255,255,0.02)',
                border: `1px solid ${filterTab === 'paid' ? '#10b981' : cycleStats.paidCount > 0 ? 'rgba(16, 185, 129, 0.38)' : 'rgba(255,255,255,0.08)'}`,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: 6,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.6px', color: 'var(--mm-success)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <CheckCircle2 size={13} /> ✅ PAID / SETTLED THIS MONTH
                </span>
                <span style={{
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  padding: '2px 8px',
                  borderRadius: 999,
                  background: 'rgba(16, 185, 129, 0.2)',
                  color: 'var(--mm-success)',
                }}>
                  {cycleStats.paidCount} item{cycleStats.paidCount === 1 ? '' : 's'}
                </span>
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--mm-success)', fontVariantNumeric: 'tabular-nums' }}>
                <AnimatedCounter value={Math.round(safeToSpendData.paidRecurringThisMonth || cycleStats.paidAmount)} formatter={formatCurrency} />
              </div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                {cycleStats.paidLedgerCount > 0 && (
                  <span style={{ color: 'var(--mm-success)', fontWeight: 600 }}>✓ {cycleStats.paidLedgerCount} Recorded in Ledger</span>
                )}
                {cycleStats.paidMarkedCount > 0 && (
                  <span>☑️ {cycleStats.paidMarkedCount} Marked Paid</span>
                )}
                {cycleStats.paidCount === 0 && (
                  <span>No reminders marked paid yet this month</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Animated Dual-Tone Progress Bar */}
        <div style={{ marginTop: '0.95rem' }}>
          <div style={{
            height: 8,
            borderRadius: 999,
            background: 'rgba(245, 158, 11, 0.2)',
            overflow: 'hidden',
            display: 'flex',
          }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${cycleStats.paidPct}%` }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
              style={{
                height: '100%',
                background: 'linear-gradient(90deg, #10b981, #34d399)',
                borderRadius: 999,
              }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, fontSize: '0.69rem', color: 'var(--text-muted)', flexWrap: 'wrap', gap: '0.5rem' }}>
            <span>
              <strong style={{ color: 'var(--mm-success)' }}>✅ {cycleStats.paidCount} Paid</strong> · <strong style={{ color: 'var(--mm-warning)' }}>⏳ {cycleStats.unpaidCount} Unpaid</strong>
            </span>
            <button
              type="button"
              onClick={() => setShowPlanner(v => !v)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--mm-accent, #5b8def)',
                fontSize: '0.72rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              {showPlanner ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              {showPlanner ? 'Hide Daily Safe-to-Spend Planner' : 'Open Daily Safe-to-Spend Planner'}
            </button>
          </div>
        </div>
      </motion.div>
    </>
  );
}
