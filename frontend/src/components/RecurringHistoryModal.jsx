import React, { useMemo } from 'react';
import {
  Zap,
  Edit2,
  Pause,
  Play,
  Receipt,
  CheckCircle2,
  Clock
} from 'lucide-react';
import Modal from './Modal';
import { formatCurrency, haptic } from '../utils/format';
import getCategoryEmoji from '../utils/categoryEmoji';
import { todayYMD } from '../utils/dates';

export default function RecurringHistoryModal({
  isOpen,
  onClose,
  rule,
  accounts = [],
  transactions = [],
  loans = [],
  onPay,
  onEdit,
  onTogglePause,
}) {
  const currentMonth = todayYMD().substring(0, 7);

  // Merge payment history from rule.payment_history and ledger transactions
  const combinedHistory = useMemo(() => {
    if (!rule) return [];
    const ruleIdStr = String(rule.id);
    const ruleNameLower = (rule.name || rule.category || '').toLowerCase().trim();

    // 1. Existing payment_history stored on the recurring rule
    const ruleHist = Array.isArray(rule.payment_history) ? rule.payment_history : [];

    // 2. Ledger transactions linked to this recurring rule
    const ledgerTxns = (transactions || []).filter(t => {
      if (!t || t.reversed_at || t.reversal_of) return false;
      if (t.recurring_rule_id && String(t.recurring_rule_id) === ruleIdStr) return true;
      const notesLower = (t.notes || '').toLowerCase();
      if (notesLower.includes('[recurring]') && ruleNameLower && notesLower.includes(ruleNameLower)) return true;
      return false;
    });

    const map = new Map();

    // Insert from rule's recorded payment_history first
    ruleHist.forEach((h, idx) => {
      const key = `${h.month || ''}_${h.date || ''}_${h.amount || ''}_${idx}`;
      map.set(key, {
        id: h.transaction_id || `hist_${idx}`,
        month: h.month || (h.date ? h.date.slice(0, 7) : '—'),
        date: h.date || '—',
        amount: parseFloat(h.amount) || 0,
        marked_only: Boolean(h.marked_only),
        account_id: h.account_id || null,
        notes: h.notes || null,
        source: 'rule_history'
      });
    });

    // Merge in ledger transactions (actual deductions)
    ledgerTxns.forEach(tx => {
      const txMonth = (tx.date || '').slice(0, 7);
      const txAccount = tx.from_account_id || tx.to_account_id || null;
      // Look for match by month
      let matched = false;
      for (const [, val] of map.entries()) {
        if (val.month === txMonth && Math.abs(val.amount - (parseFloat(tx.amount) || 0)) < 1) {
          val.marked_only = false;
          val.account_id = txAccount || val.account_id;
          val.date = tx.date || val.date;
          val.notes = tx.notes || val.notes;
          val.transaction_id = tx.id;
          matched = true;
          break;
        }
      }
      if (!matched) {
        map.set(`tx_${tx.id}`, {
          id: tx.id,
          month: txMonth || '—',
          date: tx.date || '—',
          amount: parseFloat(tx.amount) || 0,
          marked_only: false,
          account_id: txAccount,
          notes: tx.notes || null,
          source: 'ledger_transaction'
        });
      }
    });

    // Sort by month / date descending
    return Array.from(map.values()).sort((a, b) => {
      const ma = a.month || a.date || '';
      const mb = b.month || b.date || '';
      return mb.localeCompare(ma);
    });
  }, [rule, transactions]);

  if (!rule) return null;

  const isPaidThisMonth = rule.last_applied_month === currentMonth;
  const isFlexible = (rule.schedule_mode || (rule.day_of_month ? 'fixed' : 'flexible')) === 'flexible';
  const effectiveAmt = (() => {
    const direct = parseFloat(rule.amount) || parseFloat(rule.avg_amount) || 0;
    if (direct > 0) return direct;
    if (rule.is_variable && combinedHistory.length > 0) {
      const recent3 = combinedHistory.slice(0, 3);
      const avg = recent3.reduce((s, h) => s + h.amount, 0) / recent3.length;
      if (avg > 0) return Math.round(avg);
    }
    return 0;
  })();

  const linkedLoan = rule.loan_id ? loans.find(l => String(l.id) === String(rule.loan_id)) : null;
  const loanPrincipal = linkedLoan ? parseFloat(linkedLoan.principal_amount) || 0 : 0;
  const loanApr = linkedLoan ? parseFloat(linkedLoan.annual_interest_rate) || 0 : 0;
  const loanMonthlyInt = loanPrincipal > 0 && loanApr > 0 ? Math.round((loanPrincipal * (loanApr / 100)) / 12) : 0;
  const loanAccrued = linkedLoan ? Math.round(parseFloat(linkedLoan.current_accrued_interest ?? linkedLoan.unpaid_interest) || 0) : 0;

  // History stats
  const totalPaid = combinedHistory.reduce((s, h) => s + h.amount, 0);
  const amounts = combinedHistory.map(h => h.amount).filter(a => a > 0);
  const minPaid = amounts.length > 0 ? Math.min(...amounts) : effectiveAmt;
  const maxPaid = amounts.length > 0 ? Math.max(...amounts) : effectiveAmt;

  const getAccountName = (accId) => {
    if (!accId) return null;
    const found = accounts.find(a => String(a.id) === String(accId));
    return found ? found.name : 'Bank Account';
  };

  const typeColor = rule.type === 'Income'
    ? '#4ade80'
    : rule.type === 'Loan Payment' || rule.loan_id
      ? '#fbbf24'
      : rule.type === 'Transfer'
        ? '#818cf8'
        : '#f87171';

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
                background: `${typeColor}18`,
                border: `1px solid ${typeColor}35`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.6rem',
                flexShrink: 0,
                boxShadow: `0 4px 16px ${typeColor}20`
              }}
            >
              {rule.loan_id || rule.type === 'Loan Payment' ? '🪙' : getCategoryEmoji(rule.category)}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, fontFamily: 'Inter, sans-serif', fontWeight: 800, fontSize: '1.25rem', color: 'var(--text-primary)' }}>
                  {rule.name || rule.category}
                </h2>
                <span
                  style={{
                    fontSize: '0.65rem',
                    fontFamily: 'Inter, sans-serif',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 20,
                    background: isPaidThisMonth
                      ? (rule.last_paid_marked_only ? 'rgba(148,163,184,0.15)' : 'rgba(74,222,128,0.15)')
                      : 'rgba(251,191,36,0.15)',
                    border: `1px solid ${isPaidThisMonth
                      ? (rule.last_paid_marked_only ? 'rgba(148,163,184,0.35)' : 'rgba(74,222,128,0.35)')
                      : 'rgba(251,191,36,0.35)'}`,
                    color: isPaidThisMonth
                      ? (rule.last_paid_marked_only ? '#94a3b8' : '#4ade80')
                      : '#fbbf24'
                  }}
                >
                  {isPaidThisMonth
                    ? (rule.last_paid_marked_only ? '🔕 MARKED PAID (NO DEDUCTION)' : `✅ PAID & DEDUCTED (${formatCurrency(rule.last_paid_amount || effectiveAmt)})`)
                    : '🔔 REMINDER • DUE THIS MONTH'}
                </span>
                {rule.paused && (
                  <span style={{ fontSize: '0.62rem', padding: '1px 5px', borderRadius: 4, background: 'rgba(255,255,255,0.08)', color: '#888', border: '1px solid #444' }}>
                    PAUSED
                  </span>
                )}
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif', marginTop: 3 }}>
                <span>Frequency: <strong style={{ color: 'var(--text-secondary)' }}>{rule.frequency || 'Monthly'}</strong></span>
                <span> · Schedule: <strong style={{ color: isFlexible ? '#38bdf8' : 'var(--text-secondary)' }}>
                  {isFlexible ? `🗓️ No Fixed Date (${rule.flexible_window || 'Anytime'})` : `📅 Day ${rule.day_of_month || 1}`}
                </strong></span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button
              type="button"
              className="icon-btn"
              title={rule.paused ? 'Resume' : 'Pause'}
              onClick={() => { haptic(); if (onTogglePause) onTogglePause(rule); }}
              style={{ color: rule.paused ? '#4ade80' : '#fbbf24' }}
            >
              {rule.paused ? <Play size={15} /> : <Pause size={15} />}
            </button>
            <button
              type="button"
              className="icon-btn"
              title="Edit Rule"
              onClick={() => { haptic(); onClose(); if (onEdit) onEdit(rule); }}
            >
              <Edit2 size={15} />
            </button>
          </div>
        </div>

        {/* Hero Amount & Intelligence Card */}
        <div
          style={{
            background: `linear-gradient(135deg, ${typeColor}10 0%, rgba(255,255,255,0.02) 100%)`,
            border: `1px solid ${typeColor}30`,
            borderRadius: 16,
            padding: '1.1rem 1.25rem'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <div style={{ fontSize: '0.68rem', color: typeColor, fontWeight: 800, fontFamily: 'Inter, sans-serif', letterSpacing: '0.8px' }}>
                {rule.is_variable ? 'MONTHLY ESTIMATE (3-MO ROLLING AVG)' : 'SCHEDULED PAYMENT AMOUNT'}
              </div>
              <div style={{ fontSize: '1.9rem', fontWeight: 900, color: typeColor, fontFamily: 'Inter, sans-serif', marginTop: '0.2rem' }}>
                {rule.type === 'Income' ? '+' : '-'}{rule.is_variable ? '~' : ''}{formatCurrency(effectiveAmt)}
              </div>
              <div style={{ display: 'flex', gap: '0.85rem', marginTop: '0.35rem', fontSize: '0.75rem', fontFamily: 'Inter, sans-serif', flexWrap: 'wrap' }}>
                {rule.is_variable && (
                  <span style={{ color: '#c4b5fd', fontWeight: 600 }}>
                    📈 Variable Bill (Adjusts with actual payments)
                  </span>
                )}
                {(rule.min_amount > 0 || rule.max_amount > 0) && (
                  <span style={{ color: 'var(--text-muted)' }}>
                    Expected Range: {formatCurrency(rule.min_amount || 0)} – {formatCurrency(rule.max_amount || effectiveAmt)}
                  </span>
                )}
              </div>
            </div>

            {/* Linked Loan Quick Badge if applicable */}
            {linkedLoan && (
              <div style={{ padding: '0.6rem 0.8rem', borderRadius: 12, background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.28)', maxWidth: 220 }}>
                <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#fbbf24', letterSpacing: '0.5px' }}>
                  🪙 LINKED LOAN TELEMETRY
                </div>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-primary)', marginTop: 2 }}>
                  Principal: <strong>{formatCurrency(loanPrincipal)}</strong> ({loanApr}% APR)
                </div>
                {loanMonthlyInt > 0 && (
                  <div style={{ fontSize: '0.7rem', color: '#4ade80', marginTop: 1 }}>
                    Monthly Interest: ~{formatCurrency(loanMonthlyInt)}
                  </div>
                )}
                {loanAccrued > 0 && (
                  <div style={{ fontSize: '0.7rem', color: '#f87171', marginTop: 1 }}>
                    Accrued: {formatCurrency(loanAccrued)}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* History Analytics Strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.5rem' }}>
          <div style={{ padding: '0.65rem 0.85rem', borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif' }}>PAYMENTS RECORDED</div>
            <div style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'Inter, sans-serif', marginTop: 2 }}>
              {combinedHistory.length} months
            </div>
          </div>
          <div style={{ padding: '0.65rem 0.85rem', borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif' }}>TOTAL AMOUNT PAID</div>
            <div style={{ fontSize: '0.92rem', fontWeight: 800, color: typeColor, fontFamily: 'Inter, sans-serif', marginTop: 2 }}>
              {formatCurrency(totalPaid)}
            </div>
          </div>
          {amounts.length > 1 && (
            <div style={{ padding: '0.65rem 0.85rem', borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif' }}>MIN – MAX RECORDED</div>
              <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#38bdf8', fontFamily: 'Inter, sans-serif', marginTop: 2 }}>
                {formatCurrency(minPaid)} – {formatCurrency(maxPaid)}
              </div>
            </div>
          )}
        </div>

        {/* Payment History List */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
            <div style={{ fontSize: '0.74rem', fontWeight: 800, letterSpacing: '1px', color: 'var(--text-primary)', fontFamily: 'Inter, sans-serif', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Receipt size={14} style={{ color: '#38bdf8' }} />
              MONTHLY PAYMENT HISTORY ({combinedHistory.length})
            </div>
          </div>

          {combinedHistory.length === 0 ? (
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
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(56,189,248,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Clock size={18} style={{ color: '#38bdf8' }} />
              </div>
              <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'Inter, sans-serif' }}>
                No Payment Records Yet
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', maxWidth: 360, fontFamily: 'Inter, sans-serif' }}>
                When you pay or mark this commitment each month, your actual paid amounts, dates, and account deductions will appear here in chronological order.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', maxHeight: 290, overflowY: 'auto', paddingRight: 4 }}>
              {combinedHistory.map((item, idx) => {
                const isMarkOnly = item.marked_only;
                const sourceAccName = getAccountName(item.account_id);

                return (
                  <div
                    key={item.id || idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.75rem 0.95rem',
                      borderRadius: 12,
                      background: isMarkOnly ? 'rgba(255,255,255,0.02)' : 'rgba(74,222,128,0.05)',
                      border: `1px solid ${isMarkOnly ? 'rgba(255,255,255,0.08)' : 'rgba(74,222,128,0.22)'}`,
                      borderLeft: `4px solid ${isMarkOnly ? '#94a3b8' : '#4ade80'}`,
                      gap: '0.75rem'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', minWidth: 0 }}>
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 9,
                          background: isMarkOnly ? 'rgba(148,163,184,0.12)' : 'rgba(74,222,128,0.15)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}
                      >
                        {isMarkOnly ? <Clock size={16} style={{ color: '#94a3b8' }} /> : <CheckCircle2 size={16} style={{ color: '#4ade80' }} />}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'Inter, sans-serif' }}>
                            {item.month || item.date}
                          </span>
                          <span
                            style={{
                              fontSize: '0.64rem',
                              padding: '1px 7px',
                              borderRadius: 6,
                              background: isMarkOnly ? 'rgba(148,163,184,0.14)' : 'rgba(74,222,128,0.14)',
                              border: `1px solid ${isMarkOnly ? 'rgba(148,163,184,0.3)' : 'rgba(74,222,128,0.3)'}`,
                              color: isMarkOnly ? '#94a3b8' : '#4ade80',
                              fontFamily: 'Inter, sans-serif',
                              fontWeight: 600
                            }}
                          >
                            {isMarkOnly ? '🔕 No Account Deduction' : (sourceAccName ? `💳 Deducted: ${sourceAccName}` : '💳 Deducted from Account')}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif', marginTop: 2 }}>
                          📅 Payment Date: {item.date} {item.notes ? `• ${item.notes}` : ''}
                        </div>
                      </div>
                    </div>

                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: '0.95rem', fontWeight: 800, color: typeColor, fontFamily: 'Inter, sans-serif' }}>
                        {formatCurrency(item.amount)}
                      </div>
                      <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif' }}>
                        {item.month === currentMonth ? 'Current Month' : 'Past Month'}
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
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => { haptic(); onClose(); if (onPay) onPay(rule); }}
            style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem', padding: '0.48rem 0.95rem' }}
          >
            <Zap size={14} />
            {isPaidThisMonth ? '💳 Pay & Deduct Again' : `💳 Pay & Deduct (${formatCurrency(effectiveAmt)})`}
          </button>

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
