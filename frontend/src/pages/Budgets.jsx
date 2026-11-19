import { removeItemWithUndo, itemLabel } from '../components/undoToast';
import { PageHeader, StatCard } from '../components/ui';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { InsightBudgets } from '../components/InsightPanels';
import useLiveData from '../utils/useLiveData';
import { fetchBudgets, createBudget, updateBudget, deleteBudget, fetchAnalytics, getCategorySpendFromMap, getCache } from '../utils/api';
import { todayYMD } from '../utils/dates';
import { Plus, Target, Edit2, Trash2, AlertTriangle, ShieldCheck, Activity, RefreshCw } from 'lucide-react';
import getCategoryEmoji from '../utils/categoryEmoji';
import PageWrapper from '../components/PageWrapper';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import SkeletonLoader from '../components/SkeletonLoader';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import CurrencyInput from '../components/CurrencyInput';
import { formatCurrency, getCurrencyLabel, haptic } from '../utils/format';
import Budget503020View from '../components/Budget503020View';

/** SVG circular progress ring */
const ProgressRing = ({ progress, color, size = 90 }) => {
  const r = (size - 12) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (Math.min(progress, 100) / 100) * circ;

  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }}>
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={8}
      />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke={color} strokeWidth={8}
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        style={{ transform: 'rotate(-90deg)', transformOrigin: 'center', transition: 'stroke-dashoffset 0.25s ease' }}
      />
      <text
        x={size / 2} y={size / 2 + 5}
        textAnchor="middle"
        fill={color}
        fontSize={14}
        fontFamily="Inter, sans-serif"
        fontWeight="700"
      >
        {Math.round(progress)}%
      </text>
    </svg>
  );
};


