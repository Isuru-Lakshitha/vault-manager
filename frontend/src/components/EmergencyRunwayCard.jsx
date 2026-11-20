import React, { useState, useEffect, useMemo } from 'react';
import { ArrowUpRight, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { fetchExchangeRates } from '../utils/api';
import { convertCurrency, formatCurrency, getCurrency, haptic } from '../utils/format';

export default function EmergencyRunwayCard({ accounts = [], analytics = {}, onNavigateGoals }) {
  const [expanded, setExpanded] = useState(false);
  const baseCur = getCurrency();
  const [rates, setRates] = useState(null);

  useEffect(() => {
    if ((accounts || []).some(a => (a.currency || baseCur) !== baseCur)) {
      fetchExchangeRates().then(r => { if (r) setRates(r); }).catch(() => {});
    }
  }, [accounts, baseCur]);

  // Compute liquid cash across non-liability cash/bank/savings/wallet accounts
  const liquidCash = useMemo(() => {
    const excluded = new Set(['Credit Card', 'Loan', 'Mortgage', 'Liability', 'Credit', 'Investment']);
    return (accounts || [])
      .filter(a => !excluded.has(a.type) && !a.is_liability)
      .reduce((sum, a) => {
        const raw = Math.max(0, Number(a.balance) || 0);
        const cur = a.currency || baseCur;
        let val = raw;
        if (cur !== baseCur && rates) {
          const conv = convertCurrency(raw, cur, baseCur, rates);
          if (Number.isFinite(conv)) val = conv;
        }
        return sum + val;
      }, 0);
  }, [accounts, baseCur, rates]);

  // Compute monthly burn rate
  const monthlyBurn = analytics.avgMonthlySpend > 0
    ? analytics.avgMonthlySpend
    : (analytics.monthlyTrends?.length > 0
      ? (analytics.monthlyTrends.reduce((s, m) => s + (m.Expense || 0), 0) / analytics.monthlyTrends.length)
      : 50000);

  const runwayMonths = monthlyBurn > 0 ? (liquidCash / monthlyBurn) : 0;
  const runwayMonthsNum = parseFloat(runwayMonths.toFixed(1));

  // Determine Tier & Status
  let status = {
    tier: 1,
    badge: '🚨 VULNERABLE RUNWAY',
    title: 'High Fragility Risk',
    color: '#f87171',
    bgColor: 'rgba(248, 113, 113, 0.08)',
    borderColor: 'rgba(248, 113, 113, 0.25)',
    description: 'Liquid cash covers less than 1 month of normal expenses. Prioritize building an emergency buffer.',
  };

  if (runwayMonthsNum >= 6) {
    status = {
      tier: 4,
      badge: '🛡️ FORTRESS LEVEL',
      title: 'Elite Emergency Runway',
      color: '#4ade80',
      bgColor: 'rgba(74, 222, 128, 0.08)',
      borderColor: 'rgba(74, 222, 128, 0.25)',
      description: 'Your liquid reserves can sustain you for 6+ months without income. Outstanding resilience!',
    };
  } else if (runwayMonthsNum >= 3) {
    status = {
      tier: 3,
      badge: '✅ SECURE BUFFER',
      title: 'Solid Financial Safety Net',
      color: '#38bdf8',
      bgColor: 'rgba(56, 189, 248, 0.08)',
      borderColor: 'rgba(56, 189, 248, 0.25)',
      description: 'Meets the recommended standard of 3–6 months essential living expenses in liquid cash.',
    };
  } else if (runwayMonthsNum >= 1) {
    status = {
      tier: 2,
      badge: '⚠️ BUILDING BUFFER',
      title: 'Emerging Safety Net',
      color: '#fbbf24',
      bgColor: 'rgba(251, 191, 36, 0.08)',
      borderColor: 'rgba(251, 191, 36, 0.25)',
      description: 'You have a short buffer. Aim to accumulate 3 months of burn to safeguard against life surprises.',
    };
  }

  // Calculate target numbers
  const target3Mo = monthlyBurn * 3;
  const target6Mo = monthlyBurn * 6;
  const progress3Mo = target3Mo > 0 ? Math.min(100, Math.round((liquidCash / target3Mo) * 100)) : 0;
  const progress6Mo = target6Mo > 0 ? Math.min(100, Math.round((liquidCash / target6Mo) * 100)) : 0;

  // Calculate survival horizon date
  const survivalDate = new Date();
  survivalDate.setDate(survivalDate.getDate() + Math.round(runwayMonthsNum * 30.4));
  const survivalDateStr = survivalDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      style={{
        background: status.bgColor,
        border: `1px solid ${status.borderColor}`,
        borderRadius: 16,
        padding: '1.25rem 1.5rem',
        marginBottom: '1.5rem',
        backdropFilter: 'blur(10px)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <span style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '1px', padding: '0.2rem 0.55rem', borderRadius: 6, background: `${status.color}22`, color: status.color }}>
              {status.badge}
            </span>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Monthly Burn: ~{formatCurrency(monthlyBurn)}
            </span>
          </div>
          <div style={{ fontSize: '1.45rem', fontWeight: 800, color: status.color, display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}>
            <span>{runwayMonthsNum > 36 ? '36+' : runwayMonthsNum} Months</span>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>of Emergency Runway</span>
          </div>
          <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: 2 }}>
            Liquid Cash: <strong style={{ color: 'var(--text-primary)' }}>{formatCurrency(liquidCash)}</strong> • Safe until <strong style={{ color: status.color }}>{survivalDateStr}</strong>
          </div>
        </div>

        <button
          onClick={() => { haptic(); setExpanded(e => !e); }}
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 8,
            padding: '0.35rem 0.75rem',
            color: 'var(--text-secondary)',
            fontSize: '0.75rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.3rem',
          }}
        >
          {expanded ? 'Hide Targets' : 'Fortress Targets'}
          <ChevronRight size={14} style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />
        </button>
      </div>

      {/* Target Progress Bars */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
        {/* 3-Month Target */}
        <div style={{ padding: '0.75rem 0.9rem', borderRadius: 10, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', marginBottom: '0.4rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>3-Month Basic Buffer</span>
            <span style={{ fontWeight: 700, color: progress3Mo >= 100 ? 'var(--mm-success)' : '#38bdf8' }}>
              {progress3Mo}% ({formatCurrency(target3Mo)})
            </span>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
            <motion.div initial={{ width: 0 }} animate={{ width: `${progress3Mo}%` }} transition={{ duration: 0.8 }}
              style={{ height: '100%', background: progress3Mo >= 100 ? 'var(--mm-success)' : 'linear-gradient(90deg, #38bdf8, #818cf8)' }} />
          </div>
        </div>

        {/* 6-Month Target */}
        <div style={{ padding: '0.75rem 0.9rem', borderRadius: 10, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.04)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', marginBottom: '0.4rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>6-Month Fortress Goal</span>
            <span style={{ fontWeight: 700, color: progress6Mo >= 100 ? 'var(--mm-success)' : 'var(--mm-warning)' }}>
              {progress6Mo}% ({formatCurrency(target6Mo)})
            </span>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
            <motion.div initial={{ width: 0 }} animate={{ width: `${progress6Mo}%` }} transition={{ duration: 0.8 }}
              style={{ height: '100%', background: progress6Mo >= 100 ? 'var(--mm-success)' : 'linear-gradient(90deg, #fbbf24, #4ade80)' }} />
          </div>
        </div>
      </div>

      {expanded && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '0 0 0.75rem', lineHeight: 1.5 }}>
            {status.description}
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {onNavigateGoals && (
              <button
                onClick={onNavigateGoals}
                style={{
                  padding: '0.4rem 0.85rem',
                  borderRadius: 8,
                  background: 'rgba(74,222,128,0.15)',
                  border: '1px solid rgba(74,222,128,0.3)',
                  color: 'var(--mm-success)',
                  fontSize: '0.74rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                }}
              >
                🎯 Set Emergency Fund Goal <ArrowUpRight size={13} />
              </button>
            )}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
