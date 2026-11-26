import { motion } from 'framer-motion';
import { Trash2, Edit2, Pause, Play, Zap, CheckSquare, Square, Check, X } from 'lucide-react';
import { formatCurrency, haptic } from '../../utils/format';
import getCategoryEmoji from '../../utils/categoryEmoji';
import { freqLabel, getRuleEffectiveAmount, freqMonthly, getRuleUrgency } from '../recurring/model';

// One recurring rule: amount, schedule, urgency, 6-month bars and actions.
export default function RuleCard({ rule, idx, accounts, currentMonth, editingEstId, editingEstVal, loans, openEdit, openPayRuleModal, saveInlineEstimate, selectedIds, setConfirm, setEditingEstId, setEditingEstVal, setSelectedRuleForHistoryId, togglePause, toggleRulePaidThisMonth, toggleSelectRule, transactions }) {
  const isPaidThisMonth = rule.last_applied_month === currentMonth;
  const isFlexible = (r => (r.schedule_mode || (r.day_of_month ? 'fixed' : 'flexible')) === 'flexible')(rule);
  const effectiveAmt = getRuleEffectiveAmount(rule);
  const monthly = freqMonthly(rule);
  const isIncome = rule.type === 'Income';
  const isLoan = Boolean(rule.loan_id) || rule.type === 'Loan Payment';
  const isTransfer = rule.type === 'Transfer';
  const urgency = getRuleUrgency(rule, currentMonth);
  const isSelected = selectedIds.includes(String(rule.id));
  const isEditingEst = String(editingEstId) === String(rule.id);

  const typeColor = isIncome
    ? '#34d399'
    : isLoan
      ? '#f59e0b'
      : isTransfer
        ? '#5b8def'
        : '#f87171';

  const targetAccountId = isIncome ? rule.to_account_id : rule.from_account_id;
  const acct = accounts.find(a => String(a.id) === String(targetAccountId));
  const destAcct = isTransfer ? accounts.find(a => String(a.id) === String(rule.to_account_id)) : null;
  const history6 = Array.isArray(rule.payment_history) ? rule.payment_history.slice(-6) : [];
  const maxHistAmt = history6.length > 0 ? Math.max(...history6.map(h => parseFloat(h.amount) || 0), 1) : 1;
  const lastHistAmt = history6.length > 0 ? parseFloat(history6[history6.length - 1].amount) || 0 : 0;
  const avgHistAmt = history6.length > 0
    ? history6.reduce((s, h) => s + (parseFloat(h.amount) || 0), 0) / history6.length
    : 0;
  const variancePct = avgHistAmt > 0 && history6.length >= 2
    ? Math.round(((lastHistAmt - avgHistAmt) / avgHistAmt) * 100)
    : 0;

  const linkedLoan = rule.loan_id ? loans.find(l => String(l.id) === String(rule.loan_id)) : null;
  const loanPrincipal = linkedLoan ? parseFloat(linkedLoan.principal_amount) || 0 : 0;
  const loanApr = linkedLoan ? parseFloat(linkedLoan.annual_interest_rate) || 0 : 0;
  const loanMonthlyInt = loanPrincipal > 0 && loanApr > 0 ? Math.round((loanPrincipal * (loanApr / 100)) / 12) : 0;
  const loanAccrued = linkedLoan ? Math.round(parseFloat(linkedLoan.current_accrued_interest ?? linkedLoan.unpaid_interest) || 0) : 0;

  const allHistoryCount = (() => {
    const ruleHist = Array.isArray(rule.payment_history) ? rule.payment_history : [];
    const ruleIdStr = String(rule.id);
    const ruleNameLower = (rule.name || rule.category || '').toLowerCase().trim();
    const ledgerTxns = (transactions || []).filter(t => {
      if (!t || t.reversed_at || t.reversal_of) return false;
      if (t.recurring_rule_id && String(t.recurring_rule_id) === ruleIdStr) return true;
      const notesLower = (t.notes || '').toLowerCase();
      return notesLower.includes('[recurring]') && ruleNameLower && notesLower.includes(ruleNameLower);
    });
    const months = new Set();
    ruleHist.forEach(h => { if (h.month || h.date) months.add(h.month || (h.date ? h.date.slice(0, 7) : '')); });
    ledgerTxns.forEach(t => { if (t.date) months.add(t.date.slice(0, 7)); });
    months.delete('');
    return Math.max(months.size, ruleHist.length);
  })();

  return (
    <motion.div
      key={rule.id}
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: rule.paused ? 0.58 : 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.22, delay: Math.min(idx * 0.025, 0.2) }}
      whileHover={{ y: -2 }}
      onClick={() => {
        haptic();
        setSelectedRuleForHistoryId(rule.id);
      }}
      style={{
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        padding: '0.95rem 1.15rem',
        background: isSelected
          ? 'rgba(91, 141, 239, 0.09)'
          : rule.paused
            ? 'var(--mm-bg-surface, rgba(255,255,255,0.02))'
            : urgency.cardBg,
        border: `1px solid ${isSelected ? 'rgba(91, 141, 239, 0.45)' : rule.paused ? 'var(--mm-border, rgba(255,255,255,0.08))' : urgency.cardBorder}`,
        borderLeft: `4px solid ${rule.paused ? '#64748b' : urgency.accentColor}`,
        borderRadius: 14,
        gap: '0.85rem',
        boxShadow: isPaidThisMonth
          ? '0 4px 18px rgba(16, 185, 129, 0.06)'
          : urgency.level === 'overdue'
            ? '0 4px 18px rgba(239, 68, 68, 0.08)'
            : '0 2px 10px rgba(0, 0, 0, 0.12)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: '1 1 280px', minWidth: 0 }}>
        {/* Multi-Select Checkbox */}
        <button
          type="button"
          onClick={(e) => toggleSelectRule(rule.id, e)}
          aria-label={`Select ${rule.name || rule.category}`}
          style={{
            background: 'transparent',
            border: 'none',
            padding: 2,
            cursor: 'pointer',
            color: isSelected ? 'var(--mm-accent, #5b8def)' : 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            flexShrink: 0,
          }}
        >
          {isSelected ? <CheckSquare size={17} /> : <Square size={17} />}
        </button>

        {/* Icon Box with Paid / Overdue Corner Badge */}
        <div style={{
          position: 'relative',
          width: 42,
          height: 42,
          borderRadius: 12,
          background: isPaidThisMonth
            ? 'rgba(16, 185, 129, 0.14)'
            : urgency.level === 'overdue'
              ? 'rgba(239, 68, 68, 0.14)'
              : 'var(--mm-bg-elevated, rgba(255,255,255,0.05))',
          border: `1px solid ${isPaidThisMonth ? 'rgba(16, 185, 129, 0.35)' : urgency.level === 'overdue' ? 'rgba(239, 68, 68, 0.35)' : 'var(--mm-border-subtle, rgba(255,255,255,0.08))'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1.2rem',
          flexShrink: 0,
        }}>
          {isLoan ? '🪙' : getCategoryEmoji(rule.category)}
          {!rule.paused && (
            <span
              style={{
                position: 'absolute',
                bottom: -4,
                right: -4,
                width: 17,
                height: 17,
                borderRadius: '50%',
                background: isPaidThisMonth ? 'var(--mm-success)' : urgency.level === 'overdue' ? 'var(--mm-danger)' : 'var(--mm-warning)',
                color: '#06120e',
                fontSize: '0.62rem',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '2px solid var(--bg-primary, #0c1017)',
              }}
              title={isPaidThisMonth ? 'Paid This Month' : 'Unpaid / Due This Month'}
            >
              {isPaidThisMonth ? '✓' : '!'}
            </span>
          )}
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{
              fontWeight: 700,
              fontSize: '0.95rem',
              color: 'var(--text-primary)',
              textDecoration: rule.paused ? 'line-through' : 'none',
            }}>
              {rule.name || rule.category}
            </span>

            {/* High-Contrast Paid vs. Unpaid Status Stamp */}
            {!rule.paused ? (
              <span style={{
                fontSize: '0.68rem',
                fontWeight: 700,
                letterSpacing: '0.2px',
                padding: '3px 9px',
                borderRadius: 999,
                background: urgency.bg,
                border: `1px solid ${urgency.border}`,
                color: urgency.color,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
              }}>
                {urgency.label}
              </span>
            ) : (
              <span style={{ fontSize: '0.64rem', fontWeight: 600, color: 'var(--text-muted)', border: '1px solid var(--mm-border)', borderRadius: 999, padding: '2px 8px' }}>
                ⏸ PAUSED
              </span>
            )}

            {rule.is_variable && (
              <span style={{
                fontSize: '0.63rem',
                fontWeight: 600,
                padding: '2px 7px',
                borderRadius: 6,
                background: 'rgba(91, 141, 239, 0.1)',
                border: '1px solid rgba(91, 141, 239, 0.24)',
                color: '#93c5fd',
              }}>
                Variable {history6.length > 0 ? `(${history6.length}mo avg)` : 'est.'}
              </span>
            )}

            {variancePct !== 0 && Math.abs(variancePct) >= 5 && (
              <span style={{
                fontSize: '0.62rem',
                fontWeight: 600,
                padding: '2px 6px',
                borderRadius: 6,
                background: variancePct > 0 ? 'rgba(248, 113, 113, 0.1)' : 'rgba(52, 211, 153, 0.1)',
                color: variancePct > 0 ? 'var(--mm-danger)' : 'var(--mm-success)',
              }} title="Latest payment vs historical average">
                {variancePct > 0 ? `+${variancePct}%` : `${variancePct}%`} vs avg
              </span>
            )}
          </div>

          {/* Clean Metadata Row */}
          <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: 4, display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span>{rule.frequency || 'Monthly'}</span>
            <span>·</span>
            <span style={{ color: !isPaidThisMonth && urgency.level === 'overdue' ? 'var(--mm-danger)' : 'var(--text-secondary)', fontWeight: 500 }}>
              {isFlexible ? `Flexible (${rule.flexible_window || 'Anytime'})` : `Day ${rule.day_of_month}`}
            </span>
            {acct && (
              <>
                <span>·</span>
                <span>🏦 {isTransfer && destAcct ? `${acct.name} → ${destAcct.name}` : acct.name}</span>
              </>
            )}
            {isPaidThisMonth && rule.last_paid_date && (
              <>
                <span>·</span>
                <span style={{ color: 'var(--mm-success)', fontWeight: 600 }}>Paid on {rule.last_paid_date}</span>
              </>
            )}
            {(rule.min_amount > 0 || rule.max_amount > 0) && (
              <>
                <span>·</span>
                <span>Range: {formatCurrency(rule.min_amount || 0)}–{formatCurrency(rule.max_amount || effectiveAmt)}</span>
              </>
            )}
            <span>·</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                haptic();
                setSelectedRuleForHistoryId(rule.id);
              }}
              style={{
                background: 'transparent',
                border: 'none',
                padding: 0,
                color: 'var(--mm-accent, #5b8def)',
                fontSize: '0.73rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              History ({allHistoryCount})
            </button>
          </div>

          {/* Linked Loan Telemetry */}
          {linkedLoan && (
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: 5, fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
              <span>Principal: <strong>{formatCurrency(loanPrincipal)}</strong> ({loanApr}% APR)</span>
              {loanMonthlyInt > 0 && <span>· Interest: ~{formatCurrency(loanMonthlyInt)}/mo</span>}
              {loanAccrued > 0 && <span style={{ color: 'var(--mm-danger)' }}>· Accrued: {formatCurrency(loanAccrued)}</span>}
            </div>
          )}
        </div>
      </div>

      {/* Right Side: Mini 6-Month Spark-Bars + Inline Estimate Editor + High-Clarity Action Buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
        {/* 6-Month Mini Spark-Bars */}
        {history6.length > 0 && (
          <div
            onClick={(e) => {
              e.stopPropagation();
              setSelectedRuleForHistoryId(rule.id);
            }}
            title={`Last ${history6.length} payment(s): ${history6.map(h => `${h.month || h.date?.slice(0, 7) || ''}: ${formatCurrency(h.amount)}`).join(' | ')}`}
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: 3,
              height: 28,
              padding: '3px 6px',
              borderRadius: 8,
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--mm-border-subtle, rgba(255,255,255,0.07))',
            }}
          >
            {history6.map((h, i) => {
              const val = parseFloat(h.amount) || 0;
              const hPct = Math.max(22, Math.round((val / maxHistAmt) * 100));
              const isLatest = i === history6.length - 1;
              return (
                <div
                  key={i}
                  style={{
                    width: 5,
                    height: `${hPct}%`,
                    borderRadius: 2,
                    background: isLatest ? (isPaidThisMonth ? '#10b981' : '#5b8def') : 'rgba(148, 163, 184, 0.45)',
                  }}
                />
              );
            })}
          </div>
        )}

        {/* Amount + 1-Click Inline Estimate Editor */}
        <div style={{ textAlign: 'right', minWidth: 115 }} onClick={e => e.stopPropagation()}>
          {isEditingEst ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input
                type="number"
                step="any"
                value={editingEstVal}
                onChange={e => setEditingEstVal(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') saveInlineEstimate(rule, e);
                  if (e.key === 'Escape') setEditingEstId(null);
                }}
                autoFocus
                style={{ width: 92, padding: '0.22rem 0.45rem', fontSize: '0.82rem', borderRadius: 6 }}
              />
              <button
                type="button"
                className="icon-btn"
                title="Save estimate"
                onClick={e => saveInlineEstimate(rule, e)}
                style={{ color: 'var(--mm-success)' }}
              >
                <Check size={14} />
              </button>
              <button
                type="button"
                className="icon-btn"
                title="Cancel"
                onClick={() => setEditingEstId(null)}
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5 }}>
                <span style={{
                  fontWeight: 800,
                  fontSize: '1.02rem',
                  color: isPaidThisMonth ? 'var(--mm-success)' : typeColor,
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {isIncome ? '+' : '-'}{rule.is_variable ? '~' : ''}{formatCurrency(effectiveAmt)}
                </span>
                <button
                  type="button"
                  title="Quick-edit monthly estimate"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingEstId(rule.id);
                    setEditingEstVal(String(effectiveAmt || ''));
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    padding: 2,
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: '0.72rem',
                    lineHeight: 1,
                  }}
                >
                  ✎
                </button>
              </div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 1 }}>
                {isPaidThisMonth && rule.last_paid_amount
                  ? `Paid ${formatCurrency(rule.last_paid_amount)}`
                  : `${freqLabel(rule.frequency)} · ~${formatCurrency(Math.round(monthly))}/mo`}
              </div>
            </>
          )}
        </div>

        {!rule.paused && (
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              type="button"
              className={isPaidThisMonth ? 'btn btn-secondary' : 'btn btn-primary'}
              onClick={(e) => {
                e.stopPropagation();
                openPayRuleModal(rule);
              }}
              style={{
                padding: '0.42rem 0.85rem',
                fontSize: '0.74rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '0.32rem',
                whiteSpace: 'nowrap',
                ...(isPaidThisMonth ? {} : {
                  background: urgency.level === 'overdue'
                    ? 'linear-gradient(135deg, #ef4444, #dc2626)'
                    : undefined,
                }),
              }}
            >
              <Zap size={13} />
              {isPaidThisMonth
                ? (isIncome ? 'Record Again' : 'Pay Again')
                : (isIncome ? 'Receive Now' : 'Pay Now')}
            </button>

            <button
              type="button"
              className="btn btn-secondary"
              onClick={(e) => {
                e.stopPropagation();
                toggleRulePaidThisMonth(rule);
              }}
              style={{
                padding: '0.42rem 0.72rem',
                fontSize: '0.72rem',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                borderColor: isPaidThisMonth ? 'rgba(245, 158, 11, 0.35)' : 'rgba(16, 185, 129, 0.38)',
                color: isPaidThisMonth ? 'var(--mm-warning)' : 'var(--mm-success)',
                background: isPaidThisMonth ? 'rgba(245, 158, 11, 0.08)' : 'rgba(16, 185, 129, 0.1)',
              }}
              title={isPaidThisMonth ? 'Undo paid status and mark as due this month' : 'Mark as already paid this month without deducting from an account'}
            >
              {isPaidThisMonth ? '↺ Mark Unpaid' : '✓ Mark Paid'}
            </button>
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.2rem', flexShrink: 0 }}>
          <button
            className="icon-btn"
            title={rule.paused ? 'Resume' : 'Pause'}
            onClick={(e) => {
              e.stopPropagation();
              togglePause(rule);
            }}
          >
            {rule.paused ? <Play size={14} /> : <Pause size={14} />}
          </button>
          <button
            className="icon-btn"
            title="Edit"
            onClick={(e) => {
              e.stopPropagation();
              openEdit(rule);
            }}
          >
            <Edit2 size={14} />
          </button>
          <button
            className="icon-btn"
            title="Delete"
            style={{ color: 'var(--danger)' }}
            onClick={(e) => {
              e.stopPropagation();
              setConfirm({ open: true, id: rule.id });
            }}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
