import { useT } from '../i18n';
import { Button, EmptyState, PageHeader } from '../components/ui';
import { removeItemWithUndo, itemLabel } from '../components/undoToast';
import MoreSection from '../components/MoreSection';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { InsightGoals } from '../components/InsightPanels';
import useLiveData from '../utils/useLiveData';
import {
  fetchGoals,
  createGoal,
  updateGoal,
  deleteGoal,
  contributeGoal,
  deductGoal,
  fetchAccounts,
  fetchTransactions,
  getCache
} from '../utils/api';
import { Plus, Sparkles, Search, Wallet } from 'lucide-react';
import PageWrapper from '../components/PageWrapper';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import SkeletonLoader from '../components/SkeletonLoader';
import GoalHistoryModal from '../components/GoalHistoryModal';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import CurrencyInput from '../components/CurrencyInput';
import { formatCurrency, getCurrencyLabel, haptic } from '../utils/format';
import { toYMD } from '../utils/dates';
import RoundUpModal from './goals/RoundUpModal';
import DeductModal from './goals/DeductModal';
import DepositModal from './goals/DepositModal';
import { isInternalMove } from '../utils/ledgerReporting.js';
import GoalCard from './goals/GoalCard';

const parseLocalYMD = (str) => {
  if (!str) return null;
  const parts = String(str).split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
};

const GOAL_CATEGORIES = [
  { name: 'Emergency Fund', icon: '🛡️', color: '#4ade80' },
  { name: 'Travel & Vacation', icon: '✈️', color: '#06b6d4' },
  { name: 'Vehicle / Auto', icon: '🚗', color: '#818cf8' },
  { name: 'Home & Living', icon: '🏠', color: '#a78bfa' },
  { name: 'Tech & Gadgets', icon: '💻', color: '#38bdf8' },
  { name: 'Education & Courses', icon: '🎓', color: '#fbbf24' },
  { name: 'Life Event / Wedding', icon: '💍', color: '#f472b6' },
  { name: 'Investment & Wealth', icon: '📈', color: '#34d399' },
  { name: 'Gifts & Shopping', icon: '🎁', color: '#f87171' },
  { name: 'Savings Buffer', icon: '🐷', color: '#10b981' },
  { name: 'Other Target', icon: '🎯', color: '#94a3b8' },
];

const PRIORITY_CONFIG = {
  high: { label: 'High Priority', badge: 'HIGH', color: '#f87171', bg: 'rgba(248,113,113,0.14)' },
  medium: { label: 'Medium Priority', badge: 'MED', color: '#fbbf24', bg: 'rgba(251,191,36,0.14)' },
  low: { label: 'Low Priority', badge: 'LOW', color: '#818cf8', bg: 'rgba(129,140,248,0.14)' },
};

const SORT_OPTIONS = [
  { value: 'deadline', label: '📅 End Goal Date (Soonest)' },
  { value: 'daily_desc', label: '⚡ Daily Needed (Highest)' },
  { value: 'current_desc', label: '💵 Have Right Now (Highest)' },
  { value: 'progress_desc', label: '📈 Progress (% High to Low)' },
  { value: 'target_desc', label: '💰 Target Amount (Highest)' },
  { value: 'name', label: '🔤 Name (A - Z)' },
];

// Canvas confetti burst
const runConfetti = (canvas) => {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const COLORS = ['#4ade80', '#06b6d4', '#a78bfa', '#fbbf24', '#f472b6', '#38bdf8', '#34d399'];
  const particles = Array.from({ length: 140 }, () => ({
    x: Math.random() * canvas.width,
    y: -20 - Math.random() * 100,
    r: 4 + Math.random() * 5,
    d: 1.5 + Math.random() * 2.5,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    tiltAngle: 0,
    tiltSpeed: 0.05 + Math.random() * 0.05,
    shape: Math.random() > 0.5 ? 'rect' : 'circle',
    rotation: Math.random() * Math.PI * 2,
    rotSpeed: (Math.random() - 0.5) * 0.15,
  }));
  let frame = 0;
  const animate = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
      p.y += p.d;
      p.tiltAngle += p.tiltSpeed;
      const tilt = Math.sin(p.tiltAngle) * 12;
      p.rotation += p.rotSpeed;
      ctx.save();
      ctx.translate(p.x + tilt, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = p.color;
      if (p.shape === 'rect') {
        ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    });
    frame++;
    if (frame < 200) requestAnimationFrame(animate);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
  animate();
};

