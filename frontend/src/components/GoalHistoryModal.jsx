import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Plus,
  Minus,
  Edit2,
  Sparkles,
  Receipt
} from 'lucide-react';
import Modal from './Modal';
import { formatCurrency, haptic } from '../utils/format';

export default function GoalHistoryModal({
  isOpen,
  onClose,
  goal,
  accounts = [],
  transactions = [],
  onDeposit,
  onDeduct,
  onEdit,
}) {
  const [filterType, setFilterType] = useState('all'); // 'all' | 'deposits' | 'withdrawals'

  // Extract all transaction history for this specific goal
  const goalHistory = useMemo(() => {
    if (!goal) return [];
    const goalIdStr = String(goal.id);
    const goalNameLower = (goal.name || '').toLowerCase().trim();

    const matches = (transactions || []).filter(t => {
      if (!t || t.reversed_at || t.reversal_of || t.is_transfer_fee) return false;
      if (t.goal_id && String(t.goal_id) === goalIdStr) return true;
      const notesLower = (t.notes || '').toLowerCase();
      const catLower = (t.category || '').toLowerCase();
      if ((catLower.includes('goal') || catLower.includes('saving')) && goalNameLower && notesLower.includes(goalNameLower)) {
        return true;
      }
      return false;
    });

    // Sort newest first
    return matches.sort((a, b) => new Date(b.date || b.created_at || 0) - new Date(a.date || a.created_at || 0));
  }, [goal, transactions]);

  if (!goal) return null;

  const current = parseFloat(goal.current_amount) || 0;
  const target = parseFloat(goal.target_amount) || 0;
  const remaining = Math.max(0, target - current);
  const progressPct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
  const isReached = target > 0 && current >= target;

  // Compute total deposits and withdrawals from history
  const totalDeposited = goalHistory
    .filter(t => t.type === 'Expense' || (t.category || '').toLowerCase().includes('contribution'))
    .reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);

  const totalWithdrawn = goalHistory
    .filter(t => t.type === 'Income' || (t.category || '').toLowerCase().includes('deduction'))
    .reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);

  const filteredHistory = goalHistory.filter(t => {
    const isWithdrawal = t.type === 'Income' || (t.category || '').toLowerCase().includes('deduction');
    if (filterType === 'deposits') return !isWithdrawal;
    if (filterType === 'withdrawals') return isWithdrawal;
    return true;
  });

  const getAccountName = (accId) => {
    if (!accId) return null;
    const found = accounts.find(a => String(a.id) === String(accId));
    return found ? found.name : 'Bank Account';
  };

  const accentColor = goal.color || (isReached ? '#4ade80' : '#06b6d4');

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title=""
      maxWidth="680px"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
        {/* Top Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '-0.3rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 14,
                background: `${accentColor}18`,
                border: `1px solid ${accentColor}35`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.6rem',
                flexShrink: 0,
                boxShadow: `0 4px 16px ${accentColor}20`
              }}
            >
              {goal.icon || '🎯'}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, fontFamily: 'Inter, sans-serif', fontWeight: 800, fontSize: '1.25rem', color: 'var(--text-primary)' }}>
                  {goal.name}
                </h2>
                <span
                  style={{
                    fontSize: '0.65rem',
                    fontFamily: 'Inter, sans-serif',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 20,
                    background: isReached ? 'rgba(74,222,128,0.15)' : `${accentColor}18`,
                    border: `1px solid ${isReached ? 'rgba(74,222,128,0.35)' : `${accentColor}35`}`,
                    color: isReached ? '#4ade80' : accentColor
                  }}
                >
                  {isReached ? '🏆 TARGET REACHED' : `${progressPct}% COMPLETED`}
                </span>
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif', marginTop: 3 }}>
                Category: <strong style={{ color: 'var(--text-secondary)' }}>{goal.category || 'General Savings'}</strong>
                {goal.target_date && <span> · Deadline: <strong style={{ color: 'var(--text-secondary)' }}>{goal.target_date}</strong></span>}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button
              type="button"
              className="icon-btn"
              title="Edit Goal"
              onClick={() => { haptic(); onClose(); if (onEdit) onEdit(goal); }}
            >
              <Edit2 size={15} />
            </button>
          </div>
        </div>

        {/* Hero Progress Banner */}
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(74, 222, 128, 0.09) 0%, rgba(6, 182, 212, 0.08) 100%)',
            border: '1px solid rgba(74, 222, 128, 0.22)',
            borderRadius: 16,
            padding: '1.1rem 1.25rem',
            position: 'relative',
            overflow: 'hidden'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <div style={{ fontSize: '0.68rem', color: '#4ade80', fontWeight: 800, fontFamily: 'Inter, sans-serif', letterSpacing: '0.8px' }}>
                CURRENT SAVINGS BALANCE
              </div>
              <div style={{ fontSize: '1.9rem', fontWeight: 900, color: '#4ade80', fontFamily: 'Inter, sans-serif', marginTop: '0.2rem' }}>
                {formatCurrency(current)}
              </div>
              <div style={{ display: 'flex', gap: '0.85rem', marginTop: '0.35rem', fontSize: '0.76rem', fontFamily: 'Inter, sans-serif' }}>
                <span style={{ color: 'var(--text-secondary)' }}>
                  Target: <strong style={{ color: 'var(--text-primary)' }}>{formatCurrency(target)}</strong>
                </span>
                <span style={{ color: remaining > 0 ? '#fbbf24' : '#4ade80', fontWeight: 600 }}>
                  {remaining > 0 ? `Remaining: ${formatCurrency(remaining)}` : 'Fully Funded 🎉'}
                </span>
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '1.35rem', fontWeight: 900, color: isReached ? '#4ade80' : '#38bdf8', fontFamily: 'Inter, sans-serif' }}>
                {progressPct}%
              </div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif' }}>
                {goalHistory.length} total activity log(s)
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div style={{ width: '100%', height: 8, background: 'rgba(255,255,255,0.08)', borderRadius: 10, marginTop: '1rem', overflow: 'hidden' }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
              style={{
                height: '100%',
                background: isReached ? 'linear-gradient(90deg, #4ade80, #22c55e)' : 'linear-gradient(90deg, #38bdf8, #818cf8)',
                borderRadius: 10
              }}
            />
          </div>
        </div>

        {/* History Analytics Strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.5rem' }}>
          <div style={{ padding: '0.65rem 0.85rem', borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif' }}>TOTAL DEPOSITED</div>
            <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#4ade80', fontFamily: 'Inter, sans-serif', marginTop: 2 }}>
              +{formatCurrency(totalDeposited)}
            </div>
          </div>
          <div style={{ padding: '0.65rem 0.85rem', borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif' }}>TOTAL WITHDRAWN</div>
            <div style={{ fontSize: '0.92rem', fontWeight: 800, color: totalWithdrawn > 0 ? '#f87171' : 'var(--text-muted)', fontFamily: 'Inter, sans-serif', marginTop: 2 }}>
              {totalWithdrawn > 0 ? `-${formatCurrency(totalWithdrawn)}` : 'LKR 0'}
            </div>
          </div>
          <div style={{ padding: '0.65rem 0.85rem', borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif' }}>NET CONTRIBUTIONS</div>
            <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#38bdf8', fontFamily: 'Inter, sans-serif', marginTop: 2 }}>
              {formatCurrency(totalDeposited - totalWithdrawn)}
            </div>
          </div>
        </div>

        {/* Transaction History Section */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ fontSize: '0.74rem', fontWeight: 800, letterSpacing: '1px', color: 'var(--text-primary)', fontFamily: 'Inter, sans-serif', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Receipt size={14} style={{ color: '#06b6d4' }} />
              CONTRIBUTION & WITHDRAWAL HISTORY ({goalHistory.length})
            </div>

            {/* Filter Pills */}
            <div style={{ display: 'flex', gap: '0.3rem' }}>
              {[
                { id: 'all', label: `All (${goalHistory.length})` },
                { id: 'deposits', label: 'Deposits' },
                { id: 'withdrawals', label: 'Withdrawals' },
              ].map(f => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => { haptic(); setFilterType(f.id); }}
                  style={{
                    padding: '0.22rem 0.55rem',
                    borderRadius: 14,
                    fontSize: '0.66rem',
                    fontFamily: 'Inter, sans-serif',
                    fontWeight: 600,
                    cursor: 'pointer',
                    border: filterType === f.id ? '1px solid rgba(56,189,248,0.45)' : '1px solid rgba(255,255,255,0.08)',
                    background: filterType === f.id ? 'rgba(56,189,248,0.16)' : 'rgba(255,255,255,0.02)',
                    color: filterType === f.id ? '#38bdf8' : 'var(--text-secondary)'
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Timeline List */}
          {filteredHistory.length === 0 ? (
            <div
              style={{
                padding: '2.25rem 1rem',
                borderRadius: 14,
                background: 'rgba(255,255,255,0.02)',
                border: '1px dashed rgba(255,255,255,0.1)',
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0.5rem'
              }}
            >
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(6,182,212,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Sparkles size={18} style={{ color: '#06b6d4' }} />
              </div>
              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'Inter, sans-serif' }}>
                No Contribution Records Yet
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', maxWidth: 360, fontFamily: 'Inter, sans-serif' }}>
                When you deposit or withdraw money for this goal, every payment and deduction with its date and bank account will be tracked here.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', maxHeight: 290, overflowY: 'auto', paddingRight: 4 }}>
              {filteredHistory.map((item, idx) => {
                const isWithdrawal = item.type === 'Income' || (item.category || '').toLowerCase().includes('deduction');
                const amt = parseFloat(item.amount) || 0;
                const sourceAccName = getAccountName(item.from_account_id || item.to_account_id);

                return (
                  <div
                    key={item.id || idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.75rem 0.95rem',
                      borderRadius: 12,
                      background: isWithdrawal ? 'rgba(248,113,113,0.05)' : 'rgba(74,222,128,0.05)',
                      border: `1px solid ${isWithdrawal ? 'rgba(248,113,113,0.2)' : 'rgba(74,222,128,0.2)'}`,
                      borderLeft: `4px solid ${isWithdrawal ? '#f87171' : '#4ade80'}`,
                      gap: '0.75rem'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', minWidth: 0 }}>
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 9,
                          background: isWithdrawal ? 'rgba(248,113,113,0.15)' : 'rgba(74,222,128,0.15)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}
                      >
                        {isWithdrawal ? <ArrowUpRight size={16} style={{ color: '#f87171' }} /> : <ArrowDownLeft size={16} style={{ color: '#4ade80' }} />}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'Inter, sans-serif' }}>
                            {isWithdrawal ? 'Goal Deduction' : 'Goal Contribution'}
                          </span>
                          {sourceAccName && (
                            <span style={{ fontSize: '0.64rem', padding: '1px 6px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)', fontFamily: 'Inter, sans-serif' }}>
                              💳 {sourceAccName}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          📅 {item.date || '—'} {item.notes ? `• ${item.notes}` : ''}
                        </div>
                      </div>
                    </div>

                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: '0.92rem', fontWeight: 800, color: isWithdrawal ? '#f87171' : '#4ade80', fontFamily: 'Inter, sans-serif' }}>
                        {isWithdrawal ? '-' : '+'}{formatCurrency(amt)}
                      </div>
                      <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif' }}>
                        {isWithdrawal ? 'Debited from goal' : 'Added to goal'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.65rem', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => { haptic(); onClose(); if (onDeposit) onDeposit(goal); }}
              style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', padding: '0.48rem 0.9rem' }}
            >
              <Plus size={14} /> + Deposit
            </button>
            <button
              type="button"
              onClick={() => { haptic(); onClose(); if (onDeduct) onDeduct(goal); }}
              disabled={current <= 0}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontSize: '0.78rem',
                padding: '0.48rem 0.9rem',
                borderRadius: 'var(--radius-sm, 10px)',
                background: current > 0 ? 'rgba(248, 113, 113, 0.15)' : 'rgba(255,255,255,0.04)',
                color: current > 0 ? '#f87171' : 'var(--text-muted)',
                border: current > 0 ? '1px solid rgba(248, 113, 113, 0.35)' : '1px solid rgba(255,255,255,0.05)',
                cursor: current > 0 ? 'pointer' : 'not-allowed',
                fontFamily: 'Inter, sans-serif',
                fontWeight: 700
              }}
            >
              <Minus size={14} /> - Withdraw
            </button>
          </div>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            style={{ fontSize: '0.78rem', padding: '0.48rem 0.9rem' }}
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
