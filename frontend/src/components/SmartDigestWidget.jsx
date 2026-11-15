import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Sparkles, Calendar, X } from 'lucide-react';
import { formatCurrency, haptic } from '../utils/format';

export default function SmartDigestWidget({
  safeToSpendData,
  anomalies = [],
  insights = [],
  onOpenCalendar,
  onViewTransaction,
}) {
  const [dismissedAnomalies, setDismissedAnomalies] = useState(new Set());
  const [affordOpen, setAffordOpen] = useState(false);
  const [simPrice, setSimPrice] = useState('');
  const [simItem, setSimItem] = useState('');

  if (!safeToSpendData) return null;

  const {
    liquidCash,
    commitments,

    safeToSpend,
    daysRemainingInMonth,
    dailyDiscretionary,
    status,
  } = safeToSpendData;

  const statusColors = {
    healthy: { text: '#4ade80', bg: 'rgba(74, 222, 128, 0.12)', border: 'rgba(74, 222, 128, 0.25)', label: 'Safe & Liquid' },
    tight:   { text: '#fbbf24', bg: 'rgba(251, 191, 36, 0.12)', border: 'rgba(251, 191, 36, 0.25)', label: 'Moderate' },
    critical:{ text: '#f87171', bg: 'rgba(248, 113, 113, 0.12)', border: 'rgba(248, 113, 113, 0.25)', label: 'Tight Cashflow' },
  };

  const currentStatus = statusColors[status] || statusColors.healthy;
  const activeAnomalies = anomalies.filter(a => !dismissedAnomalies.has(a.id));

  const dismissAnomaly = (id) => {
    haptic(10);
    setDismissedAnomalies(prev => new Set([...prev, id]));
  };

  const parsedSimPrice = parseFloat(String(simPrice).replace(/,/g, '')) || 0;

  return (
    <div className="bento-item col-span-12" style={{ flexDirection: 'column', gap: '1rem', padding: '1.25rem 1.5rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ width: 32, height: 32, borderRadius: 10, background: 'linear-gradient(135deg, rgba(74,222,128,0.2), rgba(129,140,248,0.2))', border: '1px solid rgba(74,222,128,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Sparkles size={16} color="#4ade80" />
          </div>
          <div>
            <h3 style={{ margin: 0, fontFamily: 'Inter, sans-serif', fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.5px' }}>
              FINANCIAL INTELLIGENCE
            </h3>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif' }}>
              Liquidity burn-rate & anomaly engine
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span
            style={{
              padding: '0.2rem 0.65rem',
              borderRadius: 100,
              background: currentStatus.bg,
              border: `1px solid ${currentStatus.border}`,
              color: currentStatus.text,
              fontSize: '0.72rem',
              fontFamily: 'Inter, sans-serif',
              fontWeight: 600,
            }}
          >
            ● {currentStatus.label}
          </span>
          <button
            type="button"
            onClick={() => { setAffordOpen(v => !v); haptic(10); }}
            className="btn btn-secondary"
            style={{
              padding: '0.3rem 0.75rem',
              fontSize: '0.75rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              borderColor: affordOpen ? 'rgba(129,140,248,0.5)' : undefined,
              color: affordOpen ? '#818cf8' : undefined
            }}
          >
            <span>🔮 Can I Afford It?</span>
          </button>
          {onOpenCalendar && (
            <button
              onClick={onOpenCalendar}
              className="btn btn-secondary"
              style={{ padding: '0.3rem 0.75rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
            >
              <Calendar size={13} />
              <span>Calendar</span>
            </button>
          )}
        </div>
      </div>

      {/* Interactive "Can I Afford This?" Simulator Panel */}
      <AnimatePresence>
        {affordOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{
              background: 'linear-gradient(145deg, rgba(129,140,248,0.08) 0%, rgba(26,26,46,0.75) 100%)',
              border: '1px solid rgba(129,140,248,0.28)',
              borderRadius: 14,
              padding: '1rem 1.15rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.85rem'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.8rem', fontWeight: 700, color: '#818cf8' }}>
                  🔮 INSTANT PURCHASE IMPACT SIMULATOR
                </div>
                <button
                  type="button"
                  onClick={() => setAffordOpen(false)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.72rem' }}
                >
                  Close
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Hypothetical Item (Optional)</label>
                  <input
                    type="text"
                    value={simItem}
                    onChange={e => setSimItem(e.target.value)}
                    placeholder="e.g. New Headphones, Weekend Trip"
                    style={{ width: '100%', fontSize: '0.82rem', padding: '0.45rem 0.65rem' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Purchase Price</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    value={simPrice}
                    onChange={e => setSimPrice(e.target.value)}
                    placeholder="Enter price to test..."
                    style={{ width: '100%', fontSize: '0.82rem', padding: '0.45rem 0.65rem' }}
                  />
                </div>
              </div>

              {parsedSimPrice > 0 && (() => {
                const afterSafe = safeToSpend - parsedSimPrice;
                const newDaily = Math.max(0, afterSafe / Math.max(1, daysRemainingInMonth));
                const pctOfSafe = safeToSpend > 0 ? Math.round((parsedSimPrice / safeToSpend) * 100) : 999;

                let verdictColor = '#4ade80';
                let verdictBg = 'rgba(74,222,128,0.1)';
                let verdictTitle = '✅ Safe to Buy — Within Discretionary Buffer';
                let verdictBody = `Uses ${pctOfSafe}% of your Safe-to-Spend. Your daily allowance adjusts from ${formatCurrency(dailyDiscretionary)}/day to ${formatCurrency(newDaily)}/day for the remaining ${daysRemainingInMonth} days.`;

                if (parsedSimPrice > liquidCash) {
                  verdictColor = '#f87171';
                  verdictBg = 'rgba(248,113,113,0.12)';
                  verdictTitle = '🛑 Cannot Afford Right Now — Exceeds Total Cash';
                  verdictBody = `This purchase is ${formatCurrency(parsedSimPrice - liquidCash)} more than your total liquid cash (${formatCurrency(liquidCash)}).`;
                } else if (parsedSimPrice > safeToSpend) {
                  verdictColor = '#f87171';
                  verdictBg = 'rgba(248,113,113,0.12)';
                  verdictTitle = '🚨 High Risk — Dips Into Bill & Debt Reserves!';
                  verdictBody = `Exceeds your Safe-to-Spend by ${formatCurrency(parsedSimPrice - safeToSpend)}. Buying ${simItem || 'this'} will eat into money reserved for upcoming bills or loan EMIs.`;
                } else if (pctOfSafe > 40) {
                  verdictColor = '#fbbf24';
                  verdictBg = 'rgba(251,191,36,0.1)';
                  verdictTitle = '⚠️ Caution — Tightens Monthly Cash Flow';
                  verdictBody = `You can afford ${simItem || 'it'}, but it consumes ${pctOfSafe}% of your remaining discretionary cash. Daily allowance drops to ${formatCurrency(newDaily)}/day.`;
                }

                return (
                  <div style={{
                    background: verdictBg,
                    border: `1px solid ${verdictColor}44`,
                    borderRadius: 10,
                    padding: '0.75rem 0.95rem'
                  }}>
                    <div style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: '0.85rem', color: verdictColor }}>
                      {verdictTitle}
                    </div>
                    <div style={{ fontSize: '0.76rem', color: '#e0e0ee', marginTop: '0.25rem', lineHeight: 1.45 }}>
                      {verdictBody}
                    </div>
                  </div>
                );
              })()}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Safe to Spend KPI Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.85rem' }}>
        {/* Safe-to-Spend Hero */}
        <div
          style={{
            background: 'linear-gradient(145deg, rgba(74,222,128,0.06) 0%, rgba(37,37,64,0.6) 100%)',
            border: '1px solid rgba(74,222,128,0.2)',
            borderRadius: 14,
            padding: '1rem 1.15rem',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontFamily: 'Inter, sans-serif', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.25rem' }}>
            Safe to Spend (Discretionary)
          </div>
          <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '1.65rem', fontWeight: 800, color: currentStatus.text, letterSpacing: '-0.5px' }}>
            {formatCurrency(safeToSpend)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.35rem', fontSize: '0.74rem', color: '#e0e0ee', fontFamily: 'Inter, sans-serif' }}>
            <span>Allowance:</span>
            <strong style={{ color: '#4ade80' }}>{formatCurrency(dailyDiscretionary)}</strong>
            <span style={{ color: 'var(--text-muted)' }}>/ day ({daysRemainingInMonth}d left)</span>
          </div>
        </div>

        {/* Liquidity Breakdown Card */}
        <div
          style={{
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 14,
            padding: '1rem 1.15rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.5rem' }}>
              Cash Flow Obligations (30d)
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
              <span>Total Liquid Cash:</span>
              <strong style={{ color: 'var(--text-primary)' }}>{formatCurrency(liquidCash)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              <span>Committed Bills & Debt:</span>
              <strong style={{ color: '#f87171' }}>-{formatCurrency(commitments)}</strong>
            </div>
          </div>
          <div style={{ height: 4, width: '100%', background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden', marginTop: '0.5rem' }}>
            <div
              style={{
                height: '100%',
                width: `${liquidCash > 0 ? Math.min(100, Math.round((safeToSpend / liquidCash) * 100)) : 0}%`,
                background: currentStatus.text,
                transition: 'width 0.4s ease',
              }}
            />
          </div>
        </div>
      </div>

      {/* Proactive Anomaly Alerts */}
      <AnimatePresence>
        {activeAnomalies.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
            <div style={{ fontSize: '0.68rem', fontFamily: 'Inter, sans-serif', color: 'var(--text-muted)', letterSpacing: '1px', textTransform: 'uppercase' }}>
              PROACTIVE ALERTS ({activeAnomalies.length})
            </div>
            {activeAnomalies.map(anom => (
              <motion.div
                key={anom.id}
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                  padding: '0.6rem 0.85rem',
                  background: anom.severity === 'warning' ? 'rgba(251, 191, 36, 0.08)' : 'rgba(129, 140, 248, 0.08)',
                  border: `1px solid ${anom.severity === 'warning' ? 'rgba(251, 191, 36, 0.25)' : 'rgba(129, 140, 248, 0.25)'}`,
                  borderRadius: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                  <AlertTriangle size={15} color={anom.severity === 'warning' ? '#fbbf24' : '#818cf8'} style={{ flexShrink: 0 }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {anom.title}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {anom.message}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
                  {onViewTransaction && anom.txId && (
                    <button
                      type="button"
                      onClick={() => onViewTransaction(anom.txId)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#4ade80',
                        fontSize: '0.72rem',
                        cursor: 'pointer',
                        padding: '0.2rem 0.4rem',
                      }}
                    >
                      View
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => dismissAnomaly(anom.id)}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2 }}
                    title="Dismiss"
                  >
                    <X size={14} />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </AnimatePresence>

      {/* Smart Digest Bullet Points */}
      {insights.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.2rem' }}>
          {insights.map(item => (
            <div
              key={item.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                padding: '0.45rem 0.75rem',
                borderRadius: 8,
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.05)',
                fontSize: '0.74rem',
                color: '#d1d1e0',
                flex: '1 1 240px',
              }}
            >
              <span style={{ fontSize: '0.9rem', flexShrink: 0 }}>{item.icon}</span>
              <span>{item.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
