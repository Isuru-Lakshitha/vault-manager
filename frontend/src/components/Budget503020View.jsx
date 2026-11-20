import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Sparkles, Sliders, ChevronDown, ChevronUp } from 'lucide-react';
import { formatCurrency, getCurrencyLabel } from '../utils/format';
import getCategoryEmoji from '../utils/categoryEmoji';
import { todayYMD } from '../utils/dates';

const DEFAULT_MAPPING = {
  // Needs (Essential living costs)
  'Housing': 'needs', 'Rent': 'needs', 'Utilities': 'needs', 'Electricity': 'needs',
  'Water': 'needs', 'Groceries': 'needs', 'Food': 'needs', 'Transport': 'needs',
  'Fuel': 'needs', 'Health': 'needs', 'Medical': 'needs', 'Insurance': 'needs',
  'Bills': 'needs', 'Maintenance': 'needs', 'Education': 'needs', 'Phone': 'needs',

  // Wants (Discretionary lifestyle spend)
  'Shopping': 'wants', 'Entertainment': 'wants', 'Dining': 'wants', 'Restaurants': 'wants',
  'Travel': 'wants', 'Leisure': 'wants', 'Subscriptions': 'wants', 'Hobbies': 'wants',
  'Gifts': 'wants', 'Personal Care': 'wants', 'Coffee': 'wants', 'Electronics': 'wants',

  // Savings & Debt Extra
  'Savings': 'savings', 'Investment': 'savings', 'Investments': 'savings',
  'Emergency Fund': 'savings', 'Stocks': 'savings', 'Crypto': 'savings',
  'Debt Payoff': 'savings', 'Retirement': 'savings',
};

const PILLAR_CONFIG = {
  needs: {
    title: 'Needs',
    targetPct: 50,
    color: '#38bdf8', // sky-400
    glow: 'rgba(56, 189, 248, 0.2)',
    desc: 'Housing, Groceries, Utilities, Health, Transport',
    badge: 'Essential Living',
    icon: '🏠'
  },
  wants: {
    title: 'Wants',
    targetPct: 30,
    color: '#a78bfa', // purple-400
    glow: 'rgba(167, 139, 250, 0.2)',
    desc: 'Dining, Entertainment, Shopping, Travel, Leisure',
    badge: 'Lifestyle & Fun',
    icon: '🛍️'
  },
  savings: {
    title: 'Savings & Debt',
    targetPct: 20,
    color: '#4ade80', // emerald-400
    glow: 'rgba(74, 222, 128, 0.2)',
    desc: 'Investments, Emergency Fund, Debt Prepayments',
    badge: 'Wealth & Security',
    icon: '🌱'
  }
};

