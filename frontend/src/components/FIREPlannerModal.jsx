import React, { useState, useEffect, useMemo } from 'react';
import 'framer-motion';
import 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, CartesianGrid
} from 'recharts';
import Modal from './Modal';
import { fetchAccounts, fetchInvestments, fetchTransactions, fetchExchangeRates } from '../utils/api';
import { toYMD, todayYMD } from '../utils/dates';
import { convertCurrency, formatCurrency, getCurrency, haptic } from '../utils/format';
import 'react-hot-toast';

export default function FIREPlannerModal({ isOpen, onClose }) {
  // Core user inputs
  const [currentAge, setCurrentAge] = useState(28);
  const [targetAge,,] = useState(48);
  const [currentPortfolio, setCurrentPortfolio] = useState(25000);
  const [monthlyContribution, setMonthlyContribution] = useState(1200);
  const [annualExpenses, setAnnualExpenses] = useState(36000);
  const [expectedReturn, setExpectedReturn] = useState(8.0); // %
  // %
const [inflationRate,,] = useState(2.8); // %   // %
  const [swr, setSwr] = useState(4.0);                       // % Safe Withdrawal Rate
  const [firePreset, setFirePreset] = useState('standard');  // 'lean' | 'standard' | 'fat' | 'coast'

  // 'lean' | 'standard' | 'fat' | 'coast'

const [, setLoading] = useState(true);

// Auto-populate from actual user portfolio & transactions on open

  // Auto-populate from actual user portfolio & transactions on open
  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      const baseCur = getCurrency();
      Promise.all([
        fetchAccounts().catch(() => []),
        fetchInvestments().catch(() => []),
        fetchTransactions().catch(() => []),
        fetchExchangeRates().catch(() => null),
      ]).then(([accounts, investments, txs, rates]) => {
        const toBase = (amt, cur) => {
          const val = Number(amt) || 0;
          const c = cur || baseCur;
          if (c === baseCur || !rates) return val;
          const conv = convertCurrency(val, c, baseCur, rates);
          return Number.isFinite(conv) ? conv : val;
        };

        // Compute current invested / liquid assets
        const totalInvested = (investments || []).reduce((s, i) => {
          const unitVal = parseFloat(i.current_value);
          const rawVal = Number.isFinite(unitVal) && unitVal > 0
            ? unitVal
            : (parseFloat(i.current_price ?? i.buy_price) || 0) * (parseFloat(i.quantity) || 0);
          return s + toBase(rawVal, i.currency);
        }, 0);
        const liquidCash = (accounts || [])
          .filter(a => !['Credit Card', 'Loan', 'Mortgage', 'Liability', 'Credit'].includes(a.type) && !a.is_liability)
          .reduce((s, a) => s + Math.max(0, toBase(a.balance, a.currency)), 0);

        const initialAssets = totalInvested + liquidCash;
        if (initialAssets > 0) setCurrentPortfolio(Math.round(initialAssets));

        // Estimate 12-month annual expenses from active outflows over last 90 local calendar days
        const todayStr = todayYMD();
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        const cutoffStr = toYMD(ninetyDaysAgo);
        const recentExpenses = (txs || [])
          .filter(t =>
            !t.reversed_at &&
            !t.reversal_of &&
            !t.is_transfer_fee &&
            ['Expense', 'Loan Payment'].includes(t.type) &&
            t.date >= cutoffStr &&
            t.date <= todayStr
          )
          .reduce((s, t) => s + toBase(t.amount, t.currency), 0);

        if (recentExpenses > 0) {
          const annualized = (recentExpenses / 3) * 12;
          setAnnualExpenses(Math.round(annualized));
          setMonthlyContribution(Math.max(200, Math.round(annualized * 0.25 / 12)));
        }
      }).finally(() => setLoading(false));
    }
  }, [isOpen]);

  // Adjust expenses according to FIRE preset
  const effectiveAnnualExpenses = useMemo(() => {
    if (firePreset === 'lean') return annualExpenses * 0.75;
    if (firePreset === 'fat') return annualExpenses * 1.35;
    return annualExpenses;
  }, [annualExpenses, firePreset]);

  // Calculations
  const {
    fireNumber,
    crossoverAge,
    yearsToFIRE,
    chartData,
    safeMonthlyPassiveIncome,
    coastFireNumber,
  } = useMemo(() => {
    const swrDecimal = Math.max(0.01, swr / 100);
    const targetFIRENumber = effectiveAnnualExpenses / swrDecimal;

    const realReturnRate = (1 + expectedReturn / 100) / (1 + inflationRate / 100) - 1;
    const monthlyRealRate = Math.pow(1 + realReturnRate, 1 / 12) - 1;

    let balance = currentPortfolio;
    let foundCrossoverAge = null;
    const data = [];
    const maxAge = Math.min(90, Math.max(currentAge + 40, targetAge + 15));

    const milestoneTargets = [50000, 100000, 250000, 500000, 1000000, 2000000, targetFIRENumber];
    const achievedMilestones = {};

    for (let age = currentAge; age <= maxAge; age++) {
      data.push({
        age,
        portfolio: Math.round(balance),
        fireTarget: Math.round(targetFIRENumber),
      });

      // Check crossover
      if (balance >= targetFIRENumber && foundCrossoverAge === null) {
        foundCrossoverAge = age;
      }

      // Check milestones
      milestoneTargets.forEach(tgt => {
        if (balance >= tgt && !achievedMilestones[tgt]) {
          achievedMilestones[tgt] = age;
        }
      });

      // Simulate 12 months growth
      for (let m = 0; m < 12; m++) {
        // Once retired, stop contributions or deduct expenses
        if (foundCrossoverAge && age >= foundCrossoverAge) {
          balance = (balance - effectiveAnnualExpenses / 12) * (1 + monthlyRealRate);
        } else {
          balance = (balance + monthlyContribution) * (1 + monthlyRealRate);
        }
      }
    }

    const yrs = foundCrossoverAge ? Math.max(0, foundCrossoverAge - currentAge) : null;
    const monthlyPassive = (currentPortfolio * swrDecimal) / 12;

    // Coast FIRE calculation for retirement at age 65
    const yearsTo65 = Math.max(1, 65 - currentAge);
    const coastTarget = targetFIRENumber / Math.pow(1 + realReturnRate, yearsTo65);

    return {
      fireNumber: Math.round(targetFIRENumber),
      crossoverAge: foundCrossoverAge,
      yearsToFIRE: yrs,
      chartData: data,
      safeMonthlyPassiveIncome: Math.round(monthlyPassive),
      coastFireNumber: Math.round(coastTarget),
      milestones: achievedMilestones
    };
  }, [
    currentAge, targetAge, currentPortfolio, monthlyContribution,
    effectiveAnnualExpenses, expectedReturn, inflationRate, swr
  ]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="🔥 Retirement & FIRE Simulator" maxWidth="940px">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        
        {/* Preset Selector */}
        <div style={{ display: 'flex', gap: '0.5rem', background: 'rgba(255,255,255,0.03)', padding: '0.35rem', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
          {[
            { id: 'standard', label: 'Traditional FIRE', desc: '100% current expenses', icon: '🎯' },
            { id: 'lean', label: 'Lean FIRE', desc: 'Minimalist (75% exp)', icon: '🌱' },
            { id: 'fat', label: 'Fat FIRE', desc: 'Luxury (135% exp)', icon: '👑' },
            { id: 'coast', label: 'Coast FIRE', desc: 'No further contributions needed', icon: '⛵' },
          ].map(p => (
            <button
              key={p.id}
              onClick={() => { setFirePreset(p.id); haptic(5); }}
              style={{
                flex: 1,
                padding: '0.65rem 0.5rem',
                borderRadius: 9,
                border: 'none',
                background: firePreset === p.id ? 'rgba(251,146,60,0.18)' : 'transparent',
                color: firePreset === p.id ? '#fb923c' : 'var(--mm-text-3)',
                cursor: 'pointer',
                textAlign: 'center',
                transition: 'all 0.15s'
              }}
            >
              <div style={{ fontSize: '0.82rem', fontWeight: 700 }}>{p.icon} {p.label}</div>
              <div style={{ fontSize: '0.65rem', opacity: 0.8, marginTop: 2 }}>{p.desc}</div>
            </button>
          ))}
        </div>

        {/* Top KPI Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '0.75rem',
          padding: '1.25rem',
          background: 'linear-gradient(135deg, rgba(251,146,60,0.08), rgba(236,72,153,0.05))',
          borderRadius: 14,
          border: '1px solid rgba(251,146,60,0.2)'
        }}>
          <div>
            <div style={{ fontSize: '0.72rem', color: '#fb923c', fontWeight: 600 }}>FIRE FREEDOM NUMBER</div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: 2 }}>
              {formatCurrency(fireNumber)}
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--mm-text-3)', marginTop: 2 }}>Based on {swr}% safe withdrawal</div>
          </div>

          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--mm-success)', fontWeight: 600 }}>CROSSOVER AGE</div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--mm-success)', marginTop: 2 }}>
              {crossoverAge ? `Age ${crossoverAge}` : 'Age 75+'}
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--mm-text-3)', marginTop: 2 }}>
              {yearsToFIRE !== null ? `In ~${yearsToFIRE} years` : 'Adjust savings rate'}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.72rem', color: '#38bdf8', fontWeight: 600 }}>PASSIVE MONTHLY DIVIDEND</div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#38bdf8', marginTop: 2 }}>
              {formatCurrency(safeMonthlyPassiveIncome)}/mo
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--mm-text-3)', marginTop: 2 }}>Safe perpetual drawdown now</div>
          </div>

          <div>
            <div style={{ fontSize: '0.72rem', color: '#a78bfa', fontWeight: 600 }}>COAST FIRE THRESHOLD</div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#a78bfa', marginTop: 2 }}>
              {formatCurrency(coastFireNumber)}
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--mm-text-3)', marginTop: 2 }}>
              {currentPortfolio >= coastFireNumber ? '✅ Coast FIRE Achieved!' : `Need +${formatCurrency(Math.max(0, coastFireNumber - currentPortfolio))}`}
            </div>
          </div>
        </div>

        {/* Projection Chart */}
        <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1.25rem', borderRadius: 14, border: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--mm-text-2)' }}>
              WEALTH ACCUMULATION CURVE (AGE {currentAge} → {currentAge + chartData.length})
            </span>
            <span style={{ fontSize: '0.72rem', color: '#fb923c' }}>
              🔥 Crossover at {formatCurrency(fireNumber)}
            </span>
          </div>

          <div style={{ width: '100%', height: 260 }}>
            <ResponsiveContainer>
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="fireGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#fb923c" stopOpacity={0.35}/>
                    <stop offset="95%" stopColor="#fb923c" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="age" stroke="#666" tick={{ fontSize: 11 }} />
                <YAxis
                  stroke="#666"
                  tick={{ fontSize: 11 }}
                  tickFormatter={v => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : `${Math.round(v/1000)}k`}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const d = payload[0].payload;
                      return (
                        <div style={{ background: 'var(--bg-void)', border: '1px solid #444', borderRadius: 8, padding: '8px 12px' }}>
                          <div style={{ color: 'var(--mm-text-2)', fontSize: '0.75rem' }}>Age {d.age}</div>
                          <div style={{ color: '#fb923c', fontWeight: 700, fontSize: '0.9rem' }}>
                            Net Worth: {formatCurrency(d.portfolio)}
                          </div>
                          <div style={{ color: 'var(--mm-text-3)', fontSize: '0.75rem' }}>
                            FIRE Goal: {formatCurrency(d.fireTarget)}
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <ReferenceLine y={fireNumber} stroke="#fb923c" strokeDasharray="4 4" />
                <Area type="monotone" dataKey="portfolio" stroke="#fb923c" strokeWidth={2.5} fillOpacity={1} fill="url(#fireGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Interactive Sliders & Inputs Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '1rem', background: 'rgba(255,255,255,0.02)', padding: '1.25rem', borderRadius: 14, border: '1px solid rgba(255,255,255,0.06)' }}>
          {/* Current Portfolio */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--mm-text-3)', marginBottom: 4 }}>
              <span>Current Assets</span>
              <strong style={{ color: 'var(--text-primary)' }}>{formatCurrency(currentPortfolio)}</strong>
            </div>
            <input
              type="range"
              min="0"
              max="1000000"
              step="5000"
              value={currentPortfolio}
              onChange={e => setCurrentPortfolio(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#fb923c' }}
            />
          </div>

          {/* Monthly Savings */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--mm-text-3)', marginBottom: 4 }}>
              <span>Monthly Savings</span>
              <strong style={{ color: 'var(--mm-success)' }}>+{formatCurrency(monthlyContribution)}/mo</strong>
            </div>
            <input
              type="range"
              min="0"
              max="15000"
              step="100"
              value={monthlyContribution}
              onChange={e => setMonthlyContribution(Number(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--mm-success)' }}
            />
          </div>

          {/* Annual Living Expenses */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--mm-text-3)', marginBottom: 4 }}>
              <span>Annual Expenses</span>
              <strong style={{ color: 'var(--mm-danger)' }}>{formatCurrency(effectiveAnnualExpenses)}/yr</strong>
            </div>
            <input
              type="range"
              min="10000"
              max="200000"
              step="2000"
              value={annualExpenses}
              onChange={e => setAnnualExpenses(Number(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--mm-danger)' }}
            />
          </div>

          {/* Expected ROI */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--mm-text-3)', marginBottom: 4 }}>
              <span>Expected Annual ROI</span>
              <strong style={{ color: '#38bdf8' }}>{expectedReturn}%</strong>
            </div>
            <input
              type="range"
              min="3"
              max="15"
              step="0.5"
              value={expectedReturn}
              onChange={e => setExpectedReturn(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#38bdf8' }}
            />
          </div>

          {/* Current Age */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--mm-text-3)', marginBottom: 4 }}>
              <span>Current Age</span>
              <strong style={{ color: 'var(--text-primary)' }}>{currentAge} yrs</strong>
            </div>
            <input
              type="range"
              min="18"
              max="70"
              value={currentAge}
              onChange={e => setCurrentAge(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#818cf8' }}
            />
          </div>

          {/* SWR Safe Withdrawal Rate */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--mm-text-3)', marginBottom: 4 }}>
              <span>Safe Withdrawal Rate (SWR)</span>
              <strong style={{ color: '#a78bfa' }}>{swr}%</strong>
            </div>
            <input
              type="range"
              min="2.5"
              max="6.0"
              step="0.1"
              value={swr}
              onChange={e => setSwr(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#a78bfa' }}
            />
          </div>
        </div>

      </div>
    </Modal>
  );
}