const calculateGoalStats = (goal) => {
  const current = parseFloat((Number(goal.current_amount) || 0).toFixed(2));
  const target = parseFloat((Number(goal.target_amount) || 0).toFixed(2));
  const remaining = Math.max(0, parseFloat((target - current).toFixed(2)));
  const progressPct = target > 0 ? (current / target) * 100 : 0;
  const isReached = target > 0 && current >= target;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const targetDate = parseLocalYMD(goal.target_date);
  if (targetDate) targetDate.setHours(0, 0, 0, 0);

  const daysLeft = targetDate ? Math.ceil((targetDate - today) / (1000 * 60 * 60 * 24)) : 0;
  const isPast = targetDate ? targetDate < today : false;

  // Exact daily calculation without rounding up
  const dailyNeeded = daysLeft > 0 ? parseFloat((remaining / daysLeft).toFixed(2)) : remaining;
  const monthsLeft = daysLeft > 0 ? daysLeft / 30.4375 : 0;
  const monthlyNeeded = monthsLeft > 0 ? Math.ceil(remaining / monthsLeft) : remaining;
  const plannedMonthly = parseFloat(goal.monthly_contribution) || 0;

  return {
    current,
    target,
    remaining,
    progressPct,
    isReached,
    targetDateStr: goal.target_date || 'No Date Set',
    daysLeft,
    isPast,
    dailyNeeded,
    monthlyNeeded,
    plannedMonthly,
  };
};