export default function Budget503020View({ analyticsData }) {
  const [customIncomeOverride, setCustomIncomeOverride] = useState('');
  const [expandedPillar, setExpandedPillar] = useState(null);
  const [customMapping, setCustomMapping] = useState(() => {
    try {
      const saved = localStorage.getItem('vm_503020_mapping');
      return saved ? JSON.parse(saved) : DEFAULT_MAPPING;
    } catch {
      return DEFAULT_MAPPING;
    }
  });

  // Calculate monthly income from active non-reversed transactions or latest monthly trend
  const detectedMonthlyIncome = useMemo(() => {
    if (!analyticsData) return 0;
    const currentMonth = todayYMD().slice(0, 7);
    if (analyticsData.allTransactions && Array.isArray(analyticsData.allTransactions)) {
      const monthIncomes = analyticsData.allTransactions.filter(
        t => !t.reversed_at && !t.reversal_of && !t.is_transfer_fee &&
          t.type === 'Income' && t.date && t.date.startsWith(currentMonth)
      );
      if (monthIncomes.length > 0) {
        return monthIncomes.reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
      }
    }
    if (Array.isArray(analyticsData.monthlyTrends) && analyticsData.monthlyTrends.length > 0) {
      const latestWithInc = [...analyticsData.monthlyTrends].reverse().find(m => m.Income > 0);
      if (latestWithInc) return Number(latestWithInc.Income) || 0;
    }
    return 0;
  }, [analyticsData]);

  const activeIncome = useMemo(() => {
    const override = parseFloat(customIncomeOverride);
    if (!isNaN(override) && override > 0) return override;
    return detectedMonthlyIncome > 0 ? detectedMonthlyIncome : 100000; // baseline fallback if no income logged yet
  }, [customIncomeOverride, detectedMonthlyIncome]);

  // Group current month's expenses by pillar (falling back to latest active month or categoryData)
  const pillarStats = useMemo(() => {
    const currentMonth = todayYMD().slice(0, 7);
    let rawCategories = [];
    const curMonthMap = analyticsData?.monthlyExpensesByCategory?.[currentMonth] || analyticsData?.currentMonthExpensesByCategory;
    if (curMonthMap && Object.keys(curMonthMap).length > 0) {
      rawCategories = Object.entries(curMonthMap).map(([category, total]) => ({ category, total }));
    } else if (analyticsData?.monthlyExpensesByCategory && Object.keys(analyticsData.monthlyExpensesByCategory).length > 0) {
      const latestMonth = Object.keys(analyticsData.monthlyExpensesByCategory).sort().pop();
      const latestMap = analyticsData.monthlyExpensesByCategory[latestMonth] || {};
      rawCategories = Object.entries(latestMap).map(([category, total]) => ({ category, total }));
    } else {
      rawCategories = analyticsData?.categoryData || [];
    }

    const totals = {
      needs: { spent: 0, items: [] },
      wants: { spent: 0, items: [] },
      savings: { spent: 0, items: [] }
    };

    rawCategories.forEach(cat => {
      const name = cat.category || 'Uncategorized';
      const cleanName = name.replace(/^[^\w\s]+/, '').trim();
      const amount = Number(cat.total) || 0;

      // Check user custom mapping or default mapping
      let pillar = customMapping[name] || customMapping[cleanName];
      if (!pillar) {
        // Fallback search keywords
        const lower = name.toLowerCase();
        if (lower.includes('rent') || lower.includes('food') || lower.includes('groc') || lower.includes('bill') || lower.includes('util') || lower.includes('health') || lower.includes('trans')) {
          pillar = 'needs';
        } else if (lower.includes('save') || lower.includes('invest') || lower.includes('fund') || lower.includes('stock')) {
          pillar = 'savings';
        } else {
          pillar = 'wants';
        }
      }

      totals[pillar].spent += amount;
      totals[pillar].items.push({ name, amount, cleanName });
    });

    // Also factor in positive savings if user income > expenses
    const totalExpense = totals.needs.spent + totals.wants.spent;
    const netSavings = Math.max(0, activeIncome - totalExpense);
    if (totals.savings.spent === 0 && netSavings > 0) {
      totals.savings.spent = netSavings;
      totals.savings.items.push({ name: 'Net Cash Retained', amount: netSavings, isCalculated: true });
    }

    return totals;
  }, [analyticsData, customMapping, activeIncome]);

  // Reassign a category to another pillar
  const handleAssignCategory = (catName, newPillar) => {
    const updated = { ...customMapping, [catName]: newPillar };
    setCustomMapping(updated);
    try {
      localStorage.setItem('vm_503020_mapping', JSON.stringify(updated));
    } catch {}
  };

  // Percentages of active income
  const totalSpentAcrossAll = pillarStats.needs.spent + pillarStats.wants.spent + pillarStats.savings.spent;
  const baseForPercentages = activeIncome > 0 ? activeIncome : (totalSpentAcrossAll || 1);

  const needsPct = Math.round((pillarStats.needs.spent / baseForPercentages) * 100);
  const wantsPct = Math.round((pillarStats.wants.spent / baseForPercentages) * 100);
  const savingsPct = Math.round((pillarStats.savings.spent / baseForPercentages) * 100);

  // Verdict evaluation
  const verdict = useMemo(() => {
    if (needsPct <= 50 && wantsPct <= 30 && savingsPct >= 20) {
      return {
        title: '🌟 Perfect 50/30/20 Balance',
        desc: 'Your living expenses are well-contained, wants are measured, and you are building wealth at or above the golden 20% benchmark.',
        color: '#4ade80'
      };
    }
    if (needsPct > 50) {
      return {
        title: '⚠️ Needs Elevated (>50%)',
        desc: `Fixed necessities account for ${needsPct}% of your income. Consider reviewing recurring bills, housing, or high fixed debt to unlock cashflow.`,
        color: '#f87171'
      };
    }
    if (wantsPct > 30) {
      return {
        title: '🛍️ Discretionary Overspend (>30%)',
        desc: `Lifestyle spending is consuming ${wantsPct}% of cash flow. Trimming 5-10% from leisure or shopping will rapidly accelerate savings.`,
        color: '#fbbf24'
      };
    }
    return {
      title: '📈 Wealth Expansion Opportunity',
      desc: `Your necessities and wants are under control (${needsPct}% / ${wantsPct}%). Allocate your unspent margin to high-yield savings or investments.`,
      color: '#38bdf8'
    };
  }, [needsPct, wantsPct, savingsPct]);

  // Donut chart data
  const chartData = [
    { name: 'Needs (50%)', value: pillarStats.needs.spent, color: PILLAR_CONFIG.needs.color },
    { name: 'Wants (30%)', value: pillarStats.wants.spent, color: PILLAR_CONFIG.wants.color },
    { name: 'Savings (20%)', value: pillarStats.savings.spent, color: PILLAR_CONFIG.savings.color }
  ].filter(d => d.value > 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginBottom: '2rem' }}>
      {/* Top Banner: Income Baseline & Simulator */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        style={{
          background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.7), rgba(15, 23, 42, 0.8))',
          borderRadius: 16,
          border: '1px solid rgba(255, 255, 255, 0.08)',
          padding: '1.25rem 1.5rem',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          backdropFilter: 'blur(12px)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.2), rgba(129, 140, 248, 0.2))',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.4rem'
            }}
          >
            🎯
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', letterSpacing: '1px' }}>
                50/30/20 MONTHLY ALLOCATION ENGINE
              </span>
              <span style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: 4, background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', fontWeight: 600 }}>
                YNAB & Senator Warren Standard
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginTop: '0.2rem' }}>
              <span style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {formatCurrency(activeIncome)}
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {customIncomeOverride ? '(Simulated Monthly Income)' : '(Detected Monthly Net Income)'}
              </span>
            </div>
          </div>
        </div>

        {/* Simulator Input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(0,0,0,0.3)', padding: '0.35rem 0.75rem', borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)' }}>
            <Sliders size={14} color="#818cf8" />
            <input
              type="number"
              value={customIncomeOverride}
              onChange={(e) => setCustomIncomeOverride(e.target.value)}
              placeholder={`Simulate income (${getCurrencyLabel()})`}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-primary)',
                fontSize: '0.8rem',
                width: 170,
                outline: 'none'
              }}
            />
            {customIncomeOverride && (
              <button
                type="button"
                onClick={() => setCustomIncomeOverride('')}
                style={{ background: 'transparent', border: 'none', color: 'var(--mm-danger)', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700 }}
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </motion.div>

      {/* Main Grid: 3 Pillars + Donut Visual */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.25rem' }}>
        {Object.entries(PILLAR_CONFIG).map(([key, config]) => {
          const stats = pillarStats[key];
          const targetAmount = (activeIncome * config.targetPct) / 100;
          const spent = stats.spent;
          const currentPct = Math.round((spent / baseForPercentages) * 100);
          const isOverTarget = key === 'savings' ? currentPct < config.targetPct : currentPct > config.targetPct;
          const statusColor = isOverTarget
            ? (key === 'savings' ? '#fbbf24' : '#f87171')
            : '#4ade80';

          const isExpanded = expandedPillar === key;

          return (
            <motion.div
              key={key}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                background: 'rgba(26, 26, 46, 0.75)',
                border: `1px solid ${config.color}33`,
                borderRadius: 16,
                padding: '1.35rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                position: 'relative',
                backdropFilter: 'blur(16px)',
                boxShadow: `0 8px 32px rgba(0,0,0,0.3)`
              }}
            >
              {/* Pillar Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: config.glow,
                      border: `1px solid ${config.color}50`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.15rem'
                    }}
                  >
                    {config.icon}
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                      {config.title}
                      <span style={{ fontSize: '0.75rem', color: config.color, fontWeight: 600 }}>
                        {config.targetPct}% Target
                      </span>
                    </h3>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      {config.badge}
                    </div>
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.15rem', fontWeight: 700, color: config.color }}>
                    {formatCurrency(spent)}
                  </div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                    Target: {formatCurrency(targetAmount)}
                  </div>
                </div>
              </div>

              {/* Progress & Bar */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, fontSize: '0.72rem' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>
                    Actual: <strong style={{ color: statusColor }}>{currentPct}%</strong> of Income
                  </span>
                  <span style={{ color: statusColor }}>
                    {key === 'savings'
                      ? (currentPct >= config.targetPct ? `✓ Target Reached` : `${config.targetPct - currentPct}% to target`)
                      : (currentPct > config.targetPct ? `⚠️ +${currentPct - config.targetPct}% over target` : `✓ Under target ceiling`)}
                  </span>
                </div>

                <div style={{ height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4, position: 'relative', overflow: 'hidden' }}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, (spent / (targetAmount || 1)) * 100)}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                    style={{
                      height: '100%',
                      background: `linear-gradient(90deg, ${config.color}, ${statusColor})`,
                      borderRadius: 4
                    }}
                  />
                  {/* 100% Target Reference Pin */}
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      bottom: 0,
                      left: '100%',
                      width: 2,
                      background: '#fff',
                      opacity: 0.4
                    }}
                  />
                </div>
              </div>

              {/* Description */}
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: '1.3' }}>
                {config.desc}
              </div>

              {/* Collapsible Category Breakdown */}
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '0.75rem', marginTop: 'auto' }}>
                <button
                  type="button"
                  onClick={() => setExpandedPillar(isExpanded ? null : key)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    fontSize: '0.72rem',
                    padding: 0
                  }}
                >
                  <span>{stats.items.length} Categorized Items</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </span>
                </button>

                {isExpanded && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: 200, overflowY: 'auto', paddingRight: 4 }}
                  >
                    {stats.items.length === 0 ? (
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'center', padding: '0.5rem 0' }}>
                        No transactions detected in this pillar yet.
                      </div>
                    ) : (
                      stats.items.map((item, idx) => (
                        <div
                          key={idx}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '0.35rem 0.5rem',
                            background: 'rgba(255,255,255,0.02)',
                            borderRadius: 6,
                            fontSize: '0.72rem'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-primary)' }}>
                            <span>{getCategoryEmoji(item.name)}</span>
                            <span>{item.name}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ fontWeight: 600, color: config.color }}>
                              {formatCurrency(item.amount)}
                            </span>
                            {!item.isCalculated && (
                              <select
                                value={key}
                                onChange={(e) => handleAssignCategory(item.name, e.target.value)}
                                style={{
                                  background: 'rgba(0,0,0,0.5)',
                                  border: '1px solid rgba(255,255,255,0.1)',
                                  color: 'var(--text-muted)',
                                  fontSize: '0.65rem',
                                  borderRadius: 4,
                                  padding: '1px 4px',
                                  cursor: 'pointer'
                                }}
                              >
                                <option value="needs">Needs</option>
                                <option value="wants">Wants</option>
                                <option value="savings">Savings</option>
                              </select>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </motion.div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Bottom Row: Financial Verdict Banner & Donut Chart */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
        {/* Verdict Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            background: 'rgba(26, 26, 46, 0.75)',
            border: `1px solid ${verdict.color}40`,
            borderRadius: 16,
            padding: '1.35rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '1rem'
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <Sparkles size={18} color={verdict.color} />
              <h4 style={{ margin: 0, fontSize: '0.95rem', color: verdict.color }}>
                {verdict.title}
              </h4>
            </div>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {verdict.desc}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 90, padding: '0.6rem', background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>NEEDS ALLOCATION</div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: PILLAR_CONFIG.needs.color }}>{needsPct}% / 50%</div>
            </div>
            <div style={{ flex: 1, minWidth: 90, padding: '0.6rem', background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>WANTS ALLOCATION</div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: PILLAR_CONFIG.wants.color }}>{wantsPct}% / 30%</div>
            </div>
            <div style={{ flex: 1, minWidth: 90, padding: '0.6rem', background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>SAVINGS ALLOCATION</div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: PILLAR_CONFIG.savings.color }}>{savingsPct}% / 20%</div>
            </div>
          </div>
        </motion.div>

        {/* Donut Chart Visual */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            background: 'rgba(26, 26, 46, 0.75)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 16,
            padding: '1.25rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem'
          }}
        >
          <div style={{ width: 140, height: 140, position: 'relative' }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={42}
                  outerRadius={65}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(val) => formatCurrency(val)}
                  contentStyle={{
                    background: 'var(--bg-void)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 8,
                    fontSize: '0.75rem'
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none'
              }}
            >
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>TOTAL</span>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {Math.round(totalSpentAcrossAll > 0 ? (totalSpentAcrossAll / baseForPercentages) * 100 : 0)}%
              </span>
            </div>
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
              Cash Flow Allocation
            </div>
            {Object.entries(PILLAR_CONFIG).map(([key, config]) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.72rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: config.color }} />
                  <span style={{ color: 'var(--text-secondary)' }}>{config.title}</span>
                </div>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  {key === 'needs' ? needsPct : key === 'wants' ? wantsPct : savingsPct}%
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
