import { updateGoal } from '../../utils/api';
import { Plus, Minus, Trophy, Edit2, Trash2, Calendar } from 'lucide-react';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { formatCurrency, haptic } from '../../utils/format';
import { toYMD } from '../../utils/dates';

// One goal in the Goals grid: progress ring, stats and actions.
export default function GoalCard({ goal, idx, PRIORITY_CONFIG, boostByGoal, calculateGoalStats, expandedBoostGoalId, handleQuickDeduct, handleQuickDeposit, loadData, openDeductModal, openDepositModal, openEditModal, setBoostByGoal, setConfirm, setExpandedBoostGoalId, setSelectedGoalForHistoryId, transactionsList }) {
  const stats = calculateGoalStats(goal);
  const {
    current,
    target,
    remaining,
    progressPct,
    isReached,
    targetDateStr,
    daysLeft,
    isPast,
    dailyNeeded
  } = stats;

  const priConfig = PRIORITY_CONFIG[goal.priority || 'medium'] || PRIORITY_CONFIG.medium;
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (Math.min(100, progressPct) / 100) * circumference;
  const accentColor = goal.color || (isReached ? '#4ade80' : '#06b6d4');

  const goalIdStr = String(goal.id);
  const goalNameLower = (goal.name || '').toLowerCase().trim();
  const historyCount = (transactionsList || []).filter(t => {
    if (!t || t.reversed_at || t.reversal_of || t.is_transfer_fee) return false;
    if (t.goal_id && String(t.goal_id) === goalIdStr) return true;
    const notesLower = (t.notes || '').toLowerCase();
    const catLower = (t.category || '').toLowerCase();
    return (catLower.includes('goal') || catLower.includes('saving')) && goalNameLower && notesLower.includes(goalNameLower);
  }).length;

  return (
    <motion.div
      key={goal.id}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      transition={{ delay: idx * 0.04, duration: 0.25 }}
      onClick={() => {
        haptic();
        setSelectedGoalForHistoryId(goal.id);
      }}
      style={{
        cursor: 'pointer',
        background: 'rgba(30, 30, 50, 0.75)',
        border: isReached
          ? '1px solid rgba(74, 222, 128, 0.4)'
          : `1px solid ${accentColor}30`,
        borderRadius: 16,
        padding: '1.15rem',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        boxShadow: isReached
          ? '0 0 24px rgba(74, 222, 128, 0.08) inset, 0 4px 20px rgba(0,0,0,0.25)'
          : '0 4px 20px rgba(0,0,0,0.25)',
        backdropFilter: 'blur(16px)'
      }}
    >
      {/* Top Bar: Icon, Goal Name, Category, Priority & Edit Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.85rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 12,
              background: `${accentColor}18`,
              border: `1px solid ${accentColor}35`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.3rem'
            }}
          >
            {goal.icon || '🎯'}
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {goal.name}
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.2rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                {goal.category || 'Savings'}
              </span>
              <span
                style={{
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  color: priConfig.color,
                  background: priConfig.bg,
                  padding: '0.1rem 0.4rem',
                  borderRadius: 8
                }}
              >
                {priConfig.badge}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  haptic();
                  setSelectedGoalForHistoryId(goal.id);
                }}
                style={{
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  color: '#38bdf8',
                  background: 'rgba(56, 189, 248, 0.12)',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                  padding: '0.1rem 0.45rem',
                  borderRadius: 8,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.25rem'
                }}
                title="View Goal Activity & Payment History"
              >
                📜 History ({historyCount})
              </button>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <button
            className="icon-btn"
            title="Edit Goal"
            onClick={(e) => {
              e.stopPropagation();
              openEditModal(goal);
            }}
          >
            <Edit2 size={15} />
          </button>
          <button
            className="icon-btn"
            title="Delete Goal"
            onClick={(e) => {
              e.stopPropagation();
              setConfirm({ open: true, id: goal.id });
            }}
            style={{ color: 'var(--mm-danger)' }}
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {/* PROMINENT SECTION: WHAT YOU HAVE RIGHT NOW */}
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(74, 222, 128, 0.08) 0%, rgba(0,0,0,0.3) 100%)',
          border: '1px solid rgba(74, 222, 128, 0.2)',
          borderRadius: 14,
          padding: '0.9rem 1rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '0.85rem'
        }}
      >
        <div>
          <div style={{ fontSize: '0.68rem', color: 'var(--mm-success)', fontWeight: 700, letterSpacing: '0.5px' }}>
            HAVE RIGHT NOW
          </div>
          <div
            style={{
              fontSize: '1.5rem',
              fontWeight: 800,
              color: 'var(--mm-success)',
              marginTop: '0.15rem'
            }}
          >
            {formatCurrency(current)}
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.35rem', fontSize: '0.72rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>
              Target: <strong style={{ color: 'var(--text-primary)' }}>{formatCurrency(target)}</strong>
            </span>
            <span style={{ color: remaining > 0 ? 'var(--mm-warning)' : 'var(--mm-success)' }}>
              {remaining > 0 ? `To Go: ${formatCurrency(remaining)}` : 'Completed 🏆'}
            </span>
          </div>
        </div>

        {/* Radial Progress Ring */}
        <div style={{ position: 'relative', width: 72, height: 72, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="72" height="72" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="36" cy="36" r={radius} fill="transparent" stroke="rgba(255,255,255,0.06)" strokeWidth="7" />
            <motion.circle
              cx="36"
              cy="36"
              r={radius}
              fill="transparent"
              stroke={isReached ? '#4ade80' : accentColor}
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={circumference}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset }}
              transition={{ duration: 1.2, ease: 'easeOut' }}
              style={{
                filter: isReached ? 'drop-shadow(0 0 6px #4ade80)' : `drop-shadow(0 0 5px ${accentColor})`
              }}
            />
          </svg>
          <div style={{ position: 'absolute', textAlign: 'center' }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              {Math.round(progressPct)}%
            </div>
          </div>
        </div>
      </div>

      {/* END GOAL DATE & DAYS REMAINING */}
      <div
        style={{
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid rgba(255, 255, 255, 0.05)',
          borderRadius: 12,
          padding: '0.65rem 0.85rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '0.75rem',
          marginBottom: '0.85rem'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Calendar size={14} style={{ color: '#06b6d4' }} />
          <span style={{ color: 'var(--text-muted)' }}>End Goal Date:</span>
          <strong style={{ color: 'var(--text-primary)' }}>{targetDateStr}</strong>
        </div>

        <div>
          {isReached ? (
            <span style={{ color: 'var(--mm-success)', fontWeight: 700 }}>Achieved 🏆</span>
          ) : isPast ? (
            <span style={{ color: 'var(--mm-danger)', fontWeight: 700 }}>Deadline Passed ⏰</span>
          ) : (
            <span style={{ color: daysLeft < 30 ? 'var(--mm-warning)' : '#06b6d4', fontWeight: 700 }}>
              {daysLeft} days left
            </span>
          )}
        </div>
      </div>

      {/* PROMINENT DAILY CALCULATION + WHAT-IF MONTHLY BOOST SIMULATOR */}
      {!isReached ? (
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.12) 0%, rgba(37, 37, 64, 0.4) 100%)',
            border: '1px solid rgba(6, 182, 212, 0.28)',
            borderRadius: 12,
            padding: '0.75rem 0.9rem',
            marginBottom: '0.85rem'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '0.68rem', color: '#06b6d4', fontWeight: 700, letterSpacing: '0.5px' }}>
                ⚡ DAILY CALCULATION
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.15rem' }}>
                {formatCurrency(dailyNeeded)}{' '}
                <span style={{ fontSize: '0.75rem', color: '#06b6d4', fontWeight: 600 }}>/ day</span>
              </div>
            </div>

            <div style={{ textAlign: 'right', fontSize: '0.7rem', color: 'var(--text-secondary)', maxWidth: 140 }}>
              {daysLeft > 0
                ? `Save daily for ${daysLeft} days to hit your end date`
                : 'Target date overdue'}
            </div>
          </div>

          {/* Goal Pacing Feasibility Check & 1-Tap Match Pace */}
          {daysLeft > 0 && remaining > 0 && (
            <div style={{ marginTop: '0.6rem', paddingTop: '0.55rem', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', fontSize: '0.72rem' }}>
              {stats.plannedMonthly >= stats.monthlyNeeded ? (
                <span style={{ color: 'var(--mm-success)', fontWeight: 600 }}>
                  ✓ On Pace ({formatCurrency(stats.plannedMonthly)}/mo ≥ {formatCurrency(stats.monthlyNeeded)}/mo needed)
                </span>
              ) : (
                <>
                  <span style={{ color: 'var(--mm-warning)' }}>
                    ⚠️ Need <strong>{formatCurrency(stats.monthlyNeeded)}/mo</strong> (planned: {formatCurrency(stats.plannedMonthly)}/mo)
                  </span>
                  <button
                    type="button"
                    onClick={async (e) => {
                      e.stopPropagation();
                      try {
                        await updateGoal(goal.id, { ...goal, monthly_contribution: stats.monthlyNeeded });
                        toast.success(`Updated "${goal.name}" monthly pace to ${formatCurrency(stats.monthlyNeeded)}/mo`);
                        loadData(true);
                      } catch {
                        toast.error('Failed to update goal pace');
                      }
                    }}
                    style={{
                      padding: '0.2rem 0.55rem',
                      borderRadius: 6,
                      background: 'rgba(56,189,248,0.14)',
                      border: '1px solid rgba(56,189,248,0.35)',
                      color: '#38bdf8',
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Match Required Pace
                  </button>
                </>
              )}
            </div>
          )}

          {/* What-If Monthly Boost Toggle & Collapsible Slider */}
          {remaining > 0 && (() => {
            const extraMonthly = Number(boostByGoal[goal.id]) || 0;
            const isExpanded = expandedBoostGoalId === goal.id || extraMonthly > 0;
            const maxBoost = Math.max(2000, Math.min(250000, Math.ceil((remaining * 0.5) / 500) * 500));
            const stepBoost = maxBoost >= 50000 ? 1000 : maxBoost >= 10000 ? 500 : 100;
            const baseDays = daysLeft > 0 ? daysLeft : 180;
            const baseDailyRate = remaining / baseDays;
            const boostedDailyRate = baseDailyRate + (extraMonthly / 30);
            const newDays = boostedDailyRate > 0 ? Math.max(1, Math.ceil(remaining / boostedDailyRate)) : baseDays;
            const daysSaved = Math.max(0, baseDays - newDays);
            const earlyFinishDate = new Date();
            earlyFinishDate.setDate(earlyFinishDate.getDate() + newDays);
            const earlyDateStr = toYMD(earlyFinishDate);

            return (
              <div
                style={{
                  marginTop: '0.65rem',
                  paddingTop: '0.6rem',
                  borderTop: '1px dashed rgba(255,255,255,0.1)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      haptic();
                      setExpandedBoostGoalId(prev => prev === goal.id ? null : goal.id);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      color: '#a78bfa'
                    }}
                  >
                    <span>🚀 What-If Simulator</span>
                    <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>
                      {isExpanded ? '▲' : '▼'}
                    </span>
                  </button>
                  {extraMonthly > 0 && (
                    <strong style={{ fontSize: '0.68rem', color: 'var(--mm-success)' }}>
                      +{formatCurrency(extraMonthly)} / mo
                    </strong>
                  )}
                </div>

                {isExpanded && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.66rem', marginBottom: '0.3rem' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Slide to simulate extra monthly savings:</span>
                      <strong style={{ color: extraMonthly > 0 ? 'var(--mm-success)' : 'var(--text-muted)' }}>
                        +{formatCurrency(extraMonthly)} / mo
                      </strong>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={maxBoost}
                      step={stepBoost}
                      value={extraMonthly}
                      onClick={e => e.stopPropagation()}
                      onChange={e => setBoostByGoal(prev => ({ ...prev, [goal.id]: Number(e.target.value) }))}
                      style={{
                        width: '100%',
                        accentColor: 'var(--mm-success)',
                        cursor: 'pointer',
                        height: 5
                      }}
                    />
                    {extraMonthly > 0 && (
                      <div
                        style={{
                          marginTop: '0.4rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '0.4rem',
                          flexWrap: 'wrap',
                          background: 'rgba(74, 222, 128, 0.1)',
                          border: '1px solid rgba(74, 222, 128, 0.25)',
                          borderRadius: 8,
                          padding: '0.35rem 0.55rem',
                          fontSize: '0.68rem' }}
                      >
                        <span style={{ color: 'var(--text-primary)' }}>
                          🎯 Finish <strong style={{ color: 'var(--mm-success)' }}>{daysSaved}d earlier</strong> ({earlyDateStr})
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openDepositModal(goal, extraMonthly);
                          }}
                          style={{
                            padding: '0.2rem 0.5rem',
                            borderRadius: 6,
                            border: '1px solid rgba(74, 222, 128, 0.4)',
                            background: 'rgba(74, 222, 128, 0.18)',
                            color: 'var(--mm-success)',
                            fontSize: '0.65rem',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          + Deposit {formatCurrency(extraMonthly)}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      ) : (
        <div
          style={{
            background: 'rgba(74, 222, 128, 0.1)',
            border: '1px solid rgba(74, 222, 128, 0.25)',
            borderRadius: 12,
            padding: '0.75rem 0.9rem',
            marginBottom: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            color: 'var(--mm-success)',
            fontSize: '0.82rem',
            fontWeight: 700 }}
        >
          <Trophy size={18} />
          Goal Accomplished! Funds are available.
        </div>
      )}

      {/* Notes if present */}
      {goal.notes && (
        <div style={{ padding: '0.35rem 0.6rem', background: 'rgba(255,255,255,0.03)', borderRadius: 8, fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '0.85rem' }}>
          💡 {goal.notes}
        </div>
      )}

      {/* ACTIONS: DEPOSIT & DEDUCT BUTTONS & QUICK CHIPS */}
      <div style={{ marginTop: 'auto', paddingTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        {/* Primary Two Action Buttons: Deposit & Deduct */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.55rem' }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={(e) => {
              e.stopPropagation();
              openDepositModal(goal);
            }}
            style={{
              padding: '0.5rem',
              fontSize: '0.8rem',
              justifyContent: 'center',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem'
            }}
          >
            <Plus size={15} /> Deposit
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openDeductModal(goal);
            }}
            disabled={current <= 0}
            style={{
              padding: '0.5rem',
              fontSize: '0.8rem',
              justifyContent: 'center',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              borderRadius: 'var(--radius-sm, 10px)',
              background: current > 0 ? 'rgba(248, 113, 113, 0.15)' : 'rgba(255,255,255,0.04)',
              color: current > 0 ? 'var(--mm-danger)' : 'var(--text-muted)',
              border: current > 0 ? '1px solid rgba(248, 113, 113, 0.35)' : '1px solid rgba(255,255,255,0.05)',
              cursor: current > 0 ? 'pointer' : 'not-allowed',
              fontWeight: 700,
              transition: 'all 0.18s'
            }}
          >
            <Minus size={15} /> Deduct
          </button>
        </div>

        {/* Quick One-Tap Deposit & Deduct Chips */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          {/* Quick Add */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <span style={{ fontSize: '0.62rem', color: 'var(--mm-success)', fontWeight: 700, minWidth: 32 }}>
              ADD:
            </span>
            {[50, 100, 500].map(amt => (
              <button
                key={amt}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleQuickDeposit(goal, amt);
                }}
                style={{
                  flex: 1,
                  padding: '0.28rem 0.35rem',
                  borderRadius: 6,
                  border: '1px solid rgba(74, 222, 128, 0.2)',
                  background: 'rgba(74, 222, 128, 0.06)',
                  color: 'var(--mm-success)',
                  fontSize: '0.68rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                +{formatCurrency(amt)}
              </button>
            ))}
          </div>

          {/* Quick Deduct (active if current > 0) */}
          {current > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <span style={{ fontSize: '0.62rem', color: 'var(--mm-danger)', fontWeight: 700, minWidth: 32 }}>
                DEDUCT:
              </span>
              {[50, 100, 500].map(amt => {
                const canDeduct = current >= amt;
                return (
                  <button
                    key={amt}
                    type="button"
                    disabled={!canDeduct}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleQuickDeduct(goal, amt);
                    }}
                    style={{
                      flex: 1,
                      padding: '0.28rem 0.35rem',
                      borderRadius: 6,
                      border: canDeduct ? '1px solid rgba(248, 113, 113, 0.2)' : '1px solid rgba(255,255,255,0.04)',
                      background: canDeduct ? 'rgba(248, 113, 113, 0.06)' : 'transparent',
                      color: canDeduct ? 'var(--mm-danger)' : 'var(--text-muted)',
                      fontSize: '0.68rem',
                      fontWeight: 600,
                      cursor: canDeduct ? 'pointer' : 'not-allowed'
                    }}
                  >
                    −{formatCurrency(amt)}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