const Budgets = () => {
  const navigate = useNavigate();
  const currentMonthKey = todayYMD().slice(0, 7);
  const [budgets, setBudgets] = useState(() => getCache('budgets') || []);
  const [selectedMonth, setSelectedMonth] = useState('all');
  const [expenses, setExpenses] = useState(() => {
    const aData = getCache('analytics');
    const expMap = {};
    if (aData?.categoryData) aData.categoryData.forEach(e => { expMap[e.category] = e.total; });
    return expMap;
  });
  const [monthlyExpenses, setMonthlyExpenses] = useState(() => getCache('analytics')?.monthlyExpensesByCategory || {});
  const [loading, setLoading] = useState(() => !getCache('budgets'));
  const [copyingBudgets, setCopyingBudgets] = useState(false);
  const [rolloverSurplus, setRolloverSurplus] = useState(true);
  const [activeView, setActiveView] = useState('categories'); // 'categories' | 'rule503020'
  const [analyticsData, setAnalyticsData] = useState(() => getCache('analytics') || null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [currentId, setCurrentId] = useState(null);
  const [formData, setFormData] = useState({ category: '', amount: 0, month: currentMonthKey, rollover: false });
  const [confirm, setConfirm] = useState({ open: false, id: null });

  useEffect(() => { loadData(!!getCache('budgets')); }, []);
  useLiveData(() => loadData(true));

  const loadData = async (silent) => {
    try {
      if (silent !== true) setLoading(true);
      const [bData, aData] = await Promise.all([fetchBudgets(), fetchAnalytics()]);
      setBudgets(bData);
      setAnalyticsData(aData);
      const expMap = {};
      if (aData.categoryData) {
        aData.categoryData.forEach((e) => { expMap[e.category] = e.total; });
      }
      setExpenses(expMap);
      setMonthlyExpenses(aData.monthlyExpensesByCategory || {});
    } catch {
      toast.error('Failed to load budgets');
    } finally {
      setLoading(false);
    }
  };

  // Returns spend for a specific budget in its target month (with emoji/case-insensitive category matching)
  const getBudgetSpent = (budget) => {
    if (!budget?.category) return 0;
    const targetMonth = budget.month || currentMonthKey;
    if (monthlyExpenses && Object.keys(monthlyExpenses).length > 0) {
      const monthMap = monthlyExpenses[targetMonth] || {};
      return getCategorySpendFromMap(monthMap, budget.category);
    }
    return getCategorySpendFromMap(expenses, budget.category);
  };

  // Returns 3-month rolling average spend for a category across the most recent active months
  const getThreeMonthAvg = (category) => {
    if (!category || !monthlyExpenses) return 0;
    const recentMonths = Object.keys(monthlyExpenses).sort().reverse().slice(0, 3);
    if (recentMonths.length === 0) return 0;
    const values = recentMonths
      .map(m => getCategorySpendFromMap(monthlyExpenses[m] || {}, category))
      .filter(v => v > 0);
    if (values.length === 0) return 0;
    return Math.round(values.reduce((s, v) => s + v, 0) / values.length);
  };

  const targetRolloverMonth = selectedMonth === 'all' ? currentMonthKey : selectedMonth;
  const carryOverCandidates = (() => {
    const currentCats = new Set(
      budgets.filter(b => (b.month || currentMonthKey) === targetRolloverMonth).map(b => (b.category || '').toLowerCase())
    );
    const byCat = new Map();
    budgets
      .filter(b => (b.month || currentMonthKey) !== targetRolloverMonth && b.category && !currentCats.has(b.category.toLowerCase()))
      .forEach(b => {
        const k = b.category.toLowerCase();
        const prev = byCat.get(k);
        if (!prev || (b.month || '') > (prev.month || '')) byCat.set(k, b);
      });
    return Array.from(byCat.values());
  })();

  const handleCopyPreviousMonth = async () => {
    setCopyingBudgets(true);
    try {
      haptic(15);
      const destMonth = targetRolloverMonth;
      const currentCats = new Set(
        budgets.filter(b => b.month === destMonth).map(b => (b.category || '').toLowerCase())
      );
      const olderBudgets = budgets.filter(
        b => b.month !== destMonth && b.category && !currentCats.has(b.category.toLowerCase())
      );

      if (olderBudgets.length > 0) {
        // Deduplicate by category (pick latest month)
        const byCat = new Map();
        olderBudgets.forEach(b => {
          const k = b.category.toLowerCase();
          const prev = byCat.get(k);
          if (!prev || (b.month || '') > (prev.month || '')) {
            byCat.set(k, b);
          }
        });

        let copied = 0;
        for (const b of byCat.values()) {
          const spentInCat = getBudgetSpent(b);
          const includeSurplus = rolloverSurplus || !!b.rollover;
          const leftover = includeSurplus ? Math.max(0, (b.amount || 0) - spentInCat) : 0;
          await createBudget({
            category: b.category,
            amount: Math.round((b.amount || 0) + leftover),
            month: destMonth,
            rollover: includeSurplus,
          });
          copied++;
        }
        toast.success(`🔄 Carried over ${copied} budget${copied > 1 ? 's' : ''} to ${destMonth}!`);
        loadData();
        return;
      }

      // If all existing budgets are from an older month, update their month stamp to destMonth
      const outdated = budgets.filter(b => b.month && b.month !== destMonth);
      if (outdated.length > 0) {
        for (const b of outdated) {
          const spentInCat = getBudgetSpent(b);
          const includeSurplus = rolloverSurplus || !!b.rollover;
          const leftover = includeSurplus ? Math.max(0, (b.amount || 0) - spentInCat) : 0;
          await updateBudget(b.id, {
            ...b,
            amount: Math.round((b.amount || 0) + leftover),
            month: destMonth,
          });
        }
        toast.success(`🔄 Rolled ${outdated.length} budget${outdated.length > 1 ? 's' : ''} forward to ${destMonth}!`);
        loadData();
        return;
      }

      // Fallback: if user has spending categories not yet budgeted, auto-create smart budgets from past spend
      const existingAllCats = new Set(budgets.map(b => (b.category || '').toLowerCase()));
      const currentMonthSpendMap = monthlyExpenses[currentMonthKey] || expenses;
      const unbudgetedSpend = Object.entries(currentMonthSpendMap)
        .filter(([cat, total]) => cat && total > 0 && !existingAllCats.has(cat.toLowerCase()))
        .slice(0, 5);

      if (unbudgetedSpend.length > 0) {
        for (const [cat, total] of unbudgetedSpend) {
          const smartLimit = Math.ceil((total * 1.15) / 500) * 500 || 5000;
          await createBudget({
            category: cat,
            amount: smartLimit,
            month: currentMonthKey,
            rollover: true,
          });
        }
        toast.success(`✨ Created ${unbudgetedSpend.length} smart budgets from your recent spending!`);
        loadData();
      } else {
        toast('All budgets are already up to date for ' + currentMonthKey + ' ✓', { icon: '✅' });
      }
    } catch {
      toast.error('Failed to copy budgets');
    } finally {
      setCopyingBudgets(false);
    }
  };

  const openAddModal = () => {
    setEditMode(false);
    setFormData({ category: '', amount: 0, month: currentMonthKey, rollover: false });
    setIsModalOpen(true);
  };

  const openEditModal = (budget) => {
    setEditMode(true);
    setCurrentId(budget.id);
    setFormData({ category: budget.category, amount: budget.amount, month: budget.month, rollover: !!budget.rollover });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editMode) {
        await updateBudget(currentId, formData);
        toast.success('Budget updated');
      } else {
        await createBudget(formData);
        toast.success('Budget created');
      }
      setIsModalOpen(false);
      loadData();
    } catch {
      toast.error(editMode ? 'Failed to update budget' : 'Failed to create budget');
    }
  };

  const doDelete = () => {
    const id = confirm.id;
    const item = budgets.find(x => String(x.id) === String(id));
    setConfirm({ open: false, id: null });
    removeItemWithUndo({
      key: `budget:${id}`,
      label: itemLabel(item, 'Budget deleted'),
      setItems: setBudgets,
      id,
      commit: () => deleteBudget(id),
      onCommitted: () => loadData(),
    });
  };

  // Filter budgets by selectedMonth ('all' or 'YYYY-MM')
  const availableMonths = Array.from(new Set([currentMonthKey, ...budgets.map(b => b.month).filter(Boolean)])).sort().reverse();
  const visibleBudgets = selectedMonth === 'all' ? budgets : budgets.filter(b => (b.month || currentMonthKey) === selectedMonth);

  // Derive totals using monthly spend per visible budget
  const totalBudgeted = visibleBudgets.reduce((s, b) => s + b.amount, 0);
  const totalSpent = visibleBudgets.reduce((s, b) => s + getBudgetSpent(b), 0);
  const overBudgetCount = visibleBudgets.filter((b) => getBudgetSpent(b) > b.amount).length;

  return (
    <PageWrapper>
      <div>
        <PageHeader title="Budgets" subtitle="Monthly category limits, pacing, and 50/30/20 allocation">
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: '0.25rem', background: 'rgba(255,255,255,0.04)', padding: '0.25rem', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)' }}>
              <button
                type="button"
                onClick={() => setActiveView('categories')}
                style={{
                  padding: '0.45rem 0.9rem',
                  borderRadius: 8,
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'Inter, sans-serif',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  background: activeView === 'categories' ? 'rgba(74,222,128,0.2)' : 'transparent',
                  color: activeView === 'categories' ? '#4ade80' : 'var(--text-muted)'
                }}
              >
                📁 Categories ({budgets.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveView('rule503020')}
                style={{
                  padding: '0.45rem 0.9rem',
                  borderRadius: 8,
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'Inter, sans-serif',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  background: activeView === 'rule503020' ? 'linear-gradient(135deg, rgba(56,189,248,0.25), rgba(129,140,248,0.25))' : 'transparent',
                  color: activeView === 'rule503020' ? '#38bdf8' : 'var(--text-muted)'
                }}
              >
                🎯 50/30/20 Rule
              </button>
            </div>
            {activeView === 'categories' && (
              <>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={copyingBudgets}
                  onClick={handleCopyPreviousMonth}
                  title="Carry over last month's budgets (or auto-create from spending)"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  <RefreshCw size={14} style={{ color: '#818cf8' }} />
                  <span>{copyingBudgets ? 'Copying…' : 'Carry Over Last Month'}</span>
                </button>
                {visibleBudgets.some(b => {
                  const avg = getThreeMonthAvg(b.category);
                  return avg > 0 && b.amount > 0 && Math.abs(b.amount - avg) / b.amount >= 0.15;
                }) && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={async () => {
                      const targets = visibleBudgets.filter(b => {
                        const avg = getThreeMonthAvg(b.category);
                        return avg > 0 && b.amount > 0 && Math.abs(b.amount - avg) / b.amount >= 0.15;
                      });
                      try {
                        await Promise.all(targets.map(b => updateBudget(b.id, { ...b, amount: getThreeMonthAvg(b.category) })));
                        toast.success(`Tuned ${targets.length} budget${targets.length === 1 ? '' : 's'} to 3-month average`);
                        loadData(true);
                      } catch {
                        toast.error('Failed to tune budgets');
                      }
                    }}
                    style={{ fontSize: '0.75rem', color: '#38bdf8', borderColor: 'rgba(56,189,248,0.35)' }}
                  >
                    ✨ Tune All to 3-Mo Avg
                  </button>
                )}
                <button className="btn btn-primary" onClick={openAddModal}><Plus size={16} /> New Budget</button>
              </>
            )}
          </div>
        </PageHeader>

        {/* View switching: 50/30/20 Rule Engine vs Category Cards */}
        {activeView === 'rule503020' ? (
          <Budget503020View analyticsData={analyticsData} />
        ) : (
          <>
            <InsightBudgets budgets={visibleBudgets} getSpent={getBudgetSpent} />

            {/* 1-Click Monthly Budget Rollover Banner */}
            {!loading && carryOverCandidates.length > 0 && (
              <div
                className="bento-card"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '0.85rem',
                  padding: '0.9rem 1.2rem',
                  marginBottom: '1rem',
                  border: '1px solid rgba(129,140,248,0.35)',
                  background: 'rgba(129,140,248,0.06)',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                  <div style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: '0.86rem', color: 'var(--text-primary)' }}>
                    🔄 {carryOverCandidates.length} budget categor{carryOverCandidates.length > 1 ? 'ies' : 'y'} ready to carry over into {targetRolloverMonth}
                  </div>
                  <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                    Copy previous limits in one click — optionally roll forward unspent surplus.
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.76rem', color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
                    <input
                      type="checkbox"
                      checked={rolloverSurplus}
                      onChange={e => setRolloverSurplus(e.target.checked)}
                      style={{ accentColor: '#818cf8', cursor: 'pointer' }}
                    />
                    <span>Roll over unspent surplus</span>
                  </label>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={copyingBudgets}
                    onClick={handleCopyPreviousMonth}
                    style={{ padding: '0.45rem 0.95rem', fontSize: '0.78rem' }}
                  >
                    <RefreshCw size={13} />
                    <span>{copyingBudgets ? 'Rolling over…' : `Carry Over (${carryOverCandidates.length})`}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Month Filter Bar */}
            {budgets.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif', fontWeight: 600, marginRight: '0.25rem' }}>
                  Month:
                </span>
                {[
                  { id: 'all', label: `All Months (${budgets.length})` },
                  ...availableMonths.map(m => ({
                    id: m,
                    label: `${m === currentMonthKey ? `This Month (${m})` : m} (${budgets.filter(b => (b.month || currentMonthKey) === m).length})`
                  }))
                ].map(opt => {
                  const active = selectedMonth === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setSelectedMonth(opt.id)}
                      style={{
                        padding: '0.35rem 0.75rem',
                        borderRadius: 999,
                        border: active ? '1px solid rgba(59,130,246,0.45)' : '1px solid rgba(255,255,255,0.08)',
                        background: active ? 'rgba(59,130,246,0.14)' : 'rgba(255,255,255,0.03)',
                        color: active ? '#60a5fa' : 'var(--text-secondary)',
                        fontSize: '0.74rem',
                        fontWeight: active ? 600 : 500,
                        fontFamily: 'Inter, sans-serif',
                        cursor: 'pointer'
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Summary strip */}
            {!loading && visibleBudgets.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
            className="monthly-strip stat-grid" style={{ marginBottom: '1.75rem' }}
          >
            <StatCard label="Total budgeted" value={formatCurrency(totalBudgeted)} tone="accent" />
            <StatCard label="Total spent" value={formatCurrency(totalSpent)} tone={totalSpent > totalBudgeted ? 'neg' : 'warn'} />
            <StatCard label="Remaining" value={`${totalBudgeted - totalSpent >= 0 ? '' : '-'}${formatCurrency(Math.abs(totalBudgeted - totalSpent))}`} tone={totalBudgeted - totalSpent >= 0 ? 'pos' : 'neg'} />
            <StatCard label="Over budget" value={overBudgetCount > 0 ? `${overBudgetCount} categor${overBudgetCount > 1 ? 'ies' : 'y'}` : 'None'} tone={overBudgetCount > 0 ? 'neg' : 'pos'} />
            <StatCard label="Days left" value={`${new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate() - new Date().getDate()} days`} />
          </motion.div>
        )}

        {/* Budget Health Score */}
        {!loading && visibleBudgets.length > 0 && (() => {
          const scores = visibleBudgets.map(b => {
            const spent = getBudgetSpent(b);
            const pct = b.amount > 0 ? spent / b.amount : 0;
            if (pct <= 0.5) return 100;
            if (pct <= 0.8) return 80;
            if (pct <= 1.0) return 50;
            return 0;
          });
          const health = Math.round(scores.reduce((s, x) => s + x, 0) / scores.length);
          const color = health >= 80 ? '#4ade80' : health >= 60 ? '#fbbf24' : '#f87171';
          const label = health >= 80 ? 'HEALTHY' : health >= 60 ? 'MODERATE' : 'AT RISK';
          return (
            <div
              style={{ display:'flex', alignItems:'center', gap:'1.25rem', padding:'0.875rem 1.25rem', background:'rgba(255,255,255,0.02)', border:`1px solid ${color}22`, borderRadius:12, marginBottom:'1.5rem' }}>
              <div style={{ position:'relative', width:52, height:52, flexShrink:0 }}>
                <svg width="52" height="52" viewBox="0 0 52 52">
                  <circle cx="26" cy="26" r="20" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6"/>
                  <circle cx="26" cy="26" r="20" fill="none" stroke={color} strokeWidth="6"
                    strokeLinecap="round" strokeDasharray={`${2*Math.PI*20}`}
                    strokeDashoffset={2*Math.PI*20 * (1 - health/100)}
                    style={{ transform:'rotate(-90deg)', transformOrigin:'center', transition:'stroke-dashoffset 0.25s ease' }}/>
                </svg>
                <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Inter, sans-serif', fontWeight:700, fontSize:'0.75rem', color }}>
                  {health}
                </div>
              </div>
              <div>
                <div style={{ fontFamily:'Inter, sans-serif', fontWeight:700, fontSize:'1rem', color }}>{label}</div>
                <div style={{ fontFamily:'Inter, sans-serif', fontSize:'0.7rem', color:'var(--text-muted)', marginTop:'0.2rem' }}>
                  BUDGET HEALTH SCORE · {visibleBudgets.length - overBudgetCount}/{visibleBudgets.length} categories within limit
                </div>
              </div>
            </div>
          );
        })()}

        {loading ? (
          <SkeletonLoader rows={4} height={130} />
        ) : (
          <div className="bento-grid">
            {visibleBudgets.map((budget) => {
              const spent = getBudgetSpent(budget);
              const budgetLimit = Number(budget.amount) || 0;
              const progress = budgetLimit > 0 ? Math.min((spent / budgetLimit) * 100, 100) : (spent > 0 ? 100 : 0);
              const isOver = budgetLimit > 0 ? spent > budgetLimit : spent > 0;
              const isWarning = progress >= 80 && !isOver;
              const statusColor = isOver ? 'var(--danger)' : isWarning ? 'var(--warning)' : 'var(--success)';

              return (
                <div
                  key={budget.id}
                  className="bento-item col-span-4"
                  style={{
                    border: '1px solid var(--mm-border-subtle, rgba(255,255,255,0.08))',
                    background: 'var(--bg-surface)',
                  }}
                >
                  {/* Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                      <div style={{ width: 34, height: 34, borderRadius: 9, background: `${statusColor}18`, border: `1px solid ${statusColor}35`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Target size={16} color={statusColor} />
                      </div>
                      <div>
                        <h3 style={{ margin: 0, fontSize: '0.95rem', fontFamily: 'Inter, sans-serif' }}>{getCategoryEmoji(budget.category)} {budget.category}</h3>
                        <div style={{ fontSize: '0.65rem', fontFamily: 'Inter, sans-serif', color: 'var(--text-muted)' }}>{budget.month}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                      <button
                        type="button"
                        onClick={() => navigate(`/transactions?q=${encodeURIComponent(budget.category || '')}`)}
                        title={`View ${budget.category} transactions`}
                        style={{
                          background: 'transparent',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: 6,
                          padding: '0.18rem 0.45rem',
                          fontSize: '0.64rem',
                          color: 'var(--text-secondary)',
                          cursor: 'pointer',
                        }}
                      >
                        Txns →
                      </button>
                      <button type="button" className="icon-btn" aria-label={`Edit budget ${budget.category}`} onClick={() => openEditModal(budget)}>
                        <Edit2 size={14} />
                      </button>
                      <button type="button" className="icon-btn" aria-label={`Delete budget ${budget.category}`} style={{ color: 'var(--danger)' }} onClick={() => setConfirm({ open: true, id: budget.id })}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Ring + amounts */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flex: 1 }}>
                    <ProgressRing progress={progress} color={statusColor} size={88} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ marginBottom: '0.5rem' }}>
                        <div style={{ fontSize: '0.65rem', fontFamily: 'Inter, sans-serif', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Spent</div>
                        <div style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: '1rem', color: statusColor }}>{formatCurrency(spent)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.65rem', fontFamily: 'Inter, sans-serif', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Budget</div>
                        <div style={{ fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{formatCurrency(budget.amount)}</div>
                      </div>
                      {(() => {
                        const avg3Mo = getThreeMonthAvg(budget.category);
                        if (avg3Mo <= 0) return null;
                        const driftPct = budget.amount > 0 ? Math.abs(budget.amount - avg3Mo) / budget.amount : 0;
                        return (
                          <div style={{ marginTop: '0.45rem', display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif' }}>
                              3-mo avg: <strong style={{ color: 'var(--text-secondary)' }}>{formatCurrency(avg3Mo)}</strong>
                            </span>
                            {driftPct >= 0.15 && (
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    await updateBudget(budget.id, { ...budget, amount: avg3Mo });
                                    toast.success(`Tuned ${budget.category} budget to ${formatCurrency(avg3Mo)}`);
                                    loadData(true);
                                  } catch {
                                    toast.error('Failed to tune budget');
                                  }
                                }}
                                style={{
                                  fontSize: '0.64rem',
                                  fontFamily: 'Inter, sans-serif',
                                  fontWeight: 600,
                                  padding: '0.12rem 0.45rem',
                                  borderRadius: 6,
                                  background: 'rgba(56,189,248,0.12)',
                                  border: '1px solid rgba(56,189,248,0.3)',
                                  color: '#38bdf8',
                                  cursor: 'pointer',
                                }}
                              >
                                Tune to Avg
                              </button>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Status badge */}
                  <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.72rem', fontFamily: 'Inter, sans-serif', color: statusColor }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                      {isOver ? <><AlertTriangle size={13} /> BUDGET BREACHED — {formatCurrency(spent - budget.amount)} OVER</> :
                       isWarning ? <><Activity size={13} /> WARNING ZONE</> :
                       <><ShieldCheck size={13} /> WITHIN BUDGET</>}
                    </div>
                    {budget.rollover && (
                      <span style={{ fontSize: '0.65rem', padding: '0.15rem 0.45rem', borderRadius: 6, background: 'rgba(129,140,248,0.12)', border: '1px solid rgba(129,140,248,0.25)', color: '#818cf8' }}>
                        🔄 Rollover
                      </span>
                    )}
                  </div>

                  {/* Visual Pacing Indicator */}
                  {(() => {
                    const today = new Date();
                    const bMonth = budget.month || currentMonthKey;
                    const [by, bm] = bMonth.split('-').map(Number);
                    const daysInMonth = (by && bm) ? new Date(by, bm, 0).getDate() : new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
                    const isCurrentMo = bMonth === currentMonthKey;
                    const isPastMo = bMonth < currentMonthKey;
                    const dayOfMonth = isCurrentMo ? today.getDate() : (isPastMo ? daysInMonth : 0);
                    const timeElapsedPct = isCurrentMo ? Math.round((dayOfMonth / daysInMonth) * 100) : (isPastMo ? 100 : 0);
                    const spentPct = budgetLimit > 0 ? Math.round((spent / budgetLimit) * 100) : 0;
                    const paceDiff = spentPct - timeElapsedPct;
                    const paceLabel = isOver ? 'Breached' : !isCurrentMo ? (isPastMo ? 'Completed' : 'Upcoming') : paceDiff > 10 ? `+${paceDiff}% ahead of pace` : paceDiff < -10 ? `${Math.abs(paceDiff)}% under pace` : 'On track';
                    const paceColor = isOver ? '#f87171' : (isCurrentMo && paceDiff > 10) ? '#fbbf24' : '#4ade80';

                    return (
                      <div style={{ marginTop: '0.65rem', paddingTop: '0.55rem', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5, fontSize: '0.68rem', fontFamily: 'Inter, sans-serif' }}>
                          <span style={{ color: 'var(--text-muted)' }}>Pacing: <strong style={{ color: paceColor }}>{paceLabel}</strong></span>
                          <span style={{ color: 'var(--text-muted)' }}>Day {dayOfMonth}/{daysInMonth} ({timeElapsedPct}%)</span>
                        </div>
                        {/* Dual Bar: Spend fill with Day marker */}
                        <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, position: 'relative', overflow: 'hidden' }}>
                          <div
                            style={{
                              height: '100%',
                              width: `${Math.min(100, spentPct)}%`,
                              background: statusColor,
                              borderRadius: 3,
                              transition: 'width 0.4s ease',
                            }}
                          />
                          <div
                            style={{
                              position: 'absolute',
                              top: 0,
                              bottom: 0,
                              left: `${timeElapsedPct}%`,
                              width: 2,
                              background: '#fff',
                              opacity: 0.7,
                            }}
                            title={`Elapsed: ${timeElapsedPct}% of month`}
                          />
                        </div>
                      </div>
                    );
                  })()}

                  {/* Projected month-end run-rate & daily safe allowance */}
                  {!isOver && (budget.month || currentMonthKey) === currentMonthKey && (() => {
                    const today = new Date();
                    const dayOfMonth = today.getDate();
                    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
                    const daysLeft = Math.max(1, daysInMonth - dayOfMonth);
                    const dailyRate = dayOfMonth > 1 ? spent / dayOfMonth : spent;
                    const projected = parseFloat((dailyRate * daysInMonth).toFixed(2));
                    const willOver = projected > budgetLimit;
                    const remaining = Math.max(0, budgetLimit - spent);
                    const safeDaily = Math.floor(remaining / daysLeft);
                    const daysUntilBreach = dailyRate > 0 ? Math.ceil(remaining / dailyRate) : 999;
                    const breachDay = dayOfMonth + daysUntilBreach;

                    return (
                      <div style={{ marginTop: '0.75rem', paddingTop: '0.6rem', borderTop: '1px solid rgba(255,255,255,0.04)', display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.72rem', fontFamily: 'Inter, sans-serif' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: willOver ? '#fbbf24' : '#4ade80' }}>
                          <span>{willOver ? '🔥 Overspending Pace' : '✅ Controlled Pace'}</span>
                          <strong>{willOver ? `+${formatCurrency(projected - budgetLimit)}` : `-${formatCurrency(budgetLimit - projected)}`}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)', fontSize: '0.68rem' }}>
                          <span>Projected Month-End:</span>
                          <strong style={{ color: willOver ? '#fbbf24' : '#f0f0f5' }}>~{formatCurrency(projected)}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '0.68rem' }}>
                          <span>Safe daily limit:</span>
                          <strong style={{ color: safeDaily > 0 ? '#4ade80' : '#f87171' }}>{formatCurrency(safeDaily)}/day</strong>
                        </div>
                        {willOver && daysUntilBreach <= daysLeft && (
                          <div style={{ color: '#f87171', fontSize: '0.66rem', background: 'rgba(248,113,113,0.08)', padding: '2px 6px', borderRadius: 4, display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span>⚠</span> On track to breach around Day {Math.min(daysInMonth, breachDay)} ({daysUntilBreach}d left)
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              );
            })}

            {budgets.length === 0 && (
              <div className="bento-item col-span-12" style={{ alignItems: 'center', justifyContent: 'center', padding: '3.5rem', textAlign: 'center', gap: '0.75rem' }}>
                <Target size={48} style={{ opacity: 0.2, marginBottom: '0.5rem' }} />
                <p style={{ fontFamily: 'Inter, sans-serif', color: 'var(--text-muted)', margin: 0 }}>NO BUDGET ALLOCATIONS DEFINED</p>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleCopyPreviousMonth}
                  disabled={copyingBudgets}
                  style={{ marginTop: '0.5rem', display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}
                >
                  <RefreshCw size={14} color="#4ade80" />
                  <span>{copyingBudgets ? 'Creating…' : '✨ 1-Tap Auto-Create Budgets from Spending'}</span>
                </button>
              </div>
            )}
          </div>
        )}
          </>
        )}
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editMode ? 'Edit Budget' : 'New Budget'}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Category</label>
            <input required value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} placeholder="e.g. Groceries" />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>{`Monthly Limit (${getCurrencyLabel()})`}</label>
            <CurrencyInput required value={formData.amount} onChange={(val) => setFormData({ ...formData, amount: val })} />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Month</label>
            <input type="month" required value={formData.month} onChange={(e) => setFormData({ ...formData, month: e.target.value })} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', background: 'rgba(255,255,255,0.03)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)' }}>
            <div>
              <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>🔄 Rollover Unspent Budget</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Roll leftover balance into next month's pool</div>
            </div>
            <input
              type="checkbox"
              checked={!!formData.rollover}
              onChange={e => setFormData({ ...formData, rollover: e.target.checked })}
              style={{ width: 18, height: 18, accentColor: '#4ade80', cursor: 'pointer' }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary">{editMode ? 'Update' : 'Save Budget'}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={confirm.open}
        title="Delete Budget"
        message="Are you sure you want to delete this budget allocation?"
        confirmLabel="Delete"
        danger
        onConfirm={doDelete}
        onCancel={() => setConfirm({ open: false, id: null })}
      />
    </PageWrapper>
  );
};

export default Budgets;