const Goals = () => {
  const t = useT();
  const [goals, setGoals] = useState(() => getCache('goals') || []);
  const [accounts, setAccounts] = useState(() => getCache('accounts') || []);
  const [loading, setLoading] = useState(() => !getCache('goals'));

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [currentId, setCurrentId] = useState(null);

  // Deposit Modal State
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [depositTargetGoal, setDepositTargetGoal] = useState(null);
  const [depositData, setDepositData] = useState({ amount: 0, account_id: '', note: '' });

  // Deduct Modal State
  const [isDeductModalOpen, setIsDeductModalOpen] = useState(false);
  const [deductTargetGoal, setDeductTargetGoal] = useState(null);
  const [deductData, setDeductData] = useState({ amount: 0, account_id: '', reason: '' });

  const [confirm, setConfirm] = useState({ open: false, id: null });

  // History Modal State
  const [selectedGoalForHistoryId, setSelectedGoalForHistoryId] = useState(null);
  const activeGoalForHistory = useMemo(
    () => goals.find(g => String(g.id) === String(selectedGoalForHistoryId)) || null,
    [goals, selectedGoalForHistoryId]
  );

  // Virtual Round-Up Simulator & What-If Boost State
  const [isRoundUpModalOpen, setIsRoundUpModalOpen] = useState(false);
  const [roundUpIncrement, setRoundUpIncrement] = useState(100);
  const [roundUpGoalId, setRoundUpGoalId] = useState('');
  const [roundUpAccountId, setRoundUpAccountId] = useState('');
  const [transactionsList, setTransactionsList] = useState(() => getCache('transactions') || []);
  const [boostByGoal, setBoostByGoal] = useState({});
  const [expandedBoostGoalId, setExpandedBoostGoalId] = useState(null);

  // Filter & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'active' | 'completed' | 'high'
  const [sortBy, setSortBy] = useState('deadline');

  const canvasRef = useRef(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    target_amount: 0,
    current_amount: 0,
    monthly_contribution: 0,
    target_date: '',
    category: 'Emergency Fund',
    priority: 'medium',
    icon: '🛡️',
    color: '#4ade80',
    notes: ''
  });


  useLiveData(() => loadData(true));

  const loadData = useCallback(async (silent) => {
    try {
      if (silent !== true) setLoading(true);
      const [gData, aData, tData] = await Promise.all([
        fetchGoals(),
        fetchAccounts(),
        fetchTransactions()
      ]);
      setGoals(gData || []);
      setAccounts(aData || []);
      setTransactionsList(tData || []);
      if (aData && aData.length > 0) {
        setDepositData(prev => ({ ...prev, account_id: prev.account_id || aData[0].id }));
        setDeductData(prev => ({ ...prev, account_id: prev.account_id || aData[0].id }));
      }
      if (gData && gData.length > 0) {
        setRoundUpGoalId(previous => previous || gData[0].id);
      }
    } catch {
      toast.error('Failed to load goals');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { loadData(!!getCache('goals')); }, [loadData]);

  // Expenses already covered by an earlier round-up are skipped, so applying
  // it twice never deposits the same spare change again. Each round-up entry
  // lists the expenses it covered (round_up_ids), which works across devices.
  // Older round-ups (before the list was stored) fall back to their date.
  const { roundedIds, legacyRoundUpDate } = useMemo(() => {
    const ids = new Set();
    let legacy = '';
    for (const t of transactionsList || []) {
      if (!t.goal_id || t.reversed_at || t.reversal_of || !String(t.notes || '').includes('Virtual Round-Up')) continue;
      if (Array.isArray(t.round_up_ids)) t.round_up_ids.forEach(id => ids.add(String(id)));
      else if (t.date && t.date > legacy) legacy = t.date;
    }
    return { roundedIds: ids, legacyRoundUpDate: legacy };
  }, [transactionsList]);

  const recentExpenses = useMemo(() => {
    return (transactionsList || [])
      .filter(t => !isInternalMove(t) && !t.goal_id && !t.reversed_at && !t.reversal_of && t.type === 'Expense' && (parseFloat(t.amount) || 0) > 0)
      .filter(t => !roundedIds.has(String(t.id)) && (!legacyRoundUpDate || (t.date || '') > legacyRoundUpDate))
      .slice(0, 35);
  }, [transactionsList, roundedIds, legacyRoundUpDate]);

  const roundUpAccounts = useMemo(() => accounts.filter(a => !a.archived), [accounts]);

  const simulatedRoundUpTotal = useMemo(() => {
    // In cents, so 0.1-style float remainders can't creep in.
    const step = Math.round(roundUpIncrement * 100);
    const cents = recentExpenses.reduce((sum, tx) => {
      const amt = Math.round((parseFloat(tx.amount) || 0) * 100);
      const rem = step > 0 ? amt % step : 0;
      return sum + (rem > 0 ? step - rem : 0);
    }, 0);
    return cents / 100;
  }, [recentExpenses, roundUpIncrement]);

  const handleApplyRoundUp = async () => {
    const targetGoal = goals.find(g => g.id === roundUpGoalId) || goals[0];
    if (!targetGoal) { toast.error('Please select a goal'); return; }
    if (simulatedRoundUpTotal <= 0) { toast.error('No round-up spare change calculated'); return; }
    const fromAccount = roundUpAccounts.find(a => String(a.id) === String(roundUpAccountId)) || roundUpAccounts[0];
    if (!fromAccount) { toast.error('Add an account to take the spare change from'); return; }

    try {
      await contributeGoal(targetGoal.id, {
        amount: simulatedRoundUpTotal,
        account_id: fromAccount.id,
        round_up_ids: recentExpenses.map(t => t.id),
        note: `⚡ Virtual Round-Up Contribution (${recentExpenses.length} transactions)`
      });
      toast.success(`🎉 +${formatCurrency(simulatedRoundUpTotal)} spare change deposited into "${targetGoal.name}"!`, { duration: 5000 });
      runConfetti(canvasRef.current);
      haptic();
      setIsRoundUpModalOpen(false);
      loadData();
    } catch {
      toast.error('Failed to apply round-up');
    }
  };

  const openAddModal = () => {
    setEditMode(false);
    setCurrentId(null);
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    setFormData({
      name: '',
      target_amount: 0,
      current_amount: 0,
      monthly_contribution: 0,
      target_date: toYMD(d),
      category: 'Emergency Fund',
      priority: 'medium',
      icon: '🛡️',
      color: '#4ade80',
      notes: ''
    });
    setIsModalOpen(true);
  };

  const openEditModal = (goal) => {
    setEditMode(true);
    setCurrentId(goal.id);
    const catObj = GOAL_CATEGORIES.find(c => c.name === goal.category);
    setFormData({
      name: goal.name || '',
      target_amount: goal.target_amount || 0,
      current_amount: goal.current_amount || 0,
      monthly_contribution: goal.monthly_contribution || 0,
      target_date: goal.target_date || '',
      category: goal.category || 'Other Target',
      priority: goal.priority || 'medium',
      icon: goal.icon || (catObj ? catObj.icon : '🎯'),
      color: goal.color || (catObj ? catObj.color : '#4ade80'),
      notes: goal.notes || ''
    });
    setIsModalOpen(true);
  };

  const openDepositModal = (goal, prefillAmount = 0) => {
    setDepositTargetGoal(goal);
    setDepositData({
      amount: prefillAmount,
      account_id: accounts.length > 0 ? accounts[0].id : '',
      note: ''
    });
    setIsDepositModalOpen(true);
  };

  const openDeductModal = (goal, prefillAmount = 0) => {
    setDeductTargetGoal(goal);
    setDeductData({
      amount: prefillAmount,
      account_id: accounts.length > 0 ? accounts[0].id : '',
      reason: ''
    });
    setIsDeductModalOpen(true);
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error('Please enter a goal name');
      return;
    }
    if (formData.target_amount <= 0) {
      toast.error('Target amount must be greater than zero');
      return;
    }

    try {
      if (editMode) {
        await updateGoal(currentId, formData);
        toast.success('Goal updated successfully!');
      } else {
        await createGoal(formData);
        toast.success('Goal created successfully!');
      }
      setIsModalOpen(false);
      haptic();
      loadData();
    } catch (err) {
      toast.error(err?.message || (editMode ? 'Failed to update goal' : 'Failed to create goal'));
    }
  };

  // Deposit handler
  const handleDepositSubmit = async (e) => {
    e.preventDefault();
    if (!depositTargetGoal) return;
    if (depositData.amount <= 0) {
      toast.error('Enter a valid deposit amount');
      return;
    }

    try {
      const oldPct = depositTargetGoal.target_amount > 0
        ? (depositTargetGoal.current_amount / depositTargetGoal.target_amount) * 100
        : 0;
      const newPct = depositTargetGoal.target_amount > 0
        ? ((depositTargetGoal.current_amount + depositData.amount) / depositTargetGoal.target_amount) * 100
        : 0;

      await contributeGoal(depositTargetGoal.id, depositData);
      toast.success(`+${formatCurrency(depositData.amount)} added to "${depositTargetGoal.name}"!`);
      setIsDepositModalOpen(false);
      haptic();
      loadData();

      // Milestone trigger check
      const milestones = [25, 50, 75, 100];
      const crossed = milestones.find(m => oldPct < m && newPct >= m);
      if (crossed) {
        const emoji = crossed === 100 ? '🏆' : '🎉';
        toast.success(`${emoji} ${crossed}% Milestone Reached for "${depositTargetGoal.name}"!`, { duration: 6000 });
        runConfetti(canvasRef.current);
      }
    } catch (err) {
      toast.error(err?.message || 'Failed to add deposit');
    }
  };

  // Deduct handler
  const handleDeductSubmit = async (e) => {
    e.preventDefault();
    if (!deductTargetGoal) return;
    if (deductData.amount <= 0) {
      toast.error('Enter a valid amount to deduct');
      return;
    }
    if (deductData.amount > deductTargetGoal.current_amount) {
      toast.error(`Cannot deduct more than current balance (${formatCurrency(deductTargetGoal.current_amount)})`);
      return;
    }

    try {
      await deductGoal(deductTargetGoal.id, deductData);
      toast.success(`−${formatCurrency(deductData.amount)} deducted from "${deductTargetGoal.name}"!`);
      setIsDeductModalOpen(false);
      haptic();
      loadData();
    } catch (err) {
      toast.error(err?.message || 'Failed to deduct funds');
    }
  };

  // Quick preset chip -> opens Deposit Modal with amount pre-filled so user can choose which account to deduct from
  const handleQuickDeposit = (goal, amount) => {
    const numAmount = parseFloat((Number(amount) || 0).toFixed(2));
    if (numAmount <= 0) return;
    openDepositModal(goal, numAmount);
  };

  // Quick preset chip -> opens Deduct Modal with amount pre-filled so user can choose destination account
  const handleQuickDeduct = (goal, amount) => {
    const numAmount = parseFloat((Number(amount) || 0).toFixed(2));
    if (numAmount <= 0) return;
    if (numAmount > goal.current_amount) {
      toast.error(`Cannot deduct more than current balance (${formatCurrency(goal.current_amount)})`);
      return;
    }
    openDeductModal(goal, numAmount);
  };

  const doDelete = () => {
    const id = confirm.id;
    const item = goals.find(x => String(x.id) === String(id));
    setConfirm({ open: false, id: null });
    removeItemWithUndo({
      key: `goal:${id}`,
      label: itemLabel(item, 'Goal deleted'),
      setItems: setGoals,
      id,
      commit: () => deleteGoal(id),
      onCommitted: () => loadData(),
    });
  };

  // Top Summary KPIs (Current Right Now + Target + Total Daily Calculation)
  const { totalSaved, totalTarget, totalRemaining, overallProgress, totalDailyNeeded, completedCount, activeCount, highPriorityCount } = useMemo(() => {
    let saved = 0;
    let target = 0;
    let comp = 0;
    let active = 0;
    let totalDaily = 0;
    let highPri = 0;

    goals.forEach(g => {
      const c = Number(g.current_amount) || 0;
      const t = Number(g.target_amount) || 0;
      saved += c;
      target += t;
      if (t > 0 && c >= t) {
        comp++;
      } else {
        active++;
        const stats = calculateGoalStats(g);
        if (stats.daysLeft > 0) {
          totalDaily += stats.dailyNeeded;
        }
      }
      if (g.priority === 'high') highPri++;
    });

    const prog = target > 0 ? Math.min(100, (saved / target) * 100) : 0;
    const rem = Math.max(0, target - saved);

    return {
      totalSaved: parseFloat(saved.toFixed(2)),
      totalTarget: parseFloat(target.toFixed(2)),
      totalRemaining: parseFloat(rem.toFixed(2)),
      overallProgress: Math.round(prog),
      totalDailyNeeded: parseFloat(totalDaily.toFixed(2)),
      completedCount: comp,
      activeCount: active,
      highPriorityCount: highPri
    };
  }, [goals]);

  // Filtered & Sorted Goals
  const filteredGoals = useMemo(() => {
    return goals
      .filter(goal => {
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchesName = (goal.name || '').toLowerCase().includes(q);
          const matchesCat = (goal.category || '').toLowerCase().includes(q);
          const matchesNotes = (goal.notes || '').toLowerCase().includes(q);
          if (!matchesName && !matchesCat && !matchesNotes) return false;
        }

        const stats = calculateGoalStats(goal);
        if (activeTab === 'active') return !stats.isReached;
        if (activeTab === 'completed') return stats.isReached;
        if (activeTab === 'high') return goal.priority === 'high';
        return true;
      })
      .sort((a, b) => {
        const statsA = calculateGoalStats(a);
        const statsB = calculateGoalStats(b);

        if (sortBy === 'deadline') {
          if (!a.target_date) return 1;
          if (!b.target_date) return -1;
          return new Date(a.target_date) - new Date(b.target_date);
        }
        if (sortBy === 'daily_desc') return statsB.dailyNeeded - statsA.dailyNeeded;
        if (sortBy === 'current_desc') return statsB.current - statsA.current;
        if (sortBy === 'progress_desc') return statsB.progressPct - statsA.progressPct;
        if (sortBy === 'target_desc') return statsB.target - statsA.target;
        if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '');
        return 0;
      });
  }, [goals, searchQuery, activeTab, sortBy]);

  const accountOptions = [
    { value: '', label: 'Do not link to an account' },
    ...accounts.map(acc => ({
      value: acc.id,
      label: `${acc.name} (${formatCurrency(acc.balance)})`
    }))
  ];

  const uniqueGoalNames = [...new Set(goals.map(g => g.name).filter(Boolean))];

  return (
    <PageWrapper>
      {/* Confetti canvas */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 99999
        }}
      />

      <div style={{ maxWidth: 1240, margin: '0 auto', width: '100%' }}>
        <PageHeader title={t('nav.goals')} subtitle={t('sub.goals')}>
          <Button
            icon={Sparkles}
            onClick={() => {
              setIsRoundUpModalOpen(true);
              if (goals.length > 0 && !roundUpGoalId) setRoundUpGoalId(goals[0].id);
            }}
          >
            {t('btn.roundUp')}
          </Button>
          <Button variant="primary" icon={Plus} onClick={openAddModal}>{t('btn.newGoal')}</Button>
        </PageHeader>

        {/* Top Summary KPIs Strip: What You Have Right Now + End Goal + Daily Needed */}
        {!loading && goals.length > 0 && <InsightGoals goals={goals} />}
        {!loading && goals.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '0.75rem',
              marginBottom: '1.5rem'
            }}
          >
            {/* Card 1: Have Right Now */}
            <div
              style={{
                background: 'rgba(37, 37, 64, 0.65)',
                border: '1px solid rgba(74, 222, 128, 0.25)',
                borderRadius: 14,
                padding: '1rem 1.1rem',
                backdropFilter: 'blur(12px)',
                boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
              }}
            >
              <div style={{ fontSize: '0.7rem', color: 'var(--mm-success)', fontWeight: 700, letterSpacing: '0.5px' }}>
                💵 HAVE RIGHT NOW (SAVED)
              </div>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--mm-success)', marginTop: '0.2rem' }}>
                {formatCurrency(totalSaved)}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                {overallProgress}% of {formatCurrency(totalTarget)} target reached
              </div>
            </div>

            {/* Card 2: Daily Savings Needed */}
            <div
              style={{
                background: 'rgba(37, 37, 64, 0.65)',
                border: '1px solid rgba(6, 182, 212, 0.25)',
                borderRadius: 14,
                padding: '1rem 1.1rem',
                backdropFilter: 'blur(12px)',
                boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
              }}
            >
              <div style={{ fontSize: '0.7rem', color: '#06b6d4', fontWeight: 700, letterSpacing: '0.5px' }}>
                ⚡ DAILY SAVINGS NEEDED
              </div>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#06b6d4', marginTop: '0.2rem' }}>
                {formatCurrency(totalDailyNeeded)} <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-muted)' }}>/ day</span>
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                Across all active goals to reach deadlines on time
              </div>
            </div>

            {/* Card 3: Target & Remaining */}
            <div
              style={{
                background: 'rgba(37, 37, 64, 0.55)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: 14,
                padding: '1rem 1.1rem',
                backdropFilter: 'blur(12px)'
              }}
            >
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.5px' }}>
                🎯 TOTAL TARGET CAPITAL
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.2rem' }}>
                {formatCurrency(totalTarget)}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--mm-warning)', marginTop: '0.25rem' }}>
                {formatCurrency(totalRemaining)} remaining to complete all goals
              </div>
            </div>
          </motion.div>
        )}

        <MoreSection title="Spare-change round-ups" hint="Optional">
        {/* 1-Tap Spare-Change Round-Up Banner */}
        {!loading && goals.length > 0 && simulatedRoundUpTotal > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              background: 'linear-gradient(135deg, rgba(74, 222, 128, 0.12) 0%, rgba(6, 182, 212, 0.08) 50%, rgba(30, 30, 50, 0.85) 100%)',
              border: '1px solid rgba(74, 222, 128, 0.3)',
              borderRadius: 14,
              padding: '0.85rem 1.15rem',
              marginBottom: '1.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.75rem',
              backdropFilter: 'blur(12px)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: '1 1 280px' }}>
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 11,
                  background: 'rgba(74, 222, 128, 0.16)',
                  border: '1px solid rgba(74, 222, 128, 0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.15rem',
                  flexShrink: 0
                }}
              >
                🪙
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', color: 'var(--mm-success)', fontWeight: 800, letterSpacing: '0.5px' }}>
                  SPARE-CHANGE ROUND-UP READY
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-primary)', marginTop: 2 }}>
                  Rounding your last <strong>{recentExpenses.length}</strong> expenses to the nearest <strong>{roundUpIncrement}</strong> saves{' '}
                  <strong style={{ color: 'var(--mm-success)' }}>+{formatCurrency(simulatedRoundUpTotal)}</strong>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              {[100, 500, 1000].map(inc => (
                <button
                  key={inc}
                  type="button"
                  onClick={() => setRoundUpIncrement(inc)}
                  style={{
                    padding: '0.32rem 0.6rem',
                    borderRadius: 8,
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    border: roundUpIncrement === inc ? '1px solid #4ade80' : '1px solid rgba(255,255,255,0.08)',
                    background: roundUpIncrement === inc ? 'rgba(74, 222, 128, 0.18)' : 'rgba(255,255,255,0.03)',
                    color: roundUpIncrement === inc ? 'var(--mm-success)' : 'var(--text-secondary)'
                  }}
                >
                  +{inc}
                </button>
              ))}
              <button
                type="button"
                onClick={handleApplyRoundUp}
                style={{
                  padding: '0.42rem 0.85rem',
                  borderRadius: 9,
                  fontSize: '0.76rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: '1px solid rgba(74, 222, 128, 0.45)',
                  background: 'linear-gradient(135deg, rgba(74, 222, 128, 0.25), rgba(6, 182, 212, 0.22))',
                  color: 'var(--mm-success)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem'
                }}
              >
                <Sparkles size={13} /> 1-Tap Deposit +{formatCurrency(simulatedRoundUpTotal)}
              </button>
            </div>
          </motion.div>
        )}

        </MoreSection>
        {/* Filter, Search & Sort Bar */}
        <div
          style={{
            background: 'rgba(37, 37, 64, 0.45)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: 14,
            padding: '0.75rem 1rem',
            marginBottom: '1.25rem',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.75rem',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          {/* Tabs */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' }}>
            {[
              { id: 'all', label: `All (${goals.length})` },
              { id: 'active', label: `In Progress (${activeCount})` },
              { id: 'completed', label: `Secured (${completedCount})` },
              { id: 'high', label: `High Priority (${highPriorityCount})` }
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '0.35rem 0.75rem',
                  borderRadius: 20,
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: activeTab === tab.id ? '1px solid rgba(74, 222, 128, 0.5)' : '1px solid rgba(255, 255, 255, 0.06)',
                  background: activeTab === tab.id ? 'rgba(74, 222, 128, 0.15)' : 'rgba(255, 255, 255, 0.02)',
                  color: activeTab === tab.id ? 'var(--mm-success)' : 'var(--text-secondary)',
                  transition: 'all 0.18s'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search & Sort */}
          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flex: '1 1 260px', justifyContent: 'flex-end' }}>
            <div style={{ position: 'relative', flex: '1 1 140px', maxWidth: 220 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Search goals..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.38rem 0.6rem 0.38rem 2rem',
                  fontSize: '0.8rem',
                  borderRadius: 10,
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  background: 'rgba(0,0,0,0.25)',
                  color: 'var(--text-primary)'
                }}
              />
            </div>

            <select
              aria-label="Sort goals"
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              style={{
                padding: '0.38rem 0.65rem',
                fontSize: '0.75rem',
                borderRadius: 10,
                border: '1px solid rgba(255, 255, 255, 0.08)',
                background: 'rgba(26, 26, 46, 0.85)',
                color: 'var(--text-primary)',
                cursor: 'pointer' }}
            >
              {SORT_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Goals Grid */}
        {loading ? (
          <SkeletonLoader rows={3} height={220} />
        ) : filteredGoals.length === 0 ? (
          <div className="bento-item" style={{ marginTop: '1rem' }}>
            <EmptyState
              icon={Wallet}
              title={searchQuery ? t('empty.goals.none') : t('empty.goals.title')}
              action={searchQuery ? null : <Button variant="primary" icon={Plus} onClick={openAddModal}>{t('empty.goals.action')}</Button>}
            >
              {searchQuery ? t('empty.goals.search') : t('empty.goals.body')}
            </EmptyState>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 360px), 1fr))',
              gap: '1rem'
            }}
          >
            {filteredGoals.map((goal, idx) => <GoalCard key={goal.id} goal={goal} idx={idx} PRIORITY_CONFIG={PRIORITY_CONFIG} boostByGoal={boostByGoal} calculateGoalStats={calculateGoalStats} expandedBoostGoalId={expandedBoostGoalId} handleQuickDeduct={handleQuickDeduct} handleQuickDeposit={handleQuickDeposit} loadData={loadData} openDeductModal={openDeductModal} openDepositModal={openDepositModal} openEditModal={openEditModal} setBoostByGoal={setBoostByGoal} setConfirm={setConfirm} setExpandedBoostGoalId={setExpandedBoostGoalId} setSelectedGoalForHistoryId={setSelectedGoalForHistoryId} transactionsList={transactionsList} />)}
          </div>
        )}
      </div>

      {/* Target Creation / Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editMode ? 'Edit Goal Target' : 'Create New Goal Target'}
      >
        <datalist id="goal-names">
          {uniqueGoalNames.map(n => <option key={n} value={n} />)}
        </datalist>

        <form onSubmit={handleCreateSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Goal Name */}
          <div>
            <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              Target Name
            </label>
            <input
              list="goal-names"
              required
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. Emergency Fund, Japan Trip, MacBook Pro"
              style={{ width: '100%', fontSize: '1rem' }}
            />
          </div>

          {/* Category Chips */}
          <div>
            <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              Category
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', maxHeight: 110, overflowY: 'auto', padding: '0.2rem 0' }}>
              {GOAL_CATEGORIES.map(cat => {
                const isSelected = formData.category === cat.name;
                return (
                  <button
                    key={cat.name}
                    type="button"
                    onClick={() => setFormData({ ...formData, category: cat.name, icon: cat.icon, color: cat.color })}
                    style={{
                      padding: '0.3rem 0.6rem',
                      borderRadius: 14,
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      border: isSelected ? `1px solid ${cat.color}` : '1px solid rgba(255,255,255,0.08)',
                      background: isSelected ? `${cat.color}25` : 'rgba(255,255,255,0.03)',
                      color: isSelected ? cat.color : 'var(--text-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.3rem'
                    }}
                  >
                    <span>{cat.icon}</span>
                    <span>{cat.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Priority & End Goal Date */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                Priority Level
              </label>
              <select
                aria-label="Priority level"
                value={formData.priority}
                onChange={e => setFormData({ ...formData, priority: e.target.value })}
                style={{ width: '100%', fontSize: '0.9rem', padding: '0.65rem' }}
              >
                <option value="high">🔴 High Priority</option>
                <option value="medium">🟡 Medium Priority</option>
                <option value="low">🔵 Low Priority</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                End Goal Date (Deadline)
              </label>
              <input
                type="date"
                required
                value={formData.target_date}
                onChange={e => setFormData({ ...formData, target_date: e.target.value })}
                style={{ width: '100%', fontSize: '0.9rem', padding: '0.65rem' }}
              />
            </div>
          </div>

          {/* Target Capital & Initial/Current Balance */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                {`Target Capital (${getCurrencyLabel()})`}
              </label>
              <CurrencyInput
                required
                value={formData.target_amount}
                onChange={val => setFormData({ ...formData, target_amount: val })}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                {`Have Right Now (${getCurrencyLabel()})`}
              </label>
              <CurrencyInput
                value={formData.current_amount}
                onChange={val => setFormData({ ...formData, current_amount: val })}
              />
            </div>
          </div>

          {/* Planned Monthly Saving Quota (Reserved in Daily Safe-to-Spend) */}
          <div style={{ padding: '0.75rem', borderRadius: 12, background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.22)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem', flexWrap: 'wrap', gap: '0.35rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#c4b5fd' }}>
                {`🎯 Monthly Saving Quota (${getCurrencyLabel()}) — Reserved in Daily Safe-to-Spend`}
              </label>
              {(() => {
                const rem = Math.max(0, (parseFloat(formData.target_amount) || 0) - (parseFloat(formData.current_amount) || 0));
                if (rem <= 0) return null;
                const d = parseLocalYMD(formData.target_date);
                const now = new Date();
                const mos = d ? Math.max(1, Math.ceil((d - now) / (1000 * 60 * 60 * 24 * 30))) : 10;
                const autoMo = Math.round(rem / mos);
                return (
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, monthly_contribution: autoMo })}
                    style={{ padding: '0.18rem 0.55rem', borderRadius: 10, border: '1px solid rgba(167,139,250,0.4)', background: 'rgba(167,139,250,0.15)', color: '#c4b5fd', fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer' }}
                  >
                    Use Auto ({formatCurrency(autoMo)}/mo)
                  </button>
                );
              })()}
            </div>
            <CurrencyInput
              value={formData.monthly_contribution || 0}
              onChange={val => setFormData({ ...formData, monthly_contribution: val })}
              placeholder="0 = Auto-calculate from deadline"
            />
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
              Leave 0 to auto-calculate monthly & daily saving needs from your deadline, or enter a fixed monthly saving target.
            </div>
          </div>

          {/* Strategy Notes */}
          <div>
            <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              Notes (Optional)
            </label>
            <input
              type="text"
              value={formData.notes}
              onChange={e => setFormData({ ...formData, notes: e.target.value })}
              placeholder="e.g. Save every Friday, Black Friday target"
              style={{ width: '100%', fontSize: '0.9rem' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              {editMode ? 'Update Goal' : 'Create Goal'}
            </button>
          </div>
        </form>
      </Modal>

      {/* DEPOSIT MODAL */}
      <DepositModal accountOptions={accountOptions} accounts={accounts} depositData={depositData} depositTargetGoal={depositTargetGoal} handleDepositSubmit={handleDepositSubmit} isDepositModalOpen={isDepositModalOpen} setDepositData={setDepositData} setIsDepositModalOpen={setIsDepositModalOpen} />

      {/* DEDUCT / SPEND MODAL */}
      <DeductModal accountOptions={accountOptions} deductData={deductData} deductTargetGoal={deductTargetGoal} handleDeductSubmit={handleDeductSubmit} isDeductModalOpen={isDeductModalOpen} setDeductData={setDeductData} setIsDeductModalOpen={setIsDeductModalOpen} />

      {/* VIRTUAL ROUND-UP SIMULATOR MODAL */}
      <RoundUpModal accounts={roundUpAccounts} roundUpAccountId={roundUpAccountId || (roundUpAccounts[0]?.id ?? '')} setRoundUpAccountId={setRoundUpAccountId} goals={goals} handleApplyRoundUp={handleApplyRoundUp} isRoundUpModalOpen={isRoundUpModalOpen} recentExpenses={recentExpenses} roundUpGoalId={roundUpGoalId} roundUpIncrement={roundUpIncrement} setIsRoundUpModalOpen={setIsRoundUpModalOpen} setRoundUpGoalId={setRoundUpGoalId} setRoundUpIncrement={setRoundUpIncrement} simulatedRoundUpTotal={simulatedRoundUpTotal} />

      {/* ── Goal Activity & Contribution History Modal ── */}
      <GoalHistoryModal
        isOpen={!!activeGoalForHistory}
        onClose={() => setSelectedGoalForHistoryId(null)}
        goal={activeGoalForHistory}
        accounts={accounts}
        transactions={transactionsList}
        onDeposit={(g, amt) => openDepositModal(g, amt)}
        onDeduct={(g, amt) => openDeductModal(g, amt)}
        onEdit={(g) => openEditModal(g)}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={confirm.open}
        title="Delete Target"
        message="Are you sure you want to delete this target? Note that previously recorded contributions and account transactions will remain in your history."
        confirmLabel="Delete"
        danger
        onConfirm={doDelete}
        onCancel={() => setConfirm({ open: false, id: null })}
      />
    </PageWrapper>
  );
};

export default Goals;